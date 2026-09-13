import { afterEach, describe, expect, test } from "bun:test";

import { useAgentStore } from "./use-agent-store";

afterEach(() => {
    useAgentStore.setState({ panelOpen: false, panelMounted: false, panelClosing: false });
});

describe("Agent 面板挂载状态", () => {
    test("首次进入应用时不挂载面板，打开时同步挂载并展开", () => {
        useAgentStore.setState({ panelOpen: false, panelMounted: false, panelClosing: false });

        expect(useAgentStore.getState().panelMounted).toBe(false);
        useAgentStore.getState().openPanel();

        expect(useAgentStore.getState()).toMatchObject({ panelMounted: true, panelOpen: true, panelClosing: false });
    });

    test("关闭时先保留挂载以完成动画，之后仍保留连接面板状态", async () => {
        useAgentStore.setState({ panelOpen: true, panelMounted: true, panelClosing: false });

        useAgentStore.getState().closePanel();
        expect(useAgentStore.getState()).toMatchObject({ panelMounted: true, panelOpen: false, panelClosing: true });

        await new Promise((resolve) => setTimeout(resolve, 550));
        expect(useAgentStore.getState()).toMatchObject({ panelMounted: true, panelOpen: false, panelClosing: false });
    });
});
