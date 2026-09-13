import { useMemo } from "react";

import { navigationTools, creativeLocalHref } from "@/constant/navigation-tools";
import { useFyjitInterface } from "@/hooks/use-fyjit-interface";
import { creativeNavigationLabel } from "@/lib/fyjit-interface";
import { useFyjitStore } from "@/stores/use-fyjit-store";

export function useCreativeNavigationTools() {
    const { language } = useFyjitInterface();
    const serverNavigation = useFyjitStore((state) => state.bootstrap?.navigation);

    return useMemo(
        () =>
            navigationTools
                .map((tool) => {
                    const serverItem = serverNavigation?.find((item) => item.key === tool.key);
                    return {
                        ...tool,
                        href: creativeLocalHref(serverItem?.href, tool.slug),
                        label: creativeNavigationLabel(language, tool.key, serverItem?.label || tool.label),
                        enabled: serverItem?.enabled ?? true,
                    };
                })
                .filter((tool) => tool.enabled),
        [language, serverNavigation],
    );
}
