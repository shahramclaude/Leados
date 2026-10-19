// Strategic Intelligence Layer — orchestrates every strategy-adjacent engine
// (scenarios, wargaming, real options, Monte Carlo, OKRs) into one report.
//
// Wiring map (Part 5):
//   scenarioEngine.ts   -> now rerun automatically every pass (previously only
//                          triggered from a manual scenario-planning view)
//   wargameEngine.ts    -> now auto-run against every critical finding
//                          (severity >= 4) instead of being a standalone tool
//   realOptions.ts      -> previously orphaned; now values every deferred /
//                          pending decision with a deadline
//   monteCarlo.ts       -> reused (not just for scenario probability) to
//                          produce outcome distributions for the top 3 open
//                          strategic decisions by impact x probability
//   okrs                -> new table (see src/db/schema.ts); health computed
//                          via src/lib/okr.ts, null when no OKRs exist yet
//
// Option-pricing formulas used below are derived from realOptions.ts:
//   - Black-Scholes call value & greeks: realOptions.ts line 56 (blackScholesCall)
//   - Decision-option wrapper (decide/wait/monitor logic): realOptions.ts line 110 (valueDecisionOption)

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events as eventsTable, okrs as okrsTable, scenarios as scenariosTable } from "@/db/schema";
import { buildOkrHealthReport, type OKRHealthReport } from "./okr";
import { runScenarioEngine, SCENARIO_ACTIVATION_THRESHOLD, type ScenarioResult } from "./scenarioEngine";
import { runWargamePass, type WargameResult, type WargameUrgency } from "./wargameEngine";
import { valueDecisionOption } from "./realOptions";
import { simulateDecisionOutcomes, type MonteCarloResult } from "./monteCarlo";
import type { Decision, LeadosEvent, MetricValue } from "./types";
import { toNumber } from "./types";

export interface DecisionIntelligence {
  decisionId: string;
  title: string;
  domain: string;
  impact: number;
  probability: number;
  priorityScore: number;
  outcomeDistribution: MonteCarloResult;
  recommendation: string;
}

export interface RealOptionSummary {
  decisionId: string;
  title: string;
  daysRemaining: number;
  optionValue: number;
  theta: number;
  thetaPerDay: number;
  isDecayingFast: boolean;
  recommendation: "decide_now" | "wait" | "monitor";
}

export interface WargameAlert extends WargameResult {
  findingId: string;
}

export interface StrategicIntelligenceReport {
  strategicHealthScore: number;
  activeScenarios: ScenarioResult[];
  criticalDecisions: DecisionIntelligence[];
  realOptionsValuation: RealOptionSummary[];
  okrHealth: OKRHealthReport | null;
  wargameAlerts: WargameAlert[];
  strategicNarratives: string[];
  generatedAt: string;
}

const CRITICAL_SEVERITY_THRESHOLD = 4;
const WARGAME_CONFIDENCE_THRESHOLD = 0.6;
const HIGH_URGENCY: WargameUrgency[] = ["high", "critical"];

/** Estimate the value of exercising a decision's opportunity today (heuristic baseline, UNVERIFIED). */
function estimateOpportunityValue(decision: Decision): number {
  const impact = toNumber(decision.impact, 3);
  const probability = toNumber(decision.probability, 0.5);
  return impact * 25000 * probability;
}

function daysUntil(deadline: Date | string | null, now: Date): number | null {
  if (!deadline) return null;
  const d = new Date(deadline).getTime();
  return Math.max(0, Math.round((d - now.getTime()) / 86_400_000));
}

async function reconcileScenarios(events: LeadosEvent[], now: Date): Promise<ScenarioResult[]> {
  const activeScenarios = await db.select().from(scenariosTable).where(eq(scenariosTable.isActive, true));
  if (activeScenarios.length === 0) return [];

  const results = runScenarioEngine(activeScenarios, events, now);

  await Promise.all(
    results.map(async (result) => {
      const scenario = activeScenarios.find((s) => s.id === result.id);
      if (!scenario) return;

      const nextStatus = result.activated ? "activated" : scenario.status === "activated" ? "monitoring" : scenario.status;

      await db
        .update(scenariosTable)
        .set({
          previousProbability: result.previousProbability.toFixed(4),
          probability: result.probability.toFixed(4),
          status: nextStatus,
          lastRunAt: now,
        })
        .where(eq(scenariosTable.id, scenario.id));

      if (result.activated) {
        await db.insert(eventsTable).values({
          type: "strategy.scenario.shift",
          domain: result.domain,
          severity: Math.min(5, Math.max(3, Math.round(Math.abs(result.delta) * 10))),
          payload: {
            scenarioId: result.id,
            scenarioName: result.name,
            from: result.previousProbability,
            to: result.probability,
            delta: result.delta,
            threshold: SCENARIO_ACTIVATION_THRESHOLD,
            narrative: result.narrative,
          },
        });
      }
    }),
  );

  return results;
}

function rankStrategicDecisions(decisions: Decision[]): Decision[] {
  return [...decisions]
    .filter((d) => d.status === "open" || d.status === "pending")
    .sort((a, b) => {
      const scoreA = toNumber(a.impact, 0) * toNumber(a.probability, 0);
      const scoreB = toNumber(b.impact, 0) * toNumber(b.probability, 0);
      return scoreB - scoreA;
    })
    .slice(0, 3);
}

function buildDecisionIntelligence(decisions: Decision[]): DecisionIntelligence[] {
  return rankStrategicDecisions(decisions).map((decision) => {
    const impact = toNumber(decision.impact, 3);
    const probability = toNumber(decision.probability, 0.5);
    const outcomeDistribution = simulateDecisionOutcomes(decision, 1000);
    const priorityScore = impact * probability;

    let recommendation = "Monitor and gather more evidence before committing.";
    if (priorityScore >= 3.5) {
      recommendation = "High priority: escalate for an executive decision this week.";
    } else if (priorityScore >= 2) {
      recommendation = "Moderate priority: assign an owner and set a decision date.";
    }

    return {
      decisionId: decision.id,
      title: decision.title,
      domain: decision.domain ?? "general",
      impact,
      probability,
      priorityScore,
      outcomeDistribution,
      recommendation,
    };
  });
}

/**
 * Value the "option to wait" for deferred/pending decisions with a deadline.
 * Formula: realOptions.ts line 110 (valueDecisionOption), which itself calls
 * the Black-Scholes closed form at realOptions.ts line 56.
 */
function buildRealOptionsValuation(decisions: Decision[], now: Date): RealOptionSummary[] {
  return decisions
    .filter((d) => (d.status === "deferred" || d.status === "pending") && d.deadline)
    .map((decision) => {
      const daysRemaining = daysUntil(decision.deadline, now) ?? 0;
      const valuation = valueDecisionOption({
        spot: estimateOpportunityValue(decision),
        strike: toNumber(decision.optionCostToDecide, 10000),
        daysRemaining,
        volatility: toNumber(decision.optionVolatility, 0.35),
      });

      return {
        decisionId: decision.id,
        title: decision.title,
        daysRemaining,
        optionValue: Number(valuation.value.toFixed(2)),
        theta: Number(valuation.theta.toFixed(2)),
        thetaPerDay: Number(valuation.thetaPerDay.toFixed(2)),
        isDecayingFast: valuation.isDecayingFast,
        recommendation: valuation.recommendation,
      };
    })
    .sort((a, b) => a.thetaPerDay - b.thetaPerDay); // fastest-decaying first
}

async function buildWargameAlerts(events: LeadosEvent[], now: Date): Promise<WargameAlert[]> {
  const criticalFindings = events.filter((e) => e.severity >= CRITICAL_SEVERITY_THRESHOLD);
  const results = runWargamePass(criticalFindings, now, CRITICAL_SEVERITY_THRESHOLD);

  return results
    .map((result, idx) => ({ ...result, findingId: criticalFindings[idx]?.id ?? "" }))
    .filter((alert) => alert.confidence > WARGAME_CONFIDENCE_THRESHOLD);
}

function computeStrategicHealthScore(params: {
  scenarios: ScenarioResult[];
  criticalDecisions: DecisionIntelligence[];
  realOptions: RealOptionSummary[];
  okrHealth: OKRHealthReport | null;
  wargameAlerts: WargameAlert[];
}): number {
  const { scenarios, realOptions, okrHealth, wargameAlerts } = params;

  const activatedScenarios = scenarios.filter((s) => s.activated).length;
  const scenarioComponent = Math.max(0, 100 - activatedScenarios * 15);

  const decayingOptions = realOptions.filter((o) => o.isDecayingFast).length;
  const decisionComponent = Math.max(0, 100 - decayingOptions * 20);

  const okrComponent = okrHealth ? okrHealth.onTrackPct : 70; // neutral default when no OKRs tracked

  const severeAlerts = wargameAlerts.filter((a) => HIGH_URGENCY.includes(a.urgency)).length;
  const wargameComponent = Math.max(0, 100 - severeAlerts * 15);

  const weighted =
    scenarioComponent * 0.25 + decisionComponent * 0.25 + okrComponent * 0.3 + wargameComponent * 0.2;

  return Math.round(Math.min(100, Math.max(0, weighted)));
}

function buildNarratives(params: {
  healthScore: number;
  scenarios: ScenarioResult[];
  realOptions: RealOptionSummary[];
  wargameAlerts: WargameAlert[];
  okrHealth: OKRHealthReport | null;
}): string[] {
  const { healthScore, scenarios, realOptions, wargameAlerts, okrHealth } = params;
  const narratives: string[] = [];

  const tone = healthScore >= 75 ? "healthy" : healthScore >= 50 ? "mixed" : "under pressure";
  narratives.push(`Strategic posture is ${tone} at ${healthScore}/100.`);

  const activated = scenarios.filter((s) => s.activated);
  if (activated.length > 0) {
    const top = activated.sort((a, b) => b.probability - a.probability)[0];
    narratives.push(
      `${activated.length} scenario(s) just activated; "${top.name}" is now at ${(top.probability * 100).toFixed(0)}% probability.`,
    );
  } else {
    narratives.push("No scenarios have crossed the activation threshold this pass.");
  }

  const urgentDecisions = realOptions.filter((o) => o.isDecayingFast);
  if (urgentDecisions.length > 0) {
    narratives.push(
      `${urgentDecisions.length} deferred decision(s) are losing option value faster than they gain from waiting — decide now rather than later.`,
    );
  } else if (wargameAlerts.length > 0) {
    narratives.push(
      `${wargameAlerts.length} wargame alert(s) flagged with confidence above ${(WARGAME_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% — review suggested responses.`,
    );
  } else if (okrHealth) {
    narratives.push(`OKR execution is ${okrHealth.onTrackPct}% on-track across ${okrHealth.totalOkrs} tracked objectives/key results.`);
  }

  return narratives.slice(0, 3);
}

export async function runStrategicIntelligence(
  decisions: Decision[],
  events: LeadosEvent[],
  metrics: MetricValue[],
  now: Date,
): Promise<StrategicIntelligenceReport> {
  void metrics; // reserved for future metric-driven scenario weighting

  const [activeScenarios, okrRows] = await Promise.all([
    reconcileScenarios(events, now),
    db.select().from(okrsTable),
  ]);

  const criticalDecisions = buildDecisionIntelligence(decisions);
  const realOptionsValuation = buildRealOptionsValuation(decisions, now);
  const wargameAlerts = await buildWargameAlerts(events, now);
  const okrHealth = buildOkrHealthReport(okrRows, now);

  const strategicHealthScore = computeStrategicHealthScore({
    scenarios: activeScenarios,
    criticalDecisions,
    realOptions: realOptionsValuation,
    okrHealth,
    wargameAlerts,
  });

  const strategicNarratives = buildNarratives({
    healthScore: strategicHealthScore,
    scenarios: activeScenarios,
    realOptions: realOptionsValuation,
    wargameAlerts,
    okrHealth,
  });

  return {
    strategicHealthScore,
    activeScenarios,
    criticalDecisions,
    realOptionsValuation,
    okrHealth,
    wargameAlerts,
    strategicNarratives,
    generatedAt: now.toISOString(),
  };
}

/** Run a wargame simulation for a single decision (used by the manual trigger API). */
export async function runWargameForDecision(decisionId: string, decision: Decision, now: Date): Promise<WargameAlert> {
  const syntheticFinding: LeadosEvent = {
    id: decisionId,
    type: "decision.wargame.manual",
    domain: decision.domain ?? "general",
    severity: Math.max(4, toNumber(decision.impact, 4)),
    payload: { description: decision.description ?? decision.title },
    createdAt: now,
  };
  const [result] = runWargamePass([syntheticFinding], now, 1);
  return { ...result, findingId: decisionId };
}

// Re-exported so API routes/views don't need to reach across three modules.
export { CRITICAL_SEVERITY_THRESHOLD as WARGAME_SEVERITY_THRESHOLD };
