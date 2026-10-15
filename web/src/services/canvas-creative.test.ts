import { afterEach, describe, expect, test } from "bun:test";

import { creativeVideoJobIdAfterError, CreativeVideoJobTerminalError, requestCreativeVideoGeneration } from "./canvas-creative";
import { defaultConfig } from "@/stores/use-config-store";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("canvas video failed-job retry", () => {
    test("clears a confirmed failed job so the first retry creates a fresh job", async () => {
        let created = 0;
        const polled: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/estimates")) return Response.json({ data: { available: true, normalized_parameters: {} } });
            if (url.endsWith("/jobs") && init?.method === "POST") return Response.json({ data: { job_id: `job-${++created}` } });
            if (url.includes("/jobs/")) {
                polled.push(url);
                return Response.json({ data: { status: created === 1 ? "FAILED" : "SUCCEEDED", result_asset_ids: created === 1 ? [] : ["video"], error: created === 1 ? "provider failed" : undefined } });
            }
            if (url.endsWith("/assets/video")) return Response.json({ data: { asset_id: "video", preview_path: "/api/creative/assets/video/content" } });
            throw new Error(`Unexpected request ${url}`);
        }) as typeof fetch;
        const config = { ...defaultConfig, videoModel: "video-model", model: "video-model" };
        let activeJobId: string | undefined;
        try {
            await requestCreativeVideoGeneration(config, "video", [], [], [], { onJobId: (id) => { activeJobId = id; } });
            throw new Error("Expected failed job");
        } catch (error) {
            expect(error).toBeInstanceOf(CreativeVideoJobTerminalError);
            activeJobId = creativeVideoJobIdAfterError(activeJobId, error);
        }
        expect(activeJobId).toBeUndefined();
        await expect(requestCreativeVideoGeneration(config, "retry")).resolves.toMatchObject({ assetId: "video" });
        expect(created).toBe(2);
        expect(polled).toEqual(["/api/creative/jobs/job-1", "/api/creative/jobs/job-2"]);
    });

    test("retains an existing job on transient or asset-fetch errors", () => {
        expect(creativeVideoJobIdAfterError("job-1", new Error("network disconnected"))).toBe("job-1");
        expect(creativeVideoJobIdAfterError("job-2", new CreativeVideoJobTerminalError("job-1", "old task failed"))).toBe("job-2");
    });
});
