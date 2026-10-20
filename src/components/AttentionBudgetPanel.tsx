"use client";

// "Visible spend" for the daily interrupt budget + an explainable snapshot
// of the attention engine (cognitive load, fatigue, circadian state,
// adaptive batching policy currently in effect).

import { useEffect, useState } from "react";
import { useNowTick } from "@/hooks/useNowTick";

interface AttentionStatus {
  cognitiveLoad: { score: number; explanation: string[] };
  circadian: { inQuietHours: boolean; receptivity: number; minutesUntilQuietHoursEnd: number };
  budget: { used: number; budget: number; remaining: number };
  adaptive: { interruptSeverityFloor: number; digestIntervalMinutes: number; explanation: string[] };
}

export function AttentionBudgetPanel() {
  const [status, setStatus] = useState<AttentionStatus | null>(null);
  const tick = useNowTick(30_000);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/attention/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data && setStatus(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (!status) {
    return <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const pct = status.budget.budget > 0 ? Math.round((status.budget.used / status.budget.budget) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Attention budget today</h3>
        <span className="text-xs text-slate-500">
          {status.budget.used}/{status.budget.budget} interrupts used
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>
          <dt className="text-slate-400">Cognitive load</dt>
          <dd className="font-medium text-slate-800">{status.cognitiveLoad.score}/100</dd>
        </div>
        <div>
          <dt className="text-slate-400">Quiet hours</dt>
          <dd className="font-medium text-slate-800">{status.circadian.inQuietHours ? "Active" : "Not active"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Digest cadence</dt>
          <dd className="font-medium text-slate-800">every {status.adaptive.digestIntervalMinutes}m</dd>
        </div>
        <div>
          <dt className="text-slate-400">Interrupt floor</dt>
          <dd className="font-medium text-slate-800">severity {status.adaptive.interruptSeverityFloor}+</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] italic text-slate-400">{status.cognitiveLoad.explanation.join(" · ")}</p>
    </div>
  );
}
