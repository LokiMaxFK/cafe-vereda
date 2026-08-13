import type { ReactNode } from "react";

export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 text-on-surface-variant">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-4 py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container-high text-3xl text-on-surface-variant">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-on-surface-variant">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" }) {
  return (
    <div
      role="status"
      className={
        tone === "error"
          ? "rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm text-on-error-container"
          : "rounded-xl border border-tertiary/20 bg-tertiary-fixed px-4 py-3 text-sm text-on-tertiary-fixed"
      }
    >
      {children}
    </div>
  );
}
