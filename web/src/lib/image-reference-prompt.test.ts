import { describe, expect, test } from "bun:test";

import { appendReferenceMention, buildReferencePromptText, insertReferenceMention } from "@/lib/image-reference-prompt";

describe("reference prompt labels", () => {
    test("keeps the uploaded reference order while translating user-facing @ labels", () => {
        expect(
            buildReferencePromptText("让 @图片2 的衣服出现在 @图片1 的人物身上", [
                { label: "图片1", title: "人物" },
                { label: "图片2", title: "服装" },
            ]),
        ).toBe("已按以下顺序提供参考素材：图片1、图片2。请将提示词中的素材编号对应到同序素材。\n\n让 图片2 的衣服出现在 图片1 的人物身上");
    });

    test("appends a clickable mention without losing the existing prompt", () => {
        expect(appendReferenceMention("复古棚拍", "图片1")).toBe("复古棚拍 @图片1");
        expect(appendReferenceMention("", "图片1")).toBe("@图片1");
    });

    test("inserts a clickable mention at the current selection", () => {
        expect(insertReferenceMention("把头发改成红色", "图片1", 1, 3)).toEqual({ text: "把 @图片1 改成红色", caret: 7 });
        expect(insertReferenceMention("让的头发变成蓝色", "图片1", 1, 1)).toEqual({ text: "让 @图片1 的头发变成蓝色", caret: 7 });
    });
});
