import { describe, expect, test } from "bun:test";

import { creativeJobStatusLabel, creativeStatusColor } from "@/components/creative-status-tag";

describe("creative status tag", () => {
    test("maps task outcomes to Ant Design semantic colors", () => {
        expect(creativeStatusColor("排队中")).toBe("processing");
        expect(creativeStatusColor("运行中")).toBe("processing");
        expect(creativeStatusColor("成功")).toBe("success");
        expect(creativeStatusColor("部分成功")).toBe("warning");
        expect(creativeStatusColor("失败")).toBe("error");
        expect(creativeStatusColor("审核拒绝")).toBe("error");
        expect(creativeStatusColor("已超时")).toBe("error");
        expect(creativeStatusColor("已取消")).toBe("default");
    });

    test("normalizes API states into one shared display vocabulary", () => {
        expect(creativeJobStatusLabel("CREATED")).toBe("排队中");
        expect(creativeJobStatusLabel("QUEUED")).toBe("排队中");
        expect(creativeJobStatusLabel("RUNNING")).toBe("运行中");
        expect(creativeJobStatusLabel("SUCCEEDED")).toBe("成功");
        expect(creativeJobStatusLabel("PARTIAL_SUCCESS")).toBe("部分成功");
        expect(creativeJobStatusLabel("MODERATION_REJECTED")).toBe("审核拒绝");
        expect(creativeJobStatusLabel("CANCELLED")).toBe("已取消");
        expect(creativeJobStatusLabel("EXPIRED")).toBe("已超时");
        expect(creativeJobStatusLabel("FAILED")).toBe("失败");
    });
});
