"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface PanelProps {
  id: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}

/** Collapsible panel that remembers open/closed state per `id` across
 * sessions (localStorage), so returning to a page doesn't re-expand
 * something the user deliberately collapsed. */
export function Panel({ id, title, children, defaultOpen = true, actions }: PanelProps) {
  const storageKey = `leados.panel.${id}`;
  const [open, setOpen] = useState(defaultOpen);
  const contentId = `${id}-panel-content`;

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === "1");
  }, [storageKey]);

  function toggle() {
    setOpen((v) => {
      window.localStorage.setItem(storageKey, v ? "0" : "1");
      return !v;
    });
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className="flex items-center justify-between gap-[var(--space-2)] p-[var(--card-padding)] pb-[var(--space-3)]">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex items-center gap-[var(--space-2)] text-left text-[var(--text-sm)] font-semibold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={cx("transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]", open ? "rotate-90" : "rotate-0")}
          >
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
        </button>
        {actions}
      </div>
      {open && (
        <div id={contentId} className="border-t border-[var(--border-subtle)] p-[var(--card-padding)]">
          {children}
        </div>
      )}
    </section>
  );
}
