import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { CreativePrompt, CreativePromptPage } from "@/services/api/creative";
import {
    CREATIVE_PROMPT_LIST_DEFAULT_PAGE_SIZE,
    CREATIVE_PROMPT_LIST_STALE_TIME,
    creativePromptListQueryKey,
    creativePromptListQueryOptions,
    fetchCreativePromptList,
    invalidateCreativePromptList,
    normalizeCreativePromptListFilters,
    updateCreativePromptListCache,
} from "./creative-prompt-list";

const originalFetch = globalThis.fetch;

function prompt(promptId: string, favorite = false): CreativePrompt {
    return {
        id: Number(promptId.replace(/\D/g, "")) || 1,
        prompt_id: promptId,
        user_id: 1,
        title: promptId,
        content: "content-" + promptId,
        tags: [],
        variables: [],
        catalog: false,
        favorite,
        version: 1,
        created_at: 1,
        updated_at: 1,
    };
}

function page(items: CreativePrompt[], total = items.length): CreativePromptPage {
    return { items, total, page: 1, page_size: 24 };
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("creative prompt list query", () => {
    test("normalizes all filters and pagination into a stable query key", () => {
        const options = {
            page: 2,
            pageSize: 200,
            search: "  portrait  ",
            category: " image ",
            promptType: "image",
            tag: " studio ",
            sourceType: "external",
            favorite: true,
        };

        expect(normalizeCreativePromptListFilters(options)).toEqual({
            page: 2,
            pageSize: 100,
            search: "portrait",
            category: "image",
            promptType: "image",
            tag: "studio",
            sourceType: "external",
            favorite: true,
        });
        expect(creativePromptListQueryKey(options)).toEqual(["creative-prompt-list", 2, 100, "portrait", "image", "image", "studio", "external", true]);
        expect(creativePromptListQueryKey({ ...options, search: "portrait" })).toEqual(creativePromptListQueryKey(options));
    });

    test("passes normalized filters and the React Query AbortSignal to the API", async () => {
        const signal = new AbortController().signal;
        let request = "";
        let requestSignal: AbortSignal | null | undefined;
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            request = String(input);
            requestSignal = init?.signal;
            return Response.json({ data: page([]) });
        }) as unknown as typeof fetch;

        await fetchCreativePromptList(
            {
                page: 2,
                pageSize: 24,
                search: " portrait ",
                category: "image",
                promptType: "image",
                tag: "studio",
                sourceType: "external",
                favorite: true,
            },
            signal,
        );

        expect(request).toBe("/api/creative/prompts?page=2&page_size=24&search=portrait&category=image&prompt_type=image&tag=studio&source_type=external&favorite=true");
        expect(requestSignal).toBe(signal);
    });

    test("exposes a cached query option with a bounded stale window", () => {
        const options = creativePromptListQueryOptions({ pageSize: CREATIVE_PROMPT_LIST_DEFAULT_PAGE_SIZE, enabled: false });

        expect(options.queryKey).toEqual(["creative-prompt-list", 1, CREATIVE_PROMPT_LIST_DEFAULT_PAGE_SIZE, "", "", "", "", "", false]);
        expect(options.staleTime).toBe(CREATIVE_PROMPT_LIST_STALE_TIME);
        expect(options.enabled).toBe(false);
    });

    test("updates one exact cached page and supports exact or domain invalidation", async () => {
        const queryClient = new QueryClient();
        const filters = { page: 1, pageSize: 24, search: "portrait" };
        const key = creativePromptListQueryKey(filters);
        queryClient.setQueryData(key, page([prompt("prompt-1")]));

        updateCreativePromptListCache(queryClient, filters, "prompt-1", (current) => ({ ...current, favorite: true }));
        expect(queryClient.getQueryData<CreativePromptPage>(key)?.items[0]).toMatchObject({ prompt_id: "prompt-1", favorite: true });

        await invalidateCreativePromptList(queryClient, filters);
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        queryClient.clear();
    });
});
