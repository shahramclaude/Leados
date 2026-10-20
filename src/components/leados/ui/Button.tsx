"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-default)] text-[var(--accent-text-on)] border border-transparent hover:bg-[var(--accent-hover)] active:brightness-95 disabled:opacity-50",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--text-primary)] border border-transparent hover:bg-[var(--surface-sunken)] disabled:opacity-50",
  subtle:
    "bg-[var(--accent-subtle)] text-[var(--accent-default)] border border-transparent hover:brightness-95 disabled:opacity-50",
  danger:
    "bg-[var(--status-danger)] text-[var(--text-inverse)] border border-transparent hover:brightness-95 disabled:opacity-50",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-[var(--control-height-sm)] px-[var(--space-3)] text-[var(--text-xs)] gap-[var(--space-1)] rounded-[var(--radius-sm)]",
  md: "h-[var(--control-height-md)] px-[var(--space-4)] text-[var(--text-sm)] gap-[var(--space-2)] rounded-[var(--radius-md)]",
  lg: "h-[var(--control-height-lg)] px-[var(--space-5)] text-[var(--text-base)] gap-[var(--space-2)] rounded-[var(--radius-md)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "sm" ? 12 : size === "lg" ? 18 : 14} />
      ) : (
        iconLeft && <span className="inline-flex shrink-0 items-center" aria-hidden>{iconLeft}</span>
      )}
      {children && <span className={loading ? "opacity-70" : undefined}>{children}</span>}
      {!loading && iconRight && <span className="inline-flex shrink-0 items-center" aria-hidden>{iconRight}</span>}
    </button>
  );
});
