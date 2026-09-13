import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { initWebVitals, trackCreativeMetric, trackPageview } from "@/lib/analytics";

const ROUTE_METADATA = [
    { pattern: /^\/$|^\/image\/?$/, name: "creative.image", title: "图片生成" },
    { pattern: /^\/video\/?$/, name: "creative.video", title: "视频生成" },
    { pattern: /^\/assets\/?$/, name: "creative.assets", title: "素材中心" },
    { pattern: /^\/prompts\/?$/, name: "creative.prompts", title: "提示词库" },
    { pattern: /^\/canvas\/?$/, name: "creative.canvas", title: "无限画布" },
    { pattern: /^\/canvas\/[^/]+\/?$/, name: "creative.canvas_project", title: "画布项目" },
] as const;

function resolveRouteMetadata(pathname: string) {
    return (
        ROUTE_METADATA.find(({ pattern }) => pattern.test(pathname)) ?? {
            name: "creative.not_found",
            title: "页面未找到",
        }
    );
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
        // 查询参数可能包含跨应用草稿或 Agent 凭据；统计只记录归一化页面，不发送 search/hash。
        trackPageview(location.pathname, route.name, title);
        initWebVitals(route.name);

        if (route.name !== "creative.image" && route.name !== "creative.video") return;
        const startedAt = performance.now();
        let frame = 0;
        const reportWhenReady = () => {
            const input = document.querySelector<HTMLTextAreaElement>('[data-fyjit-performance-ready="workbench-input"]');
            if (!input || input.disabled || input.readOnly) return false;
            frame = requestAnimationFrame(() => trackCreativeMetric("workbench_ready", performance.now() - startedAt, route.name));
            return true;
        };
        if (reportWhenReady()) return () => cancelAnimationFrame(frame);
        const observer = new MutationObserver(() => {
            if (!reportWhenReady()) return;
            observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [location.pathname]);

    return null;
}
