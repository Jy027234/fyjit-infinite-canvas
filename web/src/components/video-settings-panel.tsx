import { type ReactNode } from "react";
import { Switch } from "antd";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { boolConfig, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceDurationOptions, seedancePixelLabel, seedanceRatioOptions, seedanceResolutionOptions } from "@/lib/seedance-video";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { isVideoParameterSupported, unsupportedVideoControls } from "@/lib/video-capability-parameters";
import { type CreativeModelCapabilityProfile } from "@/services/api/creative";
import { type AiConfig } from "@/stores/use-config-store";

const resolutionOptions = [
    { value: "720", label: "720p" },
    { value: "480", label: "480p" },
];

const sizeOptions = [
    { value: "1280x720", label: "横屏", width: 1280, height: 720 },
    { value: "720x1280", label: "竖屏", width: 720, height: 1280 },
    { value: "1024x1024", label: "方形", width: 1024, height: 1024 },
    { value: "1792x1024", label: "宽屏", width: 1792, height: 1024 },
    { value: "1024x1792", label: "长图", width: 1024, height: 1792 },
    { value: "auto", label: "auto", width: 0, height: 0 },
];

const secondOptions = [6, 10, 12, 16, 20];

export const videoResolutionOptions = resolutionOptions.map((item) => ({ value: item.value, label: item.label }));
export const videoSizeOptions = sizeOptions.map((item) => ({ value: item.value, label: item.label }));
export const videoSecondOptions = secondOptions.map((value) => String(value));

type VideoSettingsPanelProps = {
    config: AiConfig;
    supportedParameters?: string[];
    profile?: CreativeModelCapabilityProfile;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoFps" | "videoGenerateAudio" | "videoWatermark" | "videoCameraFixed", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function VideoSettingsPanel({ config, supportedParameters, profile, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: VideoSettingsPanelProps) {
    if (isSeedanceVideoConfig(config)) {
        return <SeedanceVideoSettingsPanel config={config} supportedParameters={supportedParameters} onConfigChange={onConfigChange} theme={theme} showTitle={showTitle} className={className} />;
    }

    const seconds = config.videoSeconds || "6";
    const ratios = profile?.parameter_options?.ratio || [];
    const size = ratios.includes(config.size) ? config.size : normalizeVideoSizeValue(config.size);
    const dimensions = readSizeDimensions(size);
    const resolution = normalizeVideoResolutionValue(config.vquality);
    const fps = config.videoFps || "30";
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);
    const cameraFixed = boolConfig(config.videoCameraFixed, false);
    const supports = (name: string) => isVideoParameterSupported(name, supportedParameters);
    const fixedControls = unsupportedVideoControls(supportedParameters);
    const profileResolutions = profile?.parameter_options?.resolution;
    const availableResolutions = profileResolutions?.length ? profileResolutions.map((value) => ({ value: normalizeVideoResolutionValue(value), label: `${normalizeVideoResolutionValue(value)}p` })) : resolutionOptions;
    const inheritsSourceRatio = Boolean(profile?.input_modes.includes("image_to_video"));
    const availableSeconds = videoDurationOptions(profile?.video_duration);
    const durationMin = profile?.video_duration?.min || 1;
    const durationMax = profile?.video_duration?.max || 20;
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.floor(value || dimensions[key] || 720));
        onConfigChange("size", `${key === "width" ? next : dimensions.width}x${key === "height" ? next : dimensions.height}`);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {supports("resolution") ? <SettingGroup title="清晰度" color={theme.node.muted}>
                    <div className="grid grid-cols-2 gap-2.5">
                        {availableResolutions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                        {!profileResolutions?.length ? <ResolutionInput value={resolution} theme={theme} onChange={(value) => onConfigChange("vquality", value)} /> : null}
                    </div>
                </SettingGroup> : null}
                {supports("size") ? <SettingGroup title="比例 / 尺寸" color={theme.node.muted}>
                    {ratios.length ? null : <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                        <DimensionInput prefix="W" value={dimensions.width} disabled={size === "auto"} theme={theme} onChange={(value) => updateDimension("width", value)} />
                        <span className="text-lg opacity-45">↔</span>
                        <DimensionInput prefix="H" value={dimensions.height} disabled={size === "auto"} theme={theme} onChange={(value) => updateDimension("height", value)} />
                    </div>}
                    <div className="grid grid-cols-3 gap-2.5">
                        {(ratios.length ? ratios.map((value) => ({ value, label: value, width: ratioPreview(value).width, height: ratioPreview(value).height })) : sizeOptions).map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[78px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent text-sm transition hover:opacity-80"
                                style={{ borderColor: size === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={item.width} height={item.height} color={theme.node.text} />
                                <span>{item.label}</span>
                                {ratios.length || item.value === "auto" ? null : (
                                    <span className="text-[11px] leading-none opacity-55">
                                        {item.value}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </SettingGroup> : null}
                {inheritsSourceRatio ? <div className="rounded-xl border border-dashed px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>画面比例自动继承首帧图片，无需手动设置宽高。</div> : null}
                {supports("duration") ? <SettingGroup title="秒数" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {availableSeconds.map((value) => (
                            <OptionPill key={value} selected={seconds === String(value)} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value}s
                            </OptionPill>
                        ))}
                    </div>
                    <NumberInput label="视频时长" value={seconds} min={durationMin} max={durationMax} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                </SettingGroup> : null}
                {supports("fps") ? <SettingGroup title="帧率" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {[24, 30, 60].map((value) => (
                            <OptionPill key={value} selected={fps === String(value)} theme={theme} onClick={() => onConfigChange("videoFps", String(value))}>
                                {value} FPS
                            </OptionPill>
                        ))}
                        <NumberInput label="视频帧率" value={fps} min={1} max={120} theme={theme} onChange={(value) => onConfigChange("videoFps", value)} />
                    </div>
                </SettingGroup> : null}
                {supports("generate_audio") || supports("watermark") || supports("camera_fixed") ? <SettingGroup title="输出与镜头" color={theme.node.muted}>
                    <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                        {supports("generate_audio") ? <SwitchRow label="生成声音" checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} /> : null}
                        {supports("watermark") ? <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} /> : null}
                        {supports("camera_fixed") ? <SwitchRow label="镜头固定" checked={cameraFixed} theme={theme} onChange={(checked) => onConfigChange("videoCameraFixed", String(checked))} /> : null}
                    </div>
                </SettingGroup> : null}
                <FixedControlsNotice controls={fixedControls} color={theme.node.muted} />
                <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>最终输出：{resolution}p · {inheritsSourceRatio ? "比例继承首帧" : videoSizeLabel(size)} · {seconds} 秒</div>
            </div>
        </ImageSettingsTheme>
    );
}

function videoDurationOptions(profile?: CreativeModelCapabilityProfile["video_duration"]) {
    if (profile?.allowed?.length) return profile.allowed;
    if (!profile) return secondOptions;
    return Array.from(new Set([profile.min, profile.default, Math.min(profile.max, profile.min + 3), Math.min(profile.max, profile.min + 7), profile.max])).filter((value) => value >= profile.min && value <= profile.max).sort((a, b) => a - b);
}

function SeedanceVideoSettingsPanel({ config, supportedParameters, onConfigChange, theme, showTitle, className }: VideoSettingsPanelProps) {
    const resolution = normalizeSeedanceResolution(config.vquality);
    const ratio = normalizeSeedanceRatio(config.size);
    const duration = normalizeSeedanceDuration(config.videoSeconds);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);
    const cameraFixed = boolConfig(config.videoCameraFixed, false);
    const fps = config.videoFps || "30";
    const supports = (name: string) => isVideoParameterSupported(name, supportedParameters);
    const fixedControls = unsupportedVideoControls(supportedParameters);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {supports("resolution") ? <SettingGroup title="分辨率" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {seedanceResolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup> : null}
                {supports("size") ? <SettingGroup title="比例" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {seedanceRatioOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[68px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 text-sm transition hover:opacity-80"
                                style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={ratioPreview(item.value).width} height={ratioPreview(item.value).height} color={theme.node.text} />
                                <span>{item.label}</span>
                                <span className="text-[10px] leading-none opacity-55">{item.value === "adaptive" ? "adaptive" : seedancePixelLabel(resolution, item.value)}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup> : null}
                {supports("duration") ? <SettingGroup title="时长" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {seedanceDurationOptions.map((value) => (
                            <OptionPill key={value} selected={duration === value} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value === -1 ? "智能" : `${value}s`}
                            </OptionPill>
                        ))}
                    </div>
                    <NumberInput label="视频时长" value={String(duration)} min={-1} max={15} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                </SettingGroup> : null}
                {supports("fps") ? <SettingGroup title="帧率" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {[24, 30, 60].map((value) => <OptionPill key={value} selected={fps === String(value)} theme={theme} onClick={() => onConfigChange("videoFps", String(value))}>{value} FPS</OptionPill>)}
                        <NumberInput label="视频帧率" value={fps} min={1} max={120} theme={theme} onChange={(value) => onConfigChange("videoFps", value)} />
                    </div>
                </SettingGroup> : null}
                {supports("generate_audio") || supports("watermark") || supports("camera_fixed") ? <SettingGroup title="输出与镜头" color={theme.node.muted}>
                    <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                        {supports("generate_audio") ? <SwitchRow label="生成声音" checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} /> : null}
                        {supports("watermark") ? <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} /> : null}
                        {supports("camera_fixed") ? <SwitchRow label="镜头固定" checked={cameraFixed} theme={theme} onChange={(checked) => onConfigChange("videoCameraFixed", String(checked))} /> : null}
                    </div>
                </SettingGroup> : null}
                <FixedControlsNotice controls={fixedControls} color={theme.node.muted} />
            </div>
        </ImageSettingsTheme>
    );
}

export function videoResolutionLabel(value: string) {
    return `${normalizeVideoResolutionValue(value)}p`;
}

export function videoSizeLabel(value: string) {
    const ratio = normalizeSeedanceRatio(value);
    if (value === "adaptive" || value === "auto") return "自适应";
    if (ratio === value) return seedanceRatioOptions.find((item) => item.value === ratio)?.label || ratio;
    const size = normalizeVideoSizeValue(value);
    return sizeOptions.find((item) => item.value === size)?.label || size;
}

export function videoSecondsLabel(value: string) {
    if (String(value).trim() === "-1") return "智能";
    return `${value || "6"}s`;
}

export function normalizeVideoSizeValue(value: string) {
    if (value === "auto") return "auto";
    if (/^\d+x\d+$/.test(value || "")) return value;
    return ["9:16", "2:3", "3:4"].includes(value) ? "720x1280" : "1280x720";
}

export function normalizeVideoResolutionValue(value: string) {
    if (value === "480p" || value === "low") return "480";
    if (value === "720p" || value === "auto" || value === "high" || value === "medium") return "720";
    return value.replace(/p$/i, "") || "720";
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function ResolutionInput({ value, theme, onChange }: { value: string; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input aria-label="视频分辨率" type="number" min={1} className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />
            <span className="grid w-7 place-items-center pr-1" style={{ color: theme.node.muted }}>
                p
            </span>
        </label>
    );
}

function DimensionInput({ prefix, value, disabled, theme, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input aria-label={prefix === "W" ? "视频宽度" : "视频高度"} type="number" min={1} disabled={disabled} className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value || ""} onChange={(event) => onChange(Number(event.target.value) || null)} onMouseDown={(event) => event.stopPropagation()} />
        </label>
    );
}

function NumberInput({ label, value, min, max, theme, onChange }: { label: string; value: string; min: number; max: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    return <input aria-label={label} type="number" min={min} max={max} className="h-9 rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }} value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />;
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(10, Math.round((width / longSide) * 26));
    const previewHeight = Math.max(10, Math.round((height / longSide) * 26));
    return <span className="rounded-[3px] border-2" style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function ratioPreview(ratio: string) {
    if (ratio === "9:16") return { width: 9, height: 16 };
    if (ratio === "1:1") return { width: 1, height: 1 };
    if (ratio === "4:3") return { width: 4, height: 3 };
    if (ratio === "3:4") return { width: 3, height: 4 };
    if (ratio === "21:9") return { width: 21, height: 9 };
    if (ratio === "adaptive") return { width: 0, height: 0 };
    return { width: 16, height: 9 };
}

function SwitchRow({ label, checked, theme, onChange }: { label: string; checked: boolean; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.node.text }}>
                {label}
            </span>
            <span onMouseDown={(event) => event.stopPropagation()}>
                <Switch aria-label={label} size="small" checked={checked} onChange={onChange} />
            </span>
        </div>
    );
}

function FixedControlsNotice({ controls, color }: { controls: string[]; color: string }) {
    if (!controls.length) return null;
    return <div className="rounded-xl border border-dashed px-3 py-2 text-xs leading-5" style={{ color }}>当前模型固定或未开放：{controls.join("、")}</div>;
}

function readSizeDimensions(size: string) {
    if (size === "auto") return { width: 0, height: 0 };
    const match = size.match(/^(\d+)x(\d+)$/);
    return { width: Number(match?.[1]) || 1280, height: Number(match?.[2]) || 720 };
}
