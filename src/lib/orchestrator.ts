// src/lib/orchestrator.ts
//
// PROVENANCE / UNVERIFIED-PRIOR-STATE NOTE
// -----------------------------------------------------------------------
// The task brief assumes a pre-existing codebase with src/lib/intelligence.ts,
// bayesianNetwork.ts, causalChain.ts, signalFusion.ts, predictiveScoring.ts,
// talentEngine.ts, scenarioEngine.ts, wargameEngine.ts, knowledgeGraph.ts,
// metricsEngine.ts, synthesis.ts, narrativeIntel.ts, engine.ts, and an
// IntelligenceView frontend. Before writing anything, every file under
// src/lib/ was read (via `list_files`) and the directory was empty; the
// whole repo was just the bare Next.js + Drizzle starter template
// (`src/db/schema.ts` contained only a placeholder `export {}` comment,
// `src/app/api/` contained only `health/route.ts`). The GitHub repo named
// in the task (shahramclaude/Leados) was also fetched directly and its own
// README confirms it is a single-file vanilla-JS prototype (`index.html`),
// not a Next.js/TypeScript codebase — so there is no prior
// `buildIntelligenceReport`/`evaluateRules` implementation to quote line
// numbers from. Everything below is a new, from-scratch implementation of
// the pipeline the brief describes, built to the stated contract
// (runFullOrchestration, per-stage error isolation, DB-editable weights,
// <10s budget, >3s stage warning, strict typing).
//
// This file is the single authority that sequences every intelligence
// sub-engine. It threads an accumulating context object through each stage
// (rather than only ever passing the immediately-prior stage's output)
// because several late stages (synthesis, scenarios) genuinely need access
// to more than one earlier result (e.g. synthesis needs burnout + flight
// risk + network together). Each stage still only reads what it needs from
// the accumulator, and no stage re-issues a DB query another stage already
// performed for the same data — causalChain.ts and knowledgeGraph.ts do
// issue their own queries, but each is for genuinely different data
// (historical finding timelines, and person records, respectively) not
// available in the running context.
import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { evaluateRules } from "@/lib/engine";
import { updateBeliefs } from "@/lib/bayesianNetwork";
import { detectCausalChains } from "@/lib/causalChain";
import { fuseSignals } from "@/lib/signalFusion";
import { computeBurnoutRiskIndex, computeFlightRiskScores } from "@/lib/predictiveScoring";
import { computeDecisionHealthIndex } from "@/lib/metricsEngine";
import { buildKnowledgeGraph } from "@/lib/knowledgeGraph";
import { synthesizeNarratives } from "@/lib/synthesis";
import { scoreScenarios } from "@/lib/scenarioEngine";
import type {
  BayesianUpdateResult,
  BurnoutRiskResult,
  CausalChainResult,
  DecisionHealthIndex,
  FlightRiskResult,
  IntelligenceReport,
  NarrativeReport,
  OrchestratorResult,
  OrgHealthWeights,
  OrgNetworkReport,
  RuleEvaluationResult,
  ScenarioReport,
  SignalFusionResult,
  StageTiming,
} from "@/lib/types";

type Db = NodePgDatabase<typeof schema>;

const SLOW_STAGE_WARNING_MS = 3000;
const SETTINGS_KEY_ORG_HEALTH_WEIGHTS = "org_health_weights";

export const DEFAULT_ORG_HEALTH_WEIGHTS: OrgHealthWeights = {
  ruleSeverity: 0.15,
  belief: 0.15,
  causal: 0.1,
  fusion: 0.15,
  burnout: 0.15,
  flightRisk: 0.15,
  decisionHealth: 0.1,
  network: 0.025,
  scenario: 0.025,
};

const EMPTY_RULE_EVALUATION: RuleEvaluationResult = {
  computedAt: new Date(0).toISOString(),
  rulesEvaluated: 0,
  peopleEvaluated: 0,
  findings: [],
};

const EMPTY_BAYESIAN: BayesianUpdateResult = { computedAt: new Date(0).toISOString(), beliefs: [] };
const EMPTY_CAUSAL: CausalChainResult = { computedAt: new Date(0).toISOString(), chains: [] };
const EMPTY_FUSION: SignalFusionResult = { computedAt: new Date(0).toISOString(), fusedSignals: [], orgFusedScore: 0 };
const EMPTY_BURNOUT: BurnoutRiskResult = { computedAt: new Date(0).toISOString(), scores: [], orgAverage: 0 };
const EMPTY_FLIGHT_RISK: FlightRiskResult = { computedAt: new Date(0).toISOString(), scores: [], orgAverage: 0 };
const EMPTY_DECISION_HEALTH: DecisionHealthIndex = { computedAt: new Date(0).toISOString(), score: 0, components: [] };
const EMPTY_NETWORK: OrgNetworkReport = { computedAt: new Date(0).toISOString(), nodes: [], edges: [], density: 0 };
const EMPTY_NARRATIVES: NarrativeReport = { computedAt: new Date(0).toISOString(), narratives: [] };
const EMPTY_SCENARIOS: ScenarioReport = { computedAt: new Date(0).toISOString(), scenarios: [] };

async function runStage<T>(name: string, timings: StageTiming[], fallback: T, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    if (durationMs > SLOW_STAGE_WARNING_MS) {
      console.warn(`[orchestrator] stage "${name}" took ${durationMs}ms (exceeds ${SLOW_STAGE_WARNING_MS}ms budget)`);
    }
    timings.push({ stage: name, durationMs, ok: true, error: null });
    return result;
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[orchestrator] stage "${name}" failed after ${durationMs}ms: ${message}`);
    timings.push({ stage: name, durationMs, ok: false, error: message });
    return fallback;
  }
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "number");
}

/**
 * Loads org-health weighting from the `settings` table (key =
 * "org_health_weights"), seeding a default row if none exists yet. Any
 * missing/invalid field falls back to the default value for that field.
 */
export async function loadOrgHealthWeights(db: Db): Promise<OrgHealthWeights> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTINGS_KEY_ORG_HEALTH_WEIGHTS));

  if (!row) {
    const seedValue: Record<string, unknown> = { ...DEFAULT_ORG_HEALTH_WEIGHTS };
    await db.insert(schema.settings).values({
      key: SETTINGS_KEY_ORG_HEALTH_WEIGHTS,
      value: seedValue,
      updatedAt: new Date(),
    });
    return DEFAULT_ORG_HEALTH_WEIGHTS;
  }

  if (!isNumberRecord(row.value)) {
    return DEFAULT_ORG_HEALTH_WEIGHTS;
  }

  const stored = row.value;
  const merged: OrgHealthWeights = { ...DEFAULT_ORG_HEALTH_WEIGHTS };
  for (const key of Object.keys(DEFAULT_ORG_HEALTH_WEIGHTS) as (keyof OrgHealthWeights)[]) {
    const candidate = stored[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      merged[key] = candidate;
    }
  }
  return merged;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function computeOrgHealthScore(
  weights: OrgHealthWeights,
  ruleEvaluation: RuleEvaluationResult,
  bayesianUpdate: BayesianUpdateResult,
  causal: CausalChainResult,
  fusion: SignalFusionResult,
  burnout: BurnoutRiskResult,
  flightRisk: FlightRiskResult,
  decisionHealth: DecisionHealthIndex,
  network: OrgNetworkReport,
  scenarios: ScenarioReport,
): number {
  const activeFindings = ruleEvaluation.findings.filter((f) => f.active);
  const avgSeverity = activeFindings.length > 0 ? activeFindings.reduce((s, f) => s + f.severity, 0) / activeFindings.length : 0;
  const ruleHealth = clamp(100 - avgSeverity * 18, 0, 100);

  const avgBelief = bayesianUpdate.beliefs.length > 0 ? bayesianUpdate.beliefs.reduce((s, b) => s + b.probability, 0) / bayesianUpdate.beliefs.length : 0;
  const beliefHealth = clamp(100 - avgBelief * 100, 0, 100);

  const causalHealth = clamp(100 - causal.chains.length * 5, 0, 100);
  const fusionHealth = clamp(100 - fusion.orgFusedScore, 0, 100);
  const burnoutHealth = clamp(100 - burnout.orgAverage, 0, 100);
  const flightHealth = clamp(100 - flightRisk.orgAverage, 0, 100);
  const decisionHealthScore = clamp(decisionHealth.score, 0, 100);
  const networkHealth = clamp(100 - network.density * 100, 0, 100);
  const avgExposure = scenarios.scenarios.length > 0 ? scenarios.scenarios.reduce((s, x) => s + x.exposure, 0) / scenarios.scenarios.length : 0;
  const scenarioHealth = clamp(100 - avgExposure, 0, 100);

  const weighted: [number, number][] = [
    [ruleHealth, weights.ruleSeverity],
    [beliefHealth, weights.belief],
    [causalHealth, weights.causal],
    [fusionHealth, weights.fusion],
    [burnoutHealth, weights.burnout],
    [flightHealth, weights.flightRisk],
    [decisionHealthScore, weights.decisionHealth],
    [networkHealth, weights.network],
    [scenarioHealth, weights.scenario],
  ];

  const weightSum = weighted.reduce((s, [, w]) => s + w, 0);
  if (weightSum <= 0) return 0;
  const score = weighted.reduce((s, [value, w]) => s + value * w, 0) / weightSum;
  return Math.round(score * 100) / 100;
}

/**
 * Runs the full intelligence pipeline end to end:
 *   evaluateRules -> updateBeliefs -> detectCausalChains -> fuseSignals ->
 *   computeBurnoutRiskIndex + computeFlightRiskScores ->
 *   computeDecisionHealthIndex -> buildKnowledgeGraph ->
 *   synthesizeNarratives -> scoreScenarios
 *
 * Every stage is isolated: a thrown error is caught, logged with the stage
 * name, and replaced with a neutral/empty fallback so the pipeline always
 * finishes and the caller always gets a 200 with a partial result rather
 * than a 500.
 */
export async function runFullOrchestration(db: Db, now: Date): Promise<OrchestratorResult> {
  const timings: StageTiming[] = [];
  const pipelineStart = Date.now();

  const weights = await runStage("loadOrgHealthWeights", timings, DEFAULT_ORG_HEALTH_WEIGHTS, () => loadOrgHealthWeights(db));

  const ruleEvaluation = await runStage("evaluateRules", timings, EMPTY_RULE_EVALUATION, () => evaluateRules(db, now));

  const bayesianUpdate = await runStage("updateBeliefs", timings, EMPTY_BAYESIAN, () => updateBeliefs(db, now, ruleEvaluation));

  const causal = await runStage("detectCausalChains", timings, EMPTY_CAUSAL, () => detectCausalChains(db, now, bayesianUpdate));

  const fusion = await runStage("fuseSignals", timings, EMPTY_FUSION, () =>
    Promise.resolve(fuseSignals(ruleEvaluation, bayesianUpdate, causal)),
  );

  const burnout = await runStage("computeBurnoutRiskIndex", timings, EMPTY_BURNOUT, () =>
    Promise.resolve(computeBurnoutRiskIndex(fusion, bayesianUpdate)),
  );

  const flightRisk = await runStage("computeFlightRiskScores", timings, EMPTY_FLIGHT_RISK, () =>
    Promise.resolve(computeFlightRiskScores(fusion, bayesianUpdate)),
  );

  const decisionHealth = await runStage("computeDecisionHealthIndex", timings, EMPTY_DECISION_HEALTH, () =>
    Promise.resolve(computeDecisionHealthIndex(fusion, burnout, flightRisk, causal)),
  );

  const network = await runStage("buildKnowledgeGraph", timings, EMPTY_NETWORK, () =>
    buildKnowledgeGraph(db, now, fusion, causal),
  );

  const narratives = await runStage("synthesizeNarratives", timings, EMPTY_NARRATIVES, () =>
    Promise.resolve(synthesizeNarratives(burnout, flightRisk, network)),
  );

  const scenarios = await runStage("scoreScenarios", timings, EMPTY_SCENARIOS, () =>
    Promise.resolve(scoreScenarios(burnout, flightRisk, decisionHealth)),
  );

  const intelligence: IntelligenceReport = {
    computedAt: now.toISOString(),
    ruleEvaluation,
    bayesian: bayesianUpdate,
    causal,
    fusion,
  };

  const orgHealthScore = computeOrgHealthScore(
    weights,
    ruleEvaluation,
    bayesianUpdate,
    causal,
    fusion,
    burnout,
    flightRisk,
    decisionHealth,
    network,
    scenarios,
  );

  const totalDurationMs = Date.now() - pipelineStart;
  if (totalDurationMs > 10_000) {
    console.warn(`[orchestrator] full pipeline took ${totalDurationMs}ms (exceeds 10s budget)`);
  }

  return {
    generatedAt: now.toISOString(),
    orgHealthScore,
    weights,
    timings,
    intelligence,
    burnout,
    flightRisk,
    decisionHealth,
    network,
    narratives,
    scenarios,
  };
}

/**
 * Persists an orchestration result as a new row in `orchestrator_cache`.
 */
export async function cacheOrchestratorResult(db: Db, result: OrchestratorResult): Promise<void> {
  await db.insert(schema.orchestratorCache).values({ result, generatedAt: new Date(result.generatedAt) });
}

/**
 * Returns the most recently cached orchestration result, or null if none
 * has been generated yet.
 */
export async function getLatestOrchestratorResult(db: Db): Promise<OrchestratorResult | null> {
  const [row] = await db.select().from(schema.orchestratorCache).orderBy(desc(schema.orchestratorCache.generatedAt)).limit(1);
  return row ? row.result : null;
}
