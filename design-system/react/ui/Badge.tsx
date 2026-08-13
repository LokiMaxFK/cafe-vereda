import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "primary" | "success" | "danger" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  primary: "bg-primary-fixed text-on-primary-fixed-variant",
  success: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  danger: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant"
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", TONE_CLASS[tone], className)}
      {...props}
    />
  );
}
