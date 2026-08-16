import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";

export type CanvasSyncSnapshot = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

export function hasCanvasContentChanged(previous: CanvasSyncSnapshot | null, next: CanvasSyncSnapshot) {
    return (
        previous?.nodes !== next.nodes ||
        previous.connections !== next.connections ||
        previous.chatSessions !== next.chatSessions ||
        previous.activeChatId !== next.activeChatId ||
        previous.backgroundMode !== next.backgroundMode ||
        previous.showImageInfo !== next.showImageInfo
    );
}

export function hasCanvasViewportChanged(previous: ViewportTransform | null, next: ViewportTransform) {
    return previous?.x !== next.x || previous.y !== next.y || previous.k !== next.k;
}
