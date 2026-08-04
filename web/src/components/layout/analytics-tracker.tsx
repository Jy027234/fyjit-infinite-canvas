import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPageview } from "@/lib/analytics";

const ROUTE_METADATA = [
    { pattern: /^\/$|^\/image\/?$/, name: "creative.image", title: "图片生成" },
    { pattern: /^\/video\/?$/, name: "creative.video", title: "视频生成" },
    { pattern: /^\/assets\/?$/, name: "creative.assets", title: "素材中心" },
    { pattern: /^\/prompts\/?$/, name: "creative.prompts", title: "提示词库" },
    { pattern: /^\/canvas\/?$/, name: "creative.canvas", title: "无限画布" },
    { pattern: /^\/canvas\/[^/]+\/?$/, name: "creative.canvas_project", title: "画布项目" },
] as const;

function resolveRouteMetadata(pathname: string) {
    return ROUTE_METADATA.find(({ pattern }) => pattern.test(pathname)) ?? {
        name: "creative.not_found",
        title: "页面未找到",
    };
}

// 监听 SPA 路由变化并上报 pageview。无统计配置时 trackPageview 为空操作。
export function AnalyticsTracker() {
    const location = useLocation();

    useEffect(() => {
        const route = resolveRouteMetadata(location.pathname);
        const title = `${route.title} · FYJIT 创作中心`;

        document.title = title;
        document.documentElement.dataset.routeName = route.name;
        window.dispatchEvent(new CustomEvent("fyjit:route-view", { detail: { name: route.name, title } }));
        trackPageview(`${location.pathname}${location.search}`, route.name, title);
    }, [location.pathname, location.search]);

    return null;
}
