import { describe, expect, test } from "bun:test";

import { extractLegacyAssetCandidates, legacyImportKey } from "./legacy-asset-migration";

describe("legacy browser asset migration", () => {
    test("extracts image and video records without mutating the old logs", () => {
        const imageLogs = [{ id: "log-image", title: "Portrait", images: [{ id: "a", storageKey: "image:one", dataUrl: "blob:one" }, { id: "b", dataUrl: "data:image/png;base64,AA==" }] }];
        const videoLogs = [{ id: "log-video", title: "Trailer", video: { id: "v", storageKey: "video:one", url: "blob:video" } }];
        const candidates = extractLegacyAssetCandidates(imageLogs, videoLogs);
        expect(candidates).toHaveLength(3);
        expect(candidates.map((candidate) => candidate.title)).toEqual(["Portrait 1", "Portrait 2", "Trailer"]);
        expect(imageLogs[0].images).toHaveLength(2);
    });

    test("builds stable, bounded server idempotency keys", async () => {
        const candidate = { domain: "image" as const, logId: "log-1", itemId: "image-1", title: "Legacy" };
        const first = await legacyImportKey(candidate);
        const second = await legacyImportKey(candidate);
        expect(first).toBe(second);
        expect(first.length).toBeLessThanOrEqual(160);
    });
});
