import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { shannonEntropy } from "../lib/infoTheory";
import { identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors } from "../lib/casEngine";
import { buildRiskRegister } from "../lib/riskIntelligence";
import { runSelfTests } from "../lib/selfTest";
import { SCENARIO_PRESETS } from "../lib/rules";
import { resetState } from "../lib/store";
import { Card, Stat, Badge, Button } from "./ui";

export function TodayView({ state, setState, navigate }: { state: AppState; setState: (s: AppState) => void; navigate: (r: string) => void }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const entropy = useMemo(() => shannonEntropy(state.events), [state.events]);
  const loops = useMemo(() => identifyFeedbackLoops(findings), [findings]);
  const bifurcations = useMemo(() => identifyBifurcationPoints(findings, state.runwayMonths), [findings, state.runwayMonths]);
  const attractors = useMemo(() => identifyAttractors(findings), [findings]);
  const register = useMemo(() => buildRiskRegister(findings), [findings]);
  const [tests, setTests] = useState<ReturnType<typeof runSelfTests> | null>(null);

  function applyPreset(ruleIds: string[]) {
    setState({ ...state, activeRuleIds: ruleIds });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Today</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Overview computed live from the Signal Board. Toggle rules on the Signal Board page, or use a scenario preset below, to see every
          number here update.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <Stat label="Overall risk score" value={`${register.overallScore}/100`} tone={register.overallScore > 50 ? "rose" : register.overallScore > 20 ? "amber" : "emerald"} />
        </Card>
        <Card>
          <Stat label="Active findings" value={findings.length} tone={findings.length > 0 ? "amber" : "slate"} />
        </Card>
        <Card>
          <Stat label="Event-log entropy" value={`${Math.round(entropy.normalized * 100)}%`} tone="sky" />
        </Card>
        <Card>
          <Stat label="Feedback loops" value={loops.length} tone={loops.length > 0 ? "rose" : "slate"} />
        </Card>
        <Card>
          <Stat label="Bifurcations" value={bifurcations.length} tone={bifurcations.length > 0 ? "amber" : "slate"} />
        </Card>
        <Card>
          <Stat label="Attractors" value={attractors.length} tone={attractors.length > 0 ? "rose" : "slate"} />
        </Card>
      </div>

      <Card title="Scenario presets" subtitle="Load a named combination of signals to see the engines react.">
        <div className="flex flex-wrap gap-2">
          {SCENARIO_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.ruleIds)}
              title={p.description}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-left text-xs hover:border-indigo-500 hover:bg-slate-800"
            >
              <div className="font-medium text-slate-200">{p.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{p.ruleIds.join(", ") || "none"}</div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cross-category amplifications" subtitle="Detected from combinations of active rules across categories.">
          {register.amplifications.length === 0 ? (
            <p className="text-xs text-slate-500">None detected with the current Signal Board state.</p>
          ) : (
            <ul className="space-y-2">
              {register.amplifications.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-200">
                    {a.label}
                    {a.categories.map((c) => (
                      <Badge key={c} tone="amber">{c}</Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-slate-500">{a.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="In-browser self-test runner" subtitle="Checks this build's own math (entropy, mutual info, CAS thresholds, risk register) — not an external spec.">
          <Button variant="primary" onClick={() => setTests(runSelfTests())}>
            Run self-tests
          </Button>
          {tests && (
            <div className="mt-3 space-y-1.5">
              <div className="text-xs text-slate-400">
                {tests.filter((t) => t.pass).length} / {tests.length} passed
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {tests.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-[11px]">
                    <Badge tone={t.pass ? "emerald" : "rose"}>{t.pass ? "PASS" : "FAIL"}</Badge>
                    <div>
                      <div className="text-slate-300">{t.label}</div>
                      <div className="text-slate-600">{t.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <div className="text-xs font-medium text-slate-300">Reset synthetic data</div>
          <div className="text-[11px] text-slate-600">Clears localStorage and regenerates a fresh synthetic roster, event log, and Signal Board.</div>
        </div>
        <Button
          variant="danger"
          onClick={() => {
            const fresh = resetState();
            setState(fresh);
            navigate("/today");
          }}
        >
          Reset synthetic data
        </Button>
      </div>
    </div>
  );
}
