import { ArrowLeft, ArrowRight, BookOpen, ClipboardPaste, Download, FolderPlus, Music2, Sparkles, Trash2, Upload, VideoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { App, Button, Drawer, Input, Tag, Typography } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
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
import { FyjitEmptyState, FyjitTaskStatus } from "@/components/fyjit/creative-ui";
import { CreativeEstimateSummary } from "@/components/creative-estimate-summary";
import { CreativeGenerationStatus, creativeJobPendingSnapshot, summarizeCreativePendingResults, type CreativeGenerationPhase } from "@/components/creative-generation-status";
import { CreativeHistoryPanel } from "@/components/creative-history-panel";
import { CreativeReadinessNotice } from "@/components/creative-readiness-notice";
import { CreativeResultCardShell } from "@/components/creative-result-card-shell";
import { creativeJobStatusLabel, CreativeStatusTag, type CreativeHistoryStatus } from "@/components/creative-status-tag";
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
    uploadCreativeAsset,
    waitForCreativeJob,
    type CreativeAsset,
    type CreativeAssetSummary,
    type CreativeJob,
    type CreativeModelCapabilityProfile,
} from "@/services/api/creative";
import { clearCreativeDraft, loadCreativeDraft, saveCreativeDraft, sanitizeCreativeDraftReference, type VideoWorkbenchDraft } from "@/services/creative-draft-storage";
import { useCreativeAssetDetails } from "@/hooks/use-creative-asset-details";
import { creativeAssetDetailQueryOptions, isCreativeAssetDetail, uniqueCreativeAssetIds } from "@/services/creative-asset-details";
import { upsertCreativeAssetListCache } from "@/services/creative-asset-list";
import { creativeAssetSummaryFromDetail } from "@/services/creative-job-history";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { useCreativeEstimate } from "@/hooks/use-creative-estimate";
import { useCreativeJobHistory } from "@/hooks/use-creative-job-history";
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
    posterUrl?: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed" | "asset-detail-error";
    phase?: CreativeGenerationPhase;
    progress?: number;
    video?: GeneratedVideo;
    error?: string;
    jobId?: string;
    assetIds?: string[];
    job?: CreativeJob;
    durationMs?: number;
    retrying?: boolean;
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
    status: CreativeHistoryStatus;
    task?: CreativeJob;
    video?: GeneratedVideo;
    fullAssetIds?: string[];
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoFps" | "videoGenerateAudio" | "videoWatermark" | "videoCameraFixed">;

type VideoDraftUndoSnapshot = {
    prompt: string;
    negativePrompt: string;
    projectId: string;
    model: string;
    size: string;
    vquality: string;
    videoSeconds: string;
    videoFps: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoCameraFixed: string;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    results: GenerationResult[];
};

type RestoredVideoReference = { kind: "image"; value: ReferenceImage } | { kind: "video"; value: ReferenceVideo } | { kind: "audio"; value: ReferenceAudio };

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
const HISTORY_PAGE_SIZE = 20;

function videoAssetCompatibilityHint(profile?: CreativeModelCapabilityProfile) {
    const audioHint = (profile?.max_reference_audio || 0) > 0 ? `另可添加最多 ${profile?.max_reference_audio} 个参考音频。` : "";
    if (profile?.input_modes.includes("image_to_video")) return `当前模型为图生视频：请选择且只能选择一张首帧图片，画面比例将继承首帧。${audioHint}`;
    if (profile?.input_modes.includes("reference_to_video")) return `当前模型为参考图生视频：请选择 1–${profile.max_reference_images} 张参考图。${audioHint}`;
    if ((profile?.max_reference_videos || 0) > 0 || (profile?.max_reference_audio || 0) > 0)
        return `当前模型支持参考素材：图片最多 ${profile?.max_reference_images || 0} 张，视频最多 ${profile?.max_reference_videos || 0} 个，音频最多 ${profile?.max_reference_audio || 0} 个。`;
    return "当前模型为文生视频，只能插入文本素材作为提示词。";
}

export default function VideoPage() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
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
    const currentUserId = useFyjitStore((state) => state.bootstrap?.user.id);
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [videoReferences, setVideoReferences] = useState<ReferenceVideo[]>([]);
    const [audioReferences, setAudioReferences] = useState<ReferenceAudio[]>([]);
    const [projectId, setProjectId] = useState("");
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const jobHistory = useCreativeJobHistory({ capability: "video_generation", pageSize: HISTORY_PAGE_SIZE });
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
    const [activeJobId, setActiveJobId] = useState<string>();
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [undoDraft, setUndoDraft] = useState<VideoDraftUndoSnapshot | null>(null);
    const [referenceDragTarget, setReferenceDragTarget] = useState<"image" | "video" | "audio" | null>(null);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const imageReferenceSectionRef = useRef<HTMLDivElement>(null);
    const videoReferenceSectionRef = useRef<HTMLDivElement>(null);
    const audioReferenceSectionRef = useRef<HTMLDivElement>(null);
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
    const detailedPreviewLog = useMemo(() => (previewLog ? hydrateVideoLogWithAssets(previewLog, previewAssetDetails.assets) : null), [previewAssetDetails.assets, previewLog]);
    const pendingSummary = summarizeCreativePendingResults(results);

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
    const multiReferenceVideoModel = videoModels.find((item) => {
        const profile = item.capability_profiles.video_generation;
        return item.id !== model && profile?.input_modes.includes("reference_to_video") && (profile?.max_reference_images || 0) > 1;
    });
    const multiReferenceMaxImages = multiReferenceVideoModel?.capability_profiles.video_generation?.max_reference_images || 0;

    const switchToMultiReferenceVideo = (requiredCount: number) => {
        const candidate = videoModels.find((item) => {
            const profile = item.capability_profiles.video_generation;
            return item.id !== model && profile?.input_modes.includes("reference_to_video") && (profile?.max_reference_images || 0) >= requiredCount;
        });
        const candidateProfile = candidate?.capability_profiles.video_generation;
        if (!candidate || !candidateProfile) return 0;
        updateConfig("videoModel", candidate.id);
        message.info(`已切换至 ${candidate.name || candidate.id}，支持最多 ${candidateProfile.max_reference_images} 张参考图`);
        return candidateProfile.max_reference_images;
    };

    const ensureImageReferenceCapacity = (requiredCount: number) => {
        if (requiredCount <= maxImageReferences) return maxImageReferences;
        const capacity = switchToMultiReferenceVideo(requiredCount);
        if (capacity) return capacity;
        message.warning(`当前模型最多支持 ${maxImageReferences} 张参考图，账号暂无可支持 ${requiredCount} 张的参考生视频模型`);
        return maxImageReferences;
    };

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
        if (intent) {
            intentAppliedRef.current = true;
            skipNextDraftLoadRef.current = Boolean(intent.project_id && intent.project_id !== projectId);
        }
        if (intent?.prompt) setPrompt(intent.prompt);
        if (intent?.negative_prompt) setNegativePrompt(intent.negative_prompt);
        if (intent?.project_id) setProjectId(intent.project_id);
        if (intent?.asset_ids?.length) {
            const ids = intent.asset_ids;
            void Promise.all(ids.map((assetId) => fetchCreativeAsset(assetId)))
                .then((assets) => {
                    const imageAssets = assets.filter((asset) => ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type));
                    const videoAssets = assets.filter((asset) => asset.type === "VIDEO");
                    const audioAssets = assets.filter((asset) => asset.type === "AUDIO");
                    const imageReferenceLimit = ensureImageReferenceCapacity(references.length + imageAssets.length);
                    setReferences((current) =>
                        [
                            ...current,
                            ...imageAssets.map((asset) => ({
                                id: asset.asset_id,
                                assetId: asset.asset_id,
                                name: asset.title || "角色参考图",
                                type: asset.mime_type || "image/png",
                                dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
                                thumbnailUrl: asset.thumbnail_path,
                            })),
                        ].slice(0, imageReferenceLimit),
                    );
                    if (videoAssets.length && maxVideoReferences < 1) message.warning("当前视频模型不接受视频参考素材");
                    else if (videoAssets.length) {
                        const available = Math.max(0, maxVideoReferences - videoReferences.length);
                        if (videoAssets.length > available) message.warning(`当前视频模型最多接受 ${maxVideoReferences} 个参考视频`);
                        setVideoReferences((current) => [
                            ...current,
                            ...videoAssets.slice(0, available).map((asset) => ({
                                id: asset.asset_id,
                                assetId: asset.asset_id,
                                name: asset.title || "参考视频",
                                type: asset.mime_type || "video/mp4",
                                url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
                                width: asset.width,
                                height: asset.height,
                            })),
                        ]);
                    }
                    if (audioAssets.length && maxAudioReferences < 1) message.warning("当前视频模型不接受音频参考素材");
                    else if (audioAssets.length) {
                        const available = Math.max(0, maxAudioReferences - audioReferences.length);
                        if (audioAssets.length > available) message.warning(`当前视频模型最多接受 ${maxAudioReferences} 个参考音频`);
                        const candidates = audioAssets.slice(0, available).map((asset) => ({
                            id: asset.asset_id,
                            assetId: asset.asset_id,
                            name: asset.title || "参考音频",
                            type: asset.mime_type || "audio/mpeg",
                            url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
                            durationMs: typeof asset.duration === "number" ? asset.duration * 1000 : undefined,
                        }));
                        const accepted = filterAudioReferencesByDuration(audioReferences, candidates, (content) => message.warning(content));
                        if (accepted.length) setAudioReferences((current) => [...current, ...accepted].slice(0, maxAudioReferences));
                    }
                })
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
            setVideoReferences([]);
            setAudioReferences([]);
        }
        let cancelled = false;
        void loadCreativeDraft<VideoWorkbenchDraft>(userId, "video", projectId).then(async (draft) => {
            if (cancelled) return;
            if (draft) {
                setPrompt(draft.prompt);
                setNegativePrompt(draft.negativePrompt);
                if (draft.model) updateConfig("videoModel", draft.model);
                updateConfig("size", draft.config.size);
                updateConfig("vquality", draft.config.vquality);
                updateConfig("videoSeconds", draft.config.videoSeconds);
                updateConfig("videoFps", draft.config.videoFps);
                updateConfig("videoGenerateAudio", draft.config.videoGenerateAudio);
                updateConfig("videoWatermark", draft.config.videoWatermark);
                updateConfig("videoCameraFixed", draft.config.videoCameraFixed);
                const draftProfile = draft.model ? fyjitModels.find((item) => item.id === draft.model)?.capability_profiles.video_generation : undefined;
                const draftMaxImageReferences = draftProfile?.max_reference_images ?? maxImageReferences;
                const draftMaxVideoReferences = draftProfile?.max_reference_videos ?? maxVideoReferences;
                const draftMaxAudioReferences = draftProfile?.max_reference_audio ?? maxAudioReferences;
                const restored = await Promise.all(
                    draft.references.map(async (reference): Promise<RestoredVideoReference | null> => {
                        try {
                            const asset = await fetchCreativeAsset(reference.assetId);
                            const url = asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`;
                            if (reference.kind === "image" && ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type)) {
                                return {
                                    kind: "image" as const,
                                    value: {
                                        id: asset.asset_id,
                                        assetId: asset.asset_id,
                                        name: asset.title || reference.name,
                                        type: asset.mime_type || reference.type || "image/png",
                                        dataUrl: url,
                                        thumbnailUrl: asset.thumbnail_path,
                                    } satisfies ReferenceImage,
                                };
                            }
                            if (reference.kind === "video" && asset.type === "VIDEO") {
                                return {
                                    kind: "video" as const,
                                    value: {
                                        id: asset.asset_id,
                                        assetId: asset.asset_id,
                                        name: asset.title || reference.name,
                                        type: asset.mime_type || reference.type || "video/mp4",
                                        url,
                                        width: asset.width,
                                        height: asset.height,
                                        durationMs: asset.duration ? asset.duration * 1000 : undefined,
                                    } satisfies ReferenceVideo,
                                };
                            }
                            if (reference.kind === "audio" && asset.type === "AUDIO") {
                                return {
                                    kind: "audio" as const,
                                    value: {
                                        id: asset.asset_id,
                                        assetId: asset.asset_id,
                                        name: asset.title || reference.name,
                                        type: asset.mime_type || reference.type || "audio/mpeg",
                                        url,
                                        durationMs: asset.duration ? asset.duration * 1000 : undefined,
                                    } satisfies ReferenceAudio,
                                };
                            }
                        } catch {
                            return null;
                        }
                        return null;
                    }),
                );
                if (cancelled) return;
                const validRestored = restored.filter((item): item is RestoredVideoReference => Boolean(item));
                setReferences(
                    validRestored
                        .filter((item) => item.kind === "image")
                        .map((item) => item.value)
                        .slice(0, draftMaxImageReferences),
                );
                setVideoReferences(
                    validRestored
                        .filter((item) => item.kind === "video")
                        .map((item) => item.value)
                        .slice(0, draftMaxVideoReferences),
                );
                setAudioReferences(
                    validRestored
                        .filter((item) => item.kind === "audio")
                        .map((item) => item.value)
                        .slice(0, draftMaxAudioReferences),
                );
                if (restored.filter(Boolean).length !== draft.references.length) message.info("草稿中的部分参考素材已失效，请重新选择");
            }
            if (!cancelled) {
                draftScopeRef.current = scope;
                draftHydratedRef.current = true;
            }
        });
        return () => {
            cancelled = true;
        };
    }, [currentUserId, projectId, fyjitModels, maxImageReferences, maxVideoReferences, maxAudioReferences]);

    useEffect(() => {
        const userId = String(currentUserId || "").trim();
        const scope = `${userId}:${projectId}`;
        if (!userId || !draftHydratedRef.current || draftScopeRef.current !== scope) return;
        const revision = draftWriteRevisionRef.current;
        const timer = window.setTimeout(() => {
            if (revision !== draftWriteRevisionRef.current) return;
            const referencesToPersist = [
                ...references.map((reference) => sanitizeCreativeDraftReference({ assetId: reference.assetId, name: reference.name, type: reference.type, kind: "image" })),
                ...videoReferences.map((reference) => sanitizeCreativeDraftReference({ assetId: reference.assetId, name: reference.name, type: reference.type, kind: "video" })),
                ...audioReferences.map((reference) => sanitizeCreativeDraftReference({ assetId: reference.assetId, name: reference.name, type: reference.type, kind: "audio" })),
            ].filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
            const draft: VideoWorkbenchDraft = {
                version: 1,
                kind: "video",
                projectId,
                prompt,
                negativePrompt,
                model,
                config: {
                    size: effectiveConfig.size,
                    vquality: effectiveConfig.vquality,
                    videoSeconds: effectiveConfig.videoSeconds,
                    videoFps: effectiveConfig.videoFps,
                    videoGenerateAudio: effectiveConfig.videoGenerateAudio,
                    videoWatermark: effectiveConfig.videoWatermark,
                    videoCameraFixed: effectiveConfig.videoCameraFixed,
                },
                references: referencesToPersist,
                updatedAt: Date.now(),
            };
            void saveCreativeDraft(userId, "video", projectId, draft);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [
        currentUserId,
        projectId,
        prompt,
        negativePrompt,
        model,
        effectiveConfig.size,
        effectiveConfig.vquality,
        effectiveConfig.videoSeconds,
        effectiveConfig.videoFps,
        effectiveConfig.videoGenerateAudio,
        effectiveConfig.videoWatermark,
        effectiveConfig.videoCameraFixed,
        references,
        videoReferences,
        audioReferences,
    ]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    const addReferences = async (files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/") && !SEEDANCE_VIDEO_MIME_TYPES.includes(file.type) && !isSupportedAudioFile(file));
        if (unsupported.length) message.warning("已忽略不支持的参考资产，请使用图片、mp4/mov 视频或 mp3/wav 音频");
        const imageCandidates = selectedFiles.filter((file) => file.type.startsWith("image/") && file.size <= SEEDANCE_REFERENCE_LIMITS.imageMaxBytes);
        const imageReferenceLimit = ensureImageReferenceCapacity(references.length + imageCandidates.length);
        const imageFiles = imageCandidates.slice(0, Math.max(0, imageReferenceLimit - references.length));
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
        setReferences((value) => [...value, ...nextReferences].slice(0, imageReferenceLimit));
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
            const imageReferenceLimit = ensureImageReferenceCapacity(references.length + blobs.length);
            const nextReferences = await Promise.all(
                blobs.slice(0, Math.max(0, imageReferenceLimit - references.length)).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, imageReferenceLimit));
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
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
        setResults([{ id: nanoid(), status: "pending", phase: "preparing" }]);
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
            updateCompletedJobCache(task);
            draftWriteRevisionRef.current += 1;
            await clearCreativeDraft(currentUserId, "video", projectId);
            setActiveJobId(task.job_id);
            const log = await creativeJobToVideoLog(task);
            log.references = snapshot.references;
            log.videoReferences = snapshot.videoReferences;
            log.audioReferences = snapshot.audioReferences;
            updateCompletedJobCache(task);
            setLogs((current) => [log, ...current.filter((item) => item.id !== log.id)]);
            setResults([{ id: log.id, status: "pending", ...creativeJobPendingSnapshot(task.status, task.progress) }]);
            void pollGenerationLog(log, agentTaskId, true);
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
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
        void generate();
    };

    const retryResultDetails = async () => {
        const result = results[0];
        if (result?.status !== "asset-detail-error" || result.retrying || !result.assetIds?.length || !result.job) return;
        setResults((value) => value.map((item) => (item.id === result.id ? { ...item, retrying: true } : item)));
        try {
            const assets = await Promise.all(result.assetIds.map((assetId) => queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId))));
            const asset = assets[0];
            if (!asset) throw new Error("任务没有返回视频素材");
            await applyCompletedVideoJob(
                result.job,
                [asset],
                logs.find((item) => item.id === result.id),
            );
            const video = generatedVideoFromAsset(asset, result.durationMs || 0);
            if (!video) throw new Error("任务返回的素材不是视频");
            setResults((value) => (value.some((item) => item.id === result.id) ? [{ id: video.id, status: "success", video }] : value));
            message.success("结果详情已加载");
        } catch (error) {
            const detailError = error instanceof Error ? error.message : "结果详情加载失败";
            setResults((value) => value.map((item) => (item.id === result.id ? { ...item, retrying: false, error: detailError } : item)));
            message.error("结果详情仍未加载，可稍后重试");
        }
    };

    const cancelActiveJob = async () => {
        if (!activeJobId) return;
        try {
            const cancelled = await cancelCreativeJob(activeJobId);
            await applyCompletedVideoJob(
                cancelled,
                [],
                logs.find((item) => item.id === cancelled.job_id),
                false,
            );
            setResults((current) => (current.some((item) => item.id === cancelled.job_id) ? [{ id: cancelled.job_id, status: "failed", error: "任务已取消" }] : current));
            setRunning(false);
            setActiveJobId(undefined);
            message.info("任务已取消；已发生的上游消费以 FYJIT 使用记录为准");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消任务失败");
        }
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, "video.mp4");
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
            const imageReferenceLimit = ensureImageReferenceCapacity(references.length + 1);
            if (imageReferenceLimit < references.length + 1) {
                return;
            }
            setReferences((value) => [...value, { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: "image/png", dataUrl: payload.dataUrl, thumbnailUrl: payload.thumbnailUrl }].slice(0, imageReferenceLimit));
            window.requestAnimationFrame(() => imageReferenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            message.success("已插入下方“参考图”，生成时会作为 @图片N 参考素材提交");
        } else if (payload.kind === "video") {
            if (maxVideoReferences < 1) {
                message.warning("当前视频模型不接受视频参考素材");
                return;
            }
            if (videoReferences.length >= maxVideoReferences) {
                message.warning(`当前视频模型最多接受 ${maxVideoReferences} 个参考视频`);
                return;
            }
            setVideoReferences((value) =>
                [...value, { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: payload.mimeType || "video/mp4", url: payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height }].slice(
                    0,
                    maxVideoReferences,
                ),
            );
            window.requestAnimationFrame(() => videoReferenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            message.success("已插入下方“参考视频”，生成时会作为运动参考提交");
        } else if (payload.kind === "audio") {
            if (maxAudioReferences < 1) {
                message.warning("当前视频模型不接受音频参考素材");
                return;
            }
            if (audioReferences.length >= maxAudioReferences) {
                message.warning(`当前视频模型最多接受 ${maxAudioReferences} 个参考音频`);
                return;
            }
            const candidate = { id: payload.assetId || nanoid(), assetId: payload.assetId, name: payload.title, type: payload.mimeType || "audio/mpeg", url: payload.url, storageKey: payload.storageKey, durationMs: payload.durationMs };
            const accepted = filterAudioReferencesByDuration(audioReferences, [candidate], (content) => message.warning(content));
            if (!accepted.length) return;
            setAudioReferences((value) => [...value, ...accepted].slice(0, maxAudioReferences));
            window.requestAnimationFrame(() => audioReferenceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            message.success("已插入下方“参考音频”，生成时会作为声音参考提交");
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
        void Promise.all(jobHistory.items.map((job) => creativeJobToVideoLog(job, fetchAsset))).then((nextLogs) => {
            if (cancelled || historyConversionRevisionRef.current !== revision) return;
            setLogs(nextLogs);
            if (shouldResume) resumePendingLogs(nextLogs);
        });
        return () => {
            cancelled = true;
        };
    }, [jobHistory.assets, jobHistory.items]);

    const resumePendingLogs = (items: GenerationLog[]) => {
        const pending = items.filter((log) => (log.status === "排队中" || log.status === "运行中") && log.task);
        for (const [index, log] of pending.entries()) {
            void pollGenerationLog(log, undefined, index === 0);
        }
    };

    const applyCompletedVideoJob = async (completed: CreativeJob, assets: CreativeAsset[] = [], fallback?: GenerationLog, fetchMissingDetails = true) => {
        updateCompletedJobCache(completed, assets);
        const assetsById = new Map(assets.map((asset) => [asset.asset_id, asset]));
        const next = await creativeJobToVideoLog(completed, async (assetId) => {
            const detail = assetsById.get(assetId);
            if (detail) return detail;
            const summary = jobHistory.assets.find((asset) => asset.asset_id === assetId);
            return summary || (fetchMissingDetails ? queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId)).catch(() => null) : null);
        });
        const preserved = fallback || logs.find((item) => item.id === next.id);
        const hydrated = preserved
            ? {
                  ...next,
                  references: next.references.length ? next.references : preserved.references,
                  videoReferences: next.videoReferences.length ? next.videoReferences : preserved.videoReferences,
                  audioReferences: next.audioReferences.length ? next.audioReferences : preserved.audioReferences,
              }
            : next;
        setLogs((current) => (current.some((item) => item.id === hydrated.id) ? current.map((item) => (item.id === hydrated.id ? hydrated : item)) : [hydrated, ...current]));
        setPreviewLog((current) => (current?.id === hydrated.id ? hydrated : current));
        return hydrated;
    };

    const pollGenerationLog = async (log: GenerationLog, agentTaskId?: string, foreground = false) => {
        if (!log.task || activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        if (foreground) {
            setRunning(true);
            setActiveJobId(log.id);
            setStartedAt((value) => value || performance.now());
            setResults([{ id: log.id, status: "pending", ...creativeJobPendingSnapshot(log.task.status, log.task.progress) }]);
        }
        try {
            const completed = await waitForCreativeJob(log.task.job_id, {
                intervalMs: 2500,
                onUpdate: (next) => {
                    updateCompletedJobCache(next);
                    if (foreground) setResults([{ id: log.id, status: "pending", ...creativeJobPendingSnapshot(next.status, next.progress) }]);
                },
            });
            await applyCompletedVideoJob(completed, [], log, false);
            if (completed.status !== "SUCCEEDED" && completed.status !== "PARTIAL_SUCCESS") {
                if (completed.status === "CANCELLED") {
                    if (foreground) setResults([{ id: log.id, status: "failed", error: "任务已取消" }]);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 0, error: "任务已取消" });
                    if (foreground) message.info("视频任务已取消");
                    return;
                }
                throw new Error(completed.error || creativeJobStatusLabel(completed.status));
            }
            const assetId = completed.result_asset_ids?.[0];
            if (!assetId) throw new Error("视频任务没有返回素材");
            let asset: CreativeAsset;
            try {
                asset = await queryClient.fetchQuery(creativeAssetDetailQueryOptions(assetId));
            } catch (error) {
                const detailError = error instanceof Error ? error.message : "结果详情加载失败";
                if (foreground) {
                    setResults([
                        {
                            id: log.id,
                            status: "asset-detail-error",
                            jobId: completed.job_id,
                            assetIds: [assetId],
                            job: completed,
                            durationMs: Date.now() - log.createdAt,
                            error: detailError,
                        },
                    ]);
                    message.warning("任务已完成，结果详情加载失败，可重试加载");
                }
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                return;
            }
            await applyCompletedVideoJob(completed, [asset], log);
            const nextVideo = generatedVideoFromAsset(asset, Date.now() - log.createdAt);
            if (!nextVideo) throw new Error("任务返回的素材不是视频");
            if (foreground) setResults([{ id: nextVideo.id, status: "success", video: nextVideo }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
            if (foreground) {
                if (completed.status === "PARTIAL_SUCCESS") message.warning(completed.error || "部分结果生成失败，已保留可用视频");
                else message.success("视频已生成并保存到 FYJIT 素材中心");
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "生成失败";
            if (foreground) setResults([{ id: log.id, status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            if (foreground) message.error(errorMessage);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            if (foreground) {
                setRunning(false);
                setStartedAt(0);
                setActiveJobId((current) => (current === log.id ? undefined : current));
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
        if (!previewResultsBeforeRef.current) {
            previewResultsBeforeRef.current = results.map((result) => ({ ...result, video: result.video ? { ...result.video } : undefined }));
        }
        setPreviewLog(log);
        setLogsOpen(false);
        setResults(videoResultsFromLog(log));
    };

    useEffect(() => {
        if (!previewLog || !detailedPreviewLog || !previewAssetDetails.assets.size) return;
        const nextResults = videoResultsFromLog(detailedPreviewLog);
        setResults((current) => (videoResultSignature(current) === videoResultSignature(nextResults) ? current : nextResults));
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
                    model,
                    size: effectiveConfig.size,
                    vquality: effectiveConfig.vquality,
                    videoSeconds: effectiveConfig.videoSeconds,
                    videoFps: effectiveConfig.videoFps,
                    videoGenerateAudio: effectiveConfig.videoGenerateAudio,
                    videoWatermark: effectiveConfig.videoWatermark,
                    videoCameraFixed: effectiveConfig.videoCameraFixed,
                    references: references.map((reference) => ({ ...reference })),
                    videoReferences: videoReferences.map((reference) => ({ ...reference })),
                    audioReferences: audioReferences.map((reference) => ({ ...reference })),
                    results: (previewResultsBeforeRef.current || results).map((result) => ({ ...result, video: result.video ? { ...result.video } : undefined })),
                });
                const nextProjectId = log.task?.project_id || "";
                skipNextDraftLoadRef.current = nextProjectId !== projectId;
                setProjectId(nextProjectId);
                setPrompt(log.prompt);
                setNegativePrompt(log.negativePrompt);
                setReferences(log.references || []);
                setVideoReferences(log.videoReferences || []);
                setAudioReferences(log.audioReferences || []);
                if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
                if (log.config.size) updateConfig("size", log.config.size);
                if (log.config.vquality) updateConfig("vquality", log.config.vquality);
                if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
                if (log.config.videoFps) updateConfig("videoFps", log.config.videoFps);
                if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
                if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
                if (log.config.videoCameraFixed) updateConfig("videoCameraFixed", log.config.videoCameraFixed);
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
        setReferences(previous.references.map((reference) => ({ ...reference })));
        setVideoReferences(previous.videoReferences.map((reference) => ({ ...reference })));
        setAudioReferences(previous.audioReferences.map((reference) => ({ ...reference })));
        setResults(previous.results.map((result) => ({ ...result, video: result.video ? { ...result.video } : undefined })));
        updateConfig("videoModel", previous.model);
        updateConfig("size", previous.size);
        updateConfig("vquality", previous.vquality);
        updateConfig("videoSeconds", previous.videoSeconds);
        updateConfig("videoFps", previous.videoFps);
        updateConfig("videoGenerateAudio", previous.videoGenerateAudio);
        updateConfig("videoWatermark", previous.videoWatermark);
        updateConfig("videoCameraFixed", previous.videoCameraFixed);
        setPreviewLog(null);
        setUndoDraft(null);
        previewResultsBeforeRef.current = null;
        message.success("已撤销历史参数替换");
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
                        onSelectItem={previewGenerationLog}
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
                        <CreativeWorkbenchHeader title="视频创作台" onOpenHistory={() => setLogsOpen(true)} onOpenParameters={() => setSettingsOpen(true)} />

                        <div className="mt-6 space-y-5">
                            <CreativeReadinessNotice capabilityLabel="视频" hasModel={hasVideoModel} hasToken={fyjitTokens.length > 0} />
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
                                    id="video-prompt"
                                    name="video-prompt"
                                    ref={promptInputRef}
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    rows={7}
                                    placeholder="描述镜头运动、主体动作、场景氛围和画面风格；可用 @图片1 关联参考素材"
                                />
                                <ReferencePromptMentions references={promptReferences} onInsert={insertPromptReference} />
                                <Input.TextArea
                                    id="video-negative-prompt"
                                    name="video-negative-prompt"
                                    className="mt-3"
                                    value={negativePrompt}
                                    onChange={(event) => setNegativePrompt(event.target.value)}
                                    rows={3}
                                    placeholder="负向提示词（可选）：描述不希望出现的元素"
                                />
                            </div>

                            {maxImageReferences <= 1 && multiReferenceVideoModel ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm text-foreground">
                                    <span>需要同时关联人物、背景、道具等多张图片？</span>
                                    <Button size="small" type="link" className="!h-auto !p-0" onClick={() => switchToMultiReferenceVideo(2)}>
                                        切换为多参考图模型（最多 {multiReferenceMaxImages} 张）
                                    </Button>
                                </div>
                            ) : null}

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
                                        className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget === "image" ? "border-primary bg-accent" : "border-border"}`}
                                        onDragEnter={(event) => handleReferenceDragEnter(event, "image")}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
                                    >
                                        {references.map((item, index) => (
                                            <div key={item.id} className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-md border border-border">
                                                <img src={item.thumbnailUrl || item.dataUrl} alt={item.name} className="size-full object-cover" loading="lazy" />
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
                                            <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">
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
                                        className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget === "video" ? "border-primary bg-accent" : "border-border"}`}
                                        onDragEnter={(event) => handleReferenceDragEnter(event, "video")}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
                                    >
                                        {videoReferences.map((item, index) => (
                                            <div key={item.id} className="group relative h-20 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-black">
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
                                            <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">
                                                {referenceDragTarget === "video" ? "松开即可上传参考资产" : `暂无参考视频，可拖入文件，最多 ${maxVideoReferences} 个`}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            {maxAudioReferences > 0 ? (
                                <div ref={audioReferenceSectionRef} className="min-w-0 scroll-mt-20">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-base font-semibold">参考音频</span>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            上传
                                        </Button>
                                    </div>
                                    <div
                                        className={`hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${referenceDragTarget === "audio" ? "border-primary bg-accent" : "border-border"}`}
                                        onDragEnter={(event) => handleReferenceDragEnter(event, "audio")}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
                                    >
                                        {audioReferences.map((item, index) => (
                                            <div key={item.id} className="group relative flex h-20 w-48 shrink-0 flex-col justify-center gap-2 rounded-md border border-border bg-muted/40 px-2">
                                                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                                    <Music2 className="size-4 shrink-0" />
                                                    <span className="shrink-0 rounded bg-secondary px-1 text-[10px] text-secondary-foreground">{seedanceReferenceLabel("audio", index)}</span>
                                                    <span className="truncate">{item.name}</span>
                                                </div>
                                                <span className="truncate text-[10px] text-muted-foreground">声音参考 · {item.assetId ? "素材中心" : "提交时上传"}</span>
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
                                            <div className="flex min-w-full items-center justify-center text-center text-sm text-muted-foreground">
                                                {referenceDragTarget === "audio" ? "松开即可上传参考资产" : `暂无参考音频，可拖入文件，最多 ${maxAudioReferences} 个，mp3/wav，单个 15MB 内`}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            <CreativeParametersSection
                                collapsed={parametersCollapsed}
                                onCollapsedChange={setParametersCollapsed}
                                summary={`${modelOptionLabel(effectiveConfig, model)} · ${normalizeResolution(effectiveConfig.vquality)}p · ${videoSizeLabel(effectiveConfig.size)} · ${normalizeVideoSeconds(effectiveConfig.videoSeconds)}s`}
                            >
                                <div className="grid grid-cols-2 gap-4">
                                    <GenerationSettings config={effectiveConfig} model={model} profile={modelProfile} projectId={projectId} onProjectChange={setProjectId} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
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
                                    referenceCounts={{ images: references.length, videos: videoReferences.length, audio: audioReferences.length }}
                                    purposeLabel="视频生成"
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
                            secondaryAction={
                                running && activeJobId ? (
                                    <Button danger block onClick={() => void cancelActiveJob()}>
                                        取消当前任务
                                    </Button>
                                ) : null
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
                            <div className="grid gap-4">
                                {results.map((result) =>
                                    result.status === "success" && result.video ? (
                                        <ResultVideoCard key={result.id} video={result.video} onDownload={downloadVideo} onSendToFilm={() => void sendResultToFilmProduction(result.video!)} />
                                    ) : result.status === "failed" ? (
                                        <FailedVideoCard key={result.id} error={result.error || "生成失败"} onRetry={retryResult} />
                                    ) : result.status === "asset-detail-error" ? (
                                        <AssetDetailErrorVideoCard key={result.id} error={result.error || "结果详情加载失败"} loading={result.retrying} onRetry={() => void retryResultDetails()} />
                                    ) : (
                                        <PendingVideoCard key={result.id} phase={result.phase} progress={result.progress} elapsedMs={elapsedMs} />
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
                    </CreativeWorkbenchResult>
                </CreativeWorkbenchContent>
            </CreativeWorkbenchMain>
            <input
                id="video-reference-files"
                name="video-reference-files"
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
                <CreativeHistoryPanel
                    items={logs}
                    activeItemId={previewLog?.id}
                    disabled={running}
                    onCreateSession={createSession}
                    onSelectItem={previewGenerationLog}
                    total={jobHistory.total}
                    initialLoading={jobHistory.isPending}
                    loadingMore={jobHistory.isFetchingNextPage}
                    error={jobHistory.error instanceof Error ? jobHistory.error.message : jobHistory.isError ? "生成记录加载失败" : ""}
                    onRetry={() => void jobHistory.refetch()}
                    onLoadMore={() => void jobHistory.fetchNextPage()}
                    renderCard={(log, context) => <LogCard key={log.id} log={log} active={context.active} disabled={context.disabled} onClick={context.onSelect} />}
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
                acceptedTypes={["TEXT", ...(maxImageReferences > 0 ? (["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"] as const) : []), ...(maxVideoReferences > 0 ? (["VIDEO"] as const) : []), ...(maxAudioReferences > 0 ? (["AUDIO"] as const) : [])]}
                compatibilityHint={videoAssetCompatibilityHint(modelProfile)}
                onInsert={(payload) => void insertPickedAsset(payload)}
                onClose={() => setAssetPickerOpen(false)}
            />
        </CreativeWorkbenchRoot>
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

function ResultVideoCard({ video, onDownload, onSendToFilm }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSendToFilm: () => void }) {
    return (
        <CreativeResultCardShell
            media={<video src={video.url} poster={video.posterUrl} controls aria-label="生成视频结果" className="aspect-video w-full bg-black object-contain" />}
            footerClassName="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
            footer={
                <>
                    <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            {video.width}x{video.height}
                        </span>
                        <span>{formatBytes(video.bytes)}</span>
                        <span>{formatDuration(video.durationMs)}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-success">已保存到素材中心</span>
                        <div className="flex shrink-0 gap-1">
                            <Button size="small" onClick={onSendToFilm}>
                                送入影视制作
                            </Button>
                            <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                                下载
                            </Button>
                        </div>
                    </div>
                </>
            }
        />
    );
}

function PendingVideoCard({ phase, progress, elapsedMs }: { phase?: CreativeGenerationPhase; progress?: number; elapsedMs: number }) {
    return <CreativeGenerationStatus variant="panel" phase={phase} progress={progress} elapsedMs={elapsedMs} className="aspect-video" />;
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

function AssetDetailErrorVideoCard({ error, loading, onRetry }: { error: string; loading?: boolean; onRetry: () => void }) {
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
            compact
            className="aspect-video"
        />
    );
}

function LogCard({ log, active, disabled, onClick }: { log: GenerationLog; active: boolean; disabled: boolean; onClick: () => void }) {
    return (
        <div className={`overflow-hidden rounded-lg border transition ${active ? "border-primary bg-accent" : "border-border bg-background hover:bg-muted/50"}`}>
            <button type="button" className="block w-full p-2 text-left disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={onClick}>
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-2">
                    <div className="grid aspect-video w-[4.5rem] place-items-center overflow-hidden rounded-md bg-black/90 text-white/65">
                        {log.video?.posterUrl ? <img src={log.video.posterUrl} alt="" className="size-full object-cover" loading="lazy" /> : <VideoIcon className="size-5" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag>
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.resolution}p</Tag>
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag>
                        </div>
                    </div>
                    <div className="grid justify-items-end gap-2">
                        <CreativeStatusTag status={log.status} />
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{formatDuration(log.durationMs)}</Tag>
                    </div>
                </div>
            </button>
            {log.task?.billing_status && log.task.billing_status !== "PENDING" ? (
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

function generatedVideoFromAsset(asset: CreativeAssetHistoryRecord, durationMs: number): GeneratedVideo | undefined {
    if (asset.type !== "VIDEO") return undefined;
    return {
        id: asset.asset_id,
        url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        posterUrl: asset.thumbnail_path,
        durationMs,
        width: asset.width || 1280,
        height: asset.height || 720,
        bytes: asset.size_bytes || 0,
        mimeType: asset.mime_type || "video/mp4",
    };
}

function videoReferenceFromAsset(asset: CreativeAssetHistoryRecord): ReferenceVideo | null {
    if (asset.type !== "VIDEO") return null;
    return {
        id: asset.asset_id,
        assetId: asset.asset_id,
        name: asset.title || asset.asset_id,
        type: asset.mime_type || "video/mp4",
        url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        width: asset.width,
        height: asset.height,
        bytes: asset.size_bytes,
        durationMs: asset.duration ? asset.duration * 1000 : undefined,
    };
}

function audioReferenceFromAsset(asset: CreativeAssetHistoryRecord): ReferenceAudio | null {
    if (asset.type !== "AUDIO") return null;
    return {
        id: asset.asset_id,
        assetId: asset.asset_id,
        name: asset.title || asset.asset_id,
        type: asset.mime_type || "audio/mpeg",
        url: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        durationMs: asset.duration ? asset.duration * 1000 : undefined,
    };
}

function imageReferenceFromVideoAsset(asset: CreativeAssetHistoryRecord): ReferenceImage | null {
    if (asset.type !== "IMAGE" && asset.type !== "REFERENCE") return null;
    return {
        id: asset.asset_id,
        assetId: asset.asset_id,
        name: asset.title || asset.asset_id,
        type: asset.mime_type || "image/png",
        dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
        thumbnailUrl: asset.thumbnail_path,
    };
}

function hydrateVideoLogWithAssets(log: GenerationLog, details: ReadonlyMap<string, CreativeAsset>): GenerationLog {
    const referencesById = new Map(log.references.map((reference) => [reference.assetId || reference.id, reference]));
    const videoReferencesById = new Map(log.videoReferences.map((reference) => [reference.assetId || reference.id, reference]));
    const audioReferencesById = new Map(log.audioReferences.map((reference) => [reference.assetId || reference.id, reference]));
    const references: ReferenceImage[] = [];
    const videoReferences: ReferenceVideo[] = [];
    const audioReferences: ReferenceAudio[] = [];
    for (const assetId of log.task?.reference_asset_ids || []) {
        const detail = details.get(assetId);
        if (!detail) {
            if (referencesById.has(assetId)) references.push(referencesById.get(assetId)!);
            if (videoReferencesById.has(assetId)) videoReferences.push(videoReferencesById.get(assetId)!);
            if (audioReferencesById.has(assetId)) audioReferences.push(audioReferencesById.get(assetId)!);
            continue;
        }
        const imageReference = imageReferenceFromVideoAsset(detail);
        const videoReference = videoReferenceFromAsset(detail);
        const audioReference = audioReferenceFromAsset(detail);
        if (imageReference) references.push(imageReference);
        else if (videoReference) videoReferences.push(videoReference);
        else if (audioReference) audioReferences.push(audioReference);
    }
    const resultAssetId = log.task?.result_asset_ids?.[0];
    const resultAsset = resultAssetId ? details.get(resultAssetId) : undefined;
    const detailedVideo = resultAsset ? generatedVideoFromAsset(resultAsset, log.durationMs) : undefined;
    return {
        ...log,
        references: references.length ? references : log.references,
        videoReferences: videoReferences.length ? videoReferences : log.videoReferences,
        audioReferences: audioReferences.length ? audioReferences : log.audioReferences,
        video: detailedVideo || log.video,
        fullAssetIds: uniqueCreativeAssetIds([...(log.fullAssetIds || []), ...details.keys()]),
    };
}

function videoResultsFromLog(log: GenerationLog): GenerationResult[] {
    if (log.status === "排队中" || log.status === "运行中") return [{ id: log.id, status: "pending" }];
    return log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || log.status }];
}

function videoResultSignature(results: GenerationResult[]) {
    return results.map((result) => `${result.id}:${result.status}:${result.video?.url || ""}:${result.video?.posterUrl || ""}`).join("|");
}

function createSummaryAssetFetcher(assets: CreativeAssetSummary[] = []): CreativeAssetFetcher {
    const byId = new Map(assets.map((asset) => [asset.asset_id, asset]));
    return async (assetId) => byId.get(assetId) || null;
}

async function creativeJobToVideoLog(job: CreativeJob, fetchAsset: CreativeAssetFetcher = (assetId) => fetchCreativeAsset(assetId).catch(() => null)): Promise<GenerationLog> {
    const [resultAssets, referenceAssets] = await Promise.all([Promise.all((job.result_asset_ids || []).map(fetchAsset)), Promise.all((job.reference_asset_ids || []).map(fetchAsset))]);
    const fullAssetIds = uniqueCreativeAssetIds([...resultAssets, ...referenceAssets].filter(isCreativeAssetDetail).map((asset) => asset.asset_id));
    const availableReferences = referenceAssets.filter((asset): asset is CreativeAssetHistoryRecord => Boolean(asset));
    const references: ReferenceImage[] = availableReferences
        .filter((asset) => asset.type === "IMAGE" || asset.type === "REFERENCE")
        .map((asset) => ({
            id: asset.asset_id,
            assetId: asset.asset_id,
            name: asset.title || asset.asset_id,
            type: asset.mime_type || "image/png",
            dataUrl: asset.preview_path || `/api/creative/assets/${encodeURIComponent(asset.asset_id)}/content`,
            thumbnailUrl: asset.thumbnail_path,
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
    const resultAsset = resultAssets.find((asset): asset is CreativeAssetHistoryRecord => Boolean(asset));
    const durationMs = Math.max(0, ((job.finished_at || job.updated_at) - (job.started_at || job.created_at)) * 1000);
    const video: GeneratedVideo | undefined = resultAsset
        ? {
              id: resultAsset.asset_id,
              url: resultAsset.preview_path || `/api/creative/assets/${encodeURIComponent(resultAsset.asset_id)}/content`,
              posterUrl: resultAsset.thumbnail_path,
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
        status: creativeJobStatusLabel(job.status),
        task: job,
        video,
        fullAssetIds,
        error: job.error,
    };
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
