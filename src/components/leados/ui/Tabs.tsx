"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "./cx";

export interface TabItem {
  id: string;
  label: string;
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  idPrefix?: string;
}

/** WAI-ARIA tabs with roving tabindex: only the active tab is in the tab
 * order; ArrowLeft/Right (and Home/End) move focus+selection between tabs. */
export function Tabs({ items, activeId, onChange, idPrefix = "tabs" }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const index = items.findIndex((t) => t.id === activeId);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    onChange(items[next].id);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${items[next].id}`);
    btn?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Sections"
      onKeyDown={onKeyDown}
      className="flex gap-[var(--space-1)] border-b border-[var(--border-subtle)]"
    >
      {items.map((item) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            id={`${idPrefix}-tab-${item.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              "flex items-center gap-[var(--space-1)] border-b-2 px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-sm)] font-medium transition-colors duration-[var(--duration-fast)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              selected
                ? "border-[var(--accent-default)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, activeId, idPrefix = "tabs", children }: { id: string; activeId: string; idPrefix?: string; children: ReactNode }) {
  if (id !== activeId) return null;
  return (
    <div id={`${idPrefix}-panel-${id}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}
