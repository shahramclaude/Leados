"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";
import { CONTROL_BASE, FieldShell, controlBorder } from "./FieldShell";

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value" | "onChange"> {
  label?: string;
  hint?: string;
  error?: string;
  unit?: string;
  size?: "sm" | "md" | "lg";
  value?: number | "";
  onValueChange?: (value: number | "") => void;
}

const SIZE_CLASS = {
  sm: "h-[var(--control-height-sm)] text-[var(--text-xs)] px-[var(--space-2)]",
  md: "h-[var(--control-height-md)] text-[var(--text-sm)] px-[var(--space-3)]",
  lg: "h-[var(--control-height-lg)] text-[var(--text-base)] px-[var(--space-4)]",
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { label, hint, error, unit, size = "md", className, required, id, value, onValueChange, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {({ fieldId, describedBy }) => (
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => onValueChange?.(e.target.value === "" ? "" : Number(e.target.value))}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            required={required}
            className={cx(
              CONTROL_BASE,
              controlBorder(Boolean(error)),
              SIZE_CLASS[size],
              "font-mono-nums",
              unit && "pr-[var(--space-10)]",
              className,
            )}
            {...rest}
          />
          {unit && (
            <span className="pointer-events-none absolute inset-y-0 right-[var(--space-3)] flex items-center text-[var(--text-xs)] text-[var(--text-muted)]">
              {unit}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
});
