"use client";

import type { IntelligenceData } from "@/lib/intelligence";

const URGENCY_COLOR: Record<string, string> = {
  NOW: "bg-red-600/20 text-red-400 border-red-700/50",
  TODAY: "bg-amber-600/20 text-amber-400 border-amber-700/50",
  THIS_WEEK: "bg-yellow-600/20 text-yellow-400 border-yellow-700/50",
  MONITOR: "bg-slate-700/40 text-slate-400 border-slate-700",
};

const MODE_DESCRIPTION: Record<string, string> = {
  REACTIVE: "Multiple critical fires. Focus entirely on triage this week — defer new initiatives.",
  STRUCTURAL_STRESS: "Decision backlog is compounding. Prioritize forcing functions and unblockers.",
  STRATEGIC_DRIFT: "Signal is diffuse across many domains. Tighten focus and re-align priorities.",
  BALANCED: "Signal is manageable. Good week to invest in growth and proactive work.",
};

const MODE_COLOR: Record<string, string> = {
  REACTIVE: "text-red-400",
  STRUCTURAL_STRESS: "text-amber-400",
  STRATEGIC_DRIFT: "text-cyan-400",
  BALANCED: "text-green-400",
};

function ConfidenceArc({ confidence }: { confidence: number }) {
  const r = 28;
  const cx = 32;
  const cy = 32;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - confidence / 100);
  return (
    <svg width="64" height="36" viewBox="0 0 64 36">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1e293b" strokeWidth="6" />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#6366f1"
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="12" fill="#e2e8f0" fontFamily="monospace">
        {confidence}%
      </text>
    </svg>
  );
}

export function IntelligenceView({ data, refetch }: { data: IntelligenceData; refetch: () => Promise<void> }) {
  async function fireAction(action: string, domain: string) {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "inference_action", domain, data: { action } }),
    });
    refetch();
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-100">Intelligence</h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Column 1: Belief state */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-300">Belief State</h3>
            <span
              title="Bayesian inference. Prior × likelihood ratios from published research. Labeled: small n → high uncertainty. These are estimates, not facts."
              className="cursor-help text-slate-600"
            >
              ⓘ
            </span>
          </div>
          <div className="space-y-3">
            {Object.entries(data.beliefs).map(([key, b]) => (
              <div key={key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-200">{b.label}</div>
                  {b.highRisk && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{b.priorPct}%</span>
                  <span>→</span>
                  <span className={`text-2xl font-bold ${b.posteriorPct > 60 ? "text-red-400" : b.posteriorPct > 35 ? "text-amber-400" : "text-green-400"}`}>
                    {b.posteriorPct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${b.posteriorPct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {b.appliedEvidence.length === 0 && <span className="text-xs text-slate-600">No evidence applied — baseline prior.</span>}
                  {b.appliedEvidence.map((e, i) => (
                    <span key={i} className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Inference chains */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Forward Inference</h3>
          <div className="space-y-3">
            {data.inferences.map((inf) => (
              <div key={inf.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center gap-3">
                  <ConfidenceArc confidence={inf.confidence} />
                  <div className="font-semibold text-slate-100">{inf.title}</div>
                </div>
                <ul className="mt-2 space-y-1 pl-3 text-xs text-slate-500">
                  {inf.premises.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${URGENCY_COLOR[inf.urgency]}`}>{inf.urgency}</span>
                  <button
                    onClick={() => fireAction(inf.action, inf.domain)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500"
                  >
                    {inf.action}
                  </button>
                </div>
              </div>
            ))}
            {data.inferences.length === 0 && <div className="text-sm text-slate-500">No active inferences.</div>}
          </div>
        </div>

        {/* Column 3: System signals */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-300">Org Entropy</h3>
            <div className="text-3xl font-bold text-slate-100">{data.orgEntropy.toFixed(2)}</div>
            <div className="text-sm text-slate-400">{Math.round(data.orgEntropy * 100)}% normalized</div>
            <p className="mt-1 text-xs text-slate-500">
              {data.orgEntropy < 0.2
                ? "Rigid — low diversity"
                : data.orgEntropy > 0.8
                  ? "Chaotic — too dispersed"
                  : "Healthy signal diversity"}
            </p>
            <p className="mt-2 text-[10px] text-slate-600">Source: Shannon entropy over finding domain distribution</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-300">Temporal Mode</h3>
            <div className={`text-2xl font-bold ${MODE_COLOR[data.temporalMode]}`}>{data.temporalMode}</div>
            <p className="mt-1 text-xs text-slate-500">{MODE_DESCRIPTION[data.temporalMode]}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Feedback Loops</h3>
            <div className="space-y-2">
              {data.feedbackLoops.map((loop) => (
                <div
                  key={loop.id}
                  className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs ${
                    loop.active
                      ? loop.polarity === "REINFORCING"
                        ? "animate-pulse border-red-600 text-red-400"
                        : "border-green-700/60 text-green-400"
                      : "border-slate-800 text-slate-600"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${loop.active ? "bg-current" : "bg-slate-700"}`} />
                    {loop.name}
                  </span>
                  <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px]">{loop.polarity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
