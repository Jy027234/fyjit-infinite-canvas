import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function CreativeResultCardShell({ media, footer, className, footerClassName }: { media: ReactNode; footer: ReactNode; className?: string; footerClassName?: string }) {
    return (
        <article className={cn("overflow-hidden rounded-lg border border-border bg-background", className)}>
            {media}
            <div className={cn("border-t border-border px-3 py-2.5", footerClassName)}>{footer}</div>
        </article>
    );
}
