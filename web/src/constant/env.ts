export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

import { SOURCE_COMMIT, SOURCE_URL } from "@/constant/runtime-config";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";
export const PUBLIC_SOURCE_URL = SOURCE_URL || `https://github.com/basketikun/infinite-canvas/tree/${SOURCE_COMMIT === "unknown" ? "v0.13.0" : SOURCE_COMMIT}`;

// 官方插件清单地址:CI 发布到 plugins-dist 分支,经 jsDelivr 远程拉取;可用环境变量覆盖成自建来源
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || "https://cdn.jsdelivr.net/gh/basketikun/infinite-canvas@plugins-dist/official-plugins.json";
