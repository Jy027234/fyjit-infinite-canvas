import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function FyjitPageHeader({ title, description, actions, centered = false, className }: { title: string; description?: ReactNode; actions?: ReactNode; centered?: boolean; className?: string }) {
    return (
        <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", centered && "text-center sm:block", className)}>
            <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
                {description ? <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div> : null}
            </div>
            {actions ? <div className={cn("flex shrink-0 flex-wrap gap-2", centered && "mt-4 justify-center")}>{actions}</div> : null}
        </header>
    );
}

export function FyjitSurface({ children, className }: { children: ReactNode; className?: string }) {
    return <section className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-[var(--fyjit-shadow-sm)]", className)}>{children}</section>;
}

export function FyjitEmptyState({ icon: Icon, title, description, actions, className }: { icon: LucideIcon; title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
    return (
        <div className={cn("flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center", className)}>
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-primary">
                <Icon className="size-6" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</div> : null}
            {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
        </div>
    );
}

type TaskTone = "pending" | "success" | "error";

export function FyjitTaskStatus({ tone, title, description, actions, compact = false, className }: { tone: TaskTone; title: string; description?: ReactNode; actions?: ReactNode; compact?: boolean; className?: string }) {
    const Icon = tone === "pending" ? LoaderCircle : tone === "success" ? CheckCircle2 : AlertCircle;
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            aria-live={tone === "pending" ? "polite" : undefined}
            className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-xl border px-5 text-center",
                compact ? "min-h-44 py-6" : "min-h-72 py-10",
                tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/25 text-foreground",
                className,
            )}
        >
            <Icon className={cn("size-6", tone === "pending" && "animate-spin text-primary", tone === "success" && "text-[var(--fyjit-color-success)]")} aria-hidden="true" />
            <div>
                <div className="text-sm font-semibold">{title}</div>
                {description ? <div className={cn("mt-2 max-w-lg text-xs leading-5", tone === "error" ? "text-destructive/80" : "text-muted-foreground")}>{description}</div> : null}
            </div>
            {actions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
        </div>
    );
}
