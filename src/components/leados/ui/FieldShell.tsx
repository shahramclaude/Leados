import { useId, type ReactNode } from "react";
import { cx } from "./cx";

export interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: (ids: { fieldId: string; describedBy?: string }) => ReactNode;
  className?: string;
}

/** Shared label/hint/error wrapper so every form control has identical,
 * accessible structure: visible label bound via htmlFor, hint + error
 * exposed through aria-describedby, error state announced via role=alert. */
export function FieldShell({ label, hint, error, required, htmlFor, children, className }: FieldShellProps) {
  const autoId = useId();
  const fieldId = htmlFor ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-[var(--space-1)]", className)}>
      {label && (
        <label htmlFor={fieldId} className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">
          {label}
          {required && <span className="ml-1 text-[var(--status-danger)]" aria-hidden>*</span>}
        </label>
      )}
      {children({ fieldId, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-[var(--text-xs)] text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[var(--text-xs)] font-medium text-[var(--status-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export const CONTROL_BASE =
  "w-full rounded-[var(--radius-md)] border bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";

export function controlBorder(hasError?: boolean) {
  return hasError ? "border-[var(--status-danger)]" : "border-[var(--border-strong)]";
}
