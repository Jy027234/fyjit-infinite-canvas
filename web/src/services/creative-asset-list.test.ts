import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { CreativeAsset, CreativeAssetPage } from "@/services/api/creative";
import {
    CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE,
    CREATIVE_ASSET_LIST_STALE_TIME,
    creativeAssetListQueryKey,
    creativeAssetListQueryOptions,
    fetchCreativeAssetList,
    invalidateCreativeAssetList,
    normalizeCreativeAssetListFilters,
    updateCreativeAssetListCache,
    upsertCreativeAssetListCache,
} from "./creative-asset-list";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function asset(assetId: string, favorite = false): CreativeAsset {
    return {
        id: Number(assetId.replace(/\D/g, "")) || 1,
        asset_id: assetId,
        user_id: 1,
        type: "TEXT",
        title: assetId,
        favorite,
        status: "ACTIVE",
        created_at: 1,
        updated_at: 1,
    };
}

function page(items: CreativeAsset[], pageNumber = 1, pageSize = 24): CreativeAssetPage {
    return { items, total: items.length, page: pageNumber, page_size: pageSize };
}

describe("creative asset list query", () => {
    test("normalizes every filter and pagination field into a stable key", () => {
        const options = {
            page: 2,
            pageSize: 200,
            type: " IMAGE ",
            sourceModule: " image-workbench ",
            projectId: " project-1 ",
            folderId: " folder-a ",
            search: " portrait ",
            favorite: true,
            model: " model-a ",
            tag: " approved ",
            createdFrom: 100,
            createdTo: 200,
            trash: true,
        };

        expect(normalizeCreativeAssetListFilters(options)).toEqual({
            page: 2,
            pageSize: 100,
            type: "IMAGE",
            sourceModule: "image-workbench",
            projectId: "project-1",
            folderId: "folder-a",
            search: "portrait",
            favorite: true,
            model: "model-a",
            tag: "approved",
            createdFrom: 100,
            createdTo: 200,
            trash: true,
        });
        expect(creativeAssetListQueryKey(options)).toEqual(["creative-assets", "list", 2, 100, "IMAGE", "image-workbench", "project-1", "folder-a", "portrait", true, "model-a", "approved", 100, 200, true]);
        expect(creativeAssetListQueryKey({ ...options, search: "portrait" })).toEqual(creativeAssetListQueryKey(options));
        expect(creativeAssetListQueryKey({ ...options, page: 3 })).not.toEqual(creativeAssetListQueryKey(options));
    });

    test("passes the React Query AbortSignal and normalized filters to the API", async () => {
        const signal = new AbortController().signal;
        let request = "";
        let requestSignal: AbortSignal | null | undefined;
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            request = String(input);
            requestSignal = init?.signal;
            return Response.json({ data: page([]) });
        }) as unknown as typeof fetch;

        await fetchCreativeAssetList(
            {
                page: 2,
                pageSize: 48,
                type: "IMAGE",
                sourceModule: "image-workbench",
                projectId: "project-1",
                folderId: "folder-a",
                search: "portrait",
                favorite: true,
                model: "model-a",
                tag: "approved",
                createdFrom: 100,
                createdTo: 200,
                trash: true,
            },
            signal,
        );

        const query = new URLSearchParams(request.split("?")[1]);
        expect(request.startsWith("/api/creative/assets?")).toBe(true);
        expect(query.get("page")).toBe("2");
        expect(query.get("page_size")).toBe("48");
        expect(query.get("type")).toBe("IMAGE");
        expect(query.get("source_module")).toBe("image-workbench");
        expect(query.get("project_id")).toBe("project-1");
        expect(query.get("folder_id")).toBe("folder-a");
        expect(query.get("search")).toBe("portrait");
        expect(query.get("favorite")).toBe("true");
        expect(query.get("model")).toBe("model-a");
        expect(query.get("tag")).toBe("approved");
        expect(query.get("created_from")).toBe("100");
        expect(query.get("created_to")).toBe("200");
        expect(query.get("trash")).toBe("true");
        expect(requestSignal).toBe(signal);
    });

    test("exposes a cached query option with a bounded stale window", () => {
        const options = creativeAssetListQueryOptions({ pageSize: CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE, enabled: false });

        expect(options.queryKey).toEqual(["creative-assets", "list", 1, CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE, "", "", "", "", "", false, "", "", null, null, false]);
        expect(options.staleTime).toBe(CREATIVE_ASSET_LIST_STALE_TIME);
        expect(options.enabled).toBe(false);
    });

    test("updates every cached list page and invalidates only the asset-list scope", async () => {
        const queryClient = new QueryClient();
        const firstKey = creativeAssetListQueryKey({ page: 1, pageSize: 24 });
        const secondKey = creativeAssetListQueryKey({ page: 2, pageSize: 24, favorite: true });
        queryClient.setQueryData(firstKey, page([asset("asset-1")]));
        queryClient.setQueryData(secondKey, page([asset("asset-1")]));

        updateCreativeAssetListCache(queryClient, "asset-1", (current) => ({ ...current, favorite: true }));
        expect(queryClient.getQueryData<CreativeAssetPage>(firstKey)?.items[0]).toMatchObject({ asset_id: "asset-1", favorite: true });
        expect(queryClient.getQueryData<CreativeAssetPage>(secondKey)?.items[0]).toMatchObject({ asset_id: "asset-1", favorite: true });

        await invalidateCreativeAssetList(queryClient);
        expect(queryClient.getQueryState(firstKey)?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(secondKey)?.isInvalidated).toBe(true);
        queryClient.clear();
    });

    test("upserts a new generated asset only into matching first-page caches", () => {
        const queryClient = new QueryClient();
        const generated = {
            ...asset("generated-image"),
            type: "IMAGE" as const,
            status: "READY",
            title: "sunset portrait",
            source_module: "image-workbench",
            project_id: "project-1",
            tags: ["portrait"],
            created_at: 10,
            updated_at: 10,
        };
        const allKey = creativeAssetListQueryKey({ page: 1, pageSize: 24 });
        const typeKey = creativeAssetListQueryKey({ page: 1, pageSize: 24, type: "IMAGE" });
        const projectKey = creativeAssetListQueryKey({ page: 1, pageSize: 24, projectId: "project-1" });
        const searchKey = creativeAssetListQueryKey({ page: 1, pageSize: 24, search: "sunset" });
        const mismatchKey = creativeAssetListQueryKey({ page: 1, pageSize: 24, type: "VIDEO" });
        const laterPageKey = creativeAssetListQueryKey({ page: 2, pageSize: 24 });
        for (const key of [allKey, typeKey, projectKey, searchKey, mismatchKey, laterPageKey]) queryClient.setQueryData(key, page([], key[2] as number));

        const result = upsertCreativeAssetListCache(queryClient, generated);

        expect(result.inserted).toBe(4);
        for (const key of [allKey, typeKey, projectKey, searchKey]) {
            expect(queryClient.getQueryData<CreativeAssetPage>(key)?.items[0]).toMatchObject({ asset_id: "generated-image" });
            expect(queryClient.getQueryData<CreativeAssetPage>(key)?.total).toBe(1);
        }
        expect(queryClient.getQueryData<CreativeAssetPage>(mismatchKey)?.items).toEqual([]);
        expect(queryClient.getQueryData<CreativeAssetPage>(laterPageKey)?.items).toEqual([]);
        queryClient.clear();
    });

    test("removes an updated asset from caches whose filters no longer match", () => {
        const queryClient = new QueryClient();
        const favoriteKey = creativeAssetListQueryKey({ page: 1, favorite: true });
        const cached = asset("asset-1", true);
        queryClient.setQueryData(favoriteKey, page([cached]));

        const result = upsertCreativeAssetListCache(queryClient, { ...cached, favorite: false });

        expect(result).toEqual({ updated: 0, inserted: 0, removed: 1 });
        expect(queryClient.getQueryData<CreativeAssetPage>(favoriteKey)).toMatchObject({ items: [], total: 0 });
        queryClient.clear();
    });
});
