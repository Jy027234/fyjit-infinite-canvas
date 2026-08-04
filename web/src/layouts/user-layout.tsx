import type { ReactNode } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";

export default function UserLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <a
                href="#creative-main"
                className="sr-only fixed left-3 top-3 z-[10000] rounded-md bg-stone-950 px-3 py-2 text-sm font-medium text-white focus:not-sr-only dark:bg-stone-100 dark:text-stone-950"
            >
                跳到主要内容
            </a>
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div id="creative-main" tabIndex={-1} className="min-h-0 flex-1 overflow-hidden">
                    {children}
                </div>
            </div>
            <AgentPanel />
        </div>
    );
}
