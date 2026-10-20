"use client";

import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { CONTROL_BASE, FieldShell, controlBorder } from "./FieldShell";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  size?: "sm" | "md" | "lg";
  options: SelectOption[];
  placeholder?: string;
}

const SIZE_CLASS = {
  sm: "h-[var(--control-height-sm)] text-[var(--text-xs)] pl-[var(--space-2)] pr-[var(--space-6)]",
  md: "h-[var(--control-height-md)] text-[var(--text-sm)] pl-[var(--space-3)] pr-[var(--space-7)]",
  lg: "h-[var(--control-height-lg)] text-[var(--text-base)] pl-[var(--space-4)] pr-[var(--space-8)]",
};

/** A styled native <select>: keyboard interaction (type-ahead, arrow keys,
 * Home/End), screen-reader semantics, and mobile affordances come free from
 * the platform instead of being re-implemented with ARIA. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, size = "md", options, placeholder, className, required, id, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {({ fieldId, describedBy }) => (
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            required={required}
            defaultValue={rest.defaultValue ?? (placeholder ? "" : undefined)}
            className={cx(CONTROL_BASE, controlBorder(Boolean(error)), SIZE_CLASS[size], "appearance-none", className)}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            className="pointer-events-none absolute right-[var(--space-2)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </FieldShell>
  );
});
