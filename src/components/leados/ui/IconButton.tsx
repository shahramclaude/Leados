"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import type { ButtonSize, ButtonVariant } from "./Button";
import { Spinner } from "./Spinner";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  icon: ReactNode;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent-default)] text-[var(--accent-text-on)] hover:bg-[var(--accent-hover)]",
  secondary: "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]",
  ghost: "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
  subtle: "bg-[var(--accent-subtle)] text-[var(--accent-default)] hover:brightness-95",
  danger: "bg-[var(--status-danger-subtle)] text-[var(--status-danger)] hover:brightness-95",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-[var(--control-height-sm)] w-[var(--control-height-sm)] rounded-[var(--radius-sm)]",
  md: "h-[var(--control-height-md)] w-[var(--control-height-md)] rounded-[var(--radius-md)]",
  lg: "h-[var(--control-height-lg)] w-[var(--control-height-lg)] rounded-[var(--radius-md)]",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", size = "md", loading, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 12 : 14} /> : <span aria-hidden className="inline-flex items-center justify-center">{icon}</span>}
    </button>
  );
});
