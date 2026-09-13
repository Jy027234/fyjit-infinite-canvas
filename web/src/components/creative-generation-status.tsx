import { Tag } from "antd";
import { LoaderCircle } from "lucide-react";

import { FyjitTaskStatus } from "@/components/fyjit/creative-ui";
import { formatDuration } from "@/lib/image-utils";

export type CreativeGenerationPhase = "preparing" | "queued" | "running";

export type CreativePendingSnapshot = {
    phase?: CreativeGenerationPhase;
    progress?: number;
};

const phaseCopy: Record<CreativeGenerationPhase, { label: string; description: string }> = {
    preparing: { label: "准备素材", description: "正在上传并核对参考素材，完成后会立即创建任务。" },
    queued: { label: "排队中", description: "任务已被 FYJIT 接受，正在等待可用算力。" },
    running: { label: "生成中", description: "服务端正在生成内容；关闭页面后仍可从历史记录恢复。" },
};

export function creativeJobPendingSnapshot(status?: string, progress?: number): CreativePendingSnapshot {
    const phase: CreativeGenerationPhase = status === "QUEUED" || status === "PENDING" ? "queued" : "running";
    return { phase, progress: normalizeProgress(progress) };
}

export function summarizeCreativePendingResults(results: Array<{ status: string; phase?: CreativeGenerationPhase; progress?: number }>): CreativePendingSnapshot | null {
    const pending = results.filter((result) => result.status === "pending");
    if (!pending.length) return null;
    const phase = pending.some((result) => result.phase === "running") ? "running" : pending.some((result) => result.phase === "queued") ? "queued" : "preparing";
    const reported = pending.map((result) => normalizeProgress(result.progress)).filter((progress): progress is number => progress !== undefined);
    return { phase, progress: reported.length ? Math.round(reported.reduce((total, progress) => total + progress, 0) / reported.length) : undefined };
}

export function CreativeGenerationStatus({ phase = "preparing", progress, elapsedMs, variant = "badge", className }: CreativePendingSnapshot & { elapsedMs?: number; variant?: "badge" | "panel"; className?: string }) {
    const copy = phaseCopy[phase];
    const progressLabel = progress === undefined ? "" : ` · ${progress}%`;
    const elapsedLabel = elapsedMs === undefined ? "" : ` · ${formatDuration(elapsedMs)}`;

    if (variant === "badge") {
        return (
            <Tag className="m-0 inline-flex items-center gap-1 px-2 py-1" role="status">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                {copy.label}
                {progressLabel}
                {elapsedLabel}
            </Tag>
        );
    }

    return (
        <FyjitTaskStatus
            tone="pending"
            title={copy.label}
            description={
                <div className="w-full space-y-3">
                    <p>{copy.description}</p>
                    {progress !== undefined ? (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span>{elapsedMs === undefined ? "服务端进度" : formatDuration(elapsedMs)}</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                                <div className="h-full rounded-full bg-primary transition-[width] duration-[var(--fyjit-motion-normal)]" style={{ width: `${Math.max(2, progress)}%` }} />
                            </div>
                        </div>
                    ) : null}
                </div>
            }
            className={className}
        />
    );
}

function normalizeProgress(progress?: number) {
    return typeof progress === "number" && Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : undefined;
}
