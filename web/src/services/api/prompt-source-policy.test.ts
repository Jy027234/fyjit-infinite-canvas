import { afterEach, describe, expect, mock, test } from "bun:test";

import { applyPromptSourcePolicy, canSyncPromptSource, DEFAULT_PROMPT_SOURCES, createPromptSource, isPromptSourceApproved } from "./prompt-source-presets";
import { runPromptSource } from "./prompt-source-runtime";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    applyPromptSourcePolicy([]);
});

describe("prompt source licensing policy", () => {
    test("custom sources default to link-only and unverified", () => {
        const source = createPromptSource({ name: "Custom", homepage: "https://example.com" });

        expect(source.syncPolicy).toBe("link-only");
        expect(source.auditStatus).toBe("unverified");
        expect(isPromptSourceApproved(source)).toBe(false);
    });

    test("unavailable built-in source remains link-only", () => {
        const source = DEFAULT_PROMPT_SOURCES.find((item) => item.id === "davidwu-gpt-image2-prompts");

        expect(source).toBeDefined();
        expect(source?.syncPolicy).toBe("link-only");
        expect(source?.auditStatus).toBe("unverified");
    });

    test("link-only sources are rejected before network access", async () => {
        const fetchMock = mock(() => Promise.resolve(new Response("[]")));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const source = createPromptSource({ name: "Unverified", url: "https://example.com/prompts.json" });

        await expect(runPromptSource(source)).rejects.toThrow("未通过授权审计");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("audited sources can be normalized", async () => {
        globalThis.fetch = mock(() => Promise.resolve(Response.json([{ id: "one", title: "One", prompt: "Draw one" }]))) as unknown as typeof fetch;
        const source = createPromptSource({
            name: "Audited",
            url: "https://example.com/prompts.json",
            homepage: "https://example.com",
            licenseId: "MIT",
            licenseUrl: "https://example.com/LICENSE",
            attribution: "Example contributors",
            syncPolicy: "full",
            auditStatus: "approved",
        });

        await expect(runPromptSource(source)).resolves.toMatchObject([{ id: "one", prompt: "Draw one" }]);
    });

    test("server takedown overrides a locally enabled audited source", () => {
        const source = DEFAULT_PROMPT_SOURCES.find((item) => item.id === "awesome-gpt-image");
        expect(source).toBeDefined();
        expect(canSyncPromptSource(source!)).toBe(true);

        applyPromptSourcePolicy([source!.id]);

        expect(canSyncPromptSource(source!)).toBe(false);
    });
});
