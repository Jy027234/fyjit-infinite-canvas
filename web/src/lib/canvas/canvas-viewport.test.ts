import { describe, expect, test } from "bun:test";

import { filterCanvasNodesInViewport } from "./canvas-viewport";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

function node(index: number): CanvasNodeData {
    return {
        id: `node-${index}`,
        type: CanvasNodeType.Image,
        title: `Node ${index}`,
        position: { x: (index % 100) * 500, y: Math.floor(index / 100) * 500 },
        width: 320,
        height: 240,
    };
}

describe("canvas viewport virtualization", () => {
    test("keeps only visible and overscan nodes on a large canvas", () => {
        const nodes = Array.from({ length: 10_000 }, (_, index) => node(index));
        const visible = filterCanvasNodesInViewport(nodes, { x: -25_000, y: -12_500, k: 1 }, { width: 1440, height: 900 });

        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(40);
        expect(visible.every((item) => item.position.x >= 24_500 && item.position.x <= 27_000)).toBe(true);
    });

    test("accounts for zoom when calculating the world-space viewport", () => {
        const nodes = [node(0), node(1), node(2), node(3)];
        expect(filterCanvasNodesInViewport(nodes, { x: 0, y: 0, k: 2 }, { width: 400, height: 400 }, 0).map((item) => item.id)).toEqual(["node-0"]);
    });
});
