import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
    testDir: "./e2e",
    outputDir: "./test-results",
    fullyParallel: true,
    workers: process.env.CI ? 2 : 4,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    expect: {
        toHaveScreenshot: {
            // Chromium/font rasterization can vary by a handful of edge pixels
            // between the pinned container and GitHub's host CPU.
            maxDiffPixels: 10,
        },
    },
    use: {
        baseURL: externalBaseURL || `http://127.0.0.1:${port}/creative`,
        locale: "zh-CN",
        colorScheme: "light",
        reducedMotion: "reduce",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    webServer: externalBaseURL
        ? undefined
        : {
              command: `npx vite --host 127.0.0.1 --port ${port}`,
              url: `http://127.0.0.1:${port}/creative/healthz`,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
