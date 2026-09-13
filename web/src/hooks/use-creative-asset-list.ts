import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCreativeProject, createCreativeTextAsset, deleteCreativeAsset, restoreCreativeAsset, updateCreativeAsset, uploadCreativeAsset } from "@/services/api/creative";
import { removeCreativeAssetDetailCache, updateCreativeAssetDetailCache } from "@/services/creative-asset-details";
import {
    CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE,
    CREATIVE_ASSET_LIST_STALE_TIME,
    CREATIVE_ASSET_QUERY_ROOT,
    CREATIVE_ASSET_LIST_QUERY_ROOT,
    CREATIVE_PROJECT_LIST_DEFAULT_PAGE_SIZE,
    CREATIVE_PROJECT_LIST_STALE_TIME,
    CREATIVE_PROJECT_QUERY_ROOT,
    CREATIVE_PROJECT_LIST_QUERY_ROOT,
    creativeAssetQueryKeys,
    creativeAssetListQueryOptions,
    creativeAssetListQueryKey,
    creativeProjectQueryKeys,
    creativeProjectListQueryOptions,
    invalidateCreativeAssetList,
    invalidateCreativeProjectList,
    normalizeCreativeAssetListFilters,
    updateCreativeAssetListCache,
    type CreativeAssetListFilterInput,
    type CreativeAssetListFilters,
    type CreativeAssetListUpdater,
    type CreativeProjectListQueryOptions,
} from "@/services/creative-asset-list";

export {
    CREATIVE_ASSET_LIST_DEFAULT_PAGE_SIZE,
    CREATIVE_ASSET_LIST_STALE_TIME,
    CREATIVE_ASSET_QUERY_ROOT,
    CREATIVE_ASSET_LIST_QUERY_ROOT,
    CREATIVE_PROJECT_LIST_DEFAULT_PAGE_SIZE,
    CREATIVE_PROJECT_LIST_STALE_TIME,
    CREATIVE_PROJECT_QUERY_ROOT,
    CREATIVE_PROJECT_LIST_QUERY_ROOT,
    creativeAssetQueryKeys,
    creativeAssetListQueryKey,
    creativeAssetListQueryOptions,
    creativeProjectQueryKeys,
    creativeProjectListQueryOptions,
    normalizeCreativeAssetListFilters,
    type CreativeAssetListFilterInput,
    type CreativeAssetListFilters,
    type CreativeAssetListUpdater,
};

export type UseCreativeAssetListOptions = CreativeAssetListFilterInput & {
    enabled?: boolean;
    debounceMs?: number;
};

export function useCreativeAssetList({ page, pageSize, type, sourceModule, projectId, folderId, search, favorite, model, tag, createdFrom, createdTo, trash, enabled = true, debounceMs = 250 }: UseCreativeAssetListOptions = {}) {
    const queryClient = useQueryClient();
    const filters = useMemo(
        () => normalizeCreativeAssetListFilters({ page, pageSize, type, sourceModule, projectId, folderId, search, favorite, model, tag, createdFrom, createdTo, trash }),
        [createdFrom, createdTo, favorite, folderId, model, page, pageSize, projectId, search, sourceModule, tag, trash, type],
    );
    const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

    useEffect(() => {
        if (debounceMs <= 0) {
            setDebouncedSearch(filters.search);
            return;
        }
        const timer = window.setTimeout(() => setDebouncedSearch(filters.search), debounceMs);
        return () => window.clearTimeout(timer);
    }, [debounceMs, filters.search]);

    const queryFilters = useMemo<CreativeAssetListFilters>(() => ({ ...filters, search: debouncedSearch }), [debouncedSearch, filters]);

    const query = useQuery({
        ...creativeAssetListQueryOptions({ ...queryFilters, enabled }),
        placeholderData: keepPreviousData,
    });
    const items = useMemo(() => query.data?.items || [], [query.data?.items]);
    const invalidate = useCallback(() => invalidateCreativeAssetList(queryClient), [queryClient]);
    const invalidateCurrent = useCallback(() => queryClient.invalidateQueries({ queryKey: creativeAssetListQueryKey(queryFilters) }), [queryClient, queryFilters]);
    const cancelCurrent = useCallback(() => queryClient.cancelQueries({ queryKey: creativeAssetListQueryKey(queryFilters), exact: true }), [queryClient, queryFilters]);
    const updateAsset = useCallback((assetId: string, updater: CreativeAssetListUpdater) => updateCreativeAssetListCache(queryClient, assetId, updater), [queryClient]);

    return {
        ...query,
        items,
        total: query.data?.total || 0,
        filters: queryFilters,
        invalidate,
        invalidateCurrent,
        cancelCurrent,
        updateAsset,
    };
}

export function useCreativeAssetsQuery(options: UseCreativeAssetListOptions = {}) {
    return useCreativeAssetList(options);
}

export type UseCreativeProjectListOptions = CreativeProjectListQueryOptions;

export function useCreativeProjectList({ page, pageSize, enabled = true }: UseCreativeProjectListOptions = {}) {
    const queryClient = useQueryClient();
    const query = useQuery(creativeProjectListQueryOptions({ page, pageSize, enabled }));
    const items = useMemo(() => query.data?.items || [], [query.data?.items]);
    const invalidate = useCallback(() => invalidateCreativeProjectList(queryClient), [queryClient]);

    return {
        ...query,
        items,
        total: query.data?.total || 0,
        invalidate,
    };
}

export function useCreativeProjectsQuery(options: UseCreativeProjectListOptions = {}) {
    return useCreativeProjectList(options);
}

export type UploadCreativeAssetVariables = {
    file: Blob;
    title?: string;
    importKey?: string;
    projectId?: string;
};

export type UpdateCreativeAssetVariables = {
    assetId: string;
    updates: Parameters<typeof updateCreativeAsset>[1];
};

export function useCreativeAssetMutations() {
    const queryClient = useQueryClient();
    const invalidateAssets = useCallback(() => invalidateCreativeAssetList(queryClient), [queryClient]);
    const invalidateProjects = useCallback(() => invalidateCreativeProjectList(queryClient), [queryClient]);

    const createTextAsset = useMutation({ mutationFn: createCreativeTextAsset, onSuccess: invalidateAssets });
    const uploadAsset = useMutation({
        mutationFn: ({ file, title, importKey, projectId }: UploadCreativeAssetVariables) => uploadCreativeAsset(file, title, undefined, importKey, projectId),
        onSuccess: invalidateAssets,
    });
    const updateAsset = useMutation({
        mutationFn: ({ assetId, updates }: UpdateCreativeAssetVariables) => updateCreativeAsset(assetId, updates),
        onSuccess: (asset) => {
            updateCreativeAssetListCache(queryClient, asset.asset_id, asset);
            updateCreativeAssetDetailCache(queryClient, asset);
            return invalidateAssets();
        },
    });
    const deleteAsset = useMutation({
        mutationFn: deleteCreativeAsset,
        onSuccess: (_result, assetId) => {
            removeCreativeAssetDetailCache(queryClient, assetId);
            return invalidateAssets();
        },
    });
    const restoreAsset = useMutation({
        mutationFn: restoreCreativeAsset,
        onSuccess: (_result, assetId) => {
            removeCreativeAssetDetailCache(queryClient, assetId);
            return invalidateAssets();
        },
    });
    const createProject = useMutation({ mutationFn: createCreativeProject, onSuccess: invalidateProjects });

    return { createTextAsset, uploadAsset, updateAsset, deleteAsset, restoreAsset, createProject, invalidateAssets, invalidateProjects };
}
