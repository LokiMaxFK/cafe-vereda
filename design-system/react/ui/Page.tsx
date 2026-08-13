import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type PageSize = "compact" | "default" | "wide";

const PAGE_SIZE_CLASS: Record<PageSize, string> = {
  compact: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-[1400px]"
};

export function Page({ children, size = "default", className }: { children: ReactNode; size?: PageSize; className?: string }) {
  return (
    <div className={cn("w-full px-4 py-5 sm:px-6 sm:py-8 lg:px-8", className)}>
      <div className={cn("mx-auto w-full", PAGE_SIZE_CLASS[size])}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-bold text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-bold leading-8 text-on-surface sm:text-3xl sm:leading-10">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant sm:text-base">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-outline-variant/35 bg-surface-container-lowest shadow-panel", className)}
      {...props}
    />
  );
}

export function SectionHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-lg font-semibold text-on-surface sm:text-xl">{title}</h2>
      {action}
    </div>
  );
}
