import type { ReactNode } from "react";
import { Panel } from "./Page";
import { cn } from "./cn";

export type MetricTone = "primary" | "success" | "danger" | "neutral";

const TONE_CLASS: Record<MetricTone, { icon: string; value: string }> = {
  primary: { icon: "bg-primary-fixed text-primary", value: "text-primary" },
  success: { icon: "bg-tertiary-fixed text-on-tertiary-fixed-variant", value: "text-tertiary" },
  danger: { icon: "bg-error-container text-error", value: "text-error" },
  neutral: { icon: "bg-secondary-container text-on-secondary-container", value: "text-on-surface" }
};

export function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral"
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: MetricTone;
}) {
  const toneClass = TONE_CLASS[tone];

  return (
    <Panel className="min-h-36 p-5">
      <div className={cn("mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-xl", toneClass.icon)}>{icon}</div>
      <p className="text-sm font-medium text-on-surface-variant">{label}</p>
      <p className={cn("mt-1 text-3xl font-bold leading-9", toneClass.value)}>{value}</p>
      {detail && <p className="mt-1 truncate text-xs text-on-surface-variant">{detail}</p>}
    </Panel>
  );
}
