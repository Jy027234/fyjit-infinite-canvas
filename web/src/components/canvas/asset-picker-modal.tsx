import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";
import { Check, Search } from "lucide-react";

import { useCreativeAssetList } from "@/hooks/use-creative-asset-list";
import { cn } from "@/lib/utils";
import type { CreativeAsset } from "@/services/api/creative";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string; assetId?: string }
    | { kind: "image"; dataUrl: string; thumbnailUrl?: string; title: string; storageKey?: string; assetId?: string }
    | { kind: "video"; url: string; posterUrl?: string; title: string; mimeType?: string; storageKey?: string; width?: number; height?: number; assetId?: string }
    | { kind: "audio"; url: string; title: string; mimeType?: string; storageKey?: string; durationMs?: number; assetId?: string };

type Props = {
    open: boolean;
    defaultTab?: string;
    acceptedTypes?: CreativeAsset["type"][];
    compatibilityHint?: string;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

const PAGE_SIZE = 12;
const kindOptions = [
    { label: "全部", value: "" },
    { label: "文本", value: "TEXT" },
    { label: "图片", value: "IMAGE" },
    { label: "视频", value: "VIDEO" },
    { label: "音频", value: "AUDIO" },
    { label: "角色", value: "CHARACTER" },
];

export function AssetPickerModal({ open, acceptedTypes, compatibilityHint, onInsert, onClose }: Props) {
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("");
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState<string>();
    const wasOpenRef = useRef(open);
    const assetList = useCreativeAssetList({ page, pageSize: PAGE_SIZE, type: kindFilter, search: keyword, enabled: open, debounceMs: 200 });
    const queryTransitioning = assetList.isFetching && assetList.isPlaceholderData;

    const accepted = new Set(acceptedTypes || []);
    const selected = queryTransitioning ? undefined : assetList.items.find((asset) => asset.asset_id === selectedId);

    useEffect(() => {
        if (!open) setSelectedId(undefined);
    }, [open]);

    useEffect(() => {
        if (wasOpenRef.current && !open) void assetList.cancelCurrent();
        wasOpenRef.current = open;
    }, [assetList.cancelCurrent, open]);

    useEffect(() => {
        setSelectedId(undefined);
    }, [assetList.filters]);

    const handleInsert = (asset: CreativeAsset) => {
        const title = asset.title || "未命名素材";
        if (asset.type === "TEXT") onInsert({ kind: "text", content: asset.content || "", title, assetId: asset.asset_id });
        else if (asset.type === "VIDEO")
            onInsert({ kind: "video", url: asset.preview_path || assetContentUrl(asset.asset_id), posterUrl: asset.thumbnail_path, title, mimeType: asset.mime_type, width: asset.width, height: asset.height, assetId: asset.asset_id });
        else if (asset.type === "AUDIO")
            onInsert({ kind: "audio", url: asset.preview_path || assetContentUrl(asset.asset_id), title, mimeType: asset.mime_type, durationMs: typeof asset.duration === "number" ? asset.duration * 1000 : undefined, assetId: asset.asset_id });
        else onInsert({ kind: "image", dataUrl: asset.preview_path || assetContentUrl(asset.asset_id), thumbnailUrl: asset.thumbnail_path, title, assetId: asset.asset_id });
    };

    return (
        <Modal
            title="选择 FYJIT 素材"
            open={open}
            onCancel={onClose}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    取消
                </Button>,
                <Button key="insert" type="primary" disabled={!selected || (accepted.size > 0 && !accepted.has(selected.type))} onClick={() => selected && handleInsert(selected)}>
                    插入所选素材
                </Button>,
            ]}
            width={900}
            destroyOnHidden
            styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}
        >
            <div className="space-y-4" aria-busy={assetList.isFetching}>
                {compatibilityHint ? <Alert type="info" showIcon message={compatibilityHint} /> : null}
                {assetList.error ? (
                    <Alert
                        type="error"
                        showIcon
                        message={assetList.error instanceof Error ? assetList.error.message : "素材读取失败"}
                        action={
                            <Button size="small" onClick={() => void assetList.refetch()} loading={assetList.isFetching}>
                                重试加载
                            </Button>
                        }
                    />
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                    <Input
                        className="w-64"
                        size="small"
                        prefix={<Search className="size-3.5 text-stone-400" />}
                        placeholder="搜索跨设备素材"
                        value={keyword}
                        allowClear
                        onChange={(event) => {
                            setPage(1);
                            setKeyword(event.target.value);
                        }}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {kindOptions.map((option) => (
                            <Tag.CheckableTag
                                key={option.value}
                                checked={kindFilter === option.value}
                                className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")}
                                onChange={() => {
                                    setPage(1);
                                    setKindFilter(option.value);
                                }}
                            >
                                {option.label}
                            </Tag.CheckableTag>
                        ))}
                    </div>
                </div>
                {assetList.isLoading ? (
                    <div className="grid min-h-72 place-items-center">
                        <Spin />
                    </div>
                ) : assetList.items.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {assetList.items.map((asset) => (
                            <PickerCard
                                key={asset.asset_id}
                                asset={asset}
                                selected={selectedId === asset.asset_id}
                                disabled={queryTransitioning || (accepted.size > 0 && !accepted.has(asset.type))}
                                disabledReason={queryTransitioning ? "正在更新结果" : "当前模型不支持此素材类型"}
                                onClick={() => setSelectedId(asset.asset_id)}
                            />
                        ))}
                    </div>
                ) : !assetList.error ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有素材" className="py-12" />
                ) : null}
                {assetList.total > PAGE_SIZE ? (
                    <div className="flex justify-center">
                        <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={assetList.total} onChange={setPage} showSizeChanger={false} />
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}

function PickerCard({ asset, selected, disabled, disabledReason, onClick }: { asset: CreativeAsset; selected: boolean; disabled: boolean; disabledReason: string; onClick: () => void }) {
    const title = asset.title || "未命名素材";
    const image = ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type) ? asset.thumbnail_path || asset.preview_path : undefined;
    const label = asset.type === "TEXT" ? "文本" : asset.type === "VIDEO" ? "视频" : asset.type === "AUDIO" ? "音频" : asset.type === "CHARACTER" ? "角色" : "图片";
    return (
        <button
            type="button"
            className={cn(
                "group relative overflow-hidden rounded-lg border bg-white text-left transition dark:bg-stone-900",
                selected ? "border-violet-500 ring-2 ring-violet-500/25" : "border-stone-200 hover:border-stone-400 hover:shadow-md dark:border-stone-700",
                disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
            )}
            disabled={disabled}
            onClick={onClick}
        >
            {image ? (
                <img src={image} alt={title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">{asset.content || title}</div>
            )}
            <div className="flex items-center justify-between gap-2 p-2.5">
                <span className="line-clamp-1 text-xs font-medium">{title}</span>
                <Tag className="m-0 shrink-0 text-[10px]">{label}</Tag>
            </div>
            {selected ? (
                <span className="pointer-events-none absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-violet-600 text-white">
                    <Check className="size-4" />
                </span>
            ) : null}
            {disabled ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/60 px-3 text-center text-xs font-medium text-white">{disabledReason}</div> : null}
        </button>
    );
}

function assetContentUrl(assetId: string) {
    return `/api/creative/assets/${encodeURIComponent(assetId)}/content`;
}
