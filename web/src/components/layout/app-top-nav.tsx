import { Home, LogOut, Menu } from "lucide-react";
import { Avatar, Dropdown, Tooltip } from "antd";
import { Link, useLocation } from "react-router-dom";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { FYJIT_HOME_URL } from "@/constant/runtime-config";
import { cn } from "@/lib/utils";
import { useFyjitSignOut } from "@/hooks/use-fyjit-sign-out";
import { useState } from "react";
import { useFyjitStore } from "@/stores/use-fyjit-store";

export function AppTopNav() {
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const { signingOut, signOut } = useFyjitSignOut();
    const user = useFyjitStore((state) => state.bootstrap?.user);
    const serverNavigation = useFyjitStore((state) => state.bootstrap?.navigation);
    const tools = navigationTools
        .map((tool) => {
            const key = tool.slug === "image" ? "image-workbench" : tool.slug === "video" ? "video-workbench" : tool.slug === "assets" ? "creative-assets" : tool.slug === "prompts" ? "creative-prompts" : "infinite-canvas";
            const serverItem = serverNavigation?.find((item) => item.key === key);
            return { ...tool, label: serverItem?.label || tool.label, enabled: serverItem?.enabled ?? true };
        })
        .filter((tool) => tool.enabled);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = tools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const logoUrl = `${import.meta.env.BASE_URL}logo.svg`;

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800">
                    <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-6">
                        <div className="flex min-w-0 items-center">
                            <Link to="/" className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300">
                                <span
                                    className="size-5 shrink-0 bg-current"
                                    style={{
                                        mask: `url(${logoUrl}) center / contain no-repeat`,
                                        WebkitMask: `url(${logoUrl}) center / contain no-repeat`,
                                    }}
                                />
                                <span className="text-base font-medium">FYJIT 创作中心</span>
                            </Link>

                            <button
                                type="button"
                                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label="打开导航菜单"
                                title="导航菜单"
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
                                            to={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                                                active
                                                    ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100"
                                                    : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            <span className="truncate">{tool.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            <Tooltip title="返回 FYJIT">
                                <a href={FYJIT_HOME_URL} className="inline-flex size-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 dark:hover:bg-stone-800 dark:hover:text-stone-100" aria-label="返回 FYJIT">
                                    <Home className="size-4" />
                                </a>
                            </Tooltip>
                            {user ? (
                                <Dropdown
                                    placement="bottomRight"
                                    menu={{
                                        items: [
                                            {
                                                key: "logout",
                                                danger: true,
                                                disabled: signingOut,
                                                icon: <LogOut className="size-4" />,
                                                label: signingOut ? "正在退出…" : "退出登录",
                                                onClick: () => void signOut(),
                                            },
                                        ],
                                    }}
                                >
                                    <button type="button" className="hidden appearance-none items-center gap-2 rounded-full border border-stone-200 bg-transparent py-1 pl-1 pr-2 font-[inherit] text-xs text-stone-600 sm:flex dark:border-stone-800 dark:text-stone-300" aria-label="用户菜单">
                                        <Avatar size={24} src={user.avatar_url}>{user.display_name.slice(0, 1)}</Avatar>
                                        <span className="max-w-28 truncate">{user.display_name}</span>
                                    </button>
                                </Dropdown>
                            ) : null}
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} tools={tools} onClose={() => setMobileNavOpen(false)} />
        </>
    );
}
