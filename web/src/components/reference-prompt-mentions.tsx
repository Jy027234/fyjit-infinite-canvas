import { AtSign } from "lucide-react";

import type { PromptReference } from "@/lib/image-reference-prompt";

type Props = {
    references: Array<PromptReference & { id: string }>;
    onInsert: (label: string) => void;
};

// 工作台使用普通 textarea 以保持输入行为；这里提供可点击的 @ 素材标签，
// 标签与按顺序上传的 reference_asset_ids 保持一一对应。阻止鼠标按下转移焦点，
// 让调用方能够读取 textarea 当前选区并把标签插入光标所在位置。
export function ReferencePromptMentions({ references, onInsert }: Props) {
    if (!references.length) return null;

    return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300" aria-label="可关联的参考素材">
            <span className="mr-1 inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                <AtSign className="size-3.5" />
                点击关联（插入光标处）
            </span>
            {references.map((reference) => (
                <button
                    key={reference.id}
                    type="button"
                    className="max-w-52 rounded-full border border-stone-300 bg-white px-2 py-1 text-left font-medium text-stone-700 transition hover:border-violet-500 hover:text-violet-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:border-violet-400 dark:hover:text-violet-300"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onInsert(reference.label)}
                    title={`插入 @${reference.label}${reference.title ? `（${reference.title}）` : ""}`}
                    aria-label={`插入 @${reference.label}${reference.title ? `，${reference.title}` : ""}`}
                >
                    <span className="inline-block max-w-44 truncate align-bottom">
                        @{reference.label}
                        {reference.title ? ` · ${reference.title}` : ""}
                    </span>
                </button>
            ))}
        </div>
    );
}
