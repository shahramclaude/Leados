"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface EvidenceRef {
  type: string;
  id: string | null;
  note: string;
}

interface AgendaItem {
  id: string;
  rank: number;
  itemType: string;
  title: string;
  whyOnAgenda: string;
  evidenceRefs: EvidenceRef[];
  sourceValue: string | null;
  thresholdValue: string | null;
  severity: number;
  status: string;
}

interface Occurrence {
  id: string;
  status: string;
  cadenceMode: string;
  cadenceReason: string | null;
  occurrenceKey: string;
  scheduledFor: string;
}

interface Ritual {
  name: string;
  quorum: number;
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  decision_near_trigger: "Decision near trigger",
  anomaly: "Anomaly",
  kr_drift: "KR drift",
  budget_variance: "Budget variance",
  people_signal_aggregate: "Team pulse (aggregate)",
  action_overdue: "Overdue action",
  cadence_rollup: "Dependent ritual rollup",
};

export default function AgendaClient({ occurrenceId }: { occurrenceId: string }) {
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [ritual, setRitual] = useState<Ritual | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cadence/occurrences/${occurrenceId}`).then((r) => r.json());
    setOccurrence(res.occurrence);
    setRitual(res.ritual);
    setAgenda((res.agenda ?? []).sort((a: AgendaItem, b: AgendaItem) => a.rank - b.rank));
  }, [occurrenceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(index: number, direction: -1 | 1) {
    const next = [...agenda];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setAgenda(next);
    await fetch(`/api/cadence/occurrences/${occurrenceId}/agenda/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((i) => i.id) }),
    });
  }

  if (!occurrence) return <p className="mt-8 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mt-6">
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="font-medium text-slate-900">
          {ritual?.name} — {occurrence.occurrenceKey}
        </p>
        <p className="text-sm text-slate-600">Scheduled for {new Date(occurrence.scheduledFor).toLocaleString()}</p>
        <p className="mt-1 text-sm text-slate-600">
          Cadence mode: <span className="font-medium">{occurrence.cadenceMode}</span>
          {occurrence.cadenceReason && <span className="text-slate-500"> — {occurrence.cadenceReason}</span>}
        </p>
        <Link
          href={`/cadence/occurrences/${occurrenceId}/capture`}
          className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start After-Ritual Capture →
        </Link>
      </div>

      {agenda.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Nothing met agenda thresholds this cycle. This is not an error — it means no decision triggers,
          anomalies, KR drift, budget variance, or overdue actions crossed their configured thresholds.
        </div>
      ) : (
        <ol className="space-y-3">
          {agenda.map((item, idx) => (
            <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    #{item.rank} · {ITEM_TYPE_LABEL[item.itemType] ?? item.itemType} · severity {item.severity}/5
                  </p>
                  <p className="mt-1 font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.whyOnAgenda}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button onClick={() => move(idx, -1)} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50">
                    ↑
                  </button>
                  <button onClick={() => move(idx, 1)} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50">
                    ↓
                  </button>
                </div>
              </div>
              <button
                onClick={() => setOpenEvidence(openEvidence === item.id ? null : item.id)}
                className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                {openEvidence === item.id ? "Hide evidence" : `Evidence (${item.evidenceRefs.length})`}
              </button>
              {openEvidence === item.id && (
                <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {item.evidenceRefs.map((ev, i) => (
                    <li key={i}>
                      <span className="font-mono">{ev.type}</span>
                      {ev.id ? ` #${ev.id.slice(0, 8)}` : ""} — {ev.note}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
