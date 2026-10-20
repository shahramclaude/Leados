"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";
import { CONTROL_BASE, FieldShell, controlBorder } from "./FieldShell";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, required, id, rows = 4, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {({ fieldId, describedBy }) => (
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          required={required}
          className={cx(
            CONTROL_BASE,
            controlBorder(Boolean(error)),
            "max-w-[var(--measure-prose)] resize-y p-[var(--space-3)] text-[var(--text-sm)] leading-[var(--leading-normal)]",
            className,
          )}
          {...rest}
        />
      )}
    </FieldShell>
  );
});
