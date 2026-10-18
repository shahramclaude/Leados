"use client";
import { Fragment, useState } from "react";
import type { IntelligenceData } from "@/hooks/useIntelligence";
import { FindingCard } from "../FindingCard";

const RISK_ORDER: Record<string, number> = { HIGH: 0, ELEVATED: 1, MODERATE: 2, LOW: 3 };
const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-red-600 text-white",
  ELEVATED: "bg-amber-600 text-white",
  MODERATE: "bg-yellow-600 text-black",
  LOW: "bg-green-600 text-white",
};

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
function sparkline(values: number[]) {
  if (!values.length) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => SPARK_CHARS[Math.min(SPARK_CHARS.length - 1, Math.floor(((v - min) / range) * (SPARK_CHARS.length - 1)))])
    .join("");
}

export function RosterView({ data }: { data: IntelligenceData }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { flightRisk, pulseByPerson, findings, openPlans } = data;

  const sorted = [...flightRisk].sort((a: any, b: any) => (RISK_ORDER[a.riskLevel] ?? 9) - (RISK_ORDER[b.riskLevel] ?? 9));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-sm font-semibold text-slate-300">Roster — {flightRisk.length} people</div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Cadence</th>
              <th className="px-4 py-2 font-medium">Flight risk</th>
              <th className="px-4 py-2 font-medium">Level</th>
              <th className="px-4 py-2 font-medium">Mood</th>
              <th className="px-4 py-2 font-medium">Load</th>
              <th className="px-4 py-2 font-medium">1:1 status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any) => {
              const pulse = pulseByPerson[r.personId];
              const isOpen = expanded === r.personId;
              const slip = r.daysSinceOneOnOne > 999 ? "never" : `${r.daysSinceOneOnOne}d ago`;
              return (
                <Fragment key={r.personId}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : r.personId)}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer"
                  >
                    <td className="px-4 py-2 text-slate-100 font-medium">{r.personName}</td>
                    <td className="px-4 py-2 text-slate-400">{r.role}</td>
                    <td className="px-4 py-2 font-mono text-slate-500">—</td>
                    <td className="px-4 py-2 font-mono text-slate-300">{Math.round(r.riskScore * 100)}%</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${RISK_BADGE[r.riskLevel]}`}>{r.riskLevel}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-400">{pulse?.moodMean?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-slate-400">{pulse?.loadMean?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{slip}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-950/50">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] uppercase text-slate-500 mb-1">Pulse trend (mood)</div>
                            <div className="text-2xl font-mono text-blue-400">{sparkline(pulse?.series ?? [])}</div>
                            <div className="text-[10px] uppercase text-slate-500 mt-3 mb-1">Pulse trend (load)</div>
                            <div className="text-2xl font-mono text-purple-400">{sparkline(pulse?.loadSeries ?? [])}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-slate-500 mb-2">Active findings</div>
                            <div className="space-y-2">
                              {findings.filter((f: any) => f.personId === r.personId).length === 0 && (
                                <div className="text-xs text-slate-600">No active findings for {r.personName}.</div>
                              )}
                              {findings
                                .filter((f: any) => f.personId === r.personId)
                                .map((f: any) => (
                                  <FindingCard key={f.key} finding={f} compact />
                                ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-sm font-semibold text-slate-300 mb-2">Growth plans — {openPlans.length} open</div>
        <div className="space-y-2">
          {openPlans.map((p: any) => (
            <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-100">
                  {p.personName} — <span className="text-slate-400">{p.goal}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">level: {p.level}</div>
              </div>
              <div className={`text-xs font-mono ${p.daysSinceCheckin > 30 ? "text-amber-400" : "text-slate-500"}`}>
                {p.daysSinceCheckin}d since check-in
              </div>
            </div>
          ))}
          {openPlans.length === 0 && <div className="text-sm text-slate-500">No open growth plans.</div>}
        </div>
      </div>
    </div>
  );
}
