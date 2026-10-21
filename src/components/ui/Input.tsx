import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
}

/**
 * Input — single text-field implementation. States: default / hover /
 * focus-visible / disabled / error (with recovery message) — error always
 * ties to the field via aria-describedby, never color alone.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hideLabel, error, hint, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={cn("text-[var(--text-sm)] font-medium text-[var(--text-secondary)]", hideLabel && "visually-hidden")}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          "h-10 rounded-[var(--radius-md)] border bg-[var(--surface-1)] px-3 text-[var(--text-base)] text-[var(--text-primary)]",
          "placeholder:text-[var(--text-disabled)]",
          "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease-standard)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          error ? "border-[var(--danger-solid)]" : "border-[var(--border-default)] hover:border-[var(--border-strong)]",
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-[var(--text-sm)] text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-[var(--text-sm)] font-medium text-[var(--danger-ink)]">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      )}
    </div>
  );
});
