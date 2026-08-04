import type { AiConfig } from "@/stores/use-config-store";

const CONSERVATIVE_VIDEO_PARAMETERS = ["duration", "size", "resolution"];

export function buildVideoCapabilityParameters(config: AiConfig, supportedParameters?: string[]) {
    const supported = new Set(supportedParameters?.length ? supportedParameters : CONSERVATIVE_VIDEO_PARAMETERS);
    const parameters: Record<string, unknown> = { count: 1 };

    if (supported.has("duration")) parameters.duration = Number(config.videoSeconds) || 6;
    if (supported.has("size")) parameters.size = config.size;
    if (supported.has("resolution")) parameters.resolution = config.vquality;
    if (supported.has("fps")) parameters.fps = Number(config.videoFps) || 30;
    if (supported.has("generate_audio")) parameters.generate_audio = config.videoGenerateAudio === "true";
    if (supported.has("watermark")) parameters.watermark = config.videoWatermark === "true";
    if (supported.has("camera_fixed")) parameters.camera_fixed = config.videoCameraFixed === "true";

    return parameters;
}

export function isVideoParameterSupported(name: string, supportedParameters?: string[]) {
    return (supportedParameters?.length ? supportedParameters : CONSERVATIVE_VIDEO_PARAMETERS).includes(name);
}

export function unsupportedVideoControls(supportedParameters?: string[]) {
    const supported = new Set(supportedParameters?.length ? supportedParameters : CONSERVATIVE_VIDEO_PARAMETERS);
    return [
        ["size", "比例 / 尺寸"],
        ["resolution", "分辨率"],
        ["duration", "时长"],
        ["fps", "帧率"],
        ["generate_audio", "声音"],
        ["watermark", "水印"],
        ["camera_fixed", "镜头固定"],
    ].filter(([key]) => !supported.has(key)).map(([, label]) => label);
}
