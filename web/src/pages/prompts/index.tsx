import { Copy, Files, Heart, History, Link, PencilLine, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Card, Drawer, Empty, Form, Input, Modal, Pagination, Select, Space, Switch, Tag, Typography } from "antd";

import { useCopyText } from "@/hooks/use-copy-text";
import { randomId } from "@/lib/utils";
import {
    createCreativePrompt,
    createCreativeJob,
    createCreativeTextAsset,
    deleteCreativePrompt,
    duplicateCreativePrompt,
    fetchCreativePromptRevisions,
    fetchCreativePrompts,
    fetchCreativeAsset,
    updateCreativePrompt,
    waitForCreativeJob,
    type CreativePrompt,
    type CreativePromptInput,
    type CreativePromptRevision,
    type CreativePromptVariable,
} from "@/services/api/creative";
import { useFyjitStore } from "@/stores/use-fyjit-store";

type PromptFormValues = CreativePromptInput;

const categoryOptions = [
    { label: "通用", value: "general" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "角色", value: "character" },
    { label: "影视", value: "film" },
];

export default function PromptsPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const importInputRef = useRef<HTMLInputElement>(null);
    const [form] = Form.useForm<PromptFormValues>();
    const [items, setItems] = useState<CreativePrompt[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(24);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [promptType, setPromptType] = useState("");
    const [tag, setTag] = useState("");
    const [sourceType, setSourceType] = useState("");
    const [favorite, setFavorite] = useState(false);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<CreativePrompt>();
    const [formOpen, setFormOpen] = useState(false);
    const [selected, setSelected] = useState<CreativePrompt>();
    const [deleting, setDeleting] = useState<CreativePrompt>();
    const [refining, setRefining] = useState<CreativePrompt>();
    const [refinedText, setRefinedText] = useState("");
    const [refiningLoading, setRefiningLoading] = useState(false);
    const fyjitModels = useFyjitStore((state) => state.models);
    const fyjitTokens = useFyjitStore((state) => state.tokens);

    const refresh = async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const result = await fetchCreativePrompts({
                page,
                pageSize,
                search: search.trim() || undefined,
                category: category || undefined,
                promptType: promptType || undefined,
                tag: tag.trim() || undefined,
                sourceType: sourceType || undefined,
                favorite,
                signal,
            });
            setItems(result.items || []);
            setTotal(result.total || 0);
        } catch (error) {
            if (!signal?.aborted) message.error(error instanceof Error ? error.message : "提示词读取失败");
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void refresh(controller.signal), 250);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
        // refresh is derived from the active server-side paging and filters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, favorite, page, pageSize, promptType, search, sourceType, tag]);

    const openCreate = () => {
        setEditing(undefined);
        form.setFieldsValue({ title: "", content: "", negative_prompt: "", prompt_type: "general", category: "general", tags: [], model_suggestions: [], source_type: "user" });
        setFormOpen(true);
    };

    const openEdit = (prompt: CreativePrompt) => {
        setEditing(prompt);
        form.setFieldsValue({
            title: prompt.title,
            content: prompt.content,
            negative_prompt: prompt.negative_prompt,
            prompt_type: prompt.prompt_type || "general",
            category: prompt.category || "general",
            tags: prompt.tags || [],
            variables: prompt.variables || [],
            model_suggestions: prompt.model_suggestions || [],
            cover_asset_id: prompt.cover_asset_id,
            author_name: prompt.author_name,
            source_type: prompt.source_type || "user",
            source_url: prompt.source_url,
            source_license: prompt.source_license,
            allowed_uses: prompt.allowed_uses,
            source_updated_at: prompt.source_updated_at,
        });
        setFormOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        const input: CreativePromptInput = {
            title: values.title.trim(),
            content: values.content.trim(),
            negative_prompt: values.negative_prompt?.trim(),
            prompt_type: values.prompt_type?.trim(),
            category: values.category?.trim(),
            tags: values.tags || [],
            variables: extractVariables(values.content, values.variables),
            model_suggestions: values.model_suggestions || [],
            cover_asset_id: values.cover_asset_id?.trim(),
            author_name: values.author_name?.trim(),
            source_type: values.source_type?.trim() || "user",
            source_url: values.source_url?.trim(),
            source_license: values.source_license?.trim(),
            allowed_uses: values.allowed_uses?.trim(),
            source_updated_at: values.source_type === "external" ? values.source_updated_at || Math.floor(Date.now() / 1000) : undefined,
        };
        try {
            if (editing) await updateCreativePrompt(editing.prompt_id, input);
            else await createCreativePrompt(input);
            message.success(editing ? "提示词已更新并生成新版本" : "提示词已创建");
            setFormOpen(false);
            setEditing(undefined);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提示词保存失败");
        }
    };

    const runAction = async (action: () => Promise<unknown>, success: string) => {
        try {
            await action();
            message.success(success);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        }
    };

    const importPrompts = async (file?: File) => {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text()) as unknown;
            const records = (Array.isArray(parsed) ? parsed : [parsed]).filter(isPromptImport);
            if (!records.length) throw new Error("文件中没有有效提示词");
            let imported = 0;
            for (const record of records.slice(0, 100)) {
                await createCreativePrompt({
                    ...record,
                    title: record.title.trim(),
                    content: record.content.trim(),
                    source_type: record.source_type || "import",
                    variables: extractVariables(record.content, record.variables),
                });
                imported += 1;
            }
            message.success(`已导入 ${imported} 条提示词`);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提示词导入失败");
        }
    };

    const refinePrompt = async (prompt: CreativePrompt) => {
        const textModel = fyjitModels.find((item) => item.capabilities.includes("text_generation"));
        if (!textModel || !fyjitTokens.length) {
            message.warning("当前账号缺少可用文本模型或本站 Token");
            return;
        }
        setRefining(prompt);
        setRefinedText("");
        setRefiningLoading(true);
        try {
            const job = await createCreativeJob({
                capability: "text_generation",
                model: textModel.id,
                group: "auto",
                token: { strategy: "auto" },
                prompt: `你是提示词编辑器。请优化下面的创作提示词，保持原意、语言和所有 {{变量}} 不变，只输出优化后的完整提示词，不要解释。\n\n${prompt.content}`,
                parameters: { temperature: 0.4 },
                idempotency_key: randomId(),
            });
            const completed = await waitForCreativeJob(job.job_id);
            if (completed.status !== "SUCCEEDED" || !completed.result_asset_ids?.[0]) throw new Error(completed.error || "精修任务未返回结果");
            const asset = await fetchCreativeAsset(completed.result_asset_ids[0]);
            if (!asset.content?.trim()) throw new Error("精修结果为空");
            setRefinedText(asset.content.trim());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 精修失败");
            setRefining(undefined);
        } finally {
            setRefiningLoading(false);
        }
    };

    const acceptRefinement = async () => {
        if (!refining || !refinedText.trim()) return;
        await runAction(() => updateCreativePrompt(refining.prompt_id, { content: refinedText.trim() }), "已采用精修结果并创建新版本");
        setRefining(undefined);
        setRefinedText("");
    };

    const editingSourceType = Form.useWatch("source_type", form);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-4 py-6 [background-size:16px_16px] sm:px-6 lg:py-8 dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
                <div className="mx-auto max-w-7xl">
                    <div className="text-center">
                        <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">提示词库</h1>
                        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">由 FYJIT 服务端保存，跨设备同步并保留不可变版本。</p>
                    </div>
                    <div className="mx-auto mt-7 flex max-w-6xl flex-col gap-3 md:flex-row md:flex-wrap">
                        <Input
                            allowClear
                            size="large"
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={search}
                            placeholder="搜索标题或正文"
                            onChange={(event) => {
                                setPage(1);
                                setSearch(event.target.value);
                            }}
                        />
                        <Select
                            aria-label="提示词分类"
                            size="large"
                            className="md:w-40"
                            value={category}
                            options={[{ label: "全部分类", value: "" }, ...categoryOptions]}
                            onChange={(value) => {
                                setPage(1);
                                setCategory(value);
                            }}
                        />
                        <Select
                            aria-label="提示词类型"
                            size="large"
                            className="md:w-40"
                            value={promptType}
                            options={[{ label: "全部类型", value: "" }, ...categoryOptions]}
                            onChange={(value) => {
                                setPage(1);
                                setPromptType(value);
                            }}
                        />
                        <Input
                            allowClear
                            size="large"
                            className="md:w-40"
                            value={tag}
                            placeholder="标签"
                            onChange={(event) => {
                                setPage(1);
                                setTag(event.target.value);
                            }}
                        />
                        <Select
                            aria-label="提示词来源"
                            size="large"
                            className="md:w-40"
                            value={sourceType}
                            options={[
                                { label: "全部来源", value: "" },
                                { label: "我的创作", value: "user" },
                                { label: "文件导入", value: "import" },
                                { label: "外部来源", value: "external" },
                            ]}
                            onChange={(value) => {
                                setPage(1);
                                setSourceType(value);
                            }}
                        />
                        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-stone-200 px-3 dark:border-stone-800">
                            <Switch
                                aria-label="仅收藏"
                                size="small"
                                checked={favorite}
                                onChange={(value) => {
                                    setPage(1);
                                    setFavorite(value);
                                }}
                            />
                            <span className="text-sm">仅收藏</span>
                        </div>
                        <Button size="large" icon={<Upload className="size-4" />} onClick={() => importInputRef.current?.click()}>
                            导入 JSON
                        </Button>
                        <Button type="primary" size="large" icon={<Plus className="size-4" />} onClick={openCreate}>
                            新建提示词
                        </Button>
                    </div>

                    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={loading}>
                        {items.map((prompt) => (
                            <PromptCard
                                key={prompt.prompt_id}
                                prompt={prompt}
                                onOpen={() => setSelected(prompt)}
                                onEdit={() => openEdit(prompt)}
                                onCopy={() => copyText(prompt.content, "提示词已复制")}
                                onFavorite={() => void runAction(() => updateCreativePrompt(prompt.prompt_id, { favorite: !prompt.favorite }), prompt.favorite ? "已取消收藏" : "已收藏")}
                                onDuplicate={() => void runAction(() => duplicateCreativePrompt(prompt.prompt_id), "已复制为新的提示词")}
                                onRefine={() => void refinePrompt(prompt)}
                                onDelete={() => setDeleting(prompt)}
                            />
                        ))}
                    </div>
                    {!items.length && !loading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有匹配的提示词" className="py-20" /> : null}
                    <div className="mt-8 flex justify-center">
                        <Pagination
                            current={page}
                            pageSize={pageSize}
                            total={total}
                            showSizeChanger
                            pageSizeOptions={[12, 24, 48, 96]}
                            onChange={(next, size) => {
                                setPage(next);
                                setPageSize(size);
                            }}
                        />
                    </div>
                </div>
            </main>

            <Modal title={editing ? "编辑提示词" : "新建提示词"} open={formOpen} onCancel={() => setFormOpen(false)} onOk={() => void save()} okText="保存" cancelText="取消" width={720} destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input maxLength={200} showCount />
                    </Form.Item>
                    <Form.Item name="content" label="提示词正文" extra="可使用 {{subject}} 形式声明变量，保存时会自动识别。" rules={[{ required: true, message: "请输入提示词正文" }]}>
                        <Input.TextArea rows={9} maxLength={100000} showCount />
                    </Form.Item>
                    <Form.Item name="negative_prompt" label="负向提示词">
                        <Input.TextArea rows={3} maxLength={20000} />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="prompt_type" label="类型">
                            <Select options={categoryOptions} />
                        </Form.Item>
                        <Form.Item name="category" label="分类">
                            <Select options={categoryOptions} />
                        </Form.Item>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} maxCount={50} />
                        </Form.Item>
                        <Form.Item name="model_suggestions" label="建议模型">
                            <Select mode="tags" tokenSeparators={[",", "，"]} maxCount={20} />
                        </Form.Item>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="cover_asset_id" label="封面素材 ID">
                            <Input maxLength={80} />
                        </Form.Item>
                        <Form.Item name="source_type" label="来源">
                            <Select
                                options={[
                                    { label: "我的创作", value: "user" },
                                    { label: "文件导入", value: "import" },
                                    { label: "外部来源", value: "external" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                    {editingSourceType === "external" ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Form.Item name="author_name" label="作者" rules={[{ required: true, message: "请填写原作者" }]}>
                                    <Input maxLength={120} />
                                </Form.Item>
                                <Form.Item name="source_license" label="许可证" rules={[{ required: true, message: "请填写许可证" }]}>
                                    <Input maxLength={120} />
                                </Form.Item>
                            </div>
                            <Form.Item name="source_url" label="原始链接" rules={[{ required: true, type: "url", message: "请填写有效的原始链接" }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="allowed_uses" label="允许用途" rules={[{ required: true, message: "请说明允许用途" }]}>
                                <Input.TextArea rows={2} maxLength={2000} />
                            </Form.Item>
                        </>
                    ) : null}
                </Form>
            </Modal>

            <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                    void importPrompts(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />

            <Modal
                title="AI 精修对比"
                open={Boolean(refining)}
                onCancel={() => {
                    setRefining(undefined);
                    setRefinedText("");
                }}
                onOk={() => void acceptRefinement()}
                okText="采用并创建新版本"
                cancelText="回退"
                okButtonProps={{ disabled: refiningLoading || !refinedText.trim() }}
                width={920}
                destroyOnHidden
            >
                <div className="grid gap-4 pt-2 md:grid-cols-2">
                    <label>
                        <span className="mb-2 block text-sm font-medium">精修前</span>
                        <Input.TextArea value={refining?.content || ""} readOnly autoSize={{ minRows: 12, maxRows: 24 }} />
                    </label>
                    <label>
                        <span className="mb-2 block text-sm font-medium">精修后（可修改）</span>
                        <Input.TextArea
                            value={refinedText}
                            onChange={(event) => setRefinedText(event.target.value)}
                            placeholder={refiningLoading ? "正在通过 FYJIT Job 精修…" : "精修结果"}
                            autoSize={{ minRows: 12, maxRows: 24 }}
                            disabled={refiningLoading}
                        />
                    </label>
                </div>
            </Modal>

            <PromptDrawer
                prompt={selected}
                onClose={() => setSelected(undefined)}
                onCopy={copyText}
                onSaveAsset={async (prompt, rendered) => {
                    await runAction(() => createCreativeTextAsset({ title: prompt.title, content: rendered, notes: `来自提示词 ${prompt.prompt_id} v${prompt.version}`, tags: prompt.tags }), "已保存到素材中心");
                }}
            />

            <Modal
                title="删除提示词"
                open={Boolean(deleting)}
                onCancel={() => setDeleting(undefined)}
                onOk={() => {
                    if (!deleting) return;
                    const target = deleting;
                    setDeleting(undefined);
                    void runAction(() => deleteCreativePrompt(target.prompt_id), "提示词已删除");
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deleting?.title}」吗？历史版本将保留在数据库审计记录中。
            </Modal>
        </div>
    );
}

function PromptCard({
    prompt,
    onOpen,
    onEdit,
    onCopy,
    onFavorite,
    onDuplicate,
    onRefine,
    onDelete,
}: {
    prompt: CreativePrompt;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: () => void;
    onFavorite: () => void;
    onDuplicate: () => void;
    onRefine: () => void;
    onDelete: () => void;
}) {
    return (
        <Card hoverable className="overflow-hidden" styles={{ body: { padding: 0 } }}>
            <button type="button" className="block w-full p-4 text-left" onClick={onOpen}>
                <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-1 text-sm font-semibold">{prompt.title}</h2>
                    <Tag className="m-0 shrink-0">v{prompt.version}</Tag>
                </div>
                <p className="mt-3 line-clamp-4 min-h-20 whitespace-pre-wrap text-xs leading-5 text-stone-600 dark:text-stone-400">{prompt.content}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                    {prompt.prompt_type ? (
                        <Tag color="purple" className="m-0 text-[11px]">
                            {categoryOptions.find((item) => item.value === prompt.prompt_type)?.label || prompt.prompt_type}
                        </Tag>
                    ) : null}
                    {prompt.category ? (
                        <Tag color="blue" className="m-0 text-[11px]">
                            {categoryOptions.find((item) => item.value === prompt.category)?.label || prompt.category}
                        </Tag>
                    ) : null}
                    {prompt.source_type === "external" ? (
                        <Tag color="gold" className="m-0 text-[11px]">
                            外部来源
                        </Tag>
                    ) : null}
                    {(prompt.tags || []).slice(0, 3).map((tag) => (
                        <Tag key={tag} className="m-0 text-[11px]">
                            {tag}
                        </Tag>
                    ))}
                </div>
            </button>
            <div className="flex flex-wrap gap-2 px-4 pb-4">
                <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopy}>
                    复制
                </Button>
                <Button size="small" icon={<Heart className="size-3.5" fill={prompt.favorite ? "currentColor" : "none"} />} onClick={onFavorite}>
                    {prompt.favorite ? "已收藏" : "收藏"}
                </Button>
                <Button size="small" icon={<PencilLine className="size-3.5" />} onClick={onEdit}>
                    编辑
                </Button>
                <Button size="small" icon={<Files className="size-3.5" />} onClick={onDuplicate}>
                    副本
                </Button>
                <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={onRefine}>
                    AI 精修
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
                    删除
                </Button>
            </div>
        </Card>
    );
}

function PromptDrawer({ prompt, onClose, onCopy, onSaveAsset }: { prompt?: CreativePrompt; onClose: () => void; onCopy: (value: string, message?: string) => void; onSaveAsset: (prompt: CreativePrompt, rendered: string) => Promise<void> }) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [revisions, setRevisions] = useState<CreativePromptRevision[]>([]);
    const variables = useMemo(() => (prompt ? extractVariables(prompt.content, prompt.variables) : []), [prompt]);
    const rendered = useMemo(() => renderPrompt(prompt?.content || "", values), [prompt?.content, values]);

    useEffect(() => {
        if (!prompt) return;
        setValues(Object.fromEntries(extractVariables(prompt.content, prompt.variables).map((variable) => [variable.name, variable.default || ""])));
        const controller = new AbortController();
        void fetchCreativePromptRevisions(prompt.prompt_id, controller.signal)
            .then(setRevisions)
            .catch(() => setRevisions([]));
        return () => controller.abort();
    }, [prompt]);

    return (
        <Drawer title={prompt?.title || "提示词详情"} open={Boolean(prompt)} size="large" onClose={onClose}>
            {prompt ? (
                <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                        <Tag color="purple">{prompt.prompt_type || "general"}</Tag>
                        <Tag color="blue">{prompt.category || "general"}</Tag>
                        <Tag>版本 v{prompt.version}</Tag>
                        {prompt.tags.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                        ))}
                    </div>
                    {prompt.source_type === "external" ? (
                        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                            <div>作者：{prompt.author_name || "未记录"}</div>
                            <div className="mt-1">许可证：{prompt.source_license || "未记录"}</div>
                            <div className="mt-1">允许用途：{prompt.allowed_uses || "未记录"}</div>
                            {prompt.source_url ? (
                                <a className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:underline" href={prompt.source_url} target="_blank" rel="noreferrer">
                                    <Link className="size-3.5" />
                                    查看原始来源
                                </a>
                            ) : null}
                        </section>
                    ) : null}
                    {variables.length ? (
                        <section>
                            <Typography.Title level={5}>填写变量</Typography.Title>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {variables.map((variable) => (
                                    <label key={variable.name} className="text-sm">
                                        <span className="mb-1 block text-stone-500">
                                            {variable.label || variable.name}
                                            {variable.required ? " *" : ""}
                                        </span>
                                        <Input value={values[variable.name] || ""} onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))} />
                                    </label>
                                ))}
                            </div>
                        </section>
                    ) : null}
                    <section>
                        <Typography.Title level={5}>最终提示词</Typography.Title>
                        <pre className="whitespace-pre-wrap rounded-xl bg-stone-100 p-4 text-sm leading-7 dark:bg-stone-900">{rendered}</pre>
                    </section>
                    {prompt.negative_prompt ? (
                        <section>
                            <Typography.Title level={5}>负向提示词</Typography.Title>
                            <p className="whitespace-pre-wrap text-sm text-stone-600 dark:text-stone-400">{prompt.negative_prompt}</p>
                        </section>
                    ) : null}
                    <Space wrap>
                        <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(rendered, "最终提示词已复制")}>
                            复制最终提示词
                        </Button>
                        <Button onClick={() => void onSaveAsset(prompt, rendered)}>保存为文本素材</Button>
                    </Space>
                    <section>
                        <Typography.Title level={5}>
                            <span className="inline-flex items-center gap-2">
                                <History className="size-4" />
                                版本历史
                            </span>
                        </Typography.Title>
                        <div className="space-y-2">
                            {revisions.map((revision) => (
                                <details key={revision.revision_id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <summary className="cursor-pointer text-sm font-medium">
                                        v{revision.version} · {formatTime(revision.created_at)}
                                    </summary>
                                    <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-stone-600 dark:text-stone-400">{revision.content}</pre>
                                </details>
                            ))}
                        </div>
                    </section>
                </div>
            ) : null}
        </Drawer>
    );
}

function extractVariables(content: string, existing: CreativePromptVariable[] = []) {
    const byName = new Map(existing.map((item) => [item.name, item]));
    for (const match of content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
        const name = match[1];
        if (name && !byName.has(name)) byName.set(name, { name, label: name });
    }
    return [...byName.values()].filter((item) => content.includes(`{{${item.name}}}`) || new RegExp(`\\{\\{\\s*${escapeRegExp(item.name)}\\s*\\}\\}`).test(content));
}

function renderPrompt(content: string, values: Record<string, string>) {
    return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name: string) => values[name]?.trim() || `{{${name}}}`);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTime(value: number) {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value * 1000));
}

function isPromptImport(value: unknown): value is CreativePromptInput {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.title === "string" && Boolean(record.title.trim()) && typeof record.content === "string" && Boolean(record.content.trim());
}
