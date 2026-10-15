import { App, Button, Select, Switch, Tag } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Flag, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PromptSourceEditorDrawer } from "./prompt-source-editor-drawer";
import { PromptSourceContentModal } from "./prompt-source-content-modal";
import { fetchPromptSourceStatuses, refreshAllSources, refreshSource } from "@/services/api/prompts";
import { CREATIVE_PROMPT_LIST_QUERY_ROOT } from "@/services/creative-prompt-list";
import { PROMPT_SOURCE_INTERVALS, usePromptSourceStore } from "@/stores/use-prompt-source-store";
import { canSyncPromptSource, isPromptSourceApproved, isPromptSourceDisabledByServer, type PromptSource } from "@/services/api/prompt-source-presets";
import { PromptSourceReportModal } from "./prompt-source-report-modal";

const STATUS_QUERY_KEY = ["prompt-source-statuses"];

export function ConfigPromptSources() {
    const { message, modal } = App.useApp();
    const { i18n, t } = useTranslation();
    const queryClient = useQueryClient();
    const sources = usePromptSourceStore((state) => state.sources);
    const schedule = usePromptSourceStore((state) => state.schedule);
    const addSource = usePromptSourceStore((state) => state.addSource);
    const saveSource = usePromptSourceStore((state) => state.saveSource);
    const removeSource = usePromptSourceStore((state) => state.removeSource);
    const toggleSource = usePromptSourceStore((state) => state.toggleSource);
    const updateSchedule = usePromptSourceStore((state) => state.updateSchedule);
    const statusQuery = useQuery({ queryKey: STATUS_QUERY_KEY, queryFn: fetchPromptSourceStatuses });

    const [editingSource, setEditingSource] = useState<PromptSource | null>(null);
    const [viewingId, setViewingId] = useState("");
    const [refreshingId, setRefreshingId] = useState("");
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [reportingSource, setReportingSource] = useState<PromptSource | null>(null);
    const viewingSource = sources.find((item) => item.id === viewingId) || null;
    const intervalOptions = PROMPT_SOURCE_INTERVALS.map((value) => ({ value, label: t(`config.promptSources.intervals.${intervalKey(value)}`) }));

    const invalidatePrompts = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["prompts"] }),
            queryClient.invalidateQueries({ queryKey: ["side-panel-prompts"] }),
            queryClient.invalidateQueries({ queryKey: CREATIVE_PROMPT_LIST_QUERY_ROOT }),
            queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY }),
        ]);
    };

    const handleSave = (source: PromptSource) => {
        saveSource(source);
        void invalidatePrompts();
    };

    const handleDelete = (source: PromptSource) => {
        modal.confirm({
            title: t("config.promptSources.deleteTitle", { name: source.name }),
            content: t("config.promptSources.deleteDescription"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                removeSource(source.id);
                await invalidatePrompts();
            },
        });
    };

    const handleRefreshOne = async (source: PromptSource) => {
        setRefreshingId(source.id);
        try {
            const result = await refreshSource(source.id);
            await invalidatePrompts();
            message.success(t("config.promptSources.refreshed", { name: source.name, count: result.count }));
        } catch (error) {
            await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
            message.error(error instanceof Error ? error.message : t("config.promptSources.refreshFailedCached"));
        } finally {
            setRefreshingId("");
        }
    };

    const handleRefreshAll = async () => {
        setRefreshingAll(true);
        try {
            const result = await refreshAllSources();
            updateSchedule("lastFetchedAt", new Date().toISOString());
            await invalidatePrompts();
            if (result.failureCount) message.warning(t("config.promptSources.refreshPartial", { success: result.successCount, failed: result.failureCount }));
            else message.success(t("config.promptSources.refreshAllSuccess", { sources: result.successCount, total: result.total }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.promptSources.refreshFailed"));
        } finally {
            setRefreshingAll(false);
        }
    };

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setEditingSource(addSource())}>
                    {t("config.promptSources.add")}
                </Button>
            </div>

            <div className="space-y-2">
                {sources.map((source) => {
                    const status = statusQuery.data?.[source.id];
                    const canSync = canSyncPromptSource(source);
                    const approved = isPromptSourceApproved(source);
                    const takenDown = isPromptSourceDisabledByServer(source.id);
                    return (
                        <div key={source.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                            <Switch
                                aria-label={`启用来源 ${source.name}`}
                                size="small"
                                checked={source.enabled && !takenDown}
                                disabled={takenDown}
                                onChange={(checked) => {
                                    toggleSource(source.id, checked);
                                    void invalidatePrompts();
                                }}
                            />
                            <div className="min-w-[220px] flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold">{source.name}</span>
                                    {source.builtIn ? <Tag className="m-0 shrink-0 text-[10px]">内置</Tag> : null}
                                    {approved ? (
                                        <Tag color="blue" className="m-0 shrink-0 text-[10px]">
                                            完整同步
                                        </Tag>
                                    ) : (
                                        <Tag color="gold" className="m-0 shrink-0 text-[10px]">
                                            仅外链
                                        </Tag>
                                    )}
                                    {takenDown ? (
                                        <Tag color="error" className="m-0 shrink-0 text-[10px]">
                                            站点已下架
                                        </Tag>
                                    ) : null}
                                </div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                                    <a className="max-w-full truncate hover:text-stone-800 hover:underline dark:hover:text-stone-200" href={source.homepage || source.url} target="_blank" rel="noreferrer">
                                        {source.homepage || source.url}
                                    </a>
                                    {source.licenseUrl ? (
                                        <a className="hover:underline" href={source.licenseUrl} target="_blank" rel="noreferrer">
                                            {source.licenseId}
                                        </a>
                                    ) : (
                                        <span>{source.licenseId || "许可证未核验"}</span>
                                    )}
                                    {approved ? <span className="tabular-nums">{status?.count ?? 0} 条</span> : null}
                                    {approved ? (
                                        status?.lastError ? (
                                            <Tag color="error" className="m-0 text-[10px]" title={status.lastError}>
                                                失败
                                            </Tag>
                                        ) : status?.lastSuccessAt ? (
                                            <Tag color="success" className="m-0 text-[10px]">
                                                正常
                                            </Tag>
                                        ) : (
                                            <Tag className="m-0 text-[10px]">未同步</Tag>
                                        )
                                    ) : null}
                                    {approved ? <span>{status?.lastSuccessAt ? `上次成功 ${formatTime(status.lastSuccessAt)}` : "尚未拉取"}</span> : <span>不下载正文或预览</span>}
                                </div>
                            </div>
                            <div className="ml-auto flex flex-wrap justify-end gap-2">
                                <Button size="small" icon={<Eye className="size-3.5" />} disabled={!canSync} onClick={() => setViewingId(source.id)}>
                                    查看内容
                                </Button>
                                <Button size="small" icon={<RefreshCw className="size-3.5" />} disabled={!canSync} loading={refreshingId === source.id} onClick={() => void handleRefreshOne(source)}>
                                    立即拉取
                                </Button>
                                {!source.builtIn ? (
                                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingSource(source)}>
                                        编辑来源
                                    </Button>
                                ) : null}
                                {!source.builtIn ? (
                                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => handleDelete(source)}>
                                        删除
                                    </Button>
                                ) : null}
                                <Button size="small" danger icon={<Flag className="size-3.5" />} onClick={() => setReportingSource(source)}>
                                    举报来源
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <section className="mt-5 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-3 text-sm font-semibold">{t("config.promptSources.schedule")}</div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">{t("config.promptSources.interval")}</span>
                        <Select size="small" className="w-36" value={schedule.intervalMinutes} options={intervalOptions} onChange={(value) => updateSchedule("intervalMinutes", value)} />
                    </div>
                    <Button size="small" type="primary" icon={<RefreshCw className="size-3.5" />} loading={refreshingAll} onClick={() => void handleRefreshAll()}>
                        {t("config.promptSources.refreshAll")}
                    </Button>
                    <span className="text-xs text-stone-500">{schedule.lastFetchedAt ? t("config.promptSources.lastFetched", { time: formatTime(schedule.lastFetchedAt, i18n.resolvedLanguage) }) : t("config.promptSources.neverScheduled")}</span>
                </div>
                <div className="mt-2 text-xs text-stone-400">开启周期后，页面打开期间只会拉取已启用且授权审计通过的来源；仅外链来源不会下载或缓存内容。</div>
            </section>

            <PromptSourceEditorDrawer open={Boolean(editingSource)} source={editingSource} onSave={handleSave} onClose={() => setEditingSource(null)} />
            <PromptSourceContentModal source={viewingSource} onClose={() => setViewingId("")} />
            <PromptSourceReportModal source={reportingSource} prompt={null} onClose={() => setReportingSource(null)} />
        </div>
    );
}

function formatTime(value: string, locale?: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function intervalKey(value: number) {
    if (value === 30) return "minutes30";
    if (value === 60) return "hour1";
    if (value === 360) return "hours6";
    if (value === 1440) return "hours24";
    return "disabled";
}
