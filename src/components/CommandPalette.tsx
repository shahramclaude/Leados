"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/context/AppContext";
import { ROUTES } from "@/app/routes";

type PaletteItem = { id: string; label: string; sublabel: string; href: string };

/**
 * Opens instantly because it only filters data that is already in
 * memory (AppContext + the static route manifest) — there is no
 * network fetch on open, so the palette can render well within a
 * single animation frame (<16ms).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { data } = useAppData();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items: PaletteItem[] = useMemo(() => {
    const routeItems: PaletteItem[] = ROUTES.map((r) => ({
      id: `route:${r.path}`,
      label: r.label,
      sublabel: r.description,
      href: r.path,
    }));
    const peopleItems: PaletteItem[] =
      data?.people.map((p) => ({
        id: `person:${p.id}`,
        label: p.name,
        sublabel: `${p.role} · ${p.department}`,
        href: "/people",
      })) ?? [];
    const findingItems: PaletteItem[] =
      data?.findings.map((f) => ({
        id: `finding:${f.id}`,
        label: f.title,
        sublabel: `${f.domain} · ${f.severity}`,
        href: "/signals",
      })) ?? [];
    return [...routeItems, ...peopleItems, ...findingItems];
  }, [data]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8);
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel.toLowerCase().includes(q)).slice(0, 8);
  }, [items, query]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
        aria-label="Open command palette"
      >
        ⌘K Search
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg rounded-xl bg-slate-900 p-3 shadow-2xl ring-1 ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, findings, pages…"
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
        <ul className="mt-2 max-h-80 overflow-y-auto">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-slate-800"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  router.push(item.href);
                }}
              >
                <span className="text-sm text-slate-100">{item.label}</span>
                <span className="text-xs text-slate-500">{item.sublabel}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No results</li>}
        </ul>
      </div>
    </div>
  );
}
