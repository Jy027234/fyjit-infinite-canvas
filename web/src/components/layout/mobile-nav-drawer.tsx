import { Avatar, Drawer } from "antd";
import { LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useFyjitSignOut } from "@/hooks/use-fyjit-sign-out";
import { useFyjitStore } from "@/stores/use-fyjit-store";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    tools?: ReadonlyArray<{ slug: NavigationToolSlug; label: string; icon: (typeof navigationTools)[number]["icon"] }>;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, tools = navigationTools, onClose }: MobileNavDrawerProps) {
    const user = useFyjitStore((state) => state.bootstrap?.user);
    const { signingOut, signOut } = useFyjitSignOut();
    return (
        <Drawer title="导航" placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="flex h-full flex-col">
                <div className="flex-1 space-y-1">
                {tools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                active ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
                </div>
                {user ? (
                    <div className="mt-6 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <div className="flex items-center gap-3 px-3 pb-3 text-sm">
                            <Avatar size={32} src={user.avatar_url}>{user.display_name.slice(0, 1)}</Avatar>
                            <span className="min-w-0 flex-1 truncate">{user.display_name}</span>
                        </div>
                        <button type="button" disabled={signingOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30" onClick={() => void signOut()}>
                            <LogOut className="size-5" />
                            <span>{signingOut ? "正在退出…" : "退出登录"}</span>
                        </button>
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}
