"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

/** Lightweight anchored popover: closes on outside click and Escape, no external deps. */
export function Popover({ open, onClose, anchorRef, children, align = "start", className = "" }: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className={[
        "absolute z-30 mt-2 min-w-[12rem] rounded-[var(--radius-md)] border border-border-subtle bg-surface-overlay",
        "p-1 shadow-[var(--elevation-3)]",
        "animate-[leados-fade-in_var(--duration-fast)_var(--ease-entrance)]",
        align === "end" ? "right-0" : "left-0",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
