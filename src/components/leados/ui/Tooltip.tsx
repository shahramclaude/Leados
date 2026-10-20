"use client";

import { cloneElement, isValidElement, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";

export interface TooltipProps {
  content: string;
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom";
}

/** Keyboard-triggerable tooltip: opens on focus or hover, closes on blur/Escape/pointer-leave. */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }
  function hide() {
    setOpen(false);
  }

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onFocus: show,
    onBlur: hide,
    onMouseEnter: show,
    onMouseLeave: hide,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={[
            "pointer-events-none absolute left-1/2 z-30 w-max max-w-[22ch] -translate-x-1/2 rounded-[var(--radius-xs)]",
            "bg-surface-inverse px-2 py-1 text-xs text-text-inverse shadow-[var(--elevation-2)]",
            "animate-[leados-fade-in_var(--duration-fast)_var(--ease-entrance)]",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
