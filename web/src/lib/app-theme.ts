import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";
import { fyjitAntThemeContract } from "@/lib/generated/fyjit-ant-theme";

const palettes = fyjitAntThemeContract.modes;
const { control, typography } = fyjitAntThemeContract;

function buildTheme(mode: keyof typeof palettes): ThemeConfig {
    const color = palettes[mode];
    const dark = mode === "dark";
    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorSuccess: color.success,
            colorWarning: color.warning,
            colorError: color.error,
            colorInfo: color.info,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextBase: color.text,
            colorText: color.text,
            colorTextSecondary: color.textSecondary,
            colorTextTertiary: color.textTertiary,
            colorTextQuaternary: color.textQuaternary,
            colorTextLightSolid: color.primaryText,
            colorBgBase: color.background,
            colorBgLayout: color.background,
            colorBgContainer: color.container,
            colorBgElevated: color.elevated,
            colorBorder: color.border,
            colorBorderSecondary: color.borderSecondary,
            colorFillSecondary: color.fillSecondary,
            controlOutline: color.outline,
            controlOutlineWidth: control.outlineWidth,
            controlHeight: control.height,
            controlHeightSM: control.heightSm,
            controlHeightLG: control.heightLg,
            controlHeightXS: control.heightXs,
            borderRadius: control.radius,
            borderRadiusSM: control.radiusSm,
            borderRadiusLG: control.radiusLg,
            fontFamily: fyjitAntThemeContract.fontSans,
            fontFamilyCode: fyjitAntThemeContract.fontMono,
            fontSize: typography.fontSize,
            fontSizeSM: typography.fontSizeSm,
            fontSizeLG: typography.fontSizeLg,
            lineHeight: typography.lineHeight,
            lineHeightSM: typography.lineHeight,
            lineHeightLG: typography.lineHeight,
            boxShadow: color.shadow,
            boxShadowSecondary: color.shadowSecondary,
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultShadow: "none",
                controlHeight: control.height,
                controlHeightSM: control.heightSm,
                controlHeightLG: control.heightLg,
            },
            Input: {
                hoverBorderColor: color.primary,
                activeBorderColor: color.primary,
                activeShadow: `0 0 0 ${control.outlineWidth}px ${color.outlineSoft}`,
                hoverBg: color.container,
                activeBg: color.container,
            },
            Menu: {
                itemHeight: 36,
                itemBorderRadius: 10,
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.text,
                darkItemHoverBg: palettes.dark.menuBg,
                darkItemSelectedBg: palettes.dark.menuBg,
                darkItemSelectedColor: palettes.dark.text,
            },
            Select: {
                optionHeight: 36,
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.text,
                selectorBg: color.container,
                activeBorderColor: color.primary,
                activeOutlineColor: color.outlineSoft,
            },
            Table: {
                headerBg: color.tableHeaderBg,
                headerColor: color.text,
                borderColor: color.borderSecondary,
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
            Modal: {
                headerBg: color.elevated,
                contentBg: color.elevated,
                footerBg: color.elevated,
                titleColor: color.text,
            },
        },
    };
}

const fyjitAntThemes = {
    light: buildTheme("light"),
    dark: buildTheme("dark"),
} satisfies Record<keyof typeof palettes, ThemeConfig>;

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    return fyjitAntThemes[dark ? "dark" : "light"];
}
