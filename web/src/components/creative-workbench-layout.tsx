import type { ReactNode } from "react";
import { Button } from "antd";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, SlidersHorizontal } from "lucide-react";

import { FyjitSurface } from "@/components/fyjit/creative-ui";
import { cn } from "@/lib/utils";

export function CreativeWorkbenchRoot({ children }: { children: ReactNode }) {
    return <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">{children}</div>;
}

export function CreativeWorkbenchMain({ historyCollapsed, children }: { historyCollapsed: boolean; children: ReactNode }) {
    return (
        <main className={cn("grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden", historyCollapsed ? "lg:grid-cols-[48px_minmax(0,1fr)]" : "lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]")}>
            {children}
        </main>
    );
}

export function CreativeWorkbenchHistoryRail({ collapsed, onCollapsedChange, children }: { collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void; children: ReactNode }) {
    return (
        <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-[var(--fyjit-shadow-sm)] lg:block">
            {collapsed ? (
                <button
                    type="button"
                    className="flex size-full min-h-32 flex-col items-center gap-2 rounded-lg py-2 text-xs text-muted-foreground transition-colors duration-[var(--fyjit-motion-fast)] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onCollapsedChange(false)}
                    aria-label="展开生成记录"
                    title="展开生成记录"
                >
                    <ChevronRight className="size-4" aria-hidden="true" />
                    <History className="size-4" aria-hidden="true" />
                    <span className="[writing-mode:vertical-rl]">生成记录</span>
                </button>
            ) : (
                <>
                    <div className="mb-2 flex justify-end">
                        <Button size="small" type="text" icon={<ChevronLeft className="size-4" />} onClick={() => onCollapsedChange(true)} aria-label="折叠生成记录">
                            折叠
                        </Button>
                    </div>
                    {children}
                </>
            )}
        </aside>
    );
}

export function CreativeWorkbenchContent({ children }: { children: ReactNode }) {
    return <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">{children}</section>;
}

export function CreativeWorkbenchComposer({ children }: { children: ReactNode }) {
    return <FyjitSurface className="thin-scrollbar flex flex-col p-4 lg:min-h-0 lg:overflow-y-auto">{children}</FyjitSurface>;
}

export function CreativeWorkbenchHeader({ title, onOpenHistory, onOpenParameters }: { title: string; onOpenHistory: () => void; onOpenParameters: () => void }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <div className="flex shrink-0 gap-2 lg:hidden">
                <Button icon={<History className="size-4" />} onClick={onOpenHistory}>
                    记录
                </Button>
                <Button icon={<SlidersHorizontal className="size-4" />} onClick={onOpenParameters}>
                    参数
                </Button>
            </div>
        </div>
    );
}

export function CreativeFieldHeader({ label, actions }: { label: string; actions?: ReactNode }) {
    return (
        <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-base font-semibold text-foreground">{label}</span>
            {actions}
        </div>
    );
}

export function CreativeParametersSection({ collapsed, onCollapsedChange, summary, children }: { collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void; summary: ReactNode; children: ReactNode }) {
    return (
        <>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/55 px-3 py-2 text-sm sm:hidden">
                <span className="truncate text-muted-foreground">{summary}</span>
                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => onCollapsedChange(false)}>
                    调整
                </Button>
            </div>

            <div className="hidden sm:block">
                <CreativeFieldHeader
                    label="模型与参数"
                    actions={
                        <Button size="small" type="text" icon={collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />} onClick={() => onCollapsedChange(!collapsed)} aria-expanded={!collapsed}>
                            {collapsed ? "展开" : "折叠"}
                        </Button>
                    }
                />
                {!collapsed ? (
                    children
                ) : (
                    <button
                        type="button"
                        className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors duration-[var(--fyjit-motion-fast)] hover:border-foreground/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onCollapsedChange(false)}
                    >
                        参数栏已折叠；点击恢复当前模型设置
                    </button>
                )}
            </div>
        </>
    );
}

export function CreativeSubmitDock({ summary, primaryAction, secondaryAction }: { summary: ReactNode; primaryAction: ReactNode; secondaryAction?: ReactNode }) {
    return (
        <div className="sticky bottom-0 z-20 mt-auto space-y-3 border-t border-border/70 bg-card/95 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:static sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pt-6 sm:backdrop-blur-none">
            {summary}
            {primaryAction}
            {secondaryAction}
        </div>
    );
}

export function CreativeWorkbenchResult({ title = "生成结果", status, children }: { title?: string; status?: ReactNode; children: ReactNode }) {
    return (
        <FyjitSurface className="thin-scrollbar p-4 lg:min-h-0 lg:overflow-y-auto lg:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{title}</h2>
                {status}
            </div>
            {children}
        </FyjitSurface>
    );
}

export function CreativeDraftNotice({ tone, children, action }: { tone: "preview" | "undo"; children: ReactNode; action: ReactNode }) {
    return (
        <div
            role="status"
            className={cn(
                "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                tone === "preview"
                    ? "border-[color-mix(in_oklch,var(--fyjit-color-primary)_28%,var(--fyjit-color-border))] bg-accent text-foreground"
                    : "border-[color-mix(in_oklch,var(--fyjit-color-warning)_35%,var(--fyjit-color-border))] bg-[color-mix(in_oklch,var(--fyjit-color-warning)_10%,var(--fyjit-color-card))] text-foreground",
            )}
        >
            <span>{children}</span>
            {action}
        </div>
    );
}
