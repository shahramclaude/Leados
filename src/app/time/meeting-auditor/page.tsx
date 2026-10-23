"use client";

import { useEffect, useState } from "react";
import { useActor, useActorFetch } from "../ActorContext";

interface AuditorRow {
  recurrenceKey: string;
  title: string;
  instanceCount: number;
  zeroOutcomeStreakWeeks: number;
  trendDirection: "improving" | "flat" | "declining";
  avgOutcomeDensityPerHour: number;
  avgCostPerOccurrence: number;
  latestTotalCost: number;
  cadenceSuggestion: { action: string; reason: string; targetMinutes?: number; from?: string; to?: string };
  headlineFinding: string | null;
  currentValueScore: number;
}

export default function MeetingAuditorPage() {
  const { actorId } = useActor();
  const actorFetch = useActorFetch();
  const [rows, setRows] = useState<AuditorRow[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [method, setMethod] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId) return;
    actorFetch("/api/time-economics/meetings/auditor")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setRows(d.recurringMeetings ?? []);
        setCurrency(d.currency ?? "USD");
        setMethod(d.method ?? []);
      });
  }, [actorId, actorFetch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="m-0 text-lg font-semibold text-slate-950">Meeting Auditor</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recurring meetings ranked by value (outcomes per $1,000 spent) — worst value first, with a specific redesign option for each.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.recurrenceKey} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-base font-semibold text-slate-950">{r.title}</h3>
              <ActionBadge action={r.cadenceSuggestion.action} />
            </div>
            {r.headlineFinding && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">⚠ {r.headlineFinding}</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Metric label="Instances" value={String(r.instanceCount)} />
              <Metric label="Outcome density / hr" value={String(r.avgOutcomeDensityPerHour)} />
              <Metric label="Avg cost / occurrence" value={`${currency} ${r.avgCostPerOccurrence.toLocaleString()}`} />
              <Metric label="Trend" value={r.trendDirection} />
            </div>
            <p className="mt-3 text-sm text-slate-700">
              <strong>Suggestion:</strong> {r.cadenceSuggestion.reason}
              {r.cadenceSuggestion.targetMinutes ? ` (target: ${r.cadenceSuggestion.targetMinutes} min)` : ""}
            </p>
          </div>
        ))}
        {rows.length === 0 && !error && <p className="text-sm text-slate-500">No recurring meetings found yet.</p>}
      </div>

      {method.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="m-0 mb-1 font-semibold text-slate-700">Method:</p>
          <ul className="m-0 list-disc space-y-1 pl-4">
            {method.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    kill: "bg-red-100 text-red-700",
    shorten: "bg-amber-100 text-amber-700",
    convert_async: "bg-indigo-100 text-indigo-700",
    reduce_frequency: "bg-indigo-100 text-indigo-700",
    keep: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[action] ?? "bg-slate-100 text-slate-700"}`}>{action.replace("_", " ")}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="m-0 text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="m-0 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
