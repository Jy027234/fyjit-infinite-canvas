import { App, Form, Input, Modal, Select } from "antd";
import { useEffect, useState } from "react";

import { createCreativePromptSourceReport, type CreativePromptSourceReportInput } from "@/services/api/creative";
import type { Prompt } from "@/services/api/prompts";
import type { PromptSource } from "@/services/api/prompt-source-presets";

type ReportValues = Pick<CreativePromptSourceReportInput, "reason" | "details">;

const reasonOptions: Array<{ label: string; value: ReportValues["reason"] }> = [
    { label: "版权或授权问题", value: "copyright" },
    { label: "署名不完整", value: "attribution" },
    { label: "不安全或违规内容", value: "unsafe" },
    { label: "隐私问题", value: "privacy" },
    { label: "链接或内容失效", value: "broken" },
    { label: "其他", value: "other" },
];

export function PromptSourceReportModal({ source, prompt, onClose }: { source: PromptSource | null; prompt: Prompt | null; onClose: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<ReportValues>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (source) form.setFieldsValue({ reason: "copyright", details: "" });
    }, [form, source, prompt]);

    const submit = async () => {
        if (!source) return;
        const values = await form.validateFields();
        setSubmitting(true);
        try {
            await createCreativePromptSourceReport({
                source_id: source.id,
                source_name: source.name,
                prompt_external_id: prompt?.id,
                prompt_title: prompt?.title,
                source_url: prompt?.githubUrl || source.homepage || source.url,
                reason: values.reason,
                details: values.details.trim(),
            });
            message.success("举报已提交，管理员会按审计流程处理");
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "举报提交失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={prompt ? `举报「${prompt.title}」` : `举报来源「${source?.name || ""}」`} open={Boolean(source)} onCancel={onClose} onOk={() => void submit()} okText="提交举报" cancelText="取消" confirmLoading={submitting} destroyOnHidden>
            <p className="mb-4 text-sm leading-6 text-stone-500 dark:text-stone-400">仅提交来源、条目标识和你的说明，不会把远程提示词正文复制到 FYJIT。恶意或重复举报可能被审计。</p>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="reason" label="问题类型" rules={[{ required: true, message: "请选择问题类型" }]}>
                    <Select options={reasonOptions} />
                </Form.Item>
                <Form.Item name="details" label="问题说明" rules={[{ required: true, whitespace: true, min: 8, max: 2000, message: "请填写 8–2000 字的问题说明" }]}>
                    <Input.TextArea rows={5} maxLength={2000} showCount placeholder="请说明具体问题、权利依据或需要核查的内容" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
