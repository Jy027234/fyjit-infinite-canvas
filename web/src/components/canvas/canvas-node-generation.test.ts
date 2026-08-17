import { describe, expect, test } from "bun:test";

import { buildNodeGenerationContext } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const node = (id: string, type: CanvasNodeType, content?: string): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: content ? { content, storageKey: `image:${id}` } : {},
});

describe("canvas video reference mentions", () => {
    test("submits referenced images in prompt mention order", () => {
        const nodes = [node("person", CanvasNodeType.Image, "blob:person"), node("background", CanvasNodeType.Image, "blob:background"), node("video", CanvasNodeType.Video)];
        const connections: CanvasConnection[] = [
            { id: "person-video", fromNodeId: "person", toNodeId: "video" },
            { id: "background-video", fromNodeId: "background", toNodeId: "video" },
        ];

        const context = buildNodeGenerationContext("video", nodes, connections, "让 @[node:person] 站在 @[node:background] 中间");

        expect(context.prompt).toBe("让 图片1 站在 图片2 中间");
        expect(context.referenceImages.map((item) => item.id)).toEqual(["person", "background"]);
    });

    test("keeps connected references when the prompt has no explicit mention", () => {
        const nodes = [node("person", CanvasNodeType.Image, "blob:person"), node("video", CanvasNodeType.Video)];
        const connections: CanvasConnection[] = [{ id: "person-video", fromNodeId: "person", toNodeId: "video" }];

        const context = buildNodeGenerationContext("video", nodes, connections, "人物向镜头挥手");

        expect(context.referenceImages.map((item) => item.id)).toEqual(["person"]);
    });
});
