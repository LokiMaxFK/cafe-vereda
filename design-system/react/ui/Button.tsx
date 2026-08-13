import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "success" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-on-primary hover:bg-primary-container",
  secondary:
    "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-outline hover:bg-surface-container-low",
  success: "border-tertiary bg-tertiary text-on-tertiary hover:bg-tertiary-container",
  ghost: "border-transparent bg-transparent text-on-surface-variant hover:bg-surface-container-high",
  danger: "border-error/20 bg-error-container text-on-error-container hover:border-error/40"
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-touch-target-min px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
  icon: "h-touch-target-min w-touch-target-min p-0"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, variant = "secondary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className
      )}
      {...props}
    />
  );
}
