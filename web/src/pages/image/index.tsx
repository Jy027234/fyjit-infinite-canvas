import { ArrowLeft, ArrowRight, BookOpen, ClipboardPaste, Download, FolderPlus, GitCompare, ImagePlus, PenLine, Sparkles, Trash2, Upload, VideoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Drawer, Image, Input, Modal, Segmented, Tag, Tooltip, Typography } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { saveAs } from "file-saver";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { CreativeEstimateSummary } from "@/components/creative-estimate-summary";
import { CreativeGenerationStatus, creativeJobPendingSnapshot, summarizeCreativePendingResults, type CreativeGenerationPhase } from "@/components/creative-generation-status";
import { CreativeHistoryPanel } from "@/components/creative-history-panel";
import { CreativeReadinessNotice } from "@/components/creative-readiness-notice";
import { CreativeResultCardShell } from "@/components/creative-result-card-shell";
import { creativeJobStatusLabel, CreativeStatusTag, type CreativeHistoryStatus } from "@/components/creative-status-tag";
import {
    CreativeDraftNotice,
    CreativeFieldHeader,
    CreativeParametersSection,
    CreativeSubmitDock,
    CreativeWorkbenchComposer,
    CreativeWorkbenchContent,
    CreativeWorkbenchHeader,
    CreativeWorkbenchHistoryRail,
    CreativeWorkbenchMain,
    CreativeWorkbenchResult,
    CreativeWorkbenchRoot,
} from "@/components/creative-workbench-layout";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { ProjectPicker } from "@/components/project-picker";
import { ReferencePromptMentions } from "@/components/reference-prompt-mentions";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { FyjitEmptyState, FyjitTaskStatus } from "@/components/fyjit/creative-ui";
import { canvasThemes } from "@/lib/canvas-theme";
import { randomId } from "@/lib/utils";
import { buildImageReferencePromptText, imageReferenceLabel } from "@/lib/image-reference-prompt";
import { modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useWorkbenchLayoutStore } from "@/stores/use-workbench-layout-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { createCreativeIntent, createCreativeJob, estimateCreativeJob, fetchCreativeAsset, uploadCreativeAsset, waitForCreativeJob, type CreativeAsset, type CreativeAssetSummary, type CreativeJob } from "@/services/api/creative";
import { clearCreativeDraft, loadCreativeDraft, saveCreativeDraft, sanitizeCreativeDraftReference, type ImageWorkbenchDraft } from "@/services/creative-draft-storage";
import { useCreativeAssetDetails } from "@/hooks/use-creative-asset-details";
import { creativeAssetDetailQueryOptions, isCreativeAssetDetail, uniqueCreativeAssetIds } from "@/services/creative-asset-details";
import { upsertCreativeAssetListCache } from "@/services/creative-asset-list";
import { creativeAssetSummaryFromDetail } from "@/services/creative-job-history";
import { uploadImage } from "@/services/image-storage";
import { readReferenceBlob } from "@/services/reference-storage";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { useCreativeIntentStore } from "@/stores/use-creative-intent-store";
import { useFyjitStore } from "@/stores/use-fyjit-store";
import { useCreativeEstimate } from "@/hooks/use-creative-estimate";
import { useCreativeJobHistory } from "@/hooks/use-creative-job-history";
import { useReferenceMentionInsertion } from "@/hooks/use-reference-mention-insertion";
import type { ReferenceImage } from "@/types/image";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    thumbnailUrl?: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed" | "asset-detail-error";
    phase?: CreativeGenerationPhase;
    progress?: number;
    image?: GeneratedImage;
    error?: string;
    jobId?: string;
    assetIds?: string[];
    durationMs?: number;
    retrying?: boolean;
};

type ImageSubmitResult = { kind: "success"; image: GeneratedImage } | { kind: "asset-detail-error"; jobId: string; assetIds: string[]; durationMs: number; error: string };

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
    status: CreativeHistoryStatus;
    images: GeneratedImage[];
    thumbnails: string[];
    task: CreativeJob;
    fullAssetIds?: string[];
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type ImageDraftUndoSnapshot = {
    prompt: string;
    negativePrompt: string;
    projectId: string;
    generationMode: "text" | "edit";
    model: string;
    quality: string;
    size: string;
    count: string;
    background: string;
    references: ReferenceImage[];
    results: GenerationResult[];
};

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";
const HISTORY_PAGE_SIZE = 20;

export default function ImagePage() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
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
    const { textAreaRef: promptInputRef, insertReference: insertPromptReference } = useReferenceMentionInsertion(prompt, setPrompt);
    const [negativePrompt, setNegativePrompt] = useState("");
    const activeIntent = useCreativeIntentStore((state) => state.activeIntent);
    const fyjitModels = useFyjitStore((state) => state.models);
    const fyjitTokens = useFyjitStore((state) => state.tokens);
    const currentUserId = useFyjitStore((state) => state.bootstrap?.user.id);
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [generationMode, setGenerationMode] = useState<"text" | "edit">("text");
    const [projectId, setProjectId] = useState("");
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const jobHistory = useCreativeJobHistory({ capability: "image_generation", pageSize: HISTORY_PAGE_SIZE });
    const updateCompletedJobCache = (job: CreativeJob, assets: CreativeAsset[] = []) => {
        const summaryById = new Map(jobHistory.assets.map((summary) => [summary.asset_id, summary]));
        jobHistory.updateHistoryCache({
            job,
            assets: assets.map((asset) => creativeAssetSummaryFromDetail(asset, summaryById.get(asset.asset_id))),
            insertIfMissing: true,
        });
        for (const asset of assets) upsertCreativeAssetListCache(queryClient, asset);
    };
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [undoDraft, setUndoDraft] = useState<ImageDraftUndoSnapshot | null>(null);
    const [comparison, setComparison] = useState<{ before: string; after: string }>();
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const referenceSectionRef = useRef<HTMLDivElement>(null);
    const draftHydratedRef = useRef(false);
    const draftScopeRef = useRef("");
    const skipNextDraftLoadRef = useRef(false);
    const intentAppliedRef = useRef(false);
    const draftWriteRevisionRef = useRef(0);
    const previewResultsBeforeRef = useRef<GenerationResult[] | null>(null);
    const resumePendingHistoryRef = useRef(true);
    const historyConversionRevisionRef = useRef(0);
    const previewAssetIds = useMemo(
        () => (previewLog ? uniqueCreativeAssetIds([...(previewLog.task?.result_asset_ids || []), ...(previewLog.task?.reference_asset_ids || [])]).filter((assetId) => !previewLog.fullAssetIds?.includes(assetId)) : []),
        [previewLog],
    );
    const previewAssetDetails = useCreativeAssetDetails(previewAssetIds, Boolean(previewLog));
    const detailedPreviewLog = useMemo(() => (previewLog ? hydrateImageLogWithAssets(previewLog, previewAssetDetails.assets) : null), [previewAssetDetails.assets, previewLog]);

    const imageModels = fyjitModels.filter((item) => item.capabilities.includes("image_generation"));
    const preferredModel = effectiveConfig.imageModel || effectiveConfig.model;
    const model = imageModels.some((item) => item.id === preferredModel) ? preferredModel : imageModels[0]?.id || "";
    const hasImageModel = fyjitModels.some((item) => item.id === model && item.capabilities.includes("image_generation"));
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));
    const modelProfile = fyjitModels.find((item) => item.id === model)?.capability_profiles.image_generation;
    const maxImageReferences = modelProfile?.max_reference_images ?? 0;
    const inputModes = modelProfile?.input_modes || [];
    const supportsTextGeneration = !inputModes.length || inputModes.includes("text_to_image");
    const supportsImageEditing = maxImageReferences > 0 && (!inputModes.length || inputModes.includes("image_edit"));
    const promptReferences = references.map((reference, index) => ({ id: reference.id, label: imageReferenceLabel(index), title: reference.name }));
    const estimateParameters = { count: generationCount, size: effectiveConfig.size, quality: effectiveConfig.quality, background: effectiveConfig.background };
    const { estimate, loading: estimateLoading, error: estimateError } = useCreativeEstimate(model && fyjitTokens.length ? { capability: "image_generation", model, group: "auto", token: { strategy: "auto" }, parameters: estimateParameters } : null);
    const canGenerate = Boolean(
        prompt.trim() &&
        hasImageModel &&
        fyjitTokens.length &&
        estimate?.available &&
        !estimateLoading &&
        !estimateError &&
        ((generationMode === "text" && supportsTextGeneration) || (generationMode === "edit" && supportsImageEditing && references.length)),
    );
    const pendingSummary = summarizeCreativePendingResults(results);
    const estimateTokenLabel = estimate?.token_id ? `${fyjitTokens.find((item) => item.id === estimate.token_id)?.name || "本站 Token"} (#${estimate.token_id})` : "自动选择可用的本站 Token";

    useEffect(() => {
        if (!supportsImageEditing && generationMode === "edit" && supportsTextGeneration) {
            setGenerationMode("text");
            setReferences([]);
        } else if (!supportsTextGeneration && supportsImageEditing && generationMode === "text") {
            setGenerationMode("edit");
        }
    }, [generationMode, supportsImageEditing, supportsTextGeneration]);

    useEffect(() => {
        if (generationMode !== "text" || !model.toLowerCase().includes("wan2.6")) return;
        const size = effectiveConfig.size.toLowerCase();
        if (!size.includes("2048") && !size.includes("3840")) return;
        updateConfig("size", size.includes("1152x2048") || size.includes("2160x3840") ? "9:16" : size.includes("2048x1152") || size.includes("3840x2160") ? "16:9" : "1:1");
    }, [effectiveConfig.size, generationMode, model, updateConfig]);

    useEffect(() => {
        if (activeIntent?.kind !== "image") return;
        const intent = useCreativeIntentStore.getState().consumeFor("image");
        if (intent) {
            intentAppliedRef.current = true;
            skipNextDraftLoadRef.current = Boolean(intent.project_id && intent.project_id !== projectId);
        }
        if (intent?.prompt) setPrompt(intent.prompt);
        if (intent?.negative_prompt) setNegativePrompt(intent.negative_prompt);
        if (intent?.project_id) setProjectId(intent.project_id);
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
                                    thumbnailUrl: asset.thumbnail_path,
                                })),
                        ].slice(0, maxImageReferences),
                    ),
                )
                .catch((error) => message.error(error instanceof Error ? error.message : "创作素材恢复失败"));
        }
    }, [activeIntent, message]);

    useEffect(() => {
        const userId = String(currentUserId || "").trim();
        if (!userId) return;
        const scope = `${userId}:${projectId}`;
        if (intentAppliedRef.current) {
            intentAppliedRef.current = false;
            draftScopeRef.current = scope;
            draftHydratedRef.current = true;
            return;
        }
        if (skipNextDraftLoadRef.current) {
            skipNextDraftLoadRef.current = false;
            draftScopeRef.current = scope;
            draftHydratedRef.current = true;
            return;
        }
        const previousScope = draftScopeRef.current;
        draftHydratedRef.current = false;
        if (previousScope && previousScope !== scope) {
            setPrompt("");
            setNegativePrompt("");
            setReferences([]);
            setGenerationMode("text");
        }
        let cancelled = false;
        void loadCreativeDraft<ImageWorkbenchDraft>(userId, "image", projectId).then(async (draft) => {
            if (cancelled) return;
            if (draft) {
                setPrompt(draft.prompt);
                setNegativePrompt(draft.negativePrompt);
                setGenerationMode(draft.generationMode);
                if (draft.model) updateConfig("imageModel", draft.model);
                updateConfig("quality", draft.config.quality);
                updateConfig("size", draft.config.size);
                updateConfig("count", draft.config.count);
                updateConfig("background", draft.config.background);
                const draftMaxImageReferences = draft.model ? (fyjitModels.find((item) => item.id === draft.model)?.capability_profiles.image_generation?.max_reference_images ?? maxImageReferences) : maxImageReferences;
                const assets = await Promise.all(
                    draft.references.map(async (reference): Promise<ReferenceImage | null> => {
                        try {
                            const asset = await fetchCreativeAsset(reference.assetId);
                            if (!["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type)) return null;
                            return {
                                id: asset.asset_id,
                                assetId: asset.asset_id,
                                name: asset.title || reference.name,
                                type: asset.mime_type || reference.type || "image/png",
                                dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
                                thumbnailUrl: asset.thumbnail_path,
                            } satisfies ReferenceImage;
                        } catch {
                            return null;
                        }
                    }),
                );
                if (cancelled) return;
                const restoredReferences = assets.filter((asset): asset is ReferenceImage => Boolean(asset));
                setReferences(restoredReferences.slice(0, draftMaxImageReferences));
                if (restoredReferences.length !== draft.references.length) message.info("草稿中的部分参考素材已失效，请重新选择");
            }
            if (!cancelled) {
                draftScopeRef.current = scope;
                draftHydratedRef.current = true;
            }
        });
        return () => {
            cancelled = true;
        };
    }, [currentUserId, projectId, fyjitModels, maxImageReferences]);

    useEffect(() => {
        const userId = String(currentUserId || "").trim();
        const scope = `${userId}:${projectId}`;
        if (!userId || !draftHydratedRef.current || draftScopeRef.current !== scope) return;
        const revision = draftWriteRevisionRef.current;
        const timer = window.setTimeout(() => {
            if (revision !== draftWriteRevisionRef.current) return;
            const referencesToPersist = references
                .map((reference) => sanitizeCreativeDraftReference({ assetId: reference.assetId, name: reference.name, type: reference.type, kind: "image" }))
                .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
            const draft: ImageWorkbenchDraft = {
                version: 1,
                kind: "image",
                projectId,
                prompt,
                negativePrompt,
                generationMode,
                model,
                config: {
                    quality: effectiveConfig.quality,
                    size: effectiveConfig.size,
                    count: effectiveConfig.count,
                    background: effectiveConfig.background,
                },
                references: referencesToPersist,
                updatedAt: Date.now(),
            };
            void saveCreativeDraft(userId, "image", projectId, draft);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [currentUserId, projectId, prompt, negativePrompt, generationMode, model, effectiveConfig.quality, effectiveConfig.size, effectiveConfig.count, effectiveConfig.background, references]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

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

        let checkedEstimate: Awaited<ReturnType<typeof estimateCreativeJob>>;
        try {
            checkedEstimate = await estimateCreativeJob({
                capability: "image_generation",
                model: snapshot.config.model,
                group: "auto",
                token: { strategy: "auto" },
                parameters: { count: 1, size: snapshot.config.size, quality: snapshot.config.quality, background: snapshot.config.background },
            });
            if (!checkedEstimate.available) throw new Error(checkedEstimate.message || "当前模型尚未完成计费配置");
        } catch (requestError) {
            const error = requestError instanceof Error ? requestError.message : "费用与账号状态校验失败";
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: generationCount, error });
            message.error(error);
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
        const resultIds = Array.from({ length: generationCount }, () => nanoid());
        setResults(resultIds.map((id) => ({ id, status: "pending", phase: "preparing" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        let successCount = 0;
        let failCount = 0;
        try {
            const referenceAssetIds = await uploadImageReferences(snapshot.references);
            const outcomes = await Promise.all(
                resultIds.map(async (resultId, index) => {
                    try {
                        const submitted = await submitImageJob(snapshot, referenceAssetIds, checkedEstimate.normalized_parameters, (job) =>
                            setResults((value) => updateResultById(value, resultId, { ...creativeJobPendingSnapshot(job.status, job.progress), error: undefined })),
                        );
                        if (submitted.kind === "asset-detail-error") {
                            setResults((value) =>
                                updateResultById(value, resultId, {
                                    status: "asset-detail-error",
                                    error: submitted.error,
                                    jobId: submitted.jobId,
                                    assetIds: submitted.assetIds,
                                    durationMs: submitted.durationMs,
                                    phase: undefined,
                                    progress: undefined,
                                }),
                            );
                            return { kind: "asset-detail-error" as const, index };
                        }
                        setResults((value) => updateResultById(value, resultId, { status: "success", image: submitted.image }));
                        return { kind: "success" as const, index };
                    } catch (requestError) {
                        const error = requestError instanceof Error ? requestError.message : "生成失败";
                        setResults((value) => updateResultById(value, resultId, { status: "failed", error }));
                        return { kind: "failed" as const, error, index };
                    }
                }),
            );
            const detailErrorCount = outcomes.filter((outcome) => outcome.kind === "asset-detail-error").length;
            successCount = outcomes.filter((outcome) => outcome.kind !== "failed").length;
            failCount = outcomes.filter((outcome) => outcome.kind === "failed").length;
            const firstError = outcomes.find((outcome) => outcome.kind === "failed");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : firstError?.error });
            if (detailErrorCount && failCount) message.warning(`已完成 ${successCount} 张，其中 ${detailErrorCount} 张结果详情加载失败，${failCount} 张生成失败`);
            else if (detailErrorCount) message.warning(`任务已完成，但 ${detailErrorCount} 张结果详情加载失败，可重试加载`);
            else if (successCount && failCount) message.warning(`已生成 ${successCount} 张，${failCount} 张失败，可逐张重试`);
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
            setReferences((value) => [...value, { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: "image/png", dataUrl: payload.dataUrl, thumbnailUrl: payload.thumbnailUrl }].slice(0, maxImageReferences));
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
        setPreviewLog(null);
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
    };

    useEffect(() => {
        let cancelled = false;
        const revision = ++historyConversionRevisionRef.current;
        const shouldResume = resumePendingHistoryRef.current;
        resumePendingHistoryRef.current = true;
        const fetchAsset = createSummaryAssetFetcher(jobHistory.assets);
        void Promise.all(jobHistory.items.map((job) => creativeJobToImageLog(job, fetchAsset))).then((nextLogs) => {
            if (cancelled || historyConversionRevisionRef.current !== revision) return;
            setLogs(nextLogs);
            if (shouldResume) {
                for (const log of nextLogs) {
                    if (log.status === "排队中" || log.status === "运行中") void pollImageLog(log);
                }
            }
        });
        return () => {
            cancelled = true;
        };
    }, [jobHistory.assets, jobHistory.items]);

    const pollImageLog = async (log: GenerationLog) => {
        if (activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        try {
            const completed = await waitForCreativeJob(log.id, { intervalMs: 1500, onUpdate: (next) => updateCompletedJobCache(next) });
            updateCompletedJobCache(completed);
            const terminal = await creativeJobToImageLog(completed, createSummaryAssetFetcher(jobHistory.assets));
            setLogs((current) =>
                current.some((item) => item.id === terminal.id)
                    ? current.map((item) =>
                          item.id === terminal.id
                              ? {
                                    ...terminal,
                                    references: terminal.references.length ? terminal.references : item.references,
                                    images: terminal.images.length ? terminal.images : item.images,
                                    thumbnails: terminal.thumbnails.length ? terminal.thumbnails : item.thumbnails,
                                }
                              : item,
                      )
                    : [terminal, ...current],
            );
            setPreviewLog((current) =>
                current?.id === terminal.id
                    ? {
                          ...terminal,
                          references: terminal.references.length ? terminal.references : current.references,
                          images: terminal.images.length ? terminal.images : current.images,
                          thumbnails: terminal.thumbnails.length ? terminal.thumbnails : current.thumbnails,
                      }
                    : current,
            );
            const resultAssets = await Promise.all(uniqueCreativeAssetIds(completed.result_asset_ids || []).map((assetId) => queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId)).catch(() => null)));
            const assetsById = new Map(resultAssets.filter((asset): asset is CreativeAsset => Boolean(asset)).map((asset) => [asset.asset_id, asset]));
            const next = await creativeJobToImageLog(completed, async (assetId) => {
                const detail = assetsById.get(assetId);
                if (detail) return detail;
                const summary = jobHistory.assets.find((asset) => asset.asset_id === assetId);
                return summary || queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId)).catch(() => null);
            });
            updateCompletedJobCache(completed, Array.from(assetsById.values()));
            setLogs((current) => (current.some((item) => item.id === next.id) ? current.map((item) => (item.id === next.id ? next : item)) : [next, ...current]));
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
        if (!previewResultsBeforeRef.current) {
            previewResultsBeforeRef.current = results.map((result) => ({ ...result, image: result.image ? { ...result.image } : undefined }));
        }
        setPreviewLog(log);
        setLogsOpen(false);
        setResults(imageResultsFromLog(log));
    };

    useEffect(() => {
        if (!previewLog || !detailedPreviewLog || !previewAssetDetails.assets.size) return;
        const nextResults = imageResultsFromLog(detailedPreviewLog);
        setResults((current) => (imageResultSignature(current) === imageResultSignature(nextResults) ? current : nextResults));
    }, [detailedPreviewLog, previewAssetDetails.assets.size, previewLog]);

    const applyPreviewLog = () => {
        if (!previewLog) return;
        const log = detailedPreviewLog || previewLog;
        modal.confirm({
            title: "用于再次创作",
            content: "这会替换当前未提交的提示词、参考素材和参数设置，是否继续？",
            okText: "替换并继续",
            cancelText: "取消",
            onOk: () => {
                setUndoDraft({
                    prompt,
                    negativePrompt,
                    projectId,
                    generationMode,
                    model,
                    quality: effectiveConfig.quality,
                    size: effectiveConfig.size,
                    count: effectiveConfig.count,
                    background: effectiveConfig.background,
                    references: references.map((reference) => ({ ...reference })),
                    results: (previewResultsBeforeRef.current || results).map((result) => ({ ...result, image: result.image ? { ...result.image } : undefined })),
                });
                const nextProjectId = log.task?.project_id || "";
                skipNextDraftLoadRef.current = nextProjectId !== projectId;
                setProjectId(nextProjectId);
                setPrompt(log.prompt);
                setNegativePrompt(log.negativePrompt);
                setReferences((log.references || []).slice(0, maxImageReferences));
                setGenerationMode(log.references?.length ? "edit" : "text");
                if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
                if (log.config.quality) updateConfig("quality", log.config.quality);
                if (log.config.size) updateConfig("size", log.config.size);
                if (log.config.count) updateConfig("count", log.config.count);
                previewResultsBeforeRef.current = null;
                message.success("已将历史参数填入当前创作草稿");
            },
        });
    };

    const undoPreviewApply = () => {
        if (!undoDraft) return;
        const previous = undoDraft;
        skipNextDraftLoadRef.current = previous.projectId !== projectId;
        setProjectId(previous.projectId);
        setPrompt(previous.prompt);
        setNegativePrompt(previous.negativePrompt);
        setGenerationMode(previous.generationMode);
        setReferences(previous.references.map((reference) => ({ ...reference })));
        setResults(previous.results.map((result) => ({ ...result, image: result.image ? { ...result.image } : undefined })));
        updateConfig("imageModel", previous.model);
        updateConfig("quality", previous.quality);
        updateConfig("size", previous.size);
        updateConfig("count", previous.count);
        updateConfig("background", previous.background);
        setPreviewLog(null);
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
        message.success("已撤销历史参数替换");
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
        if (generationMode === "text" && !supportsTextGeneration) {
            message.error("当前模型不支持文生图，请切换到参考图编辑模式");
            return null;
        }
        const selectedReferences = generationMode === "edit" ? [...references] : [];
        return {
            text: buildImageReferencePromptText(text, selectedReferences),
            negativePrompt: negativePrompt.trim(),
            config: { ...effectiveConfig, model, count: "1" },
            references: selectedReferences,
        };
    };

    const uploadImageReferences = (items: ReferenceImage[]) =>
        Promise.all(
            items.map(async (reference) => {
                if (reference.assetId) return reference.assetId;
                const asset = await uploadCreativeAsset(await readReferenceBlob({ name: reference.name, url: reference.dataUrl, storageKey: reference.storageKey }), reference.name, undefined, undefined, projectId || undefined);
                return asset.asset_id;
            }),
        );

    const submitImageJob = async (
        snapshot: { text: string; negativePrompt: string; config: AiConfig; references: ReferenceImage[] },
        referenceAssetIds: string[],
        normalizedParameters: Record<string, unknown>,
        onStatus: (job: CreativeJob) => void,
    ): Promise<ImageSubmitResult> => {
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
        onStatus(job);
        draftWriteRevisionRef.current += 1;
        await clearCreativeDraft(currentUserId, "image", projectId);
        activeLogIdsRef.current.add(job.job_id);
        updateCompletedJobCache(job);
        let completed: CreativeJob;
        try {
            completed = await waitForCreativeJob(job.job_id, {
                onUpdate: (next) => {
                    updateCompletedJobCache(next);
                    setElapsedMs(performance.now() - requestStartedAt);
                    onStatus(next);
                },
            });
        } catch (error) {
            activeLogIdsRef.current.delete(job.job_id);
            throw error;
        }
        activeLogIdsRef.current.delete(job.job_id);
        updateCompletedJobCache(completed);
        if (completed.status !== "SUCCEEDED" && completed.status !== "PARTIAL_SUCCESS") throw new Error(completed.error || "生图任务未完成");
        if (completed.status === "PARTIAL_SUCCESS") message.warning(completed.error || "部分候选生成失败，已保留成功结果");
        const assetIds = uniqueCreativeAssetIds(completed.result_asset_ids || []);
        try {
            const assets = await Promise.all(assetIds.map((assetId) => queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId))));
            updateCompletedJobCache(completed, assets);
            const asset = assets[0];
            if (!asset) throw new Error("任务没有返回图片素材");
            return { kind: "success", image: generatedImageFromAsset(asset, performance.now() - requestStartedAt) };
        } catch (error) {
            return {
                kind: "asset-detail-error",
                jobId: completed.job_id,
                assetIds,
                durationMs: performance.now() - requestStartedAt,
                error: error instanceof Error ? error.message : "结果详情加载失败",
            };
        }
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
        try {
            const checkedEstimate = await estimateCreativeJob({
                capability: "image_generation",
                model: snapshot.config.model,
                group: "auto",
                token: { strategy: "auto" },
                parameters: { count: 1, size: snapshot.config.size, quality: snapshot.config.quality, background: snapshot.config.background },
            });
            if (!checkedEstimate.available) throw new Error(checkedEstimate.message || "当前模型尚未完成计费配置");
            const referenceAssetIds = await uploadImageReferences(snapshot.references);
            setResults((value) => updateResultAt(value, index, { status: "pending", phase: "preparing", progress: undefined, error: undefined, image: undefined }));
            const submitted = await submitImageJob(snapshot, referenceAssetIds, checkedEstimate.normalized_parameters, (job) =>
                setResults((value) => updateResultAt(value, index, { ...creativeJobPendingSnapshot(job.status, job.progress), error: undefined })),
            );
            if (submitted.kind === "asset-detail-error") {
                setResults((value) =>
                    updateResultAt(value, index, {
                        status: "asset-detail-error",
                        error: submitted.error,
                        jobId: submitted.jobId,
                        assetIds: submitted.assetIds,
                        durationMs: submitted.durationMs,
                        phase: undefined,
                        progress: undefined,
                    }),
                );
                message.warning("任务已完成，结果详情加载失败，可重试加载");
                return;
            }
            setResults((value) => updateResultAt(value, index, { status: "success", image: submitted.image }));
            message.success("重试成功");
        } catch (requestError) {
            const error = requestError instanceof Error ? requestError.message : "重试失败";
            setResults((value) => updateResultAt(value, index, { status: "failed", error, image: undefined }));
            message.error(error);
        }
    };

    const retryResultDetails = async (index: number) => {
        const result = results[index];
        if (result?.status !== "asset-detail-error" || result.retrying || !result.assetIds?.length) return;
        setResults((value) => updateResultAt(value, index, { retrying: true }));
        try {
            const assets = await Promise.all(result.assetIds.map((assetId) => queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId))));
            const asset = assets[0];
            if (!asset) throw new Error("任务没有返回图片素材");
            for (const detail of assets) upsertCreativeAssetListCache(queryClient, detail);
            const image = generatedImageFromAsset(asset, result.durationMs || 0);
            setResults((value) => (value.some((item) => item.id === result.id) ? value.map((item) => (item.id === result.id ? { id: result.id, status: "success", image } : item)) : value));
            message.success("结果详情已加载");
        } catch (error) {
            const detailError = error instanceof Error ? error.message : "结果详情加载失败";
            setResults((value) => updateResultById(value, result.id, { retrying: false, error: detailError }));
            message.error("结果详情仍未加载，可稍后重试");
        }
    };

    return (
        <CreativeWorkbenchRoot>
            <CreativeWorkbenchMain historyCollapsed={historyCollapsed}>
                <CreativeWorkbenchHistoryRail collapsed={historyCollapsed} onCollapsedChange={setHistoryCollapsed}>
                    <CreativeHistoryPanel
                        items={logs}
                        activeItemId={previewLog?.id}
                        disabled={running}
                        onCreateSession={createSession}
                        onSelectItem={(log) => void previewGenerationLog(log)}
                        total={jobHistory.total}
                        initialLoading={jobHistory.isPending}
                        loadingMore={jobHistory.isFetchingNextPage}
                        error={jobHistory.error instanceof Error ? jobHistory.error.message : jobHistory.isError ? "生成记录加载失败" : ""}
                        onRetry={() => void jobHistory.refetch()}
                        onLoadMore={() => void jobHistory.fetchNextPage()}
                        renderCard={(log, context) => <LogCard key={log.id} log={log} active={context.active} disabled={context.disabled} onClick={context.onSelect} />}
                    />
                </CreativeWorkbenchHistoryRail>

                <CreativeWorkbenchContent>
                    <CreativeWorkbenchComposer>
                        <CreativeWorkbenchHeader title="生图工作台" onOpenHistory={() => setLogsOpen(true)} onOpenParameters={() => setSettingsOpen(true)} />

                        <div className="mt-6 space-y-5">
                            <CreativeReadinessNotice capabilityLabel="生图" hasModel={hasImageModel} hasToken={fyjitTokens.length > 0} />
                            <div>
                                <div className="mb-2 text-base font-semibold">生成模式</div>
                                <Segmented
                                    block
                                    value={generationMode}
                                    options={[
                                        { label: supportsTextGeneration ? "文生图" : "文生图（当前模型不支持）", value: "text", disabled: !supportsTextGeneration },
                                        { label: supportsImageEditing ? "参考图编辑" : "参考图编辑（当前模型不支持）", value: "edit", disabled: !supportsImageEditing },
                                    ]}
                                    onChange={(value) => setGenerationMode(value as "text" | "edit")}
                                />
                            </div>
                            <div>
                                <CreativeFieldHeader
                                    label="提示词"
                                    actions={
                                        <div className="flex gap-2">
                                            <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptDialogOpen(true)}>
                                                查看提示词库
                                            </Button>
                                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                                查看我的资产
                                            </Button>
                                        </div>
                                    }
                                />
                                <Input.TextArea
                                    id="image-prompt"
                                    name="image_prompt"
                                    ref={promptInputRef}
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    rows={7}
                                    placeholder="描述画面主体、风格、构图、光线和用途；可用 @图片1 关联参考图"
                                />
                                {generationMode === "edit" ? <ReferencePromptMentions references={promptReferences} onInsert={insertPromptReference} /> : null}
                                <Input.TextArea
                                    id="image-negative-prompt"
                                    name="image_negative_prompt"
                                    className="mt-3"
                                    value={negativePrompt}
                                    onChange={(event) => setNegativePrompt(event.target.value)}
                                    rows={3}
                                    placeholder="负向提示词（可选）：描述不希望出现的元素"
                                />
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
                                        className={`hover-scrollbar hover-scrollbar-hint relative flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${isReferenceDragActive ? "border-primary bg-accent" : "border-border"}`}
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
                                            <div key={item.id} className="group relative size-20 shrink-0 overflow-hidden rounded-md border border-border">
                                                <img src={item.thumbnailUrl || item.dataUrl} alt={item.name} className="size-full object-cover" loading="lazy" />
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
                                            <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">{isReferenceDragActive ? "松开即可添加参考图" : `暂无参考图，可将图片拖到这里，最多 ${maxImageReferences} 张`}</div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            <CreativeParametersSection collapsed={parametersCollapsed} onCollapsedChange={setParametersCollapsed} summary={`${modelOptionLabel(effectiveConfig, model)} · ${effectiveConfig.size} · ${effectiveConfig.quality}`}>
                                <div className="grid grid-cols-2 gap-4">
                                    <GenerationSettings
                                        config={effectiveConfig}
                                        model={model}
                                        projectId={projectId}
                                        onProjectChange={setProjectId}
                                        updateConfig={updateConfig}
                                        openConfigDialog={openConfigDialog}
                                        baseSizesOnly={generationMode === "text" && model.toLowerCase().includes("wan2.6")}
                                    />
                                </div>
                            </CreativeParametersSection>
                        </div>

                        <CreativeSubmitDock
                            summary={
                                <CreativeEstimateSummary
                                    estimate={estimate}
                                    loading={estimateLoading}
                                    error={estimateError}
                                    requestedParameters={estimateParameters}
                                    referenceCounts={{ images: references.length }}
                                    purposeLabel={generationMode === "edit" ? "参考图编辑" : "文生图"}
                                    modelLabel={modelOptionLabel(effectiveConfig, model)}
                                    tokenLabel={estimateTokenLabel}
                                    profile={modelProfile}
                                />
                            }
                            primaryAction={
                                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                                    开始生成
                                </Button>
                            }
                        />
                    </CreativeWorkbenchComposer>

                    <CreativeWorkbenchResult status={running && pendingSummary ? <CreativeGenerationStatus {...pendingSummary} elapsedMs={elapsedMs} /> : null}>
                        {previewLog ? (
                            <CreativeDraftNotice
                                tone="preview"
                                action={
                                    <div className="flex flex-wrap gap-2">
                                        {previewAssetDetails.isError ? (
                                            <Button size="small" onClick={() => void previewAssetDetails.retry()}>
                                                重试加载
                                            </Button>
                                        ) : null}
                                        <Button size="small" type="primary" loading={previewAssetDetails.isLoading} onClick={applyPreviewLog}>
                                            用于再次创作
                                        </Button>
                                    </div>
                                }
                            >
                                <>
                                    正在预览历史记录，当前未提交草稿未改变。
                                    {previewAssetDetails.isLoading ? " 正在加载完整素材…" : previewAssetDetails.isError ? " 完整素材加载失败，可重试。" : ""}
                                </>
                            </CreativeDraftNotice>
                        ) : null}
                        {undoDraft ? (
                            <CreativeDraftNotice
                                tone="undo"
                                action={
                                    <Button size="small" onClick={undoPreviewApply}>
                                        撤销替换
                                    </Button>
                                }
                            >
                                历史参数已替换当前草稿。
                            </CreativeDraftNotice>
                        ) : null}
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
                                            onSendToVideo={sendResultToVideo}
                                        />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || "生成失败"} onRetry={() => retryResult(index)} />
                                    ) : result.status === "asset-detail-error" ? (
                                        <AssetDetailErrorImageCard key={result.id} error={result.error || "结果详情加载失败"} loading={result.retrying} onRetry={() => void retryResultDetails(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} phase={result.phase} progress={result.progress} elapsedMs={elapsedMs} />
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
                    </CreativeWorkbenchResult>
                </CreativeWorkbenchContent>
            </CreativeWorkbenchMain>
            <input
                ref={fileInputRef}
                id="image-reference-upload"
                name="image_reference_upload"
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
                <CreativeHistoryPanel
                    items={logs}
                    activeItemId={previewLog?.id}
                    disabled={running}
                    onCreateSession={createSession}
                    onSelectItem={(log) => void previewGenerationLog(log)}
                    total={jobHistory.total}
                    initialLoading={jobHistory.isPending}
                    loadingMore={jobHistory.isFetchingNextPage}
                    error={jobHistory.error instanceof Error ? jobHistory.error.message : jobHistory.isError ? "生成记录加载失败" : ""}
                    onRetry={() => void jobHistory.refetch()}
                    onLoadMore={() => void jobHistory.fetchNextPage()}
                    renderCard={(log, context) => <LogCard key={log.id} log={log} active={context.active} disabled={context.disabled} onClick={context.onSelect} />}
                />
            </Drawer>
            <Drawer title="参数" placement="bottom" size="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings
                        config={effectiveConfig}
                        model={model}
                        projectId={projectId}
                        onProjectChange={setProjectId}
                        updateConfig={updateConfig}
                        openConfigDialog={openConfigDialog}
                        baseSizesOnly={generationMode === "text" && model.toLowerCase().includes("wan2.6")}
                    />
                </div>
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} onSelectNegativePrompt={setNegativePrompt} />
            <AssetPickerModal
                open={assetPickerOpen}
                defaultTab="my-assets"
                acceptedTypes={supportsImageEditing ? ["TEXT", "IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"] : ["TEXT"]}
                compatibilityHint={supportsImageEditing ? `当前模型最多可使用 ${maxImageReferences} 张参考图，也可插入文本作为提示词。` : "当前模型仅支持文生图，可插入文本素材作为提示词。"}
                onInsert={(payload) => void insertPickedAsset(payload)}
                onClose={() => setAssetPickerOpen(false)}
            />
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
        </CreativeWorkbenchRoot>
    );
}

function GenerationSettings({
    config,
    model,
    projectId,
    onProjectChange,
    updateConfig,
    openConfigDialog,
    baseSizesOnly,
}: {
    config: AiConfig;
    model: string;
    projectId: string;
    onProjectChange: (value: string) => void;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    baseSizesOnly: boolean;
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
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" maxCount={10} baseSizesOnly={baseSizesOnly} />
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
    onSendToVideo,
}: {
    image: GeneratedImage;
    index: number;
    compareImage?: string;
    onCompare: (before: string, after: string) => void;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSendToVideo: (image: GeneratedImage) => void;
}) {
    return (
        <CreativeResultCardShell
            media={<Image src={image.thumbnailUrl || image.dataUrl} preview={{ src: image.dataUrl }} alt={`生成结果 ${index + 1}`} className="aspect-square object-cover" />}
            footerClassName="space-y-2"
            footer={
                <>
                    <div className="flex min-w-0 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            {image.width}x{image.height}
                        </span>
                        <span>{formatBytes(image.bytes)}</span>
                        <span>{formatDuration(image.durationMs)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-success">已保存到素材中心</span>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2">
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
                </>
            }
        />
    );
}

function PendingImageCard({ phase, progress, elapsedMs }: { phase?: CreativeGenerationPhase; progress?: number; elapsedMs: number }) {
    return <CreativeGenerationStatus variant="panel" phase={phase} progress={progress} elapsedMs={elapsedMs} className="aspect-square" />;
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

function AssetDetailErrorImageCard({ error, loading, onRetry }: { error: string; loading?: boolean; onRetry: () => void }) {
    return (
        <FyjitTaskStatus
            tone="error"
            title="任务已完成，结果详情加载失败"
            description={
                <>
                    <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-1 !text-xs !text-inherit">
                        {error}
                    </Typography.Paragraph>
                    <span>任务已完成；重试只会重新读取结果详情，不会创建新的生成任务。</span>
                </>
            }
            actions={
                <Button size="small" type="primary" loading={loading} onClick={onRetry}>
                    重试加载结果
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

function LogCard({ log, active, disabled, onClick }: { log: GenerationLog; active: boolean; disabled: boolean; onClick: () => void }) {
    const thumbnails = (log.thumbnails || []).filter(Boolean).slice(0, 4);

    return (
        <div className={`overflow-hidden rounded-lg border transition ${active ? "border-primary bg-accent" : "border-border bg-background hover:bg-muted/50"}`}>
            <button type="button" className="block w-full p-2 text-left disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={onClick}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <div className="min-w-0">
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
                            {!log.successCount && !log.failCount ? <CreativeStatusTag status={log.status} /> : null}
                            {log.successCount ? <CreativeStatusTag status="成功">成功 {log.successCount}</CreativeStatusTag> : null}
                            {log.failCount ? (
                                <CreativeStatusTag status={log.status === "部分成功" ? "部分成功" : log.status === "审核拒绝" ? "审核拒绝" : "失败"}>
                                    {log.status === "审核拒绝" ? "审核拒绝" : log.status === "部分成功" ? "部分失败" : "失败"} {log.failCount}
                                </CreativeStatusTag>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.imageCount} 张</Tag>
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{formatDuration(log.durationMs)}</Tag>
                        </div>
                        <div className="flex justify-end">
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.time}</Tag>
                        </div>
                    </div>
                </div>
            </button>
            {log.task.billing_status && log.task.billing_status !== "PENDING" ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-1.5 text-xs">
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

type CreativeAssetHistoryRecord = CreativeAsset | CreativeAssetSummary;
type CreativeAssetFetcher = (assetId: string) => Promise<CreativeAssetHistoryRecord | null>;

const IMAGE_ASSET_TYPES = ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"];

function generatedImageFromAsset(asset: CreativeAssetHistoryRecord, durationMs: number): GeneratedImage {
    return {
        id: asset.asset_id,
        dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        thumbnailUrl: asset.thumbnail_path,
        durationMs,
        width: asset.width || 0,
        height: asset.height || 0,
        bytes: asset.size_bytes || 0,
        mimeType: asset.mime_type,
    };
}

function imageReferenceFromAsset(asset: CreativeAssetHistoryRecord): ReferenceImage | null {
    if (!IMAGE_ASSET_TYPES.includes(asset.type)) return null;
    return {
        id: asset.asset_id,
        assetId: asset.asset_id,
        name: asset.title || asset.asset_id,
        type: asset.mime_type || "image/png",
        dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        thumbnailUrl: asset.thumbnail_path,
    };
}

function hydrateImageLogWithAssets(log: GenerationLog, details: ReadonlyMap<string, CreativeAsset>): GenerationLog {
    const imagesById = new Map(log.images.map((image) => [image.id, image]));
    const images = (log.task.result_asset_ids || [])
        .map((assetId) => {
            const detail = details.get(assetId);
            return detail ? generatedImageFromAsset(detail, log.durationMs) : imagesById.get(assetId);
        })
        .filter((image): image is GeneratedImage => Boolean(image));
    const referencesById = new Map(log.references.map((reference) => [reference.assetId || reference.id, reference]));
    const references = (log.task.reference_asset_ids || [])
        .map((assetId) => {
            const detail = details.get(assetId);
            return detail ? imageReferenceFromAsset(detail) || referencesById.get(assetId) : referencesById.get(assetId);
        })
        .filter((reference): reference is ReferenceImage => Boolean(reference));
    return {
        ...log,
        images: images.length ? images : log.images,
        thumbnails: (images.length ? images : log.images).map((image) => image.thumbnailUrl || image.dataUrl),
        references: references.length ? references : log.references,
        fullAssetIds: uniqueCreativeAssetIds([...(log.fullAssetIds || []), ...details.keys()]),
    };
}

function imageResultsFromLog(log: GenerationLog): GenerationResult[] {
    if (log.status === "排队中" || log.status === "运行中") return [{ id: log.id, status: "pending" }];
    return log.images.length ? log.images.map((image) => ({ id: image.id, status: "success" as const, image })) : [{ id: log.id, status: "failed", error: log.error || log.status }];
}

function imageResultSignature(results: GenerationResult[]) {
    return results.map((result) => `${result.id}:${result.status}:${result.image?.dataUrl || ""}:${result.image?.thumbnailUrl || ""}`).join("|");
}

function createSummaryAssetFetcher(assets: CreativeAssetSummary[] = []): CreativeAssetFetcher {
    const byId = new Map(assets.map((asset) => [asset.asset_id, asset]));
    return async (assetId) => byId.get(assetId) || null;
}

async function creativeJobToImageLog(job: CreativeJob, fetchAsset: CreativeAssetFetcher = (assetId) => fetchCreativeAsset(assetId).catch(() => null)): Promise<GenerationLog> {
    const [assets, referenceAssets] = await Promise.all([Promise.all((job.result_asset_ids || []).map(fetchAsset)), Promise.all((job.reference_asset_ids || []).map(fetchAsset))]);
    const fullAssetIds = uniqueCreativeAssetIds([...assets, ...referenceAssets].filter(isCreativeAssetDetail).map((asset) => asset.asset_id));
    const images: GeneratedImage[] = assets
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
        .map((asset) => ({
            id: asset.asset_id,
            dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            thumbnailUrl: asset.thumbnail_path,
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
                thumbnailUrl: asset.thumbnail_path,
            })),
        durationMs: Math.max(0, ((job.finished_at || job.updated_at) - (job.started_at || job.created_at)) * 1000),
        successCount: images.length,
        failCount: job.status === "SUCCEEDED" || job.status === "PARTIAL_SUCCESS" ? Math.max(0, requestedCount - images.length) : ["FAILED", "CANCELLED", "EXPIRED", "MODERATION_REJECTED"].includes(job.status) ? requestedCount : 0,
        imageCount: requestedCount,
        size: config.size,
        quality: config.quality,
        status: creativeJobStatusLabel(job.status),
        images,
        thumbnails: images.map((image) => image.thumbnailUrl || image.dataUrl),
        task: job,
        fullAssetIds,
        error: job.error,
    };
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
