"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface PopoverProps {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog"; id: string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
}

/** Click/Enter to open, click-outside or Escape to close, focus restored to
 * the trigger on close. Used as the base for DropdownMenu. */
export function Popover({ trigger, children, align = "start", panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    const btn = triggerRef.current?.querySelector("button");
    (btn as HTMLButtonElement | null)?.focus();
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div ref={triggerRef}>
        {trigger({ onClick: () => setOpen((v) => !v), "aria-expanded": open, "aria-haspopup": "dialog", id })}
      </div>
      {open && (
        <div
          id={id}
          className={cx(
            "absolute z-30 mt-[var(--space-2)] min-w-[200px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-[var(--space-2)] shadow-[var(--shadow-lg)]",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
