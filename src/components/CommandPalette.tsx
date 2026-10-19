"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { SearchItem } from "@/app/api/search/route";

// CommandPalette — Cmd/Ctrl+K opens, ↑↓ navigate, Enter navigates to the
// relevant view (via onNavigate(hash)), Esc closes.
export function CommandPalette({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("leados:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("leados:open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open && items.length === 0) {
      fetch("/api/search").then((r) => r.json()).then((d) => setItems(d.items ?? []));
    }
  }, [open, items.length]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items.slice(0, 20);
    return items.filter((i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q) || i.kind.includes(q)).slice(0, 20);
  }, [items, query]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  function go(item: SearchItem) {
    onNavigate(item.view);
    setOpen(false);
    setQuery("");
  }

  const kindLabel: Record<SearchItem["kind"], string> = {
    finding: "Finding",
    person: "Person",
    decision: "Decision",
    hypothesis: "Hypothesis",
    rule: "Rule",
  };
  const kindColor: Record<SearchItem["kind"], string> = {
    finding: "text-amber-400",
    person: "text-sky-400",
    decision: "text-violet-400",
    hypothesis: "text-emerald-400",
    rule: "text-slate-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(filtered.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && filtered[cursor]) {
              go(filtered[cursor]);
            }
          }}
          placeholder="Search findings, people, decisions, hypotheses, rules…"
          className="w-full rounded-t-xl border-b border-slate-700 bg-transparent px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <div className="max-h-96 overflow-y-auto py-1">
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">No results.</div>}
          {filtered.map((item, i) => (
            <button
              key={`${item.kind}-${item.id}-${i}`}
              onClick={() => go(item)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === cursor ? "bg-slate-800" : "hover:bg-slate-800/60"}`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${kindColor[item.kind]}`}>{kindLabel[item.kind]}</span>
                <span className="truncate text-slate-100">{item.title}</span>
              </div>
              <span className="shrink-0 pl-3 text-xs text-slate-500">{item.subtitle}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}
