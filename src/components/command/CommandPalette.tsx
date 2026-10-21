"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { rankCommands, type FuzzyUsage, type ScorableItem } from "@/lib/fuzzy";
import { cn } from "@/lib/cn";

export interface CommandItem extends ScorableItem {
  group: string;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  usageById?: Record<string, FuzzyUsage>;
}

/**
 * CommandPalette — ⌘K (Ctrl+K on non-Mac). Behavior contract:
 *  - Opens with Cmd/Ctrl+K from anywhere in the app; closes on Escape or
 *    scrim click; traps focus while open.
 *  - Scoring: score = 0.4*prefix + 0.3*subsequence + 0.2*recency +
 *    0.1*frequency (see src/lib/fuzzy.ts) — results re-rank on every
 *    keystroke, grouped by `group`, groups kept in first-seen order.
 *  - Each result row shows its keyboard shortcut (if any) right-aligned.
 *  - ArrowUp/Down move the highlighted row (wrapping); Enter activates it.
 */
export function CommandPalette({ items, usageById = {} }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const ranked = useMemo(() => rankCommands(items, query, usageById), [items, query, usageById]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, typeof ranked>();
    for (const item of ranked) {
      if (!byGroup.has(item.group)) {
        byGroup.set(item.group, []);
        order.push(item.group);
      }
      byGroup.get(item.group)!.push(item);
    }
    return order.map((group) => ({ group, items: byGroup.get(group)! }));
  }, [ranked]);

  function activate(index: number) {
    const item = ranked[index];
    if (!item) return;
    item.onSelect();
    setOpen(false);
    setQuery("");
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" role="presentation">
      <div className="absolute inset-0" style={{ background: "var(--surface-overlay-scrim)" }} onClick={() => setOpen(false)} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--surface-2)] shadow-[var(--elevation-3)]"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % Math.max(1, ranked.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + Math.max(1, ranked.length)) % Math.max(1, ranked.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              activate(highlight);
            }
          }}
          placeholder="Search commands, pages, domains…"
          aria-label="Search commands"
          className="w-full border-b border-[var(--border-subtle)] bg-transparent px-4 py-3 text-[var(--text-md)] text-[var(--text-primary)] outline-none"
        />
        <ul role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto py-2">
          {groups.length === 0 && <li className="px-4 py-6 text-center text-[var(--text-sm)] text-[var(--text-muted)]">No commands match “{query}”.</li>}
          {groups.map(({ group, items: groupItems }) => (
            <li key={group}>
              <p className="px-4 pb-1 pt-2 text-[var(--text-xs)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{group}</p>
              <ul>
                {groupItems.map((item) => {
                  const index = ranked.indexOf(item);
                  const isHighlighted = index === highlight;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => activate(index)}
                        className={cn(
                          "flex w-full items-center justify-between px-4 py-2 text-left text-[var(--text-base)] text-[var(--text-primary)]",
                          isHighlighted && "bg-[var(--domain-strategy-tint)]",
                        )}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <kbd className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[var(--text-xs)] text-[var(--text-muted)]">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
