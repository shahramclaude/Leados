"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

export interface PanelProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** When set, open/closed state persists across sessions under this key. */
  persistKey?: string;
  actions?: ReactNode;
}

export function Panel({ title, children, defaultOpen = true, persistKey, actions }: PanelProps) {
  const id = useId();
  const storageKey = persistKey ? `leados:panel:${persistKey}` : null;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === "1");
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }

  return (
    <section className="rounded-[var(--comp-card-radius)] border border-border-subtle bg-surface-raised">
      <div className="flex items-center justify-between gap-3 px-[var(--comp-card-padding)] py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary"
        >
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▸
          </span>
          {title}
        </button>
        {actions}
      </div>
      {open ? (
        <div id={id} className="border-t border-border-subtle px-[var(--comp-card-padding)] py-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
