import type { CSSProperties } from "react";
import { Modal, Tag, Timeline } from "antd";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_VERSION, PUBLIC_SOURCE_URL } from "@/constant/env";
import { SOURCE_COMMIT } from "@/constant/runtime-config";

function getTagColor(type: string) {
    if (type === "新增") return "green";
    if (type === "修复") return "red";
    if (type === "调整") return "blue";
    if (type === "文档") return "purple";
    return "default";
}

function getReleaseTitle(version: string) {
    return version === "Unreleased" ? "未发布" : version;
}

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
};

export function VersionReleaseModal({ className, style }: VersionReleaseModalProps) {
    const { open, setOpen, openReleaseModal, latestVersion, releases } = useVersionCheck();

    return (
        <>
            <button
                type="button"
                className={className || "shrink-0 cursor-pointer text-xs font-medium text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"}
                style={style}
                onClick={openReleaseModal}
                title="查看版本更新"
            >
                {APP_VERSION}
            </button>
            <Modal title="版本更新" open={open} width={680} centered footer={null} onCancel={() => setOpen(false)}>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-xs text-stone-500 dark:text-stone-400">当前版本</div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{APP_VERSION}</div>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-xs text-stone-500 dark:text-stone-400">镜像内置发布版本</div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{latestVersion}</div>
                    </div>
                </div>
                <a
                    href={PUBLIC_SOURCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-5 block rounded-lg border border-stone-200 p-3 text-sm text-stone-700 transition hover:border-stone-400 dark:border-stone-800 dark:text-stone-300 dark:hover:border-stone-600"
                >
                    <span className="block text-xs text-stone-500 dark:text-stone-400">本服务对应源码</span>
                    <span className="mt-1 block font-mono text-xs">{SOURCE_COMMIT}</span>
                </a>
                <div className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <a href={`${PUBLIC_SOURCE_URL}/LICENSE`} target="_blank" rel="noreferrer" className="text-stone-600 underline-offset-2 hover:underline dark:text-stone-300">
                        AGPL-3.0 许可证
                    </a>
                    <a href={`${PUBLIC_SOURCE_URL}/NOTICE`} target="_blank" rel="noreferrer" className="text-stone-600 underline-offset-2 hover:underline dark:text-stone-300">
                        上游作者与版权声明
                    </a>
                    <a href={`${PUBLIC_SOURCE_URL}/UPSTREAM.md`} target="_blank" rel="noreferrer" className="text-stone-600 underline-offset-2 hover:underline dark:text-stone-300">
                        上游版本与同步策略
                    </a>
                    <a href={`${PUBLIC_SOURCE_URL}/PATCHES.md`} target="_blank" rel="noreferrer" className="text-stone-600 underline-offset-2 hover:underline dark:text-stone-300">
                        FYJIT 派生补丁说明
                    </a>
                    <a href={`${PUBLIC_SOURCE_URL}/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noreferrer" className="text-stone-600 underline-offset-2 hover:underline dark:text-stone-300">
                        第三方许可证清单
                    </a>
                </div>
                <div className="max-h-[56vh] overflow-y-auto pr-2">
                    <Timeline
                        items={releases.map((release) => ({
                            content: (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-stone-950 dark:text-stone-100">{getReleaseTitle(release.version)}</span>
                                        <span className="text-xs text-stone-500 dark:text-stone-400">{release.date}</span>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {release.version === latestVersion ? <Tag color="green">最新</Tag> : null}
                                            {release.version === APP_VERSION ? <Tag>当前</Tag> : null}
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {release.items.map((item, index) => (
                                            <div key={`${release.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                                                <Tag color={getTagColor(item.type)} className="m-0 mt-0.5 shrink-0 whitespace-nowrap">
                                                    {item.type}
                                                </Tag>
                                                <span className="min-w-0 flex-1">{item.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </Modal>
        </>
    );
}
