import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
    licenseId: string;
    licenseUrl: string;
    attribution: string;
    syncPolicy: "full" | "link-only";
    auditStatus: "approved" | "unverified";
};

export const PROMPT_REGISTRY_HOMEPAGE = "https://github.com/yukkcat/image-prompts";
const PROMPT_REGISTRY_SOURCE_BASE = "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources";

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "新来源",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
        licenseId: source?.licenseId?.trim() || "",
        licenseUrl: source?.licenseUrl?.trim() || "",
        attribution: source?.attribution?.trim() || "",
        syncPolicy: source?.syncPolicy === "full" ? "full" : "link-only",
        auditStatus: source?.auditStatus === "approved" ? "approved" : "unverified",
    };
}

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
    registrySource("banana-prompt-quicker", "Banana Prompt Quicker", "https://glidea.github.io/banana-prompt-quicker/", "MIT", "https://github.com/glidea/banana-prompt-quicker/blob/main/LICENSE", "glidea/banana-prompt-quicker contributors"),
    registrySource("davidwu-gpt-image2-prompts", "DavidWu GPT Image 2", "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts", "UNVERIFIED", "", "Repository unavailable during the 2026-08-04 audit", false),
    registrySource("awesome-gpt-image", "Awesome GPT Image", "https://github.com/ZeroLu/awesome-gpt-image", "MIT", "https://github.com/ZeroLu/awesome-gpt-image/blob/main/LICENSE", "ZeroLu/awesome-gpt-image contributors"),
    registrySource("awesome-gpt4o-image-prompts", "Awesome GPT-4o", "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts", "MIT", "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts/blob/main/LICENSE", "ImgEdify/Awesome-GPT4o-Image-Prompts contributors"),
    registrySource("youmind-gpt-image-2", "YouMind GPT Image 2", "https://github.com/YouMind-OpenLab/awesome-gpt-image-2", "CC-BY-4.0", "https://github.com/YouMind-OpenLab/awesome-gpt-image-2/blob/main/LICENSE", "Copyright 2026 YouMind OpenLab"),
    registrySource("youmind-nano-banana-pro", "YouMind Nano Banana Pro", "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts", "CC-BY-4.0", "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/blob/main/LICENSE", "Copyright 2025 YouMind OpenLab"),
];

function registrySource(id: string, name: string, homepage: string, licenseId: string, licenseUrl: string, attribution: string, approved = true): PromptSource {
    return {
        id,
        name,
        url: `${PROMPT_REGISTRY_SOURCE_BASE}/${id}.json`,
        homepage,
        enabled: true,
        builtIn: true,
        licenseId,
        licenseUrl,
        attribution,
        syncPolicy: approved ? "full" : "link-only",
        auditStatus: approved ? "approved" : "unverified",
    };
}

export function canSyncPromptSource(source: PromptSource) {
    return source.enabled && isPromptSourceApproved(source);
}

export function isPromptSourceApproved(source: PromptSource) {
    return source.syncPolicy === "full" && source.auditStatus === "approved" && Boolean(source.licenseId.trim());
}
