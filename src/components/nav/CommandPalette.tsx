"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMANDS, fuzzyScore } from "./commands";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const scored = COMMANDS.map((c) => ({
      command: c,
      score: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, c.keywords.join(" "))),
    }));
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.command);
  }, [query]);

  useEffect(() => setActiveIndex(0), [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-64 items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-[14px] text-[var(--text-secondary)] shadow-[var(--shadow-1)]"
        aria-haspopup="dialog"
      >
        <span>Search or run a command…</span>
        <kbd className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[12px]">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,23,42,0.5)] pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[activeIndex]) {
                  go(results[activeIndex].href);
                }
              }}
              placeholder="Type a command or screen name…"
              aria-label="Command palette search"
              className="w-full border-b border-[var(--border-default)] bg-transparent px-4 py-3 text-[16px] outline-none"
            />
            <ul role="listbox" className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-6 text-center text-[14px] text-[var(--text-muted)]">No matches.</li>
              ) : (
                results.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={i === activeIndex}>
                    <button
                      type="button"
                      onClick={() => go(c.href)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-left text-[14px] ${
                        i === activeIndex ? "bg-[var(--brand-50)] text-[var(--brand-700)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <span>{c.title}</span>
                      <span className="text-[12px] uppercase tracking-wide text-[var(--text-muted)]">{c.group}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
