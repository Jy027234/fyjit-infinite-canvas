import type { ReferenceImage } from "@/types/image";

export type PromptReference = {
    label: string;
    title?: string;
};

export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}

export function buildImageReferencePromptText(prompt: string, references: ReferenceImage[]) {
    return buildReferencePromptText(
        prompt,
        references.map((reference, index) => ({ label: imageReferenceLabel(index), title: reference.name })),
    );
}

// FYJIT 请求按 reference_asset_ids 的顺序携带素材。编辑器中的 @图片N 是面向用户的关联标记，
// 上游接收时转换成相同的编号文本，并附加顺序说明，避免把 @ 当成模型语法依赖。
export function buildReferencePromptText(prompt: string, references: PromptReference[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    const orderedReferences = references.map((reference) => ({ ...reference, label: reference.label.trim() })).filter((reference) => reference.label);
    if (!orderedReferences.length) return text;
    const linkedPrompt = orderedReferences.reduce((current, reference) => current.replaceAll(`@${reference.label}`, reference.label), text);
    const summary = orderedReferences.map((reference) => reference.label).join("、");
    return `已按以下顺序提供参考素材：${summary}。请将提示词中的素材编号对应到同序素材。\n\n${linkedPrompt}`;
}

export function appendReferenceMention(prompt: string, label: string) {
    const current = prompt.trimEnd();
    return current ? `${current} @${label}` : `@${label}`;
}
