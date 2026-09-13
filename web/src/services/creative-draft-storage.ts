import { localForageStorage } from "@/lib/localforage-storage";
import type { AiConfig } from "@/stores/use-config-store";

export const CREATIVE_DRAFT_VERSION = 1;

export type CreativeDraftKind = "image" | "video";

export type CreativeDraftReference = {
    assetId: string;
    name: string;
    type: string;
    kind: "image" | "video" | "audio";
};

export type ImageWorkbenchDraft = {
    version: typeof CREATIVE_DRAFT_VERSION;
    kind: "image";
    projectId: string;
    prompt: string;
    negativePrompt: string;
    generationMode: "text" | "edit";
    model: string;
    config: Pick<AiConfig, "quality" | "size" | "count" | "background">;
    references: CreativeDraftReference[];
    updatedAt: number;
};

export type VideoWorkbenchDraft = {
    version: typeof CREATIVE_DRAFT_VERSION;
    kind: "video";
    projectId: string;
    prompt: string;
    negativePrompt: string;
    model: string;
    config: Pick<AiConfig, "size" | "vquality" | "videoSeconds" | "videoFps" | "videoGenerateAudio" | "videoWatermark" | "videoCameraFixed">;
    references: CreativeDraftReference[];
    updatedAt: number;
};

export type CreativeWorkbenchDraft = ImageWorkbenchDraft | VideoWorkbenchDraft;

type DraftStore<T extends CreativeWorkbenchDraft> = {
    version: typeof CREATIVE_DRAFT_VERSION;
    userId: string;
    drafts: Record<string, T>;
};

const DEFAULT_PROJECT_KEY = "__default__";
const DRAFT_KEY_PREFIX = "fyjit:creative-drafts:v1";

function normalizedUserId(userId: string | number | undefined) {
    return String(userId ?? "").trim();
}

export function creativeDraftProjectKey(projectId: string | undefined) {
    return projectId?.trim() || DEFAULT_PROJECT_KEY;
}

export function creativeDraftStorageKey(userId: string | number, kind: CreativeDraftKind) {
    return `${DRAFT_KEY_PREFIX}:${encodeURIComponent(normalizedUserId(userId))}:${kind}`;
}

export function sanitizeCreativeDraftReference(reference: Partial<CreativeDraftReference> & { assetId?: string }) {
    if (!reference || typeof reference !== "object") return null;
    const assetId = String(reference.assetId || "").trim();
    if (!assetId) return null;
    return {
        assetId,
        name: (String(reference.name || assetId).trim() || assetId).slice(0, 200),
        type: String(reference.type || "application/octet-stream").slice(0, 200),
        kind: reference.kind === "video" || reference.kind === "audio" ? reference.kind : "image",
    } satisfies CreativeDraftReference;
}

export function sanitizeCreativeDraft<T extends CreativeWorkbenchDraft>(draft: T): T {
    const references = (Array.isArray(draft.references) ? draft.references : []).map(sanitizeCreativeDraftReference).filter((reference): reference is CreativeDraftReference => Boolean(reference));
    const common = {
        version: CREATIVE_DRAFT_VERSION,
        projectId: String(draft.projectId || "").slice(0, 200),
        prompt: String(draft.prompt || "").slice(0, 20000),
        negativePrompt: String(draft.negativePrompt || "").slice(0, 10000),
        model: String(draft.model || "").slice(0, 500),
        references,
        updatedAt: Number.isFinite(draft.updatedAt) ? draft.updatedAt : Date.now(),
    };
    if (draft.kind === "image") {
        return {
            ...common,
            kind: "image",
            generationMode: draft.generationMode === "edit" ? "edit" : "text",
            config: {
                quality: String(draft.config?.quality || ""),
                size: String(draft.config?.size || ""),
                count: String(draft.config?.count || ""),
                background: String(draft.config?.background || ""),
            },
        } as T;
    }
    return {
        ...common,
        kind: "video",
        config: {
            size: String(draft.config?.size || ""),
            vquality: String(draft.config?.vquality || ""),
            videoSeconds: String(draft.config?.videoSeconds || ""),
            videoFps: String(draft.config?.videoFps || ""),
            videoGenerateAudio: String(draft.config?.videoGenerateAudio || ""),
            videoWatermark: String(draft.config?.videoWatermark || ""),
            videoCameraFixed: String(draft.config?.videoCameraFixed || ""),
        },
    } as T;
}

async function readStore<T extends CreativeWorkbenchDraft>(userId: string | number, kind: CreativeDraftKind): Promise<DraftStore<T> | null> {
    const normalized = normalizedUserId(userId);
    if (!normalized) return null;
    try {
        const raw = await localForageStorage.getItem(creativeDraftStorageKey(normalized, kind));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<DraftStore<T>>;
        if (parsed.version !== CREATIVE_DRAFT_VERSION || parsed.userId !== normalized || !parsed.drafts || typeof parsed.drafts !== "object") return null;
        return { version: CREATIVE_DRAFT_VERSION, userId: normalized, drafts: parsed.drafts as Record<string, T> };
    } catch {
        return null;
    }
}

async function writeStore<T extends CreativeWorkbenchDraft>(userId: string | number, kind: CreativeDraftKind, store: DraftStore<T>) {
    try {
        await localForageStorage.setItem(creativeDraftStorageKey(userId, kind), JSON.stringify(store));
    } catch {
        // Private browsing, disabled storage, and quota errors must not block the workbench.
    }
}

export async function loadCreativeDraft<T extends CreativeWorkbenchDraft>(userId: string | number | undefined, kind: CreativeDraftKind, projectId: string | undefined) {
    const normalized = normalizedUserId(userId);
    if (!normalized) return null;
    const store = await readStore<T>(normalized, kind);
    const draft = store?.drafts[creativeDraftProjectKey(projectId)];
    if (!draft || draft.kind !== kind) return null;
    try {
        return sanitizeCreativeDraft(draft);
    } catch {
        return null;
    }
}

export async function saveCreativeDraft<T extends CreativeWorkbenchDraft>(userId: string | number | undefined, kind: CreativeDraftKind, projectId: string | undefined, draft: T) {
    const normalized = normalizedUserId(userId);
    if (!normalized) return;
    const current = (await readStore<T>(normalized, kind)) || { version: CREATIVE_DRAFT_VERSION, userId: normalized, drafts: {} };
    const nextDraft = sanitizeCreativeDraft({ ...draft, projectId: projectId?.trim() || "" });
    current.drafts[creativeDraftProjectKey(projectId)] = nextDraft;
    await writeStore(normalized, kind, current);
}

export async function clearCreativeDraft(userId: string | number | undefined, kind: CreativeDraftKind, projectId: string | undefined) {
    const normalized = normalizedUserId(userId);
    if (!normalized) return;
    const current = await readStore<CreativeWorkbenchDraft>(normalized, kind);
    if (!current) return;
    delete current.drafts[creativeDraftProjectKey(projectId)];
    if (Object.keys(current.drafts).length) {
        await writeStore(normalized, kind, current);
    } else {
        try {
            await localForageStorage.removeItem(creativeDraftStorageKey(normalized, kind));
        } catch {
            // Storage cleanup is best effort and must not block sign-out or generation.
        }
    }
}

export async function clearCreativeDraftsForUser(userId: string | number | undefined) {
    const normalized = normalizedUserId(userId);
    if (!normalized) return;
    await Promise.all(
        ["image", "video"].map(async (kind) => {
            try {
                await localForageStorage.removeItem(creativeDraftStorageKey(normalized, kind as CreativeDraftKind));
            } catch {
                // Storage cleanup is best effort and must not block sign-out.
            }
        }),
    );
}
