"use client";

import { useId } from "react";
import { cx } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  labelPosition?: "left" | "right";
}

export function Switch({ checked, onChange, label, description, disabled, size = "md", labelPosition = "right" }: SwitchProps) {
  const id = useId();
  const dims = size === "sm" ? { w: 32, h: 18, knob: 14 } : { w: 40, h: 22, knob: 18 };

  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={description ? undefined : label}
      aria-labelledby={description ? `${id}-label` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ width: dims.w, height: dims.h }}
      className={cx(
        "relative inline-flex shrink-0 items-center rounded-[var(--radius-full)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        checked ? "bg-[var(--accent-default)]" : "bg-[var(--border-strong)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden
        style={{
          width: dims.knob,
          height: dims.knob,
          transform: checked ? `translateX(${dims.w - dims.knob - 3}px)` : "translateX(3px)",
        }}
        className="inline-block rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
      />
    </button>
  );

  if (!label && !description) return control;

  const textBlock = (
    <span className="flex flex-col">
      <span id={`${id}-label`} className="text-[var(--text-sm)] text-[var(--text-primary)]">
        {label}
      </span>
      {description && <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{description}</span>}
    </span>
  );

  return (
    <div className="flex items-center gap-[var(--space-3)]">
      {labelPosition === "left" && textBlock}
      {control}
      {labelPosition === "right" && textBlock}
    </div>
  );
}
