import type { AdkarState, AppState } from "../lib/types";
import { computeChangeManagement } from "../lib/changeManagement";
import { Card, Stat, Badge, Slider } from "./ui";
import { useMemo } from "react";

const LABELS: Record<keyof AdkarState, string> = {
  awareness: "Awareness",
  desire: "Desire",
  knowledge: "Knowledge",
  ability: "Ability",
  reinforcement: "Reinforcement",
};

export function ChangeManagementView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const result = useMemo(() => computeChangeManagement(state.adkar), [state.adkar]);
  const update = (key: keyof AdkarState, value: number) => setState((s) => ({ ...s, adkar: { ...s.adkar, [key]: value } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Change Management — ADKAR + Kotter</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/change_management.js</code> (pt-O spec) → <code>src/lib/changeManagement.ts</code>. ADKAR (Prosci /
          Hiatt) and Kotter's 8-Step Process (1996) are real frameworks; the ADKAR→Kotter mapping is an original,
          disclosed convenience, not a citation of a unified model.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><Stat label="Overall readiness" value={result.overallReadiness} /></Card>
        <Card><Stat label="Barrier point (ADKAR)" value={<Badge tone="rose">{LABELS[result.barrierPoint]}</Badge>} /></Card>
        <Card><Stat label="Mapped Kotter step" value={result.kotterStep} tone="indigo" /></Card>
      </div>

      <Card title="ADKAR dimensions">
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(state.adkar) as (keyof AdkarState)[]).map((k) => (
            <Slider key={k} label={LABELS[k]} value={state.adkar[k]} onChange={(v) => update(k, v)} />
          ))}
        </div>
      </Card>

      <Card title="Guidance"><p className="text-sm text-slate-600">{result.guidance}</p></Card>
      <Card title="Current Kotter step"><Badge tone="violet">{result.kotterLabel}</Badge></Card>
    </div>
  );
}
