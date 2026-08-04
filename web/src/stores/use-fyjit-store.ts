import { create } from "zustand";

import { fetchCreativeBootstrap, fetchCreativeCapabilities, fetchCreativeModels, fetchCreativeTokens, type CreativeBootstrap, type CreativeCapabilities, type CreativeModel, type CreativeToken } from "@/services/api/creative";

type BootstrapStatus = "idle" | "loading" | "ready" | "error";

type FyjitStore = {
    bootstrap?: CreativeBootstrap;
    capabilities?: CreativeCapabilities;
    models: CreativeModel[];
    tokens: CreativeToken[];
    bootstrapStatus: BootstrapStatus;
    bootstrapError?: string;
    bootstrapErrorStatus?: number;
    bootstrapErrorCode?: string;
    loadBootstrap: (signal?: AbortSignal) => Promise<void>;
};

export const useFyjitStore = create<FyjitStore>((set) => ({
    bootstrapStatus: "idle",
    models: [],
    tokens: [],
    loadBootstrap: async (signal) => {
        set({ bootstrapStatus: "loading", bootstrapError: undefined, bootstrapErrorStatus: undefined, bootstrapErrorCode: undefined });
        try {
            const [bootstrap, capabilities, models, tokens] = await Promise.all([fetchCreativeBootstrap(signal), fetchCreativeCapabilities(signal), fetchCreativeModels({ signal }), fetchCreativeTokens(signal)]);
            set({ bootstrap, capabilities, models, tokens, bootstrapStatus: "ready" });
        } catch (error) {
            if (signal?.aborted) return;
            const apiError = error as { status?: number; code?: string };
            set({
                bootstrapStatus: "error",
                bootstrapError: error instanceof Error ? error.message : "Creative API 初始化失败",
                bootstrapErrorStatus: apiError.status,
                bootstrapErrorCode: apiError.code,
            });
        }
    },
}));
