"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { trapFocus } from "@/lib/a11y";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** "modal" blocks the page (dialog role); "drawer" slides from the right
   * and is used by InsightCard's "Explain" affordance. Both share this one
   * implementation so there is exactly one overlay/portal/focus-trap system
   * in the app. */
  variant?: "modal" | "drawer";
}

/**
 * Dialog — the single modal/drawer implementation in LEADOS.
 * Contract: traps focus, restores focus to the trigger on close, closes on
 * Escape and scrim click, renders via portal above everything, and is the
 * ONLY component allowed to set `position: fixed` + scrim.
 */
export function Dialog({ open, onClose, title, description, children, className, variant = "modal" }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const container = containerRef.current;
    const cleanupTrap = container ? trapFocus(container) : undefined;

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cleanupTrap?.();
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = prevOverflow;
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="presentation">
      <div
        className="absolute inset-0"
        style={{ background: "var(--surface-overlay-scrim)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        className={cn(
          "relative z-10 flex flex-col overflow-y-auto bg-[var(--surface-2)] shadow-[var(--elevation-3)]",
          "transition-transform duration-[var(--motion-base)] ease-[var(--motion-ease-standard)]",
          variant === "modal"
            ? "m-auto w-full max-w-lg rounded-[var(--radius-xl)] p-6"
            : "h-full w-full max-w-md p-6",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="dialog-title" className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {description && (
              <p id="dialog-description" className="mt-1 text-[var(--text-sm)] text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[var(--radius-md)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
