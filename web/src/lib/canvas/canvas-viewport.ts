import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";

export function filterCanvasNodesInViewport(nodes: readonly CanvasNodeData[], viewport: ViewportTransform, viewportSize: { width: number; height: number }, padding = 280) {
    const safeScale = Math.max(viewport.k, 0.05);
    const viewLeft = -viewport.x / safeScale - padding;
    const viewTop = -viewport.y / safeScale - padding;
    const viewRight = viewLeft + viewportSize.width / safeScale + padding * 2;
    const viewBottom = viewTop + viewportSize.height / safeScale + padding * 2;

    return nodes.filter((node) => node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
}
