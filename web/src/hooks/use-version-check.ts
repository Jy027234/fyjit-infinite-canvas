import { useCallback, useMemo, useState } from "react";
import { APP_VERSION } from "@/constant/env";
import type { ReleaseInfo } from "@/lib/release";

function readLocalReleases(): ReleaseInfo[] {
    return __APP_RELEASES__ || [];
}

export function useVersionCheck() {
    const currentVersion = APP_VERSION;
    const localReleases = useMemo(readLocalReleases, []);
    const [open, setOpen] = useState(false);

    const openReleaseModal = useCallback(() => {
        setOpen(true);
    }, []);

    return {
        open,
        setOpen,
        openReleaseModal,
        latestVersion: currentVersion,
        releases: localReleases,
    };
}
