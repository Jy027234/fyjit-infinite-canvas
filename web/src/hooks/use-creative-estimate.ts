import { useEffect, useState } from "react";

import { estimateCreativeJob, type CreativeEstimate, type CreativeEstimateRequest } from "@/services/api/creative";

export function useCreativeEstimate(request: CreativeEstimateRequest | null, delayMs = 350) {
    const [estimate, setEstimate] = useState<CreativeEstimate | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const requestKey = request ? JSON.stringify(request) : "";

    useEffect(() => {
        if (!requestKey) {
            setEstimate(null);
            setLoading(false);
            setError(undefined);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            setError(undefined);
            void estimateCreativeJob(JSON.parse(requestKey) as CreativeEstimateRequest, controller.signal)
                .then((response) => setEstimate(response))
                .catch((requestError) => {
                    if (controller.signal.aborted) return;
                    setEstimate(null);
                    setError(requestError instanceof Error ? requestError.message : "费用与能力校验失败");
                })
                .finally(() => {
                    if (!controller.signal.aborted) setLoading(false);
                });
        }, delayMs);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [delayMs, requestKey]);

    return { estimate, setEstimate, loading, error };
}
