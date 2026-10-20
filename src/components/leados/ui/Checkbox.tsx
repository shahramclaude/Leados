"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <label htmlFor={fieldId} className={cx("group flex cursor-pointer items-start gap-[var(--space-2)]", className)}>
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        className={cx(
          "mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-[var(--border-strong)] accent-[var(--accent-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        )}
        {...rest}
      />
      <span className="flex flex-col">
        <span className="text-[var(--text-sm)] text-[var(--text-primary)]">{label}</span>
        {description && <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{description}</span>}
      </span>
    </label>
  );
});
