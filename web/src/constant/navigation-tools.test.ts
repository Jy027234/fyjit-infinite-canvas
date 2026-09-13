import { describe, expect, test } from "bun:test";

import { creativeLocalHref } from "@/constant/navigation-tools";

describe("creativeLocalHref", () => {
    test("normalizes server routes to basename-local routes", () => {
        expect(creativeLocalHref("/creative/image", "image")).toBe("/image");
        expect(creativeLocalHref("/studio/video?from=home", "video")).toBe("/video");
    });

    test("falls back when the server route is absent or unsupported", () => {
        expect(creativeLocalHref(undefined, "assets")).toBe("/assets");
        expect(creativeLocalHref("/creative/unknown", "prompts")).toBe("/prompts");
        expect(creativeLocalHref("https://[invalid", "canvas")).toBe("/canvas");
    });
});
