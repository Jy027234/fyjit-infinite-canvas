import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { creativeAssetDetailQueryKey, creativeAssetDetailQueryOptions, creativeAssetDetailsFromQueryCache, removeCreativeAssetDetailCache, uniqueCreativeAssetIds, updateCreativeAssetDetailCache } from "./creative-asset-details";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("creative asset detail cache", () => {
    test("uses one stable query key and reuses the cached full asset", async () => {
        let requests = 0;
        let requestSignal: AbortSignal | null | undefined;
        globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
            requests += 1;
            requestSignal = init?.signal;
            return Response.json({
                data: {
                    id: 1,
                    asset_id: "asset-1",
                    user_id: 7,
                    type: "IMAGE",
                    favorite: false,
                    status: "READY",
                    created_at: 1,
                    updated_at: 1,
                },
            });
        }) as unknown as typeof fetch;

        const queryClient = new QueryClient();
        const options = creativeAssetDetailQueryOptions("asset-1");
        expect(options.queryKey).toEqual(["creative-asset-detail", "asset-1"]);
        expect(options.retry).toBe(2);

        await queryClient.fetchQuery(options);
        await queryClient.fetchQuery(options);

        expect(requests).toBe(1);
        expect(requestSignal).toBeInstanceOf(AbortSignal);
        expect(creativeAssetDetailsFromQueryCache(queryClient, ["asset-1"])).toHaveProperty("size", 1);
        queryClient.clear();
    });

    test("deduplicates ids without changing their first-seen order", () => {
        expect(uniqueCreativeAssetIds(["asset-2", "", "asset-1", "asset-2", " asset-1 "])).toEqual(["asset-2", "asset-1"]);
        expect(creativeAssetDetailQueryKey("asset-2")).toEqual(["creative-asset-detail", "asset-2"]);
    });

    test("keeps detail cache consistent when an asset is edited or removed", () => {
        const queryClient = new QueryClient();
        const asset = { id: 1, asset_id: "asset-edit", user_id: 7, type: "IMAGE", favorite: true, status: "READY", title: "updated", created_at: 1, updated_at: 2 } as const;

        updateCreativeAssetDetailCache(queryClient, asset);
        expect(queryClient.getQueryData<typeof asset>(creativeAssetDetailQueryKey(asset.asset_id))).toEqual(asset);

        removeCreativeAssetDetailCache(queryClient, asset.asset_id);
        expect(queryClient.getQueryData(creativeAssetDetailQueryKey(asset.asset_id))).toBeUndefined();
        queryClient.clear();
    });

    test("passes TanStack Query cancellation through to the asset request", async () => {
        let requestSignal: AbortSignal | null | undefined;
        globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) => {
            requestSignal = init?.signal;
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(init.signal?.reason || new DOMException("Aborted", "AbortError")), { once: true });
            });
        }) as unknown as typeof fetch;

        const queryClient = new QueryClient();
        const options = creativeAssetDetailQueryOptions("asset-cancel");
        const request = queryClient.fetchQuery(options).catch(() => undefined);
        await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
        await request;

        expect(requestSignal?.aborted).toBe(true);
        queryClient.clear();
    });
});
