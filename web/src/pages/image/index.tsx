import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ClipboardPaste,
    Download,
    FolderPlus,
    GitCompare,
    History,
    ImagePlus,
    PenLine,
    Plus,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Upload,
    VideoIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Checkbox, Drawer, Image, Input, Modal, Segmented, Tag, Tooltip, Typography } from "antd";
import { saveAs } from "file-saver";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { CreativeEstimateSummary } from "@/components/creative-estimate-summary";
import { CreativeReadinessNotice } from "@/components/creative-readiness-notice";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { ProjectPicker } from "@/components/project-picker";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { FyjitEmptyState, FyjitSurface, FyjitTaskStatus } from "@/components/fyjit/creative-ui";
import { canvasThemes } from "@/lib/canvas-theme";
import { randomId } from "@/lib/utils";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useWorkbenchLayoutStore } from "@/stores/use-workbench-layout-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { createCreativeIntent, createCreativeJob, estimateCreativeJob, fetchCreativeAsset, fetchCreativeJobs, uploadCreativeAsset, waitForCreativeJob, type CreativeJob } from "@/services/api/creative";
import { uploadImage } from "@/services/image-storage";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { useCreativeIntentStore } from "@/stores/use-creative-intent-store";
import { useFyjitStore } from "@/stores/use-fyjit-store";
import { useCreativeEstimate } from "@/hooks/use-creative-estimate";
import type { ReferenceImage } from "@/types/image";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    negativePrompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "排队中" | "运行中" | "成功" | "部分成功" | "审核拒绝" | "失败" | "已取消" | "已超时";
    images: GeneratedImage[];
    thumbnails: string[];
    task: CreativeJob;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";

export default function ImagePage() {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const historyCollapsed = useWorkbenchLayoutStore((state) => state.imageHistoryCollapsed);
    const parametersCollapsed = useWorkbenchLayoutStore((state) => state.imageParametersCollapsed);
    const setHistoryCollapsed = useWorkbenchLayoutStore((state) => state.setImageHistoryCollapsed);
    const setParametersCollapsed = useWorkbenchLayoutStore((state) => state.setImageParametersCollapsed);
    const [prompt, setPrompt] = useState("");
    const [negativePrompt, setNegativePrompt] = useState("");
    const activeIntent = useCreativeIntentStore((state) => state.activeIntent);
    const fyjitModels = useFyjitStore((state) => state.models);
    const fyjitTokens = useFyjitStore((state) => state.tokens);
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [generationMode, setGenerationMode] = useState<"text" | "edit">("text");
    const [projectId, setProjectId] = useState("");
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [comparison, setComparison] = useState<{ before: string; after: string }>();
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const referenceSectionRef = useRef<HTMLDivElement>(null);

    const imageModels = fyjitModels.filter((item) => item.capabilities.includes("image_generation"));
    const preferredModel = effectiveConfig.imageModel || effectiveConfig.model;
    const model = imageModels.some((item) => item.id === preferredModel) ? preferredModel : imageModels[0]?.id || "";
    const hasImageModel = fyjitModels.some((item) => item.id === model && item.capabilities.includes("image_generation"));
    const canGenerate = Boolean(prompt.trim() && hasImageModel && fyjitTokens.length && (generationMode === "text" || references.length));
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));
    const modelProfile = fyjitModels.find((item) => item.id === model)?.capability_profiles.image_generation;
    const maxImageReferences = modelProfile?.max_reference_images ?? 0;
    const estimateParameters = { count: generationCount, size: effectiveConfig.size, quality: effectiveConfig.quality, background: effectiveConfig.background };
    const { estimate, loading: estimateLoading, error: estimateError } = useCreativeEstimate(model && fyjitTokens.length ? { capability: "image_generation", model, group: "auto", token: { strategy: "auto" }, parameters: estimateParameters } : null);
    const estimateTokenLabel = estimate?.token_id ? `${fyjitTokens.find((item) => item.id === estimate.token_id)?.name || "本站 Token"} (#${estimate.token_id})` : "自动选择可用的本站 Token";

    useEffect(() => {
        if (maxImageReferences < 1 && generationMode === "edit") {
            setGenerationMode("text");
            setReferences([]);
        }
    }, [generationMode, maxImageReferences]);

    useEffect(() => {
        if (activeIntent?.kind !== "image") return;
        const intent = useCreativeIntentStore.getState().consumeFor("image");
        if (intent?.prompt) setPrompt(intent.prompt);
        if (intent?.negative_prompt) setNegativePrompt(intent.negative_prompt);
        if (intent?.asset_ids?.length) {
            setGenerationMode("edit");
            const ids = intent.asset_ids;
            void Promise.all(ids.map((assetId) => fetchCreativeAsset(assetId)))
                .then((assets) =>
                    setReferences((current) =>
                        [
                            ...current,
                            ...assets
                                .filter((asset) => ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type))
                                .map((asset) => ({
                                    id: asset.asset_id,
                                    assetId: asset.asset_id,
                                    name: asset.title || "角色参考图",
                                    type: asset.mime_type || "image/png",
                                    dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
                                })),
                        ].slice(0, maxImageReferences),
                    ),
                )
                .catch((error) => message.error(error instanceof Error ? error.message : "创作素材恢复失败"));
        }
    }, [activeIntent, message]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || [])
            .filter((file) => file.type.startsWith("image/"))
            .slice(0, Math.max(0, maxImageReferences - references.length));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, maxImageReferences));
        if (nextReferences.length) setGenerationMode("edit");
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, Math.max(0, maxImageReferences - references.length)).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, maxImageReferences));
            if (nextReferences.length) setGenerationMode("edit");
            message.success(`已读取 ${nextReferences.length} 张参考图`);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim();
        if (!text) {
            message.error("请输入生图提示词");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "请输入生图提示词" });
            return;
        }
        if (!fyjitModels.some((item) => item.id === model && item.capabilities.includes("image_generation"))) {
            message.warning("当前账号没有可用的生图模型");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "当前账号没有可用的生图模型" });
            return;
        }
        if (!fyjitTokens.length) {
            message.warning("当前账号没有可用的本站 Token");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "生图配置不完整" });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "生图参数无效" });
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        const resultIds = Array.from({ length: generationCount }, () => nanoid());
        setResults(resultIds.map((id) => ({ id, status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        let successCount = 0;
        let failCount = 0;
        try {
            const [referenceAssetIds, checkedEstimate] = await Promise.all([
                uploadImageReferences(snapshot.references),
                estimateCreativeJob({
                    capability: "image_generation",
                    model: snapshot.config.model,
                    group: "auto",
                    token: { strategy: "auto" },
                    parameters: { count: 1, size: snapshot.config.size, quality: snapshot.config.quality, background: snapshot.config.background },
                }),
            ]);
            const outcomes = await Promise.all(
                resultIds.map(async (resultId, index) => {
                    try {
                        const image = await submitImageJob(snapshot, referenceAssetIds, checkedEstimate.normalized_parameters);
                        if (!image) throw new Error("任务没有返回图片素材");
                        setResults((value) => updateResultById(value, resultId, { status: "success", image }));
                        return { ok: true as const, index };
                    } catch (requestError) {
                        const error = requestError instanceof Error ? requestError.message : "生成失败";
                        setResults((value) => updateResultById(value, resultId, { status: "failed", error }));
                        return { ok: false as const, error, index };
                    }
                }),
            );
            successCount = outcomes.filter((outcome) => outcome.ok).length;
            failCount = outcomes.length - successCount;
            const firstError = outcomes.find((outcome) => !outcome.ok);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : firstError?.error });
            await refreshLogs();
            if (successCount && failCount) message.warning(`已生成 ${successCount} 张，${failCount} 张失败，可逐张重试`);
            else if (successCount) message.success("图片已生成并保存到 FYJIT 素材中心");
            else message.error(firstError?.error || "生成失败");
        } catch (requestError) {
            const error = requestError instanceof Error ? requestError.message : "生成失败";
            failCount = generationCount;
            setResults(resultIds.map((id) => ({ id, status: "failed", error })));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount, error });
            message.error(error);
        } finally {
            setRunning(false);
        }
    };

    // 响应 Agent 面板下发的生图命令：填入提示词，并按需自动触发生成。
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: "生图工作台已有任务正在运行" });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        if (maxImageReferences < 1 || references.length >= maxImageReferences) {
            message.warning("当前模型不接受更多参考图");
            return;
        }
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, maxImageReferences));
        setGenerationMode("edit");
        message.success("已加入参考图");
    };

    const saveResultToAssets = async (_image: GeneratedImage, _index: number) => {
        message.success("生成结果已由 FYJIT 自动保存到素材中心");
    };

    const sendResultToVideo = async (image: GeneratedImage) => {
        try {
            const intent = await createCreativeIntent("video", { prompt: prompt.trim(), negative_prompt: negativePrompt.trim() || undefined, asset_ids: [image.id] });
            window.location.assign(new URL(`video?intent=${encodeURIComponent(intent.id)}`, document.baseURI).toString());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "无法送入视频创作台");
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            if (maxImageReferences < 1 || references.length >= maxImageReferences) {
                message.warning("当前模型不接受更多参考图");
                return;
            }
            setReferences((value) => [...value, { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: "image/png", dataUrl: payload.dataUrl }].slice(0, maxImageReferences));
            setGenerationMode("edit");
            window.requestAnimationFrame(() => referenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            message.success("已插入下方“参考图”并切换到参考图编辑模式");
        } else {
            message.warning("生图工作台只能使用文本或图片资产");
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setNegativePrompt("");
        setReferences([]);
        setGenerationMode("text");
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
        message.info("服务端生成记录用于消费审计，不能删除；可在素材中心删除结果素材");
    };

    const refreshLogs = async (resumePending = true) => {
        const response = await fetchCreativeJobs({ capability: "image_generation", pageSize: 100 });
        const nextLogs = await Promise.all((response.items || []).map(creativeJobToImageLog));
        setLogs(nextLogs);
        if (resumePending) {
            for (const log of nextLogs) {
                if (log.status === "排队中" || log.status === "运行中") void pollImageLog(log);
            }
        }
        return nextLogs;
    };

    const pollImageLog = async (log: GenerationLog) => {
        if (activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        try {
            const completed = await waitForCreativeJob(log.id, { intervalMs: 1500 });
            const next = await creativeJobToImageLog(completed);
            setLogs((current) => current.map((item) => (item.id === next.id ? next : item)));
            setPreviewLog((current) => (current?.id === next.id ? next : current));
            setResults((current) =>
                current.some((item) => item.id === next.id) ? (next.images.length ? next.images.map((image) => ({ id: image.id, status: "success" as const, image })) : [{ id: next.id, status: "failed", error: next.error || next.status }]) : current,
            );
        } catch {
            // 网络恢复后由下一次历史刷新继续订阅同一服务端任务。
        } finally {
            activeLogIdsRef.current.delete(log.id);
        }
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setNegativePrompt(log.negativePrompt);
        setReferences((log.references || []).slice(0, maxImageReferences));
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        setResults(
            log.status === "排队中" || log.status === "运行中"
                ? [{ id: log.id, status: "pending" }]
                : log.images.length
                  ? log.images.map((image) => ({ id: image.id, status: "success", image }))
                  : [{ id: log.id, status: "failed", error: log.error || log.status }],
        );
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error("请输入生图提示词");
            return null;
        }
        if (!fyjitModels.some((item) => item.id === model && item.capabilities.includes("image_generation")) || !fyjitTokens.length) {
            message.warning("当前账号缺少可用生图模型或本站 Token");
            return null;
        }
        const maxReferences = maxImageReferences;
        if (references.length > maxReferences) {
            message.error(`参考素材最多 ${maxReferences} 个，请先移除多余素材`);
            return null;
        }
        if (generationMode === "edit" && !references.length) {
            message.error("参考图编辑模式至少需要一张参考图");
            return null;
        }
        return { text, negativePrompt: negativePrompt.trim(), config: { ...effectiveConfig, model, count: "1" }, references: generationMode === "edit" ? [...references] : [] };
    };

    const uploadImageReferences = (items: ReferenceImage[]) =>
        Promise.all(
            items.map(async (reference) => {
                if (reference.assetId) return reference.assetId;
                const response = await fetch(reference.dataUrl);
                if (!response.ok) throw new Error(`参考图 ${reference.name} 读取失败`);
                const asset = await uploadCreativeAsset(await response.blob(), reference.name, undefined, undefined, projectId || undefined);
                return asset.asset_id;
            }),
        );

    const submitImageJob = async (snapshot: { text: string; negativePrompt: string; config: AiConfig; references: ReferenceImage[] }, referenceAssetIds: string[], normalizedParameters: Record<string, unknown>) => {
        const requestStartedAt = performance.now();
        const job = await createCreativeJob({
            project_id: projectId || undefined,
            capability: "image_generation",
            model: snapshot.config.model,
            group: "auto",
            token: { strategy: "auto" },
            prompt: snapshot.text,
            negative_prompt: snapshot.negativePrompt || undefined,
            parameters: normalizedParameters,
            reference_asset_ids: referenceAssetIds,
            idempotency_key: randomId(),
        });
        const completed = await waitForCreativeJob(job.job_id, {
            onUpdate: (next) => {
                const pendingProgress = Math.max(1, Math.min(99, next.progress));
                setElapsedMs(performance.now() - requestStartedAt);
                setResults((current) => current.map((item) => (item.status === "pending" ? { ...item, error: `生成进度 ${pendingProgress}%` } : item)));
            },
        });
        if (completed.status !== "SUCCEEDED" && completed.status !== "PARTIAL_SUCCESS") throw new Error(completed.error || "生图任务未完成");
        if (completed.status === "PARTIAL_SUCCESS") message.warning(completed.error || "部分候选生成失败，已保留成功结果");
        const assets = await Promise.all((completed.result_asset_ids || []).map((assetId) => fetchCreativeAsset(assetId)));
        return assets.map((asset) => ({
            id: asset.asset_id,
            dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            durationMs: performance.now() - requestStartedAt,
            width: asset.width || 0,
            height: asset.height || 0,
            bytes: asset.size_bytes || 0,
            mimeType: asset.mime_type,
        }))[0];
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        try {
            const [referenceAssetIds, checkedEstimate] = await Promise.all([
                uploadImageReferences(snapshot.references),
                estimateCreativeJob({
                    capability: "image_generation",
                    model: snapshot.config.model,
                    group: "auto",
                    token: { strategy: "auto" },
                    parameters: { count: 1, size: snapshot.config.size, quality: snapshot.config.quality, background: snapshot.config.background },
                }),
            ]);
            const image = await submitImageJob(snapshot, referenceAssetIds, checkedEstimate.normalized_parameters);
            if (!image) throw new Error("任务没有返回图片素材");
            setResults((value) => updateResultAt(value, index, { status: "success", image }));
            await refreshLogs();
            message.success("重试成功");
        } catch {
            // submitImageJob 已经返回用户可见错误。
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <main className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden ${historyCollapsed ? "lg:grid-cols-[48px_minmax(0,1fr)]" : "lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]"}`}>
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:block">
                    {historyCollapsed ? (
                        <button
                            type="button"
                            className="flex size-full min-h-32 flex-col items-center gap-2 rounded-md py-2 text-xs text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
                            onClick={() => setHistoryCollapsed(false)}
                            aria-label="展开生成记录"
                            title="展开生成记录"
                        >
                            <ChevronRight className="size-4" />
                            <History className="size-4" />
                            <span className="[writing-mode:vertical-rl]">生成记录</span>
                        </button>
                    ) : (
                        <>
                            <div className="mb-2 flex justify-end">
                                <Button size="small" type="text" icon={<ChevronLeft className="size-4" />} onClick={() => setHistoryCollapsed(true)} aria-label="折叠生成记录">
                                    折叠
                                </Button>
                            </div>
                            <LogPanel
                                logs={logs}
                                selectedLogIds={selectedLogIds}
                                activeLogId={previewLog?.id}
                                onSelectedLogIdsChange={setSelectedLogIds}
                                onCreateSession={createSession}
                                onDeleteSelected={() => setDeleteConfirmOpen(true)}
                                onPreviewLog={(log) => void previewGenerationLog(log)}
                            />
                        </>
                    )}
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">生图工作台</h1>
                                </div>
                                <div className="flex shrink-0 gap-2 lg:hidden">
                                    <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                        记录
                                    </Button>
                                    <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        参数
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-5">
                            <CreativeReadinessNotice capabilityLabel="生图" hasModel={hasImageModel} hasToken={fyjitTokens.length > 0} />
                            <div>
                                <div className="mb-2 text-base font-semibold">生成模式</div>
                                <Segmented
                                    block
                                    value={generationMode}
                                    options={[
                                        { label: "文生图", value: "text" },
                                        { label: maxImageReferences > 0 ? "参考图编辑" : "参考图编辑（当前模型不支持）", value: "edit", disabled: maxImageReferences < 1 },
                                    ]}
                                    onChange={(value) => setGenerationMode(value as "text" | "edit")}
                                />
                            </div>
                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">提示词</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptDialogOpen(true)}>
                                            查看提示词库
                                        </Button>
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            查看我的资产
                                        </Button>
                                    </div>
                                </div>
                                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} placeholder="描述画面主体、风格、构图、光线和用途" />
                                <Input.TextArea className="mt-3" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} rows={3} placeholder="负向提示词（可选）：描述不希望出现的元素" />
                            </div>

                            {maxImageReferences > 0 && generationMode === "edit" ? (
                                <div ref={referenceSectionRef} className="min-w-0 scroll-mt-20">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-base font-semibold">参考图</span>
                                        <div className="flex gap-2">
                                            <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()}>
                                                剪切板
                                            </Button>
                                            <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                                上传
                                            </Button>
                                        </div>
                                    </div>
                                    <div
                                        className={`hover-scrollbar hover-scrollbar-hint relative flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${isReferenceDragActive ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 dark:border-stone-700"}`}
                                        onDragEnter={(event) => {
                                            event.preventDefault();
                                            dragDepthRef.current += 1;
                                            if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                                        }}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={(event) => {
                                            event.preventDefault();
                                            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                                            if (!dragDepthRef.current) setIsReferenceDragActive(false);
                                        }}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            dragDepthRef.current = 0;
                                            setIsReferenceDragActive(false);
                                            void addReferences(event.dataTransfer.files);
                                        }}
                                        onWheel={(event) => {
                                            if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                            event.preventDefault();
                                            event.currentTarget.scrollLeft += event.deltaY;
                                        }}
                                    >
                                        {references.map((item, index) => (
                                            <div key={item.id} className="group relative size-20 shrink-0 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800">
                                                <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                                                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                                <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                                <button
                                                    type="button"
                                                    className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
                                                    onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                    aria-label="移除参考图"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {!references.length ? (
                                            <div className="flex min-w-full items-center justify-center text-sm text-stone-500 dark:text-stone-400">
                                                {isReferenceDragActive ? "松开即可添加参考图" : `暂无参考图，可将图片拖到这里，最多 ${maxImageReferences} 张`}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900 sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model)} · {effectiveConfig.size} · {effectiveConfig.quality}
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    调整
                                </Button>
                            </div>

                            <div className="hidden sm:block">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">模型与参数</span>
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={parametersCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                                        onClick={() => setParametersCollapsed(!parametersCollapsed)}
                                        aria-expanded={!parametersCollapsed}
                                    >
                                        {parametersCollapsed ? "展开" : "折叠"}
                                    </Button>
                                </div>
                                {!parametersCollapsed ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <GenerationSettings config={effectiveConfig} model={model} projectId={projectId} onProjectChange={setProjectId} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className="w-full rounded-lg border border-dashed border-stone-300 px-3 py-2 text-left text-sm text-stone-500 transition hover:border-stone-500 hover:text-stone-900 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-500 dark:hover:text-stone-100"
                                        onClick={() => setParametersCollapsed(false)}
                                    >
                                        参数栏已折叠；点击恢复当前模型设置
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="sticky bottom-0 z-20 mt-auto space-y-3 bg-card pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:pb-0 sm:pt-6">
                            <CreativeEstimateSummary
                                estimate={estimate}
                                loading={estimateLoading}
                                error={estimateError}
                                requestedParameters={estimateParameters}
                                referenceCounts={{ images: references.length }}
                                tokenLabel={estimateTokenLabel}
                                profile={modelProfile}
                            />
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                                开始生成
                            </Button>
                        </div>
                    </div>

                    <FyjitSurface className="thin-scrollbar p-4 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">生成结果</h2>
                            </div>
                            {running ? <Tag className="m-0 px-2 py-1">等待 {formatDuration(elapsedMs)}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                                {results.map((result, index) =>
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard
                                            key={result.id}
                                            image={result.image}
                                            index={index}
                                            compareImage={references[0]?.dataUrl}
                                            onCompare={(before, after) => setComparison({ before, after })}
                                            onEdit={addResultToReferences}
                                            onDownload={downloadImage}
                                            onSaveAsset={saveResultToAssets}
                                            onSendToVideo={sendResultToVideo}
                                        />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || "生成失败"} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <FyjitEmptyState
                                icon={ImagePlus}
                                title="还没有生成图片"
                                description="输入提示词或从素材与提示词库开始，生成结果会自动保存在 FYJIT。"
                                className="min-h-[320px] lg:min-h-[560px]"
                                actions={
                                    <>
                                        <Button size="small" onClick={() => setPrompt("晨雾中的未来城市，电影感光影，广角构图，细节丰富")}>
                                            使用示例
                                        </Button>
                                        <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptDialogOpen(true)}>
                                            提示词库
                                        </Button>
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            选择素材
                                        </Button>
                                    </>
                                }
                            />
                        )}
                    </FyjitSurface>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title="生成记录" placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            <Drawer title="参数" placement="bottom" size="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} projectId={projectId} onProjectChange={setProjectId} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} onSelectNegativePrompt={setNegativePrompt} />
            <AssetPickerModal
                open={assetPickerOpen}
                defaultTab="my-assets"
                acceptedTypes={maxImageReferences > 0 ? ["TEXT", "IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"] : ["TEXT"]}
                compatibilityHint={maxImageReferences > 0 ? `当前模型最多可使用 ${maxImageReferences} 张参考图，也可插入文本作为提示词。` : "当前模型仅支持文生图，可插入文本素材作为提示词。"}
                onInsert={(payload) => void insertPickedAsset(payload)}
                onClose={() => setAssetPickerOpen(false)}
            />
            <Modal title="删除生成记录" open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？
            </Modal>
            <Modal title="参考图与生成结果对比" open={Boolean(comparison)} onCancel={() => setComparison(undefined)} footer={null} width={960} destroyOnHidden>
                {comparison ? (
                    <div className="grid gap-4 pt-2 sm:grid-cols-2">
                        <figure>
                            <figcaption className="mb-2 text-sm font-medium">参考图</figcaption>
                            <img src={comparison.before} alt="生成前参考图" className="aspect-square w-full rounded-lg bg-stone-100 object-contain dark:bg-stone-900" />
                        </figure>
                        <figure>
                            <figcaption className="mb-2 text-sm font-medium">生成结果</figcaption>
                            <img src={comparison.after} alt="生成后结果" className="aspect-square w-full rounded-lg bg-stone-100 object-contain dark:bg-stone-900" />
                        </figure>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}

function GenerationSettings({
    config,
    model,
    projectId,
    onProjectChange,
    updateConfig,
    openConfigDialog,
}: {
    config: AiConfig;
    model: string;
    projectId: string;
    onProjectChange: (value: string) => void;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">模型</span>
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("imageModel", value)} capability="image" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">所属项目（可选）</span>
                <ProjectPicker value={projectId} onChange={onProjectChange} className="w-full" />
            </label>
            <div className="col-span-2">
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" maxCount={10} />
            </div>
        </>
    );
}

function ResultImageCard({
    image,
    index,
    compareImage,
    onCompare,
    onEdit,
    onDownload,
    onSaveAsset,
    onSendToVideo,
}: {
    image: GeneratedImage;
    index: number;
    compareImage?: string;
    onCompare: (before: string, after: string) => void;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    onSendToVideo: (image: GeneratedImage) => void;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <Image src={image.dataUrl} alt={`生成结果 ${index + 1}`} className="aspect-square object-cover" />
            <div className="space-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
                        {image.width}x{image.height}
                    </span>
                    <span>{formatBytes(image.bytes)}</span>
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                    <Tooltip title="添加到资产">
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)}>
                            添加到资产
                        </Button>
                    </Tooltip>
                    <Tooltip title="加入参考图">
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)}>
                            加入参考图
                        </Button>
                    </Tooltip>
                    <Tooltip title="下载">
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)}>
                            下载
                        </Button>
                    </Tooltip>
                    {compareImage ? (
                        <Tooltip title="与首张参考图对比">
                            <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<GitCompare className="size-3.5" />} onClick={() => onCompare(compareImage, image.dataUrl)}>
                                前后对比
                            </Button>
                        </Tooltip>
                    ) : null}
                    <Tooltip title="送入视频创作台">
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<VideoIcon className="size-3.5" />} onClick={() => void onSendToVideo(image)}>
                            送入视频
                        </Button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function PendingImageCard() {
    return <FyjitTaskStatus tone="pending" title="生成中" description="任务已进入 FYJIT 队列；关闭页面后仍可从历史记录恢复。" className="aspect-square" />;
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <FyjitTaskStatus
            tone="error"
            title="生成失败"
            description={
                <>
                    <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-1 !text-xs !text-inherit">
                        {error}
                    </Typography.Paragraph>
                    <span>是否产生消费以 FYJIT 使用记录为准；重试会创建新的独立任务。</span>
                </>
            }
            actions={
                <Button size="small" danger onClick={onRetry}>
                    重试
                </Button>
            }
            className="aspect-square"
        />
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function updateResultById(results: GenerationResult[], id: string, next: Partial<GenerationResult>) {
    return results.map((item) => (item.id === id ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold">生成记录</h2>
                </div>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    新建
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? "取消" : "全选"}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    删除
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">暂无生成记录</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const thumbnails = (log.thumbnails || []).filter(Boolean).slice(0, 4);

    return (
        <div className={`overflow-hidden rounded-lg border transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}>
            <button type="button" className="block w-full p-2 text-left" onClick={onClick}>
                <div className="grid grid-cols-[minmax(128px,1fr)_auto] gap-2">
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                        <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                            {thumbnails.length ? (
                                <div className="mt-2 flex gap-1 overflow-hidden">
                                    {thumbnails.map((image, index) => (
                                        <img key={`${log.id}-${index}`} src={image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div className="grid justify-items-end gap-2">
                        <div className="flex gap-1">
                            {!log.successCount && !log.failCount ? (
                                <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "排队中" || log.status === "运行中" ? "processing" : "default"}>
                                    {log.status}
                                </Tag>
                            ) : null}
                            {log.successCount ? (
                                <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="blue">
                                    成功 {log.successCount}
                                </Tag>
                            ) : null}
                            {log.failCount ? (
                                <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "部分成功" ? "orange" : "red"}>
                                    {log.status === "审核拒绝" ? "审核拒绝" : log.status === "部分成功" ? "部分失败" : "失败"} {log.failCount}
                                </Tag>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.imageCount} 张</Tag>
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                                {formatDuration(log.durationMs)}
                            </Tag>
                        </div>
                        <div className="flex justify-end">
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.time}</Tag>
                        </div>
                    </div>
                </div>
            </button>
            {log.task.billing_status && log.task.billing_status !== "PENDING" ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-2 py-1.5 text-xs dark:border-stone-800">
                    <span>
                        实际消费 ${Number(log.task.actual_cost || 0).toFixed(4)} · {log.task.actual_quota || 0} 配额
                    </span>
                    {log.task.usage_request_id ? (
                        <a className="font-medium underline underline-offset-2" href={`/usage-logs/common?requestId=${encodeURIComponent(log.task.usage_request_id)}`}>
                            查看使用记录
                        </a>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

async function creativeJobToImageLog(job: CreativeJob): Promise<GenerationLog> {
    const [assets, referenceAssets] = await Promise.all([
        Promise.all((job.result_asset_ids || []).map((assetId) => fetchCreativeAsset(assetId).catch(() => null))),
        Promise.all((job.reference_asset_ids || []).map((assetId) => fetchCreativeAsset(assetId).catch(() => null))),
    ]);
    const images: GeneratedImage[] = assets
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
        .map((asset) => ({
            id: asset.asset_id,
            dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            durationMs: Math.max(0, ((job.finished_at || job.updated_at) - (job.started_at || job.created_at)) * 1000),
            width: asset.width || 0,
            height: asset.height || 0,
            bytes: asset.size_bytes || 0,
            mimeType: asset.mime_type,
        }));
    const config = normalizeLogConfig({
        model: job.model,
        imageCount: Number(job.parameters.count) || images.length || 1,
        size: String(job.parameters.size || ""),
        quality: String(job.parameters.quality || ""),
    });
    const requestedCount = Number(job.parameters.count) || images.length || 1;
    return {
        id: job.job_id,
        createdAt: job.created_at * 1000,
        title: job.prompt.slice(0, 12) || "未命名",
        prompt: job.prompt,
        negativePrompt: job.negative_prompt || "",
        time: new Date(job.created_at * 1000).toLocaleString("zh-CN", { hour12: false }),
        model: job.model,
        config,
        references: referenceAssets
            .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
            .filter((asset) => ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type))
            .map((asset) => ({
                id: asset.asset_id,
                assetId: asset.asset_id,
                name: asset.title || asset.asset_id,
                type: asset.mime_type || "image/png",
                dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            })),
        durationMs: Math.max(0, ((job.finished_at || job.updated_at) - (job.started_at || job.created_at)) * 1000),
        successCount: images.length,
        failCount: job.status === "SUCCEEDED" || job.status === "PARTIAL_SUCCESS" ? Math.max(0, requestedCount - images.length) : ["FAILED", "CANCELLED", "EXPIRED", "MODERATION_REJECTED"].includes(job.status) ? requestedCount : 0,
        imageCount: requestedCount,
        size: config.size,
        quality: config.quality,
        status: creativeImageStatusLabel(job.status),
        images,
        thumbnails: images.map((image) => image.dataUrl),
        task: job,
        error: job.error,
    };
}

function creativeImageStatusLabel(status: CreativeJob["status"]): GenerationLog["status"] {
    switch (status) {
        case "CREATED":
        case "QUEUED":
            return "排队中";
        case "RUNNING":
            return "运行中";
        case "SUCCEEDED":
            return "成功";
        case "PARTIAL_SUCCESS":
            return "部分成功";
        case "MODERATION_REJECTED":
            return "审核拒绝";
        case "CANCELLED":
            return "已取消";
        case "EXPIRED":
            return "已超时";
        default:
            return "失败";
    }
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}
