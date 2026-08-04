import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import {
    createCreativeJob,
    estimateCreativeJob,
    fetchCreativeAsset,
    uploadCreativeAsset,
    waitForCreativeJob,
} from "@/services/api/creative";

type RequestOptions = { signal?: AbortSignal; onAssetId?: (assetId: string) => void };
type CreativeImageResult = { id: string; dataUrl: string };
type CreativeVideoResult = { assetId?: string; url?: string; mimeType?: string; width?: number; height?: number; bytes?: number; durationMs?: number };
type CreativeUploadedMedia = { assetId?: string; url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };
export type AiTextMessage = { role: "system" | "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

export async function requestCreativeGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<CreativeImageResult[]> {
    return runImageJob(config, prompt, [], options);
}

export async function requestCreativeEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, options?: RequestOptions): Promise<CreativeImageResult[]> {
    return runImageJob(config, prompt, [...references, ...(mask ? [mask] : [])], options);
}

async function runImageJob(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    const model = selectedModel(config, "image");
    const referenceAssetIds = await uploadReferences(references.map((item) => ({ assetId: item.assetId, name: item.name, url: item.dataUrl })), options?.signal);
    const parameters = { count: Math.max(1, Math.min(10, Number(config.count) || 1)), size: config.size, quality: config.quality, background: config.background };
    await estimateCreativeJob({ capability: "image_generation", model, group: "auto", token: { strategy: "auto" }, parameters }, options?.signal);
    const job = await createCreativeJob({ capability: "image_generation", model, group: "auto", token: { strategy: "auto" }, prompt, parameters, reference_asset_ids: referenceAssetIds, idempotency_key: crypto.randomUUID() }, options?.signal);
    const completed = await waitForCreativeJob(job.job_id, { signal: options?.signal });
    if (completed.status !== "SUCCEEDED" && completed.status !== "PARTIAL_SUCCESS") throw new Error(completed.error || "画布生图任务失败");
    const assets = await Promise.all(completed.result_asset_ids.map((assetId) => fetchCreativeAsset(assetId, options?.signal)));
    return assets.map((asset) => ({ id: asset.asset_id, dataUrl: asset.preview_path || assetContentUrl(asset.asset_id) }));
}

export async function requestCreativeVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<CreativeVideoResult> {
    const model = selectedModel(config, "video");
    const referenceAssetIds = await uploadReferences([
        ...references.map((item) => ({ assetId: item.assetId, name: item.name, url: item.dataUrl })),
        ...videoReferences.map((item) => ({ assetId: item.assetId, name: item.name, url: item.url })),
        ...audioReferences.map((item) => ({ assetId: item.assetId, name: item.name, url: item.url })),
    ], options?.signal);
    const parameters = { count: 1, duration: Number(config.videoSeconds) || 6, size: config.size, resolution: config.vquality, generate_audio: config.videoGenerateAudio !== "false", watermark: config.videoWatermark === "true" };
    await estimateCreativeJob({ capability: "video_generation", model, group: "auto", token: { strategy: "auto" }, parameters }, options?.signal);
    const job = await createCreativeJob({ capability: "video_generation", model, group: "auto", token: { strategy: "auto" }, prompt, parameters, reference_asset_ids: referenceAssetIds, idempotency_key: crypto.randomUUID() }, options?.signal);
    const completed = await waitForCreativeJob(job.job_id, { signal: options?.signal, intervalMs: 2500 });
    if (completed.status !== "SUCCEEDED") throw new Error(completed.error || "画布视频任务失败");
    const assetId = completed.result_asset_ids[0];
    if (!assetId) throw new Error("画布视频任务没有返回素材");
    const asset = await fetchCreativeAsset(assetId, options?.signal);
    return { assetId: asset.asset_id, url: asset.preview_path || assetContentUrl(asset.asset_id), mimeType: asset.mime_type || "video/mp4", width: asset.width, height: asset.height, bytes: asset.size_bytes, durationMs: asset.duration ? asset.duration * 1000 : undefined };
}

export async function storeCreativeGeneratedVideo(result: CreativeVideoResult): Promise<CreativeUploadedMedia> {
    if (!result.url) throw new Error("视频任务没有返回可播放地址");
    return { assetId: result.assetId, url: result.url, storageKey: "", bytes: result.bytes || 0, mimeType: result.mimeType || "video/mp4", width: result.width, height: result.height, durationMs: result.durationMs };
}

export async function requestCreativeText(config: AiConfig, messages: AiTextMessage[], onDelta?: (delta: string) => void, options?: RequestOptions, references: ReferenceImage[] = []) {
    const model = selectedModel(config, "text");
    const textContent = (content: AiTextMessage["content"]) => typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    const messageReferences = messages.flatMap((item) => typeof item.content === "string" ? [] : item.content.filter((part) => part.type === "image_url").map((part, index) => ({ name: `canvas-reference-${index + 1}.png`, url: part.image_url.url })));
    const system = messages.filter((item) => item.role === "system").map((item) => textContent(item.content)).join("\n\n");
    const prompt = messages.filter((item) => item.role !== "system").map((item) => `${item.role}: ${textContent(item.content)}`).join("\n\n");
    const referenceAssetIds = await uploadReferences([...references.map((item) => ({ assetId: item.assetId, name: item.name, url: item.dataUrl })), ...messageReferences], options?.signal);
    const parameters = { count: 1, max_tokens: 4096, ...(system ? { system_prompt: system } : {}) };
    await estimateCreativeJob({ capability: "text_generation", model, group: "auto", token: { strategy: "auto" }, parameters }, options?.signal);
    const job = await createCreativeJob({ capability: "text_generation", model, group: "auto", token: { strategy: "auto" }, prompt, parameters, reference_asset_ids: referenceAssetIds, idempotency_key: crypto.randomUUID() }, options?.signal);
    const completed = await waitForCreativeJob(job.job_id, { signal: options?.signal });
    if (completed.status !== "SUCCEEDED") throw new Error(completed.error || "画布文本任务失败");
    const assetId = completed.result_asset_ids[0];
    if (!assetId) throw new Error("画布文本任务没有返回内容");
    const asset = await fetchCreativeAsset(assetId, options?.signal);
    options?.onAssetId?.(asset.asset_id);
    onDelta?.(asset.content || "");
    return asset.content || "";
}

export async function requestCreativeAudioGeneration(_config?: AiConfig, _prompt?: string, _options?: RequestOptions): Promise<Blob> {
    throw new Error("当前 FYJIT 能力注册表尚未开放音频生成，画布不会回退到浏览器直连");
}

export async function storeCreativeGeneratedAudio(_blob?: Blob, _format?: string): Promise<never> {
    throw new Error("当前 FYJIT 能力注册表尚未开放音频生成");
}

async function uploadReferences(items: Array<{ assetId?: string; name: string; url: string }>, signal?: AbortSignal) {
    return Promise.all(items.map(async (item) => {
        if (item.assetId) return item.assetId;
        const existing = assetIdFromUrl(item.url);
        if (existing) return existing;
        const response = await fetch(item.url, { signal });
        if (!response.ok) throw new Error(`参考素材 ${item.name} 读取失败`);
        const asset = await uploadCreativeAsset(await response.blob(), item.name, signal);
        return asset.asset_id;
    }));
}

function selectedModel(config: AiConfig, capability: "text" | "image" | "video") {
    const model = (capability === "text" ? config.textModel : capability === "image" ? config.imageModel : config.videoModel) || config.model;
    if (!model?.trim()) throw new Error(`当前账号没有可用的${capability === "text" ? "文本" : capability === "image" ? "图片" : "视频"}模型`);
    return model.includes("::") ? model.slice(model.indexOf("::") + 2) : model;
}

function assetContentUrl(assetId: string) {
    return `/api/creative/assets/${encodeURIComponent(assetId)}/content`;
}

function assetIdFromUrl(value: string) {
    const match = value.match(/\/api\/creative\/assets\/([^/]+)\/content(?:\?|$)/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
