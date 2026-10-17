import type { AppState } from "../lib/types";
import { computeRealOptionValue } from "../lib/realOptions";
import { Card, Stat, Badge, Slider } from "./ui";
import { useMemo } from "react";

export function RealOptionsView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const result = useMemo(() => computeRealOptionValue(state.realOptions), [state.realOptions]);
  const update = (patch: Partial<AppState["realOptions"]>) => setState((s) => ({ ...s, realOptions: { ...s.realOptions, ...patch } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Real Options Valuation</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/real_options.js</code> (pt-O spec) → <code>src/lib/realOptions.ts</code>. Genuine Black-Scholes (1973)
          formula applied to a strategic investment framed as a real option (Myers, 1977) — real, citable math.
        </p>
      </div>

      <Card title="Inputs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Slider label="PV of cash flows ($k) — S" value={state.realOptions.pv} min={100} max={5000} step={50} onChange={(v) => update({ pv: v })} />
          <Slider label="Investment cost ($k) — K" value={state.realOptions.cost} min={100} max={5000} step={50} onChange={(v) => update({ cost: v })} />
          <Slider label="Years to expiry — T" value={state.realOptions.years} min={0.25} max={10} step={0.25} onChange={(v) => update({ years: v })} />
          <Slider label="Volatility — σ" value={state.realOptions.volatility} min={0.05} max={1} step={0.05} onChange={(v) => update({ volatility: v })} />
          <Slider label="Risk-free rate — r" value={state.realOptions.riskFreeRate} min={0} max={0.1} step={0.005} onChange={(v) => update({ riskFreeRate: v })} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><Stat label="Option value (call)" value={`$${result.callValue}k`} tone="indigo" /></Card>
        <Card><Stat label="Static NPV" value={`$${result.staticNpv}k`} tone={result.staticNpv >= 0 ? "emerald" : "rose"} /></Card>
        <Card><Stat label="Option premium over NPV" value={`$${result.optionPremiumOverNpv}k`} /></Card>
      </div>

      <Card title="Decision">
        <Badge tone={result.decision === "exercise now" ? "emerald" : result.decision === "hold the option" ? "amber" : "rose"}>{result.decision}</Badge>
        <p className="mt-3 text-sm text-slate-600">
          d1 = {result.d1}, d2 = {result.d2}. The option premium over static NPV ({`$${result.optionPremiumOverNpv}k`}) is the
          value of waiting — committing now destroys that flexibility value.
        </p>
      </Card>
    </div>
  );
}
