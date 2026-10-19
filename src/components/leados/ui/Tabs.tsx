"use client";

import { useRef } from "react";
import { cn, useStableId } from "./utils";

export interface TabItem {
  key: string;
  label: string;
  badge?: string | number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const groupId = useStableId("tabs");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const key = items[next].key;
    onChange(key);
    refs.current[key]?.focus();
  }

  return (
    <div role="tablist" aria-label="Section tabs" className={cn("flex items-center gap-1 border-b border-border-subtle", className)}>
      {items.map((item, i) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[item.key] = el;
            }}
            role="tab"
            id={`${groupId}-tab-${item.key}`}
            aria-controls={`${groupId}-panel-${item.key}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-body-sm font-medium transition-colors",
              "duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
              selected ? "text-accent" : "text-text-tertiary hover:text-text-primary",
            )}
          >
            {item.label}
            {item.badge !== undefined ? (
              <span className="rounded-full bg-surface-sunken px-1.5 text-caption text-text-tertiary">{item.badge}</span>
            ) : null}
            {selected ? <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabsId,
  tabKey,
  active,
  children,
}: {
  tabsId: string;
  tabKey: string;
  active: boolean;
  children: React.ReactNode;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`${tabsId}-panel-${tabKey}`} aria-labelledby={`${tabsId}-tab-${tabKey}`} tabIndex={0} className="pt-4">
      {children}
    </div>
  );
}
