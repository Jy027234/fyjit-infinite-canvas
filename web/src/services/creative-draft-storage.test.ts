import { describe, expect, test } from "bun:test";

import { creativeDraftProjectKey, creativeDraftStorageKey, sanitizeCreativeDraft, type ImageWorkbenchDraft } from "./creative-draft-storage";

describe("creative workbench drafts", () => {
    test("uses versioned account and workbench keys with an isolated project scope", () => {
        expect(creativeDraftProjectKey(undefined)).toBe("__default__");
        expect(creativeDraftProjectKey(" project-1 ")).toBe("project-1");
        expect(creativeDraftStorageKey("user/73", "image")).toBe("fyjit:creative-drafts:v1:user%2F73:image");
    });

    test("keeps only resumable asset ids and approved draft fields", () => {
        const input = {
            version: 1,
            kind: "image" as const,
            projectId: "project-1",
            prompt: "A mountain lake",
            negativePrompt: "blur",
            generationMode: "edit" as const,
            model: "image-model",
            config: { quality: "high", size: "16:9", count: "1", background: "" },
            references: [
                { assetId: "asset-1", name: "Lake", type: "image/png", kind: "image" as const, dataUrl: "data:image/png;base64,secret" },
                { assetId: "", name: "local-only", type: "image/png", kind: "image" as const, dataUrl: "blob:local" },
            ],
            updatedAt: Date.now(),
            token: "must-not-be-stored",
        } as unknown as ImageWorkbenchDraft & { token: string };

        const sanitized = sanitizeCreativeDraft(input);
        expect(sanitized.references).toEqual([{ assetId: "asset-1", name: "Lake", type: "image/png", kind: "image" }]);
        expect(JSON.stringify(sanitized)).not.toContain("dataUrl");
        expect(JSON.stringify(sanitized)).not.toContain("blob:");
        expect(JSON.stringify(sanitized)).not.toContain("must-not-be-stored");
    });
});
