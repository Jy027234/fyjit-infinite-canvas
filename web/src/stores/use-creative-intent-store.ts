import { create } from "zustand";

import type { CreativeIntent, CreativeIntentKind } from "@/services/api/creative";

export type CreativeIntentPayload = {
    prompt?: string;
    negative_prompt?: string;
    asset_ids?: string[];
    project_id?: string;
};

type CreativeIntentState = {
    activeIntent?: CreativeIntent<CreativeIntentPayload>;
    setActiveIntent: (intent?: CreativeIntent<CreativeIntentPayload>) => void;
    consumeFor: (kind: CreativeIntentKind) => CreativeIntentPayload | undefined;
};

export const useCreativeIntentStore = create<CreativeIntentState>((set, get) => ({
    setActiveIntent: (activeIntent) => set({ activeIntent }),
    consumeFor: (kind) => {
        const intent = get().activeIntent;
        if (!intent || intent.kind !== kind) return undefined;
        set({ activeIntent: undefined });
        return intent.payload;
    },
}));
