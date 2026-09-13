import { FileText, ImagePlus, Images, Maximize2, Video } from "lucide-react";

export const navigationTools = [
    {
        key: "image-workbench",
        slug: "image",
        href: "/image",
        label: "生图工作台",
        icon: ImagePlus,
    },
    {
        key: "video-workbench",
        slug: "video",
        href: "/video",
        label: "视频创作台",
        icon: Video,
    },
    {
        key: "infinite-canvas",
        slug: "canvas",
        href: "/canvas",
        label: "无限画布",
        icon: Maximize2,
    },
    {
        key: "creative-assets",
        slug: "assets",
        href: "/assets",
        label: "素材中心",
        icon: Images,
    },
    {
        key: "creative-prompts",
        slug: "prompts",
        href: "/prompts",
        label: "提示词库",
        icon: FileText,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];

export function creativeLocalHref(serverHref: string | undefined, fallbackSlug: NavigationToolSlug) {
    const fallback = `/${fallbackSlug}`;
    if (!serverHref?.trim()) return fallback;
    try {
        const pathname = new URL(serverHref, "https://fyjit.local").pathname.replace(/\/+$/, "");
        const candidate = pathname.split("/").filter(Boolean).at(-1);
        return navigationTools.some((tool) => tool.slug === candidate) ? `/${candidate}` : fallback;
    } catch {
        return fallback;
    }
}
