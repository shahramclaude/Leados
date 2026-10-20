"use client";

import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface FieldChromeProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  id?: string;
}

function FieldShell({
  label,
  hint,
  error,
  required,
  id,
  children,
}: FieldChromeProps & { children: (ids: { inputId: string; descId?: string }) => React.ReactNode }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = hint || error ? `${inputId}-desc` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-status-danger">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children({ inputId, descId })}
      {error ? (
        <p id={descId} role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">, FieldChromeProps {
  size?: "sm" | "md" | "lg";
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

const CONTROL_HEIGHT: Record<"sm" | "md" | "lg", string> = {
  sm: "h-[var(--comp-control-height-sm)] text-sm",
  md: "h-[var(--comp-control-height-md)] text-sm",
  lg: "h-[var(--comp-control-height-lg)] text-base",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, id, size = "md", leading, trailing, className = "", ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} id={id}>
      {({ inputId, descId }) => (
        <div
          className={[
            "flex items-center gap-2 rounded-[var(--radius-sm)] border bg-surface-base px-3",
            "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
            error ? "border-status-danger" : "border-border-subtle",
            CONTROL_HEIGHT[size],
          ].join(" ")}
        >
          {leading}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={descId}
            aria-required={required || undefined}
            className={["w-full bg-transparent text-text-primary outline-none placeholder:text-text-muted", className].join(
              " ",
            )}
            {...rest}
          />
          {trailing}
        </div>
      )}
    </FieldShell>
  );
});

export interface NumberInputProps extends Omit<InputProps, "type" | "onChange"> {
  unit?: string;
  value?: number | "";
  onChange?: (value: number | "") => void;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { unit, value, onChange, trailing, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      value={value}
      data-numeric="true"
      onChange={(event) => {
        const raw = event.target.value;
        onChange?.(raw === "" ? "" : Number(raw));
      }}
      trailing={
        unit ? (
          <span className="shrink-0 text-xs font-medium text-text-muted" aria-hidden="true">
            {unit}
          </span>
        ) : (
          trailing
        )
      }
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldChromeProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, id, className = "", rows = 4, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} id={id}>
      {({ inputId, descId }) => (
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={descId}
          aria-required={required || undefined}
          className={[
            "max-w-[75ch] rounded-[var(--radius-sm)] border bg-surface-base px-3 py-2 text-sm text-text-primary outline-none",
            "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]",
            error ? "border-status-danger" : "border-border-subtle",
            className,
          ].join(" ")}
          {...rest}
        />
      )}
    </FieldShell>
  );
});
