import { MORPHOLOGICAL_PRUNING_LOG, SCENARIO_AXES, SEED_SCENARIOS } from "../../lib/scenarios/strategicScenarios";
import { detectSinglePointForecast } from "../../lib/scenarios/anticipation";
import { normalizePlanningWeights } from "../../lib/scenarios/simulationScenario";
import { PossibilityBanner } from "./PossibilityBanner";
import { Card, ConfidenceBadge, Pill, SectionHeading } from "./ui";

const STUDIO_AUTHORED_AT = "2026-03-05T09:10:00.000Z";

function quadrantCell(axisXSide: "low" | "high", axisYSide: "low" | "high") {
  return SEED_SCENARIOS.filter((s) => s.quadrant?.axisXSide === axisXSide && s.quadrant?.axisYSide === axisYSide);
}

export function ScenarioStudio() {
  const normalized = normalizePlanningWeights(SEED_SCENARIOS);
  const singlePointFlag = detectSinglePointForecast(SEED_SCENARIOS);
  const [axisX, axisY] = SCENARIO_AXES;

  return (
    <div className="space-y-6">
      <PossibilityBanner authoredAt={STUDIO_AUTHORED_AT} authoredBy="scenario-studio" />

      <Card>
        <SectionHeading
          title="Scenario space"
          subtitle="Two axes frame a named-world 2×2; a third axis is handled by morphological analysis (cross-consistency pruning below)."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {SCENARIO_AXES.map((axis) => (
            <div key={axis.id} className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-800">{axis.name}</div>
              <div className="mt-1 text-xs text-slate-500">{axis.description}</div>
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-600">
                <span>{axis.lowLabel}</span>
                <span className="text-slate-300">→</span>
                <span>{axis.highLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Named-world quadrant" subtitle={`${axisX.name} × ${axisY.name}`} />
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm">
          <div />
          <div className="text-center text-xs font-semibold text-slate-500">{axisX.lowLabel}</div>
          <div className="text-center text-xs font-semibold text-slate-500">{axisX.highLabel}</div>

          <div className="flex items-center justify-end pr-1 text-xs font-semibold text-slate-500">{axisY.highLabel}</div>
          <QuadrantCell scenarios={quadrantCell("low", "high")} />
          <QuadrantCell scenarios={quadrantCell("high", "high")} />

          <div className="flex items-center justify-end pr-1 text-xs font-semibold text-slate-500">{axisY.lowLabel}</div>
          <QuadrantCell scenarios={quadrantCell("low", "low")} />
          <QuadrantCell scenarios={quadrantCell("high", "low")} />
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Morphological cross-consistency log"
          subtitle="Of 2×2×2 = 8 combinations across all three axes, 3 were pruned for low self-consistency."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3">Combination</th>
                <th className="py-1 pr-3">Kept?</th>
                <th className="py-1">Reasoning</th>
              </tr>
            </thead>
            <tbody>
              {MORPHOLOGICAL_PRUNING_LOG.map((row) => (
                <tr key={row.combination} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-slate-700">{row.combination}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={row.kept ? "emerald" : "rose"}>{row.kept ? "Kept" : "Pruned"}</Pill>
                  </td>
                  <td className="py-2 text-xs text-slate-600">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={singlePointFlag.flagged ? "border-rose-300 bg-rose-50" : ""}>
        <SectionHeading title="Single-point-forecast guard" subtitle="Automatic check that this isn't one imagined future in scenario clothing." />
        {singlePointFlag.flagged ? (
          <p className="text-sm text-rose-700">⚠ {singlePointFlag.reason}</p>
        ) : (
          <p className="text-sm text-emerald-700">✓ Planning weight is spread across {SEED_SCENARIOS.length} scenarios; no single world dominates.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {normalized.map((scenario) => (
          <Card key={scenario.id}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{scenario.name}</h3>
              <ConfidenceBadge confidence={scenario.narrative.confidence} />
            </div>
            <p className="text-sm text-slate-600">{scenario.narrative.value}</p>
            <div className="mt-2 text-xs text-slate-400">
              Authored {new Date(scenario.authoredAt).toLocaleDateString()} by {scenario.authoredBy} · planning weight {(scenario.planningWeight * 100).toFixed(0)}%
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Macro assumptions</div>
              <div className="space-y-2">
                {scenario.macroAssumptions.map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <Pill>{a.dimension}</Pill>
                      <ConfidenceBadge confidence={a.assumption.confidence} />
                    </div>
                    <p className="text-slate-700">{a.assumption.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Shocks</div>
              <ul className="space-y-1 text-xs text-slate-600">
                {scenario.shocks.map((shock) => (
                  <li key={shock.id}>
                    <span className="font-medium text-slate-800">T{shock.appliesAtTick}: {shock.label}</span> — {shock.description}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function QuadrantCell({ scenarios }: { scenarios: typeof SEED_SCENARIOS }) {
  return (
    <div className="min-h-[90px] rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
      {scenarios.length === 0 ? (
        <span className="text-xs text-slate-400">—</span>
      ) : (
        <ul className="space-y-1">
          {scenarios.map((s) => (
            <li key={s.id} className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm">
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
