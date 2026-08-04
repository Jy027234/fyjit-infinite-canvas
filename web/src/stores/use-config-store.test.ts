import { afterEach, describe, expect, test } from "bun:test";

import { defaultConfig, selectableModelsByCapability, useConfigStore } from "./use-config-store";

afterEach(() => {
    useConfigStore.setState({ config: defaultConfig });
});

describe("FYJIT model preferences", () => {
    test("selects the server-recommended model for each capability", () => {
        useConfigStore.getState().syncFyjitModels([
            { id: "text-model", capabilities: ["text_generation"] },
            { id: "image-fallback", capabilities: ["image_generation"] },
            { id: "image-model", capabilities: ["image_generation"] },
            { id: "video-model", capabilities: ["video_generation"] },
            { id: "image-recommended", capabilities: ["image_generation"], recommended_for: ["image_generation"] },
        ]);

        const config = useConfigStore.getState().config;
        expect(config.imageModel).toBe("image-recommended");
        expect(config.videoModel).toBe("video-model");
        expect(config.textModel).toBe("text-model");
        expect(selectableModelsByCapability(config, "image")).toEqual(["image-fallback", "image-model", "image-recommended"]);
        expect(useConfigStore.getState().isAiConfigReady(config, "image-model")).toBe(true);
    });

    test("does not retain upstream provider credentials in browser state", () => {
        const config = useConfigStore.getState().config as unknown as Record<string, unknown>;
        expect(config.apiKey).toBeUndefined();
        expect(config.baseUrl).toBeUndefined();
        expect(config.channels).toBeUndefined();
    });
});
