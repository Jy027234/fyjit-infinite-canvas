import { describe, expect, mock, test } from "bun:test";

import { migrateLegacyCanvasBatches, normalizeCanvasValue } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType } from "@/types/canvas";

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
    test("keeps each generated batch image bound to its own server asset", async () => {
        const uploadBlob = mock(async () => ({ asset_id: "unexpected-upload" }));
        const normalized = await normalizeCanvasValue({
            content: "blob:primary",
            assetId: "first",
            storageKey: "image:first",
            images: [
                { id: "one", content: "blob:first", assetId: "first", storageKey: "image:first" },
                { id: "two", content: "blob:second", assetId: "second", storageKey: "image:second" },
            ],
        }, { readStoredBlob: async () => null, readUrlBlob: async () => new Blob(), uploadBlob });

        expect(normalized).toEqual({
            content: "/api/creative/assets/first/content",
            assetId: "first",
            images: [
                { id: "one", content: "/api/creative/assets/first/content", assetId: "first" },
                { id: "two", content: "/api/creative/assets/second/content", assetId: "second" },
            ],
        });
        expect(uploadBlob).not.toHaveBeenCalled();
    });
});


describe("legacy canvas image batches", () => {
    test("converts old batch children without losing ownership or connected nodes", () => {
        const image = (id: string, assetId: string, extra: Record<string, unknown> = {}) => ({ id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 320, height: 240, metadata: { content: `/api/creative/assets/${assetId}/content`, assetId, ...extra } });
        const root = image("root", "second", { isBatchRoot: true, batchChildIds: ["first", "second", "grouped"], primaryImageId: "second" });
        const document = { nodes: [root, image("first", "first", { batchRootId: "root" }), image("second", "second", { batchRootId: "root" }), image("grouped", "third", { batchRootId: "root", groupId: "group" }), image("target", "target")], connections: [
            { id: "root-first", fromNodeId: "root", toNodeId: "first" },
            { id: "root-second", fromNodeId: "root", toNodeId: "second" },
            { id: "external", fromNodeId: "second", toNodeId: "target" },
        ], chatSessions: [], activeChatId: null, backgroundMode: "lines" as const, showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } };
        const converted = migrateLegacyCanvasBatches(document);
        expect(converted.nodes.map((node) => node.id)).toEqual(["root", "second", "grouped", "target"]);
        expect(converted.nodes[0].metadata?.images?.map((image) => image.assetId)).toEqual(["first", "second", "third"]);
        expect(converted.nodes[0].metadata?.assetId).toBe("second");
        expect(converted.connections.some((edge) => edge.id === "external")).toBe(true);
        expect(migrateLegacyCanvasBatches(converted)).toEqual(converted);
    });
});
