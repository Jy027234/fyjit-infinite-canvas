import localforage from "localforage";

import { localForageStorage } from "@/lib/localforage-storage";

const disposableStores = ["agent_chat_messages", "prompt_cache"].map((storeName) =>
    localforage.createInstance({ name: "infinite-canvas", storeName }),
);

export async function clearCreativeBrowserSession() {
    try {
        window.localStorage.clear();
        window.sessionStorage.clear();
    } catch {
        // Storage can be unavailable in hardened browsing contexts.
    }
    await Promise.allSettled([
        localForageStorage.removeItem("infinite-canvas:asset_store"),
        ...disposableStores.map((store) => store.clear()),
    ]);
}
