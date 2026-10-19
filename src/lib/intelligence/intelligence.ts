// src/lib/intelligence/intelligence.ts
//
// Top-level orchestrator. This is the ONLY module that touches the database
// — every other file in src/lib/intelligence is a pure function / in-memory
// class so it can be unit tested without a running Postgres instance. API
// routes and the eval harness call into this file.
import { randomUUID } from "crypto";
import { db } from "@/db";
import { calibrationRuns, findings as findingsTable, forecastCache as forecastCacheTable, ruleWeights, scenarios } from "@/db/schema";
import { eq } from "drizzle-orm";

import { explainBelief, explainFinding } from "./explain";
import { globalBeliefFabric } from "./beliefFabric";
import { buildGtmCausalGraph } from "./causal";
import { estimateCausalEffect, CausalFinding } from "./causalInference";
import { generateCausalGoldenDataset } from "./goldenDataset";
import { runCalibrationCycle, DomainCalibrationReport } from "./calibrateRules";
import { extractFeatures, MetricPoint } from "./metricsIntelligence";
import { globalForecastCache } from "./forecastCache";
import { runMonteCarlo, MonteCarloInput, MonteCarloResult, accuracyFromHistory } from "./monteCarlo";
import { combineProbabilities, severityFromRisk } from "./inference";
import { DEFAULT_RULES, evaluateRules } from "./ruleEngine";
import { runScenario, ScenarioRequest, ScenarioResult } from "./scenarioEngine";
import { globalSignalFusionEngine, RawSignal } from "./signalFusion";
import type { Explanation, Finding } from "./types";
import { generateForecastHistory } from "./goldenDataset";

// ---------------------------------------------------------------------------
// Findings: synthesize raw signals from sample account telemetry, score them
// through rules + beliefs, and fuse them into deduplicated findings.
// ---------------------------------------------------------------------------

export interface AccountTelemetry {
  accountId: string;
  domain: "pipeline" | "retention" | "forecast";
  title: string;
  metrics: Record<string, MetricPoint[]>;
  impact: "low" | "medium" | "high" | "critical";
}

function buildEvidenceLabel(accountId: string): string {
  return `account:${accountId}`;
}

/** Generates findings for a set of accounts: evaluates the rule library,
 * updates a Bayesian belief per account/domain from the rule signal, fuses
 * the belief into a severity-scored finding, and runs it through
 * signalFusion.ts for dedup/hysteresis/interrupt policy. Returns
 * contract-valid Explanations for every finding (enforced by
 * isValidExplanation in explain.ts). */
export function generateFindings(accounts: AccountTelemetry[], interruptOptIn: Record<string, boolean> = {}): Finding[] {
  const rawSignals: RawSignal[] = [];

  for (const account of accounts) {
    const features = extractFeatures(account.metrics);
    const domainRules = DEFAULT_RULES.filter((r) => r.domain === account.domain);
    const ruleResults = evaluateRules(domainRules, features);

    const combined = combineProbabilities(
      ruleResults.map((r) => ({ probability: r.calibratedProbability, weight: 1, source: r.ruleId })),
    );

    const beliefId = `belief:${account.domain}:${account.accountId}`;
    const belief = globalBeliefFabric.observe(beliefId, account.title, account.domain, {
      source: "rule-engine",
      evidence: {
        type: "rule",
        id: domainRules.map((r) => r.id).join("+") || "no-rule",
        label: `Rule evaluation for ${account.accountId}`,
        timestamp: new Date().toISOString(),
      },
      successWeight: combined * 2,
      failureWeight: (1 - combined) * 2,
    });

    const explanation: Explanation = explainBelief(belief, account.title, {
      extraDrivers: ruleResults.flatMap((r) =>
        r.firedConditions.map((c) => ({
          name: `${r.ruleId}:${c.feature}`,
          contribution: Number(c.weight.toFixed(4)),
          description: `${c.feature} ${c.operator} ${c.threshold}`,
        })),
      ),
      extraEvidence: [
        { type: "observation", id: buildEvidenceLabel(account.accountId), label: account.accountId, timestamp: new Date().toISOString() },
      ],
    });

    const severity = severityFromRisk(combined, account.impact);
    rawSignals.push({
      id: `signal:${account.accountId}:${account.domain}`,
      rootCauseId: `${account.domain}:${account.accountId}`,
      domain: account.domain,
      title: account.title,
      rawSeverity: severity,
      explanation,
      detectedAt: new Date().toISOString(),
    });
  }

  return globalSignalFusionEngine.fuse(rawSignals, interruptOptIn);
}

export async function persistFindings(foundFindings: Finding[]): Promise<void> {
  for (const finding of foundFindings) {
    await db
      .insert(findingsTable)
      .values({
        id: finding.id,
        rootCauseId: finding.rootCauseId,
        domain: finding.domain,
        title: finding.title,
        severity: finding.severity,
        displayedSeverity: finding.displayedSeverity,
        status: finding.status,
        method: finding.explanation.method,
        explanation: finding.explanation,
        suppressedCount: finding.suppressedSignalIds.length,
        interruptEligible: finding.interruptEligible,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: findingsTable.id,
        set: {
          severity: finding.severity,
          displayedSeverity: finding.displayedSeverity,
          status: finding.status,
          explanation: finding.explanation,
          suppressedCount: finding.suppressedSignalIds.length,
          interruptEligible: finding.interruptEligible,
          updatedAt: new Date(),
        },
      });
  }
}

export async function listPersistedFindings(): Promise<Finding[]> {
  const rows = await db.select().from(findingsTable);
  return rows.map((row) => ({
    id: row.id,
    rootCauseId: row.rootCauseId,
    domain: row.domain,
    title: row.title,
    severity: row.severity as Finding["severity"],
    displayedSeverity: row.displayedSeverity as Finding["severity"],
    status: row.status as Finding["status"],
    explanation: row.explanation as Explanation,
    recommendedActions: [],
    suppressedSignalIds: [],
    interruptEligible: row.interruptEligible,
  }));
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export function runCalibration(): DomainCalibrationReport[] {
  return runCalibrationCycle();
}

export async function persistCalibration(reports: DomainCalibrationReport[]): Promise<void> {
  for (const report of reports) {
    await db.insert(calibrationRuns).values({
      domain: report.domain,
      periodLabel: report.periodLabel,
      brierScore: report.domainBrierScore,
      expectedCalibrationError: report.domainExpectedCalibrationError,
      sampleSize: report.rules.reduce((sum, r) => sum + r.report.sampleSize, 0),
      reliabilityBins: report.rules.map((r) => ({ ruleId: r.report.ruleId, bins: r.report.bins })),
      driftDetected: report.rules.some((r) => r.report.drift?.driftDetected),
      report,
    });

    for (const { proposal } of report.rules) {
      await db
        .insert(ruleWeights)
        .values({
          ruleId: proposal.ruleId,
          domain: report.domain,
          weight: proposal.currentWeight,
          proposedWeight: proposal.proposedWeight,
          proposalReason: proposal.reason,
          requiresApproval: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: ruleWeights.ruleId,
          set: {
            proposedWeight: proposal.proposedWeight,
            proposalReason: proposal.reason,
            updatedAt: new Date(),
          },
        });
    }
  }
}

export async function approveRuleWeight(ruleId: string, approvedBy: string): Promise<void> {
  const rows = await db.select().from(ruleWeights).where(eq(ruleWeights.ruleId, ruleId));
  const row = rows[0];
  if (!row || row.proposedWeight === null || row.proposedWeight === undefined) return;
  await db
    .update(ruleWeights)
    .set({ weight: row.proposedWeight, proposedWeight: null, approvedBy, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(ruleWeights.ruleId, ruleId));
}

// ---------------------------------------------------------------------------
// Causal inference demo surface
// ---------------------------------------------------------------------------

export function causalInsight(includeConfounder: boolean): CausalFinding {
  const graph = buildGtmCausalGraph();
  const data = generateCausalGoldenDataset(300, 1337, includeConfounder);
  return estimateCausalEffect(graph, data, "headcount", "pipelineGenerated");
}

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

export async function forecast(input: MonteCarloInput): Promise<MonteCarloResult> {
  const cached = globalForecastCache.get(input);
  if (cached) return cached;
  const result = await runMonteCarlo(input);
  const history = generateForecastHistory();
  result.accuracy = accuracyFromHistory(history);
  globalForecastCache.set(input, result);

  await db
    .insert(forecastCacheTable)
    .values({
      cacheKey: `${input.subject}::${input.scenario?.name ?? "baseline"}`,
      subject: input.subject,
      evidenceHash: randomUUID(),
      scenario: input.scenario?.name ?? "baseline",
      result,
    })
    .onConflictDoUpdate({
      target: forecastCacheTable.cacheKey,
      set: { result, createdAt: new Date() },
    });

  return result;
}

// ---------------------------------------------------------------------------
// Scenarios (counterfactual simulation)
// ---------------------------------------------------------------------------

export async function createScenario(request: ScenarioRequest): Promise<ScenarioResult & { shareSlug: string }> {
  const result = runScenario(request);
  const shareSlug = `${result.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${result.id.slice(0, 8)}`;
  await db.insert(scenarios).values({
    id: result.id,
    name: result.name,
    description: result.description,
    interventions: result.interventions,
    result,
    causalChain: result.causalChains,
    shareSlug,
  });
  return { ...result, shareSlug };
}

export async function listScenarios() {
  return db.select().from(scenarios);
}

export async function getScenarioBySlug(slug: string) {
  const rows = await db.select().from(scenarios).where(eq(scenarios.shareSlug, slug));
  return rows[0];
}

export { explainFinding };
