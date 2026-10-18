"use client";

import { Fragment, useEffect, useState } from "react";
import type { IntelligenceData } from "@/lib/intelligence";
import { QuickCapture, type EventType } from "@/components/leados/QuickCapture";

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function sparkline(series: number[]): { chars: string; lastColor: string } {
  if (series.length === 0) return { chars: "—", lastColor: "text-slate-500" };
  const chars = series
    .map((v) => {
      const idx = Math.max(0, Math.min(7, Math.round(((v - 1) / 4) * 7)));
      return BARS[idx];
    })
    .join("");
  const last = series[series.length - 1];
  const lastColor = last < 3 ? "text-red-400" : last < 4 ? "text-amber-400" : "text-green-400";
  return { chars, lastColor };
}

function cadenceColor(days: number | null, target: number): string {
  if (days === null) return "text-red-400";
  const ratio = days / target;
  if (ratio <= 1.1) return "text-green-400";
  if (ratio <= 1.5) return "text-amber-400";
  return "text-red-400";
}

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-red-600/20 text-red-400 border-red-700/50",
  ELEVATED: "bg-amber-600/20 text-amber-400 border-amber-700/50",
  LOW: "bg-slate-800 text-slate-500 border-slate-700",
};

function PulseSvg({ series }: { series: number[] }) {
  const w = 200;
  const h = 60;
  const barW = w / Math.max(series.length, 1);
  return (
    <svg width={w} height={h} className="rounded bg-slate-950/50">
      {series.map((v, i) => {
        const barH = (v / 5) * (h - 4);
        const color = v < 3 ? "#f87171" : v < 4 ? "#fbbf24" : "#4ade80";
        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={h - barH}
            width={Math.max(barW - 2, 1)}
            height={barH}
            fill={color}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

export function RosterView({
  data,
  refetch,
  expandPersonId,
  setExpandPersonId,
}: {
  data: IntelligenceData;
  refetch: () => Promise<void>;
  expandPersonId: number | null;
  setExpandPersonId: (id: number | null) => void;
}) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [capture, setCapture] = useState<{ type: EventType; personId: number } | null>(null);

  useEffect(() => {
    if (expandPersonId !== null) {
      const el = document.getElementById(`person-row-${expandPersonId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [expandPersonId]);

  const highRisk = [...data.flightRisk].filter((f) => f.riskLevel === "HIGH" || f.riskLevel === "ELEVATED").sort((a, b) => b.riskScore - a.riskScore);

  async function scheduleOneOnOne(personId: number) {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "oneonone_scheduled", domain: "people", personId, data: {} }),
    });
    refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">People Intelligence</h2>
        <span className="font-mono text-sm text-slate-500">{data.peopleCount} people</span>
      </div>

      {highRisk.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Flight risk</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highRisk.map((p) => (
              <div key={p.personId} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-slate-100">{p.personName}</div>
                    <div className="text-xs text-slate-500">{p.role}</div>
                  </div>
                  <span className={`text-2xl font-bold ${p.riskLevel === "HIGH" ? "text-red-500" : "text-amber-500"}`}>
                    {p.riskScore}%
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  mood {p.moodMean} · load {p.loadMean}
                  {p.daysSinceOneOnOne != null ? ` · ${p.daysSinceOneOnOne}d since 1:1` : " · no 1:1 on record"}
                </div>
                <button
                  onClick={() => scheduleOneOnOne(p.personId)}
                  className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                >
                  Schedule 1:1
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Mood</th>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Cadence</th>
              <th className="px-3 py-2">Flight risk</th>
              <th className="px-3 py-2">Plans</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.flightRisk.map((p) => {
              const stat = data.pulseByPerson[p.personId];
              const spark = sparkline(stat?.series ?? []);
              const plans = data.openPlans.filter((pl) => pl.personId === p.personId);
              const expanded = expandPersonId === p.personId;
              const person = { id: p.personId, name: p.personName };

              return (
                <Fragment key={p.personId}>
                  <tr
                    id={`person-row-${p.personId}`}
                    key={p.personId}
                    onClick={() => setExpandPersonId(expanded ? null : p.personId)}
                    className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/40"
                  >
                    <td className="px-3 py-2 font-medium text-slate-200">{p.personName}</td>
                    <td className="px-3 py-2 text-slate-400">{p.role}</td>
                    <td className="px-3 py-2 font-mono">
                      <span className="text-slate-400">{spark.chars.slice(0, -1)}</span>
                      <span className={spark.lastColor}>{spark.chars.slice(-1)}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{p.loadMean}</td>
                    <td className={`px-3 py-2 font-mono ${cadenceColor(p.daysSinceOneOnOne, 14)}`}>
                      {p.daysSinceOneOnOne != null ? `${p.daysSinceOneOnOne}d` : "—"} / target 14d
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${RISK_BADGE[p.riskLevel]}`}>
                        {p.riskScore}% {p.riskLevel}
                      </span>
                    </td>
                    <td className="px-3 py-2" title={plans.map((pl) => pl.goal).join(", ")}>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{plans.length}</span>
                    </td>
                    <td className="relative px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setOpenMenu(openMenu === p.personId ? null : p.personId)}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-600"
                      >
                        Actions ▾
                      </button>
                      {openMenu === p.personId && (
                        <div className="absolute right-3 z-10 mt-1 w-40 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
                          {(
                            [
                              ["Log 1:1", "oneonone"],
                              ["Log pulse", "pulse"],
                              ["Give feedback", "feedback"],
                            ] as [string, EventType][]
                          ).map(([label, type]) => (
                            <button
                              key={type}
                              onClick={() => {
                                setCapture({ type, personId: p.personId });
                                setOpenMenu(null);
                              }}
                              className="block w-full rounded px-2 py-1 text-left text-xs text-slate-300 hover:bg-slate-800"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-t border-slate-800 bg-slate-950/40">
                      <td colSpan={8} className="px-3 py-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div>
                            <div className="mb-1 text-xs font-semibold text-slate-400">Pulse history</div>
                            <PulseSvg series={stat?.series ?? []} />
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-semibold text-slate-400">Active findings</div>
                            <div className="space-y-1">
                              {data.findings.filter((f) => f.personId === p.personId).map((f) => (
                                <div key={f.key} className="text-xs text-slate-300">
                                  <span className="font-mono text-slate-500">{f.rule}</span> {f.title}
                                </div>
                              ))}
                              {data.findings.filter((f) => f.personId === p.personId).length === 0 && (
                                <div className="text-xs text-slate-600">No active findings.</div>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-semibold text-slate-400">Growth plans</div>
                            <div className="space-y-1">
                              {plans.map((pl) => (
                                <div key={pl.id} className="text-xs text-slate-300">
                                  {pl.goal} <span className="text-slate-500">({pl.level}) · {pl.daysSinceCheckin}d since check-in</span>
                                </div>
                              ))}
                              {plans.length === 0 && <div className="text-xs text-slate-600">No active plans.</div>}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {capture && capture.personId === p.personId && null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {capture && (
        <QuickCapture
          eventType={capture.type}
          personId={capture.personId}
          people={data.flightRisk}
          onClose={() => setCapture(null)}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}
