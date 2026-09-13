import { describe, expect, test } from "bun:test";

import { resolveFyjitMainUrl } from "@/constant/runtime-config";

describe("resolveFyjitMainUrl", () => {
    test("keeps account routes on the configured FYJIT origin", () => {
        expect(resolveFyjitMainUrl("/profile", "https://fyjit.example/home", "https://creative.example")).toBe("https://fyjit.example/profile");
        expect(resolveFyjitMainUrl("wallet", "/", "https://app.example")).toBe("https://app.example/wallet");
    });

    test("falls back to a safe root-relative path for invalid configuration", () => {
        expect(resolveFyjitMainUrl("/profile", "https://[invalid", "https://app.example")).toBe("/profile");
    });
});
