"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { CONTROL_BASE, FieldShell, controlBorder } from "./FieldShell";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  size?: "sm" | "md" | "lg";
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const SIZE_CLASS = {
  sm: "h-[var(--control-height-sm)] text-[var(--text-xs)] px-[var(--space-2)]",
  md: "h-[var(--control-height-md)] text-[var(--text-sm)] px-[var(--space-3)]",
  lg: "h-[var(--control-height-lg)] text-[var(--text-base)] px-[var(--space-4)]",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, size = "md", iconLeft, iconRight, className, required, id, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {({ fieldId, describedBy }) => (
        <div className="relative">
          {iconLeft && (
            <span className="pointer-events-none absolute inset-y-0 left-[var(--space-2)] flex items-center text-[var(--text-muted)]" aria-hidden>
              {iconLeft}
            </span>
          )}
          <input
            ref={ref}
            id={fieldId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            required={required}
            className={cx(
              CONTROL_BASE,
              controlBorder(Boolean(error)),
              SIZE_CLASS[size],
              iconLeft && "pl-[var(--space-8)]",
              iconRight && "pr-[var(--space-8)]",
              className,
            )}
            {...rest}
          />
          {iconRight && (
            <span className="pointer-events-none absolute inset-y-0 right-[var(--space-2)] flex items-center text-[var(--text-muted)]" aria-hidden>
              {iconRight}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
});
