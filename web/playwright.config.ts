import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);

export default defineConfig({
    testDir: "./e2e",
    outputDir: "./test-results",
    fullyParallel: true,
    workers: process.env.CI ? 2 : 4,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: `http://127.0.0.1:${port}/creative`,
        locale: "zh-CN",
        colorScheme: "light",
        reducedMotion: "reduce",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    webServer: {
        command: `npx vite --host 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}/creative/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
