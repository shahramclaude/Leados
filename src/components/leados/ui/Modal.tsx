"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const firstFocusable = container?.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? container)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [active, containerRef]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS: Record<string, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

/** Modal with full focus trap, ESC-to-close, and focus restored to the trigger on close. */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, containerRef);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-[leados-fade-in_var(--duration-base)_var(--ease-standard)]"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leados-modal-title"
        aria-describedby={description ? "leados-modal-desc" : undefined}
        tabIndex={-1}
        className={[
          "relative z-10 w-full rounded-[var(--radius-lg)] border border-border-subtle bg-surface-raised p-6 shadow-[var(--elevation-3)]",
          "animate-[leados-fade-in_var(--duration-base)_var(--ease-entrance)]",
          SIZE_CLASS[size],
        ].join(" ")}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="leados-modal-title" className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            {description ? (
              <p id="leados-modal-desc" className="mt-1 max-w-[60ch] text-sm text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" icon={<span aria-hidden="true">✕</span>} onClick={onClose} size="sm" />
        </div>
        <div>{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
