import { useCallback } from "react";

import { resolveFyjitInterfaceLanguage, translateFyjitInterface, type FyjitInterfaceKey } from "@/lib/fyjit-interface";
import { useFyjitStore } from "@/stores/use-fyjit-store";

export function useFyjitInterface() {
    const serverLanguage = useFyjitStore((state) => state.bootstrap?.user.language);
    const language = resolveFyjitInterfaceLanguage(serverLanguage);
    const t = useCallback((key: FyjitInterfaceKey) => translateFyjitInterface(language, key), [language]);
    return { language, t };
}
