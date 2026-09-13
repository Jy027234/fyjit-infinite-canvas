import { lazy, Suspense, useEffect, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";
import { useSearchParams } from "react-router-dom";

import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_AGENT_PANEL_MOTION_MS, useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;
type LocalAgentPanelProps = { embedded?: boolean; headless?: boolean; autoConnect?: boolean };
type LocalAgentPanelModule = { default: ComponentType<LocalAgentPanelProps> };

let localAgentPanelPromise: Promise<LocalAgentPanelModule> | null = null;

function loadLocalAgentPanel() {
    return (localAgentPanelPromise ??= import("./local-agent-panel").then(({ LocalAgentPanel }) => ({ default: LocalAgentPanel })));
}

const DeferredLocalAgentPanel = lazy(loadLocalAgentPanel);

/** 在用户明确准备打开面板时提前请求重模块，避免点击后才开始下载。 */
export function preloadAgentPanel() {
    void loadLocalAgentPanel();
}

function AgentPanelFallback({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="flex h-full min-w-0 flex-1 flex-col gap-4 p-4" role="status" aria-label="正在加载 Agent 面板" aria-busy="true">
            <div className="flex items-center gap-3">
                <span className="size-8 shrink-0 animate-pulse rounded-lg" style={{ background: theme.toolbar.activeBg }} />
                <span className="h-4 w-24 animate-pulse rounded" style={{ background: theme.toolbar.activeBg }} />
            </div>
            <div className="space-y-2">
                <span className="block h-3 w-4/5 animate-pulse rounded" style={{ background: theme.toolbar.activeBg }} />
                <span className="block h-3 w-3/5 animate-pulse rounded" style={{ background: theme.toolbar.activeBg }} />
            </div>
            <div className="mt-auto h-10 w-full animate-pulse rounded-lg" style={{ background: theme.toolbar.activeBg }} />
        </div>
    );
}

export function AgentPanel() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [searchParams] = useSearchParams();
    const width = useAgentStore((state) => state.width);
    const [resizing, setResizing] = useState(false);
    const panelMounted = useAgentStore((state) => state.panelMounted);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX));
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem("canvas-agent-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    // Canvas Agent URL 启动路径可能保持面板收起，但仍需要挂载连接逻辑来完成自动连接。
    const autoConnectRequested = searchParams.has("agentUrl") && searchParams.has("agentToken");
    useEffect(() => {
        if (autoConnectRequested && !panelMounted) setAgentState({ panelMounted: true });
    }, [autoConnectRequested, panelMounted, setAgentState]);
    if (!panelMounted && !autoConnectRequested) return null;

    return (
        <motion.div
            className="relative z-[70] flex h-full shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: panelOpen && !panelClosing ? undefined : "none" }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col border-l"
                data-canvas-shortcuts-ignore
                initial={{ x: 48 }}
                animate={{ x: panelClosing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label="调整右侧面板宽度" />
                <Suspense fallback={<AgentPanelFallback theme={theme} />}>
                    <DeferredLocalAgentPanel embedded />
                </Suspense>
            </motion.aside>
        </motion.div>
    );
}
