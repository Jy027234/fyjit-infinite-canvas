import { Copy, Download, Filter, Grid2X2, Heart, List, PencilLine, Plus, RotateCcw, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, AutoComplete, Button, Card, DatePicker, Drawer, Form, Image, Input, Modal, Pagination, Select, Space, Spin, Switch, Tag, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { useCreativeAssetMutations, useCreativeAssetsQuery, useCreativeProjectsQuery } from "@/hooks/use-creative-asset-list";
import { CreativeCardActionBar } from "@/components/creative-card-action-bar";
import { CreativeOperationFeedback, type CreativeOperationFeedbackState } from "@/components/creative-operation-feedback";
import { FyjitEmptyState, FyjitPageHeader } from "@/components/fyjit/creative-ui";
import { formatBytes } from "@/lib/image-utils";
import { createCreativeIntent, type CreativeAsset } from "@/services/api/creative";

type AssetFormValues = {
    title: string;
    content: string;
    notes?: string;
    tags?: string[];
    folder_id?: string;
    project_id?: string;
};

type ProjectFormValues = { title: string; description?: string };

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
    const [projectForm] = Form.useForm<ProjectFormValues>();
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
    const [creatingText, setCreatingText] = useState(false);
    const [editing, setEditing] = useState<CreativeAsset>();
    const [preview, setPreview] = useState<CreativeAsset>();
    const [deleting, setDeleting] = useState<CreativeAsset>();
    const [feedback, setFeedback] = useState<CreativeOperationFeedbackState>();
    const [undoAsset, setUndoAsset] = useState<CreativeAsset>();
    const [projectModalOpen, setProjectModalOpen] = useState(false);
    const showFeedback = (next: CreativeOperationFeedbackState) => {
        setUndoAsset(undefined);
        setFeedback(next);
    };
    const assetsQuery = useCreativeAssetsQuery({
        page,
        pageSize,
        type,
        sourceModule,
        projectId,
        folderId,
        search: keyword,
        favorite: favoriteOnly,
        model,
        tag,
        createdFrom,
        createdTo,
        trash: trashOnly,
    });
    const projectsQuery = useCreativeProjectsQuery({ pageSize: 100 });
    const { createTextAsset, updateAsset: updateAssetMutation, uploadAsset, deleteAsset, restoreAsset, createProject } = useCreativeAssetMutations();
    const assets = assetsQuery.items;
    const total = assetsQuery.total;
    const loading = assetsQuery.isPending || assetsQuery.isFetching;
    const projects = projectsQuery.items;
    const projectSaving = createProject.isPending;
    const projectOptions = useMemo(() => projects.map((item) => ({ label: item.title, value: item.project_id })), [projects]);

    useEffect(() => {
        if (projectsQuery.error) message.error(projectsQuery.error instanceof Error ? projectsQuery.error.message : "项目列表读取失败");
    }, [message, projectsQuery.error]);

    const submitText = async () => {
        const values = await form.validateFields();
        try {
            if (editing) {
                await updateAssetMutation.mutateAsync({
                    assetId: editing.asset_id,
                    updates: {
                        title: values.title.trim(),
                        notes: values.notes?.trim(),
                        tags: values.tags || [],
                        folder_id: values.folder_id?.trim() || "",
                        project_id: values.project_id || "",
                    },
                });
                message.success("素材已更新");
                showFeedback({ type: "success", message: "素材已更新", description: "列表与素材详情已同步为最新内容。" });
            } else {
                await createTextAsset.mutateAsync({
                    title: values.title.trim(),
                    content: values.content.trim(),
                    notes: values.notes?.trim(),
                    tags: values.tags || [],
                    folder_id: values.folder_id?.trim() || undefined,
                    project_id: values.project_id,
                });
                message.success("文本素材已保存");
                showFeedback({ type: "success", message: "文本素材已保存", description: "新素材已加入当前素材列表。" });
            }
            setCreatingText(false);
            setEditing(undefined);
            form.resetFields();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "素材保存失败";
            message.error(errorMessage);
            showFeedback({ type: "error", message: "素材保存失败", description: errorMessage });
        }
    };

    const uploadFiles = async (files?: FileList | null) => {
        let successCount = 0;
        const failures: string[] = [];
        for (const file of Array.from(files || [])) {
            try {
                await uploadAsset.mutateAsync({ file, title: file.name, projectId: projectId || undefined });
                message.success(`${file.name} 已上传`);
                successCount += 1;
            } catch (error) {
                const failure = `${file.name}：${error instanceof Error ? error.message : "上传失败"}`;
                failures.push(failure);
                message.error(failure);
            }
        }
        if (successCount || failures.length) {
            showFeedback({
                type: failures.length ? (successCount ? "warning" : "error") : "success",
                message: failures.length ? `上传完成：${successCount} 个成功，${failures.length} 个失败` : `已上传 ${successCount} 个素材`,
                description: failures.length ? failures.join("；") : "上传结果已加入当前素材列表。",
            });
        }
    };

    const openEdit = (asset: CreativeAsset) => {
        setEditing(asset);
        form.setFieldsValue({ title: asset.title || "", content: asset.content || "", notes: asset.notes || "", tags: asset.tags || [], folder_id: asset.folder_id || "", project_id: asset.project_id || undefined });
        setCreatingText(true);
    };

    const toggleFavorite = async (asset: CreativeAsset) => {
        try {
            await updateAssetMutation.mutateAsync({ assetId: asset.asset_id, updates: { favorite: !asset.favorite } });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "收藏状态更新失败";
            message.error(errorMessage);
            showFeedback({ type: "error", message: "收藏状态更新失败", description: errorMessage });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteAsset.mutateAsync(deleting.asset_id);
            const deletedAsset = deleting;
            setDeleting(undefined);
            message.success("素材已移入回收站");
            setUndoAsset(deletedAsset);
            setFeedback({ type: "success", message: "素材已移入回收站", description: "可立即撤销，或稍后在回收站中恢复。" });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "素材删除失败";
            message.error(errorMessage);
            showFeedback({ type: "error", message: "素材删除失败", description: errorMessage });
        }
    };

    const restore = async (asset: CreativeAsset) => {
        try {
            await restoreAsset.mutateAsync(asset.asset_id);
            message.success("素材已恢复");
            setUndoAsset(undefined);
            showFeedback({ type: "success", message: "素材已恢复", description: `「${asset.title || "未命名素材"}」已返回素材中心。` });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "素材恢复失败";
            message.error(errorMessage);
            showFeedback({ type: "error", message: "素材恢复失败", description: errorMessage });
        }
    };

    const submitProject = async () => {
        const values = await projectForm.validateFields();
        try {
            const project = await createProject.mutateAsync({ title: values.title.trim(), description: values.description?.trim() });
            setProjectId(project.project_id);
            setPage(1);
            setProjectModalOpen(false);
            projectForm.resetFields();
            message.success("项目已创建，后续上传和新建素材会自动归入该项目");
            showFeedback({ type: "success", message: "项目已创建", description: "后续上传和新建素材会自动归入该项目。" });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "项目创建失败";
            message.error(errorMessage);
            showFeedback({ type: "error", message: "项目创建失败", description: errorMessage });
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
            const errorMessage = error instanceof Error ? error.message : "创建继续创作意图失败";
            message.error(errorMessage);
            showFeedback({ type: "error", message: "无法继续创作", description: errorMessage });
        }
    };

    const download = (asset: CreativeAsset) => {
        if (!asset.preview_path) return;
        const extension = asset.mime_type?.split("/")[1] || "bin";
        saveAs(asset.preview_path, `${asset.title || asset.asset_id}.${extension}`);
    };

    const filterControls = (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
                aria-label="来源模块"
                allowClear
                value={sourceModule || undefined}
                placeholder="来源模块"
                options={[
                    { label: "上传", value: "upload" },
                    { label: "手动创建", value: "manual" },
                    { label: "生图工作台", value: "image-workbench" },
                    { label: "视频创作台", value: "video-workbench" },
                    { label: "角色工坊", value: "character-studio" },
                    { label: "影视制作", value: "filmgen" },
                    { label: "无限画布", value: "canvas" },
                ]}
                onChange={(value) => {
                    setPage(1);
                    setSourceModule(value || "");
                }}
            />
            <Input
                allowClear
                value={model}
                placeholder="模型 ID"
                onChange={(event) => {
                    setPage(1);
                    setModel(event.target.value);
                }}
            />
            <Input
                allowClear
                value={tag}
                placeholder="标签"
                onChange={(event) => {
                    setPage(1);
                    setTag(event.target.value);
                }}
            />
            <AutoComplete
                allowClear
                optionFilterProp="label"
                value={projectId || undefined}
                options={projectOptions}
                onChange={(value) => {
                    setPage(1);
                    setProjectId(value || "");
                }}
            >
                <Input placeholder="项目 ID" />
            </AutoComplete>
            <Input
                allowClear
                value={folderId}
                placeholder="文件夹"
                onChange={(event) => {
                    setPage(1);
                    setFolderId(event.target.value);
                }}
            />
            <DatePicker.RangePicker
                className="sm:col-span-2"
                onChange={(dates) => {
                    setPage(1);
                    setCreatedFrom(dates?.[0]?.startOf("day").unix());
                    setCreatedTo(dates?.[1]?.endOf("day").unix());
                }}
            />
            <label className="flex min-h-8 items-center gap-2 text-sm">
                <Switch
                    aria-label="仅收藏"
                    size="small"
                    checked={favoriteOnly}
                    onChange={(value) => {
                        setPage(1);
                        setFavoriteOnly(value);
                    }}
                />
                仅收藏
            </label>
            <label className="flex min-h-8 items-center gap-2 text-sm">
                <Switch
                    aria-label="回收站"
                    size="small"
                    checked={trashOnly}
                    onChange={(value) => {
                        setPage(1);
                        setTrashOnly(value);
                    }}
                />
                回收站
            </label>
        </div>
    );

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
                <div className="mx-auto max-w-7xl">
                    <FyjitPageHeader title="素材中心" description="跨设备管理 FYJIT 生成结果、上传素材和文本资产。" centered />

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
                        <Button
                            size="large"
                            icon={<Plus className="size-4" />}
                            onClick={() => {
                                projectForm.resetFields();
                                setProjectModalOpen(true);
                            }}
                        >
                            新建项目
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
                        <Button size="small" type={view === "grid" ? "primary" : "text"} icon={<Grid2X2 className="size-3.5" />} onClick={() => setView("grid")}>
                            网格
                        </Button>
                        <Button size="small" type={view === "list" ? "primary" : "text"} icon={<List className="size-3.5" />} onClick={() => setView("list")}>
                            列表
                        </Button>
                    </div>

                    <CreativeOperationFeedback
                        className="mx-auto mt-6 max-w-5xl"
                        feedback={feedback}
                        action={
                            undoAsset ? (
                                <Button size="small" loading={restoreAsset.isPending} onClick={() => void restore(undoAsset)}>
                                    撤销
                                </Button>
                            ) : null
                        }
                        onClose={() => {
                            setFeedback(undefined);
                            setUndoAsset(undefined);
                        }}
                    />

                    {projectsQuery.error ? (
                        <Alert
                            className="mx-auto mt-6 max-w-5xl"
                            type="warning"
                            showIcon
                            message="项目列表读取失败"
                            description={projectsQuery.error instanceof Error ? projectsQuery.error.message : "暂时无法读取项目列表；仍可浏览未按项目筛选的素材。"}
                            action={
                                <Button size="small" loading={projectsQuery.isFetching} onClick={() => void projectsQuery.refetch()}>
                                    重试加载
                                </Button>
                            }
                        />
                    ) : null}

                    {assetsQuery.error ? (
                        <Alert
                            className="mx-auto mt-6 max-w-5xl"
                            type="error"
                            showIcon
                            message={assetsQuery.error instanceof Error ? assetsQuery.error.message : "素材列表读取失败"}
                            action={
                                <Button size="small" loading={assetsQuery.isFetching} onClick={() => void assetsQuery.refetch()}>
                                    重试加载
                                </Button>
                            }
                        />
                    ) : null}

                    {!assets.length && loading ? (
                        <div className="mt-8 grid min-h-40 place-items-center gap-3 text-sm text-muted-foreground" role="status">
                            <Spin />
                            <span>正在读取素材…</span>
                        </div>
                    ) : null}

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
                    {!assets.length && !loading && !assetsQuery.error ? <FyjitEmptyState icon={Search} title="没有找到素材" description="调整搜索或筛选条件，也可以上传新素材。" className="mt-8" /> : null}
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

            <input
                ref={uploadInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(event) => {
                    void uploadFiles(event.target.files);
                    event.target.value = "";
                }}
            />

            <Modal
                title={editing ? "编辑素材" : "新建文本素材"}
                open={creatingText}
                onCancel={() => {
                    setCreatingText(false);
                    setEditing(undefined);
                }}
                onOk={() => void submitText()}
                okText="保存"
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input maxLength={200} />
                    </Form.Item>
                    {!editing ? (
                        <>
                            <Alert className="mb-4" type="info" showIcon message="文本素材的用途" description="保存后可直接用于生图、视频和角色创作，系统会把文本作为提示词带入对应工作台；也可作为项目中的脚本、对白或创作说明长期复用。" />
                            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                                <Input.TextArea rows={8} maxLength={100000} />
                            </Form.Item>
                        </>
                    ) : null}
                    <Form.Item name="project_id" label="所属项目" extra="可选。归入项目后，可按项目筛选并在后续生成任务中自动保存结果。">
                        <Select allowClear showSearch optionFilterProp="label" placeholder="不归入项目" options={projectOptions} />
                    </Form.Item>
                    <Form.Item name="tags" label="标签">
                        <Select mode="tags" tokenSeparators={[",", "，"]} maxCount={50} />
                    </Form.Item>
                    <Form.Item name="folder_id" label="文件夹">
                        <Input maxLength={80} placeholder="例如 campaign-2026" />
                    </Form.Item>
                    <Form.Item name="notes" label="备注">
                        <Input.TextArea rows={3} maxLength={4000} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal title="新建创作项目" open={projectModalOpen} onCancel={() => setProjectModalOpen(false)} onOk={() => void submitProject()} confirmLoading={projectSaving} okText="创建并选中" cancelText="取消" destroyOnHidden>
                <Form form={projectForm} layout="vertical" requiredMark={false} className="pt-2">
                    <Alert className="mb-4" type="info" showIcon message="项目用于集中管理同一作品的人设、背景、脚本和生成结果。" />
                    <Form.Item name="title" label="项目名称" rules={[{ required: true, message: "请输入项目名称" }]}>
                        <Input maxLength={160} placeholder="例如：云海狐仙短片" />
                    </Form.Item>
                    <Form.Item name="description" label="项目说明">
                        <Input.TextArea rows={3} maxLength={4000} placeholder="记录作品目标、风格或协作说明" />
                    </Form.Item>
                </Form>
            </Modal>

            <AssetDrawer
                asset={preview}
                onClose={() => setPreview(undefined)}
                onCopy={() => preview && copyText(preview.content || "", "文本已复制")}
                onDownload={() => preview && download(preview)}
                onContinue={(target) => preview && void continueWithAsset(preview, target)}
                trash={trashOnly}
            />

            <Drawer title="筛选素材" placement="bottom" size="large" open={filtersOpen} onClose={() => setFiltersOpen(false)}>
                {filterControls}
            </Drawer>

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
    const canContinueImage = ["TEXT", "IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type);
    const canContinueVideo = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type);
    const canContinueCharacter = asset.type === "TEXT";
    const canContinueFilm = asset.type === "VIDEO";
    const preview =
        asset.preview_path && ["IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type) ? (
            <img src={asset.thumbnail_path || asset.preview_path} alt={asset.title || ""} className={list ? "h-28 w-36 object-cover" : "aspect-[4/3] w-full object-cover"} loading="lazy" />
        ) : asset.preview_path && asset.type === "VIDEO" ? (
            asset.thumbnail_path ? (
                <img src={asset.thumbnail_path} alt={asset.title || ""} className={list ? "h-28 w-36 bg-black object-cover" : "aspect-[4/3] w-full bg-black object-cover"} loading="lazy" />
            ) : (
                <video src={`${asset.preview_path}#t=0.1`} className={list ? "h-28 w-36 bg-black object-cover" : "aspect-[4/3] w-full bg-black object-cover"} preload="metadata" muted playsInline />
            )
        ) : (
            <div
                className={
                    list
                        ? "flex h-28 w-36 items-center justify-center bg-stone-100 p-3 text-center text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-300"
                        : "flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300"
                }
            >
                {asset.content || typeLabel}
            </div>
        );
    const actions = trash ? (
        <CreativeCardActionBar
            primary={
                <Button size="small" type="primary" icon={<RotateCcw className="size-3.5" />} onClick={onRestore}>
                    恢复
                </Button>
            }
        />
    ) : (
        <CreativeCardActionBar
            primary={
                <>
                    {canContinueImage ? (
                        <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("image")}>
                            用于生图
                        </Button>
                    ) : null}
                    {canContinueVideo ? (
                        <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("video")}>
                            用于视频
                        </Button>
                    ) : null}
                    {canContinueCharacter ? (
                        <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("character")}>
                            用于角色
                        </Button>
                    ) : null}
                    {canContinueFilm ? (
                        <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => onContinue("film")}>
                            用于影视
                        </Button>
                    ) : null}
                </>
            }
            secondary={
                <>
                    <Button size="small" icon={<Heart className="size-3.5" fill={asset.favorite ? "currentColor" : "none"} />} onClick={onFavorite}>
                        {asset.favorite ? "已收藏" : "收藏"}
                    </Button>
                    <Button size="small" icon={<PencilLine className="size-3.5" />} onClick={onEdit}>
                        编辑
                    </Button>
                    {asset.type === "TEXT" ? (
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopy}>
                            复制
                        </Button>
                    ) : asset.preview_path ? (
                        <Button size="small" icon={<Download className="size-3.5" />} onClick={onDownload}>
                            下载
                        </Button>
                    ) : null}
                </>
            }
            destructive={
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
                    删除
                </Button>
            }
        />
    );

    if (list) {
        return (
            <Card hoverable className="overflow-hidden" styles={{ body: { padding: 0 } }}>
                <div className="flex min-w-0 flex-col sm:flex-row">
                    <button type="button" className="shrink-0 overflow-hidden text-left" onClick={onOpen}>
                        {preview}
                    </button>
                    <div className="min-w-0 flex-1 p-4">
                        <button type="button" className="block w-full text-left" onClick={onOpen}>
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="truncate text-sm font-semibold">{asset.title || "未命名素材"}</h2>
                                <Tag className="m-0 shrink-0">{typeLabel}</Tag>
                            </div>
                            <Typography.Paragraph type="secondary" ellipsis={{ rows: 1 }} className="!mb-0 !mt-2 !text-xs">
                                {asset.notes || asset.content || `${formatBytes(asset.size_bytes || 0)} · ${asset.mime_type || "未知格式"}`}
                            </Typography.Paragraph>
                            <div className="mt-2 text-xs text-stone-500">
                                {asset.source_module || "未知来源"}
                                {asset.model ? ` · ${asset.model}` : ""}
                                {asset.project_id ? ` · ${asset.project_id}` : ""}
                                {asset.folder_id ? ` · ${asset.folder_id}` : ""}
                            </div>
                        </button>
                        <div className="mt-3">{actions}</div>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card
            hoverable
            className="overflow-hidden"
            styles={{ body: { padding: 0 } }}
            cover={
                <button type="button" className="block w-full text-left" onClick={onOpen}>
                    {preview}
                </button>
            }
        >
            <button type="button" className="block w-full text-left p-4" onClick={onOpen}>
                <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-1 text-sm font-semibold">{asset.title || "未命名素材"}</h2>
                    <Tag className="m-0 shrink-0">{typeLabel}</Tag>
                </div>
                <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} className="!mb-0 !mt-2 !text-xs">
                    {asset.notes || asset.content || `${formatBytes(asset.size_bytes || 0)} · ${asset.mime_type || "未知格式"}`}
                </Typography.Paragraph>
                <div className="mt-3 flex flex-wrap gap-1">
                    {(asset.tags || []).slice(0, 3).map((tag) => (
                        <Tag key={tag} className="m-0 text-[11px]">
                            {tag}
                        </Tag>
                    ))}
                </div>
            </button>
            <div className="px-4 pb-4">{actions}</div>
        </Card>
    );
}

function AssetDrawer({ asset, onClose, onCopy, onDownload, onContinue, trash }: { asset?: CreativeAsset; onClose: () => void; onCopy: () => void; onDownload: () => void; onContinue: (target: ContinueTarget) => void; trash: boolean }) {
    const canContinueImage = asset ? ["TEXT", "IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type) : false;
    const canContinueVideo = asset ? ["TEXT", "IMAGE", "VIDEO", "AUDIO", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type) : false;
    const canContinueCharacter = asset?.type === "TEXT";
    const canContinueFilm = asset?.type === "VIDEO";
    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {["IMAGE", "CHARACTER", "KEYFRAME"].includes(asset.type) && asset.preview_path ? <Image src={asset.preview_path} alt={asset.title || ""} className="rounded-lg" /> : null}
                    {asset.type === "VIDEO" && asset.preview_path ? <video src={asset.preview_path} controls className="aspect-video w-full rounded-lg bg-black" /> : null}
                    {asset.type === "AUDIO" && asset.preview_path ? <audio src={asset.preview_path} controls className="w-full" /> : null}
                    <div>
                        <Typography.Title level={4} className="!mb-2">
                            {asset.title || "未命名素材"}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                            ))}
                        </Space>
                    </div>
                    {asset.content ? <Typography.Paragraph className="whitespace-pre-wrap">{asset.content}</Typography.Paragraph> : null}
                    <div className="grid gap-2 rounded-lg bg-stone-50 p-4 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                        <span>来源：{asset.source_module || "未知来源"}</span>
                        <span>
                            格式：{asset.mime_type || asset.type} · {formatBytes(asset.size_bytes || 0)}
                        </span>
                        {asset.model ? <span>模型：{asset.model}</span> : null}
                        {asset.project_id ? <span>项目：{asset.project_id}</span> : null}
                        {asset.folder_id ? <span>文件夹：{asset.folder_id}</span> : null}
                        {asset.job_id ? <span>任务：{asset.job_id}</span> : null}
                        {asset.width || asset.height ? (
                            <span>
                                尺寸：{asset.width || "?"} × {asset.height || "?"}
                            </span>
                        ) : null}
                        {asset.duration ? <span>时长：{asset.duration.toFixed(1)} 秒</span> : null}
                        <span>创建时间：{new Date(asset.created_at * 1000).toLocaleString()}</span>
                    </div>
                    {asset.notes ? <Typography.Paragraph>{asset.notes}</Typography.Paragraph> : null}
                    {!trash ? (
                        <Space wrap>
                            {asset.type === "TEXT" ? (
                                <Button type="primary" icon={<Copy className="size-4" />} onClick={onCopy}>
                                    复制文本
                                </Button>
                            ) : asset.preview_path ? (
                                <Button type="primary" icon={<Download className="size-4" />} onClick={onDownload}>
                                    下载素材
                                </Button>
                            ) : null}
                            {canContinueImage ? (
                                <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("image")}>
                                    用于生图
                                </Button>
                            ) : null}
                            {canContinueVideo ? (
                                <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("video")}>
                                    用于视频
                                </Button>
                            ) : null}
                            {canContinueCharacter ? (
                                <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("character")}>
                                    用于角色
                                </Button>
                            ) : null}
                            {canContinueFilm ? (
                                <Button icon={<Sparkles className="size-4" />} onClick={() => onContinue("film")}>
                                    用于影视
                                </Button>
                            ) : null}
                        </Space>
                    ) : (
                        <Typography.Text type="secondary">此素材位于回收站，恢复后可继续使用。</Typography.Text>
                    )}
                </div>
            ) : null}
        </Drawer>
    );
}
