import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelCapability = "image" | "video" | "text" | "audio";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";

export type AiConfig = {
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    models: string[];
    modelCapabilities: Record<string, ModelCapability[]>;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    videoFps: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoCameraFixed: string;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
};

export type FyjitModel = {
    id: string;
    capabilities: string[];
    recommended_for?: string[];
};

export const CONFIG_STORE_KEY = "fyjit-creative:preferences";

export const defaultConfig: AiConfig = {
    model: "",
    imageModel: "",
    videoModel: "",
    textModel: "",
    audioModel: "",
    models: [],
    modelCapabilities: {},
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    videoFps: "30",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoCameraFixed: "false",
    systemPrompt: "",
    reasoningEffort: "auto",
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
};

type ConfigStore = {
    config: AiConfig;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    syncFyjitModels: (models: FyjitModel[]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (...args: unknown[]) => void;
};

const persistedPreferenceKeys = [
    "model",
    "imageModel",
    "videoModel",
    "textModel",
    "audioModel",
    "audioVoice",
    "audioFormat",
    "audioSpeed",
    "audioInstructions",
    "videoSeconds",
    "videoFps",
    "vquality",
    "videoGenerateAudio",
    "videoWatermark",
    "videoCameraFixed",
    "systemPrompt",
    "reasoningEffort",
    "quality",
    "size",
    "background",
    "count",
    "canvasImageCount",
] as const satisfies ReadonlyArray<keyof AiConfig>;

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set) => ({
            config: defaultConfig,
            updateConfig: (key, value) => set((state) => ({ config: { ...state.config, [key]: value } })),
            syncFyjitModels: (models) =>
                set((state) => {
                    const ids = Array.from(new Set(models.map((item) => item.id.trim()).filter(Boolean)));
                    const modelCapabilities = Object.fromEntries(
                        models.map((item) => [item.id, creativeCapabilities(item.capabilities)]),
                    );
                    const next = { ...state.config, models: ids, modelCapabilities };
                    next.imageModel = availableSelection(next, state.config.imageModel, "image", recommendedModel(models, "image_generation"));
                    next.videoModel = availableSelection(next, state.config.videoModel, "video", recommendedModel(models, "video_generation"));
                    next.textModel = availableSelection(next, state.config.textModel, "text", recommendedModel(models, "text_generation"));
                    next.audioModel = availableSelection(next, state.config.audioModel, "audio");
                    next.model = next.imageModel || next.videoModel || next.textModel || next.audioModel || ids[0] || "";
                    return { config: next };
                }),
            isAiConfigReady: (config, model) => Boolean(model.trim() && config.models.includes(modelOptionName(model))),
            openConfigDialog: () => undefined,
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({
                config: Object.fromEntries(persistedPreferenceKeys.map((key) => [key, state.config[key]])) as unknown as AiConfig,
            }),
            merge: (persisted, current) => {
                const persistedConfig = ((persisted as Partial<ConfigStore> | undefined)?.config || {}) as Partial<AiConfig>;
                const preferences = Object.fromEntries(
                    persistedPreferenceKeys
                        .filter((key) => persistedConfig[key] !== undefined)
                        .map((key) => [key, persistedConfig[key]]),
                ) as Partial<AiConfig>;
                return { ...current, config: { ...defaultConfig, ...preferences, models: [], modelCapabilities: {} } };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => config, [config]);
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return config.modelCapabilities[modelOptionName(value)]?.[0];
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    return !capability || config.modelCapabilities[modelOptionName(value)]?.includes(capability) === true;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const preferred = modelOptionName(currentModel || "");
    if (preferred && modelMatchesCapability(config, preferred, capability)) return preferred;
    return availableSelection(config, "", capability);
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    return capability ? config.models.filter((model) => modelMatchesCapability(config, model, capability)) : config.models;
}

export function normalizeModelOptionValue(value: string | undefined, models: string[]) {
    const normalized = modelOptionName(value || "");
    return models.includes(normalized) ? normalized : "";
}

export function modelOptionName(value: string) {
    const separator = value.indexOf("::");
    return separator >= 0 ? value.slice(separator + 2) : value;
}

export function modelOptionLabel(_config: AiConfig, value: string) {
    return modelOptionName(value);
}

function availableSelection(config: AiConfig, current: string, capability: ModelCapability, recommended = "") {
    const normalized = modelOptionName(current);
    if (normalized && modelMatchesCapability(config, normalized, capability)) return normalized;
    if (recommended && modelMatchesCapability(config, recommended, capability)) return recommended;
    return selectableModelsByCapability(config, capability)[0] || "";
}

function recommendedModel(models: FyjitModel[], capability: string) {
    return models.find((model) => model.recommended_for?.includes(capability))?.id || "";
}

function creativeCapabilities(capabilities: string[]): ModelCapability[] {
    const result: ModelCapability[] = [];
    if (capabilities.includes("image_generation")) result.push("image");
    if (capabilities.includes("video_generation")) result.push("video");
    if (capabilities.includes("text_generation")) result.push("text");
    if (capabilities.includes("audio_generation")) result.push("audio");
    return result;
}
