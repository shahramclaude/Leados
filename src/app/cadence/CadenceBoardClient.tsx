"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Ritual {
  id: string;
  kind: string;
  name: string;
  quorum: number;
  timezone: string;
  dependsOnRitualId: string | null;
  active: boolean;
}

interface OccurrenceHealth {
  id: string;
  ritualId: string;
  ritualName: string;
  ritualKind: string;
  occurrenceKey: string;
  scheduledFor: string;
  status: string;
  cadenceMode: string;
  cadenceReason: string | null;
  quorumRequired: number;
  quorumMet: boolean | null;
  attendeeCount: number | null;
  agendaItemCount: number;
  health: "on_track" | "skipped" | "degraded" | "awaiting_capture" | "scheduled";
  hasOverride: boolean;
}

const HEALTH_STYLES: Record<OccurrenceHealth["health"], string> = {
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-300",
  skipped: "bg-rose-100 text-rose-800 border-rose-300",
  degraded: "bg-amber-100 text-amber-800 border-amber-300",
  awaiting_capture: "bg-sky-100 text-sky-800 border-sky-300",
  scheduled: "bg-slate-100 text-slate-700 border-slate-300",
};

const HEALTH_LABEL: Record<OccurrenceHealth["health"], string> = {
  on_track: "On track",
  skipped: "Skipped",
  degraded: "Degraded",
  awaiting_capture: "Awaiting capture",
  scheduled: "Scheduled",
};

export default function CadenceBoardClient() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rituals, setRituals] = useState<Ritual[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceHealth[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastTickNote, setLastTickNote] = useState<string | null>(null);

  const load = useCallback(async (orgIdParam?: string) => {
    const qs = orgIdParam ? `?orgId=${orgIdParam}` : "";
    const [ritualsRes, occRes] = await Promise.all([
      fetch(`/api/cadence/rituals${qs}`).then((r) => r.json()),
      fetch(`/api/cadence/occurrences${qs}`).then((r) => r.json()),
    ]);
    setOrgId(ritualsRes.orgId);
    setRituals(ritualsRes.rituals ?? []);
    setOccurrences(occRes.occurrences ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSeed() {
    setBusy(true);
    try {
      const res = await fetch("/api/cadence/seed", { method: "POST" }).then((r) => r.json());
      await load(res.orgId);
    } finally {
      setBusy(false);
    }
  }

  async function handleTick() {
    setBusy(true);
    try {
      const qs = orgId ? `?orgId=${orgId}` : "";
      const res = await fetch(`/api/cadence/tick${qs}`, { method: "POST" }).then((r) => r.json());
      const created = (res.results ?? []).filter((r: { created: boolean }) => r.created).length;
      setLastTickNote(`Tick ran for ${(res.results ?? []).length} ritual(s), created ${created} new occurrence(s) at ${res.now}.`);
      await load(orgId ?? undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSeed}
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Seed demo org
        </button>
        <button
          onClick={handleTick}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Run cadence tick
        </button>
        <Link href="/cadence/policies" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">
          Cadence Policy Editor →
        </Link>
        {orgId && <span className="text-xs text-slate-500">org: {orgId}</span>}
      </div>
      {lastTickNote && <p className="mb-4 text-sm text-slate-600">{lastTickNote}</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Cadence graph</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {rituals.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{r.kind.replace(/_/g, " ")}</p>
              <p className="mt-1 font-medium text-slate-900">{r.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                quorum {r.quorum} · {r.timezone}
              </p>
              {r.dependsOnRitualId && <p className="mt-1 text-xs text-indigo-600">feeds from dependency ↑</p>}
            </div>
          ))}
          {rituals.length === 0 && <p className="text-sm text-slate-500">No rituals yet — seed the demo org to populate the graph.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Occurrences</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Ritual</th>
                <th className="px-4 py-2">Occurrence</th>
                <th className="px-4 py-2">Scheduled for</th>
                <th className="px-4 py-2">Cadence</th>
                <th className="px-4 py-2">Quorum</th>
                <th className="px-4 py-2">Agenda</th>
                <th className="px-4 py-2">Health</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{o.ritualName}</td>
                  <td className="px-4 py-2 text-slate-600">{o.occurrenceKey}</td>
                  <td className="px-4 py-2 text-slate-600">{new Date(o.scheduledFor).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {o.cadenceMode}
                    {o.hasOverride && <span className="ml-1 text-amber-600">(override logged)</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {o.attendeeCount ?? "—"}/{o.quorumRequired}
                    {o.quorumMet === false && <span className="ml-1 text-rose-600">under quorum</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{o.agendaItemCount} item(s)</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${HEALTH_STYLES[o.health]}`}>
                      {HEALTH_LABEL[o.health]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/cadence/occurrences/${o.id}`} className="text-indigo-600 hover:underline">
                      Open agenda →
                    </Link>
                  </td>
                </tr>
              ))}
              {occurrences.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No occurrences yet. Seed the demo org, then run a cadence tick.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
