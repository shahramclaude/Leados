import type { AppState } from "../lib/types";
import { Card, Stat, Badge, Bar } from "./ui";
import { lifeStageSignal } from "../lib/lifeStage";
import { stakeholderSignal } from "../lib/stakeholders";
import { realOptionsSignal } from "../lib/realOptions";
import { executivePresenceSignal } from "../lib/executivePresence";
import { innovationPortfolioSignal } from "../lib/innovationPortfolio";
import { changeManagementSignal } from "../lib/changeManagement";
import { competitiveIntelSignal } from "../lib/competitiveIntel";
import { orgDesignSignal } from "../lib/orgDesign";
import { wargameSignal } from "../lib/wargame";
import { detectCompoundEffects } from "../lib/compoundIntel";
import { runSelfTests } from "../lib/selfTest";
import { useMemo, useState } from "react";

export function TodayView({ state, navigate }: { state: AppState; navigate: (r: string) => void }) {
  const [showTests, setShowTests] = useState(false);
  const tests = useMemo(() => runSelfTests(), []);
  const passCount = tests.filter((t) => t.pass).length;

  const signals = useMemo(
    () => [
      { key: "lifeStage", label: "Life Stage Maturity", value: lifeStageSignal(state.lifeStage) },
      { key: "stakeholders", label: "Stakeholder Alignment", value: stakeholderSignal(state.stakeholders) },
      { key: "realOptions", label: "Strategic Optionality", value: realOptionsSignal(state.realOptions) },
      { key: "execPresence", label: "Executive Presence", value: executivePresenceSignal(state.executivePresence) },
      { key: "innovation", label: "Innovation Balance", value: innovationPortfolioSignal(state.initiatives) },
      { key: "change", label: "Change Readiness", value: changeManagementSignal(state.adkar) },
      { key: "competitive", label: "Competitive Position", value: competitiveIntelSignal(state.competitors) },
      { key: "orgDesign", label: "Org Design Efficiency", value: orgDesignSignal(state.orgDesign) },
      { key: "wargame", label: "Strategic Position", value: wargameSignal(state.wargame.ourPosture, state.wargame.competitorArchetype, state.wargame.marketVolatility) },
    ],
    [state]
  );

  const compound = useMemo(() => detectCompoundEffects(signals), [signals]);
  const overallIndex = Math.round(signals.reduce((s, x) => s + x.value, 0) / signals.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizational Intelligence — Today</h1>
        <p className="mt-1 text-sm text-slate-500">
          One board, nine intelligence dimensions, ten modules. All data below is synthetic and seeded — see{" "}
          <button className="underline" onClick={() => navigate("/about")}>About / Provenance</button>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><Stat label="Composite Index" value={overallIndex} tone="indigo" /></Card>
        <Card><Stat label="Compounding Pairs" value={compound.compoundingCount} tone="emerald" /></Card>
        <Card><Stat label="Fragility Pairs" value={compound.fragilityCount} tone="rose" /></Card>
        <Card><Stat label="Net Compound Index" value={compound.netCompoundIndex} tone={compound.netCompoundIndex >= 0 ? "emerald" : "rose"} /></Card>
      </div>

      <Card title="Intelligence dimensions" subtitle="Each bar is produced by one module; click a module in the sidebar to inspect and edit its inputs.">
        <div className="space-y-3">
          {signals.map((s) => (
            <div key={s.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-600">{s.label}</span>
                <span className="tabular-nums font-medium text-slate-800">{Math.round(s.value)}</span>
              </div>
              <Bar value={s.value} tone={s.value >= 65 ? "emerald" : s.value >= 40 ? "amber" : "rose"} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Top compound signals" subtitle="From compound_intel.js (pt-P) — strongest compounding and fragility interactions across all modules.">
        <div className="space-y-2">
          {compound.pairs.slice(0, 5).map((p, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div>
                <div className="font-medium text-slate-700">{p.a} × {p.b}</div>
                <div className="text-xs text-slate-500">{p.note}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={p.type === "compounding" ? "emerald" : p.type === "fragility" ? "rose" : "slate"}>{p.type}</Badge>
                <span className="tabular-nums text-xs text-slate-400">{p.effect > 0 ? "+" : ""}{p.effect}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Self-test runner" subtitle="Original test suite (OIP_01..OIP_13) checking this build's own math — not a reproduction of any externally-named test suite.">
        <div className="flex items-center justify-between">
          <Badge tone={passCount === tests.length ? "emerald" : "rose"}>{passCount}/{tests.length} passing</Badge>
          <button onClick={() => setShowTests((v) => !v)} className="text-xs font-medium text-indigo-600 underline">
            {showTests ? "Hide detail" : "Show detail"}
          </button>
        </div>
        {showTests && (
          <div className="mt-3 space-y-1 font-mono text-xs">
            {tests.map((t) => (
              <div key={t.id} className={t.pass ? "text-emerald-700" : "text-rose-700"}>
                {t.pass ? "PASS" : "FAIL"} {t.id} — {t.detail}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
