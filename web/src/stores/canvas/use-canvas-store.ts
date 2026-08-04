import { create } from "zustand";

import {
    createCreativeCanvas,
    deleteCreativeCanvas,
    fetchCreativeCanvases,
    restoreCreativeCanvasRevision,
    updateCreativeCanvas,
    uploadCreativeAsset,
    type CreativeCanvasProject,
} from "@/services/api/creative";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    version: number;
    schemaVersion: number;
    syncError?: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasDocument = Omit<CanvasProject, "id" | "title" | "createdAt" | "updatedAt" | "version" | "schemaVersion" | "syncError">;

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    loadServerProjects: () => Promise<void>;
    createProject: (title?: string) => Promise<string>;
    importProject: (project: Partial<CanvasProject>) => Promise<string>;
    snapshotProject: (id: string) => Promise<boolean>;
    restoreProjectRevision: (id: string, revisionId: string) => Promise<boolean>;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
export const CURRENT_CANVAS_SCHEMA_VERSION = 2;
const saveTimers = new Map<string, number>();
const saveChains = new Map<string, Promise<unknown>>();

function emptyDocument(): CanvasDocument {
    return { nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: initialViewport };
}

function migrateCanvasDocument(source: Partial<CanvasDocument> | undefined, schemaVersion: number): CanvasDocument {
    let document: CanvasDocument = { ...emptyDocument(), ...source };
    let version = Math.max(1, schemaVersion || 1);
    while (version < CURRENT_CANVAS_SCHEMA_VERSION) {
        if (version === 1) {
            const viewport = document.viewport;
            document = {
                ...document,
                nodes: Array.isArray(document.nodes) ? document.nodes : [],
                connections: Array.isArray(document.connections) ? document.connections : [],
                chatSessions: Array.isArray(document.chatSessions) ? document.chatSessions : [],
                activeChatId: typeof document.activeChatId === "string" ? document.activeChatId : null,
                backgroundMode: ["dots", "lines", "blank"].includes(document.backgroundMode) ? document.backgroundMode : "lines",
                showImageInfo: Boolean(document.showImageInfo),
                viewport:
                    viewport && Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.k) && viewport.k > 0
                        ? viewport
                        : initialViewport,
            };
        }
        version += 1;
    }
    return document;
}

function fromServer(project: CreativeCanvasProject<CanvasDocument>): CanvasProject {
    const document = migrateCanvasDocument(project.document, project.schema_version);
    return {
        id: project.project_id,
        title: project.title,
        createdAt: new Date(project.created_at * 1000).toISOString(),
        updatedAt: new Date(project.updated_at * 1000).toISOString(),
        version: project.version,
        schemaVersion: Math.min(project.schema_version || 1, CURRENT_CANVAS_SCHEMA_VERSION),
        ...document,
    };
}

async function migrateServerProject(project: CreativeCanvasProject<CanvasDocument>): Promise<CanvasProject> {
    const local = fromServer(project);
    if (project.schema_version > CURRENT_CANVAS_SCHEMA_VERSION) {
        return { ...local, syncError: `该画布使用较新的格式 v${project.schema_version}，当前客户端仅支持 v${CURRENT_CANVAS_SCHEMA_VERSION}` };
    }
    if ((project.schema_version || 1) >= CURRENT_CANVAS_SCHEMA_VERSION) return local;
    try {
        const saved = await updateCreativeCanvas<CanvasDocument>(project.project_id, {
            title: project.title,
            document: toDocument(local),
            schema_version: CURRENT_CANVAS_SCHEMA_VERSION,
            expected_version: project.version,
        });
        return fromServer(saved);
    } catch (error) {
        return { ...local, syncError: error instanceof Error ? `画布格式升级失败：${error.message}` : "画布格式升级失败" };
    }
}

function toDocument(project: CanvasProject): CanvasDocument {
    return {
        nodes: project.nodes,
        connections: project.connections,
        chatSessions: project.chatSessions,
        activeChatId: project.activeChatId,
        backgroundMode: project.backgroundMode,
        showImageInfo: project.showImageInfo,
        viewport: project.viewport,
    };
}

async function normalizeServerDocument(document: CanvasDocument): Promise<CanvasDocument> {
    return (await normalizeCanvasValue(document)) as CanvasDocument;
}

async function normalizeCanvasValue(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map(normalizeCanvasValue));
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    let uploadedAssetId = typeof source.assetId === "string" ? source.assetId : undefined;
    for (const [key, child] of Object.entries(source)) {
        if ((key === "content" || key === "dataUrl" || key === "url") && typeof child === "string" && (/^data:(image|video|audio)\//i.test(child) || child.startsWith("blob:"))) {
            if (uploadedAssetId) {
                result[key] = `/api/creative/assets/${encodeURIComponent(uploadedAssetId)}/content`;
                continue;
            }
            const response = await fetch(child);
            if (!response.ok) throw new Error("画布本地素材读取失败，无法同步到服务端");
            const asset = await uploadCreativeAsset(await response.blob(), typeof source.title === "string" ? source.title : "画布素材");
            result[key] = asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`;
            uploadedAssetId = asset.asset_id;
            continue;
        }
        if (key === "storageKey" && uploadedAssetId) continue;
        result[key] = await normalizeCanvasValue(child);
    }
    if (uploadedAssetId) result.assetId = uploadedAssetId;
    return result;
}

function scheduleSave(projectId: string) {
    const current = saveTimers.get(projectId);
    if (current) window.clearTimeout(current);
    saveTimers.set(projectId, window.setTimeout(() => {
        saveTimers.delete(projectId);
        const previous = saveChains.get(projectId) || Promise.resolve();
        const next = previous.catch(() => undefined).then(() => persistProject(projectId));
        const tracked = next.finally(() => {
            if (saveChains.get(projectId) === tracked) saveChains.delete(projectId);
        });
        saveChains.set(projectId, tracked);
    }, 800));
}

async function persistProject(projectId: string) {
    const snapshot = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    if (!snapshot) return false;
    const snapshotUpdatedAt = snapshot.updatedAt;
    try {
        const document = await normalizeServerDocument(toDocument(snapshot));
        const saved = await updateCreativeCanvas<CanvasDocument>(projectId, { title: snapshot.title, document, schema_version: snapshot.schemaVersion, expected_version: snapshot.version });
        useCanvasStore.setState((state) => ({
            projects: state.projects.map((project) => {
                if (project.id !== projectId) return project;
                if (project.updatedAt !== snapshotUpdatedAt) {
                    window.setTimeout(() => scheduleSave(projectId), 0);
                    return { ...project, version: saved.version, syncError: undefined };
                }
                return { ...fromServer(saved), syncError: undefined };
            }),
        }));
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : "画布自动保存失败";
        useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project.id === projectId ? { ...project, syncError: message } : project)) }));
        return false;
    }
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
    hydrated: false,
    projects: [],
    loadServerProjects: async () => {
        try {
            const result = await fetchCreativeCanvases<CanvasDocument>({ pageSize: 100 });
            const projects = await Promise.all((result.items || []).map(migrateServerProject));
            set({ projects, hydrated: true });
        } catch (error) {
            set({ hydrated: true });
            throw error;
        }
    },
    createProject: async (title = "未命名画布") => {
        const created = await createCreativeCanvas<CanvasDocument>({ title, document: emptyDocument(), schema_version: CURRENT_CANVAS_SCHEMA_VERSION });
        const project = fromServer(created);
        set((state) => ({ projects: [project, ...state.projects] }));
        return project.id;
    },
    importProject: async (source) => {
        const document = await normalizeServerDocument(migrateCanvasDocument({
            nodes: source.nodes || [],
            connections: source.connections || [],
            chatSessions: source.chatSessions || [],
            activeChatId: source.activeChatId || null,
            backgroundMode: source.backgroundMode || "lines",
            showImageInfo: source.showImageInfo || false,
            viewport: source.viewport || initialViewport,
        }, source.schemaVersion || 1));
        const created = await createCreativeCanvas<CanvasDocument>({ title: source.title || "导入画布", document, schema_version: CURRENT_CANVAS_SCHEMA_VERSION });
        const project = fromServer(created);
        set((state) => ({ projects: [project, ...state.projects] }));
        return project.id;
    },
    snapshotProject: async (id) => {
        const timer = saveTimers.get(id);
        if (timer) window.clearTimeout(timer);
        saveTimers.delete(id);
        const previous = saveChains.get(id) || Promise.resolve();
        let succeeded = false;
        const next = previous.catch(() => undefined).then(async () => {
            succeeded = await persistProject(id);
        });
        saveChains.set(id, next);
        await next;
        if (saveChains.get(id) === next) saveChains.delete(id);
        return succeeded;
    },
    restoreProjectRevision: async (id, revisionId) => {
        const timer = saveTimers.get(id);
        if (timer) window.clearTimeout(timer);
        saveTimers.delete(id);
        const previous = saveChains.get(id) || Promise.resolve();
        let succeeded = false;
        const next = previous.catch(() => undefined).then(async () => {
            const current = get().projects.find((project) => project.id === id);
            if (!current) return;
            const restored = await restoreCreativeCanvasRevision<CanvasDocument>(id, revisionId, current.version);
            const migrated = await migrateServerProject(restored);
            set((state) => ({ projects: state.projects.map((project) => (project.id === id ? migrated : project)) }));
            succeeded = true;
        });
        saveChains.set(id, next);
        try {
            await next;
        } finally {
            if (saveChains.get(id) === next) saveChains.delete(id);
        }
        return succeeded;
    },
    openProject: (id) => get().projects.find((item) => item.id === id) || null,
    renameProject: (id, title) => {
        set((state) => ({ projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)) }));
        scheduleSave(id);
    },
    deleteProjects: (ids) => {
        set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) }));
        for (const id of ids) {
            const timer = saveTimers.get(id);
            if (timer) window.clearTimeout(timer);
            saveTimers.delete(id);
            void deleteCreativeCanvas(id);
        }
    },
    replaceProjects: (projects) => set({ projects }),
    updateProject: (id, patch) => {
        set((state) => ({ projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)) }));
        scheduleSave(id);
    },
}));
