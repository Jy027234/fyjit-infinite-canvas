import { Copy, Download, Filter, Grid2X2, Heart, List, PencilLine, Plus, RotateCcw, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Card, DatePicker, Drawer, Empty, Form, Image, Input, Modal, Pagination, Select, Space, Switch, Tag, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes } from "@/lib/image-utils";
import {
    createCreativeTextAsset,
    createCreativeIntent,
    deleteCreativeAsset,
    fetchCreativeAssets,
    restoreCreativeAsset,
    updateCreativeAsset,
    uploadCreativeAsset,
    type CreativeAsset,
} from "@/services/api/creative";

type AssetFormValues = {
    title: string;
    content: string;
    notes?: string;
    tags?: string[];
    folder_id?: string;
};

type ContinueTarget = "image" | "video" | "character" | "film";

const typeOptions = [
    { label: "全部", value: "" },
    { label: "文本", value: "TEXT" },
    { label: "图片", value: "IMAGE" },
    { label: "视频", value: "VIDEO" },
    { label: "音频", value: "AUDIO" },
    { label: "角色", value: "CHARACTER" },
    { label: "关键帧", value: "KEYFRAME" },
    { label: "画布", value: "CANVAS" },
];

export default function AssetsPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [form] = Form.useForm<AssetFormValues>();
    const [assets, setAssets] = useState<CreativeAsset[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(24);
    const [keyword, setKeyword] = useState("");
    const [type, setType] = useState("");
    const [sourceModule, setSourceModule] = useState("");
    const [projectId, setProjectId] = useState("");
    const [folderId, setFolderId] = useState("");
    const [model, setModel] = useState("");
    const [tag, setTag] = useState("");
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [createdFrom, setCreatedFrom] = useState<number>();
    const [createdTo, setCreatedTo] = useState<number>();
    const [trashOnly, setTrashOnly] = useState(false);
    const [view, setView] = useState<"grid" | "list">("grid");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [creatingText, setCreatingText] = useState(false);
    const [editing, setEditing] = useState<CreativeAsset>();
    const [preview, setPreview] = useState<CreativeAsset>();
    const [deleting, setDeleting] = useState<CreativeAsset>();

    const refresh = async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const result = await fetchCreativeAssets({
                page,
                pageSize,
                type: type || undefined,
                sourceModule: sourceModule || undefined,
                projectId: projectId.trim() || undefined,
                folderId: folderId.trim() || undefined,
                search: keyword.trim() || undefined,
                favorite: favoriteOnly,
                model: model.trim() || undefined,
                tag: tag.trim() || undefined,
                createdFrom,
                createdTo,
                trash: trashOnly,
                signal,
            });
            setAssets(result.items || []);
            setTotal(result.total || 0);
        } catch (error) {
            if (!signal?.aborted) message.error(error instanceof Error ? error.message : "素材列表读取失败");
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
        // refresh is intentionally derived from the current paging/filter state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createdFrom, createdTo, favoriteOnly, folderId, keyword, model, page, pageSize, projectId, sourceModule, tag, trashOnly, type]);

    const submitText = async () => {
        const values = await form.validateFields();
        try {
            if (editing) {
                await updateCreativeAsset(editing.asset_id, { title: values.title.trim(), notes: values.notes?.trim(), tags: values.tags || [], folder_id: values.folder_id?.trim() || "" });
                message.success("素材已更新");
            } else {
                await createCreativeTextAsset({ title: values.title.trim(), content: values.content.trim(), notes: values.notes?.trim(), tags: values.tags || [], folder_id: values.folder_id?.trim() || undefined });
                message.success("文本素材已保存");
            }
            setCreatingText(false);
            setEditing(undefined);
            form.resetFields();
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材保存失败");
        }
    };

    const uploadFiles = async (files?: FileList | null) => {
        for (const file of Array.from(files || [])) {
            try {
                await uploadCreativeAsset(file, file.name);
                message.success(`${file.name} 已上传`);
            } catch (error) {
                message.error(`${file.name}：${error instanceof Error ? error.message : "上传失败"}`);
            }
        }
        await refresh();
    };

    const openEdit = (asset: CreativeAsset) => {
        setEditing(asset);
        form.setFieldsValue({ title: asset.title || "", content: asset.content || "", notes: asset.notes || "", tags: asset.tags || [], folder_id: asset.folder_id || "" });
        setCreatingText(true);
    };

    const toggleFavorite = async (asset: CreativeAsset) => {
        try {
            await updateCreativeAsset(asset.asset_id, { favorite: !asset.favorite });
            setAssets((items) => items.map((item) => (item.asset_id === asset.asset_id ? { ...item, favorite: !item.favorite } : item)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "收藏状态更新失败");
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteCreativeAsset(deleting.asset_id);
            setDeleting(undefined);
            message.success("素材已移入回收站");
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材删除失败");
        }
    };

    const restore = async (asset: CreativeAsset) => {
        try {
            await restoreCreativeAsset(asset.asset_id);
            message.success("素材已恢复");
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材恢复失败");
        }
    };

    const continueWithAsset = async (asset: CreativeAsset, target: ContinueTarget) => {
        try {
            const isText = asset.type === "TEXT";
            const intentKind = target === "film" ? "asset" : target;
            const intent = await createCreativeIntent(intentKind, {
                prompt: isText ? asset.content : undefined,
                asset_ids: isText ? undefined : [asset.asset_id],
            });
            const destination = target === "film" ? "/professional-video" : target === "character" ? "/character-studio" : target;
            window.location.assign(new URL(`${destination}?intent=${encodeURIComponent(intent.id)}`, document.baseURI).toString());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建继续创作意图失败");
        }
    };

    const download = (asset: CreativeAsset) => {
        if (!asset.preview_path) return;
        const extension = asset.mime_type?.split("/")[1] || "bin";
        saveAs(asset.preview_path, `${asset.title || asset.asset_id}.${extension}`);
    };

    const filterControls = <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="来源模块" allowClear value={sourceModule || undefined} placeholder="来源模块" options={[
            { label: "上传", value: "upload" }, { label: "手动创建", value: "manual" }, { label: "生图工作台", value: "image-workbench" }, { label: "视频创作台", value: "video-workbench" }, { label: "角色工坊", value: "character-studio" }, { label: "影视制作", value: "filmgen" }, { label: "无限画布", value: "canvas" },
        ]} onChange={(value) => { setPage(1); setSourceModule(value || ""); }} />
        <Input allowClear value={model} placeholder="模型 ID" onChange={(event) => { setPage(1); setModel(event.target.value); }} />
        <Input allowClear value={tag} placeholder="标签" onChange={(event) => { setPage(1); setTag(event.target.value); }} />
        <Input allowClear value={projectId} placeholder="项目 ID" onChange={(event) => { setPage(1); setProjectId(event.target.value); }} />
        <Input allowClear value={folderId} placeholder="文件夹" onChange={(event) => { setPage(1); setFolderId(event.target.value); }} />
        <DatePicker.RangePicker className="sm:col-span-2" onChange={(dates) => {
            setPage(1);
            setCreatedFrom(dates?.[0]?.startOf("day").unix());
            setCreatedTo(dates?.[1]?.endOf("day").unix());
        }} />
        <label className="flex min-h-8 items-center gap-2 text-sm"><Switch aria-label="仅收藏" size="small" checked={favoriteOnly} onChange={(value) => { setPage(1); setFavoriteOnly(value); }} />仅收藏</label>
        <label className="flex min-h-8 items-center gap-2 text-sm"><Switch aria-label="回收站" size="small" checked={trashOnly} onChange={(value) => { setPage(1); setTrashOnly(value); }} />回收站</label>
    </div>;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
                <div className="mx-auto max-w-7xl">
                    <div className="text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">素材中心</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">跨设备管理 FYJIT 生成结果、上传素材和文本资产。</p>
                    </div>

                    <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-3 sm:flex-row">
                        <Input
                            size="large"
                            allowClear
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder="搜索标题或备注"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                        />
                        <Button size="large" icon={<Upload className="size-4" />} onClick={() => uploadInputRef.current?.click()}>
                            上传素材
                        </Button>
                        <Button className="sm:hidden" size="large" icon={<Filter className="size-4" />} onClick={() => setFiltersOpen(true)}>
                            筛选
                        </Button>
                        <Button
                            size="large"
                            type="primary"
                            icon={<Plus className="size-4" />}
                            onClick={() => {
                                setEditing(undefined);
                                form.resetFields();
                                setCreatingText(true);
                            }}
                        >
                            新建文本
                        </Button>
                    </div>

                    <div className="mx-auto mt-4 hidden max-w-5xl rounded-lg border border-stone-200 bg-card p-4 sm:block dark:border-stone-800">{filterControls}</div>

                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {typeOptions.map((option) => (
                            <Tag.CheckableTag
                                key={option.value}
                                checked={type === option.value}
                                onChange={() => {
                                    setPage(1);
                                    setType(option.value);
                                }}
                            >
                                {option.label}
                            </Tag.CheckableTag>
                        ))}
                        <span className="mx-1 h-6 w-px bg-stone-200 dark:bg-stone-800" />
                        <Button size="small" type={view === "grid" ? "primary" : "text"} icon={<Grid2X2 className="size-3.5" />} onClick={() => setView("grid")}>网格</Button>
                        <Button size="small" type={view === "list" ? "primary" : "text"} icon={<List className="size-3.5" />} onClick={() => setView("list")}>列表</Button>
                    </div>

                    <div className={view === "grid" ? "mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "mx-auto mt-8 grid max-w-5xl gap-3"}>
                        {assets.map((asset) => (
                            <AssetCard
                                key={asset.asset_id}
                                asset={asset}
                                onOpen={() => setPreview(asset)}
                                onEdit={() => openEdit(asset)}
                                onFavorite={() => void toggleFavorite(asset)}
                                onCopy={() => copyText(asset.content || "", "文本已复制")}
                                onDownload={() => download(asset)}
                                onDelete={() => setDeleting(asset)}
                                onRestore={() => void restore(asset)}
                                onContinue={(target) => void continueWithAsset(asset, target)}
                                trash={trashOnly}
                                list={view === "list"}
                            />
                        ))}
                    </div>
                    {!assets.length && !loading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材" className="py-20" /> : null}
                    <div className="mt-8 flex justify-center">
                        <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[12, 24, 48, 96]} onChange={(next, size) => { setPage(next); setPageSize(size); }} />
                    </div>
                </div>
            </main>

            <input ref={uploadInputRef} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />

            <Modal title={editing ? "编辑素材" : "新建文本素材"} open={creatingText} onCancel={() => { setCreatingText(false); setEditing(undefined); }} onOk={() => void submitText()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}><Input maxLength={200} /></Form.Item>
                    {!editing ? <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}><Input.TextArea rows={8} maxLength={100000} /></Form.Item> : null}
                    <Form.Item name="tags" label="标签"><Select mode="tags" tokenSeparators={[",", "，"]} maxCount={50} /></Form.Item>
                    <Form.Item name="folder_id" label="文件夹"><Input maxLength={80} placeholder="例如 campaign-2026" /></Form.Item>
                    <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
                </Form>
            </Modal>

            <AssetDrawer asset={preview} onClose={() => setPreview(undefined)} onCopy={() => preview && copyText(preview.content || "", "文本已复制")} onDownload={() => preview && download(preview)} onContinue={(target) => preview && void continueWithAsset(preview, target)} trash={trashOnly} />

            <Drawer title="筛选素材" placement="bottom" size="large" open={filtersOpen} onClose={() => setFiltersOpen(false)}>{filterControls}</Drawer>

            <Modal title="删除素材" open={Boolean(deleting)} onCancel={() => setDeleting(undefined)} onOk={() => void confirmDelete()} okText="移入回收站" okButtonProps={{ danger: true }} cancelText="取消">
                确定将「{deleting?.title || "未命名素材"}」移入回收站吗？
            </Modal>
        </div>
    );
}

type AssetActions = {
    asset: CreativeAsset;
    onOpen: () => void;
    onEdit: () => void;
    onFavorite: () => void;
    onCopy: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onRestore: () => void;
    onContinue: (target: ContinueTarget) => void;
    trash: boolean;
    list: boolean;
};

function AssetCard({ asset, onOpen, onEdit, onFavorite, onCopy, onDownload, onDelete, onRestore, onContinue, trash, list }: AssetActions) {
    const typeLabel = asset.type === "IMAGE" ? "图片" : asset.type === "VIDEO" ? "视频" : asset.type === "AUDIO" ? "音频" : asset.type === "CHARACTER" ? "角色" : asset.type === "KEYFRAME" ? "关键帧" : asset.type === "CANVAS" ? "画布" : "文本";
    const canContinue = ["TEXT", "IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type);
    const canContinueCharacter = asset.type === "TEXT";
    const canContinueFilm = asset.type === "VIDEO";
    const preview = asset.preview_path && ["IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type)
        ? <img src={asset.thumbnail_path || asset.preview_path} alt={asset.title || ""} className={list ? "h-28 w-36 object-cover" : "aspect-[4/3] w-full object-cover"} loading="lazy" />
        : asset.preview_path && asset.type === "VIDEO"
            ? asset.thumbnail_path
                ? <img src={asset.thumbnail_path} alt={asset.title || ""} className={list ? "h-28 w-36 bg-black object-cover" : "aspect-[4/3] w-full bg-black object-cover"} loading="lazy" />
                : <video src={`${asset.preview_path}#t=0.1`} className={list ? "h-28 w-36 bg-black object-cover" : "aspect-[4/3] w-full bg-black object-cover"} preload="metadata" muted playsInline />
            : <div className={list ? "flex h-28 w-36 items-center justify-center bg-stone-100 p-3 text-center text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-300" : "flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300"}>{asset.content || typeLabel}</div>;
    const actions = <>
        {trash ? <Button size="small" type="primary" icon={<RotateCcw className="size-3.5" />} onClick={onRestore}>恢复</Button> : <>
            <Button size="small" icon={<Heart className="size-3.5" fill={asset.favorite ? "currentColor" : "none"} />} onClick={onFavorite}>{asset.favorite ? "已收藏" : "收藏"}</Button>
            <Button size="small" icon={<PencilLine className="size-3.5" />} onClick={onEdit}>编辑</Button>
            {asset.type === "TEXT" ? <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopy}>复制</Button> : asset.preview_path ? <Button size="small" icon={<Download className="size-3.5" />} onClick={onDownload}>下载</Button> : null}
            {canContinue ? <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("image")}>用于生图</Button> : null}
            {canContinue ? <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("video")}>用于视频</Button> : null}
            {canContinueCharacter ? <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("character")}>用于角色</Button> : null}
            {canContinueFilm ? <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("film")}>用于影视</Button> : null}
            <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete}>删除</Button>
        </>}
    </>;

    if (list) {
        return <Card hoverable className="overflow-hidden" styles={{ body: { padding: 0 } }}>
            <div className="flex min-w-0 flex-col sm:flex-row">
                <button type="button" className="shrink-0 overflow-hidden text-left" onClick={onOpen}>{preview}</button>
                <div className="min-w-0 flex-1 p-4">
                    <button type="button" className="block w-full text-left" onClick={onOpen}>
                        <div className="flex items-start justify-between gap-3"><h2 className="truncate text-sm font-semibold">{asset.title || "未命名素材"}</h2><Tag className="m-0 shrink-0">{typeLabel}</Tag></div>
                        <Typography.Paragraph type="secondary" ellipsis={{ rows: 1 }} className="!mb-0 !mt-2 !text-xs">{asset.notes || asset.content || `${formatBytes(asset.size_bytes || 0)} · ${asset.mime_type || "未知格式"}`}</Typography.Paragraph>
                        <div className="mt-2 text-xs text-stone-500">{asset.source_module || "未知来源"}{asset.model ? ` · ${asset.model}` : ""}{asset.project_id ? ` · ${asset.project_id}` : ""}{asset.folder_id ? ` · ${asset.folder_id}` : ""}</div>
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
                </div>
            </div>
        </Card>;
    }

    return (
        <Card hoverable className="overflow-hidden" styles={{ body: { padding: 0 } }} cover={<button type="button" className="block w-full text-left" onClick={onOpen}>{preview}</button>}>
            <button type="button" className="block w-full text-left p-4" onClick={onOpen}>
                <div className="flex items-start justify-between gap-3"><h2 className="line-clamp-1 text-sm font-semibold">{asset.title || "未命名素材"}</h2><Tag className="m-0 shrink-0">{typeLabel}</Tag></div>
                <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} className="!mb-0 !mt-2 !text-xs">{asset.notes || asset.content || `${formatBytes(asset.size_bytes || 0)} · ${asset.mime_type || "未知格式"}`}</Typography.Paragraph>
                <div className="mt-3 flex flex-wrap gap-1">{(asset.tags || []).slice(0, 3).map((tag) => <Tag key={tag} className="m-0 text-[11px]">{tag}</Tag>)}</div>
            </button>
            <div className="flex flex-wrap items-center gap-2 px-4 pb-4">{actions}</div>
        </Card>
    );
}

function AssetDrawer({ asset, onClose, onCopy, onDownload, onContinue, trash }: { asset?: CreativeAsset; onClose: () => void; onCopy: () => void; onDownload: () => void; onContinue: (target: ContinueTarget) => void; trash: boolean }) {
    const canContinue = asset ? ["TEXT", "IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type) : false;
    const canContinueCharacter = asset?.type === "TEXT";
    const canContinueFilm = asset?.type === "VIDEO";
    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? <div className="space-y-5">
                {["IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type) && asset.preview_path ? <Image src={asset.preview_path} alt={asset.title || ""} className="rounded-lg" /> : null}
                {asset.type === "VIDEO" && asset.preview_path ? <video src={asset.preview_path} controls className="aspect-video w-full rounded-lg bg-black" /> : null}
                {asset.type === "AUDIO" && asset.preview_path ? <audio src={asset.preview_path} controls className="w-full" /> : null}
                <div><Typography.Title level={4} className="!mb-2">{asset.title || "未命名素材"}</Typography.Title><Space size={[4, 4]} wrap>{(asset.tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space></div>
                {asset.content ? <Typography.Paragraph className="whitespace-pre-wrap">{asset.content}</Typography.Paragraph> : null}
                <div className="grid gap-2 rounded-lg bg-stone-50 p-4 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    <span>来源：{asset.source_module || "未知来源"}</span>
                    <span>格式：{asset.mime_type || asset.type} · {formatBytes(asset.size_bytes || 0)}</span>
                    {asset.model ? <span>模型：{asset.model}</span> : null}
                    {asset.project_id ? <span>项目：{asset.project_id}</span> : null}
                    {asset.folder_id ? <span>文件夹：{asset.folder_id}</span> : null}
                    {asset.job_id ? <span>任务：{asset.job_id}</span> : null}
                    {asset.width || asset.height ? <span>尺寸：{asset.width || "?"} × {asset.height || "?"}</span> : null}
                    {asset.duration ? <span>时长：{asset.duration.toFixed(1)} 秒</span> : null}
                    <span>创建时间：{new Date(asset.created_at * 1000).toLocaleString()}</span>
                </div>
                {asset.notes ? <Typography.Paragraph>{asset.notes}</Typography.Paragraph> : null}
                {!trash ? <Space wrap>
                    {asset.type === "TEXT" ? <Button type="primary" icon={<Copy className="size-4" />} onClick={onCopy}>复制文本</Button> : asset.preview_path ? <Button type="primary" icon={<Download className="size-4" />} onClick={onDownload}>下载素材</Button> : null}
                    {canContinue ? <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("image")}>用于生图</Button> : null}
                    {canContinue ? <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("video")}>用于视频</Button> : null}
                    {canContinueCharacter ? <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("character")}>用于角色</Button> : null}
                    {canContinueFilm ? <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("film")}>用于影视</Button> : null}
                </Space> : <Typography.Text type="secondary">此素材位于回收站，恢复后可继续使用。</Typography.Text>}
            </div> : null}
        </Drawer>
    );
}
