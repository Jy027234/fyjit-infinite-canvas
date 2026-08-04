import { afterEach, describe, expect, test } from "bun:test";

import {
    CreativeApiError,
    createCreativeCanvas,
    createCreativePrompt,
    creativeRequest,
    fetchCreativeAssets,
    fetchCreativePrompts,
    fetchCreativePromptRevisions,
    updateCreativeCanvas,
    uploadCreativeAsset,
} from "./creative";
import { CREATIVE_CONTRACT_VERSION, CREATIVE_OPERATIONS } from "./generated/creative-contract";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
});

describe("creativeRequest", () => {
    test("uses the same-origin Creative API with the FYJIT session", async () => {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { localStorage: { getItem: (key: string) => (key === "uid" ? "73" : null) } },
        });
        let request: { input?: string | URL | Request; init?: RequestInit } = {};
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            request = { input, init };
            return Response.json({ data: { ok: true } });
        }) as unknown as typeof fetch;

        await expect(creativeRequest<{ ok: boolean }>("/bootstrap")).resolves.toEqual({ ok: true });
        expect(request.input).toBe("/api/creative/bootstrap");
        expect(request.init?.credentials).toBe("include");
        expect(new Headers(request.init?.headers).get("X-Creative-Client-Version")).toBeTruthy();
        expect(new Headers(request.init?.headers).get("New-Api-User")).toBe("73");
    });

    test("maps server errors without exposing response internals", async () => {
        globalThis.fetch = (async () => Response.json({ code: "creative_disabled", message: "创作功能未启用" }, { status: 403 })) as unknown as typeof fetch;

        try {
            await creativeRequest("/bootstrap");
            throw new Error("expected CreativeApiError");
        } catch (error) {
            expect(error).toBeInstanceOf(CreativeApiError);
            expect(error).toMatchObject({ status: 403, code: "creative_disabled", message: "创作功能未启用" });
        }
    });

    test("rejects the FYJIT success-false envelope even when HTTP is 200", async () => {
        globalThis.fetch = (async () => Response.json({ success: false, code: "no_model", message: "没有可用模型" })) as unknown as typeof fetch;

        await expect(creativeRequest("/models")).rejects.toMatchObject({ status: 200, code: "no_model", message: "没有可用模型" });
    });
});

describe("Creative API contracts", () => {
    test("publishes the generated operations used across workbenches", () => {
        expect(CREATIVE_CONTRACT_VERSION).toMatch(/^creative-v1-/);
        expect(CREATIVE_OPERATIONS).toMatchObject({
            createCreativeJob: { method: "POST", path: "/jobs" },
            uploadCreativeAsset: { method: "POST", path: "/assets/uploads" },
            createCreativePrompt: { method: "POST", path: "/prompts" },
            updateCreativeCanvas: { method: "PUT", path: "/canvases/{project_id}" },
            bindCreativeVideoReference: { method: "POST", path: "/video-projects/{project_id}/shots/{shot_id}/video-reference" },
        });
    });

    test("encodes server-side asset filters and multipart uploads", async () => {
        const requests: Array<{ input: string; init?: RequestInit }> = [];
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            requests.push({ input: String(input), init });
            return Response.json({ data: requests.length === 1 ? { items: [], total: 0, page: 2, page_size: 24 } : { asset_id: "asset-1" } });
        }) as unknown as typeof fetch;

        await fetchCreativeAssets({ page: 2, pageSize: 24, type: "IMAGE", projectId: "project-7", model: "image-v2", tag: "approved", search: "portrait", favorite: true, trash: true });
        await uploadCreativeAsset(new Blob(["image"], { type: "image/png" }), "portrait.png", undefined, "legacy-browser-v1:image:abc");

        expect(requests[0]?.input).toBe("/api/creative/assets?page=2&page_size=24&type=IMAGE&project_id=project-7&search=portrait&favorite=true&model=image-v2&tag=approved&trash=true");
        expect(requests[1]?.init?.method).toBe("POST");
        const uploadBody = requests[1]?.init?.body;
        expect(uploadBody).toBeInstanceOf(FormData);
        expect(uploadBody instanceof FormData ? uploadBody.get("title") : undefined).toBe("portrait.png");
        expect(uploadBody instanceof FormData ? uploadBody.get("import_key") : undefined).toBe("legacy-browser-v1:image:abc");
    });

    test("encodes prompt ownership metadata filters", async () => {
        let input = "";
        globalThis.fetch = (async (request: string | URL | Request) => {
            input = String(request);
            return Response.json({ data: { items: [], total: 0, page: 1, page_size: 24 } });
        }) as unknown as typeof fetch;

        await fetchCreativePrompts({ promptType: "image", category: "portrait", tag: "studio", sourceType: "external", favorite: true });
        expect(input).toBe("/api/creative/prompts?category=portrait&prompt_type=image&tag=studio&source_type=external&favorite=true");
    });

    test("uses immutable prompt revision and canvas optimistic-lock endpoints", async () => {
        const requests: Array<{ input: string; init?: RequestInit }> = [];
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            requests.push({ input: String(input), init });
            return Response.json({ data: {} });
        }) as unknown as typeof fetch;

        await createCreativePrompt({ title: "Portrait", content: "A portrait of {{subject}}", variables: [{ name: "subject", required: true }] });
        await fetchCreativePromptRevisions("prompt/unsafe");
        await createCreativeCanvas({ title: "Storyboard", document: { nodes: [] }, schema_version: 1 });
        await updateCreativeCanvas("canvas/unsafe", { title: "Storyboard v2", document: { nodes: [{ id: "n1" }] }, expected_version: 7 });

        expect(requests.map((request) => request.input)).toEqual([
            "/api/creative/prompts",
            "/api/creative/prompts/prompt%2Funsafe/revisions",
            "/api/creative/canvases",
            "/api/creative/canvases/canvas%2Funsafe",
        ]);
        expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({ title: "Portrait", variables: [{ name: "subject", required: true }] });
        expect(JSON.parse(String(requests[3]?.init?.body))).toMatchObject({ expected_version: 7, document: { nodes: [{ id: "n1" }] } });
    });
});
