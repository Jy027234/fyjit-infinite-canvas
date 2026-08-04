import { Alert, Tag } from "antd";

import type { CreativeEstimate, CreativeModelCapabilityProfile } from "@/services/api/creative";

type CreativeEstimateSummaryProps = {
    estimate: CreativeEstimate | null;
    loading: boolean;
    error?: string;
    requestedParameters: Record<string, unknown>;
    referenceCounts: { images: number; videos?: number; audio?: number };
    tokenLabel: string;
    profile?: CreativeModelCapabilityProfile;
};

const PARAMETER_LABELS: Record<string, string> = {
    background: "背景",
    count: "数量",
    duration: "时长",
    generate_audio: "声音",
    quality: "质量",
    resolution: "清晰度",
    size: "尺寸",
    watermark: "水印",
};

function formatParameter(key: string, value: unknown) {
    const label = PARAMETER_LABELS[key] || key;
    if (key === "duration" && typeof value === "number") return `${label} ${value} 秒`;
    if (typeof value === "boolean") return `${label} ${value ? "开" : "关"}`;
    return `${label} ${String(value)}`;
}

function formatPrice(estimate: CreativeEstimate) {
    if (estimate.billing_mode === "fixed" && typeof estimate.estimated_usd === "number") {
        const quota = typeof estimate.estimated_quota === "number" ? ` · ${estimate.estimated_quota.toLocaleString()} 配额` : "";
        return `预计 $${estimate.estimated_usd.toFixed(4)}${quota}`;
    }
    return estimate.message;
}

function changedParameters(requested: Record<string, unknown>, normalized: Record<string, unknown>) {
    const changed = Object.entries(normalized)
        .filter(([key, value]) => key in requested && JSON.stringify(requested[key]) !== JSON.stringify(value))
        .map(([key, value]) => formatParameter(key, value));
    for (const key of Object.keys(requested)) {
        if (!(key in normalized)) changed.push(`${PARAMETER_LABELS[key] || key} 已忽略`);
    }
    return changed;
}

export function CreativeEstimateSummary({ estimate, loading, error, requestedParameters, referenceCounts, tokenLabel, profile }: CreativeEstimateSummaryProps) {
    if (error) return <Alert type="warning" showIcon message="提交前校验未通过" description={error} />;
    if (!estimate) {
        return (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400" aria-live="polite">
                {loading ? "正在核对费用、参数与模型能力…" : "选择可用模型后将显示服务端费用与能力校验"}
            </div>
        );
    }

    const normalized = Object.entries(estimate.normalized_parameters).map(([key, value]) => formatParameter(key, value));
    const changed = changedParameters(requestedParameters, estimate.normalized_parameters);
    const duration = estimate.limitations.duration_seconds as { min?: number; max?: number } | undefined;
    const referenceSummary = [
        `图片 ${referenceCounts.images} / ${profile?.max_reference_images ?? "—"}`,
        referenceCounts.videos !== undefined ? `视频 ${referenceCounts.videos} / ${profile?.max_reference_videos ?? "—"}` : "",
        referenceCounts.audio !== undefined ? `音频 ${referenceCounts.audio} / ${profile?.max_reference_audio ?? "—"}` : "",
    ].filter(Boolean).join(" · ");
    const referenceOverflow = Boolean(profile && (referenceCounts.images > profile.max_reference_images || (referenceCounts.videos || 0) > profile.max_reference_videos || (referenceCounts.audio || 0) > profile.max_reference_audio));

    return (
        <div className="space-y-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300" aria-live="polite">
            <div className="flex flex-wrap items-center gap-1.5">
                <Tag color={estimate.billing_mode === "fixed" ? "green" : "blue"} className="m-0">服务端已校验</Tag>
                <Tag color={profile?.verified ? "cyan" : "gold"} className="m-0">{profile?.verified ? "能力已验证" : "保守能力"}</Tag>
                <span className="font-medium text-stone-800 dark:text-stone-100">{formatPrice(estimate)}</span>
                {loading ? <span className="text-stone-400">更新中…</span> : null}
            </div>
            <div>实际参数：{normalized.join(" · ")}</div>
            <div>Token：{tokenLabel}</div>
            <div>
                参考素材：{referenceSummary}
                {duration?.min !== undefined && duration.max !== undefined ? ` · 时长限制 ${duration.min}–${duration.max} 秒` : ""}
            </div>
            {referenceOverflow ? <div className="text-red-600 dark:text-red-400">参考素材超过当前模型的服务端上限，请先移除不支持的素材。</div> : null}
            {changed.length ? <div className="text-amber-700 dark:text-amber-400">参数已按服务端能力归一化：{changed.join(" · ")}</div> : null}
            {profile?.risk_notices?.map((notice) => <div key={notice} className="text-amber-700 dark:text-amber-400">风险提示：{notice}</div>)}
            <div className="text-stone-500 dark:text-stone-400">{estimate.message}；最终请求与消费以 FYJIT Job 和使用记录为准。</div>
        </div>
    );
}
