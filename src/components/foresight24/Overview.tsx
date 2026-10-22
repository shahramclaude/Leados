import { useEffect, useState } from "react";
import { SEED_SCENARIOS } from "../../lib/scenarios/strategicScenarios";
import { normalizePlanningWeights } from "../../lib/scenarios/simulationScenario";
import { runScenario } from "../../lib/scenarios/scenarioEngine";
import { assessResilience } from "../../lib/scenarios/resilience";
import { computeReadinessIndex, type ReadinessResult } from "../../lib/scenarios/readiness";
import { SEED_STRATEGIES } from "../../lib/windtunnel/strategyLibrary";
import { runWindTunnel } from "../../lib/windtunnel/runner";
import { summarizeCalibration } from "../../lib/foresight/calibration";
import { SEED_FORESIGHT_CLAIMS } from "../../lib/foresight/registry";
import { PossibilityBanner } from "./PossibilityBanner";
import { Card, SectionHeading, StatTile } from "./ui";

function coverageRatio(): number {
  const quadrantKeys = new Set(SEED_SCENARIOS.map((s) => (s.quadrant ? `${s.quadrant.axisXSide}-${s.quadrant.axisYSide}` : "none")));
  return quadrantKeys.size / 4; // 4 possible quadrants on the primary 2x2
}

export function Overview() {
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function compute() {
      const weights = normalizePlanningWeights(SEED_SCENARIOS).map((s) => ({ scenarioId: s.id, weight: s.planningWeight }));
      const windTunnel = await runWindTunnel(SEED_STRATEGIES, SEED_SCENARIOS, weights, 8);
      const topRobustness = windTunnel.rankings[0]?.robustness ?? 0;
      const normalizedRobustness = Math.min(1, Math.max(0, topRobustness / 1.5));

      const stressScenario = SEED_SCENARIOS.find((s) => s.id === "scn-regulatory-clampdown")!;
      const baselineScenario = { ...stressScenario, shocks: [] };
      const baselineRun = runScenario(baselineScenario, { ticks: 8 });
      const stressedRun = runScenario(stressScenario, { ticks: 8 });
      const resilience = assessResilience(baselineRun.trace, stressedRun.trace, "cashRunwayMonths");

      const calibration = summarizeCalibration(SEED_FORESIGHT_CLAIMS);
      const foresightBrier = Number.isNaN(calibration.brier) ? 0.25 : calibration.brier;

      const result = computeReadinessIndex({
        robustnessScore: normalizedRobustness,
        resilienceScore: resilience.score,
        foresightBrier,
        scenarioCoverageRatio: coverageRatio(),
      });

      if (!cancelled) {
        setReadiness(result);
        setLoading(false);
      }
    }
    compute();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PossibilityBanner authoredAt="2026-03-08T12:00:00.000Z" authoredBy="readiness-dashboard" extra="The Readiness Index is a planning-posture metric, not a probability that any modeled world occurs." />

      <Card>
        <SectionHeading title="Strategic foresight engine" subtitle="Scenario Studio → War-Room → Wind Tunnel → Horizon Radar → Foresight Ledger, all fed by the same typed twin." />
        <p className="text-sm text-slate-600">
          This module models plausible futures as typed twin configurations plus macro assumptions, war-games them with role-scoped
          players, wind-tunnels candidate strategies across the ensemble for robustness and regret, and scores every registered
          foresight claim over time with a Brier calibration record. Nothing here predicts the future — it prepares the organization
          for several of them.
        </p>
      </Card>

      <Card>
        <SectionHeading title="Readiness index" subtitle="Composite of wind-tunnel robustness, resilience under stress, foresight calibration, and scenario coverage." />
        {loading || !readiness ? (
          <p className="text-sm text-slate-500">Computing…</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4">
              <div className="text-4xl font-bold text-indigo-700">{readiness.index.toFixed(1)}</div>
              <div className="text-sm text-slate-500">out of 100 — a planning-posture score, not a forecast confidence level.</div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Robustness" value={`${(readiness.inputs.robustnessScore * 100).toFixed(0)}%`} hint="Normalized top-strategy robustness" />
              <StatTile label="Resilience" value={`${(readiness.inputs.resilienceScore * 100).toFixed(0)}%`} hint="Regulatory Clampdown stress test" />
              <StatTile label="Foresight calibration" value={Number.isNaN(readiness.inputs.foresightBrier) ? "—" : `Brier ${readiness.inputs.foresightBrier.toFixed(3)}`} hint="Lower Brier is better" />
              <StatTile label="Scenario coverage" value={`${(readiness.inputs.scenarioCoverageRatio * 100).toFixed(0)}%`} hint="Named-world quadrants modeled" />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
