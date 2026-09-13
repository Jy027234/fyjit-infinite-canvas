import { Avatar } from "antd";
import { Languages, LogOut, Moon, Sun, UserRound, Wallet } from "lucide-react";
import { type CSSProperties, type MouseEvent, useEffect, useId, useRef, useState } from "react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { FYJIT_INTERFACE_LANGUAGE_OPTIONS } from "@/lib/fyjit-interface";
import { resolveFyjitMainUrl } from "@/constant/runtime-config";
import { useFyjitInterface } from "@/hooks/use-fyjit-interface";
import { useFyjitSignOut } from "@/hooks/use-fyjit-sign-out";
import { useFyjitStore } from "@/stores/use-fyjit-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cn } from "@/lib/utils";

type CreativeAccountMenuProps = {
    beforeLeave?: (action: () => void | Promise<void>) => void;
    className?: string;
    showTheme?: boolean;
    triggerStyle?: CSSProperties;
    variant?: "header" | "compact";
};

export function CreativeAccountMenu({ beforeLeave, className, showTheme = false, triggerStyle, variant = "header" }: CreativeAccountMenuProps) {
    const panelId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const user = useFyjitStore((state) => state.bootstrap?.user);
    const setInterfaceLanguage = useFyjitStore((state) => state.setInterfaceLanguage);
    const { language, t } = useFyjitInterface();
    const { signingOut, confirmSignOut } = useFyjitSignOut();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);

    useEffect(() => {
        if (!open) return;

        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            triggerRef.current?.focus();
        };

        document.addEventListener("pointerdown", closeOnOutsidePointer);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    if (!user) return null;

    const compact = variant === "compact";
    const profileUrl = resolveFyjitMainUrl("/profile");
    const walletUrl = resolveFyjitMainUrl("/wallet");

    const handleAccountLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
        if (!beforeLeave) return;
        event.preventDefault();
        setOpen(false);
        beforeLeave(() => window.location.assign(href));
    };

    return (
        <div ref={rootRef} className={cn("contents", className)}>
            <button
                ref={triggerRef}
                type="button"
                className={
                    compact
                        ? "grid size-9 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10"
                        : "hidden appearance-none items-center gap-2 rounded-full border border-border bg-transparent py-1 pl-1 pr-2 font-[inherit] text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
                }
                style={triggerStyle}
                aria-label={t("userMenu")}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((current) => !current)}
            >
                <Avatar size={24} src={user.avatar_url}>
                    {user.display_name.slice(0, 1)}
                </Avatar>
                {compact ? null : <span className="max-w-28 truncate">{user.display_name}</span>}
            </button>
            {open ? (
                <div id={panelId} role="dialog" aria-label={t("userMenu")} className="absolute right-0 top-[calc(100%+0.5rem)] z-[70] w-60 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                    <div className="truncate px-3 pb-2 pt-1 text-xs text-muted-foreground">{user.display_name}</div>
                    <a href={profileUrl} onClick={(event) => handleAccountLink(event, profileUrl)} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted focus:bg-muted">
                        <UserRound className="size-4" />
                        <span>{t("profile")}</span>
                    </a>
                    <a href={walletUrl} onClick={(event) => handleAccountLink(event, walletUrl)} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted focus:bg-muted">
                        <Wallet className="size-4" />
                        <span>{t("wallet")}</span>
                    </a>
                    <label className="flex items-center gap-3 border-y border-border px-3 py-2 text-sm">
                        <Languages className="size-4" />
                        <span>{t("language")}</span>
                        <select aria-label={t("language")} className="ml-auto max-w-28 rounded-md border border-input bg-transparent px-2 py-1 text-xs" value={language} onChange={(event) => void setInterfaceLanguage(event.target.value)}>
                            {FYJIT_INTERFACE_LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.code} value={option.code}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {showTheme ? (
                        <AnimatedThemeToggler
                            theme={theme}
                            onThemeChange={setTheme}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus:bg-muted"
                            aria-label={theme === "dark" ? t("lightTheme") : t("darkTheme")}
                        >
                            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                            <span>{theme === "dark" ? t("lightTheme") : t("darkTheme")}</span>
                        </AnimatedThemeToggler>
                    ) : null}
                    <button
                        type="button"
                        disabled={signingOut}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            setOpen(false);
                            if (beforeLeave) beforeLeave(confirmSignOut);
                            else confirmSignOut();
                        }}
                    >
                        <LogOut className="size-4" />
                        <span>{signingOut ? t("loggingOut") : t("logout")}</span>
                    </button>
                </div>
            ) : null}
        </div>
    );
}
