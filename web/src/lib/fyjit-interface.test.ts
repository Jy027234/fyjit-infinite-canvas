import { describe, expect, it } from "bun:test";

import { creativeNavigationLabel, normalizeFyjitInterfaceLanguage, translateFyjitInterface } from "@/lib/fyjit-interface";

describe("FYJIT interface language", () => {
    it("normalizes main-site Chinese language aliases", () => {
        expect(normalizeFyjitInterfaceLanguage("zh-CN")).toBe("zhCN");
        expect(normalizeFyjitInterfaceLanguage("zh-Hant")).toBe("zhTW");
        expect(normalizeFyjitInterfaceLanguage("ja")).toBe("ja");
        expect(normalizeFyjitInterfaceLanguage("unsupported")).toBe("zhCN");
    });

    it("translates shell and server navigation labels", () => {
        expect(translateFyjitInterface("en", "logout")).toBe("Sign out");
        expect(creativeNavigationLabel("ja", "image-workbench", "生图工作台")).toBe("画像ワークベンチ");
        expect(creativeNavigationLabel("en", "custom", "Custom")).toBe("Custom");
    });
});
