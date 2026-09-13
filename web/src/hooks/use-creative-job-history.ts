import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import {
    CREATIVE_JOB_HISTORY_DEFAULT_PAGE_SIZE,
    CREATIVE_JOB_HISTORY_STALE_TIME,
    creativeJobHistoryQueryKey,
    fetchCreativeJobHistoryPage,
    flattenCreativeJobHistory,
    getNextCreativeJobHistoryPage,
    invalidateCreativeJobHistory,
    updateCreativeJobHistoryCache,
    updateCreativeJobHistory,
    type CreativeJobHistoryCachePatch,
    type CreativeJobHistoryQueryParams,
    type CreativeJobHistoryUpdater,
} from "@/services/creative-job-history";
import type { CreativeCapability } from "@/services/api/generated/creative-contract";

export type UseCreativeJobHistoryOptions = {
    capability: CreativeCapability;
    pageSize?: number;
    enabled?: boolean;
};

export function creativeJobHistoryQueryOptions({ capability, pageSize = CREATIVE_JOB_HISTORY_DEFAULT_PAGE_SIZE, enabled = true }: UseCreativeJobHistoryOptions) {
    const params: CreativeJobHistoryQueryParams = { capability, pageSize };
    return {
        queryKey: creativeJobHistoryQueryKey(params),
        queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => fetchCreativeJobHistoryPage({ ...params, page: pageParam, signal }),
        initialPageParam: 1,
        getNextPageParam: (lastPage: Awaited<ReturnType<typeof fetchCreativeJobHistoryPage>>, pages: Awaited<ReturnType<typeof fetchCreativeJobHistoryPage>>[]) => getNextCreativeJobHistoryPage(lastPage, pages, pageSize),
        staleTime: CREATIVE_JOB_HISTORY_STALE_TIME,
        enabled,
    };
}

export function useCreativeJobHistory({ capability, pageSize = CREATIVE_JOB_HISTORY_DEFAULT_PAGE_SIZE, enabled = true }: UseCreativeJobHistoryOptions) {
    const queryClient = useQueryClient();
    const params = useMemo<CreativeJobHistoryQueryParams>(() => ({ capability, pageSize }), [capability, pageSize]);
    const query = useInfiniteQuery(creativeJobHistoryQueryOptions({ capability, pageSize, enabled }));
    const flattened = useMemo(() => flattenCreativeJobHistory(query.data?.pages), [query.data?.pages]);
    const updateJob = useCallback((jobId: string, updater: CreativeJobHistoryUpdater) => updateCreativeJobHistory(queryClient, params, jobId, updater), [params, queryClient]);
    const updateHistoryCache = useCallback((patch: CreativeJobHistoryCachePatch) => updateCreativeJobHistoryCache(queryClient, params, patch), [params, queryClient]);
    const invalidateHistory = useCallback(() => invalidateCreativeJobHistory(queryClient, params), [params, queryClient]);

    return {
        ...query,
        items: flattened.items,
        assets: flattened.assets,
        total: query.data?.pages[0]?.total || 0,
        updateJob,
        updateHistoryCache,
        invalidateHistory,
    };
}
