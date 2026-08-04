import { expect, test, type Page } from "@playwright/test";

const viewports = [
    { name: "390x844", width: 390, height: 844 },
    { name: "430x932", width: 430, height: 932 },
    { name: "768x1024", width: 768, height: 1024 },
    { name: "1440x900", width: 1440, height: 900 },
    { name: "1920x1080", width: 1920, height: 1080 },
] as const;

for (const viewport of viewports) {
    test(`image workbench visual baseline ${viewport.name}`, async ({ page }) => {
        await prepareCreativePage(page, viewport);
        await page.goto("/creative/image");
        await expect(page.getByRole("heading", { name: "生图工作台", exact: true })).toBeVisible();
        await expectNoPageOverflow(page);
        await expect(page).toHaveScreenshot(`image-${viewport.name}.png`, { animations: "disabled", fullPage: true });
        await expectPrimaryGenerateActionReachable(page);
    });
}

for (const viewport of [viewports[0], viewports[3]]) {
    test(`video and asset center visual baselines ${viewport.name}`, async ({ page }) => {
        await prepareCreativePage(page, viewport);
        await page.goto("/creative/video");
        await expect(page.getByRole("heading", { name: "视频创作台", exact: true })).toBeVisible();
        await expectNoPageOverflow(page);
        await expect(page).toHaveScreenshot(`video-${viewport.name}.png`, { animations: "disabled", fullPage: true });
        await expectPrimaryGenerateActionReachable(page);

        await page.goto("/creative/assets");
        await expect(page.getByRole("heading", { name: "素材中心", exact: true })).toBeVisible();
        await expect(page.getByText("晨雾中的山谷", { exact: true })).toBeVisible();
        await expectNoPageOverflow(page);
        await expect(page).toHaveScreenshot(`assets-${viewport.name}.png`, { animations: "disabled", fullPage: true });
    });
}

test("account menu exposes sign out on desktop and mobile", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    await page.goto("/creative/image");
    await page.getByRole("button", { name: "用户菜单" }).click();
    await expect(page.getByText("退出登录", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize(viewports[0]);
    await page.getByRole("button", { name: "打开导航菜单" }).click();
    await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
});

test("workbenches expose the server-side estimate and normalized request summary", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    await page.goto("/creative/image");
    await expect(page.getByText("预计 $0.0200 · 2,000 配额")).toBeAttached();
    await expect(page.getByText("Token：自动创作 Token (#7)")).toBeAttached();

    await page.goto("/creative/video");
    await expect(page.getByText("预计 $0.1200 · 12,000 配额")).toBeAttached();
    await expect(page.getByText(/时长限制 1–120 秒/)).toBeAttached();
});

test("video controls follow server capabilities and desktop panel preferences persist", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    await page.goto("/creative/video");

    await expect(page.getByText("当前模型固定或未开放：帧率、声音、水印、镜头固定")).toBeVisible();
    await page.getByRole("button", { name: "折叠生成记录" }).click();
    await expect(page.getByRole("button", { name: "展开生成记录" })).toBeVisible();

    const parameterHeading = page.getByText("模型与参数", { exact: true });
    await parameterHeading.locator("..").getByRole("button", { name: "折叠" }).click();
    await expect(page.getByText("参数栏已折叠；点击恢复当前模型设置")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "展开生成记录" })).toBeVisible();
    await expect(page.getByText("参数栏已折叠；点击恢复当前模型设置")).toBeVisible();
});

test("image batches create independently settled jobs and preserve negative prompts", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    const jobRequests: Array<{ negative_prompt?: string; parameters?: Record<string, unknown> }> = [];
    await page.route("**/api/creative/jobs**", async (route) => {
        const url = new URL(route.request().url());
        const relativePath = url.pathname.replace(/^\/api\/creative/, "");
        if (route.request().method() === "POST" && relativePath === "/jobs") {
            const body = route.request().postDataJSON() as { negative_prompt?: string; parameters?: Record<string, unknown> };
            jobRequests.push(body);
            const index = jobRequests.length;
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: creativeJobFixture(index, "QUEUED") }) });
        }
        const match = relativePath.match(/^\/jobs\/job-(\d+)$/);
        if (match) {
            const index = Number(match[1]);
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: creativeJobFixture(index, index === 2 ? "FAILED" : "SUCCEEDED") }) });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0, page: 1, page_size: 100 } }) });
    });
    await page.route("**/api/creative/assets/result-*", (route) => {
        const id = new URL(route.request().url()).pathname.split("/").at(-1) || "result-1";
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { asset_id: id, user_id: 1001, type: "IMAGE", title: id, status: "READY", preview_path: imageFixture(id, "#dbeafe", "#0f766e"), mime_type: "image/svg+xml", width: 1024, height: 1024, size_bytes: 16384, created_at: 1785700000, updated_at: 1785700000 } }) });
    });

    await page.goto("/creative/image");
    const textareas = page.locator("textarea");
    await textareas.nth(0).fill("独立候选测试");
    await textareas.nth(1).fill("不要文字水印");
    await page.getByRole("button", { name: "2 张" }).click();
    await page.getByRole("button", { name: "开始生成", exact: true }).click();
    await expect.poll(() => jobRequests.length).toBe(2);
    expect(jobRequests).toEqual([
        expect.objectContaining({ negative_prompt: "不要文字水印", parameters: expect.objectContaining({ count: 1 }) }),
        expect.objectContaining({ negative_prompt: "不要文字水印", parameters: expect.objectContaining({ count: 1 }) }),
    ]);
    await expect(page.getByText("生成结果已由 FYJIT 自动保存到素材中心")).toHaveCount(0);
    await expect(page.locator(".ant-image")).toHaveCount(1);
    await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
});

test("video history restores a pending job and preserves terminal states", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    const jobs = [
        creativeVideoJobFixture("recover", "QUEUED", "关闭页面后恢复"),
        creativeVideoJobFixture("cancelled", "CANCELLED", "用户取消任务"),
        creativeVideoJobFixture("expired", "EXPIRED", "上游处理超时"),
        creativeVideoJobFixture("failed", "FAILED", "上游服务失败"),
    ];
    let recovered = false;
    await page.route("**/api/creative/jobs**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/jobs/job-recover")) {
            recovered = true;
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true, data: { ...creativeVideoJobFixture("recover", "SUCCEEDED", "关闭页面后恢复"), result_asset_ids: ["recovered-video"], actual_quota: 12000, actual_cost: 0.12, billing_status: "SETTLED", usage_request_id: "request-recover" } }),
            });
        }
        const listedJobs = recovered
            ? [{ ...creativeVideoJobFixture("recover", "SUCCEEDED", "关闭页面后恢复"), result_asset_ids: ["recovered-video"], actual_quota: 12000, actual_cost: 0.12, billing_status: "SETTLED", usage_request_id: "request-recover" }, ...jobs.slice(1)]
            : jobs;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: listedJobs, total: listedJobs.length, page: 1, page_size: 100 } }) });
    });
    await page.route("**/api/creative/assets/recovered-video", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { asset_id: "recovered-video", user_id: 1001, type: "VIDEO", title: "已恢复视频", status: "READY", preview_path: "/api/creative/assets/recovered-video/content", thumbnail_path: imageFixture("恢复", "#d1fae5", "#047857"), mime_type: "video/mp4", width: 1280, height: 720, duration: 6, size_bytes: 5242880, created_at: 1785700000, updated_at: 1785700001 } }),
    }));

    await page.goto("/creative/video");
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();
    await expect(page.getByText("已超时", { exact: true })).toBeVisible();
    await expect(page.getByText("失败", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "送入影视制作" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("实际消费 $0.1200 · 12000 配额", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看使用记录" })).toHaveAttribute("href", "/usage-logs/common?requestId=request-recover");
});

test("asset center filters and restores trash on mobile", async ({ page }) => {
    await prepareCreativePage(page, viewports[0]);
    const assetQueries: URLSearchParams[] = [];
    let restored = false;
    await page.route("**/api/creative/assets**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === "POST" && url.pathname.endsWith("/restore")) {
            restored = true;
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
        }
        if (route.request().method() !== "GET" || !url.pathname.endsWith("/assets")) return route.fallback();
        assetQueries.push(new URLSearchParams(url.search));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
            items: [{ asset_id: "trash-image", user_id: 1001, type: "IMAGE", title: "待恢复素材", status: "READY", source_module: "image-workbench", model: "image-v2", favorite: true, preview_path: imageFixture("恢复", "#fee2e2", "#b91c1c"), mime_type: "image/svg+xml", created_at: 1785700000, updated_at: 1785700000 }],
            total: 1, page: 1, page_size: 24,
        } }) });
    });

    await page.goto("/creative/assets");
    await page.getByRole("button", { name: "筛选" }).click();
    const drawer = page.getByRole("dialog", { name: "筛选素材" });
    await drawer.getByPlaceholder("模型 ID").fill("image-v2");
    await drawer.getByPlaceholder("项目 ID").fill("project-7");
    await drawer.getByText("仅收藏", { exact: true }).click();
    await drawer.getByText("回收站", { exact: true }).click();
    await expect.poll(() => assetQueries.some((query) => query.get("model") === "image-v2" && query.get("project_id") === "project-7" && query.get("favorite") === "true" && query.get("trash") === "true")).toBe(true);
    await drawer.getByRole("button", { name: "关闭" }).click();
    await page.getByRole("button", { name: "恢复", exact: true }).click();
    await expect.poll(() => restored).toBe(true);
});

test("asset center hands text to Character Studio and video to FilmGen", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    const handoffs: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    await page.route("**/api/creative/assets**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET" || !url.pathname.endsWith("/assets")) return route.fallback();
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
            items: [
                { asset_id: "story-brief", user_id: 1001, type: "TEXT", title: "角色设定", content: "一位守护星海的年轻领航员", status: "READY", source_module: "manual", created_at: 1785700000, updated_at: 1785700000 },
                { asset_id: "film-clip", user_id: 1001, type: "VIDEO", title: "片段素材", status: "READY", source_module: "video-workbench", thumbnail_path: imageFixture("片段", "#ede9fe", "#7c3aed"), preview_path: "/api/creative/assets/film-clip/content", mime_type: "video/mp4", created_at: 1785700100, updated_at: 1785700100 },
            ], total: 2, page: 1, page_size: 24,
        } }) });
    });
    await page.route("**/api/creative/intents", async (route) => {
        const request = route.request().postDataJSON() as { kind: string; payload: Record<string, unknown> };
        handoffs.push(request);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: { id: `handoff-${handoffs.length}`, kind: request.kind, expires_at: 1785700300 } }) });
    });

    await page.goto("/creative/assets");
    await page.getByRole("button", { name: "用于角色", exact: true }).click();
    await expect(page).toHaveURL(/\/character-studio\?intent=handoff-1$/);
    expect(handoffs[0]).toMatchObject({ kind: "character", payload: { prompt: "一位守护星海的年轻领航员" } });

    await page.goto("/creative/assets");
    await page.getByRole("button", { name: "用于影视", exact: true }).click();
    await expect(page).toHaveURL(/\/professional-video\?intent=handoff-2$/);
    expect(handoffs[1]).toMatchObject({ kind: "asset", payload: { asset_ids: ["film-clip"] } });
});

test("prompt library preserves source attribution and imports owned JSON", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    const imported: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    await page.route("**/api/creative/prompts**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === "POST" && url.pathname.endsWith("/prompts")) {
            imported.push(route.request().postDataJSON() as Record<string, unknown>);
            return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: { prompt_id: "imported-prompt" } }) });
        }
        if (route.request().method() === "PATCH") {
            updates.push(route.request().postDataJSON() as Record<string, unknown>);
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { prompt_id: "external-prompt" } }) });
        }
        if (url.pathname.endsWith("/revisions")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
        if (route.request().method() === "GET" && url.pathname.endsWith("/prompts")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
            items: [{ prompt_id: "external-prompt", user_id: 1001, title: "带来源的电影提示词", content: "电影感山谷", prompt_type: "image", category: "image", tags: ["cinematic"], variables: [], favorite: false, version: 1, source_type: "external", author_name: "Example Creator", source_url: "https://example.com/prompt", source_license: "CC-BY-4.0", allowed_uses: "署名后允许商用", created_at: 1785700000, updated_at: 1785700000 }],
            total: 1, page: 1, page_size: 24,
        } }) });
        return route.fallback();
    });
    await page.route("**/api/creative/jobs**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === "POST" && url.pathname.endsWith("/jobs")) return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: { ...creativeJobFixture(91, "QUEUED"), capability: "text_generation" } }) });
        if (url.pathname.endsWith("/jobs/job-91")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { ...creativeJobFixture(91, "SUCCEEDED"), capability: "text_generation", result_asset_ids: ["refined-text"] } }) });
        return route.fallback();
    });
    await page.route("**/api/creative/assets/refined-text", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { asset_id: "refined-text", user_id: 1001, type: "TEXT", content: "精修后的电影感山谷", favorite: false, status: "READY", created_at: 1785700000, updated_at: 1785700000 } }) }));

    await page.goto("/creative/prompts");
    await page.getByRole("heading", { name: "带来源的电影提示词" }).click();
    const details = page.getByRole("dialog", { name: "带来源的电影提示词" });
    await expect(details.getByText("作者：Example Creator")).toBeVisible();
    await expect(details.getByRole("link", { name: "查看原始来源" })).toHaveAttribute("href", "https://example.com/prompt");
    await details.getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: "AI 精修" }).click();
    const compare = page.getByRole("dialog", { name: "AI 精修对比" });
    const refinementFields = compare.locator("textarea");
    await expect(refinementFields.nth(0)).toHaveValue("电影感山谷");
    await expect(refinementFields.nth(1)).toHaveValue("精修后的电影感山谷");
    await refinementFields.nth(1).fill("人工确认后的精修提示词");
    await compare.getByRole("button", { name: "采用并创建新版本" }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).toMatchObject({ content: "人工确认后的精修提示词" });

    await page.locator('input[type="file"][accept*="json"]').setInputFiles({ name: "prompts.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ title: "我的导入提示词", content: "{{subject}} in light" })) });
    await expect.poll(() => imported.length).toBe(1);
    expect(imported[0]).toMatchObject({ title: "我的导入提示词", source_type: "import", variables: [{ name: "subject", label: "subject" }] });
});

test("canvas creates an explicit server version snapshot", async ({ page }) => {
    await prepareCreativePage(page, viewports[3]);
    const snapshots: Array<Record<string, unknown>> = [];
    const restores: Array<Record<string, unknown>> = [];
    const emptyDocument = { nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } };
    await page.route("**/api/creative/canvases**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === "GET" && url.pathname.endsWith("/canvases")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], total: 0, page: 1, page_size: 100 } }) });
        if (route.request().method() === "GET" && url.pathname.endsWith("/revisions")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [
            { revision_id: "revision-2", project_id: "canvas-1", user_id: 1001, title: "未命名画布", document: emptyDocument, version: 2, schema_version: 2, created_at: 1785700001 },
            { revision_id: "revision-1", project_id: "canvas-1", user_id: 1001, title: "未命名画布", document: emptyDocument, version: 1, schema_version: 2, created_at: 1785700000 },
        ] }) });
        if (route.request().method() === "POST" && url.pathname.endsWith("/revisions/revision-1/restore")) {
            restores.push(route.request().postDataJSON() as Record<string, unknown>);
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { project_id: "canvas-1", user_id: 1001, title: "未命名画布", document: emptyDocument, version: 3, schema_version: 2, created_at: 1785700000, updated_at: 1785700002 } }) });
        }
        if (route.request().method() === "POST" && url.pathname.endsWith("/canvases")) return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: { project_id: "canvas-1", user_id: 1001, title: "未命名画布", document: emptyDocument, version: 1, schema_version: 2, created_at: 1785700000, updated_at: 1785700000 } }) });
        if (route.request().method() === "PUT" && url.pathname.endsWith("/canvases/canvas-1")) {
            const request = route.request().postDataJSON() as Record<string, unknown>;
            snapshots.push(request);
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { project_id: "canvas-1", user_id: 1001, title: request.title, document: request.document, version: 2, schema_version: 2, created_at: 1785700000, updated_at: 1785700001 } }) });
        }
        return route.fallback();
    });

    await page.goto("/creative/canvas");
    await page.getByRole("button", { name: "新建画布", exact: true }).first().click();
    await expect(page).toHaveURL(/\/creative\/canvas\/canvas-1$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "打开画布菜单" }).click();
    await page.getByText("创建版本快照", { exact: true }).click();
    await expect.poll(() => snapshots.some((snapshot) => snapshot.expected_version === 1 && snapshot.schema_version === 2)).toBe(true);
    await page.getByRole("button", { name: "打开画布菜单" }).click();
    await page.getByText("版本历史", { exact: true }).click();
    const versions = page.getByRole("dialog", { name: "版本历史" });
    await versions.getByRole("button", { name: "恢复此版本" }).last().click();
    await page.getByRole("dialog", { name: "恢复版本 v1？" }).getByRole("button", { name: /恢\s*复/ }).click();
    await expect.poll(() => restores.length).toBe(1);
    expect(restores[0]).toMatchObject({ expected_version: 2 });
});

test("missing models and tokens point to FYJIT account actions", async ({ page }) => {
    await prepareCreativePage(page, viewports[3], { models: [], tokens: [] });
    await page.goto("/creative/image");
    await expect(page.getByText(/当前账号缺少生图模型、可用本站 Token 或余额/)).toBeVisible();
    await expect(page.locator('a[href$="/keys"]')).toBeVisible();
    await expect(page.locator('a[href$="/console/topup"]')).toBeVisible();
    await expect(page.locator('a[href$="/pricing"]')).toBeVisible();
});

test("unauthenticated bootstrap returns to sign-in with the full creative target", async ({ page }) => {
    await page.setViewportSize(viewports[3]);
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
    await page.route("**/api/creative/**", (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api\/creative/, "");
        if (path === "/bootstrap") return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, code: "unauthenticated", message: "请先登录" }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: creativeFixture(path) }) });
    });
    await page.route("**/sign-in**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>FYJIT Sign In</h1>" }));

    await page.goto("/creative/image?intent=intent-42");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/sign-in");
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/creative/image?intent=intent-42");
});

test("server feature flags fail closed for disabled workbenches", async ({ page }) => {
    await prepareCreativePage(page, viewports[3], { disabledFeature: "video-workbench" });
    await page.goto("/creative/video");
    await expect(page.getByRole("heading", { name: "该创作模块尚未启用" })).toBeVisible();
    await expect(page.getByText(/管理员尚未为当前账号开放此模块/)).toBeVisible();
});

for (const failure of [
    { status: 402, code: "insufficient_quota", message: "余额不足", heading: "FYJIT 余额不足", action: "前往充值" },
    { status: 403, code: "account_disabled", message: "账号已停用", heading: "账号或创作权限不可用", action: "返回 FYJIT" },
    { status: 429, code: "rate_limited", message: "请稍后再试", heading: "请求过于频繁", action: "重新连接" },
] as const) {
    test(`bootstrap maps ${failure.code} to a specific recovery state`, async ({ page }) => {
        await prepareCreativeBootstrapError(page, failure.status, failure.code, failure.message);
        await page.goto("/creative/image");
        await expect(page.getByRole("heading", { name: failure.heading })).toBeVisible();
        await expect(page.getByText(failure.message, { exact: true })).toBeVisible();
        await expect(page.getByText(failure.action, { exact: true })).toBeVisible();
    });
}

async function prepareCreativePage(page: Page, viewport: { width: number; height: number }, overrides: { models?: unknown[]; tokens?: unknown[]; disabledFeature?: string } = {}) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.addInitScript(() => {
        if (window.sessionStorage.getItem("fyjit-e2e-initialized") === "true") return;
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.sessionStorage.setItem("fyjit-e2e-initialized", "true");
    });
    await page.route("**/api/creative/**", async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/api\/creative/, "");
        const requestBody = route.request().postData() ? route.request().postDataJSON() : undefined;
        let data = path === "/models" && overrides.models ? overrides.models : path === "/tokens" && overrides.tokens ? overrides.tokens : creativeFixture(path, requestBody);
        if (path === "/bootstrap" && overrides.disabledFeature && data && typeof data === "object" && "features" in data) {
            data = { ...data, features: { ...(data as { features: Record<string, boolean> }).features, [overrides.disabledFeature]: false } };
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "", data }) });
    });
}

async function prepareCreativeBootstrapError(page: Page, status: number, code: string, message: string) {
    await page.setViewportSize(viewports[3]);
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
    await page.route("**/api/creative/**", (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api\/creative/, "");
        if (path === "/bootstrap") return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: false, code, message }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: creativeFixture(path) }) });
    });
}

function creativeFixture(path: string, requestBody?: { capability?: string; parameters?: Record<string, unknown> }): unknown {
    if (path === "/bootstrap") {
        return {
            user: { id: 1001, username: "visual", display_name: "视觉验收用户", quota: 100000, group: "default" },
            features: { "image-workbench": true, "video-workbench": true, "creative-assets": true, "creative-prompts": true, "infinite-canvas": true },
            navigation: [],
            permissions: {},
            theme_version: "fyjit-creative-v1",
            capabilities_version: "visual-fixture-v1",
        };
    }
    if (path === "/capabilities") return { version: "visual-fixture-v1", capabilities: { image_generation: true, video_generation: true }, model_counts: { image_generation: 1, video_generation: 1 } };
    if (path === "/models") return [
        { id: "fyjit-visual-text", name: "FYJIT Visual Text", groups: ["default"], capabilities: ["text_generation"], recommended_for: ["text_generation"], capability_profiles: { text_generation: { verified: true, input_modes: ["text"], supported_parameters: ["temperature"], max_reference_images: 0, max_reference_videos: 0, max_reference_audio: 0, risk_notices: [] } }, supported_endpoint_types: ["openai"] },
        { id: "fyjit-visual-image", name: "FYJIT Visual Image", groups: ["default"], capabilities: ["image_generation"], recommended_for: ["image_generation"], capability_profiles: { image_generation: { verified: true, input_modes: ["text_to_image", "image_edit"], supported_parameters: ["count", "size", "quality"], max_reference_images: 1, max_reference_videos: 0, max_reference_audio: 0, risk_notices: [] } }, supported_endpoint_types: ["openai"] },
        { id: "fyjit-visual-video", name: "FYJIT Visual Video", groups: ["default"], capabilities: ["video_generation"], recommended_for: ["video_generation"], capability_profiles: { video_generation: { verified: true, input_modes: ["text_to_video", "image_to_video"], supported_parameters: ["duration", "size", "resolution"], max_reference_images: 1, max_reference_videos: 0, max_reference_audio: 0, risk_notices: ["当前 Relay 版本只发送首张参考图。"] } }, supported_endpoint_types: ["openai"] },
    ];
    if (path === "/tokens") return [{ id: 7, name: "自动创作 Token", group: "default", unlimited_quota: false, remain_quota: 100000, expired_time: -1, model_limits_enabled: false }];
    if (path === "/estimates") {
        const video = requestBody?.capability === "video_generation";
        return {
            available: true,
            capability: requestBody?.capability || "image_generation",
            model: video ? "fyjit-visual-video" : "fyjit-visual-image",
            group: "default",
            token_id: 7,
            billing_mode: "fixed",
            billing_unit: video ? "second" : "image",
            estimated_usd: video ? 0.12 : 0.02,
            estimated_quota: video ? 12000 : 2000,
            group_ratio: 1,
            normalized_parameters: requestBody?.parameters || { count: 1 },
            limitations: { max_count: 10, max_reference_assets: 16, ...(video ? { duration_seconds: { min: 1, max: 120 } } : {}) },
            price_version: "visual-fixture-v1",
            message: "按当前固定价格估算，最终以 Relay 结算日志为准",
        };
    }
    if (path.startsWith("/jobs")) return { items: [], total: 0, page: 1, page_size: 100 };
    if (path.startsWith("/canvases")) return { items: [], total: 0, page: 1, page_size: 100 };
    if (path.startsWith("/prompts")) return { items: [], total: 0, page: 1, page_size: 24 };
    if (path.startsWith("/assets")) {
        return {
            items: [
                { asset_id: "visual-image", user_id: 1001, type: "IMAGE", title: "晨雾中的山谷", status: "READY", source_module: "image-workbench", preview_path: imageFixture("山谷", "#dbeafe", "#0f766e"), thumbnail_path: imageFixture("山谷", "#dbeafe", "#0f766e"), mime_type: "image/svg+xml", width: 1024, height: 768, size_bytes: 16384, created_at: 1785700000, updated_at: 1785700000 },
                { asset_id: "visual-video", user_id: 1001, type: "VIDEO", title: "城市光影预览", status: "READY", source_module: "video-workbench", preview_path: "/api/creative/assets/visual-video/content", thumbnail_path: imageFixture("视频", "#ede9fe", "#7c3aed"), mime_type: "video/mp4", size_bytes: 5242880, created_at: 1785700100, updated_at: 1785700100 },
            ],
            total: 2,
            page: 1,
            page_size: 24,
        };
    }
    return {};
}

function imageFixture(label: string, background: string, foreground: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="100%" height="100%" fill="${background}"/><circle cx="512" cy="340" r="180" fill="${foreground}" opacity=".82"/><text x="512" y="650" text-anchor="middle" font-family="sans-serif" font-size="72" fill="${foreground}">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function creativeJobFixture(index: number, status: "QUEUED" | "SUCCEEDED" | "FAILED") {
    return {
        job_id: `job-${index}`,
        user_id: 1001,
        capability: "image_generation",
        model: "fyjit-visual-image",
        group: "default",
        token_id: 7,
        prompt: "独立候选测试",
        negative_prompt: "不要文字水印",
        parameters: { count: 1, size: "1024x1024", quality: "standard" },
        reference_asset_ids: [],
        status,
        progress: status === "SUCCEEDED" ? 100 : status === "FAILED" ? 100 : 0,
        result_asset_ids: status === "SUCCEEDED" ? [`result-${index}`] : [],
        attempt_count: status === "QUEUED" ? 0 : 1,
        capability_version: "visual-fixture-v1",
        price_snapshot: {},
        created_at: 1785700000,
        updated_at: 1785700001,
        error: status === "FAILED" ? "上游候选生成失败" : "",
        finished_at: status === "QUEUED" ? 0 : 1785700001,
    };
}

function creativeVideoJobFixture(id: string, status: "QUEUED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "EXPIRED", prompt: string) {
    const terminal = status !== "QUEUED";
    return {
        job_id: `job-${id}`,
        user_id: 1001,
        capability: "video_generation",
        model: "fyjit-visual-video",
        group: "default",
        token_id: 7,
        prompt,
        negative_prompt: "",
        parameters: { count: 1, size: "16:9", resolution: "720p", duration: 6 },
        reference_asset_ids: [],
        status,
        progress: status === "SUCCEEDED" ? 100 : status === "QUEUED" ? 0 : 80,
        result_asset_ids: [],
        attempt_count: terminal ? 1 : 0,
        capability_version: "visual-fixture-v1",
        price_snapshot: {},
        error: status === "FAILED" ? "上游服务失败" : status === "EXPIRED" ? "上游处理超时" : status === "CANCELLED" ? "用户已取消任务" : "",
        created_at: 1785700000,
        updated_at: 1785700001,
        finished_at: terminal ? 1785700001 : 0,
    };
}

async function expectNoPageOverflow(page: Page) {
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function expectPrimaryGenerateActionReachable(page: Page) {
    await page.locator("textarea").first().fill("FYJIT 响应式验收场景");
    const action = page.getByRole("button", { name: "开始生成", exact: true });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled();
    await action.focus();
    await expect(action).toBeFocused();
}
