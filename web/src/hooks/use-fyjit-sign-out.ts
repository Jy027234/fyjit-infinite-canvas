import { App } from "antd";
import { useState } from "react";

import { clearCreativeBrowserSession } from "@/services/browser-session";

export function useFyjitSignOut() {
    const { message } = App.useApp();
    const [signingOut, setSigningOut] = useState(false);

    const signOut = async () => {
        setSigningOut(true);
        try {
            const response = await fetch("/api/user/logout", { credentials: "include" });
            if (!response.ok) throw new Error("退出登录失败，请稍后重试");
            await clearCreativeBrowserSession();
            const login = new URL("/sign-in", window.location.origin);
            login.searchParams.set("redirect", `${import.meta.env.BASE_URL}image`);
            window.location.replace(login.toString());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "退出登录失败，请稍后重试");
            setSigningOut(false);
        }
    };

    return { signingOut, signOut };
}
