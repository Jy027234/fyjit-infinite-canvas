import type { ReactNode } from "react";
import { Button, Tag } from "antd";
import { Plus } from "lucide-react";

import { FyjitTaskStatus } from "@/components/fyjit/creative-ui";

type CreativeHistoryItem = {
    id: string;
};

export function CreativeHistoryPanel<T extends CreativeHistoryItem>({
    items,
    activeItemId,
    disabled,
    total,
    initialLoading,
    loadingMore,
    error,
    onCreateSession,
    onSelectItem,
    onRetry,
    onLoadMore,
    renderCard,
}: {
    items: readonly T[];
    activeItemId?: string;
    disabled: boolean;
    total: number;
    initialLoading: boolean;
    loadingMore: boolean;
    error?: string;
    onCreateSession: () => void;
    onSelectItem: (item: T) => void;
    onRetry: () => void;
    onLoadMore: () => void;
    renderCard: (item: T, context: { active: boolean; disabled: boolean; onSelect: () => void }) => ReactNode;
}) {
    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">生成记录</h2>
                <Tag className="m-0" aria-label={`已加载 ${items.length} 条，共 ${total} 条`}>
                    {items.length}/{total}
                </Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} disabled={disabled} onClick={onCreateSession}>
                    新建
                </Button>
            </div>
            <div className="space-y-3">
                {error ? (
                    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
                        <div>{error}</div>
                        <Button className="mt-2" size="small" danger onClick={onRetry}>
                            重试加载
                        </Button>
                    </div>
                ) : null}
                {items.map((item) => renderCard(item, { active: activeItemId === item.id, disabled, onSelect: () => onSelectItem(item) }))}
                {initialLoading && !items.length && !error ? (
                    <FyjitTaskStatus tone="pending" title="正在读取生成记录" compact className="min-h-48" />
                ) : !items.length && !error ? (
                    <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">暂无生成记录</div>
                ) : null}
                {items.length < total ? (
                    <Button block size="small" loading={loadingMore} onClick={onLoadMore}>
                        加载更多
                    </Button>
                ) : null}
            </div>
        </>
    );
}
