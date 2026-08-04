import { consumeCreativeIntent, createCreativeIntent, type CreativeIntent, type CreativeIntentKind } from "@/services/api/creative";
import type { CreativeIntentPayload } from "@/stores/use-creative-intent-store";

const MODE_KEY = "fyjit:starter-mode:v1";
const PROMPT_KEY = "fyjit:starter-prompt:v1";
const LEGACY_MODE_KEY = "fyjit:starter-mode";
const LEGACY_PROMPT_KEY = "fyjit:starter-prompt";
const SUPPORTED_KINDS = new Set<CreativeIntentKind>(["chat", "image", "video", "asset", "prompt", "canvas"]);

type PendingStudioIntent = {
    kind: CreativeIntentKind;
    payload: CreativeIntentPayload;
};

function readPendingStudioIntent(): PendingStudioIntent | undefined {
    try {
        const value = window.sessionStorage.getItem(MODE_KEY) ?? window.sessionStorage.getItem(LEGACY_MODE_KEY);
        const prompt = window.sessionStorage.getItem(PROMPT_KEY) ?? window.sessionStorage.getItem(LEGACY_PROMPT_KEY) ?? "";
        if (!value || !SUPPORTED_KINDS.has(value as CreativeIntentKind) || !prompt.trim()) return undefined;
        return { kind: value as CreativeIntentKind, payload: { prompt: prompt.trim() } };
    } catch {
        return undefined;
    }
}

function clearPendingStudioIntent() {
    try {
        window.sessionStorage.removeItem(MODE_KEY);
        window.sessionStorage.removeItem(PROMPT_KEY);
        window.sessionStorage.removeItem(LEGACY_MODE_KEY);
        window.sessionStorage.removeItem(LEGACY_PROMPT_KEY);
    } catch {
        // The server intent remains authoritative when browser storage is unavailable.
    }
}

function intentIdFromLocation() {
    return new URL(window.location.href).searchParams.get("intent")?.trim() || "";
}

function removeIntentQuery() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("intent")) return;
    url.searchParams.delete("intent");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export async function restoreCreativeIntent(): Promise<CreativeIntent<CreativeIntentPayload> | undefined> {
    let intentId = intentIdFromLocation();
    if (!intentId) {
        const pending = readPendingStudioIntent();
        if (!pending) return undefined;
        const created = await createCreativeIntent(pending.kind, pending.payload);
        intentId = created.id;
    }

    const intent = await consumeCreativeIntent<CreativeIntentPayload>(intentId);
    clearPendingStudioIntent();
    removeIntentQuery();
    return intent;
}
