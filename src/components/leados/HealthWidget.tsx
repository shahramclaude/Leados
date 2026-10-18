"use client";
import { useState } from "react";

interface Props {
  healthScore: { overall: number; grade: string; domains: Record<string, number>; trend: number };
}

const DOMAINS = ["people", "finance", "sales", "ops", "strategy", "gov"];
const DOMAIN_COLORS: Record<string, string> = {
  people: "bg-blue-500",
  finance: "bg-emerald-500",
  sales: "bg-orange-500",
  ops: "bg-purple-500",
  strategy: "bg-cyan-500",
  gov: "bg-pink-500",
};

export function HealthWidget({ healthScore: hs }: Props) {
  const [open, setOpen] = useState(false);
  const color = hs.overall >= 80 ? "text-emerald-400" : hs.overall >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm hover:bg-slate-700"
      >
        <span className="text-[10px] text-slate-400">HEALTH</span>
        <span className={`font-bold text-lg leading-none ${color}`}>{hs.overall}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{hs.grade}</span>
        {hs.trend !== 0 && (
          <span className={`text-[10px] ${hs.trend > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {hs.trend > 0 ? "▲" : "▼"}
            {Math.abs(hs.trend)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-12 right-0 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50">
          <div className="font-semibold text-sm mb-3">
            Organizational Health — {hs.overall}/100 ({hs.grade})
          </div>
          <div className="space-y-2">
            {DOMAINS.map((d) => {
              const score = hs.domains[d] ?? 100;
              return (
                <div key={d} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-slate-400 capitalize">{d}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${DOMAIN_COLORS[d]} rounded-full`} style={{ width: `${score}%` }} />
                  </div>
                  <span className="w-6 text-right font-mono text-slate-300">{score}</span>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-600 mt-3">
            Score = 100 − finding penalties per domain. Penalty weights are heuristic.
          </div>
        </div>
      )}
    </div>
  );
}
