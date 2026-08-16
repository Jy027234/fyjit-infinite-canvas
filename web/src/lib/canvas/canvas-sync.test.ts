import { describe, expect, test } from "bun:test";

import { hasCanvasContentChanged, hasCanvasViewportChanged, type CanvasSyncSnapshot } from "@/lib/canvas/canvas-sync";

const emptySnapshot: CanvasSyncSnapshot = {
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines",
    showImageInfo: false,
};

describe("canvas sync change detection", () => {
    test("does not save a restored canvas again when all restored references are unchanged", () => {
        expect(hasCanvasContentChanged(emptySnapshot, emptySnapshot)).toBe(false);
        expect(hasCanvasViewportChanged({ x: 10, y: 20, k: 1.2 }, { x: 10, y: 20, k: 1.2 })).toBe(false);
    });

    test("detects text or image node edits and viewport edits", () => {
        expect(hasCanvasContentChanged(emptySnapshot, { ...emptySnapshot, nodes: [...emptySnapshot.nodes] })).toBe(true);
        expect(hasCanvasViewportChanged({ x: 10, y: 20, k: 1.2 }, { x: 11, y: 20, k: 1.2 })).toBe(true);
    });
});
