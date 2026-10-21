"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultId?: string;
  className?: string;
}

/**
 * Tabs — single implementation. Full roving-tabindex keyboard model:
 * ArrowLeft/Right move + select, Home/End jump to ends, panel is
 * `tabIndex=0` so it is reachable without a mouse.
 */
export function Tabs({ items, defaultId, className }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultId ?? items[0]?.id);
  const baseId = useId();
  const activeIndex = items.findIndex((i) => i.id === activeId);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let nextIndex = activeIndex;
    if (e.key === "ArrowLeft") nextIndex = (activeIndex - 1 + items.length) % items.length;
    if (e.key === "ArrowRight") nextIndex = (activeIndex + 1) % items.length;
    if (e.key === "Home") nextIndex = 0;
    if (e.key === "End") nextIndex = items.length - 1;
    const next = items[nextIndex];
    setActiveId(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label="Sections" className="flex gap-1 border-b border-[var(--border-subtle)]" onKeyDown={onKeyDown}>
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              className={cn(
                "relative px-3 py-2 text-[var(--text-sm)] font-medium transition-colors duration-[var(--motion-fast)]",
                selected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              {item.label}
              {selected && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--domain-strategy-solid)]" />}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
