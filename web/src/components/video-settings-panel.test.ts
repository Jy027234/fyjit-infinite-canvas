import { describe, expect, test } from "bun:test";

import { ratioPreview } from "@/components/video-settings-panel";

describe("video ratio previews", () => {
    test("keeps every server-provided ratio proportional", () => {
        expect(ratioPreview("4:5")).toEqual({ width: 4, height: 5 });
        expect(ratioPreview("5:4")).toEqual({ width: 5, height: 4 });
        expect(ratioPreview("9:21")).toEqual({ width: 9, height: 21 });
        expect(ratioPreview("21:9")).toEqual({ width: 21, height: 9 });
    });
});
