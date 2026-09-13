import { useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import { creativeAssetDetailQueryOptions, uniqueCreativeAssetIds } from "@/services/creative-asset-details";
import type { CreativeAsset } from "@/services/api/creative";

export function useCreativeAssetDetails(assetIds: readonly string[], enabled = true) {
    const normalizedAssetIds = useMemo(() => uniqueCreativeAssetIds(assetIds), [assetIds]);
    const queries = useQueries({
        queries: normalizedAssetIds.map((assetId) => creativeAssetDetailQueryOptions(assetId, { enabled })),
    });
    const assetVersion = queries.map((query) => (query.data ? `${query.data.asset_id}:${query.data.updated_at}` : "")).join("\u0000");
    const assets = useMemo(() => {
        // The query result array is recreated by TanStack Query; use the data version
        // as the dependency so derived maps stay stable between fetch state updates.
        const details = new Map<string, CreativeAsset>();
        normalizedAssetIds.forEach((assetId, index) => {
            const asset = queries[index]?.data;
            if (asset) details.set(assetId, asset);
        });
        return details;
    }, [assetVersion, normalizedAssetIds]);
    const retry = useCallback(() => Promise.all(queries.filter((query) => query.isError).map((query) => query.refetch({ cancelRefetch: true }))), [queries]);

    return {
        assetIds: normalizedAssetIds,
        assets,
        queries,
        isLoading: enabled && queries.some((query) => query.isPending),
        isFetching: enabled && queries.some((query) => query.isFetching),
        isError: queries.some((query) => query.isError),
        error: queries.find((query) => query.error)?.error,
        assetVersion,
        retry,
    };
}
