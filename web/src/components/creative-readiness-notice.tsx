import { Alert, Button } from "antd";
import { RefreshCw } from "lucide-react";

import { FYJIT_HOME_URL } from "@/constant/runtime-config";
import { useFyjitStore } from "@/stores/use-fyjit-store";

type CreativeReadinessNoticeProps = {
    capabilityLabel: string;
    hasModel: boolean;
    hasToken: boolean;
};

function fyjitUrl(path: string) {
    return new URL(path, new URL(FYJIT_HOME_URL, window.location.origin).origin).toString();
}

export function CreativeReadinessNotice({ capabilityLabel, hasModel, hasToken }: CreativeReadinessNoticeProps) {
    const bootstrapStatus = useFyjitStore((state) => state.bootstrapStatus);
    const capabilitiesStatus = useFyjitStore((state) => state.capabilitiesStatus);
    const capabilitiesError = useFyjitStore((state) => state.capabilitiesError);
    const modelsStatus = useFyjitStore((state) => state.modelsStatus);
    const modelsError = useFyjitStore((state) => state.modelsError);
    const tokensStatus = useFyjitStore((state) => state.tokensStatus);
    const tokensError = useFyjitStore((state) => state.tokensError);
    const loadCapabilities = useFyjitStore((state) => state.loadCapabilities);
    const loadModels = useFyjitStore((state) => state.loadModels);
    const loadTokens = useFyjitStore((state) => state.loadTokens);

    const capabilitiesLoading = capabilitiesStatus === "loading" || (bootstrapStatus === "ready" && capabilitiesStatus === "idle");
    const capabilitiesFailed = capabilitiesStatus === "error";
    const modelLoading = !hasModel && (modelsStatus === "loading" || (bootstrapStatus === "ready" && modelsStatus === "idle"));
    const tokenLoading = !hasToken && (tokensStatus === "loading" || (bootstrapStatus === "ready" && tokensStatus === "idle"));
    const modelFailed = !hasModel && modelsStatus === "error";
    const tokenFailed = !hasToken && tokensStatus === "error";
    const loading = capabilitiesLoading || modelLoading || tokenLoading;
    const failed = capabilitiesFailed || modelFailed || tokenFailed;
    if (hasModel && hasToken && !capabilitiesFailed && !capabilitiesLoading) return null;
    const retry = () => {
        if (capabilitiesStatus !== "loading") void loadCapabilities();
        if (!hasModel && modelsStatus !== "loading") void loadModels();
        if (!hasToken && tokensStatus !== "loading") void loadTokens();
    };

    const missing = [!hasModel ? `${capabilityLabel}模型` : "", !hasToken ? "可用本站 Token 或余额" : ""].filter(Boolean).join("、");
    const failureMessages = [capabilitiesFailed ? capabilitiesError || "创作能力列表读取失败" : "", modelFailed ? modelsError || `${capabilityLabel}模型列表读取失败` : "", tokenFailed ? tokensError || "本站 Token 列表读取失败" : ""].filter(Boolean);
    return (
        <Alert
            type={failed ? "error" : loading ? "info" : "warning"}
            showIcon
            message={failed ? `${capabilityLabel}创作资源加载失败` : loading ? `正在加载${missing || "创作能力"}` : `当前账号缺少${missing}`}
            description={
                <div>
                    <p>
                        {failed ? `${failureMessages.join("；")}。` : null}
                        {loading ? "模型和 Token 正在独立加载，其他创作素材仍可继续使用。" : null}
                        {!failed && !loading
                            ? `创作中心直接使用当前账号的 FYJIT 本站 Token，不需要填写上游 API Key。${!hasModel ? `${capabilityLabel}工作台只显示具备对应能力的模型；其他类型模型不会混入，请联系管理员为当前分组新增或开放${capabilityLabel}模型。` : ""}${!hasToken ? "请同时创建本站 Token 或确认余额后重试。" : ""}`
                            : null}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {failed ? (
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={retry}>
                                重试加载
                            </Button>
                        ) : null}
                        {!hasToken && !tokenFailed ? (
                            <Button size="small" href={fyjitUrl("/keys")}>
                                创建或检查 Token
                            </Button>
                        ) : null}
                        {!hasToken && !tokenFailed ? (
                            <Button size="small" href={fyjitUrl("/console/topup")}>
                                充值
                            </Button>
                        ) : null}
                        {!hasModel && !modelFailed ? (
                            <Button size="small" href={fyjitUrl("/pricing")}>
                                查看可用模型
                            </Button>
                        ) : null}
                    </div>
                </div>
            }
        />
    );
}
