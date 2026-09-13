import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";

import { fetchCreativePrompts, type CreativePrompt, type CreativePromptPage } from "@/services/api/creative";

export const CREATIVE_PROMPT_LIST_QUERY_ROOT = ["creative-prompt-list"] as const;
export const CREATIVE_PROMPT_LIST_DEFAULT_PAGE_SIZE = 24;
export const CREATIVE_PROMPT_LIST_STALE_TIME = 15_000;

export type CreativePromptListFilterInput = {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    promptType?: string;
    tag?: string;
    sourceType?: string;
    favorite?: boolean;
};

export type CreativePromptListFilters = {
    page: number;
    pageSize: number;
    search: string;
    category: string;
    promptType: string;
    tag: string;
    sourceType: string;
    favorite: boolean;
};

export type CreativePromptListQueryKey = readonly ["creative-prompt-list", number, number, string, string, string, string, string, boolean];

export type CreativePromptListQueryOptions = CreativePromptListFilterInput & {
    enabled?: boolean;
};

export type CreativePromptListUpdater = CreativePrompt | ((prompt: CreativePrompt) => CreativePrompt);

export function normalizeCreativePromptListFilters(options: CreativePromptListFilterInput = {}): CreativePromptListFilters {
    return {
        page: normalizePositiveInteger(options.page, 1),
        pageSize: Math.min(100, normalizePositiveInteger(options.pageSize, CREATIVE_PROMPT_LIST_DEFAULT_PAGE_SIZE)),
        search: options.search?.trim() || "",
        category: options.category?.trim() || "",
        promptType: options.promptType?.trim() || "",
        tag: options.tag?.trim() || "",
        sourceType: options.sourceType?.trim() || "",
        favorite: Boolean(options.favorite),
    };
}

export function creativePromptListQueryKey(options: CreativePromptListFilterInput): CreativePromptListQueryKey {
    const filters = normalizeCreativePromptListFilters(options);
    return [...CREATIVE_PROMPT_LIST_QUERY_ROOT, filters.page, filters.pageSize, filters.search, filters.category, filters.promptType, filters.tag, filters.sourceType, filters.favorite];
}

export function creativePromptListQueryScope(options?: CreativePromptListFilterInput) {
    return options ? creativePromptListQueryKey(options) : CREATIVE_PROMPT_LIST_QUERY_ROOT;
}

export function fetchCreativePromptList(options: CreativePromptListFilterInput, signal?: AbortSignal) {
    const filters = normalizeCreativePromptListFilters(options);
    return fetchCreativePrompts({
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined,
        category: filters.category || undefined,
        promptType: filters.promptType || undefined,
        tag: filters.tag || undefined,
        sourceType: filters.sourceType || undefined,
        favorite: filters.favorite || undefined,
        signal,
    });
}

export function creativePromptListQueryOptions(options: CreativePromptListQueryOptions = {}) {
    const { enabled = true, ...input } = options;
    const filters = normalizeCreativePromptListFilters(input);
    return {
        queryKey: creativePromptListQueryKey(filters),
        queryFn: ({ signal }: QueryFunctionContext<CreativePromptListQueryKey>) => fetchCreativePromptList(filters, signal),
        staleTime: CREATIVE_PROMPT_LIST_STALE_TIME,
        enabled,
    };
}

export function updateCreativePromptListCache(queryClient: QueryClient, filters: CreativePromptListFilterInput, promptId: string, updater: CreativePromptListUpdater) {
    return queryClient.setQueryData<CreativePromptPage>(creativePromptListQueryKey(filters), (data) => {
        if (!data) return data;
        let changed = false;
        const items = data.items.map((prompt) => {
            if (prompt.prompt_id !== promptId) return prompt;
            const next = typeof updater === "function" ? updater(prompt) : updater;
            if (next === prompt) return prompt;
            changed = true;
            return next;
        });
        return changed ? { ...data, items } : data;
    });
}

export function invalidateCreativePromptList(queryClient: QueryClient, filters?: CreativePromptListFilterInput) {
    return queryClient.invalidateQueries({ queryKey: creativePromptListQueryScope(filters) });
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value as number)) : fallback;
}
