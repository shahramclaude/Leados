import type { AppState } from "../lib/types";
import { computeExecutivePresence } from "../lib/executivePresence";
import { Card, Stat, Badge, Slider, RadarChart } from "./ui";
import { useMemo } from "react";

export function ExecutivePresenceView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const result = useMemo(() => computeExecutivePresence(state.executivePresence), [state.executivePresence]);
  const update = (patch: Partial<AppState["executivePresence"]>) =>
    setState((s) => ({ ...s, executivePresence: { ...s.executivePresence, ...patch } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executive Presence Measurement</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/executive_presence.js</code> (pt-O spec) → <code>src/lib/executivePresence.ts</code>. Three-factor
          structure modeled on the Hewlett/CTI "executive presence" construct (gravitas-weighted); scoring is original.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><Stat label="Composite score" value={result.composite} tone="indigo" /></Card>
        <Card><Stat label="Band" value={<Badge tone="violet">{result.band}</Badge>} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Factors (drag to adjust)">
          <div className="space-y-4">
            <Slider label="Gravitas (weight 0.5)" value={state.executivePresence.gravitas} onChange={(v) => update({ gravitas: v })} />
            <Slider label="Communication (weight 0.3)" value={state.executivePresence.communication} onChange={(v) => update({ communication: v })} />
            <Slider label="Appearance (weight 0.2)" value={state.executivePresence.appearance} onChange={(v) => update({ appearance: v })} />
          </div>
          <p className="mt-3 text-xs text-slate-500">Weakest factor: <span className="font-medium capitalize">{result.weakestFactor}</span></p>
        </Card>
        <Card title="Profile">
          <div className="flex justify-center">
            <RadarChart
              size={220}
              dims={[
                { label: "Gravitas", score: result.gravitas },
                { label: "Communication", score: result.communication },
                { label: "Appearance", score: result.appearance },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
