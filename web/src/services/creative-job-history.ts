import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { fetchCreativeJobs, type CreativeAsset, type CreativeAssetSummary, type CreativeJob, type CreativeJobPage } from "@/services/api/creative";
import type { CreativeCapability } from "@/services/api/generated/creative-contract";

export const CREATIVE_JOB_HISTORY_QUERY_ROOT = ["creative-job-history"] as const;
export const CREATIVE_JOB_HISTORY_DEFAULT_PAGE_SIZE = 20;
export const CREATIVE_JOB_HISTORY_STALE_TIME = 15_000;

type InFlightHistoryRequest = {
    key: string;
    controller: AbortController;
    promise: Promise<CreativeJobPage>;
    subscribers: Set<symbol>;
    abortTimer?: ReturnType<typeof setTimeout>;
    abortReason?: unknown;
    settled: boolean;
};

const inFlightHistoryRequests = new Map<string, InFlightHistoryRequest>();

export type CreativeJobHistoryQueryParams = {
    capability: CreativeCapability;
    pageSize: number;
};

export type CreativeJobHistoryQueryKey = readonly ["creative-job-history", CreativeCapability, number];
export type CreativeJobHistoryData = InfiniteData<CreativeJobPage, number>;
export type CreativeJobHistoryUpdater = CreativeJob | ((job: CreativeJob) => CreativeJob);
export type CreativeJobHistoryCachePatch = {
    job?: CreativeJob;
    assets?: readonly CreativeAssetSummary[];
    insertIfMissing?: boolean;
};

export type CreativeJobHistoryCacheUpdateResult = {
    jobUpdated: boolean;
    jobInserted: boolean;
    assetsUpdated: number;
};

export function creativeJobHistoryQueryKey({ capability, pageSize }: CreativeJobHistoryQueryParams): CreativeJobHistoryQueryKey {
    return [...CREATIVE_JOB_HISTORY_QUERY_ROOT, capability, pageSize];
}

export function creativeJobHistoryQueryScope(options?: Partial<CreativeJobHistoryQueryParams>) {
    if (!options?.capability) return CREATIVE_JOB_HISTORY_QUERY_ROOT;
    if (options.pageSize === undefined) return [...CREATIVE_JOB_HISTORY_QUERY_ROOT, options.capability] as const;
    return creativeJobHistoryQueryKey({ capability: options.capability, pageSize: options.pageSize });
}

export function fetchCreativeJobHistoryPage({ capability, page, pageSize, signal }: { capability: CreativeCapability; page: number; pageSize: number; signal?: AbortSignal }) {
    if (signal?.aborted) return Promise.reject(getAbortReason(signal));

    const key = JSON.stringify([capability, page, pageSize]);
    let request = inFlightHistoryRequests.get(key);
    if (!request || request.controller.signal.aborted || request.settled) {
        const controller = new AbortController();
        const nextRequest: InFlightHistoryRequest = {
            key,
            controller,
            promise: undefined as unknown as Promise<CreativeJobPage>,
            subscribers: new Set(),
            settled: false,
        };
        inFlightHistoryRequests.set(key, nextRequest);
        nextRequest.promise = fetchCreativeJobs({ capability, page, pageSize, includeAssets: "summary", signal: controller.signal }).then(
            (value) => {
                settleHistoryRequest(nextRequest);
                return value;
            },
            (error) => {
                settleHistoryRequest(nextRequest);
                throw error;
            },
        );
        request = nextRequest;
    }

    return subscribeToHistoryRequest(request, signal);
}

function subscribeToHistoryRequest(request: InFlightHistoryRequest, signal?: AbortSignal) {
    const token = Symbol("creative-job-history-subscriber");
    request.subscribers.add(token);
    if (request.abortTimer !== undefined) {
        clearTimeout(request.abortTimer);
        request.abortTimer = undefined;
    }

    let completed = false;
    let released = false;
    const release = (reason?: unknown) => {
        if (released) return;
        released = true;
        request.subscribers.delete(token);
        if (reason !== undefined) request.abortReason = reason;
        if (!request.settled && request.subscribers.size === 0) scheduleHistoryRequestAbort(request);
    };
    const detachAbortListener = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
        if (completed) return;
        completed = true;
        detachAbortListener();
        const reason = getAbortReason(signal);
        release(reason);
        // The caller that lost its subscription must observe cancellation even
        // when another StrictMode remount reuses the shared underlying request.
        rejectPromise(reason);
    };

    let resolvePromise!: (value: CreativeJobPage) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const result = new Promise<CreativeJobPage>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
            return result;
        }
    }

    request.promise.then(
        (value) => {
            if (completed) return;
            completed = true;
            detachAbortListener();
            release();
            resolvePromise(value);
        },
        (error) => {
            if (completed) return;
            completed = true;
            detachAbortListener();
            release();
            rejectPromise(error);
        },
    );

    return result;
}

function settleHistoryRequest(request: InFlightHistoryRequest) {
    request.settled = true;
    if (request.abortTimer !== undefined) {
        clearTimeout(request.abortTimer);
        request.abortTimer = undefined;
    }
    if (inFlightHistoryRequests.get(request.key) === request) inFlightHistoryRequests.delete(request.key);
}

function scheduleHistoryRequestAbort(request: InFlightHistoryRequest) {
    if (request.abortTimer !== undefined || request.settled) return;
    request.abortTimer = setTimeout(() => {
        request.abortTimer = undefined;
        if (request.settled || request.subscribers.size > 0) return;
        if (inFlightHistoryRequests.get(request.key) === request) inFlightHistoryRequests.delete(request.key);
        request.controller.abort(request.abortReason || new DOMException("The operation was aborted", "AbortError"));
    }, 0);
}

function getAbortReason(signal?: AbortSignal) {
    return signal?.reason || new DOMException("The operation was aborted", "AbortError");
}

export function getNextCreativeJobHistoryPage(lastPage: CreativeJobPage, pages: readonly CreativeJobPage[], pageSize: number) {
    const currentPage = lastPage.page || pages.length;
    const currentPageSize = lastPage.page_size || pageSize;
    return currentPage * currentPageSize < lastPage.total ? currentPage + 1 : undefined;
}

export function flattenCreativeJobHistory(pages: readonly CreativeJobPage[] | undefined) {
    const items: CreativeJob[] = [];
    const assets: CreativeAssetSummary[] = [];
    const jobIds = new Set<string>();
    const assetIds = new Set<string>();

    for (const page of pages || []) {
        for (const job of page.items || []) {
            const jobKey = job.job_id || String(job.id);
            if (jobIds.has(jobKey)) continue;
            jobIds.add(jobKey);
            items.push(job);
        }
        for (const asset of page.assets || []) {
            if (assetIds.has(asset.asset_id)) continue;
            assetIds.add(asset.asset_id);
            assets.push(asset);
        }
    }

    return { items, assets };
}

/**
 * Convert a detail response into the summary shape embedded in the history
 * response. Existing summaries win for fields the detail endpoint does not
 * expose (notably moderation state).
 */
export function creativeAssetSummaryFromDetail(asset: CreativeAsset, previous?: CreativeAssetSummary): CreativeAssetSummary {
    const detail = asset as CreativeAsset & { review_status?: string };
    return {
        asset_id: asset.asset_id,
        type: asset.type,
        title: asset.title ?? previous?.title,
        status: asset.status,
        review_status: detail.review_status || previous?.review_status || "APPROVED",
        preview_path: asset.preview_path ?? previous?.preview_path,
        thumbnail_path: asset.thumbnail_path ?? previous?.thumbnail_path,
        mime_type: asset.mime_type ?? previous?.mime_type,
        size_bytes: asset.size_bytes ?? previous?.size_bytes,
        width: asset.width ?? previous?.width,
        height: asset.height ?? previous?.height,
        duration: asset.duration ?? previous?.duration,
    };
}

/**
 * Apply a terminal job response and any freshly loaded asset summaries to the
 * currently cached history. This deliberately updates only matching records.
 * A newly-created job is inserted only into an untouched first page; shifting
 * already loaded later pages would make their pagination boundary ambiguous.
 */
export function updateCreativeJobHistoryCache(queryClient: QueryClient, params: CreativeJobHistoryQueryParams, patch: CreativeJobHistoryCachePatch): CreativeJobHistoryCacheUpdateResult {
    const result: CreativeJobHistoryCacheUpdateResult = { jobUpdated: false, jobInserted: false, assetsUpdated: 0 };
    if (!patch.job && !patch.assets?.length) return result;

    queryClient.setQueryData<CreativeJobHistoryData>(creativeJobHistoryQueryKey(params), (data) => {
        const next = patchCreativeJobHistoryData(data, params, patch, result);
        return next;
    });
    return result;
}

export function updateCreativeJobHistory(queryClient: QueryClient, params: CreativeJobHistoryQueryParams, jobId: string, updater: CreativeJobHistoryUpdater) {
    return queryClient.setQueryData<CreativeJobHistoryData>(creativeJobHistoryQueryKey(params), (data) => {
        if (!data) return data;
        let changed = false;
        const pages = data.pages.map((page) => {
            let pageChanged = false;
            const items = page.items.map((job) => {
                if (job.job_id !== jobId && String(job.id) !== jobId) return job;
                const next = typeof updater === "function" ? updater(job) : updater;
                if (next === job) return job;
                changed = true;
                pageChanged = true;
                return next;
            });
            return pageChanged ? { ...page, items } : page;
        });
        return changed ? { ...data, pages } : data;
    });
}

function patchCreativeJobHistoryData(data: CreativeJobHistoryData | undefined, params: CreativeJobHistoryQueryParams, patch: CreativeJobHistoryCachePatch, result: CreativeJobHistoryCacheUpdateResult) {
    if (!data) return data;

    const jobId = patch.job ? patch.job.job_id : undefined;
    const nextJob = patch.job;
    let matchingPageIndex = -1;
    let matchingItemCount = 0;
    const cachedAssetIds = new Set(data.pages.flatMap((page) => (page.assets || []).map((asset) => asset.asset_id)));
    const pages = data.pages.map((page, pageIndex) => {
        let pageChanged = false;
        let items = page.items;
        if (nextJob) {
            items = page.items.map((current) => {
                if (!jobIdsMatch(current, jobId!)) return current;
                matchingPageIndex = matchingPageIndex === -1 ? pageIndex : matchingPageIndex;
                matchingItemCount += 1;
                result.jobUpdated = true;
                if (current === nextJob) return current;
                pageChanged = true;
                return nextJob;
            });
        }

        let assets = page.assets;
        if (patch.assets?.length) {
            const summaryById = new Map(patch.assets.map((asset) => [asset.asset_id, asset]));
            const currentAssets = page.assets || [];
            const nextAssets = currentAssets.map((current) => {
                const summary = summaryById.get(current.asset_id);
                if (!summary) return current;
                const next = mergeCreativeAssetSummary(current, summary);
                if (next !== current) {
                    pageChanged = true;
                    result.assetsUpdated += 1;
                }
                return next;
            });
            assets = nextAssets;
            if (matchingPageIndex === pageIndex) {
                const missing = dedupeCreativeAssetSummaries(patch.assets).filter((asset) => !cachedAssetIds.has(asset.asset_id));
                if (missing.length) {
                    assets = [...nextAssets, ...missing];
                    pageChanged = true;
                    result.assetsUpdated += missing.length;
                    for (const asset of missing) cachedAssetIds.add(asset.asset_id);
                }
            }
        }

        if (!pageChanged) return page;
        return { ...page, items, assets };
    });

    if (nextJob && matchingItemCount === 0 && patch.insertIfMissing && data.pages.length === 1) {
        const firstPage = data.pages[0];
        if (firstPage.page === 1 && nextJob.capability === params.capability) {
            const pageSize = firstPage.page_size || params.pageSize;
            const items = [nextJob, ...firstPage.items].sort(compareCreativeJobs).slice(0, pageSize);
            const assets = patch.assets?.length ? mergeCreativeAssetSummaryList(firstPage.assets || [], patch.assets) : firstPage.assets;
            const nextFirstPage = {
                ...firstPage,
                items,
                assets,
                total: firstPage.total + 1,
            };
            const nextPages = [nextFirstPage];
            result.jobInserted = true;
            if (patch.assets?.length) result.assetsUpdated += Math.max(0, (assets || []).length - (firstPage.assets || []).length);
            return { ...data, pages: nextPages };
        }
    }

    return pages.every((page, index) => page === data.pages[index]) ? data : { ...data, pages };
}

function jobIdsMatch(current: CreativeJob, jobId: string) {
    return current.job_id === jobId || String(current.id) === jobId;
}

function compareCreativeJobs(left: CreativeJob, right: CreativeJob) {
    return right.created_at - left.created_at || right.updated_at - left.updated_at || String(right.id).localeCompare(String(left.id));
}

function mergeCreativeAssetSummary(current: CreativeAssetSummary, next: CreativeAssetSummary) {
    const merged: CreativeAssetSummary = {
        ...current,
        ...next,
        title: next.title ?? current.title,
        preview_path: next.preview_path ?? current.preview_path,
        thumbnail_path: next.thumbnail_path ?? current.thumbnail_path,
        mime_type: next.mime_type ?? current.mime_type,
        size_bytes: next.size_bytes ?? current.size_bytes,
        width: next.width ?? current.width,
        height: next.height ?? current.height,
        duration: next.duration ?? current.duration,
    };
    return Object.keys(merged).some((key) => merged[key as keyof CreativeAssetSummary] !== current[key as keyof CreativeAssetSummary]) ? merged : current;
}

function dedupeCreativeAssetSummaries(assets: readonly CreativeAssetSummary[]) {
    const seen = new Set<string>();
    return assets.filter((asset) => {
        if (seen.has(asset.asset_id)) return false;
        seen.add(asset.asset_id);
        return true;
    });
}

function mergeCreativeAssetSummaryList(current: readonly CreativeAssetSummary[], incoming: readonly CreativeAssetSummary[]) {
    const result = [...current];
    const indexById = new Map(result.map((asset, index) => [asset.asset_id, index]));
    for (const asset of dedupeCreativeAssetSummaries(incoming)) {
        const index = indexById.get(asset.asset_id);
        if (index === undefined) {
            indexById.set(asset.asset_id, result.length);
            result.push(asset);
        } else {
            result[index] = mergeCreativeAssetSummary(result[index], asset);
        }
    }
    return result;
}

export function invalidateCreativeJobHistory(queryClient: QueryClient, options?: Partial<CreativeJobHistoryQueryParams>) {
    return queryClient.invalidateQueries({ queryKey: creativeJobHistoryQueryScope(options) });
}
