"use client";

import { useCallback, useEffect, useState } from "react";
import type { PeopleIntelligenceReport, PersonIntelligence } from "@/lib/peopleIntelligence";
import RetentionRiskBadge from "@/components/RetentionRiskBadge";
import QualityRing from "@/components/QualityRing";
import CaptureModal from "@/components/CaptureModal";

interface EventRow {
  id: number;
  type: string;
  title: string;
  description: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RiskBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function TrendArrow({ value }: { value: number }) {
  if (value > 1) return <span className="text-emerald-400">▲</span>;
  if (value < -1) return <span className="text-rose-400">▼</span>;
  return <span className="text-slate-400">→</span>;
}

export default function PeopleIntelligenceView() {
  const [report, setReport] = useState<PeopleIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PersonIntelligence | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<EventRow[]>([]);
  const [captureFor, setCaptureFor] = useState<{ id: number; name: string } | null>(null);
  const [prevHealth, setPrevHealth] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/people/intelligence", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load people intelligence");
      const data: PeopleIntelligenceReport = await res.json();
      setReport((prev) => {
        if (prev) setPrevHealth(prev.teamHealthIndex);
        return data;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPerson = useCallback(async (p: PersonIntelligence) => {
    setSelected(p);
    try {
      const res = await fetch(`/api/people/${p.personId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSelectedEvents(data.recentEvents ?? []);
      }
    } catch {
      setSelectedEvents([]);
    }
  }, []);

  if (loading && !report) {
    return <div className="px-6 py-10 text-slate-400">Loading people intelligence…</div>;
  }
  if (error && !report) {
    return <div className="px-6 py-10 text-rose-400">{error}</div>;
  }
  if (!report) return null;

  const healthDelta = prevHealth !== null ? report.teamHealthIndex - prevHealth : 0;

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* TOP: Team Health Index + org entropy */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Team Health Index</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-slate-100">{report.teamHealthIndex}</span>
            <span className="text-sm text-slate-500">/100</span>
            <span className="text-lg ml-1">
              <TrendArrow value={healthDelta} />
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            30% inverse flight risk · 30% inverse burnout · 20% 1:1 quality · 20% org network health
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Org Entropy Trend</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-slate-100">
              {report.orgDynamics.entropyTrend > 0 ? "+" : ""}
              {report.orgDynamics.entropyTrend}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            One Euler step of orgODE · cohesion {report.orgDynamics.cohesionScore}/100 · {report.orgDynamics.isolationRisk.length}{" "}
            isolated
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Org Network Health</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-slate-100">{report.orgNetworkReport.healthScore}</span>
            <span className="text-sm text-slate-500">/100</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {report.orgNetworkReport.nodeCount} people · {report.orgNetworkReport.edgeCount} ties · design efficiency{" "}
            {report.teamDynamics.orgDesignEfficiency}
          </p>
        </div>
      </div>

      {/* PEOPLE GRID */}
      <h2 className="text-sm font-semibold text-slate-300 mb-3">People</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {report.individuals.map((p) => (
          <button
            key={p.personId}
            onClick={() => openPerson(p)}
            className="text-left rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-sm font-semibold">
                {initials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{p.name}</p>
                <p className="text-xs text-slate-500 truncate">{p.role}</p>
              </div>
              <QualityRing score={p.oneOnOneQualityScore} size={44} />
            </div>

            <div className="mt-3">
              <RetentionRiskBadge risk={p.retentionRisk} />
            </div>

            <div className="mt-3 flex gap-3">
              <RiskBar label="Flight risk" value={p.flightRiskScore} color="#fb7185" />
              <RiskBar label="Burnout" value={p.burnoutRiskScore} color="#fbbf24" />
            </div>

            <p className="mt-3 text-xs text-slate-400 line-clamp-2">{p.suggestedAction}</p>
          </button>
        ))}
      </div>

      {/* PERSON DETAIL PANEL (slide-in) */}
      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="flex-1 bg-black/50" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md h-full overflow-y-auto border-l border-white/10 bg-[#0d1016] p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{selected.name}</h3>
                <p className="text-xs text-slate-500">{selected.role}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-100">
                ✕
              </button>
            </div>

            <RetentionRiskBadge risk={selected.retentionRisk} />

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[10px] uppercase text-slate-500">Flight risk</p>
                <p className="text-xl font-semibold text-rose-300">{Math.round(selected.flightRiskScore * 100)}%</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[10px] uppercase text-slate-500">Burnout risk</p>
                <p className="text-xl font-semibold text-amber-300">{Math.round(selected.burnoutRiskScore * 100)}%</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[10px] uppercase text-slate-500">1:1 quality</p>
                <p className="text-xl font-semibold text-slate-100">{selected.oneOnOneQualityScore}/100</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[10px] uppercase text-slate-500">Days since 1:1</p>
                <p className="text-xl font-semibold text-slate-100">
                  {selected.daysSinceLastOneOnOne >= 999 ? "never" : selected.daysSinceLastOneOnOne}
                </p>
              </div>
            </div>

            <div className="mt-4 text-sm">
              <p className="text-[10px] uppercase text-slate-500 mb-1">Performance trend</p>
              <p className="capitalize text-slate-200">{selected.performanceTrend}</p>
            </div>

            <div className="mt-4 text-sm">
              <p className="text-[10px] uppercase text-slate-500 mb-1">Life stage</p>
              <p className="text-slate-200">{selected.lifeStageTag}</p>
            </div>

            <div className="mt-4 text-sm">
              <p className="text-[10px] uppercase text-slate-500 mb-1">Familiarity</p>
              <p className="text-slate-200">{selected.familiarity}/100</p>
            </div>

            <div className="mt-4">
              <p className="text-[10px] uppercase text-slate-500 mb-1">Flight risk drivers</p>
              <ul className="text-xs text-slate-300 space-y-1">
                {selected.flightRiskDrivers.length ? (
                  selected.flightRiskDrivers.map((d, i) => <li key={i}>• {d}</li>)
                ) : (
                  <li className="text-slate-500">No material drivers detected</li>
                )}
              </ul>
            </div>

            <div className="mt-4">
              <p className="text-[10px] uppercase text-slate-500 mb-1">Burnout drivers</p>
              <ul className="text-xs text-slate-300 space-y-1">
                {selected.burnoutDrivers.length ? (
                  selected.burnoutDrivers.map((d, i) => <li key={i}>• {d}</li>)
                ) : (
                  <li className="text-slate-500">No material drivers detected</li>
                )}
              </ul>
            </div>

            <div className="mt-4">
              <p className="text-[10px] uppercase text-slate-500 mb-1">Next 1:1 topics</p>
              <ul className="text-xs text-slate-300 space-y-1">
                {selected.nextOneOnOneTopics.map((t, i) => (
                  <li key={i}>• {t}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-3">
              <p className="text-[10px] uppercase text-indigo-300 mb-1">Suggested action</p>
              <p className="text-sm text-slate-100">{selected.suggestedAction}</p>
            </div>

            <div className="mt-5">
              <p className="text-[10px] uppercase text-slate-500 mb-2">Recent events</p>
              <ul className="space-y-2">
                {selectedEvents.length ? (
                  selectedEvents.map((e) => (
                    <li key={e.id} className="text-xs rounded-lg bg-white/5 p-2">
                      <div className="flex justify-between text-slate-400">
                        <span>{e.type}</span>
                        <span>{new Date(e.occurredAt).toLocaleDateString()}</span>
                      </div>
                      {e.title ? <p className="text-slate-200 mt-0.5">{e.title}</p> : null}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-slate-500">No recent events logged.</li>
                )}
              </ul>
            </div>

            <button
              onClick={() => setCaptureFor({ id: selected.personId, name: selected.name })}
              className="mt-5 w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Quick-log event
            </button>
          </div>
        </div>
      ) : null}

      {captureFor ? (
        <CaptureModal
          personId={captureFor.id}
          personName={captureFor.name}
          onClose={() => setCaptureFor(null)}
          onLogged={() => load()}
        />
      ) : null}
    </div>
  );
}
