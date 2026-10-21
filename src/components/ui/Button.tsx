import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--domain-strategy-solid)] text-[var(--text-inverse)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--surface-sunken)]",
  ghost: "bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
  danger: "bg-[var(--danger-solid)] text-[var(--text-inverse)] hover:brightness-110 active:brightness-95",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[var(--text-sm)] gap-1.5",
  md: "h-10 px-4 text-[var(--text-base)] gap-2",
  lg: "h-12 px-5 text-[var(--text-md)] gap-2.5",
};

/**
 * Button — single implementation for every clickable action in the product.
 * States covered: default / hover / active / :focus-visible / disabled / loading.
 * Loading swaps the label for a spinner + "Working…" live-region text so
 * screen reader users get the same state change as sighted users.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium",
        "transition-[filter,background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease-standard)]",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          <span>Working…</span>
          <span className="visually-hidden" role="status">
            Loading
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
