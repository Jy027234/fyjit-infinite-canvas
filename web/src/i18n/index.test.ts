import { afterEach, expect, test } from "bun:test";

import i18n, { appI18nReady, syncAppLocale } from ".";

afterEach(async () => {
    await syncAppLocale("zhCN");
});

test("initial translations are ready before the application mounts", async () => {
    await appI18nReady;
    expect(i18n.hasResourceBundle("zh-CN", "translation")).toBe(true);
    expect(i18n.t("agent.state.ready")).not.toBe("agent.state.ready");
});

test("shared language switches load resources and other FYJ languages use Chinese content", async () => {
    await appI18nReady;
    await syncAppLocale("en");
    expect(i18n.t("agent.state.ready")).toBe("Ready");
    await syncAppLocale("fr");
    expect(i18n.t("agent.state.ready")).toBe("就绪");
});

test("a previous language request cannot override the latest shared preference", async () => {
    await appI18nReady;
    await Promise.all([syncAppLocale("en"), syncAppLocale("ja")]);
    expect(i18n.resolvedLanguage).toBe("zh-CN");
});
