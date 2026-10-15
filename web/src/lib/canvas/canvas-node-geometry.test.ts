import { describe, expect, test } from "bun:test";

import { applyGroupSelection, applyUngroupSelection } from "./canvas-node-geometry";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const node = (id: string, type = CanvasNodeType.Text, groupId?: string): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 240, metadata: { groupId } });
const unrelated = node("unrelated-empty", CanvasNodeType.Group);
const unrelatedEdge = { id: "unrelated-edge", fromNodeId: "unrelated-empty", toNodeId: "target" };

describe("canvas grouping preserves unrelated content", () => {
    test("grouping selected nodes retains unrelated empty groups and their connections", () => {
        const grouped = applyGroupSelection(new Set(["a", "b"]), [unrelated, node("a"), node("b"), node("target")], [unrelatedEdge], node("new-group", CanvasNodeType.Group));
        expect(grouped?.nodes.map((node) => node.id)).toContain("unrelated-empty");
        expect(grouped?.connections).toContainEqual(unrelatedEdge);
    });

    test("ungrouping only removes the selected group", () => {
        const ungrouped = applyUngroupSelection(new Set(["selected-group"]), [unrelated, node("selected-group", CanvasNodeType.Group), node("a", CanvasNodeType.Text, "selected-group"), node("target")], [unrelatedEdge]);
        expect(ungrouped?.nodes.map((node) => node.id)).toEqual(["unrelated-empty", "a", "target"]);
        expect(ungrouped?.connections).toContainEqual(unrelatedEdge);
    });

    test("still removes an original group emptied by moving its selected members", () => {
        const grouped = applyGroupSelection(new Set(["a", "b"]), [unrelated, node("old", CanvasNodeType.Group), node("a", CanvasNodeType.Text, "old"), node("b"), node("target")], [unrelatedEdge], node("new", CanvasNodeType.Group));
        expect(grouped?.nodes.map((node) => node.id)).not.toContain("old");
        expect(grouped?.nodes.map((node) => node.id)).toContain("unrelated-empty");
    });
});
