import { describe, expect, test } from "bun:test";

import { creativeJobPendingSnapshot, summarizeCreativePendingResults } from "./creative-generation-status";

describe("creative generation status", () => {
    test("maps server queue and running progress into display snapshots", () => {
        expect(creativeJobPendingSnapshot("QUEUED", 0)).toEqual({ phase: "queued", progress: 0 });
        expect(creativeJobPendingSnapshot("RUNNING", 47.6)).toEqual({ phase: "running", progress: 48 });
        expect(creativeJobPendingSnapshot("RUNNING", 140)).toEqual({ phase: "running", progress: 100 });
    });

    test("derives one stable batch summary without storing duplicate page state", () => {
        expect(
            summarizeCreativePendingResults([
                { status: "pending", phase: "queued", progress: 10 },
                { status: "pending", phase: "running", progress: 50 },
                { status: "success", progress: 100 },
            ]),
        ).toEqual({ phase: "running", progress: 30 });
        expect(summarizeCreativePendingResults([{ status: "success", progress: 100 }])).toBeNull();
    });
});
