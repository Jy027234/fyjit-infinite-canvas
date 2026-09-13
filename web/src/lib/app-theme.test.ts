import { describe, expect, test } from "bun:test";
import { theme as antdTheme } from "antd";

import { getAntThemeConfig } from "./app-theme";

describe("FYJIT Ant Design theme", () => {
    test("uses stable parseable color seeds and shared control geometry", () => {
        for (const dark of [false, true]) {
            const config = getAntThemeConfig(dark);
            const serialized = JSON.stringify(config.token);
            expect(serialized).not.toContain("var(");
            expect(serialized).not.toContain("oklch(");
            expect(serialized).not.toContain("color-mix(");
            expect(config.token?.borderRadius).toBe(10);
            expect(config.token?.controlHeight).toBe(32);

            const derived = antdTheme.getDesignToken(config);
            expect(derived.colorPrimary).not.toBe("#000000");
            expect(derived.colorPrimaryHover).not.toBe("#000000");
            expect(derived.colorSuccess).not.toBe("#000000");
            expect(derived.colorError).not.toBe("#000000");
        }
    });

    test("returns cached light and dark provider objects with distinct css variable scopes", () => {
        expect(getAntThemeConfig(false)).toBe(getAntThemeConfig(false));
        expect(getAntThemeConfig(true)).toBe(getAntThemeConfig(true));
        expect(getAntThemeConfig(false)).not.toBe(getAntThemeConfig(true));
        expect(getAntThemeConfig(false).cssVar).toEqual({ key: "infinite-canvas-light" });
        expect(getAntThemeConfig(true).cssVar).toEqual({ key: "infinite-canvas-dark" });
    });
});
