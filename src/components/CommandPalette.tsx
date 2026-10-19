"use client";

import { useMemo, useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { NAV_ITEMS, domainHref } from "@/lib/nav";

type PaletteType = "route" | "person" | "decision" | "scenario" | "blocker" | "hypothesis";

interface PaletteItem {
  type: PaletteType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  sev: number;
  createdAt: number;
  icon: string;
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  // Sourced entirely from context — no fetch happens here, on open or on
  // keystroke. Every result is derived from the OrchestratorResult already
  // held by AppContext.
  const { result } = useAppContext();
  const [query, setQuery] = useState("");

  const items = useMemo<PaletteItem[]>(() => {
    const routeItems: PaletteItem[] = NAV_ITEMS.map((n) => ({
      type: "route",
      id: n.href,
      title: n.label,
      subtitle: "Go to view",
      href: n.href,
      sev: 0,
      createdAt: 0,
      icon: n.icon,
    }));
    if (!result) return routeItems;

    const personItems: PaletteItem[] = result.people.map((p) => ({
      type: "person",
      id: p.id,
      title: p.name,
      subtitle: `${p.role} \u00b7 flight risk ${(p.flightRisk * 100).toFixed(0)}%`,
      href: "/people",
      sev: p.flightRisk >= 0.7 ? 4 : p.flightRisk >= 0.4 ? 2 : 1,
      createdAt: 0,
      icon: "\u263A",
    }));
    const decisionItems: PaletteItem[] = result.decisions
      .filter((d) => d.status === "open")
      .map((d) => ({
        type: "decision",
        id: d.id,
        title: d.title,
        subtitle: `Open decision \u00b7 ${d.domain}`,
        href: domainHref(d.domain),
        sev: d.sev,
        createdAt: new Date(d.createdAt).getTime(),
        icon: "\u2691",
      }));
    const scenarioItems: PaletteItem[] = result.scenarios
      .filter((s) => s.status === "active")
      .map((s) => ({
        type: "scenario",
        id: s.id,
        title: s.title,
        subtitle: `Active scenario \u00b7 ${s.domain}`,
        href: domainHref(s.domain),
        sev: s.sev,
        createdAt: new Date(s.createdAt).getTime(),
        icon: "\u25C7",
      }));
    const blockerItems: PaletteItem[] = result.blockers
      .filter((b) => b.status === "open")
      .map((b) => ({
        type: "blocker",
        id: b.id,
        title: b.title,
        subtitle: `Open blocker \u00b7 ${b.domain}`,
        href: "/execution",
        sev: b.sev,
        createdAt: new Date(b.createdAt).getTime(),
        icon: "\u26D4",
      }));
    const hypothesisItems: PaletteItem[] = result.hypotheses
      .filter((h) => h.status === "open")
      .map((h) => ({
        type: "hypothesis",
        id: h.id,
        title: h.title,
        subtitle: `Hypothesis \u00b7 ${h.personName}`,
        href: "/hypotheses",
        sev: h.sev,
        createdAt: new Date(h.createdAt).getTime(),
        icon: "?",
      }));

    return [...routeItems, ...personItems, ...decisionItems, ...scenarioItems, ...blockerItems, ...hypothesisItems];
  }, [result]);

  const filtered = useMemo(() => {
    return items
      .filter((item) => fuzzyMatch(query, `${item.title} ${item.subtitle}`))
      .sort((a, b) => b.sev - a.sev || b.createdAt - a.createdAt)
      .slice(0, 30);
  }, [items, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search routes, people, decisions, scenarios, blockers, hypotheses..."
          className="w-full border-b border-slate-800 bg-transparent px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <ul className="max-h-96 overflow-y-auto py-2">
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No results.</li>}
          {filtered.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <button
                type="button"
                onClick={() => {
                  onNavigate(item.href || "/");
                  onClose();
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
              >
                <span className="w-5 text-base">{item.icon}</span>
                <span className="flex-1 truncate">
                  <span className="block truncate">{item.title}</span>
                  <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                </span>
                {item.sev > 0 && <span className="shrink-0 text-xs text-amber-400">sev {item.sev}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
