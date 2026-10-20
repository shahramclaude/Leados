"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, className = "", ...rest },
  ref,
) {
  const autoId = useId();
  const checkboxId = id ?? autoId;
  return (
    <label htmlFor={checkboxId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
      <input
        ref={ref}
        id={checkboxId}
        type="checkbox"
        className={[
          "h-4 w-4 rounded-[4px] border border-border-strong accent-[var(--accent-default)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          className,
        ].join(" ")}
        {...rest}
      />
      {label}
    </label>
  );
});

export interface RadioGroupOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  name: string;
  label?: string;
  options: RadioGroupOption[];
  value: string;
  onChange: (value: string) => void;
}

export function RadioGroup({ name, label, options, value, onChange }: RadioGroupProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      {label ? <legend className="text-sm font-medium text-text-secondary">{label}</legend> : null}
      <div role="radiogroup" className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option.value} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 border border-border-strong accent-[var(--accent-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}

export function Switch({ label, checked, onChange, description, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
        {description ? <p className="text-xs text-text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          checked ? "border-transparent bg-accent-default" : "border-border-strong bg-surface-sunken",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[var(--elevation-1)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
