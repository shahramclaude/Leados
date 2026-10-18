"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fuzzyScore } from "./tokens";

export interface CommandItem {
  id: string;
  title: string;
  section: string;
  subtitle?: string;
  keywords?: string;
  icon?: ReactNode;
  onRun: () => void;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
}

export default function CommandPalette({ items, open: openProp, onOpenChange, placeholder }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function setOpen(next: boolean) {
    setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setQuery("");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen(!open);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return items.slice(0, 40);
    return items
      .map((item) => ({
        item,
        score: Math.max(
          fuzzyScore(query, item.title),
          fuzzyScore(query, item.keywords ?? ""),
          fuzzyScore(query, item.section)
        ),
      }))
      .filter((r) => r.score > -1)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)
      .slice(0, 40);
  }, [items, query]);

  useEffect(() => setActiveIndex(0), [query, open]);

  function run(item: CommandItem) {
    item.onRun();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(4, 6, 12, 0.65)", backdropFilter: "blur(4px)" }}
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-xl border animate-fade-in-up"
        style={{
          backgroundColor: "var(--bg-overlay)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-overlay)",
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[activeIndex]) {
            e.preventDefault();
            run(results[activeIndex]);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="var(--text-tertiary)" strokeWidth="1.5" />
            <path d="M11 11L14.5 14.5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? "Search navigation, people, metrics, decisions, playbooks…"}
            className="w-full bg-transparent focus-visible:outline-none"
            style={{ color: "var(--text-primary)", fontSize: "var(--fs-base)" }}
          />
          <kbd
            className="rounded border px-1.5 py-0.5 font-data"
            style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}
          >
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
              No matches for “{query}”.
            </p>
          )}

          {Object.entries(
            results.reduce<Record<string, CommandItem[]>>((acc, item) => {
              (acc[item.section] ??= []).push(item);
              return acc;
            }, {})
          ).map(([section, sectionItems]) => (
            <div key={section} className="mb-1">
              <p
                className="px-2.5 pb-1 pt-2 uppercase tracking-wide"
                style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}
              >
                {section}
              </p>
              {sectionItems.map((item) => {
                const globalIndex = results.indexOf(item);
                const active = globalIndex === activeIndex;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    onClick={() => run(item)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none"
                    style={{
                      backgroundColor: active ? "var(--bg-elevated)" : "transparent",
                      boxShadow: active ? "inset 2px 0 0 var(--accent-blue)" : undefined,
                    }}
                  >
                    {item.icon && (
                      <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>
                        {item.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="block truncate" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                    {active && (
                      <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }} className="font-data">
                        ↵
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
