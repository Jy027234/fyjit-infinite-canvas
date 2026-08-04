import { Button } from "antd";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { FYJIT_HOME_URL } from "@/constant/runtime-config";

export function RouteErrorPage() {
    const error = useRouteError();
    const description = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText || "页面不可用"}`
        : error instanceof Error
          ? error.message
          : "创作页面加载失败";

    return (
        <main className="grid min-h-dvh place-items-center bg-stone-50 px-6 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">FYJIT Creative</div>
                <h1 className="mt-3 text-xl font-semibold">创作页面暂时无法打开</h1>
                <p className="mt-3 break-words text-sm leading-6 text-stone-500 dark:text-stone-400">{description}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Button type="primary" onClick={() => window.location.reload()}>重新加载</Button>
                    <Button href={FYJIT_HOME_URL}>返回 FYJIT</Button>
                </div>
            </section>
        </main>
    );
}
