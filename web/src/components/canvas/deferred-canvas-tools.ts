export const loadCanvasPluginManager = () => import("./canvas-plugin-manager-modal");
export const loadCanvasImageDialogs = () => import("./canvas-image-dialogs");
export const loadCanvasAssetPicker = () => import("./asset-picker-modal");

export function preloadCanvasPluginManager() {
    void loadCanvasPluginManager().catch(() => undefined);
}

export function preloadCanvasImageDialogs() {
    void loadCanvasImageDialogs().catch(() => undefined);
}

export function preloadCanvasAssetPicker() {
    void loadCanvasAssetPicker().catch(() => undefined);
}
