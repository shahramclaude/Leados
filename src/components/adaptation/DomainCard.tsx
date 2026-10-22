"use client";

// src/components/adaptation/DomainCard.tsx
//
// Renders one domain's facts through the adapted presentation. Density mode
// changes layout; content (facts, values, severities, detail text) is always
// the complete set returned by the server — this component never filters it.

import { useCallback, useEffect, useState } from "react";
import type { Domain } from "@/lib/familiarity";
import { useAdaptation } from "@/components/adaptation/AdaptationProvider";
import { DENSITY_TOKENS, type DensityMode } from "@/lib/design/tokens";

interface DashboardFact {
  id: string;
  domain: Domain;
  label: string;
  value: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  detail: string;
}

interface DashboardResponse {
  ok: boolean;
  densityMode: DensityMode;
  layout: "narrative" | "hybrid" | "table";
  facts: DashboardFact[];
}

const SEVERITY_STYLE: Record<DashboardFact["severity"], string> = {
  critical: "bg-rose-100 text-rose-700 border-rose-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  low: "bg-sky-50 text-sky-700 border-sky-100",
  info: "bg-slate-100 text-slate-600 border-slate-200",
};

const DOMAIN_LABEL: Record<Domain, string> = {
  finance: "Finance",
  people: "People",
  risk: "Risk",
  tech: "Technology",
};

export function DomainCard({ domain }: { domain: Domain }) {
  const { userId, ready, standardView, logEvent } = useAdaptation();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!ready) return;
    const params = new URLSearchParams({ userId, domain, standard: standardView ? "1" : "0" });
    const res = await fetch(`/api/adaptation/dashboard?${params.toString()}`);
    const json = await res.json();
    if (json.ok) setData(json);
  }, [ready, userId, domain, standardView]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400">Loading {DOMAIN_LABEL[domain]}…</div>;
  }

  const tokens = DENSITY_TOKENS[data.densityMode];

  const toggleDetail = async (factId: string) => {
    const next = !expanded[factId];
    setExpanded((prev) => ({ ...prev, [factId]: next }));
    if (next) await logEvent(domain, "expand_detail", 0.8, { factId });
    else await logEvent(domain, "collapse_detail", 0.5, { factId });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid={`domain-card-${domain}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{DOMAIN_LABEL[domain]}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {tokens.label} · {data.layout}
        </span>
      </div>

      <div className={`mt-4 ${tokens.spacing}`}>
        {data.layout === "table" ? (
          <table className="w-full table-fixed text-xs">
            <tbody>
              {data.facts.map((fact) => (
                <tr key={fact.id} className="border-b border-slate-100 last:border-0">
                  <td className="w-1/3 py-1.5 font-medium text-slate-700">{fact.label}</td>
                  <td className="w-1/4 py-1.5 font-semibold text-slate-900">{fact.value}</td>
                  <td className="py-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[fact.severity]}`}>
                      {fact.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          data.facts.map((fact) => (
            <div key={fact.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold text-slate-900 ${tokens.fontSize}`}>{fact.label}</p>
                  <p className="text-sm text-slate-700">{fact.value}</p>
                </div>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[fact.severity]}`}>
                  {fact.severity}
                </span>
              </div>
              {(tokens.showNarrative || expanded[fact.id]) && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{fact.detail}</p>
              )}
              {!tokens.showNarrative && (
                <button
                  type="button"
                  onClick={() => toggleDetail(fact.id)}
                  className="mt-2 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  {expanded[fact.id] ? "Hide detail" : "Show detail"}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <p className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400">Simulate interaction (demo only)</p>
        <button
          type="button"
          onClick={async () => {
            await logEvent(domain, "drilldown", 0.8, { factId: data.facts[0]?.id });
            await load();
          }}
          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Drill into detail
        </button>
        <button
          type="button"
          onClick={async () => {
            await logEvent(domain, "vocabulary_use", 0.7);
            await load();
          }}
          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Use technical filter
        </button>
        <button
          type="button"
          onClick={async () => {
            await logEvent(domain, "switch_to_table", 0.8);
            await load();
          }}
          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Switch to table
        </button>
        <button
          type="button"
          onClick={async () => {
            await logEvent(domain, "switch_to_chart", 0.8);
            await load();
          }}
          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Switch to chart
        </button>
        <button
          type="button"
          onClick={async () => {
            await logEvent(domain, "quick_decision", 0.7);
            await load();
          }}
          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Quick decision
        </button>
        <button
          type="button"
          onClick={async () => {
            await logEvent(domain, "deliberate_review", 0.7);
            await load();
          }}
          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Deliberate review
        </button>
        <button
          type="button"
          onClick={load}
          className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
        >
          Refresh view
        </button>
      </div>
    </div>
  );
}
