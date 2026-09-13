import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CreativeCardActionBarProps = {
    status?: ReactNode;
    primary?: ReactNode;
    secondary?: ReactNode;
    destructive?: ReactNode;
    className?: string;
};

export function CreativeCardActionBar({ status, primary, secondary, destructive, className }: CreativeCardActionBarProps) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center", className)}>
            {status ? <div className="min-w-0 sm:mr-auto">{status}</div> : null}
            <div className="grid min-w-0 grid-cols-2 gap-2 [&_.ant-btn]:w-full sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:[&_.ant-btn]:w-auto">
                {primary ? (
                    <div className="contents" data-action-priority="primary">
                        {primary}
                    </div>
                ) : null}
                {secondary ? (
                    <div className="contents" data-action-priority="secondary">
                        {secondary}
                    </div>
                ) : null}
                {destructive ? (
                    <div className="contents" data-action-priority="destructive">
                        {destructive}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
