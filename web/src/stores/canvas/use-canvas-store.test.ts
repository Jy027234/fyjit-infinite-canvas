import { describe, expect, mock, test } from "bun:test";

import { normalizeCanvasValue } from "@/stores/canvas/use-canvas-store";

describe("canvas server normalization", () => {
    test("uploads a local asset from its durable storage key before reading a blob URL", async () => {
        const storedBlob = new Blob(["image"], { type: "image/png" });
        const readStoredBlob = mock(async () => storedBlob);
        const readUrlBlob = mock(async () => {
            throw new Error("revoked blob URL");
        });
        const uploadBlob = mock(async () => ({ asset_id: "asset-1" }));

        const normalized = await normalizeCanvasValue({ content: "blob:revoked", storageKey: "image:local-1", title: "参考图" }, { readStoredBlob, readUrlBlob, uploadBlob });

        expect(normalized).toEqual({ content: "/api/creative/assets/asset-1/content", title: "参考图", assetId: "asset-1" });
        expect(readStoredBlob).toHaveBeenCalledWith("image:local-1");
        expect(readUrlBlob).not.toHaveBeenCalled();
        expect(uploadBlob).toHaveBeenCalledWith(storedBlob, "参考图");
    });
});
