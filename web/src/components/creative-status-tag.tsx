import { Tag, type TagProps } from "antd";
import type { ReactNode } from "react";

import type { CreativeJob } from "@/services/api/creative";

export type CreativeHistoryStatus = "排队中" | "运行中" | "成功" | "部分成功" | "审核拒绝" | "失败" | "已取消" | "已超时";

const statusColors: Record<CreativeHistoryStatus, TagProps["color"]> = {
    排队中: "processing",
    运行中: "processing",
    成功: "success",
    部分成功: "warning",
    审核拒绝: "error",
    失败: "error",
    已取消: "default",
    已超时: "error",
};

export function creativeStatusColor(status: CreativeHistoryStatus) {
    return statusColors[status];
}

export function creativeJobStatusLabel(status: CreativeJob["status"]): CreativeHistoryStatus {
    switch (status) {
        case "CREATED":
        case "QUEUED":
            return "排队中";
        case "RUNNING":
            return "运行中";
        case "SUCCEEDED":
            return "成功";
        case "PARTIAL_SUCCESS":
            return "部分成功";
        case "MODERATION_REJECTED":
            return "审核拒绝";
        case "CANCELLED":
            return "已取消";
        case "EXPIRED":
            return "已超时";
        default:
            return "失败";
    }
}

export function CreativeStatusTag({ status, children }: { status: CreativeHistoryStatus; children?: ReactNode }) {
    return (
        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={creativeStatusColor(status)}>
            {children ?? status}
        </Tag>
    );
}
