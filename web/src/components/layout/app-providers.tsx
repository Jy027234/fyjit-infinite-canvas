import type { ReactNode } from "react";
import { useEffect } from "react";
import { ProConfigProvider } from "@ant-design/pro-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import frFR from "antd/locale/fr_FR";
import jaJP from "antd/locale/ja_JP";
import ruRU from "antd/locale/ru_RU";
import viVN from "antd/locale/vi_VN";
import zhCN from "antd/locale/zh_CN";
import zhTW from "antd/locale/zh_TW";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import "dayjs/locale/fr";
import "dayjs/locale/ja";
import "dayjs/locale/ru";
import "dayjs/locale/vi";

import { syncAppLocale } from "@/i18n";

import { ClientRootInit } from "@/components/layout/client-root-init";
import { getAntThemeConfig } from "@/lib/app-theme";
import { useFyjitInterface } from "@/hooks/use-fyjit-interface";
import { useThemeStore } from "@/stores/use-theme-store";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

export function AppProviders({ children }: { children: ReactNode }) {
    const theme = useThemeStore((state) => state.theme);
    const syncMainTheme = useThemeStore((state) => state.syncMainTheme);
    const { language } = useFyjitInterface();
    const dark = theme === "dark";
    const antLocale = { en: enUS, zhCN, fr: frFR, ru: ruRU, ja: jaJP, vi: viVN, zhTW }[language];

    useEffect(() => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(theme);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    useEffect(() => {
        void syncAppLocale(language);
        document.documentElement.lang = { en: "en", zhCN: "zh-CN", zhTW: "zh-TW", fr: "fr", ru: "ru", ja: "ja", vi: "vi" }[language];
        dayjs.locale({ en: "en", zhCN: "zh-cn", zhTW: "zh-tw", fr: "fr", ru: "ru", ja: "ja", vi: "vi" }[language]);
    }, [language]);

    useEffect(() => {
        const sync = () => syncMainTheme();
        window.addEventListener("focus", sync);
        document.addEventListener("visibilitychange", sync);
        return () => {
            window.removeEventListener("focus", sync);
            document.removeEventListener("visibilitychange", sync);
        };
    }, [syncMainTheme]);

    return (
        <ConfigProvider locale={antLocale} theme={getAntThemeConfig(dark)}>
            <ProConfigProvider dark={dark}>
                <App>
                    <QueryClientProvider client={queryClient}>
                        <ClientRootInit>{children}</ClientRootInit>
                    </QueryClientProvider>
                </App>
            </ProConfigProvider>
        </ConfigProvider>
    );
}
