import { afterEach, describe, expect, test } from "bun:test";

import { useFyjitStore } from "./use-fyjit-store";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

const bootstrap = {
    user: { id: 7, username: "demo", display_name: "Demo", quota: 10, group: "default" },
    features: { "image-workbench": true, "video-workbench": true },
    navigation: [],
    permissions: { creative: true },
    theme_version: "1",
    capabilities_version: "1",
};

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    useFyjitStore.setState({
        bootstrap: undefined,
        capabilities: undefined,
        models: [],
        tokens: [],
        bootstrapStatus: "idle",
        bootstrapError: undefined,
        bootstrapErrorStatus: undefined,
        bootstrapErrorCode: undefined,
        capabilitiesStatus: "idle",
        capabilitiesError: undefined,
        capabilitiesErrorStatus: undefined,
        capabilitiesErrorCode: undefined,
        modelsStatus: "idle",
        modelsError: undefined,
        modelsErrorStatus: undefined,
        modelsErrorCode: undefined,
        tokensStatus: "idle",
        tokensError: undefined,
        tokensErrorStatus: undefined,
        tokensErrorCode: undefined,
    });
});

describe("FYJIT bootstrap resources", () => {
    test("keeps the app available when optional resources fail and retries them independently", async () => {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { localStorage: { getItem: () => null } },
        });
        const requests: string[] = [];
        const failures = new Set(["capabilities", "models", "tokens"]);
        globalThis.fetch = (async (input: string | URL | Request) => {
            const path = String(input);
            requests.push(path);
            if (path.endsWith("/bootstrap")) return Response.json({ data: bootstrap });
            if (path.endsWith("/capabilities")) {
                if (failures.has("capabilities")) return Response.json({ code: "capabilities_unavailable", message: "能力服务暂不可用" }, { status: 503 });
                return Response.json({ data: { version: "1", capabilities: {}, model_counts: {} } });
            }
            if (path.endsWith("/models")) {
                if (failures.has("models")) return Response.json({ code: "models_unavailable", message: "模型服务暂不可用" }, { status: 503 });
                return Response.json({ data: [{ id: "image-v1", name: "Image V1", groups: ["default"], capabilities: ["image_generation"], capability_profiles: {}, supported_endpoint_types: [] }] });
            }
            if (path.endsWith("/tokens")) {
                if (failures.has("tokens")) return Response.json({ code: "tokens_unavailable", message: "Token 服务暂不可用" }, { status: 503 });
                return Response.json({ data: [{ id: 1, name: "default", group: "default", unlimited_quota: true, remain_quota: 10, expired_time: 0, model_limits_enabled: false }] });
            }
            throw new Error(`unexpected request: ${path}`);
        }) as unknown as typeof fetch;

        const bootstrapRequest = useFyjitStore.getState().loadBootstrap();
        await bootstrapRequest;

        expect(useFyjitStore.getState().bootstrapStatus).toBe("ready");
        expect(useFyjitStore.getState().capabilitiesStatus).toBe("idle");
        expect(useFyjitStore.getState().modelsStatus).toBe("idle");
        expect(useFyjitStore.getState().tokensStatus).toBe("idle");
        expect(useFyjitStore.getState().bootstrap?.user.id).toBe(7);
        expect(requests.filter((path) => path.endsWith("/bootstrap"))).toHaveLength(1);

        await Promise.all([
            useFyjitStore.getState().loadCapabilities(),
            useFyjitStore.getState().loadCapabilities(),
            useFyjitStore.getState().loadModels(),
            useFyjitStore.getState().loadModels(),
            useFyjitStore.getState().loadTokens(),
            useFyjitStore.getState().loadTokens(),
        ]);
        expect(useFyjitStore.getState().capabilitiesStatus).toBe("error");
        expect(useFyjitStore.getState().modelsStatus).toBe("error");
        expect(useFyjitStore.getState().tokensStatus).toBe("error");
        expect(requests.filter((path) => path.endsWith("/capabilities"))).toHaveLength(1);
        expect(requests.filter((path) => path.endsWith("/models"))).toHaveLength(1);
        expect(requests.filter((path) => path.endsWith("/tokens"))).toHaveLength(1);

        failures.clear();
        await Promise.all([useFyjitStore.getState().loadCapabilities(), useFyjitStore.getState().loadModels(), useFyjitStore.getState().loadTokens()]);
        expect(useFyjitStore.getState().capabilitiesStatus).toBe("ready");
        expect(useFyjitStore.getState().modelsStatus).toBe("ready");
        expect(useFyjitStore.getState().tokensStatus).toBe("ready");
        expect(useFyjitStore.getState().models).toHaveLength(1);
        expect(useFyjitStore.getState().tokens).toHaveLength(1);
    });

    test("deduplicates concurrent bootstrap calls", async () => {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { localStorage: { getItem: () => null } },
        });
        let releaseBootstrap: ((response: Response) => void) | undefined;
        let bootstrapCalls = 0;
        globalThis.fetch = (async (input: string | URL | Request) => {
            const path = String(input);
            if (path.endsWith("/bootstrap")) {
                bootstrapCalls += 1;
                return new Promise<Response>((resolve) => {
                    releaseBootstrap = resolve;
                });
            }
            if (path.endsWith("/capabilities")) return Response.json({ data: { version: "1", capabilities: {}, model_counts: {} } });
            if (path.endsWith("/models")) return Response.json({ data: [] });
            if (path.endsWith("/tokens")) return Response.json({ data: [] });
            throw new Error(`unexpected request: ${path}`);
        }) as unknown as typeof fetch;

        const first = useFyjitStore.getState().loadBootstrap();
        const second = useFyjitStore.getState().loadBootstrap();
        expect(bootstrapCalls).toBe(1);
        releaseBootstrap?.(Response.json({ data: bootstrap }));
        await Promise.all([first, second]);
        await Promise.all([useFyjitStore.getState().loadCapabilities(), useFyjitStore.getState().loadModels(), useFyjitStore.getState().loadTokens()]);
        expect(useFyjitStore.getState().bootstrapStatus).toBe("ready");
    });
});
