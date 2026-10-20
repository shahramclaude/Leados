"use client";

import { useId } from "react";
import { cx } from "./cx";

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioGroupProps {
  name: string;
  label?: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/** Native radio inputs with arrow-key traversal supplied for free by the
 * browser's radiogroup behavior; we add the accessible label/group wiring. */
export function RadioGroup({ name, label, options, value, onChange, orientation = "vertical", className }: RadioGroupProps) {
  const groupId = useId();
  return (
    <fieldset className={cx("flex flex-col gap-[var(--space-2)]", className)}>
      {label && <legend className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">{label}</legend>}
      <div
        role="radiogroup"
        aria-labelledby={label ? groupId : undefined}
        className={cx("flex gap-[var(--space-3)]", orientation === "vertical" ? "flex-col" : "flex-row flex-wrap")}
      >
        {options.map((opt) => {
          const id = `${groupId}-${opt.value}`;
          return (
            <label key={opt.value} htmlFor={id} className="flex cursor-pointer items-start gap-[var(--space-2)]">
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4 border border-[var(--border-strong)] accent-[var(--accent-default)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              />
              <span className="flex flex-col">
                <span className="text-[var(--text-sm)] text-[var(--text-primary)]">{opt.label}</span>
                {opt.description && <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{opt.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
