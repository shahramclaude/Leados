"use client";

import { useState } from "react";
import type { Finding, IntelligenceData, Severity } from "@/lib/intelligence";
import type { ViewKey } from "@/components/leados/Shell";

const MODE_COLORS: Record<string, string> = {
  REACTIVE: "bg-red-600/20 text-red-400 border-red-700/50",
  STRUCTURAL_STRESS: "bg-amber-600/20 text-amber-400 border-amber-700/50",
  STRATEGIC_DRIFT: "bg-cyan-600/20 text-cyan-400 border-cyan-700/50",
  BALANCED: "bg-green-600/20 text-green-400 border-green-700/50",
};

const SEV_COLOR: Record<Severity, string> = {
  5: "border-red-600 text-red-500",
  4: "border-amber-600 text-amber-500",
  3: "border-yellow-500 text-yellow-500",
  2: "border-blue-500 text-blue-400",
  1: "border-green-600 text-green-500",
};

const DOMAIN_COLOR: Record<string, string> = {
  people: "bg-blue-400",
  finance: "bg-emerald-400",
  sales: "bg-orange-400",
  ops: "bg-purple-400",
  strategy: "bg-cyan-400",
  gov: "bg-pink-400",
};

const URGENCY_COLOR: Record<string, string> = {
  NOW: "bg-red-600/20 text-red-400 border-red-700/50",
  TODAY: "bg-amber-600/20 text-amber-400 border-amber-700/50",
  THIS_WEEK: "bg-yellow-600/20 text-yellow-400 border-yellow-700/50",
  MONITOR: "bg-slate-700/40 text-slate-400 border-slate-700",
};

export function FindingCard({ f }: { f: Finding }) {
  return (
    <div className={`rounded-lg border bg-slate-900/60 p-3 ${SEV_COLOR[f.sev].split(" ")[0]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${DOMAIN_COLOR[f.domain]}`} />
          <span className="font-medium text-slate-100">{f.title}</span>
        </div>
        <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{f.rule}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">{f.detail}</p>
    </div>
  );
}

export function TodayView({ data, navigate }: { data: IntelligenceData; navigate: (v: ViewKey, personId?: number) => void }) {
  const [showMonitoring, setShowMonitoring] = useState(false);

  const critical = data.findings.filter((f) => f.sev === 5);
  const high = data.findings.filter((f) => f.sev === 4);
  const elevated = data.findings.filter((f) => f.sev === 3);
  const monitoring = data.findings.filter((f) => f.sev <= 2);

  const criticalCount = critical.length;
  const atRiskPeople = data.flightRisk.filter((f) => f.riskLevel !== "LOW").length;
  const escalateDecisions = data.decisions.filter((d) => d.status === "ESCALATE" || d.status === "STALE");

  const highRiskBeliefs = Object.entries(data.beliefs).filter(([, b]) => b.highRisk);

  return (
    <div className="flex flex-col gap-4">
      {/* Situation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-b border-slate-800 bg-slate-900/40 px-4 py-3">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${MODE_COLORS[data.temporalMode]}`}>
          {data.temporalMode}
        </span>
        <div className="text-sm text-slate-400">
          <span className="font-mono text-slate-200">{data.findings.length}</span> findings ·{" "}
          <span className="font-mono text-red-400">{criticalCount}</span> critical ·{" "}
          <span className="font-mono text-amber-400">{atRiskPeople}</span> people at risk · entropy{" "}
          <span className="font-mono text-slate-200">{data.orgEntropy.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-slate-100">{data.healthScore.overall}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-xs font-mono text-slate-400">{data.healthScore.grade}</span>
          <span className="text-slate-500">{data.healthScore.trend === "up" ? "▲" : data.healthScore.trend === "down" ? "▼" : "▬"}</span>
        </div>
      </div>

      {/* Highest leverage action */}
      <div className="rounded-xl border border-indigo-700/50 bg-indigo-950/30 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Do this now</div>
        {data.highestLeverageAction ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xl font-semibold text-slate-100">{data.highestLeverageAction.action}</span>
            <div className="flex items-center gap-2">
              <span className="rounded border border-slate-700 px-2 py-0.5 font-mono text-xs text-slate-400">
                {data.highestLeverageAction.source}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${URGENCY_COLOR[data.highestLeverageAction.urgency]}`}>
                {data.highestLeverageAction.urgency}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-1 text-slate-400">No urgent action right now.</div>
        )}
      </div>

      {/* Bayesian alerts */}
      {highRiskBeliefs.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex flex-wrap gap-6">
            {highRiskBeliefs.map(([key, b]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-3xl font-bold text-red-500">{b.posteriorPct}%</span>
                <div>
                  <div className="text-sm text-slate-200">{b.label}</div>
                  <div className="text-xs text-slate-500">{b.appliedEvidence.length} evidence signals</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            Bayesian inference from active signals. Labeled: likelihood ratios from research.
          </p>
        </div>
      )}

      {/* Two column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-col gap-4">
            {critical.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-red-500">Critical — act today</h3>
                <div className="space-y-2">
                  {critical.map((f) => (
                    <FindingCard key={f.key} f={f} />
                  ))}
                </div>
              </div>
            )}
            {high.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-amber-500">High — act this week</h3>
                <div className="space-y-2">
                  {high.map((f) => (
                    <FindingCard key={f.key} f={f} />
                  ))}
                </div>
              </div>
            )}
            {elevated.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-yellow-500">Elevated — monitor</h3>
                <div className="space-y-2">
                  {elevated.map((f) => (
                    <FindingCard key={f.key} f={f} />
                  ))}
                </div>
              </div>
            )}
            {monitoring.length > 0 && (
              <div>
                <button
                  onClick={() => setShowMonitoring((s) => !s)}
                  className="mb-2 text-sm font-semibold text-slate-400 hover:text-slate-200"
                >
                  {showMonitoring ? "▾" : "▸"} Monitoring ({monitoring.length})
                </button>
                {showMonitoring && (
                  <div className="space-y-2">
                    {monitoring.map((f) => (
                      <FindingCard key={f.key} f={f} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {data.findings.length === 0 && <div className="text-slate-500">No active findings.</div>}
          </div>

          {/* Inference chains */}
          {data.inferences.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-300">Forward inference</h3>
              <div className="space-y-3">
                {data.inferences.map((inf) => (
                  <div key={inf.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${inf.confidence}%` }} />
                    </div>
                    <div className="mt-2 font-semibold text-slate-100">{inf.title}</div>
                    <ul className="mt-1 space-y-0.5">
                      {inf.premises.map((p, i) => (
                        <li key={i} className="flex gap-2 rounded-full bg-slate-800/60 px-2 py-0.5 text-xs text-slate-400 w-fit">
                          {p}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${URGENCY_COLOR[inf.urgency]}`}>{inf.urgency}</span>
                      <span className="text-xs text-slate-500">confidence {inf.confidence}%</span>
                    </div>
                    <button
                      onClick={() => {
                        fetch("/api/events", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "inference_action", domain: inf.domain, data: { action: inf.action } }),
                        });
                      }}
                      className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                    >
                      {inf.action}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Correlations */}
          {data.correlations.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">Correlation clusters</h3>
              <div className="space-y-2">
                {data.correlations.map((c) => (
                  <div key={c.id} className={`rounded-lg border-l-4 bg-slate-950/50 p-2 ${SEV_COLOR[c.combinedSev].split(" ")[0]}`}>
                    <div className="text-sm font-medium text-slate-100">{c.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.domains.map((d) => (
                        <span key={d} className="flex items-center gap-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${DOMAIN_COLOR[d]}`} /> {d}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{c.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.members.slice(0, 5).map((m, i) => (
                        <span key={i} className="rounded-full bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback loops */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Feedback loops</h3>
            <div className="space-y-2">
              {data.feedbackLoops.map((loop) => (
                <div
                  key={loop.id}
                  className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs ${
                    loop.active
                      ? loop.polarity === "REINFORCING"
                        ? "border-red-700/60 text-red-400"
                        : "border-green-700/60 text-green-400"
                      : "border-slate-800 text-slate-600"
                  }`}
                >
                  <span>{loop.name}</span>
                  <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px]">{loop.polarity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Decisions needing attention */}
          {escalateDecisions.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">Decisions needing attention</h3>
              <div className="space-y-2">
                {escalateDecisions.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <div>
                      <div className={d.status === "ESCALATE" ? "text-red-400" : "text-amber-400"}>{d.title}</div>
                      <div className="text-slate-500">
                        {d.owner} · {d.openDays}d open
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        d.status === "ESCALATE" ? "bg-red-600/20 text-red-400" : "bg-amber-600/20 text-amber-400"
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => navigate("decisions")} className="text-left text-xs text-indigo-400 hover:text-indigo-300">
            View all decisions →
          </button>
        </div>
      </div>
    </div>
  );
}
