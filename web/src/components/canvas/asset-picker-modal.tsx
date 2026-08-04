import { useEffect, useState } from "react";
import { App, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchCreativeAssets, type CreativeAsset } from "@/services/api/creative";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string; assetId?: string }
    | { kind: "image"; dataUrl: string; thumbnailUrl?: string; title: string; storageKey?: string; assetId?: string }
    | { kind: "video"; url: string; posterUrl?: string; title: string; storageKey?: string; width?: number; height?: number; assetId?: string };

type Props = {
    open: boolean;
    defaultTab?: string;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

const PAGE_SIZE = 12;
const kindOptions = [
    { label: "全部", value: "" },
    { label: "文本", value: "TEXT" },
    { label: "图片", value: "IMAGE" },
    { label: "视频", value: "VIDEO" },
    { label: "角色", value: "CHARACTER" },
];

export function AssetPickerModal({ open, onInsert, onClose }: Props) {
    const { message } = App.useApp();
    const [items, setItems] = useState<CreativeAsset[]>([]);
    const [total, setTotal] = useState(0);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            void fetchCreativeAssets({ page, pageSize: PAGE_SIZE, type: kindFilter || undefined, search: keyword.trim() || undefined, signal: controller.signal })
                .then((result) => {
                    setItems(result.items || []);
                    setTotal(result.total || 0);
                })
                .catch((error) => {
                    if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "素材读取失败");
                })
                .finally(() => {
                    if (!controller.signal.aborted) setLoading(false);
                });
        }, 200);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [kindFilter, keyword, message, open, page]);

    const handleInsert = (asset: CreativeAsset) => {
        const title = asset.title || "未命名素材";
        if (asset.type === "TEXT") onInsert({ kind: "text", content: asset.content || "", title, assetId: asset.asset_id });
        else if (asset.type === "VIDEO") onInsert({ kind: "video", url: asset.preview_path || assetContentUrl(asset.asset_id), posterUrl: asset.thumbnail_path, title, width: asset.width, height: asset.height, assetId: asset.asset_id });
        else onInsert({ kind: "image", dataUrl: asset.preview_path || assetContentUrl(asset.asset_id), thumbnailUrl: asset.thumbnail_path, title, assetId: asset.asset_id });
    };

    return (
        <Modal title="选择 FYJIT 素材" open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}>
            <div className="space-y-4">
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
                {loading ? (
                    <div className="grid min-h-72 place-items-center">
                        <Spin />
                    </div>
                ) : items.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {items.map((asset) => (
                            <PickerCard key={asset.asset_id} asset={asset} onClick={() => handleInsert(asset)} />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有素材" className="py-12" />
                )}
                {total > PAGE_SIZE ? (
                    <div className="flex justify-center">
                        <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} />
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}

function PickerCard({ asset, onClick }: { asset: CreativeAsset; onClick: () => void }) {
    const title = asset.title || "未命名素材";
    const image = ["IMAGE", "CHARACTER", "KEYFRAME", "REFERENCE"].includes(asset.type) ? asset.thumbnail_path || asset.preview_path : undefined;
    const label = asset.type === "TEXT" ? "文本" : asset.type === "VIDEO" ? "视频" : asset.type === "CHARACTER" ? "角色" : "图片";
    return (
        <button type="button" className="group relative cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900" onClick={onClick}>
            {image ? (
                <img src={image} alt={title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">{asset.content || title}</div>
            )}
            <div className="flex items-center justify-between gap-2 p-2.5">
                <span className="line-clamp-1 text-xs font-medium">{title}</span>
                <Tag className="m-0 shrink-0 text-[10px]">{label}</Tag>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/55 group-hover:opacity-100">插入</div>
        </button>
    );
}

function assetContentUrl(assetId: string) {
    return `/api/creative/assets/${encodeURIComponent(assetId)}/content`;
}
