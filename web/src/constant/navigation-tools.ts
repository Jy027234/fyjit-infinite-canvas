import { FileText, ImagePlus, Images, Maximize2, Video } from "lucide-react";

export const navigationTools = [
    {
        slug: "image",
        label: "生图工作台",
        icon: ImagePlus,
    },
    {
        slug: "video",
        label: "视频创作台",
        icon: Video,
    },
    {
        slug: "canvas",
        label: "无限画布",
        icon: Maximize2,
    },
    {
        slug: "assets",
        label: "素材中心",
        icon: Images,
    },
    {
        slug: "prompts",
        label: "提示词库",
        icon: FileText,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
