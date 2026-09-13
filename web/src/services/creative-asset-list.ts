import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";

import { fetchCreativeAssets, fetchCreativeProjects, type CreativeAsset, type CreativeAssetPage } from "@/services/api/creative";

export const CREATIVE_ASSET_QUERY_ROOT = ["creative-assets"] as const;
export const CREATIVE_ASSET_LIST_QUERY_ROOT = [...CREATIVE_ASSET_QUERY_ROOT, "list"] as const;
export const CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE = 24;
export const CREATIVE_ASSET_LIST_STALE_TIME = 30_000;

export const CREATIVE_PROJECT_QUERY_ROOT = ["creative-projects"] as const;
export const CREATIVE_PROJECT_LIST_QUERY_ROOT = [...CREATIVE_PROJECT_QUERY_ROOT, "list"] as const;
export const CREATIVE_PROJECT_LIST_DEFAULT_PAGE_SIZE = 100;
export const CREATIVE_PROJECT_LIST_STALE_TIME = 60_000;

export type CreativeAssetListFilterInput = {
    page?: number;
    pageSize?: number;
    type?: string;
    sourceModule?: string;
    projectId?: string;
    folderId?: string;
    search?: string;
    favorite?: boolean;
    model?: string;
    tag?: string;
    createdFrom?: number;
    createdTo?: number;
    trash?: boolean;
};

export type CreativeAssetListFilters = {
    page: number;
    pageSize: number;
    type: string;
    sourceModule: string;
    projectId: string;
    folderId: string;
    search: string;
    favorite: boolean;
    model: string;
    tag: string;
    createdFrom?: number;
    createdTo?: number;
    trash: boolean;
};

export type CreativeAssetListQueryKey = readonly ["creative-assets", "list", number, number, string, string, string, string, string, boolean, string, string, number | null, number | null, boolean];

export type CreativeAssetListQueryOptions = CreativeAssetListFilterInput & {
    enabled?: boolean;
};

export type CreativeProjectListQueryKey = readonly ["creative-projects", "list", number, number];

export type CreativeProjectListQueryOptions = {
    page?: number;
    pageSize?: number;
    enabled?: boolean;
};

export type CreativeAssetListUpdater = CreativeAsset | ((asset: CreativeAsset) => CreativeAsset);

export type CreativeAssetListCacheUpdateResult = {
    updated: number;
    inserted: number;
    removed: number;
};

export function normalizeCreativeAssetListFilters(options: CreativeAssetListFilterInput = {}): CreativeAssetListFilters {
    return {
        page: normalizePositiveInteger(options.page, 1),
        pageSize: Math.min(100, normalizePositiveInteger(options.pageSize, CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE)),
        type: options.type?.trim() || "",
        sourceModule: options.sourceModule?.trim() || "",
        projectId: options.projectId?.trim() || "",
        folderId: options.folderId?.trim() || "",
        search: options.search?.trim() || "",
        favorite: Boolean(options.favorite),
        model: options.model?.trim() || "",
        tag: options.tag?.trim() || "",
        createdFrom: normalizeTimestamp(options.createdFrom),
        createdTo: normalizeTimestamp(options.createdTo),
        trash: Boolean(options.trash),
    };
}

export function creativeAssetListQueryKey(options: CreativeAssetListFilterInput = {}): CreativeAssetListQueryKey {
    const filters = normalizeCreativeAssetListFilters(options);
    return [
        ...CREATIVE_ASSET_LIST_QUERY_ROOT,
        filters.page,
        filters.pageSize,
        filters.type,
        filters.sourceModule,
        filters.projectId,
        filters.folderId,
        filters.search,
        filters.favorite,
        filters.model,
        filters.tag,
        filters.createdFrom ?? null,
        filters.createdTo ?? null,
        filters.trash,
    ];
}

export const creativeAssetQueryKeys = {
    all: CREATIVE_ASSET_QUERY_ROOT,
    lists: () => CREATIVE_ASSET_LIST_QUERY_ROOT,
    list: (options: CreativeAssetListFilterInput = {}) => creativeAssetListQueryKey(options),
} as const;

export function creativeProjectListQueryKey(options: CreativeProjectListQueryOptions = {}): CreativeProjectListQueryKey {
    const page = normalizePositiveInteger(options.page, 1);
    const pageSize = Math.min(100, normalizePositiveInteger(options.pageSize, CREATIVE_PROJECT_LIST_DEFAULT_PAGE_SIZE));
    return [...CREATIVE_PROJECT_LIST_QUERY_ROOT, page, pageSize];
}

export const creativeProjectQueryKeys = {
    all: CREATIVE_PROJECT_QUERY_ROOT,
    lists: () => CREATIVE_PROJECT_LIST_QUERY_ROOT,
    list: (options: CreativeProjectListQueryOptions = {}) => creativeProjectListQueryKey(options),
} as const;

export function fetchCreativeAssetList(options: CreativeAssetListFilterInput, signal?: AbortSignal) {
    const filters = normalizeCreativeAssetListFilters(options);
    return fetchCreativeAssets({
        page: filters.page,
        pageSize: filters.pageSize,
        type: filters.type || undefined,
        sourceModule: filters.sourceModule || undefined,
        projectId: filters.projectId || undefined,
        folderId: filters.folderId || undefined,
        search: filters.search || undefined,
        favorite: filters.favorite || undefined,
        model: filters.model || undefined,
        tag: filters.tag || undefined,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        trash: filters.trash || undefined,
        signal,
    });
}

export function creativeAssetListQueryOptions(options: CreativeAssetListQueryOptions = {}) {
    const { enabled = true, ...input } = options;
    const filters = normalizeCreativeAssetListFilters(input);
    return {
        queryKey: creativeAssetListQueryKey(filters),
        queryFn: ({ signal }: QueryFunctionContext<CreativeAssetListQueryKey>) => fetchCreativeAssetList(filters, signal),
        staleTime: CREATIVE_ASSET_LIST_STALE_TIME,
        enabled,
    };
}

export function creativeProjectListQueryOptions(options: CreativeProjectListQueryOptions = {}) {
    const { enabled = true } = options;
    const queryKey = creativeProjectListQueryKey(options);
    const [, , page, pageSize] = queryKey;
    return {
        queryKey,
        queryFn: ({ signal }: QueryFunctionContext<CreativeProjectListQueryKey>) => fetchCreativeProjects({ page, pageSize, signal }),
        staleTime: CREATIVE_PROJECT_LIST_STALE_TIME,
        enabled,
    };
}

export function updateCreativeAssetPageCache(data: CreativeAssetPage | undefined, assetId: string, updater: CreativeAssetListUpdater) {
    if (!data) return data;
    let changed = false;
    const items = data.items.map((asset) => {
        if (asset.asset_id !== assetId) return asset;
        const next = typeof updater === "function" ? updater(asset) : updater;
        if (next === asset) return asset;
        changed = true;
        return next;
    });
    return changed ? { ...data, items } : data;
}

export function updateCreativeAssetListCache(queryClient: QueryClient, assetId: string, updater: CreativeAssetListUpdater) {
    return queryClient.setQueriesData<CreativeAssetPage>({ queryKey: CREATIVE_ASSET_LIST_QUERY_ROOT }, (data) => updateCreativeAssetPageCache(data, assetId, updater));
}

/**
 * Update generated assets already present in every cached list and insert a
 * new asset only into matching first-page caches. We cannot safely shift a
 * loaded later page, so those pages remain untouched until their normal stale
 * lifecycle or an explicit user refresh.
 */
export function upsertCreativeAssetListCache(queryClient: QueryClient, asset: CreativeAsset): CreativeAssetListCacheUpdateResult {
    const result: CreativeAssetListCacheUpdateResult = { updated: 0, inserted: 0, removed: 0 };
    const queries = queryClient.getQueryCache().findAll({ queryKey: CREATIVE_ASSET_LIST_QUERY_ROOT });
    for (const query of queries) {
        const filters = creativeAssetListFiltersFromQueryKey(query.queryKey);
        if (!filters) continue;
        queryClient.setQueryData<CreativeAssetPage>(query.queryKey, (data) => {
            if (!data) return data;
            const currentIndex = data.items.findIndex((item) => item.asset_id === asset.asset_id);
            if (currentIndex >= 0) {
                if (!matchesCreativeAssetFilters(asset, filters)) {
                    result.removed += 1;
                    return { ...data, items: data.items.filter((item) => item.asset_id !== asset.asset_id), total: Math.max(0, data.total - 1) };
                }
                result.updated += 1;
                const items = data.items.map((item) => (item.asset_id === asset.asset_id ? asset : item));
                return { ...data, items };
            }
            if (filters.page !== 1 || !matchesCreativeAssetFilters(asset, filters)) return data;
            const pageSize = data.page_size || filters.pageSize;
            const items = [asset, ...data.items].sort(compareCreativeAssets).slice(0, pageSize);
            result.inserted += 1;
            return { ...data, items, total: data.total + 1 };
        });
    }
    return result;
}

export function invalidateCreativeAssetList(queryClient: QueryClient) {
    return queryClient.invalidateQueries({ queryKey: CREATIVE_ASSET_LIST_QUERY_ROOT });
}

export function invalidateCreativeProjectList(queryClient: QueryClient) {
    return queryClient.invalidateQueries({ queryKey: CREATIVE_PROJECT_QUERY_ROOT });
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value as number)) : fallback;
}

function normalizeTimestamp(value: number | undefined) {
    return Number.isFinite(value) ? value : undefined;
}

function creativeAssetListFiltersFromQueryKey(queryKey: readonly unknown[]): CreativeAssetListFilters | null {
    if (queryKey.length !== 15 || queryKey[0] !== CREATIVE_ASSET_LIST_QUERY_ROOT[0] || queryKey[1] !== "list") return null;
    const [page, pageSize, type, sourceModule, projectId, folderId, search, favorite, model, tag, createdFrom, createdTo, trash] = queryKey.slice(2);
    if (
        typeof page !== "number" ||
        typeof pageSize !== "number" ||
        typeof type !== "string" ||
        typeof sourceModule !== "string" ||
        typeof projectId !== "string" ||
        typeof folderId !== "string" ||
        typeof search !== "string" ||
        typeof favorite !== "boolean" ||
        typeof model !== "string" ||
        typeof tag !== "string" ||
        !(createdFrom === null || typeof createdFrom === "number") ||
        !(createdTo === null || typeof createdTo === "number") ||
        typeof trash !== "boolean"
    ) {
        return null;
    }
    return { page, pageSize, type, sourceModule, projectId, folderId, search, favorite, model, tag, createdFrom: createdFrom ?? undefined, createdTo: createdTo ?? undefined, trash };
}

function matchesCreativeAssetFilters(asset: CreativeAsset, filters: CreativeAssetListFilters) {
    if (filters.type && asset.type.toUpperCase() !== filters.type.toUpperCase()) return false;
    if (filters.sourceModule && (asset.source_module || "") !== filters.sourceModule) return false;
    if (filters.projectId && (asset.project_id || "") !== filters.projectId) return false;
    if (filters.folderId && (asset.folder_id || "") !== filters.folderId) return false;
    if (filters.favorite && !asset.favorite) return false;
    if (filters.model && (asset.model || "") !== filters.model) return false;
    if (filters.tag && !(asset.tags || []).includes(filters.tag)) return false;
    if (filters.createdFrom !== undefined && asset.created_at < filters.createdFrom) return false;
    if (filters.createdTo !== undefined && asset.created_at > filters.createdTo) return false;
    if (filters.trash !== isCreativeAssetInTrash(asset)) return false;
    if (filters.search) {
        const search = filters.search.toLowerCase();
        const haystack = [asset.asset_id, asset.title, asset.content, asset.notes, ...(asset.tags || [])].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
    }
    return true;
}

function isCreativeAssetInTrash(asset: CreativeAsset) {
    return ["DELETED", "TRASHED", "IN_TRASH", "REMOVED"].includes(asset.status.toUpperCase());
}

function compareCreativeAssets(left: CreativeAsset, right: CreativeAsset) {
    return right.created_at - left.created_at || right.updated_at - left.updated_at || String(right.id).localeCompare(String(left.id));
}
