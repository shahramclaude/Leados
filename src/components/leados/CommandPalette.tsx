"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/AppContext";
import { postJson } from "@/lib/useFetch";
import { SearchIcon, CloseIcon } from "@/components/leados/icons";
import type { SearchResultItem } from "@/app/api/search/route";

interface PaletteEntry {
  id: string;
  group: "Navigate" | "Actions" | "People" | "Decisions" | "Metrics" | "Playbooks" | "Insights" | "Recent";
  title: string;
  subtitle?: string;
  run: () => void;
}

interface RecentEntry {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  at: number;
}

const RECENTS_KEY = "leados.commandPalette.recents";
const STATIC_VIEWS: Array<{ title: string; href: string; subtitle: string }> = [
  { title: "Today (Command Center)", href: "/leados", subtitle: "Heads-up display" },
  { title: "Intelligence", href: "/leados/intelligence", subtitle: "Org health & findings" },
  { title: "Signal Board", href: "/leados/signals", subtitle: "Rule health across domains" },
  { title: "People", href: "/leados/people", subtitle: "Org network & 1:1s" },
  { title: "Decisions", href: "/leados/decisions", subtitle: "Decision log & health" },
  { title: "Metrics", href: "/leados/metrics", subtitle: "KPI tracking" },
  { title: "Scenarios", href: "/leados/scenarios", subtitle: "Monte Carlo planning" },
  { title: "Memory & Insights", href: "/leados/memory", subtitle: "Knowledge graph" },
  { title: "Playbooks", href: "/leados/playbooks", subtitle: "Standard response plans" },
  { title: "Work Queue", href: "/leados/queue", subtitle: "Notifications & tasks" },
  { title: "Settings", href: "/leados/settings", subtitle: "Org profile & preferences" },
];

function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentEntry[];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  if (typeof window === "undefined") return;
  const current = loadRecents().filter((r) => r.id !== entry.id);
  const next = [entry, ...current].slice(0, 5);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

// Simple fuzzy scorer: subsequence match with bonus for contiguous runs.
function fuzzyScore(query: string, target: string): number {
  if (query === "") return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - (t.indexOf(q) - 0);
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast, refetch } = useAppContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setRecents(loadRecents());
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (res.ok) setResults((await res.json()) as SearchResultItem[]);
      } catch {
        // aborted or network error — ignore
      }
    })();
    return () => controller.abort();
  }, [query, open]);

  const navigate = (href: string, title: string, subtitle: string) => {
    pushRecent({ id: href, title, subtitle, href, at: Date.now() });
    router.push(href);
    onClose();
  };

  const runAction = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      toast(`${label} — done`, 2);
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : `${label} failed`, 4);
    }
    onClose();
  };

  const entries: PaletteEntry[] = useMemo(() => {
    const list: PaletteEntry[] = [];

    STATIC_VIEWS.forEach((v) => {
      list.push({
        id: `view-${v.href}`,
        group: "Navigate",
        title: v.title,
        subtitle: v.subtitle,
        run: () => navigate(v.href, v.title, v.subtitle),
      });
    });

    const trimmed = query.trim();
    if (trimmed.length > 0) {
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("log 1:1") || lower.startsWith("log 1-1") || lower.startsWith("log one")) {
        list.push({
          id: "action-log-1on1",
          group: "Actions",
          title: `Log 1:1: "${trimmed}"`,
          subtitle: "Quick-capture as a 1:1 note",
          run: () => runAction("Log 1:1", async () => { await postJson("/api/capture", { text: trimmed, type: "one_on_one" }); }),
        });
      }
      if (lower.startsWith("add decision") || lower.includes("decide")) {
        list.push({
          id: "action-add-decision",
          group: "Actions",
          title: `Add decision from: "${trimmed}"`,
          subtitle: "Create a new decision record",
          run: () => runAction("Add decision", async () => { await postJson("/api/capture", { text: trimmed, type: "decision" }); }),
        });
      }
      if (lower.startsWith("add metric") || lower.includes("metric")) {
        list.push({
          id: "action-add-metric",
          group: "Actions",
          title: `Add metric value from: "${trimmed}"`,
          subtitle: "Route text as a metric update",
          run: () => runAction("Add metric value", async () => { await postJson("/api/capture", { text: trimmed, type: "metric_update" }); }),
        });
      }
      list.push({
        id: "action-generate-briefing",
        group: "Actions",
        title: "Generate weekly briefing",
        subtitle: "Recompute the executive summary now",
        run: () => runAction("Generate briefing", async () => { await fetch("/api/briefing", { cache: "no-store" }); }),
      });
      list.push({
        id: "action-run-playbook",
        group: "Actions",
        title: "Run autonomous intelligence pass",
        subtitle: "Re-evaluate all rules now",
        run: () => runAction("Autonomous run", async () => { await postJson("/api/autonomous/trigger", {}); }),
      });
      list.push({
        id: "action-new-scenario",
        group: "Actions",
        title: "New scenario",
        subtitle: "Go to Scenarios to model a new plan",
        run: () => navigate("/leados/scenarios", "Scenarios", "Monte Carlo planning"),
      });
    }

    results.forEach((r) => {
      const group: PaletteEntry["group"] =
        r.type === "person" ? "People" : r.type === "decision" ? "Decisions" : r.type === "metric" ? "Metrics" : r.type === "playbook" ? "Playbooks" : "Insights";
      const href =
        r.type === "person" ? "/leados/people" : r.type === "decision" ? "/leados/decisions" : r.type === "metric" ? "/leados/metrics" : r.type === "playbook" ? "/leados/playbooks" : "/leados/memory";
      list.push({
        id: `${r.type}-${r.id}`,
        group,
        title: r.title,
        subtitle: r.subtitle,
        run: () => navigate(href, r.title, r.subtitle),
      });
    });

    if (trimmed.length === 0) {
      recents.forEach((r) => {
        list.push({ id: `recent-${r.id}`, group: "Recent", title: r.title, subtitle: r.subtitle, run: () => navigate(r.href, r.title, r.subtitle) });
      });
    }

    const scored = list
      .map((entry) => ({ entry, score: fuzzyScore(trimmed, `${entry.title} ${entry.subtitle ?? ""}`) }))
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score);

    return scored.map((s) => s.entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results, recents]);

  useEffect(() => {
    setActiveIndex(0);
  }, [entries.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(entries.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        entries[activeIndex]?.run();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, entries, activeIndex]);

  if (!open) return null;

  const groups = Array.from(new Set(entries.map((e) => e.group)));

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/60 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-[#10131a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <SearchIcon className="text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search views, people, decisions, metrics… or type an action"
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {entries.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No matches.</p>}
          {groups.map((group) => (
            <div key={group} className="mb-1">
              <p className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-wider text-slate-500">{group}</p>
              {entries
                .filter((e) => e.group === group)
                .map((entry) => {
                  const globalIndex = entries.indexOf(entry);
                  const active = globalIndex === activeIndex;
                  return (
                    <button
                      key={entry.id}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      onClick={() => entry.run()}
                      className={`flex w-full flex-col items-start px-4 py-2 text-left text-sm ${
                        active ? "bg-indigo-500/15 text-indigo-100" : "text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <span>{entry.title}</span>
                      {entry.subtitle && <span className="text-xs text-slate-500">{entry.subtitle}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
          <span>↑↓ navigate · Enter run · Esc close</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
