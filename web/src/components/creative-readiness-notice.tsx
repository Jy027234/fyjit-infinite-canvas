import { Alert, Button } from "antd";

import { FYJIT_HOME_URL } from "@/constant/runtime-config";

type CreativeReadinessNoticeProps = {
    capabilityLabel: string;
    hasModel: boolean;
    hasToken: boolean;
};

function fyjitUrl(path: string) {
    return new URL(path, new URL(FYJIT_HOME_URL, window.location.origin).origin).toString();
}

export function CreativeReadinessNotice({ capabilityLabel, hasModel, hasToken }: CreativeReadinessNoticeProps) {
    if (hasModel && hasToken) return null;

    const missing = [!hasModel ? `${capabilityLabel}模型` : "", !hasToken ? "可用本站 Token 或余额" : ""].filter(Boolean).join("、");
    return (
        <Alert
            type="warning"
            showIcon
            message={`当前账号缺少${missing}`}
            description={
                <div>
                    <p>创作中心不会要求填写上游 API Key。请在 FYJIT 完成站内配置，或联系管理员开放当前分组的模型。</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {!hasToken ? <Button size="small" href={fyjitUrl("/keys")}>创建或检查 Token</Button> : null}
                        {!hasToken ? <Button size="small" href={fyjitUrl("/console/topup")}>充值</Button> : null}
                        {!hasModel ? <Button size="small" href={fyjitUrl("/pricing")}>查看可用模型</Button> : null}
                    </div>
                </div>
            }
        />
    );
}
