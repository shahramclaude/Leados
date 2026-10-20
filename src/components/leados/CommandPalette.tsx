"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FLAT_ROUTES } from "@/app/routes";
import type { SearchResult } from "@/app/api/search/route";

const RECENTS_KEY = "leados.command.recents";
const MAX_RECENTS = 5;

function readRecents(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(href: string) {
  const current = readRecents().filter((h) => h !== href);
  current.unshift(href);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(current.slice(0, MAX_RECENTS)));
}

/**
 * Universal ⌘K entry point: fuzzy route matching, entity search via
 * /api/search, recent items, fully keyboard-driven (arrow keys + Enter +
 * Escape). Mounted once in the root layout so it works on every route,
 * including every /leados/* page.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setRecents(readRecents());
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(FLAT_ROUTES.map((r) => ({ id: `route-${r.href}`, kind: "route" as const, title: r.label, subtitle: r.description, href: r.href })));
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await res.json();
        setResults(data.results ?? []);
        setActiveIndex(0);
      } catch {
        // aborted — ignore
      }
    }, 150);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function go(href: string) {
    pushRecent(href);
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex].href);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-[var(--space-2)] border-b border-[var(--border-subtle)] px-[var(--space-4)]">
          <span aria-hidden className="text-[var(--text-muted)]">⌘K</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={results[activeIndex] ? `cmd-${results[activeIndex].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search routes, people, decisions…"
            className="h-12 w-full bg-transparent text-[var(--text-sm)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-[var(--space-1)] text-[var(--text-xs)] text-[var(--text-muted)]">Esc</kbd>
        </div>
        {!query && recents.length > 0 && (
          <div className="border-b border-[var(--border-subtle)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-xs)] text-[var(--text-muted)]">
            Recent: {recents.map((r) => FLAT_ROUTES.find((fr) => fr.href === r)?.label ?? r).join(" · ")}
          </div>
        )}
        <ul id="command-palette-list" role="listbox" aria-label="Results" className="max-h-80 overflow-auto py-[var(--space-2)]">
          {results.length === 0 && <li className="px-[var(--space-4)] py-[var(--space-3)] text-[var(--text-sm)] text-[var(--text-muted)]">No matches</li>}
          {results.map((r, i) => (
            <li
              id={`cmd-${r.id}`}
              key={r.id}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r.href);
              }}
              className={`flex cursor-pointer items-center justify-between gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-sm)] ${
                i === activeIndex ? "bg-[var(--accent-subtle)] text-[var(--accent-default)]" : "text-[var(--text-primary)]"
              }`}
            >
              <span>
                {r.title}
                {r.subtitle && <span className="ml-[var(--space-2)] text-[var(--text-xs)] text-[var(--text-muted)]">{r.subtitle}</span>}
              </span>
              <span className="text-[var(--text-xs)] uppercase tracking-wide text-[var(--text-muted)]">{r.kind}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
