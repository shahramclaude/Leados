"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-default text-accent-contrast border border-transparent hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "bg-surface-raised text-text-primary border border-border-strong hover:bg-surface-sunken",
  outline:
    "bg-transparent text-text-primary border border-border-subtle hover:border-border-strong hover:bg-surface-sunken",
  ghost: "bg-transparent text-text-primary border border-transparent hover:bg-surface-sunken",
  danger:
    "bg-status-danger text-white border border-transparent hover:opacity-90 active:opacity-80",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-[var(--comp-control-height-sm)] px-3 text-sm gap-1.5",
  md: "h-[var(--comp-control-height-md)] px-4 text-sm gap-2",
  lg: "h-[var(--comp-control-height-lg)] px-5 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    iconStart,
    iconEnd,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      className={[
        "inline-flex select-none items-center justify-center rounded-[var(--radius-sm)] font-medium",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        iconStart
      )}
      <span className={loading ? "opacity-80" : undefined}>{children}</span>
      {!loading ? iconEnd : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  icon: ReactNode;
  loading?: boolean;
}

const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-[var(--comp-control-height-sm)] w-[var(--comp-control-height-sm)]",
  md: "h-[var(--comp-control-height-md)] w-[var(--comp-control-height-md)]",
  lg: "h-[var(--comp-control-height-lg)] w-[var(--comp-control-height-lg)]",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", size = "md", label, icon, loading, disabled, className = "", ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center rounded-[var(--radius-sm)]",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        ICON_SIZE_CLASSES[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon
      )}
    </button>
  );
});
