import { afterAll, expect, test } from "bun:test";
import type { AiConfig, ModelCapability } from "../src/stores/use-config-store";
import type { CanvasNodeData } from "../src/types/canvas";

// Config and i18n use browser storage during module initialization.
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { defaultConfig, resolveModelForCapability, useConfigStore } = await import("../src/stores/use-config-store");
const { buildGenerationConfig } = await import("../src/lib/canvas/canvas-generation-helpers");
const { CanvasNodeType } = await import("../src/types/canvas");

const config: AiConfig = {
    ...defaultConfig,
    videoModel: "video-b",
    models: ["video-b", "video-a", "image-a"],
    modelCapabilities: { "video-b": ["video"], "video-a": ["video"], "image-a": ["image"] },
};
const ready = useConfigStore.getState().isAiConfigReady;
const videoNode = (model: string): CanvasNodeData => ({
    id: "saved-video",
    type: CanvasNodeType.Video,
    title: "Saved video",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: { model, creativeJobId: "original-job", seconds: "4" },
});

test("a saved video on a removed server model is not replaced by the default video model", () => {
    const selected = buildGenerationConfig(config, videoNode("removed-video"), "video");
    expect(selected.model).toBe("removed-video");
    expect(ready(selected, selected.model)).toBe(false);
});

test("removing a model from the server capability list prevents retry", () => {
    const selected = buildGenerationConfig(config, videoNode("deleted-video"), "video");
    expect(selected.model).toBe("deleted-video");
    expect(ready(selected, selected.model)).toBe(false);
});

test("task recovery rejects a missing model instead of querying a fallback model", () => {
    expect(ready(config, "removed-video")).toBe(false);
    expect(ready(config, "unknown-video")).toBe(false);
});

test("an explicitly selected unavailable default is not replaced by the built-in default", () => {
    const selected = buildGenerationConfig({ ...config, videoModel: "removed-video" }, undefined, "video");
    expect(selected.model).toBe("removed-video");
    expect(ready(selected, selected.model)).toBe(false);
});

test("a new node without a selection still uses its configured default", () => {
    const selected = buildGenerationConfig(config, undefined, "video");
    expect(selected.model).toBe("video-b");
    expect(ready(selected, selected.model)).toBe(true);
});

test("switching generation capability still selects a model of the new capability", () => {
    expect(resolveModelForCapability(config, "image-a", "video")).toBe("video-b");
});

test("refreshing server capabilities preserves unavailable explicit selections until the user changes them", () => {
    useConfigStore.setState({ config: { ...config, videoModel: "removed-video" } });
    useConfigStore.getState().syncFyjitModels([{ id: "video-b", capabilities: ["video_generation"] }]);
    expect(useConfigStore.getState().config.videoModel).toBe("removed-video");
    expect(ready(useConfigStore.getState().config, "removed-video")).toBe(false);
    useConfigStore.setState({ config: defaultConfig });
});

test("unavailable explicit selections are preserved for every generation capability", () => {
    for (const capability of ["image", "video", "text", "audio"] as ModelCapability[]) {
        expect(resolveModelForCapability(config, `removed-${capability}`, capability)).toBe(`removed-${capability}`);
    }
});
