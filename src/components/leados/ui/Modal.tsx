"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** When set, renders as a side drawer instead of a centered dialog. */
  side?: "right" | "left" | false;
}

const SIZE_CLASS = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };
const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Dialog with a real focus trap: Tab/Shift+Tab cycle within the panel,
 * Escape closes, and focus is restored to the element that opened it. Also
 * doubles as the Drawer implementation via the `side` prop. */
export function Modal({ open, onClose, title, description, children, footer, size = "md", side = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables?.[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const titleId = "modal-title";
  const descId = description ? "modal-desc" : undefined;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" aria-hidden={false}>
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-[var(--duration-base)] ease-[var(--ease-standard)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-screen flex-col bg-[var(--surface-raised)] shadow-[var(--shadow-lg)] outline-none",
          side
            ? cx("h-full w-full sm:max-w-md animate-[leados-fade-in_var(--duration-base)_var(--ease-decelerate)]", side === "left" && "order-first")
            : cx("m-auto w-full rounded-[var(--radius-lg)] animate-[leados-fade-in_var(--duration-base)_var(--ease-decelerate)]", SIZE_CLASS[size]),
        )}
      >
        <header className="flex items-start justify-between gap-[var(--space-4)] border-b border-[var(--border-subtle)] p-[var(--space-5)]">
          <div>
            <h2 id={titleId} className="text-[var(--text-md)] font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 max-w-[var(--measure-prose)] text-[var(--text-sm)] text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          <IconButton
            label="Close"
            onClick={onClose}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            }
          />
        </header>
        <div className="leados-scroll flex-1 overflow-auto p-[var(--space-5)]">{children}</div>
        {footer && <footer className="flex justify-end gap-[var(--space-2)] border-t border-[var(--border-subtle)] p-[var(--space-4)]">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer(props: Omit<ModalProps, "side"> & { side?: "left" | "right" }) {
  return <Modal {...props} side={props.side ?? "right"} />;
}
