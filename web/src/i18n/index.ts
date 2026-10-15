import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resolveFyjitInterfaceLanguage } from "@/lib/fyjit-interface";

export type AppLocale = "zh-CN" | "en-US";

export function appLocaleForFyjitLanguage(language?: string): AppLocale {
    return language === "en" ? "en-US" : "zh-CN";
}

i18n.use(initReactI18next).init({
    resources: {},
    lng: appLocaleForFyjitLanguage(resolveFyjitInterfaceLanguage()),
    fallbackLng: "zh-CN",
    supportedLngs: ["zh-CN", "en-US"],
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
});

const localeLoaders = {
    "zh-CN": () => import("@/i18n/locales/zh-CN"),
    "en-US": () => import("@/i18n/locales/en-US"),
};
const localeRequests = new Map<AppLocale, Promise<void>>();
let localeChangeSequence = 0;

function loadLocale(locale: AppLocale) {
    let request = localeRequests.get(locale);
    if (!request) {
        request = localeLoaders[locale]().then(({ default: translation }) => {
            i18n.addResourceBundle(locale, "translation", translation);
        }).catch((error) => {
            localeRequests.delete(locale);
            throw error;
        });
        localeRequests.set(locale, request);
    }
    return request;
}

export async function syncAppLocale(language?: string) {
    const sequence = ++localeChangeSequence;
    const locale = appLocaleForFyjitLanguage(language);
    await Promise.all([loadLocale("zh-CN"), loadLocale(locale)]);
    if (sequence === localeChangeSequence) await i18n.changeLanguage(locale);
}

export const appI18nReady = syncAppLocale(resolveFyjitInterfaceLanguage());

export default i18n;
