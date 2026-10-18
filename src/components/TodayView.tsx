import { computeAllBeliefs, highRiskBeliefs } from "../lib/bayesian";
import { activeFindings, extractEvidenceSignals, moodTrendFor } from "../lib/engine";
import { todayISO } from "../lib/seed";
import type { AppState } from "../lib/types";
import { Badge, Card, ProgressBar } from "./ui";

export function TodayView({
  state,
  onNavigate,
}: {
  state: AppState;
  onNavigate: (t: "signals" | "beliefs" | "about") => void;
}) {
  const findings = activeFindings(state);
  const evidenceSignals = extractEvidenceSignals(state);
  const beliefs = computeAllBeliefs(evidenceSignals, todayISO());
  const highRisk = highRiskBeliefs(beliefs);
  const moodTrend = moodTrendFor(state);

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          The Strategic Brain — Part 1: Bayesian Belief Network
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Every organizational belief here is a probability, continuously re-derived from priors (labeled,
          unverified citations from the task's pasted spec) and the evidence you toggle on the Signal Board.
          This is a scoped delivery: the forward 30/60/90-day scenario simulator and the always-on background
          "composes insight for you" process described later in the pasted brief were not included in this
          part's pasted text, so they are not implemented here — see About / Provenance.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate("signals")}
            className="rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
          >
            Open Signal Board
          </button>
          <button
            onClick={() => onNavigate("beliefs")}
            className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Open Belief Network
          </button>
          <button
            onClick={() => onNavigate("about")}
            className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Provenance ledger
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Active findings</div>
          <div className="mt-2 text-3xl font-bold text-white">{findings.length}</div>
          <div className="mt-1 text-xs text-slate-500">of {8} synthetic rules toggled on</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            High-risk beliefs (≥60%)
          </div>
          <div className="mt-2 text-3xl font-bold text-white">{highRisk.length}</div>
          <div className="mt-1 text-xs text-slate-500">of 5 hypotheses tracked</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Mood trend slope</div>
          <div className="mt-2 text-3xl font-bold text-white">{moodTrend.toFixed(2)}</div>
          <div className="mt-1 text-xs text-slate-500">
            scenario: <span className="capitalize">{state.moodScenario}</span>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-white">Belief summary</h2>
        <div className="mt-3 space-y-3">
          {(Object.entries(beliefs) as [string, (typeof beliefs)[keyof typeof beliefs]][]).map(
            ([h, b]) => (
              <div key={h} className="flex items-center gap-3">
                <div className="w-56 shrink-0 truncate text-xs text-slate-400">{h}</div>
                <div className="flex-1">
                  <ProgressBar
                    value={b.posteriorPct}
                    tone={b.posteriorPct >= 60 ? "bad" : b.posteriorPct >= 35 ? "warn" : "good"}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                  {b.posteriorPct}%
                </div>
                {!b.hasLikelihoodModel && <Badge tone="neutral">static</Badge>}
              </div>
            )
          )}
        </div>
      </Card>
    </div>
  );
}
