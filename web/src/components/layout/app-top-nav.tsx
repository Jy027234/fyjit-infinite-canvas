import { Home, Menu } from "lucide-react";
import { Tooltip } from "antd";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { NavigationToolSlug } from "@/constant/navigation-tools";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { CreativeAccountMenu } from "@/components/layout/creative-account-menu";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { FYJIT_HOME_URL } from "@/constant/runtime-config";
import { cn } from "@/lib/utils";
import { useCreativeNavigationTools } from "@/hooks/use-creative-navigation-tools";
import { useFyjitInterface } from "@/hooks/use-fyjit-interface";

export function AppTopNav() {
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const { t } = useFyjitInterface();
    const tools = useCreativeNavigationTools();
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = tools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const logoUrl = `${import.meta.env.BASE_URL}logo.svg`;

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-border bg-background/90 backdrop-blur-xl">
                    <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-6">
                        <div className="flex min-w-0 items-center">
                            <Link aria-label={t("brandHome")} to="/" className="flex h-full min-w-6 shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-foreground transition hover:text-muted-foreground">
                                <span
                                    className="size-5 shrink-0 bg-current"
                                    style={{
                                        mask: `url(${logoUrl}) center / contain no-repeat`,
                                        WebkitMask: `url(${logoUrl}) center / contain no-repeat`,
                                    }}
                                />
                                <span className="hidden text-base font-medium sm:inline">{t("brand")}</span>
                            </Link>

                            <button
                                type="button"
                                className="relative z-10 ml-3 inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground md:hidden"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label={t("openNavigation")}
                                title={t("navigation")}
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-8 hidden h-14 min-w-0 items-center gap-7 overflow-x-auto md:flex">
                                {tools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            to={tool.href}
                                            className={cn(
                                                "relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                                                active ? "font-medium text-foreground after:bg-primary" : "text-muted-foreground after:bg-transparent hover:text-foreground",
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            <span className="truncate">{tool.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="relative my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            <Tooltip title={t("backToFyjit")}>
                                <a href={FYJIT_HOME_URL} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={t("backToFyjit")}>
                                    <Home className="size-4" />
                                </a>
                            </Tooltip>
                            <CreativeAccountMenu />
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} tools={tools} onClose={() => setMobileNavOpen(false)} />
        </>
    );
}
