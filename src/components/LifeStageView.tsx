import type { AppState, LifeStageDimension } from "../lib/types";
import { computeLifeStage } from "../lib/lifeStage";
import { LIFE_STAGE_DIMENSIONS } from "../lib/types";
import { Card, Stat, Badge, RadarChart, Slider } from "./ui";
import { useMemo } from "react";

export function LifeStageView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const result = useMemo(() => computeLifeStage(state.lifeStage), [state.lifeStage]);

  const update = (key: LifeStageDimension, value: number) =>
    setState((s) => ({ ...s, lifeStage: { ...s.lifeStage, [key]: value } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Life Stage — 12-Dimension Maturity Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/life_stage.js</code> (pt-P spec) → implemented as <code>src/lib/lifeStage.ts</code>. Original scoring logic; dimension set is an original synthesis, not a citation of a named external framework.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><Stat label="Overall Maturity" value={result.overall} tone="indigo" /></Card>
        <Card><Stat label="Stage" value={<Badge tone="violet">{result.stage}</Badge>} /></Card>
        <Card><Stat label="Balance Index" value={result.balance} tone={result.balance >= 70 ? "emerald" : "amber"} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Maturity radar">
          <div className="flex justify-center">
            <RadarChart dims={result.dimensions.map((d) => ({ label: d.label, score: d.score }))} />
          </div>
        </Card>

        <Card title="Adjust dimension inputs" subtitle="Sliders recompute the profile live.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {LIFE_STAGE_DIMENSIONS.map((d) => (
              <Slider key={d.key} label={d.label} value={state.lifeStage[d.key]} onChange={(v) => update(d.key, v)} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Weakest links">
          <ul className="space-y-2">
            {result.weakestLinks.map((d) => (
              <li key={d.key} className="flex items-center justify-between text-sm">
                <span>{d.label}</span>
                <Badge tone="rose">{d.score}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Strongest assets">
          <ul className="space-y-2">
            {result.strongestAssets.map((d) => (
              <li key={d.key} className="flex items-center justify-between text-sm">
                <span>{d.label}</span>
                <Badge tone="emerald">{d.score}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
