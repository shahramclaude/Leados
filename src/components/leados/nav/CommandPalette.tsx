"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROUTES } from "@/app/routes";
import { useToast } from "@/components/leados/ui/Toast";

interface EntityResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

interface PaletteItem {
  id: string;
  group: "Recent" | "Routes" | "Commands" | "Results";
  label: string;
  hint?: string;
  run: () => void;
}

const RECENT_KEY = "leados:recent-commands";
const MAX_RECENT = 5;

/** Simple subsequence fuzzy scorer — lower is better, -1 means "no match". */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti - lastMatch - 1; // penalize gaps
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<EntityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      try {
        setRecent(JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]"));
      } catch {
        setRecent([]);
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setEntities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!cancelled) setEntities(data.results ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, open]);

  function remember(label: string) {
    const next = [label, ...recent.filter((r) => r !== label)].slice(0, MAX_RECENT);
    setRecent(next);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  const commandItems: PaletteItem[] = useMemo(
    () => [
      {
        id: "cmd-toggle-shortcuts",
        group: "Commands",
        label: "Show keyboard shortcuts",
        hint: "?",
        run: () => notify({ title: "Tip", description: "Press ? anywhere to open shortcuts.", tone: "info" }),
      },
      {
        id: "cmd-copy-link",
        group: "Commands",
        label: "Copy current page link",
        run: () => {
          navigator.clipboard?.writeText(window.location.href);
          notify({ title: "Link copied", tone: "success" });
        },
      },
    ],
    [notify],
  );

  const routeItems: PaletteItem[] = ROUTES.map((route) => ({
    id: `route-${route.id}`,
    group: "Routes",
    label: route.label,
    hint: route.href,
    run: () => router.push(route.href),
  }));

  const entityItems: PaletteItem[] = entities.map((entity) => ({
    id: `entity-${entity.type}-${entity.id}`,
    group: "Results",
    label: entity.title,
    hint: entity.subtitle,
    run: () => router.push(entity.href),
  }));

  const recentItems: PaletteItem[] = recent
    .map((label) => [...routeItems, ...commandItems].find((item) => item.label === label))
    .filter((item): item is PaletteItem => Boolean(item))
    .map((item) => ({ ...item, id: `recent-${item.id}`, group: "Recent" as const }));

  const allCandidates = query.trim() ? [...routeItems, ...commandItems, ...entityItems] : [...recentItems, ...routeItems, ...commandItems];

  const scored = allCandidates
    .map((item) => ({ item, score: query.trim() ? fuzzyScore(query, `${item.label} ${item.hint ?? ""}`) : 0 }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score)
    .map(({ item }) => item);

  function activate(item: PaletteItem) {
    remember(item.label);
    item.run();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface-overlay shadow-[var(--elevation-3)] animate-[leados-fade-in_var(--duration-base)_var(--ease-entrance)]"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search routes, people, decisions, signals…"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={scored[activeIndex] ? `cmd-${scored[activeIndex].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(scored.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && scored[activeIndex]) {
              e.preventDefault();
              activate(scored[activeIndex]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          className="w-full border-b border-border-subtle bg-transparent px-4 py-3 text-sm text-text-primary outline-none"
        />
        <ul id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto p-1">
          {loading ? <li className="px-3 py-2 text-xs text-text-muted">Searching…</li> : null}
          {scored.length === 0 && !loading ? <li className="px-3 py-6 text-center text-sm text-text-muted">No matches</li> : null}
          {scored.map((item, index) => (
            <li
              key={item.id}
              id={`cmd-${item.id}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                activate(item);
              }}
              className={["flex cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-sm", index === activeIndex ? "bg-accent-subtle text-text-primary" : "text-text-secondary"].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">{item.group}</span>
                {item.label}
              </span>
              {item.hint ? <span className="font-mono text-xs text-text-muted">{item.hint}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
