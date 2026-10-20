"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  value: string;
  label: string;
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  idPrefix?: string;
}

/** Tabs with ARIA tablist pattern + arrow-key roving tabindex (Home/End supported). */
export function Tabs({ items, value, onChange, idPrefix = "tabs" }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusAndSelect(index: number) {
    const item = items[index];
    refs.current[index]?.focus();
    onChange(item.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((item) => item.value === value);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAndSelect((currentIndex + 1) % items.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAndSelect((currentIndex - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAndSelect(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAndSelect(items.length - 1);
    }
  }

  return (
    <div role="tablist" aria-label="Section tabs" onKeyDown={onKeyDown} className="flex gap-1 border-b border-border-subtle">
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            id={`${idPrefix}-tab-${item.value}`}
            aria-controls={`${idPrefix}-panel-${item.value}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={[
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              selected ? "text-accent-default" : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {item.label}
            {item.badge}
            {selected ? (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent-default" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, tabId, active, children }: { id: string; tabId: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={id} aria-labelledby={tabId} tabIndex={0} className="pt-4 focus:outline-none">
      {children}
    </div>
  );
}
