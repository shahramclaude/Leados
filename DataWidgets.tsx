import { useEffect, useMemo, useRef, useState } from "react";
import type { LeadEvent, RuleDef, Store } from "../types";
import { eventsPerDayForHeatmap, analyzeAuditTrail } from "../lib/audit";
import { RULES } from "../data/catalog";
import { Badge, Button, Card, Mono } from "./primitives";
import { fmtDateTime } from "../lib/utils";
import { navigate, buildTraceLink } from "../lib/router";
import * as store from "../lib/store";
import { levenshtein } from "../lib/utils";

// --- Calendar heatmap: GitHub-style 7-rows (days) × ~53-columns (weeks),
// i.e. the brief's "12 months × 7 days" rendered as a rolling year grid.
// Progressive enhancement: IntersectionObserver defers building cells until
// the panel scrolls into view (cheap here, but demonstrates the pattern the
// brief asks for).
export function CalendarHeatmap({ storeState, today }: { storeState: Store; today: Date }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [clickedDay, setClickedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible(true);
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const counts = useMemo(() => eventsPerDayForHeatmap(storeState, today), [storeState, today]);
  const weeks = useMemo(() => {
    const out: string[][] = [];
    const start = new Date(today);
    start.setDate(start.getDate() - 370);
    // align to Sunday
    start.setDate(start.getDate() - start.getDay());
    let cur = new Date(start);
    while (cur <= today) {
      const col: string[] = [];
      for (let d = 0; d < 7; d++) {
        col.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      out.push(col);
    }
    return out;
  }, [today]);

  const max = Math.max(1, ...Array.from(counts.values()));
  const colorFor = (n: number) => {
    if (n === 0) return "bg-slate-100";
    const ratio = n / max;
    if (ratio > 0.75) return "bg-violet-700";
    if (ratio > 0.5) return "bg-violet-500";
    if (ratio > 0.25) return "bg-violet-300";
    return "bg-violet-200";
  };

  const dayEvents: LeadEvent[] = clickedDay ? storeState.events.filter((e) => e.ts.startsWith(clickedDay)) : [];

  return (
    <div ref={ref}>
      {!visible ? (
        <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <>
          <div className="flex gap-[3px] overflow-x-auto pb-2">
            {weeks.map((col, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {col.map((day) => (
                  <div
                    key={day}
                    onMouseEnter={() => setHoverDay(day)}
                    onMouseLeave={() => setHoverDay(null)}
                    onClick={() => setClickedDay(day)}
                    title={`${day}: ${counts.get(day) || 0} events`}
                    className={`h-3 w-3 cursor-pointer rounded-sm ${colorFor(counts.get(day) || 0)}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500">
            {hoverDay ? `${hoverDay}: ${counts.get(hoverDay) || 0} events` : "Hover a day for its count, click for the event list."}
          </div>
          {clickedDay && (
            <Card className="mt-3 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-800">Events on {clickedDay}</div>
                <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setClickedDay(null)}>close</button>
              </div>
              {dayEvents.length === 0 ? (
                <div className="text-xs text-slate-400">No events this day.</div>
              ) : (
                <ul className="space-y-1">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="flex justify-between text-xs">
                      <button className="font-mono text-violet-700 hover:underline" onClick={() => navigate(buildTraceLink(e.id))}>
                        {e.type}
                      </button>
                      <span className="text-slate-400">{fmtDateTime(e.ts)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// --- Event Browser
export function EventBrowser({ storeState }: { storeState: Store }) {
  const [typeFilter, setTypeFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [importedOnly, setImportedOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"seq" | "ts" | "type">("seq");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const types = useMemo(() => [...new Set(storeState.events.map((e) => e.type))].sort(), [storeState.events]);
  const domains = useMemo(() => [...new Set(storeState.events.map((e) => e.domain))].sort(), [storeState.events]);

  const rows = useMemo(() => {
    let r = storeState.events;
    if (typeFilter) r = r.filter((e) => e.type === typeFilter);
    if (domainFilter) r = r.filter((e) => e.domain === domainFilter);
    if (personFilter) r = r.filter((e) => e.personId === personFilter);
    if (importedOnly) r = r.filter((e) => e.imported);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      r = r.filter((e) => {
        const text = JSON.stringify(e.data).toLowerCase();
        if (text.includes(needle)) return true;
        return text.split(/\W+/).some((w) => w && levenshtein(w, needle) <= 2);
      });
    }
    r = [...r].sort((a, b) => {
      const av = sortKey === "ts" ? new Date(a.ts).getTime() : sortKey === "type" ? a.type : a.seq;
      const bv = sortKey === "ts" ? new Date(b.ts).getTime() : sortKey === "type" ? b.type : b.seq;
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return r;
  }, [storeState.events, typeFilter, domainFilter, personFilter, importedOnly, q, sortKey, sortDir]);

  const personName = (id?: string) => storeState.people.find((p) => p.id === id)?.name || id || "—";

  function headerClick(key: "seq" | "ts" | "type") {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
          <option value="">All people</option>
          {storeState.people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={importedOnly} onChange={(e) => setImportedOnly(e.target.checked)} /> imported only
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="fuzzy search event data…"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
        />
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="cursor-pointer px-3 py-2" onClick={() => headerClick("seq")}>seq</th>
              <th className="cursor-pointer px-3 py-2" onClick={() => headerClick("ts")}>timestamp</th>
              <th className="cursor-pointer px-3 py-2" onClick={() => headerClick("type")}>type</th>
              <th className="px-3 py-2">person/entity</th>
              <th className="px-3 py-2">preview</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50" onClick={() => navigate(buildTraceLink(e.id))}>
                <td className="px-3 py-1.5 font-mono">{e.seq}</td>
                <td className="px-3 py-1.5 text-slate-500">{fmtDateTime(e.ts)}</td>
                <td className="px-3 py-1.5 font-mono text-violet-700">{e.type}{e.imported && <Badge tone="amber"> imported</Badge>}</td>
                <td className="px-3 py-1.5">{personName(e.personId)}</td>
                <td className="max-w-[260px] truncate px-3 py-1.5 text-slate-500">{JSON.stringify(e.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{rows.length} of {storeState.events.length} events shown.</div>
    </div>
  );
}

// --- Audit Intelligence summary
export function AuditIntelligence({ storeState, today }: { storeState: Store; today: Date }) {
  const summary = useMemo(() => analyzeAuditTrail(storeState, today, 30), [storeState, today]);
  return (
    <Mono>
{`AUDIT INTELLIGENCE · last ${summary.windowDays}d
─────────────────────────────────────────────────────────────
${summary.total} events logged · ${summary.perDayAvg}/day average
Most logged: ${summary.topTypes.slice(0, 2).map((t) => `${t.type} (${t.count})`).join(" · ") || "n/a"}
Peak day: ${summary.peakDay ? `${summary.peakDay.day} (${summary.peakDay.pct}% of events)` : "n/a"}
${summary.writeFailures} write failures · 0 quota events
${summary.imports} imports · ${summary.playbookCompletions} playbook.completed events
Snooze rate: ${summary.snoozeRate}% · Dismiss rate: ${summary.dismissRate}% · Play rate: ${summary.playRate}%`}
    </Mono>
  );
}

// --- Global mute manager
export function MuteManager({ storeState, onChange }: { storeState: Store; onChange: () => void }) {
  return (
    <div className="space-y-2">
      {RULES.map((r: RuleDef) => {
        const muted = storeState.meta.mutedRules.find((m) => m.rule === r.id);
        return (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <span className="font-mono text-sm text-slate-800">{r.id}</span>{" "}
              <span className="text-sm text-slate-600">{r.tag}</span>{" "}
              <Badge tone="slate">{r.domain}</Badge>
              {muted && <span className="ml-2 text-xs text-slate-400">muted {fmtDateTime(muted.ts)} · {muted.reason}</span>}
            </div>
            {muted ? (
              <Button variant="ghost" onClick={() => { store.unmuteRule(r.id); onChange(); }}>Unmute</Button>
            ) : (
              <Button variant="ghost" onClick={() => { store.muteRule(r.id, "muted from #/data → Rules"); onChange(); }}>Mute</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Tiny ResizeObserver-driven sparkline (progressive enhancement: falls
// back to a fixed width if ResizeObserver is unavailable).
export function Sparkline({ values }: { values: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(160);
  useEffect(() => {
    if (!ref.current || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.max(60, entry.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const h = 32;
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${h - (v / max) * (h - 4) - 2}`)
    .join(" ");
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={h} className="overflow-visible">
        <polyline points={points} fill="none" stroke="currentColor" className="text-violet-500" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
