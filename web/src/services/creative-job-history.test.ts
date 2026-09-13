import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { CreativeAsset, CreativeAssetSummary, CreativeJob, CreativeJobPage } from "@/services/api/creative";
import {
    CREATIVE_JOB_HISTORY_DEFAULT_PAGE_SIZE,
    creativeAssetSummaryFromDetail,
    creativeJobHistoryQueryKey,
    fetchCreativeJobHistoryPage,
    flattenCreativeJobHistory,
    getNextCreativeJobHistoryPage,
    invalidateCreativeJobHistory,
    updateCreativeJobHistory,
    updateCreativeJobHistoryCache,
} from "./creative-job-history";

const originalFetch = globalThis.fetch;

function job(jobId: string, status: CreativeJob["status"] = "RUNNING"): CreativeJob {
    return {
        id: Number(jobId.replace(/\D/g, "")) || 1,
        job_id: jobId,
        user_id: 1,
        capability: "image_generation",
        model: "image-v1",
        group: "default",
        prompt: jobId,
        parameters: {},
        reference_asset_ids: [],
        status,
        progress: 0,
        attempt_count: 1,
        result_asset_ids: [],
        capability_version: "v1",
        created_at: 1,
        updated_at: 1,
    };
}

function asset(assetId: string): CreativeAssetSummary {
    return { asset_id: assetId, type: "IMAGE", status: "READY", review_status: "approved" };
}

function detail(assetId: string): CreativeAsset {
    return {
        id: Number(assetId.replace(/\D/g, "")) || 1,
        asset_id: assetId,
        user_id: 1,
        type: "IMAGE",
        favorite: false,
        status: "READY",
        preview_path: `/preview/${assetId}`,
        thumbnail_path: `/thumb/${assetId}`,
        mime_type: "image/png",
        width: 1024,
        height: 1024,
        created_at: 2,
        updated_at: 2,
    };
}

function page(items: CreativeJob[], assets: CreativeAssetSummary[], pageNumber: number, total = 3): CreativeJobPage {
    return { items, assets, total, page: pageNumber, page_size: 2 };
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("creative job history service", () => {
    test("uses a stable capability and page-size query key", () => {
        expect(creativeJobHistoryQueryKey({ capability: "image_generation", pageSize: CREATIVE_JOB_HISTORY_DEFAULT_PAGE_SIZE })).toEqual(["creative-job-history", "image_generation", 20]);
        expect(creativeJobHistoryQueryKey({ capability: "image_generation", pageSize: 20 })).toEqual(creativeJobHistoryQueryKey({ capability: "image_generation", pageSize: 20 }));
    });

    test("passes summary assets and AbortSignal to the paginated API", async () => {
        const signal = new AbortController().signal;
        let request = "";
        let requestSignal: AbortSignal | null | undefined;
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            request = String(input);
            requestSignal = init?.signal;
            return Response.json({ data: page([], [], 2, 2) });
        }) as unknown as typeof fetch;

        await fetchCreativeJobHistoryPage({ capability: "video_generation", page: 2, pageSize: 16, signal });

        expect(request).toBe("/api/creative/jobs?page=2&page_size=16&capability=video_generation&include_assets=summary");
        expect(requestSignal).toBeInstanceOf(AbortSignal);
        expect(requestSignal).not.toBe(signal);
    });

    test("reuses an in-flight page request when StrictMode replaces the subscriber in the same task", async () => {
        let requestCount = 0;
        let resolveResponse!: (response: Response) => void;
        let underlyingSignal: AbortSignal | null | undefined;
        globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
            requestCount += 1;
            underlyingSignal = init?.signal;
            return new Promise<Response>((resolve, reject) => {
                resolveResponse = resolve;
                init?.signal?.addEventListener("abort", () => reject(init.signal?.reason || new DOMException("Aborted", "AbortError")), { once: true });
            });
        }) as unknown as typeof fetch;

        const firstController = new AbortController();
        const firstRequest = fetchCreativeJobHistoryPage({ capability: "image_generation", page: 1, pageSize: 20, signal: firstController.signal });
        firstController.abort();
        const secondRequest = fetchCreativeJobHistoryPage({ capability: "image_generation", page: 1, pageSize: 20, signal: new AbortController().signal });

        expect(requestCount).toBe(1);
        expect(underlyingSignal?.aborted).toBe(false);
        await expect(firstRequest).rejects.toMatchObject({ name: "AbortError" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(underlyingSignal?.aborted).toBe(false);

        resolveResponse(Response.json({ data: page([], [], 1, 0) }));
        await expect(secondRequest).resolves.toMatchObject({ items: [], total: 0 });
        expect(underlyingSignal?.aborted).toBe(false);
    });

    test("aborts the shared request shortly after its last subscriber leaves", async () => {
        let underlyingSignal: AbortSignal | null | undefined;
        let resolveAbort!: () => void;
        globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
            underlyingSignal = init?.signal;
            return new Promise<Response>((_resolve, reject) => {
                resolveAbort = () => reject(init?.signal?.reason || new DOMException("Aborted", "AbortError"));
                init?.signal?.addEventListener("abort", resolveAbort, { once: true });
            });
        }) as unknown as typeof fetch;

        const controller = new AbortController();
        const request = fetchCreativeJobHistoryPage({ capability: "video_generation", page: 1, pageSize: 20, signal: controller.signal });
        controller.abort();

        await expect(request).rejects.toMatchObject({ name: "AbortError" });
        expect(underlyingSignal?.aborted).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(underlyingSignal?.aborted).toBe(true);
    });

    test("advances by server page metadata and stops at the total", () => {
        expect(getNextCreativeJobHistoryPage(page([], [], 1, 41), [page([], [], 1, 41)], 20)).toBe(2);
        expect(getNextCreativeJobHistoryPage(page([], [], 3, 6), [page([], [], 1, 6), page([], [], 2, 6), page([], [], 3, 6)], 20)).toBeUndefined();
    });

    test("flattens pages while keeping the first copy of overlapping jobs and assets", () => {
        const result = flattenCreativeJobHistory([page([job("job-1"), job("job-2")], [asset("asset-1")], 1), page([job("job-2", "SUCCEEDED"), job("job-3")], [asset("asset-1"), asset("asset-2")], 2)]);

        expect(result.items.map((item) => `${item.job_id}:${item.status}`)).toEqual(["job-1:RUNNING", "job-2:RUNNING", "job-3:RUNNING"]);
        expect(result.assets.map((item) => item.asset_id)).toEqual(["asset-1", "asset-2"]);
    });

    test("updates one cached job locally and can invalidate a scoped history", async () => {
        const queryClient = new QueryClient();
        const params = { capability: "image_generation" as const, pageSize: 20 };
        const key = creativeJobHistoryQueryKey(params);
        queryClient.setQueryData(key, { pages: [page([job("job-1")], [], 1)], pageParams: [1] });

        updateCreativeJobHistory(queryClient, params, "job-1", (current) => ({ ...current, status: "SUCCEEDED", progress: 100 }));
        expect(queryClient.getQueryData<{ pages: CreativeJobPage[] }>(key)?.pages[0]?.items[0]).toMatchObject({ status: "SUCCEEDED", progress: 100 });

        await invalidateCreativeJobHistory(queryClient, params);
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        queryClient.clear();
    });

    test("patches a completed job and its matching asset summary without invalidating the query", () => {
        const queryClient = new QueryClient();
        const params = { capability: "image_generation" as const, pageSize: 20 };
        const key = creativeJobHistoryQueryKey(params);
        queryClient.setQueryData(key, { pages: [page([job("job-1")], [asset("asset-1")], 1)], pageParams: [1] });

        const completed = { ...job("job-1", "SUCCEEDED"), result_asset_ids: ["asset-1"] };
        const summary = creativeAssetSummaryFromDetail(detail("asset-1"));
        const result = updateCreativeJobHistoryCache(queryClient, params, { job: completed, assets: [summary] });
        const cached = queryClient.getQueryData<{ pages: CreativeJobPage[] }>(key)?.pages[0];

        expect(result).toEqual({ jobUpdated: true, jobInserted: false, assetsUpdated: 1 });
        expect(cached?.items[0]).toMatchObject({ job_id: "job-1", status: "SUCCEEDED" });
        expect(cached?.assets?.[0]).toMatchObject({ asset_id: "asset-1", preview_path: "/preview/asset-1", thumbnail_path: "/thumb/asset-1" });
        expect(queryClient.getQueryState(key)?.isInvalidated).not.toBe(true);
        queryClient.clear();
    });

    test("inserts a new job only into an untouched first page and preserves loaded later pages", () => {
        const queryClient = new QueryClient();
        const params = { capability: "image_generation" as const, pageSize: 20 };
        const key = creativeJobHistoryQueryKey(params);
        const first = page([job("job-1")], [], 1, 3);
        const next = page([job("job-2")], [], 2, 3);
        queryClient.setQueryData(key, { pages: [first], pageParams: [1] });

        const inserted = { ...job("job-new", "SUCCEEDED"), created_at: 3, updated_at: 3, result_asset_ids: ["asset-new"] };
        const insertedResult = updateCreativeJobHistoryCache(queryClient, params, { job: inserted, assets: [asset("asset-new")], insertIfMissing: true });
        const insertedPage = queryClient.getQueryData<{ pages: CreativeJobPage[] }>(key)?.pages[0];

        expect(insertedResult.jobInserted).toBe(true);
        expect(insertedPage?.items.map((item) => item.job_id)).toEqual(["job-new", "job-1"]);
        expect(insertedPage?.total).toBe(4);
        expect(insertedPage?.assets?.map((item) => item.asset_id)).toEqual(["asset-new"]);

        queryClient.setQueryData(key, { pages: [first, next], pageParams: [1, 2] });
        const before = queryClient.getQueryData<{ pages: CreativeJobPage[] }>(key);
        const notInserted = updateCreativeJobHistoryCache(queryClient, params, { job: { ...inserted, job_id: "job-later" }, insertIfMissing: true });
        expect(notInserted.jobInserted).toBe(false);
        expect(queryClient.getQueryData<{ pages: CreativeJobPage[] }>(key)).toBe(before);
        queryClient.clear();
    });

    test("deduplicates inserted asset summaries against the first-page cache", () => {
        const queryClient = new QueryClient();
        const params = { capability: "image_generation" as const, pageSize: 20 };
        const key = creativeJobHistoryQueryKey(params);
        const existingSummary = asset("asset-new");
        queryClient.setQueryData(key, { pages: [page([job("job-1")], [existingSummary], 1, 1)], pageParams: [1] });

        const inserted = { ...job("job-new", "SUCCEEDED"), created_at: 3, updated_at: 3, result_asset_ids: ["asset-new"] };
        const nextSummary = { ...existingSummary, preview_path: "/preview/asset-new" };
        updateCreativeJobHistoryCache(queryClient, params, { job: inserted, assets: [nextSummary], insertIfMissing: true });
        const summaries = queryClient.getQueryData<{ pages: CreativeJobPage[] }>(key)?.pages[0]?.assets || [];

        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({ asset_id: "asset-new", preview_path: "/preview/asset-new" });
        queryClient.clear();
    });
});
