import { create } from "zustand";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
    syncMainTheme: () => void;
};

function readMainTheme(): ThemeName {
    const value =
        typeof document === "undefined"
            ? ""
            : document.cookie
                  .split(";")
                  .map((item) => item.trim())
                  .find((item) => item.startsWith("vite-ui-theme="))
                  ?.split("=")[1];
    if (value === "light" || value === "dark") return value;
    if (value === "system" && typeof window !== "undefined") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return "dark";
}

function writeMainTheme(theme: ThemeName) {
    document.cookie = `vite-ui-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: readMainTheme(),
    setTheme: (theme) => {
        writeMainTheme(theme);
        set({ theme });
    },
    syncMainTheme: () => set({ theme: readMainTheme() }),
}));
