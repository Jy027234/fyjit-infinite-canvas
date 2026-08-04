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
    setInterfaceLanguage: (language: string) => Promise<void>;
};

export const useFyjitStore = create<FyjitStore>((set) => ({
    bootstrapStatus: "idle",
    models: [],
    tokens: [],
    setInterfaceLanguage: async (language) => {
        const previous = useFyjitStore.getState().bootstrap?.user.language;
        const updateLocalState = (nextLanguage?: string) => set((state) => (state.bootstrap ? { bootstrap: { ...state.bootstrap, user: { ...state.bootstrap.user, language: nextLanguage } } } : {}));
        try {
            window.localStorage.setItem("i18nextLng", language);
        } catch {
            // Language still persists server-side when browser storage is unavailable.
        }
        updateLocalState(language);
        const uid = window.localStorage.getItem("uid") || "";
        const response = await fetch("/api/user/self", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json", "New-Api-User": uid },
            body: JSON.stringify({ language }),
        });
        const payload = (await response.json().catch(() => undefined)) as { success?: boolean; message?: string } | undefined;
        if (!response.ok || payload?.success !== true) {
            updateLocalState(previous);
            throw new Error(payload?.message || "Failed to update interface language");
        }
    },
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
