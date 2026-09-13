import { describe, expect, test } from "bun:test";

import { CREATIVE_JOB_HISTORY_STALE_TIME } from "@/services/creative-job-history";
import { creativeJobHistoryQueryOptions } from "./use-creative-job-history";

describe("useCreativeJobHistory contract", () => {
    test("uses a stable key, first page and bounded stale window", () => {
        const options = creativeJobHistoryQueryOptions({ capability: "video_generation", pageSize: 16, enabled: false });

        expect(options.queryKey).toEqual(["creative-job-history", "video_generation", 16]);
        expect(options.initialPageParam).toBe(1);
        expect(options.staleTime).toBe(CREATIVE_JOB_HISTORY_STALE_TIME);
        expect(options.enabled).toBe(false);
    });
});
