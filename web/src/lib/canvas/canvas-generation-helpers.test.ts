import { describe, expect, test } from "bun:test";

import { hasResumableVideoTask, resetInterruptedGeneration } from "./canvas-generation-helpers";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const video = (metadata: CanvasNodeData["metadata"]): CanvasNodeData => ({ id: "video", type: CanvasNodeType.Video, title: "Video", position: { x: 0, y: 0 }, width: 320, height: 180, metadata });

describe("FYJ canvas task recovery", () => {
    test("keeps an authenticated Creative job resumable after refresh", () => {
        const node = video({ status: "loading", creativeJobId: "creative-job" });
        expect(hasResumableVideoTask(node)).toBe(true);
        expect(resetInterruptedGeneration([node])[0]).toBe(node);
    });

    test("does not resume upstream provider tasks or already completed media", () => {
        const upstream = video({ status: "loading", videoTaskId: "provider-task", videoTaskProvider: "openai" });
        expect(hasResumableVideoTask(upstream)).toBe(false);
        expect(resetInterruptedGeneration([upstream])[0].metadata?.status).toBe("error");
        expect(hasResumableVideoTask(video({ content: "/api/creative/assets/video/content", creativeJobId: "creative-job" }))).toBe(false);
    });
});
