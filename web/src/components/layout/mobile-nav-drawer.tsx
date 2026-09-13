import { Avatar, Drawer } from "antd";
import { LogOut, UserRound, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useFyjitSignOut } from "@/hooks/use-fyjit-sign-out";
import { useFyjitStore } from "@/stores/use-fyjit-store";
import { FYJIT_INTERFACE_LANGUAGE_OPTIONS } from "@/lib/fyjit-interface";
import { useFyjitInterface } from "@/hooks/use-fyjit-interface";
import { resolveFyjitMainUrl } from "@/constant/runtime-config";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    tools?: ReadonlyArray<{ slug: NavigationToolSlug; href: string; label: string; icon: (typeof navigationTools)[number]["icon"] }>;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, tools = navigationTools, onClose }: MobileNavDrawerProps) {
    const user = useFyjitStore((state) => state.bootstrap?.user);
    const setInterfaceLanguage = useFyjitStore((state) => state.setInterfaceLanguage);
    const { language, t } = useFyjitInterface();
    const { signingOut, confirmSignOut } = useFyjitSignOut();
    return (
        <Drawer title={t("navigation")} placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="flex h-full flex-col">
                <div className="flex-1 space-y-1">
                    {tools.map((tool) => {
                        const Icon = tool.icon;
                        const active = tool.slug === activeToolSlug;
                        return (
                            <Link
                                key={tool.slug}
                                to={tool.href}
                                onClick={onClose}
                                className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-base transition", active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                            >
                                <Icon className="size-5" />
                                <span>{tool.label}</span>
                            </Link>
                        );
                    })}
                </div>
                {user ? (
                    <div className="mt-6 border-t border-border pt-4">
                        <div className="flex items-center gap-3 px-3 pb-3 text-sm">
                            <Avatar size={32} src={user.avatar_url}>
                                {user.display_name.slice(0, 1)}
                            </Avatar>
                            <span className="min-w-0 flex-1 truncate">{user.display_name}</span>
                        </div>
                        <a href={resolveFyjitMainUrl("/profile")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition hover:bg-muted" onClick={onClose}>
                            <UserRound className="size-5" />
                            <span>{t("profile")}</span>
                        </a>
                        <a href={resolveFyjitMainUrl("/wallet")} className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition hover:bg-muted" onClick={onClose}>
                            <Wallet className="size-5" />
                            <span>{t("wallet")}</span>
                        </a>
                        <label className="mb-2 flex items-center gap-3 px-3 text-sm">
                            <span>{t("language")}</span>
                            <select aria-label={t("language")} className="ml-auto rounded-md border border-input bg-transparent px-2 py-1.5" value={language} onChange={(event) => void setInterfaceLanguage(event.target.value)}>
                                {FYJIT_INTERFACE_LANGUAGE_OPTIONS.map((option) => (
                                    <option key={option.code} value={option.code}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            disabled={signingOut}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                            onClick={() => {
                                onClose();
                                confirmSignOut();
                            }}
                        >
                            <LogOut className="size-5" />
                            <span>{signingOut ? t("loggingOut") : t("logout")}</span>
                        </button>
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}
