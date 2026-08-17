import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardPaste, Download, FolderPlus, History, Music2, Plus, SlidersHorizontal, Sparkles, Trash2, Upload, VideoIcon } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { App, Button, Checkbox, Drawer, Input, Modal, Tag, Typography } from "antd";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { FyjitEmptyState, FyjitSurface, FyjitTaskStatus } from "@/components/fyjit/creative-ui";
import { CreativeEstimateSummary } from "@/components/creative-estimate-summary";
import { CreativeReadinessNotice } from "@/components/creative-readiness-notice";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { ProjectPicker } from "@/components/project-picker";
import { ReferencePromptMentions } from "@/components/reference-prompt-mentions";
import { VideoSettingsPanel, normalizeVideoResolutionValue, normalizeVideoSizeValue, videoSizeLabel } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { randomId } from "@/lib/utils";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { buildReferencePromptText } from "@/lib/image-reference-prompt";
import { buildVideoCapabilityParameters } from "@/lib/video-capability-parameters";
import { boolConfig, isSeedanceVideoConfig, normalizeSeedanceRatio, seedanceReferenceLabel, seedanceVideoReferenceError, seedanceVideoReferenceHint, SEEDANCE_REFERENCE_LIMITS, SEEDANCE_VIDEO_MIME_TYPES } from "@/lib/seedance-video";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { readReferenceBlob } from "@/services/reference-storage";
import {
    cancelCreativeJob,
    createCreativeIntent,
    createCreativeJob,
    estimateCreativeJob,
    fetchCreativeAsset,
    fetchCreativeJobs,
    uploadCreativeAsset,
    waitForCreativeJob,
    type CreativeAsset,
    type CreativeJob,
    type CreativeModelCapabilityProfile,
} from "@/services/api/creative";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { useCreativeEstimate } from "@/hooks/use-creative-estimate";
import { useCreativeIntentStore } from "@/stores/use-creative-intent-store";
import { useFyjitStore } from "@/stores/use-fyjit-store";
import { modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useWorkbenchLayoutStore } from "@/stores/use-workbench-layout-store";
import type { ReferenceImage } from "@/types/image";
import { useReferenceMentionInsertion } from "@/hooks/use-reference-mention-insertion";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    video?: GeneratedVideo;
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
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "排队中" | "运行中" | "成功" | "审核拒绝" | "失败" | "已取消" | "已超时";
    task?: CreativeJob;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoFps" | "videoGenerateAudio" | "videoWatermark" | "videoCameraFixed">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

function videoAssetCompatibilityHint(profile?: CreativeModelCapabilityProfile) {
    if (profile?.input_modes.includes("image_to_video")) return "当前模型为图生视频：请选择且只能选择一张首帧图片，画面比例将继承首帧。";
    if (profile?.input_modes.includes("reference_to_video")) return `当前模型为参考图生视频：请选择 1–${profile.max_reference_images} 张参考图。`;
    if ((profile?.max_reference_videos || 0) > 0) return `当前模型支持图片与视频参考，图片最多 ${profile?.max_reference_images || 0} 张，视频最多 ${profile?.max_reference_videos || 0} 个。`;
    return "当前模型为文生视频，只能插入文本素材作为提示词。";
}

export default function VideoPage() {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const historyCollapsed = useWorkbenchLayoutStore((state) => state.videoHistoryCollapsed);
    const parametersCollapsed = useWorkbenchLayoutStore((state) => state.videoParametersCollapsed);
    const setHistoryCollapsed = useWorkbenchLayoutStore((state) => state.setVideoHistoryCollapsed);
    const setParametersCollapsed = useWorkbenchLayoutStore((state) => state.setVideoParametersCollapsed);
    const [prompt, setPrompt] = useState("");
    const { textAreaRef: promptInputRef, insertReference: insertPromptReference } = useReferenceMentionInsertion(prompt, setPrompt);
    const [negativePrompt, setNegativePrompt] = useState("");
    const activeIntent = useCreativeIntentStore((state) => state.activeIntent);
    const fyjitModels = useFyjitStore((state) => state.models);
    const fyjitTokens = useFyjitStore((state) => state.tokens);
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [videoReferences, setVideoReferences] = useState<ReferenceVideo[]>([]);
    const [audioReferences, setAudioReferences] = useState<ReferenceAudio[]>([]);
    const [projectId, setProjectId] = useState("");
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [activeJobId, setActiveJobId] = useState<string>();
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState<"image" | "video" | "audio" | null>(null);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const imageReferenceSectionRef = useRef<HTMLDivElement>(null);
    const videoReferenceSectionRef = useRef<HTMLDivElement>(null);

    const videoModels = fyjitModels.filter((item) => item.capabilities.includes("video_generation"));
    const preferredModel = effectiveConfig.videoModel || effectiveConfig.model;
    const model = videoModels.some((item) => item.id === preferredModel) ? preferredModel : videoModels[0]?.id || "";
    const hasVideoModel = fyjitModels.some((item) => item.id === model && item.capabilities.includes("video_generation"));
    const modelProfile = fyjitModels.find((item) => item.id === model)?.capability_profiles.video_generation;
    const maxImageReferences = modelProfile?.max_reference_images ?? 0;
    const maxVideoReferences = modelProfile?.max_reference_videos ?? 0;
    const maxAudioReferences = modelProfile?.max_reference_audio ?? 0;
    const promptReferences = [
        ...references.map((reference, index) => ({ id: reference.id, label: seedanceReferenceLabel("image", index), title: reference.name })),
        ...videoReferences.map((reference, index) => ({ id: reference.id, label: seedanceReferenceLabel("video", index), title: reference.name })),
        ...audioReferences.map((reference, index) => ({ id: reference.id, label: seedanceReferenceLabel("audio", index), title: reference.name })),
    ];
    const estimateConfig = buildVideoConfig(effectiveConfig, model);
    const estimateParameters = buildVideoCapabilityParameters(estimateConfig, modelProfile?.supported_parameters);
    const {
        estimate,
        setEstimate,
        loading: estimateLoading,
        error: estimateError,
    } = useCreativeEstimate(model && fyjitTokens.length ? { capability: "video_generation", model, group: "auto", token: { strategy: "auto" }, parameters: estimateParameters } : null);
    const canGenerate = Boolean(prompt.trim() && hasVideoModel && fyjitTokens.length && estimate?.available && !estimateLoading && !estimateError);
    const estimateTokenLabel = estimate?.token_id ? `${fyjitTokens.find((item) => item.id === estimate.token_id)?.name || "本站 Token"} (#${estimate.token_id})` : "自动选择可用的本站 Token";

    useEffect(() => {
        if (!modelProfile) return;
        const resolutions = modelProfile.parameter_options?.resolution || [];
        const currentResolution = normalizeResolution(effectiveConfig.vquality);
        if (resolutions.length && !resolutions.map(normalizeResolution).includes(currentResolution)) updateConfig("vquality", normalizeResolution(resolutions[0]));
        const ratios = modelProfile.parameter_options?.ratio || [];
        if (modelProfile.supported_parameters.includes("size") && ratios.length && !ratios.includes(effectiveConfig.size)) updateConfig("size", ratios[0]);
        const duration = Number(effectiveConfig.videoSeconds);
        const durationProfile = modelProfile.video_duration;
        if (durationProfile) {
            const allowed = durationProfile.allowed || [];
            const valid = allowed.length ? allowed.includes(duration) : duration >= durationProfile.min && duration <= durationProfile.max;
            if (!valid) updateConfig("videoSeconds", String(durationProfile.default));
        }
    }, [effectiveConfig.size, effectiveConfig.videoSeconds, effectiveConfig.vquality, modelProfile, updateConfig]);

    useEffect(() => {
        if (activeIntent?.kind !== "video") return;
        const intent = useCreativeIntentStore.getState().consumeFor("video");
        if (intent?.prompt) setPrompt(intent.prompt);
        if (intent?.negative_prompt) setNegativePrompt(intent.negative_prompt);
        if (intent?.asset_ids?.length) {
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
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/") && !SEEDANCE_VIDEO_MIME_TYPES.includes(file.type) && !isSupportedAudioFile(file));
        if (unsupported.length) message.warning("已忽略不支持的参考资产，请使用图片、mp4/mov 视频或 mp3/wav 音频");
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/") && file.size <= SEEDANCE_REFERENCE_LIMITS.imageMaxBytes).slice(0, Math.max(0, maxImageReferences - references.length));
        const videoFiles = selectedFiles.filter((file) => SEEDANCE_VIDEO_MIME_TYPES.includes(file.type) && file.size <= SEEDANCE_REFERENCE_LIMITS.videoMaxBytes).slice(0, Math.max(0, maxVideoReferences - videoReferences.length));
        const audioFiles = selectedFiles.filter((file) => isSupportedAudioFile(file) && file.size <= SEEDANCE_REFERENCE_LIMITS.audioMaxBytes).slice(0, Math.max(0, maxAudioReferences - audioReferences.length));
        if (selectedFiles.some((file) => file.type.startsWith("image/") && file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes)) message.warning("已忽略超过 30MB 的参考图");
        if (selectedFiles.some((file) => SEEDANCE_VIDEO_MIME_TYPES.includes(file.type) && file.size > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes)) message.warning("已忽略超过 200MB 的参考视频");
        if (selectedFiles.some((file) => isSupportedAudioFile(file) && file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes)) message.warning("已忽略超过 15MB 的参考音频");
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        const nextVideoReferences = await Promise.all(
            videoFiles.map(async (file) => {
                const video = await uploadMediaFile(file, "video-reference");
                return { id: nanoid(), name: file.name, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
            }),
        );
        const nextAudioReferences = filterAudioReferencesByDuration(
            audioReferences,
            await Promise.all(
                audioFiles.map(async (file) => {
                    const audio = await uploadMediaFile(file, "audio-reference");
                    return { id: nanoid(), name: file.name, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
                }),
            ),
            message.warning,
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, maxImageReferences));
        setVideoReferences((value) => [...value, ...nextVideoReferences].slice(0, maxVideoReferences));
        setAudioReferences((value) => [...value, ...nextAudioReferences].slice(0, maxAudioReferences));
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>, target: "image" | "video" | "audio") => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(target);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(null);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(null);
        void addReferences(event.dataTransfer.files);
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
            message.success(`已读取 ${nextReferences.length} 张参考图`);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };
    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "视频生成参数无效" });
            return;
        }
        let checkedEstimate: Awaited<ReturnType<typeof estimateCreativeJob>>;
        try {
            const parameters = buildVideoCapabilityParameters(snapshot.config, modelProfile?.supported_parameters);
            checkedEstimate = await estimateCreativeJob({ capability: "video_generation", model: snapshot.config.model, group: "auto", token: { strategy: "auto" }, parameters });
            setEstimate(checkedEstimate);
            if (!checkedEstimate.available) throw new Error(checkedEstimate.message || "当前模型尚未完成计费配置");
        } catch (requestError) {
            const error = requestError instanceof Error ? requestError.message : "费用与账号状态校验失败";
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error });
            message.error(error);
            return;
        }
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults([{ id: nanoid(), status: "pending" }]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        try {
            const referenceAssetIds = await uploadVideoReferences(snapshot.references, snapshot.videoReferences, snapshot.audioReferences);
            const task = await createCreativeJob({
                project_id: projectId || undefined,
                capability: "video_generation",
                model: snapshot.config.model,
                group: "auto",
                token: { strategy: "auto" },
                prompt: snapshot.text,
                negative_prompt: snapshot.negativePrompt || undefined,
                parameters: checkedEstimate.normalized_parameters,
                reference_asset_ids: referenceAssetIds,
                idempotency_key: randomId(),
            });
            setActiveJobId(task.job_id);
            const log = await creativeJobToVideoLog(task);
            log.references = snapshot.references;
            log.videoReferences = snapshot.videoReferences;
            log.audioReferences = snapshot.audioReferences;
            await refreshLogs(false);
            void pollGenerationLog(log, agentTaskId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "生成失败";
            setResults([{ id: nanoid(), status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            message.error(errorMessage);
            setRunning(false);
        }
    };

    // 响应 Agent 面板下发的视频命令：填入提示词，并按需自动触发生成。
    useEffect(() => {
        if (!videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: "视频工作台已有任务正在运行" });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error("请输入视频提示词");
            return null;
        }
        if (!fyjitModels.some((item) => item.id === model && item.capabilities.includes("video_generation")) || !fyjitTokens.length) {
            message.warning("当前账号缺少可用视频模型或本站 Token");
            return null;
        }
        if (references.length > maxImageReferences || videoReferences.length > maxVideoReferences || audioReferences.length > maxAudioReferences) {
            message.error("参考素材超过当前模型的服务端能力，请先移除不支持的素材");
            return null;
        }
        if (modelProfile?.input_modes.includes("image_to_video") && references.length !== 1) {
            message.error("当前图生视频模型必须选择且只能选择一张首帧图片");
            return null;
        }
        if (modelProfile?.input_modes.includes("reference_to_video") && references.length < 1) {
            message.error("当前参考生视频模型至少需要一张参考图片");
            return null;
        }
        const videoReferenceError = seedanceVideoReferenceError(videoReferences);
        if (videoReferenceError) {
            message.error(`${videoReferenceError}。${seedanceVideoReferenceHint}`);
            return null;
        }
        return {
            text: buildReferencePromptText(text, promptReferences),
            negativePrompt: negativePrompt.trim(),
            config: buildVideoConfig(effectiveConfig, model),
            references: [...references],
            videoReferences: [...videoReferences],
            audioReferences: [...audioReferences],
        };
    };

    const retryResult = () => {
        void generate();
    };

    const cancelActiveJob = async () => {
        if (!activeJobId) return;
        try {
            await cancelCreativeJob(activeJobId);
            setRunning(false);
            setActiveJobId(undefined);
            await refreshLogs(false);
            message.info("任务已取消；已发生的上游消费以 FYJIT 使用记录为准");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消任务失败");
        }
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (_video: GeneratedVideo) => {
        message.success("生成视频已由 FYJIT 自动保存到素材中心");
    };

    const sendResultToFilmProduction = async (video: GeneratedVideo) => {
        try {
            const intent = await createCreativeIntent("asset", { asset_ids: [video.id] });
            window.location.assign(`/professional-video?intent=${encodeURIComponent(intent.id)}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "无法送入影视制作");
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            if (maxImageReferences < 1) {
                message.warning("当前视频模型不接受图片素材");
                return;
            }
            setReferences((value) => [...value, { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: "image/png", dataUrl: payload.dataUrl }].slice(0, maxImageReferences));
            window.requestAnimationFrame(() => imageReferenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            message.success("已作为首帧/主参考插入下方“参考图”，生成时会随任务提交");
        } else if (payload.kind === "video") {
            if (maxVideoReferences < 1) {
                message.warning("当前视频模型不接受视频参考素材");
                return;
            }
            setVideoReferences((value) =>
                [...value, { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: "video/mp4", url: payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height }].slice(0, maxVideoReferences),
            );
            window.requestAnimationFrame(() => videoReferenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            message.success("已插入下方“参考视频”，生成时会作为运动参考提交");
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setNegativePrompt("");
        setReferences([]);
        setVideoReferences([]);
        setAudioReferences([]);
        setResults([]);
        setActiveJobId(undefined);
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
        const response = await fetchCreativeJobs({ capability: "video_generation", pageSize: 100 });
        const nextLogs = await Promise.all((response.items || []).map(creativeJobToVideoLog));
        setLogs(nextLogs);
        if (resumePending) resumePendingLogs(nextLogs);
        return nextLogs;
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if ((log.status === "排队中" || log.status === "运行中") && log.task) void pollGenerationLog(log);
        }
    };

    const pollGenerationLog = async (log: GenerationLog, agentTaskId?: string) => {
        if (!log.task || activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        setRunning(true);
        setActiveJobId(log.id);
        setStartedAt((value) => value || performance.now());
        setResults((value) => (value.length ? value : [{ id: log.id, status: "pending" }]));
        try {
            const completed = await waitForCreativeJob(log.task.job_id, { intervalMs: 2500 });
            if (completed.status === "CANCELLED") {
                setResults([{ id: log.id, status: "failed", error: "任务已取消" }]);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 0, error: "任务已取消" });
                await refreshLogs(false);
                message.info("视频任务已取消");
                return;
            }
            if (completed.status !== "SUCCEEDED") throw new Error(completed.error || creativeVideoStatusLabel(completed.status));
            const assetId = completed.result_asset_ids?.[0];
            if (!assetId) throw new Error("视频任务没有返回素材");
            const asset = await fetchCreativeAsset(assetId);
            const nextVideo: GeneratedVideo = {
                id: asset.asset_id,
                url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
                durationMs: Date.now() - log.createdAt,
                width: asset.width || 1280,
                height: asset.height || 720,
                bytes: asset.size_bytes || 0,
                mimeType: asset.mime_type || "video/mp4",
            };
            setResults([{ id: nextVideo.id, status: "success", video: nextVideo }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
            await refreshLogs(false);
            message.success("视频已生成并保存到 FYJIT 素材中心");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "生成失败";
            setResults([{ id: log.id, status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await refreshLogs(false);
            message.error(errorMessage);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            if (!activeLogIdsRef.current.size) {
                setRunning(false);
                setStartedAt(0);
                setActiveJobId(undefined);
            }
        }
    };

    const uploadVideoReferences = async (imageItems: ReferenceImage[], videoItems: ReferenceVideo[], audioItems: ReferenceAudio[]) => {
        const inputs = [
            ...imageItems.map((item) => ({ assetId: item.assetId, name: item.name, url: item.dataUrl, storageKey: item.storageKey })),
            ...videoItems.map((item) => ({ assetId: item.assetId, name: item.name, url: item.url, storageKey: item.storageKey })),
            ...audioItems.map((item) => ({ assetId: item.assetId, name: item.name, url: item.url, storageKey: item.storageKey })),
        ];
        return Promise.all(
            inputs.map(async (item) => {
                if (item.assetId) return item.assetId;
                const asset = await uploadCreativeAsset(await readReferenceBlob(item), item.name, undefined, undefined, projectId || undefined);
                return asset.asset_id;
            }),
        );
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setNegativePrompt(log.negativePrompt);
        setReferences(log.references || []);
        setVideoReferences(log.videoReferences || []);
        setAudioReferences(log.audioReferences || []);
        setActiveJobId(log.status === "排队中" || log.status === "运行中" ? log.id : undefined);
        if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoFps) updateConfig("videoFps", log.config.videoFps);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        if (log.config.videoCameraFixed) updateConfig("videoCameraFixed", log.config.videoCameraFixed);
        setResults(log.status === "排队中" || log.status === "运行中" ? [{ id: log.id, status: "pending" }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || log.status }]);
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
                                onPreviewLog={previewGenerationLog}
                            />
                        </>
                    )}
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">视频创作台</h1>
                            <div className="flex shrink-0 gap-2 lg:hidden">
                                <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                    记录
                                </Button>
                                <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    参数
                                </Button>
                            </div>
                        </div>

                        <div className="mt-6 space-y-5">
                            <CreativeReadinessNotice capabilityLabel="视频" hasModel={hasVideoModel} hasToken={fyjitTokens.length > 0} />
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
                                <Input.TextArea ref={promptInputRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} placeholder="描述镜头运动、主体动作、场景氛围和画面风格；可用 @图片1 关联参考素材" />
                                <ReferencePromptMentions references={promptReferences} onInsert={insertPromptReference} />
                                <Input.TextArea className="mt-3" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} rows={3} placeholder="负向提示词（可选）：描述不希望出现的元素" />
                            </div>

                            {maxImageReferences > 0 ? (
                                <div ref={imageReferenceSectionRef} className="min-w-0 scroll-mt-20">
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
                                        className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget === "image" ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 dark:border-stone-700"}`}
                                        onDragEnter={(event) => handleReferenceDragEnter(event, "image")}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
                                    >
                                        {references.map((item, index) => (
                                            <div key={item.id} className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800">
                                                <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                                                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{seedanceReferenceLabel("image", index)}</span>
                                                <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                                                    {imageReferencePurpose(index, references.length)} · {item.assetId ? "素材中心" : "提交时上传"}
                                                </span>
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
                                                {referenceDragTarget === "image" ? "松开即可上传参考资产" : `暂无参考图，可拖入文件，最多 ${maxImageReferences} 张`}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            {maxVideoReferences > 0 ? (
                                <div ref={videoReferenceSectionRef} className="min-w-0 scroll-mt-20">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-base font-semibold">参考视频</span>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            上传
                                        </Button>
                                    </div>
                                    <div
                                        className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget === "video" ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 dark:border-stone-700"}`}
                                        onDragEnter={(event) => handleReferenceDragEnter(event, "video")}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
                                    >
                                        {videoReferences.map((item, index) => (
                                            <div key={item.id} className="group relative h-20 w-32 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-black dark:border-stone-800">
                                                <video src={item.url} className="size-full object-cover" muted preload="metadata" />
                                                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{seedanceReferenceLabel("video", index)}</span>
                                                <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">运动参考 · {item.assetId ? "素材中心" : "提交时上传"}</span>
                                                <ReferenceOrderButtons index={index} total={videoReferences.length} onMove={(offset) => setVideoReferences((value) => moveListItem(value, index, offset))} />
                                                <button
                                                    type="button"
                                                    className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
                                                    onClick={() => setVideoReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                    aria-label="移除参考视频"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {!videoReferences.length ? (
                                            <div className="flex min-w-full items-center justify-center text-sm text-stone-500">{referenceDragTarget === "video" ? "松开即可上传参考资产" : `暂无参考视频，可拖入文件，最多 ${maxVideoReferences} 个`}</div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            {maxAudioReferences > 0 ? (
                                <div className="min-w-0">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-base font-semibold">参考音频</span>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            上传
                                        </Button>
                                    </div>
                                    <div
                                        className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget === "audio" ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 dark:border-stone-700"}`}
                                        onDragEnter={(event) => handleReferenceDragEnter(event, "audio")}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
                                    >
                                        {audioReferences.map((item, index) => (
                                            <div key={item.id} className="group relative flex h-20 w-48 shrink-0 flex-col justify-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-2 dark:border-stone-800 dark:bg-stone-900">
                                                <div className="flex min-w-0 items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                                                    <Music2 className="size-4 shrink-0" />
                                                    <span className="shrink-0 rounded bg-stone-200 px-1 text-[10px] text-stone-700 dark:bg-stone-800 dark:text-stone-200">{seedanceReferenceLabel("audio", index)}</span>
                                                    <span className="truncate">{item.name}</span>
                                                </div>
                                                <span className="truncate text-[10px] text-stone-500">声音参考 · {item.assetId ? "素材中心" : "提交时上传"}</span>
                                                <audio src={item.url} controls className="h-8 w-full" preload="metadata" />
                                                <ReferenceOrderButtons index={index} total={audioReferences.length} onMove={(offset) => setAudioReferences((value) => moveListItem(value, index, offset))} />
                                                <button
                                                    type="button"
                                                    className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
                                                    onClick={() => setAudioReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                    aria-label="移除参考音频"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {!audioReferences.length ? (
                                            <div className="flex min-w-full items-center justify-center text-center text-sm text-stone-500">
                                                {referenceDragTarget === "audio" ? "松开即可上传参考资产" : `暂无参考音频，可拖入文件，最多 ${maxAudioReferences} 个，mp3/wav，单个 15MB 内`}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900 sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model)} · {normalizeResolution(effectiveConfig.vquality)}p · {videoSizeLabel(effectiveConfig.size)} · {normalizeVideoSeconds(effectiveConfig.videoSeconds)}s
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
                                        <GenerationSettings config={effectiveConfig} model={model} profile={modelProfile} projectId={projectId} onProjectChange={setProjectId} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
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
                                referenceCounts={{ images: references.length, videos: videoReferences.length, audio: audioReferences.length }}
                                tokenLabel={estimateTokenLabel}
                                profile={modelProfile}
                            />
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                                开始生成
                            </Button>
                            {running && activeJobId ? (
                                <Button danger block onClick={() => void cancelActiveJob()}>
                                    取消当前任务
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <FyjitSurface className="thin-scrollbar p-4 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold">生成结果</h2>
                            {running ? <Tag className="m-0 px-2 py-1">等待 {formatDuration(elapsedMs)}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-4">
                                {results.map((result) =>
                                    result.status === "success" && result.video ? (
                                        <ResultVideoCard key={result.id} video={result.video} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} onSendToFilm={() => void sendResultToFilmProduction(result.video!)} />
                                    ) : result.status === "failed" ? (
                                        <FailedVideoCard key={result.id} error={result.error || "生成失败"} onRetry={retryResult} />
                                    ) : (
                                        <PendingVideoCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <FyjitEmptyState
                                icon={VideoIcon}
                                title="还没有生成视频"
                                description="输入镜头描述或选择已有素材；任务结果会在页面关闭后继续由 FYJIT 保存。"
                                className="min-h-[320px] lg:min-h-[560px]"
                                actions={
                                    <>
                                        <Button size="small" onClick={() => setPrompt("镜头缓慢推进，晨雾中的未来城市逐渐亮起，电影感光影")}>
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
                accept="image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
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
                    onPreviewLog={previewGenerationLog}
                />
            </Drawer>
            <Drawer title="参数" placement="bottom" height="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} profile={modelProfile} projectId={projectId} onProjectChange={setProjectId} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} onSelectNegativePrompt={setNegativePrompt} />
            <AssetPickerModal
                open={assetPickerOpen}
                defaultTab="my-assets"
                acceptedTypes={["TEXT", ...(maxImageReferences > 0 ? (["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"] as const) : []), ...(maxVideoReferences > 0 ? (["VIDEO"] as const) : [])]}
                compatibilityHint={videoAssetCompatibilityHint(modelProfile)}
                onInsert={(payload) => void insertPickedAsset(payload)}
                onClose={() => setAssetPickerOpen(false)}
            />
            <Modal title="删除生成记录" open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？
            </Modal>
        </div>
    );
}

function GenerationSettings({
    config,
    model,
    profile,
    projectId,
    onProjectChange,
    updateConfig,
    openConfigDialog,
}: {
    config: AiConfig;
    model: string;
    profile?: CreativeModelCapabilityProfile;
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
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("videoModel", value)} capability="video" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">所属项目（可选）</span>
                <ProjectPicker value={projectId} onChange={onProjectChange} className="w-full" />
            </label>
            <div className="col-span-2">
                <VideoSettingsPanel config={config} supportedParameters={profile?.supported_parameters} profile={profile} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" />
            </div>
        </>
    );
}

function ResultVideoCard({ video, onDownload, onSaveAsset, onSendToFilm }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void; onSendToFilm: () => void }) {
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <video src={video.url} controls className="aspect-video w-full bg-black object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
                        {video.width}x{video.height}
                    </span>
                    <span>{formatBytes(video.bytes)}</span>
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="small" onClick={onSendToFilm}>
                        送入影视制作
                    </Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        添加到资产
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        下载
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PendingVideoCard() {
    return <FyjitTaskStatus tone="pending" title="生成中" description="任务正在后台执行；关闭页面后仍可从历史记录恢复。" compact className="aspect-video" />;
}

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
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
            compact
            className="aspect-video"
        />
    );
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
                <h2 className="text-base font-semibold">生成记录</h2>
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
    return (
        <div className={`overflow-hidden rounded-lg border transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}>
            <button type="button" className="block w-full p-2 text-left" onClick={onClick}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                    <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag>
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.resolution}p</Tag>
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag>
                        </div>
                    </div>
                    <div className="grid justify-items-end gap-2">
                        <Tag
                            className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none"
                            color={log.status === "成功" ? "blue" : log.status === "排队中" || log.status === "运行中" ? "processing" : log.status === "已取消" ? "default" : "red"}
                        >
                            {log.status}
                        </Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                    </div>
                </div>
            </button>
            {log.task?.billing_status && log.task.billing_status !== "PENDING" ? (
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

async function creativeJobToVideoLog(job: CreativeJob): Promise<GenerationLog> {
    const [resultAssets, referenceAssets] = await Promise.all([
        Promise.all((job.result_asset_ids || []).map((assetId) => fetchCreativeAsset(assetId).catch(() => null))),
        Promise.all((job.reference_asset_ids || []).map((assetId) => fetchCreativeAsset(assetId).catch(() => null))),
    ]);
    const availableReferences = referenceAssets.filter((asset): asset is CreativeAsset => Boolean(asset));
    const references: ReferenceImage[] = availableReferences
        .filter((asset) => asset.type === "IMAGE" || asset.type === "REFERENCE")
        .map((asset) => ({
            id: asset.asset_id,
            assetId: asset.asset_id,
            name: asset.title || asset.asset_id,
            type: asset.mime_type || "image/png",
            dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        }));
    const videoReferences: ReferenceVideo[] = availableReferences
        .filter((asset) => asset.type === "VIDEO")
        .map((asset) => ({
            id: asset.asset_id,
            assetId: asset.asset_id,
            name: asset.title || asset.asset_id,
            type: asset.mime_type || "video/mp4",
            url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            width: asset.width,
            height: asset.height,
            bytes: asset.size_bytes,
            durationMs: asset.duration ? asset.duration * 1000 : undefined,
        }));
    const audioReferences: ReferenceAudio[] = availableReferences
        .filter((asset) => asset.type === "AUDIO")
        .map((asset) => ({
            id: asset.asset_id,
            assetId: asset.asset_id,
            name: asset.title || asset.asset_id,
            type: asset.mime_type || "audio/mpeg",
            url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            durationMs: asset.duration ? asset.duration * 1000 : undefined,
        }));
    const resultAsset = resultAssets.find((asset): asset is CreativeAsset => Boolean(asset));
    const durationMs = Math.max(0, ((job.finished_at || job.updated_at) - (job.started_at || job.created_at)) * 1000);
    const video: GeneratedVideo | undefined = resultAsset
        ? {
              id: resultAsset.asset_id,
              url: resultAsset.preview_path || `/api/creative/assets/${encodeURIComponent(resultAsset.asset_id)}/content`,
              durationMs,
              width: resultAsset.width || 1280,
              height: resultAsset.height || 720,
              bytes: resultAsset.size_bytes || 0,
              mimeType: resultAsset.mime_type || "video/mp4",
          }
        : undefined;
    const config = normalizeLogConfig({
        model: job.model,
        size: String(job.parameters.size || ""),
        resolution: String(job.parameters.resolution || ""),
        seconds: String(job.parameters.duration || ""),
        config: {
            model: job.model,
            videoModel: job.model,
            size: String(job.parameters.size || ""),
            vquality: String(job.parameters.resolution || ""),
            videoSeconds: String(job.parameters.duration || ""),
            videoFps: String(job.parameters.fps || "30"),
            videoGenerateAudio: String(job.parameters.generate_audio ?? true),
            videoWatermark: String(job.parameters.watermark ?? false),
            videoCameraFixed: String(job.parameters.camera_fixed ?? false),
        },
    });
    return {
        id: job.job_id,
        createdAt: job.created_at * 1000,
        title: job.prompt.slice(0, 12) || "未命名",
        prompt: job.prompt,
        negativePrompt: job.negative_prompt || "",
        time: new Date(job.created_at * 1000).toLocaleString("zh-CN", { hour12: false }),
        model: job.model,
        config,
        references,
        videoReferences,
        audioReferences,
        durationMs,
        size: config.size,
        resolution: config.vquality,
        seconds: config.videoSeconds,
        status: creativeVideoStatusLabel(job.status),
        task: job,
        video,
        error: job.error,
    };
}

function creativeVideoStatusLabel(status: CreativeJob["status"]): GenerationLog["status"] {
    switch (status) {
        case "CREATED":
        case "QUEUED":
            return "排队中";
        case "RUNNING":
            return "运行中";
        case "SUCCEEDED":
            return "成功";
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

function isSupportedAudioFile(file: File) {
    return file.type === "audio/mpeg" || file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/x-wav" || /\.(mp3|wav)$/i.test(file.name);
}

function filterAudioReferencesByDuration(existing: ReferenceAudio[], next: ReferenceAudio[], warn: (content: string) => void) {
    let total = existing.reduce((sum, item) => sum + (item.durationMs || 0), 0);
    const accepted: ReferenceAudio[] = [];
    let skipped = false;
    for (const item of next) {
        if (item.durationMs && (item.durationMs < 2000 || item.durationMs > 15000)) {
            skipped = true;
            continue;
        }
        if (item.durationMs && total + item.durationMs > 15000) {
            skipped = true;
            continue;
        }
        total += item.durationMs || 0;
        accepted.push(item);
    }
    if (skipped) warn("已忽略不符合时长要求的参考音频：单个 2-15 秒，总时长不超过 15 秒");
    return accepted;
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

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoFps: log.config?.videoFps || "30",
        videoGenerateAudio: log.config?.videoGenerateAudio || "true",
        videoWatermark: log.config?.videoWatermark || "false",
        videoCameraFixed: log.config?.videoCameraFixed || "false",
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    const seedance = isSeedanceVideoConfig({ ...config, model });
    return {
        ...config,
        model,
        videoModel: model,
        size: seedance ? normalizeSeedanceRatio(config.size) : normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function imageReferencePurpose(index: number, total: number) {
    if (total === 1) return "首帧/主参考";
    if (index === 0) return "首帧";
    if (index === total - 1) return "尾帧";
    return `画面参考 ${index + 1}`;
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}
