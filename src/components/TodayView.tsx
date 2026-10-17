import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { buildRiskRegister, detectCrossRiskAmplification } from "../lib/riskIntelligence";
import { shannonEntropy } from "../lib/infoTheory";
import { identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors } from "../lib/casEngine";
import { runSelfTests, type TestResult } from "../lib/selfTest";
import { resetState } from "../lib/store";
import { Card, Label, Stat, Badge } from "./ui";

export function TodayView({ state, setState, navigate }: { state: AppState; setState: (s: AppState) => void; navigate: (r: string) => void }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const register = useMemo(() => buildRiskRegister(findings), [findings]);
  const amps = useMemo(() => detectCrossRiskAmplification(register), [register]);
  const entropy = useMemo(() => shannonEntropy(state.events), [state.events]);
  const loops = useMemo(() => identifyFeedbackLoops(findings), [findings]);
  const bifurcations = useMemo(() => identifyBifurcationPoints(findings, state.runwayMonths), [findings, state.runwayMonths]);
  const attractors = useMemo(() => identifyAttractors(state), [state]);
  const [tests, setTests] = useState<TestResult[] | null>(null);

  const riskTone = register.overallRisk === 0 ? "emerald" : register.overallRisk < 35 ? "slate" : register.overallRisk < 70 ? "amber" : "rose";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          A single-page leadership intelligence sandbox: toggle synthetic risk signals, then watch information-theory,
          complex-adaptive-systems, and risk-register math recompute live from that one source of truth. Built fresh for
          this session — see <button className="underline" onClick={() => navigate("/about")}>About / Provenance</button> for
          exactly what was verified against the real GitHub repo vs. what is original here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Overall Risk" subtitle="Mean of 8 category scores, 0-100">
          <Stat label="Score" value={String(register.overallRisk)} />
          <div className="mt-3"><Badge tone={riskTone as any}>{register.overallRisk === 0 ? "CLEAR" : register.overallRisk < 35 ? "WATCH" : register.overallRisk < 70 ? "ELEVATED" : "CRITICAL"}</Badge></div>
        </Card>
        <Card title="Active Findings" subtitle="From the Signal Board">
          <Stat label="Count" value={String(findings.length)} />
        </Card>
        <Card title="Event Entropy" subtitle="Shannon H, normalized">
          <Stat label="H / Hmax" value={`${(entropy.normalized * 100).toFixed(0)}%`} />
        </Card>
        <Card title="CAS Signals" subtitle="Loops / bifurcations / attractors">
          <Stat label="Count" value={`${loops.length} / ${bifurcations.length} / ${attractors.length}`} />
        </Card>
      </div>

      {amps.length > 0 && (
        <Card title="Cross-Category Amplification" subtitle="Risk categories compounding each other right now">
          <ul className="space-y-2">
            {amps.map((a) => (
              <li key={a.id} className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone="rose">{a.label}</Badge>
                  <span className="text-xs text-slate-500">sev {a.sev}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{a.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Quick Presets" subtitle="Jump-start a scenario on the Signal Board, then explore the other tabs">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate("/signals")} className="rounded-md bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25">
            Go to Signal Board →
          </button>
          <button
            onClick={() => {
              if (confirm("Reset all synthetic data and signal toggles?")) setState(resetState());
            }}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            Reset synthetic data
          </button>
        </div>
      </Card>

      <Card title="Self-Tests" subtitle="Original runtime checks of this build's own math (not the unverified 'T_L/G_L' suite referenced in the task prompt)">
        <button onClick={() => setTests(runSelfTests())} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700">
          Run self-tests
        </button>
        {tests && (
          <ul className="mt-4 space-y-1.5">
            {tests.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <span className={t.pass ? "text-emerald-400" : "text-rose-400"}>{t.pass ? "✓" : "✗"}</span>
                <span className="text-slate-400">
                  <span className="font-mono text-slate-300">{t.id}</span> — {t.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
        {tests && (
          <Label>
            {tests.filter((t) => t.pass).length}/{tests.length} passing.
          </Label>
        )}
      </Card>
    </div>
  );
}
