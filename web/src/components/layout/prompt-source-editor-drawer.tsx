import { Alert, App, Button, Drawer, Input, Space, Switch } from "antd";
import { useEffect, useState } from "react";

import type { PromptSource } from "@/services/api/prompt-source-presets";

export function PromptSourceEditorDrawer({ open, source, onSave, onClose }: { open: boolean; source: PromptSource | null; onSave: (source: PromptSource) => void; onClose: () => void }) {
    const { message } = App.useApp();
    const [draft, setDraft] = useState<PromptSource | null>(source);

    useEffect(() => {
        if (open && source) setDraft(source);
    }, [open, source]);

    if (!draft) return null;

    const patch = (value: Partial<PromptSource>) => setDraft((current) => (current ? { ...current, ...value } : current));

    const save = () => {
        const name = draft.name.trim();
        const url = draft.url.trim();
        const homepage = draft.homepage.trim();
        const licenseId = draft.licenseId.trim();
        const licenseUrl = draft.licenseUrl.trim();
        const attribution = draft.attribution.trim();
        const fullSync = draft.syncPolicy === "full";
        if (!name) return message.warning("请输入来源名称");
        if (fullSync && !isHttpUrl(url)) return message.warning("完整同步需要有效的 JSON URL");
        if (url && !isHttpUrl(url)) return message.warning("请输入有效的 JSON URL");
        if (!isHttpUrl(homepage)) return message.warning("请输入有效的来源主页");
        if (fullSync && (!licenseId || !isHttpUrl(licenseUrl) || !attribution)) return message.warning("完整同步需要许可证标识、许可证链接和署名");
        onSave({ ...draft, name, url, homepage, licenseId, licenseUrl, attribution, auditStatus: fullSync ? "approved" : "unverified", builtIn: false });
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={560}
            title={source?.name === "新来源" ? "新增提示词来源" : "编辑提示词来源"}
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={save}>
                        保存
                    </Button>
                </Space>
            }
        >
            <div className="space-y-5">
                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">来源名称</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="用于分类展示" />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">JSON URL（完整同步必填）</span>
                    <Input value={draft.url} onChange={(event) => patch({ url: event.target.value })} placeholder="https://example.com/prompts.json" />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">来源主页</span>
                    <Input value={draft.homepage} onChange={(event) => patch({ homepage: event.target.value })} placeholder="https://example.com" />
                </label>
                <section className="space-y-4 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm font-medium">允许同步正文与预览</div>
                            <div className="mt-1 text-xs text-stone-500">关闭时仅展示来源外链，不下载或缓存第三方内容。</div>
                        </div>
                        <Switch
                            checked={draft.syncPolicy === "full"}
                            onChange={(checked) => patch({ syncPolicy: checked ? "full" : "link-only", auditStatus: checked ? "approved" : "unverified" })}
                        />
                    </div>
                    {draft.syncPolicy === "full" ? (
                        <>
                            <Alert type="warning" showIcon message="仅在你已核验来源授权允许再分发、缓存和预览时开启。" />
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium">许可证标识</span>
                                <Input value={draft.licenseId} onChange={(event) => patch({ licenseId: event.target.value })} placeholder="例如 MIT、CC-BY-4.0" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium">许可证链接</span>
                                <Input value={draft.licenseUrl} onChange={(event) => patch({ licenseUrl: event.target.value })} placeholder="https://example.com/LICENSE" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium">署名文本</span>
                                <Input value={draft.attribution} onChange={(event) => patch({ attribution: event.target.value })} placeholder="版权所有者或贡献者" />
                            </label>
                        </>
                    ) : null}
                </section>
                <div className="flex items-center justify-between border-y border-stone-200 py-3 dark:border-stone-800">
                    <span className="text-sm font-medium">启用来源</span>
                    <Switch checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
                </div>
                <div>
                    <div className="mb-2 text-sm font-medium">JSON 格式</div>
                    <pre className="overflow-x-auto rounded-md bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{`[
  {
    "id": "product-photo-1",
    "title": "白底商品图",
    "prompt": "生成专业白底商品摄影图",
    "description": "",
    "coverUrl": "",
    "referenceImageUrls": [],
    "tags": ["商品", "摄影"]
  }
]`}</pre>
                </div>
            </div>
        </Drawer>
    );
}

function isHttpUrl(value: string) {
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}
