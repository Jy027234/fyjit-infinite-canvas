import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";

import { fetchCreativePrompts, type CreativePrompt } from "@/services/api/creative";

const PAGE_SIZE = 12;

export function PromptSelectDialog({ open, onOpenChange, onSelect, onSelectNegativePrompt }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void; onSelectNegativePrompt?: (prompt: string) => void }) {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState("");
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<CreativePrompt[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<CreativePrompt>();
    const [values, setValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            void fetchCreativePrompts({ page, pageSize: PAGE_SIZE, search: keyword.trim() || undefined, category: category || undefined, signal: controller.signal })
                .then((result) => { setItems(result.items || []); setTotal(result.total || 0); })
                .catch((error) => { if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "获取提示词失败"); })
                .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        }, 250);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [category, keyword, message, open, page]);

    const choose = (prompt: CreativePrompt) => {
        if (!prompt.variables?.length) {
            onSelect(prompt.content);
            onSelectNegativePrompt?.(prompt.negative_prompt || "");
            onOpenChange(false);
            return;
        }
        setSelected(prompt);
        setValues(Object.fromEntries(prompt.variables.map((variable) => [variable.name, variable.default || ""])));
    };

    const rendered = useMemo(() => (selected?.content || "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name: string) => values[name]?.trim() || `{{${name}}}`), [selected, values]);

    return <>
        <Modal title="FYJIT 提示词库" open={open} onCancel={() => onOpenChange(false)} footer={null} width={1040} centered>
            <div className="flex flex-col gap-4" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Input size="large" prefix={<Search className="size-4 text-stone-400" />} value={keyword} onChange={(event) => { setPage(1); setKeyword(event.target.value); }} placeholder="搜索标题或正文" />
                    <div className="flex shrink-0 flex-wrap gap-1.5">{[
                        ["", "全部"], ["general", "通用"], ["image", "图片"], ["video", "视频"], ["character", "角色"], ["film", "影视"],
                    ].map(([value, label]) => <Tag.CheckableTag key={value} checked={category === value} onChange={() => { setPage(1); setCategory(value); }}>{label}</Tag.CheckableTag>)}</div>
                </div>
                <div className="thin-scrollbar max-h-[520px] overflow-y-auto pr-2">
                    {loading ? <div className="grid h-40 place-items-center"><Spin /></div> : items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((prompt) => <Card key={prompt.prompt_id} size="small" hoverable onClick={() => choose(prompt)} className="cursor-pointer"><div className="flex items-start justify-between gap-2"><strong className="line-clamp-1 text-sm">{prompt.title}</strong><Tag className="m-0">v{prompt.version}</Tag></div><p className="mt-3 line-clamp-4 min-h-20 whitespace-pre-wrap text-xs leading-5 text-stone-600 dark:text-stone-400">{prompt.content}</p><Button className="mt-3" size="small" type="primary" icon={<Check className="size-3.5" />}>使用</Button></Card>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-12" />}
                </div>
                {total > PAGE_SIZE ? <div className="flex justify-center"><Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} /></div> : null}
            </div>
        </Modal>
        <Modal title={`填写变量 · ${selected?.title || ""}`} open={Boolean(selected)} onCancel={() => setSelected(undefined)} onOk={() => { if (!selected) return; onSelect(rendered); onSelectNegativePrompt?.(selected.negative_prompt || ""); setSelected(undefined); onOpenChange(false); }} okText="使用最终提示词" cancelText="取消" width={680}>
            <div className="grid gap-3 sm:grid-cols-2">{selected?.variables.map((variable) => <label key={variable.name} className="text-sm"><span className="mb-1 block text-stone-500">{variable.label || variable.name}{variable.required ? " *" : ""}</span><Input value={values[variable.name] || ""} onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))} /></label>)}</div>
            <pre className="mt-5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-4 text-sm leading-6 dark:bg-stone-900">{rendered}</pre>
        </Modal>
    </>;
}
