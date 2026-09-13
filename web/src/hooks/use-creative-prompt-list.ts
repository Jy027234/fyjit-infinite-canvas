import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import {
    creativePromptListQueryKey,
    creativePromptListQueryOptions,
    invalidateCreativePromptList,
    normalizeCreativePromptListFilters,
    updateCreativePromptListCache,
    type CreativePromptListFilterInput,
    type CreativePromptListUpdater,
} from "@/services/creative-prompt-list";

export { creativePromptListQueryOptions } from "@/services/creative-prompt-list";

export type UseCreativePromptListOptions = CreativePromptListFilterInput & {
    enabled?: boolean;
    debounceMs?: number;
};

export function useCreativePromptList({ page, pageSize, search, category, promptType, tag, sourceType, favorite, enabled = true, debounceMs = 0 }: UseCreativePromptListOptions = {}) {
    const queryClient = useQueryClient();
    const filters = useMemo(() => normalizeCreativePromptListFilters({ page, pageSize, search, category, promptType, tag, sourceType, favorite }), [category, favorite, page, pageSize, promptType, search, sourceType, tag]);
    const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

    useEffect(() => {
        if (debounceMs <= 0) {
            setDebouncedSearch(filters.search);
            return;
        }
        const timer = window.setTimeout(() => setDebouncedSearch(filters.search), debounceMs);
        return () => window.clearTimeout(timer);
    }, [debounceMs, filters.search]);

    const queryFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [debouncedSearch, filters]);
    const query = useQuery({
        ...creativePromptListQueryOptions(queryFilters),
        enabled,
        placeholderData: keepPreviousData,
    });
    const items = useMemo(() => query.data?.items || [], [query.data?.items]);
    const invalidate = useCallback(() => invalidateCreativePromptList(queryClient), [queryClient]);
    const invalidateCurrent = useCallback(() => invalidateCreativePromptList(queryClient, queryFilters), [queryClient, queryFilters]);
    const cancelCurrent = useCallback(() => queryClient.cancelQueries({ queryKey: creativePromptListQueryKey(queryFilters), exact: true }), [queryClient, queryFilters]);
    const updatePrompt = useCallback((promptId: string, updater: CreativePromptListUpdater) => updateCreativePromptListCache(queryClient, queryFilters, promptId, updater), [queryClient, queryFilters]);

    return {
        ...query,
        items,
        total: query.data?.total || 0,
        filters: queryFilters,
        invalidate,
        invalidateCurrent,
        cancelCurrent,
        updatePrompt,
    };
}
