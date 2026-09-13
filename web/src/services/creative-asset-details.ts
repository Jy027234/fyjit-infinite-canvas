import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";

import { fetchCreativeAsset, type CreativeAsset } from "@/services/api/creative";

export const CREATIVE_ASSET_DETAIL_QUERY_ROOT = ["creative-asset-detail"] as const;
export const CREATIVE_ASSET_DETAIL_STALE_TIME = 5 * 60_000;
export const CREATIVE_ASSET_DETAIL_GC_TIME = 30 * 60_000;

export type CreativeAssetDetailQueryKey = readonly ["creative-asset-detail", string];

export function creativeAssetDetailQueryKey(assetId: string): CreativeAssetDetailQueryKey {
    return [...CREATIVE_ASSET_DETAIL_QUERY_ROOT, assetId] as CreativeAssetDetailQueryKey;
}

export function uniqueCreativeAssetIds(assetIds: readonly string[]) {
    return Array.from(new Set(assetIds.map((assetId) => assetId.trim()).filter(Boolean)));
}

export function isCreativeAssetDetail(asset: unknown): asset is CreativeAsset {
    if (!asset || typeof asset !== "object") return false;
    const candidate = asset as Partial<CreativeAsset>;
    return typeof candidate.id === "number" && typeof candidate.asset_id === "string" && typeof candidate.created_at === "number";
}

export function creativeAssetDetailQueryOptions(assetId: string, options?: { enabled?: boolean }) {
    return {
        queryKey: creativeAssetDetailQueryKey(assetId),
        queryFn: ({ signal }: QueryFunctionContext<CreativeAssetDetailQueryKey>) => fetchCreativeAsset(assetId, signal),
        staleTime: CREATIVE_ASSET_DETAIL_STALE_TIME,
        gcTime: CREATIVE_ASSET_DETAIL_GC_TIME,
        retry: 2,
        enabled: Boolean(assetId) && (options?.enabled ?? true),
    };
}

export function creativeAssetDetailsFromQueryCache(queryClient: QueryClient, assetIds: readonly string[]) {
    const details = new Map<string, CreativeAsset>();
    for (const assetId of uniqueCreativeAssetIds(assetIds)) {
        const asset = queryClient.getQueryData<CreativeAsset>(creativeAssetDetailQueryKey(assetId));
        if (asset) details.set(assetId, asset);
    }
    return details;
}

export function updateCreativeAssetDetailCache(queryClient: QueryClient, asset: CreativeAsset) {
    queryClient.setQueryData(creativeAssetDetailQueryKey(asset.asset_id), asset);
}

export function removeCreativeAssetDetailCache(queryClient: QueryClient, assetId: string) {
    queryClient.removeQueries({ queryKey: creativeAssetDetailQueryKey(assetId), exact: true });
}
