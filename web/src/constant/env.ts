export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

import { SOURCE_COMMIT, SOURCE_URL } from "@/constant/runtime-config";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";
export const PUBLIC_SOURCE_URL = SOURCE_URL || `https://github.com/Jy027234/fyjit-infinite-canvas/tree/${SOURCE_COMMIT === "unknown" ? "main" : SOURCE_COMMIT}`;

// Official plugin registry URL: CI publishes to plugins-dist for jsDelivr delivery; an environment variable may override it for self-hosting.
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || "https://cdn.jsdelivr.net/gh/basketikun/infinite-canvas@plugins-dist/official-plugins.json";
