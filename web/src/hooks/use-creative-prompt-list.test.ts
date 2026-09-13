import { describe, expect, test } from "bun:test";

import { CREATIVE_PROMPT_LIST_STALE_TIME } from "@/services/creative-prompt-list";
import { creativePromptListQueryOptions } from "./use-creative-prompt-list";

describe("useCreativePromptList contract", () => {
    test("exposes the shared query options for downstream prompt consumers", () => {
        const options = creativePromptListQueryOptions({ page: 3, pageSize: 48, category: "image", enabled: false });

        expect(options.queryKey).toEqual(["creative-prompt-list", 3, 48, "", "image", "", "", "", false]);
        expect(options.staleTime).toBe(CREATIVE_PROMPT_LIST_STALE_TIME);
        expect(options.enabled).toBe(false);
    });
});
