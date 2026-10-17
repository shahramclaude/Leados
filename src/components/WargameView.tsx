import type { AppState, CompetitorArchetype, Posture } from "../lib/types";
import { runWargame } from "../lib/wargame";
import { Card, Stat, Badge, Slider } from "./ui";
import { useMemo } from "react";

const POSTURES: Posture[] = ["aggressive", "defensive", "collaborative", "niche"];
const ARCHETYPES: CompetitorArchetype[] = ["incumbent", "disruptor", "fast-follower", "niche-player"];

export function WargameView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const result = useMemo(
    () => runWargame(state.wargame.ourPosture, state.wargame.competitorArchetype, state.wargame.marketVolatility),
    [state.wargame]
  );

  const update = (patch: Partial<AppState["wargame"]>) => setState((s) => ({ ...s, wargame: { ...s.wargame, ...patch } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Strategic Wargaming Engine</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/wargame.js</code> (pt-O spec) → <code>src/lib/wargame.ts</code>. Payoff matrix is an original,
          disclosed-fabricated scenario design — not sourced competitive data.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Our posture">
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={state.wargame.ourPosture}
            onChange={(e) => update({ ourPosture: e.target.value as Posture })}
          >
            {POSTURES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Card>
        <Card title="Competitor archetype">
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={state.wargame.competitorArchetype}
            onChange={(e) => update({ competitorArchetype: e.target.value as CompetitorArchetype })}
          >
            {ARCHETYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Card>
        <Card title="Market volatility">
          <Slider label="Volatility" value={state.wargame.marketVolatility} onChange={(v) => update({ marketVolatility: v })} />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><Stat label="Expected outcome (5-round sim)" value={result.expectedOutcome} tone={result.expectedOutcome >= 0 ? "emerald" : "rose"} /></Card>
        <Card><Stat label="Recommended posture" value={<Badge tone="violet">{result.recommendedPosture}</Badge>} /></Card>
      </div>

      <Card title="Summary"><p className="text-sm text-slate-600">{result.summary}</p></Card>

      <Card title="Payoff matrix" subtitle={`Our outcome index by posture vs ${state.wargame.competitorArchetype}`}>
        <div className="space-y-2">
          {result.matrix.map((m) => (
            <div key={m.posture} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
              <span className="capitalize">{m.posture}</span>
              <Badge tone={m.outcome >= 20 ? "emerald" : m.outcome >= 0 ? "amber" : "rose"}>{m.outcome}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Simulated rounds" subtitle="Deterministic volatility shocks applied to current posture's base outcome">
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {result.rounds.map((r) => (
            <div key={r.round} className="rounded-lg border border-slate-100 p-2">
              <div className="text-slate-400">R{r.round}</div>
              <div className="font-semibold tabular-nums">{r.outcome}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
