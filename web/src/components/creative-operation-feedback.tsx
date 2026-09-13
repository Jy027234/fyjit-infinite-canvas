import type { ReactNode } from "react";
import { Alert } from "antd";

export type CreativeOperationFeedbackState = {
    type: "success" | "info" | "warning" | "error";
    message: ReactNode;
    description?: ReactNode;
};

type CreativeOperationFeedbackProps = {
    feedback?: CreativeOperationFeedbackState;
    action?: ReactNode;
    className?: string;
    onClose: () => void;
};

export function CreativeOperationFeedback({ feedback, action, className, onClose }: CreativeOperationFeedbackProps) {
    if (!feedback) return null;

    return <Alert className={className} type={feedback.type} showIcon closable message={feedback.message} description={feedback.description} action={action} onClose={onClose} />;
}
