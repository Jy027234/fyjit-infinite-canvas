import { create } from "zustand";

import { fetchCreativeBootstrap, fetchCreativeCapabilities, fetchCreativeModels, fetchCreativeTokens, type CreativeBootstrap, type CreativeCapabilities, type CreativeModel, type CreativeToken } from "@/services/api/creative";

type BootstrapStatus = "idle" | "loading" | "ready" | "error";
export type FyjitResourceStatus = BootstrapStatus;

type ResourceError = {
    error?: string;
    errorStatus?: number;
    errorCode?: string;
};

type FyjitStore = {
    bootstrap?: CreativeBootstrap;
    capabilities?: CreativeCapabilities;
    models: CreativeModel[];
    tokens: CreativeToken[];
    bootstrapStatus: BootstrapStatus;
    bootstrapError?: string;
    bootstrapErrorStatus?: number;
    bootstrapErrorCode?: string;
    capabilitiesStatus: FyjitResourceStatus;
    capabilitiesError?: string;
    capabilitiesErrorStatus?: number;
    capabilitiesErrorCode?: string;
    modelsStatus: FyjitResourceStatus;
    modelsError?: string;
    modelsErrorStatus?: number;
    modelsErrorCode?: string;
    tokensStatus: FyjitResourceStatus;
    tokensError?: string;
    tokensErrorStatus?: number;
    tokensErrorCode?: string;
    loadBootstrap: (signal?: AbortSignal) => Promise<void>;
    loadCapabilities: (signal?: AbortSignal) => Promise<void>;
    loadModels: (signal?: AbortSignal) => Promise<void>;
    loadTokens: (signal?: AbortSignal) => Promise<void>;
    setInterfaceLanguage: (language: string) => Promise<void>;
};

let bootstrapRequest: Promise<void> | undefined;
let capabilitiesRequest: Promise<void> | undefined;
let modelsRequest: Promise<void> | undefined;
let tokensRequest: Promise<void> | undefined;

function resourceError(error: unknown): ResourceError {
    const apiError = (error && typeof error === "object" ? error : {}) as { status?: number; code?: string };
    return {
        error: error instanceof Error ? error.message : "Creative API 请求失败",
        errorStatus: apiError.status,
        errorCode: apiError.code,
    };
}

export const useFyjitStore = create<FyjitStore>((set) => ({
    bootstrapStatus: "idle",
    models: [],
    tokens: [],
    capabilitiesStatus: "idle",
    modelsStatus: "idle",
    tokensStatus: "idle",
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
        if (useFyjitStore.getState().bootstrapStatus === "ready") {
            return;
        }
        if (bootstrapRequest) return bootstrapRequest;

        set({ bootstrapStatus: "loading", bootstrapError: undefined, bootstrapErrorStatus: undefined, bootstrapErrorCode: undefined });
        bootstrapRequest = fetchCreativeBootstrap(signal)
            .then((bootstrap) => {
                if (signal?.aborted) {
                    set({ bootstrapStatus: "idle" });
                    return;
                }
                set({ bootstrap, bootstrapStatus: "ready" });
            })
            .catch((error) => {
                if (signal?.aborted) {
                    set({ bootstrapStatus: "idle" });
                    return;
                }
                const failure = resourceError(error);
                set({ bootstrapStatus: "error", bootstrapError: failure.error || "Creative API 初始化失败", bootstrapErrorStatus: failure.errorStatus, bootstrapErrorCode: failure.errorCode });
            })
            .finally(() => {
                bootstrapRequest = undefined;
            });
        return bootstrapRequest;
    },
    loadCapabilities: async (signal) => {
        if (useFyjitStore.getState().capabilitiesStatus === "ready") return;
        if (capabilitiesRequest) return capabilitiesRequest;
        set({ capabilitiesStatus: "loading", capabilitiesError: undefined, capabilitiesErrorStatus: undefined, capabilitiesErrorCode: undefined });
        capabilitiesRequest = fetchCreativeCapabilities(signal)
            .then((capabilities) => {
                if (signal?.aborted) {
                    set({ capabilitiesStatus: "idle" });
                    return;
                }
                set({ capabilities, capabilitiesStatus: "ready" });
            })
            .catch((error) => {
                if (signal?.aborted) {
                    set({ capabilitiesStatus: "idle" });
                    return;
                }
                const failure = resourceError(error);
                set({ capabilitiesStatus: "error", capabilitiesError: failure.error, capabilitiesErrorStatus: failure.errorStatus, capabilitiesErrorCode: failure.errorCode });
            })
            .finally(() => {
                capabilitiesRequest = undefined;
            });
        return capabilitiesRequest;
    },
    loadModels: async (signal) => {
        if (useFyjitStore.getState().modelsStatus === "ready") return;
        if (modelsRequest) return modelsRequest;
        set({ modelsStatus: "loading", modelsError: undefined, modelsErrorStatus: undefined, modelsErrorCode: undefined });
        modelsRequest = fetchCreativeModels({ signal })
            .then((models) => {
                if (signal?.aborted) {
                    set({ modelsStatus: "idle" });
                    return;
                }
                set({ models, modelsStatus: "ready" });
            })
            .catch((error) => {
                if (signal?.aborted) {
                    set({ modelsStatus: "idle" });
                    return;
                }
                const failure = resourceError(error);
                set({ modelsStatus: "error", modelsError: failure.error, modelsErrorStatus: failure.errorStatus, modelsErrorCode: failure.errorCode });
            })
            .finally(() => {
                modelsRequest = undefined;
            });
        return modelsRequest;
    },
    loadTokens: async (signal) => {
        if (useFyjitStore.getState().tokensStatus === "ready") return;
        if (tokensRequest) return tokensRequest;
        set({ tokensStatus: "loading", tokensError: undefined, tokensErrorStatus: undefined, tokensErrorCode: undefined });
        tokensRequest = fetchCreativeTokens(signal)
            .then((tokens) => {
                if (signal?.aborted) {
                    set({ tokensStatus: "idle" });
                    return;
                }
                set({ tokens, tokensStatus: "ready" });
            })
            .catch((error) => {
                if (signal?.aborted) {
                    set({ tokensStatus: "idle" });
                    return;
                }
                const failure = resourceError(error);
                set({ tokensStatus: "error", tokensError: failure.error, tokensErrorStatus: failure.errorStatus, tokensErrorCode: failure.errorCode });
            })
            .finally(() => {
                tokensRequest = undefined;
            });
        return tokensRequest;
    },
}));
