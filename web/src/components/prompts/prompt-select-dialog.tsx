import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Card, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";

import { useCreativePromptList } from "@/hooks/use-creative-prompt-list";
import type { CreativePrompt } from "@/services/api/creative";

const PAGE_SIZE = 12;

function renderPromptTemplate(template: string, values: Record<string, string>) {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name: string) => values[name]?.trim() || `{{${name}}}`);
}

export function PromptSelectDialog({ open, onOpenChange, onSelect, onSelectNegativePrompt }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void; onSelectNegativePrompt?: (prompt: string) => void }) {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");
    const [category, setCategory] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<CreativePrompt>();
    const [values, setValues] = useState<Record<string, string>>({});
    const [showVariableErrors, setShowVariableErrors] = useState(false);
    const wasOpenRef = useRef(open);
    const promptList = useCreativePromptList({ page, pageSize: PAGE_SIZE, search: debouncedKeyword, category, enabled: open });
    const queryTransitioning = promptList.isFetching && promptList.isPlaceholderData;

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    useEffect(() => {
        if (wasOpenRef.current && !open) void promptList.cancelCurrent();
        wasOpenRef.current = open;
    }, [open, promptList.cancelCurrent]);

    const choose = (prompt: CreativePrompt) => {
        if (!prompt.variables?.length) {
            onSelect(prompt.content);
            onSelectNegativePrompt?.(prompt.negative_prompt || "");
            onOpenChange(false);
            return;
        }
        setSelected(prompt);
        setShowVariableErrors(false);
        setValues(Object.fromEntries(prompt.variables.map((variable) => [variable.name, variable.default || ""])));
    };

    const missingRequiredVariables = useMemo(() => selected?.variables.filter((variable) => variable.required && !values[variable.name]?.trim()) || [], [selected, values]);
    const rendered = useMemo(() => renderPromptTemplate(selected?.content || "", values), [selected, values]);
    const renderedNegative = useMemo(() => renderPromptTemplate(selected?.negative_prompt || "", values), [selected, values]);

    return (
        <>
            <Modal title="FYJIT 提示词库" open={open} onCancel={() => onOpenChange(false)} footer={null} width={1040} centered>
                <div className="flex flex-col gap-4" data-canvas-no-zoom aria-busy={promptList.isFetching} onWheelCapture={(event) => event.stopPropagation()}>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Input
                            size="large"
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                            placeholder="搜索标题或正文"
                        />
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                            {[
                                ["", "全部"],
                                ["general", "通用"],
                                ["image", "图片"],
                                ["video", "视频"],
                                ["character", "角色"],
                                ["film", "影视"],
                            ].map(([value, label]) => (
                                <Tag.CheckableTag
                                    key={value}
                                    checked={category === value}
                                    onChange={() => {
                                        setPage(1);
                                        setCategory(value);
                                    }}
                                >
                                    {label}
                                </Tag.CheckableTag>
                            ))}
                        </div>
                    </div>
                    <div className="thin-scrollbar max-h-[520px] overflow-y-auto pr-2">
                        {promptList.error ? (
                            <Alert
                                className="mb-4"
                                type="error"
                                showIcon
                                message={promptList.error instanceof Error ? promptList.error.message : "获取提示词失败"}
                                action={
                                    <Button size="small" onClick={() => void promptList.refetch()} loading={promptList.isFetching}>
                                        重试
                                    </Button>
                                }
                            />
                        ) : null}
                        {promptList.isLoading ? (
                            <div className="grid h-40 place-items-center">
                                <Spin />
                            </div>
                        ) : promptList.items.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {promptList.items.map((prompt) => (
                                    <Card key={prompt.prompt_id} size="small" hoverable={!queryTransitioning} className={queryTransitioning ? "opacity-60" : undefined}>
                                        <button
                                            type="button"
                                            className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            disabled={queryTransitioning}
                                            aria-label={`选择提示词：${prompt.title}`}
                                            onClick={() => choose(prompt)}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <strong className="line-clamp-1 text-sm">{prompt.title}</strong>
                                                <div className="flex shrink-0 gap-1">
                                                    {prompt.catalog ? (
                                                        <Tag color="gold" className="m-0">
                                                            系统模板
                                                        </Tag>
                                                    ) : null}
                                                    <Tag className="m-0">v{prompt.version}</Tag>
                                                </div>
                                            </div>
                                            <p className="mt-3 line-clamp-4 min-h-20 whitespace-pre-wrap text-xs leading-5 text-stone-600 dark:text-stone-400">{prompt.content}</p>
                                        </button>
                                        <Button className="mt-3" size="small" type="primary" icon={<Check className="size-3.5" />} disabled={queryTransitioning} onClick={() => choose(prompt)}>
                                            使用
                                        </Button>
                                    </Card>
                                ))}
                            </div>
                        ) : !promptList.error ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-12" />
                        ) : null}
                    </div>
                    {promptList.total > PAGE_SIZE ? (
                        <div className="flex justify-center">
                            <Pagination current={page} pageSize={PAGE_SIZE} total={promptList.total} showSizeChanger={false} onChange={setPage} />
                        </div>
                    ) : null}
                </div>
            </Modal>
            <Modal
                title={`填写变量 · ${selected?.title || ""}`}
                open={Boolean(selected)}
                onCancel={() => {
                    setSelected(undefined);
                    setShowVariableErrors(false);
                }}
                onOk={() => {
                    if (!selected) return;
                    if (missingRequiredVariables.length) {
                        setShowVariableErrors(true);
                        message.warning("请填写所有必填变量");
                        return;
                    }
                    onSelect(rendered);
                    onSelectNegativePrompt?.(renderedNegative);
                    setSelected(undefined);
                    setShowVariableErrors(false);
                    onOpenChange(false);
                }}
                okText="使用最终提示词"
                cancelText="取消"
                width={680}
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    {selected?.variables.map((variable) => (
                        <label key={variable.name} className="text-sm">
                            <span className="mb-1 block text-stone-500">
                                {variable.label || variable.name}
                                {variable.required ? " *" : ""}
                            </span>
                            <Input
                                value={values[variable.name] || ""}
                                status={showVariableErrors && variable.required && !values[variable.name]?.trim() ? "error" : undefined}
                                aria-required={variable.required}
                                aria-invalid={showVariableErrors && variable.required && !values[variable.name]?.trim()}
                                onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                            />
                            {showVariableErrors && variable.required && !values[variable.name]?.trim() ? <span className="mt-1 block text-xs text-red-500">此变量为必填项</span> : null}
                        </label>
                    ))}
                </div>
                <pre className="mt-5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-4 text-sm leading-6 dark:bg-stone-900">{rendered}</pre>
            </Modal>
        </>
    );
}
