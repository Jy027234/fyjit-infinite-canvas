// 统计分析加载器：默认关闭，可同时启用多家。
// 仅支持 GA4 与百度：两者都只接受 ID，脚本地址由代码固定拼接——
// 不接受任意脚本 URL / 内联 JS，避免「配置项被用来在访客浏览器执行任意代码」。
// 全空时不注入任何脚本、不发任何外部请求。这是开源项目的硬要求：
// fork/自托管者默认零统计，官方站点仅通过环境变量注入自己的 ID（ID 不入库）。

import { ANALYTICS_BAIDU_ID, ANALYTICS_GA4_ID } from "@/constant/runtime-config";
import { APP_VERSION } from "@/constant/env";

type GtagFn = (...args: unknown[]) => void;

declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: GtagFn;
        _hmt?: unknown[][];
    }
}

export type CreativeMetricName = "LCP" | "INP" | "CLS" | "workbench_ready" | "job_accepted";
export type CreativeMetricRating = "good" | "needs-improvement" | "poor";
export type CreativeMetricDetail = {
    name: CreativeMetricName;
    value: number;
    route: string;
    device: "mobile" | "desktop";
    version: string;
    rating?: CreativeMetricRating;
};

const SAFE_ROUTE_NAME = /^creative\.(?:image|video|assets|prompts|canvas|canvas_project|not_found)$/;
let vitalsInitialized = false;

let initialized = false;
// 记录实际启用了哪些统计，供路由上报时按需分发。
const active = { ga4: false, baidu: false };

function appendScript(src: string, attrs: Record<string, string> = {}) {
    const el = document.createElement("script");
    el.async = true;
    el.src = src;
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    document.head.appendChild(el);
    return el;
}

function initGa4(id: string) {
    window.dataLayer = window.dataLayer || [];
    const gtag: GtagFn = (...args) => {
        window.dataLayer!.push(args);
    };
    window.gtag = gtag;
    appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
    gtag("js", new Date());
    // SPA 路由上报交给 trackPageview，这里关闭默认的自动 page_view，避免重复。
    gtag("config", id, { send_page_view: false });
    active.ga4 = true;
}

function initBaidu(id: string) {
    window._hmt = window._hmt || [];
    appendScript(`https://hm.baidu.com/hm.js?${encodeURIComponent(id)}`);
    active.baidu = true;
}

export function initAnalytics() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    // 各家相互独立，逐个判断并启用；任一家出错都不影响其它家与主应用。
    if (ANALYTICS_GA4_ID) {
        try {
            initGa4(ANALYTICS_GA4_ID);
        } catch {
            /* 忽略 */
        }
    }
    if (ANALYTICS_BAIDU_ID) {
        try {
            initBaidu(ANALYTICS_BAIDU_ID);
        } catch {
            /* 忽略 */
        }
    }
}

// SPA 路由切换时上报页面浏览，分发给所有已启用的统计。
export function trackPageview(path: string, routeName?: string, pageTitle?: string) {
    const pagePath = safePagePath(path);
    const normalizedRoute = safeRouteName(routeName);
    try {
        if (active.ga4 && window.gtag) {
            window.gtag("event", "page_view", {
                page_path: pagePath,
                page_location: new URL(window.location.pathname, window.location.origin).toString(),
                page_title: pageTitle || document.title,
                route_name: normalizedRoute,
            });
        }
        if (active.baidu && window._hmt) {
            window._hmt.push(["_trackPageview", pagePath]);
        }
    } catch {
        /* 忽略 */
    }
}

export function trackCreativeMetric(name: CreativeMetricName, value: number, routeName?: string, rating?: CreativeMetricRating) {
    if (!Number.isFinite(value) || value < 0) return;
    const detail: CreativeMetricDetail = {
        name,
        value: Math.round(value * 1000) / 1000,
        route: safeRouteName(routeName),
        device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
        version: APP_VERSION,
        ...(rating ? { rating } : {}),
    };

    // 只分发经过白名单收敛的维度；禁止提示词、素材地址、账号与 Token 进入统计载荷。
    window.dispatchEvent(new CustomEvent<CreativeMetricDetail>("fyjit:performance-metric", { detail }));
    try {
        if (active.ga4 && window.gtag) {
            window.gtag("event", "creative_performance", {
                metric_name: detail.name,
                value: detail.value,
                route_name: detail.route,
                device_type: detail.device,
                app_version: detail.version,
                metric_rating: detail.rating,
            });
        }
        if (active.baidu && window._hmt) {
            window._hmt.push(["_trackEvent", "creative_performance", detail.name, `${detail.route}|${detail.device}|${detail.version}`, Math.round(detail.value)]);
        }
    } catch {
        /* 忽略 */
    }
}

export function startCreativeMetric(name: Extract<CreativeMetricName, "job_accepted">, routeName?: string) {
    const startedAt = performance.now();
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        trackCreativeMetric(name, performance.now() - startedAt, routeName);
    };
}

export function initWebVitals(routeName: string) {
    if (vitalsInitialized || typeof window === "undefined") return;
    vitalsInitialized = true;
    const initialRoute = safeRouteName(routeName);
    void import("web-vitals")
        .then(({ onCLS, onINP, onLCP }) => {
            const report = (metric: { name: "CLS" | "INP" | "LCP"; value: number; rating: CreativeMetricRating }) => trackCreativeMetric(metric.name, metric.value, initialRoute, metric.rating);
            onCLS(report);
            onINP(report);
            onLCP(report);
        })
        .catch(() => undefined);
}

function safeRouteName(routeName?: string) {
    return routeName && SAFE_ROUTE_NAME.test(routeName) ? routeName : "creative.not_found";
}

function safePagePath(path: string) {
    try {
        const parsed = new URL(path, window.location.origin);
        return parsed.origin === window.location.origin ? parsed.pathname : "/";
    } catch {
        return "/";
    }
}
