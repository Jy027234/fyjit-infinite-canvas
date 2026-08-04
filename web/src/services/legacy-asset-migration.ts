import localforage from "localforage";

import { uploadCreativeAsset } from "@/services/api/creative";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";

type LegacyRecord = Record<string, unknown> & { id?: string };

export type LegacyAssetCandidate = {
    domain: "image" | "video";
    logId: string;
    itemId: string;
    title: string;
    storageKey?: string;
    sourceUrl?: string;
};

export type LegacyAssetMigrationReport = {
    status: "complete" | "partial";
    attempted: number;
    imported: number;
    unavailable: number;
    updatedAt: number;
};

const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const migrationStore = localforage.createInstance({ name: "infinite-canvas", storeName: "fyjit_migrations" });
const retryAfterMs = 60 * 60 * 1000;

export async function migrateLegacyBrowserAssets(userId: number): Promise<LegacyAssetMigrationReport> {
    const markerKey = `creative-assets-v1:${userId}`;
    const previous = await migrationStore.getItem<LegacyAssetMigrationReport>(markerKey);
    if (previous?.status === "complete") return previous;
    if (previous && Date.now() - previous.updatedAt < retryAfterMs) return previous;

    const [imageLogs, videoLogs] = await Promise.all([readRecords(imageLogStore), readRecords(videoLogStore)]);
    const candidates = extractLegacyAssetCandidates(imageLogs, videoLogs);
    let imported = 0;
    let unavailable = 0;
    for (const candidate of candidates) {
        try {
            const blob = await resolveCandidateBlob(candidate);
            if (!blob || blob.size === 0 || !blob.type.startsWith(`${candidate.domain}/`)) {
                unavailable += 1;
                continue;
            }
            await uploadCreativeAsset(blob, candidate.title, undefined, await legacyImportKey(candidate));
            imported += 1;
        } catch {
            unavailable += 1;
        }
    }
    const report: LegacyAssetMigrationReport = {
        status: unavailable === 0 ? "complete" : "partial",
        attempted: candidates.length,
        imported,
        unavailable,
        updatedAt: Date.now(),
    };
    await migrationStore.setItem(markerKey, report);
    return report;
}

export function extractLegacyAssetCandidates(imageLogs: LegacyRecord[], videoLogs: LegacyRecord[]): LegacyAssetCandidate[] {
    const candidates: LegacyAssetCandidate[] = [];
    imageLogs.forEach((log, logIndex) => {
        const logId = stringValue(log.id) || `image-log-${logIndex}`;
        const title = stringValue(log.title) || "旧版生图记录";
        const images = Array.isArray(log.images) ? log.images : [];
        images.forEach((value, itemIndex) => {
            if (!isRecord(value)) return;
            candidates.push({
                domain: "image",
                logId,
                itemId: stringValue(value.id) || `image-${itemIndex}`,
                title: images.length > 1 ? `${title} ${itemIndex + 1}` : title,
                storageKey: stringValue(value.storageKey),
                sourceUrl: stringValue(value.dataUrl) || stringValue(value.url),
            });
        });
    });
    videoLogs.forEach((log, logIndex) => {
        if (!isRecord(log.video)) return;
        const logId = stringValue(log.id) || `video-log-${logIndex}`;
        const video = log.video;
        candidates.push({
            domain: "video",
            logId,
            itemId: stringValue(video.id) || "video-0",
            title: stringValue(log.title) || "旧版视频记录",
            storageKey: stringValue(video.storageKey),
            sourceUrl: stringValue(video.url) || stringValue(video.dataUrl),
        });
    });
    return candidates;
}

export async function legacyImportKey(candidate: LegacyAssetCandidate) {
    const source = new TextEncoder().encode(`legacy-browser-v1\0${candidate.domain}\0${candidate.logId}\0${candidate.itemId}`);
    const digest = await crypto.subtle.digest("SHA-256", source);
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `legacy-browser-v1:${candidate.domain}:${hex}`;
}

async function readRecords(store: LocalForage): Promise<LegacyRecord[]> {
    const records: LegacyRecord[] = [];
    await store.iterate((value) => {
        if (isRecord(value)) records.push(value);
    });
    return records;
}

async function resolveCandidateBlob(candidate: LegacyAssetCandidate): Promise<Blob | null> {
    if (candidate.storageKey) {
        const stored = candidate.domain === "image" ? await getImageBlob(candidate.storageKey) : await getMediaBlob(candidate.storageKey);
        if (stored) return stored;
    }
    if (!candidate.sourceUrl) return null;
    const response = await fetch(candidate.sourceUrl, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) return null;
    return response.blob();
}

function isRecord(value: unknown): value is LegacyRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
