import { APP_VERSION } from "@/constant/env";
import { CREATIVE_API_BASE } from "@/constant/runtime-config";
import type { CreativeAssetTypeContract, CreativeCapability, CreativeJobStatusContract } from "./generated/creative-contract";

export type CreativeUser = {
    id: number;
    username: string;
    display_name: string;
    avatar_url?: string;
    quota: number;
    group: string;
};

export type CreativeFeatureFlags = Record<string, boolean>;

export type CreativeBootstrap = {
    user: CreativeUser;
    features: CreativeFeatureFlags;
    navigation: Array<{ key: string; label: string; href: string; enabled: boolean }>;
    permissions: Record<string, boolean>;
    theme_version: string;
    capabilities_version: string;
};

export type CreativeModelCapabilityProfile = {
    verified: boolean;
    input_modes: string[];
    supported_parameters: string[];
    max_reference_images: number;
    max_reference_videos: number;
    max_reference_audio: number;
    risk_notices?: string[];
};

export type CreativeModel = {
    id: string;
    name: string;
    groups: string[];
    capabilities: Array<"text_generation" | "image_generation" | "video_generation">;
    recommended_for?: Array<"text_generation" | "image_generation" | "video_generation">;
    capability_profiles: Partial<Record<"text_generation" | "image_generation" | "video_generation", CreativeModelCapabilityProfile>>;
    supported_endpoint_types: string[];
};

export type CreativeToken = {
    id: number;
    name: string;
    group: string;
    unlimited_quota: boolean;
    remain_quota: number;
    expired_time: number;
    model_limits_enabled: boolean;
    model_limits?: string[];
};

export type CreativeCapabilities = {
    version: string;
    capabilities: Record<string, boolean>;
    model_counts: Record<string, number>;
};

export type CreativeIntentKind = "chat" | "image" | "video" | "asset" | "prompt" | "canvas" | "character";

export type CreativeIntent<T = unknown> = {
    id: string;
    kind: CreativeIntentKind;
    payload?: T;
    expires_at: number;
    consumed_at?: number;
};

export type CreativeTokenSelection = {
    strategy?: "auto" | "token";
    token_id?: number;
};

export type CreativeEstimateRequest = {
    capability: CreativeCapability;
    model: string;
    group?: string;
    token?: CreativeTokenSelection;
    parameters?: Record<string, unknown>;
};

export type CreativeEstimate = {
    available: boolean;
    capability: CreativeEstimateRequest["capability"];
    model: string;
    group: string;
    token_id?: number;
    billing_mode: "fixed" | "usage" | "unconfigured";
    billing_unit: "request" | "image" | "second";
    unit_price_usd?: number;
    group_ratio: number;
    estimated_usd?: number;
    estimated_quota?: number;
    normalized_parameters: Record<string, unknown>;
    limitations: Record<string, unknown>;
    price_version: string;
    message: string;
};

export type CreativeJobStatus = CreativeJobStatusContract;

export type CreativeJob = {
    id: number;
    job_id: string;
    user_id: number;
    capability: CreativeEstimateRequest["capability"];
    model: string;
    group: string;
    token_id?: number;
    prompt: string;
    negative_prompt?: string;
    parameters: Record<string, unknown>;
    reference_asset_ids: string[];
    status: CreativeJobStatus;
    progress: number;
    error_code?: string;
    error?: string;
    attempt_count: number;
    result_asset_ids: string[];
    capability_version: string;
    actual_quota?: number;
    actual_cost?: number;
    billing_status?: "PENDING" | "SETTLED" | "ADJUSTED" | string;
    usage_request_id?: string;
    started_at?: number;
    finished_at?: number;
    created_at: number;
    updated_at: number;
};

export type CreateCreativeJobRequest = CreativeEstimateRequest & {
    prompt: string;
    negative_prompt?: string;
    reference_asset_ids?: string[];
    idempotency_key?: string;
};

export type CreativeJobPage = {
    items: CreativeJob[];
    total: number;
    page: number;
    page_size: number;
};

export type CreativeAsset = {
    id: number;
    asset_id: string;
    project_id?: string;
    job_id?: string;
    user_id: number;
    type: CreativeAssetTypeContract;
    title?: string;
    notes?: string;
    content?: string;
    tags?: string[];
    favorite: boolean;
    folder_id?: string;
    source_module?: string;
    parent_asset_id?: string;
    status: string;
    preview_path?: string;
    thumbnail_path?: string;
    mime_type?: string;
    size_bytes?: number;
    width?: number;
    height?: number;
    duration?: number;
    model?: string;
    created_at: number;
    updated_at: number;
};

export type CreativeAssetPage = {
    items: CreativeAsset[];
    total: number;
    page: number;
    page_size: number;
};

export type CreativePromptVariable = {
    name: string;
    label?: string;
    default?: string;
    required?: boolean;
};

export type CreativePrompt = {
    id: number;
    prompt_id: string;
    user_id: number;
    title: string;
    content: string;
    negative_prompt?: string;
    prompt_type?: string;
    category?: string;
    tags: string[];
    variables: CreativePromptVariable[];
    model_suggestions?: string[];
    cover_asset_id?: string;
    author_name?: string;
    source_type?: string;
    source_url?: string;
    source_license?: string;
    allowed_uses?: string;
    source_updated_at?: number;
    favorite: boolean;
    version: number;
    parent_prompt_id?: string;
    created_at: number;
    updated_at: number;
};

export type CreativePromptRevision = Omit<CreativePrompt, "id" | "favorite" | "parent_prompt_id" | "updated_at"> & {
    revision_id: string;
};

export type CreativePromptPage = {
    items: CreativePrompt[];
    total: number;
    page: number;
    page_size: number;
};

export type CreativePromptInput = {
    title: string;
    content: string;
    negative_prompt?: string;
    prompt_type?: string;
    category?: string;
    tags?: string[];
    variables?: CreativePromptVariable[];
    model_suggestions?: string[];
    cover_asset_id?: string;
    author_name?: string;
    source_type?: string;
    source_url?: string;
    source_license?: string;
    allowed_uses?: string;
    source_updated_at?: number;
};

export type CreativeCanvasProject<TDocument = Record<string, unknown>> = {
    id: number;
    project_id: string;
    user_id: number;
    title: string;
    document: TDocument;
    version: number;
    schema_version: number;
    created_at: number;
    updated_at: number;
};

export type CreativeCanvasRevision<TDocument = Record<string, unknown>> = Omit<CreativeCanvasProject<TDocument>, "id" | "updated_at"> & {
    revision_id: string;
};

export type CreativeCanvasPage<TDocument = Record<string, unknown>> = {
    items: Array<CreativeCanvasProject<TDocument>>;
    total: number;
    page: number;
    page_size: number;
};

export class CreativeApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = "CreativeApiError";
    }
}

export async function creativeRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const userId = typeof window !== "undefined" ? window.localStorage.getItem("uid")?.trim() : undefined;
    const response = await fetch(`${CREATIVE_API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
        ...init,
        credentials: "include",
        headers: {
            Accept: "application/json",
            "X-Creative-Client-Version": APP_VERSION,
            ...(userId ? { "New-Api-User": userId } : {}),
            ...init?.headers,
        },
    });
    const payload = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string; code?: string } | T | null;
    const errorPayload = payload && typeof payload === "object" ? (payload as { success?: boolean; message?: string; code?: string }) : null;
    if (!response.ok || errorPayload?.success === false) {
        throw new CreativeApiError(errorPayload?.message || `Creative API 请求失败（${response.status}）`, response.status, errorPayload?.code);
    }
    if (payload && typeof payload === "object" && "data" in payload) return (payload as { data: T }).data;
    return payload as T;
}

export function fetchCreativeBootstrap(signal?: AbortSignal) {
    return creativeRequest<CreativeBootstrap>("/bootstrap", { signal });
}

export function fetchCreativeCapabilities(signal?: AbortSignal) {
    return creativeRequest<CreativeCapabilities>("/capabilities", { signal });
}

export function fetchCreativeModels(options?: { capability?: string; group?: string; signal?: AbortSignal }) {
    const search = new URLSearchParams();
    if (options?.capability) search.set("capability", options.capability);
    if (options?.group) search.set("group", options.group);
    return creativeRequest<CreativeModel[]>(`/models${search.size ? `?${search}` : ""}`, { signal: options?.signal });
}

export function fetchCreativeTokens(signal?: AbortSignal) {
    return creativeRequest<CreativeToken[]>("/tokens", { signal });
}

export function estimateCreativeJob(request: CreativeEstimateRequest, signal?: AbortSignal) {
    return creativeRequest<CreativeEstimate>("/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
    });
}

export function createCreativeJob(request: CreateCreativeJobRequest, signal?: AbortSignal) {
    return creativeRequest<CreativeJob>("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
    });
}

export function fetchCreativeJobs(options?: { page?: number; pageSize?: number; capability?: string; status?: CreativeJobStatus; signal?: AbortSignal }) {
    const search = new URLSearchParams();
    if (options?.page) search.set("page", String(options.page));
    if (options?.pageSize) search.set("page_size", String(options.pageSize));
    if (options?.capability) search.set("capability", options.capability);
    if (options?.status) search.set("status", options.status);
    return creativeRequest<CreativeJobPage>(`/jobs${search.size ? `?${search}` : ""}`, { signal: options?.signal });
}

export function fetchCreativeJob(jobId: string, signal?: AbortSignal) {
    return creativeRequest<CreativeJob>(`/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export function cancelCreativeJob(jobId: string) {
    return creativeRequest<CreativeJob>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

export function retryCreativeJob(jobId: string) {
    return creativeRequest<CreativeJob>(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
}

export async function waitForCreativeJob(jobId: string, options?: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number; onUpdate?: (job: CreativeJob) => void }) {
    const startedAt = Date.now();
    const intervalMs = options?.intervalMs ?? 1500;
    const timeoutMs = options?.timeoutMs ?? 30 * 60 * 1000;
    for (;;) {
        const job = await fetchCreativeJob(jobId, options?.signal);
        options?.onUpdate?.(job);
        if (["SUCCEEDED", "PARTIAL_SUCCESS", "MODERATION_REJECTED", "FAILED", "CANCELLED", "EXPIRED"].includes(job.status)) return job;
        if (Date.now() - startedAt >= timeoutMs) throw new CreativeApiError("等待创作任务超时，可稍后从任务历史继续查看", 408, "job_wait_timeout");
        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(resolve, intervalMs);
            options?.signal?.addEventListener(
                "abort",
                () => {
                    window.clearTimeout(timer);
                    reject(options.signal?.reason || new DOMException("Aborted", "AbortError"));
                },
                { once: true },
            );
        });
    }
}

export function fetchCreativeAssets(options?: { page?: number; pageSize?: number; type?: string; sourceModule?: string; projectId?: string; folderId?: string; search?: string; favorite?: boolean; model?: string; tag?: string; createdFrom?: number; createdTo?: number; trash?: boolean; signal?: AbortSignal }) {
    const search = new URLSearchParams();
    if (options?.page) search.set("page", String(options.page));
    if (options?.pageSize) search.set("page_size", String(options.pageSize));
    if (options?.type) search.set("type", options.type);
    if (options?.sourceModule) search.set("source_module", options.sourceModule);
    if (options?.projectId) search.set("project_id", options.projectId);
    if (options?.folderId) search.set("folder_id", options.folderId);
    if (options?.search) search.set("search", options.search);
    if (options?.favorite) search.set("favorite", "true");
    if (options?.model) search.set("model", options.model);
    if (options?.tag) search.set("tag", options.tag);
    if (options?.createdFrom) search.set("created_from", String(options.createdFrom));
    if (options?.createdTo) search.set("created_to", String(options.createdTo));
    if (options?.trash) search.set("trash", "true");
    return creativeRequest<CreativeAssetPage>(`/assets${search.size ? `?${search}` : ""}`, { signal: options?.signal });
}

export function fetchCreativeAsset(assetId: string, signal?: AbortSignal) {
    return creativeRequest<CreativeAsset>(`/assets/${encodeURIComponent(assetId)}`, { signal });
}

export function uploadCreativeAsset(file: Blob, title?: string, signal?: AbortSignal, importKey?: string) {
    const form = new FormData();
    form.set("file", file, file instanceof File ? file.name : "upload");
    if (title) form.set("title", title);
    if (importKey) form.set("import_key", importKey);
    return creativeRequest<CreativeAsset>("/assets/uploads", { method: "POST", body: form, signal });
}

export function createCreativeTextAsset(input: { title: string; content: string; notes?: string; tags?: string[]; folder_id?: string }) {
    return creativeRequest<CreativeAsset>("/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export function updateCreativeAsset(assetId: string, updates: { title?: string; notes?: string; tags?: string[]; favorite?: boolean; folder_id?: string }) {
    return creativeRequest<CreativeAsset>(`/assets/${encodeURIComponent(assetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
}

export function deleteCreativeAsset(assetId: string) {
    return creativeRequest<null>(`/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
}

export function restoreCreativeAsset(assetId: string) {
    return creativeRequest<CreativeAsset>(`/assets/${encodeURIComponent(assetId)}/restore`, { method: "POST" });
}

export function fetchCreativePrompts(options?: { page?: number; pageSize?: number; search?: string; category?: string; promptType?: string; tag?: string; sourceType?: string; favorite?: boolean; signal?: AbortSignal }) {
    const search = new URLSearchParams();
    if (options?.page) search.set("page", String(options.page));
    if (options?.pageSize) search.set("page_size", String(options.pageSize));
    if (options?.search) search.set("search", options.search);
    if (options?.category) search.set("category", options.category);
    if (options?.promptType) search.set("prompt_type", options.promptType);
    if (options?.tag) search.set("tag", options.tag);
    if (options?.sourceType) search.set("source_type", options.sourceType);
    if (options?.favorite) search.set("favorite", "true");
    return creativeRequest<CreativePromptPage>(`/prompts${search.size ? `?${search}` : ""}`, { signal: options?.signal });
}

export function fetchCreativePrompt(promptId: string, signal?: AbortSignal) {
    return creativeRequest<CreativePrompt>(`/prompts/${encodeURIComponent(promptId)}`, { signal });
}

export function createCreativePrompt(input: CreativePromptInput) {
    return creativeRequest<CreativePrompt>("/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export function updateCreativePrompt(promptId: string, updates: Partial<CreativePromptInput> & { favorite?: boolean }) {
    return creativeRequest<CreativePrompt>(`/prompts/${encodeURIComponent(promptId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
}

export function duplicateCreativePrompt(promptId: string) {
    return creativeRequest<CreativePrompt>(`/prompts/${encodeURIComponent(promptId)}/duplicate`, { method: "POST" });
}

export function deleteCreativePrompt(promptId: string) {
    return creativeRequest<null>(`/prompts/${encodeURIComponent(promptId)}`, { method: "DELETE" });
}

export function fetchCreativePromptRevisions(promptId: string, signal?: AbortSignal) {
    return creativeRequest<CreativePromptRevision[]>(`/prompts/${encodeURIComponent(promptId)}/revisions`, { signal });
}

export function fetchCreativeCanvases<TDocument = Record<string, unknown>>(options?: { page?: number; pageSize?: number; search?: string; signal?: AbortSignal }) {
    const search = new URLSearchParams();
    if (options?.page) search.set("page", String(options.page));
    if (options?.pageSize) search.set("page_size", String(options.pageSize));
    if (options?.search) search.set("search", options.search);
    return creativeRequest<CreativeCanvasPage<TDocument>>(`/canvases${search.size ? `?${search}` : ""}`, { signal: options?.signal });
}

export function fetchCreativeCanvas<TDocument = Record<string, unknown>>(projectId: string, signal?: AbortSignal) {
    return creativeRequest<CreativeCanvasProject<TDocument>>(`/canvases/${encodeURIComponent(projectId)}`, { signal });
}

export function createCreativeCanvas<TDocument = Record<string, unknown>>(input: { title: string; document: TDocument; schema_version?: number }) {
    return creativeRequest<CreativeCanvasProject<TDocument>>("/canvases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export function updateCreativeCanvas<TDocument = Record<string, unknown>>(projectId: string, input: { title?: string; document?: TDocument; schema_version?: number; expected_version: number }) {
    return creativeRequest<CreativeCanvasProject<TDocument>>(`/canvases/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export function duplicateCreativeCanvas<TDocument = Record<string, unknown>>(projectId: string) {
    return creativeRequest<CreativeCanvasProject<TDocument>>(`/canvases/${encodeURIComponent(projectId)}/duplicate`, { method: "POST" });
}

export function deleteCreativeCanvas(projectId: string) {
    return creativeRequest<null>(`/canvases/${encodeURIComponent(projectId)}`, { method: "DELETE" });
}

export function fetchCreativeCanvasRevisions<TDocument = Record<string, unknown>>(projectId: string, signal?: AbortSignal) {
    return creativeRequest<Array<CreativeCanvasRevision<TDocument>>>(`/canvases/${encodeURIComponent(projectId)}/revisions`, { signal });
}

export function restoreCreativeCanvasRevision<TDocument = Record<string, unknown>>(projectId: string, revisionId: string, expectedVersion: number) {
    return creativeRequest<CreativeCanvasProject<TDocument>>(`/canvases/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: expectedVersion }),
    });
}

export function createCreativeIntent<T>(kind: CreativeIntentKind, payload: T, ttlSeconds = 300) {
    return creativeRequest<CreativeIntent>("/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload, ttl_seconds: ttlSeconds }),
    });
}

export function consumeCreativeIntent<T>(intentId: string) {
    return creativeRequest<CreativeIntent<T>>(`/intents/${encodeURIComponent(intentId)}/consume`, { method: "POST" });
}
