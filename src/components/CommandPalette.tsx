"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_ROUTES } from "@/app/routes";
import { cn, useStableId } from "@/components/leados/ui/utils";
import { useFocusTrap } from "@/components/leados/ui/useFocusTrap";
import { useTheme } from "@/components/leados/ui/theme";
import { useToast } from "@/components/leados/ui/Toast";
import type { SearchResult } from "@/app/api/search/route";

const RECENT_KEY = "leados.recent";

type Entry = {
  id: string;
  group: "Recent" | "Navigate" | "Commands" | "People" | "Projects" | "Decisions";
  title: string;
  subtitle?: string;
  icon: string;
  run: () => void;
};

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

function readRecent(): { id: string; title: string; href: string }[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(item: { id: string; title: string; href: string }) {
  const current = readRecent().filter((r) => r.id !== item.id);
  const next = [item, ...current].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toggle: toggleTheme } = useTheme();
  const { push: pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<{ id: string; title: string; href: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useStableId("palette-listbox");

  useFocusTrap(open, containerRef, onClose);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setRecent(readRecent());
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { results: SearchResult[] }) => setSearchResults(data.results))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, open]);

  function go(href: string, title: string) {
    pushRecent({ id: href, title, href });
    router.push(href);
    onClose();
  }

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];

    if (!query.trim()) {
      for (const r of recent) {
        list.push({ id: `recent-${r.id}`, group: "Recent", title: r.title, icon: "🕑", run: () => go(r.href, r.title) });
      }
    }

    for (const route of ALL_ROUTES) {
      if (fuzzyMatch(query, route.label) || fuzzyMatch(query, route.description)) {
        list.push({ id: `route-${route.key}`, group: "Navigate", title: route.label, subtitle: route.description, icon: route.icon, run: () => go(route.href, route.label) });
      }
    }

    const commands: { id: string; title: string; icon: string; run: () => void }[] = [
      { id: "cmd-new-decision", title: "New decision", icon: "✅", run: () => go("/act/decisions?new=1", "New decision") },
      {
        id: "cmd-run-orchestration",
        title: "Run orchestration now",
        icon: "🛰️",
        run: () => {
          pushToast({ title: "Orchestration queued", description: "A fresh signal sweep will complete in a few minutes.", tone: "info" });
          onClose();
        },
      },
      { id: "cmd-toggle-theme", title: "Toggle light / dark theme", icon: "🌓", run: () => { toggleTheme(); onClose(); } },
      { id: "cmd-styleguide", title: "Open styleguide", icon: "🎨", run: () => go("/styleguide", "Styleguide") },
    ];
    for (const c of commands) {
      if (fuzzyMatch(query, c.title)) {
        list.push({ id: c.id, group: "Commands", title: c.title, icon: c.icon, run: c.run });
      }
    }

    for (const r of searchResults) {
      const group = r.type === "person" ? "People" : r.type === "project" ? "Projects" : "Decisions";
      const icon = r.type === "person" ? "🧑" : r.type === "project" ? "📁" : "✅";
      list.push({ id: r.id, group, title: r.title, subtitle: r.subtitle, icon, run: () => go(r.href, r.title) });
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, recent, searchResults]);

  useEffect(() => {
    setActiveIndex(0);
  }, [entries.length, query]);

  if (!open || typeof document === "undefined") return null;

  const grouped = entries.reduce<Record<string, Entry[]>>((acc, entry) => {
    (acc[entry.group] ??= []).push(entry);
    return acc;
  }, {});

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-xl animate-[leados-fade-in-up_var(--motion-slow)_var(--ease-decelerate)]"
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
          <span aria-hidden="true" className="text-text-tertiary">
            🔎
          </span>
          <label htmlFor="command-palette-input" className="sr-only">
            Search commands, routes and entities
          </label>
          <input
            id="command-palette-input"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={entries[activeIndex] ? `${listboxId}-${entries[activeIndex].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, projects, decisions, or run a command…"
            className="w-full bg-transparent text-body text-text-primary placeholder:text-text-disabled focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                entries[activeIndex]?.run();
              }
            }}
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-text-tertiary">Esc</kbd>
        </div>
        <ul id={listboxId} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-2">
          {entries.length === 0 ? (
            <li className="px-3 py-6 text-center text-body-sm text-text-tertiary">No matches. Try a different search.</li>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <li key={group}>
                <p className="px-2.5 pb-1 pt-3 text-caption font-semibold uppercase tracking-wider text-text-disabled first:pt-1">{group}</p>
                <ul>
                  {items.map((entry) => {
                    const index = entries.indexOf(entry);
                    const active = index === activeIndex;
                    return (
                      <li key={entry.id}>
                        <button
                          id={`${listboxId}-${entry.id}`}
                          role="option"
                          aria-selected={active}
                          type="button"
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => entry.run()}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-body-sm transition-colors",
                            active ? "bg-accent-subtle text-accent-subtle-text" : "text-text-primary hover:bg-surface-raised",
                          )}
                        >
                          <span aria-hidden="true">{entry.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{entry.title}</span>
                            {entry.subtitle ? <span className="block truncate text-caption text-text-tertiary">{entry.subtitle}</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
