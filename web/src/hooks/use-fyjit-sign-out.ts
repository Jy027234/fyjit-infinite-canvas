import { App } from "antd";
import { useState } from "react";

import { clearCreativeBrowserSession } from "@/services/browser-session";
import { clearCreativeDraftsForUser } from "@/services/creative-draft-storage";
import { useFyjitStore } from "@/stores/use-fyjit-store";
import { useFyjitInterface } from "@/hooks/use-fyjit-interface";

export function useFyjitSignOut() {
    const { message, modal } = App.useApp();
    const { t } = useFyjitInterface();
    const [signingOut, setSigningOut] = useState(false);

    const signOut = async () => {
        setSigningOut(true);
        let currentUserId: string | undefined;
        try {
            currentUserId = window.localStorage.getItem("uid")?.trim() || undefined;
        } catch {
            // Storage can be unavailable; logout still proceeds.
        }
        currentUserId ||= String(useFyjitStore.getState().bootstrap?.user.id || "") || undefined;
        try {
            const response = await fetch("/api/user/logout", { credentials: "include" });
            if (!response.ok) throw new Error("退出登录失败，请稍后重试");
            await clearCreativeDraftsForUser(currentUserId);
            await clearCreativeBrowserSession();
            const login = new URL("/sign-in", window.location.origin);
            login.searchParams.set("redirect", `${import.meta.env.BASE_URL}image`);
            window.location.replace(login.toString());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "退出登录失败，请稍后重试");
            setSigningOut(false);
        }
    };

    const confirmSignOut = () => {
        modal.confirm({
            title: t("signOutConfirmTitle"),
            content: t("signOutConfirmDescription"),
            okText: t("logout"),
            okButtonProps: { danger: true },
            cancelText: t("cancel"),
            onOk: signOut,
        });
    };

    return { signingOut, signOut, confirmSignOut };
}
