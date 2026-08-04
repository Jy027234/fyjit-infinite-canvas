import type { ReactNode } from "react";
import { useEffect } from "react";

import { FYJIT_HOME_URL } from "@/constant/runtime-config";
import { restoreCreativeIntent } from "@/services/creative-intent";
import { migrateLegacyBrowserAssets } from "@/services/legacy-asset-migration";
import { useCreativeIntentStore } from "@/stores/use-creative-intent-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useFyjitStore } from "@/stores/use-fyjit-store";

let initialization: Promise<void> | undefined;

function currentFeatureKey() {
    const path = window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), "") || "/";
    if (path === "/" || path.startsWith("/image")) return "image-workbench";
    if (path.startsWith("/video")) return "video-workbench";
    if (path.startsWith("/assets")) return "creative-assets";
    if (path.startsWith("/prompts")) return "creative-prompts";
    if (path.startsWith("/canvas")) return "infinite-canvas";
    return undefined;
}

async function initializeCreativeApp() {
    try {
        window.localStorage.removeItem("infinite-canvas:ai_config_store");
    } catch {
        // Storage can be unavailable in hardened or private browsing contexts.
    }
    await useFyjitStore.getState().loadBootstrap();
    if (useFyjitStore.getState().bootstrapStatus !== "ready") return;
    useConfigStore.getState().syncFyjitModels(useFyjitStore.getState().models);
    const userId = useFyjitStore.getState().bootstrap?.user.id;
    if (userId) void migrateLegacyBrowserAssets(userId).catch(() => undefined);
    try {
        const [intent] = await Promise.all([restoreCreativeIntent(), useCanvasStore.getState().loadServerProjects().catch(() => undefined)]);
        if (intent) useCreativeIntentStore.getState().setActiveIntent(intent);
    } catch {
        // Expired and already-consumed intents must not prevent the workbench from opening.
    }
}

function signInUrl() {
    const home = new URL(FYJIT_HOME_URL, window.location.origin);
    const login = new URL("/sign-in", home.origin);
    login.searchParams.set("redirect", `${window.location.pathname}${window.location.search}`);
    return login.toString();
}

export function ClientRootInit({ children }: { children: ReactNode }) {
    const status = useFyjitStore((state) => state.bootstrapStatus);
    const error = useFyjitStore((state) => state.bootstrapError);
    const errorStatus = useFyjitStore((state) => state.bootstrapErrorStatus);
    const errorCode = useFyjitStore((state) => state.bootstrapErrorCode);
    const features = useFyjitStore((state) => state.bootstrap?.features);

    useEffect(() => {
        initialization ??= initializeCreativeApp();
        void initialization;
    }, []);

    useEffect(() => {
        if (status === "error" && errorStatus === 401) window.location.replace(signInUrl());
    }, [errorStatus, status]);

    if (status === "idle" || status === "loading" || (status === "error" && errorStatus === 401)) {
        return <StatusPage title="正在连接 FYJIT" description="正在校验登录状态并加载创作能力…" />;
    }

    if (status === "error") {
        const failure = creativeBootstrapFailure(errorStatus, errorCode, error);
        return <StatusPage {...failure} />;
    }

    const featureKey = currentFeatureKey();
    if (featureKey && features?.[featureKey] === false) {
        return <StatusPage title="该创作模块尚未启用" description="管理员尚未为当前账号开放此模块。你可以返回 FYJIT 使用其他可用能力。" />;
    }

    return <>{children}</>;
}

type StatusPageProps = {
    title: string;
    description: string;
    actionHref?: string;
    actionLabel?: string;
    retry?: boolean;
};

function creativeBootstrapFailure(status?: number, code?: string, message?: string): StatusPageProps {
    if (status === 402 || code === "insufficient_quota" || code === "quota_exhausted") {
        return { title: "FYJIT 余额不足", description: message || "当前账号余额不足，充值后即可继续使用创作中心。", actionHref: "/console/topup", actionLabel: "前往充值" };
    }
    if (status === 403 || code === "account_disabled" || code === "user_disabled" || code === "creative_disabled") {
        return { title: "账号或创作权限不可用", description: message || "当前账号已被停用，或管理员尚未开放创作中心。", actionLabel: "返回 FYJIT" };
    }
    if (status === 429 || code === "rate_limited") {
        return { title: "请求过于频繁", description: message || "FYJIT 正在保护当前账号和服务，请稍后重试。", retry: true };
    }
    if (status && status >= 500) {
        return { title: "创作服务暂不可用", description: message || "FYJIT Creative API 暂时不可用，请稍后重试。", retry: true };
    }
    return { title: "创作中心暂不可用", description: message || "Creative API 初始化失败，请稍后重试。", retry: true };
}

function StatusPage({ title, description, actionHref = FYJIT_HOME_URL, actionLabel = "返回 FYJIT", retry = false }: StatusPageProps) {
    return (
        <main className="grid min-h-screen place-items-center bg-stone-50 px-6 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
                <h1 className="text-xl font-semibold">{title}</h1>
                <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">{description}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {retry ? <button type="button" className="inline-flex rounded-lg bg-stone-950 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-950" onClick={() => window.location.reload()}>重新连接</button> : null}
                    <a className="inline-flex rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium dark:border-stone-700" href={actionHref}>{actionLabel}</a>
                </div>
            </section>
        </main>
    );
}
