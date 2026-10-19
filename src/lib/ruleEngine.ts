// src/lib/ruleEngine.ts
//
// Evaluates the rule registry against the current belief fabric + raw
// events, producing Findings and persisting evaluation history. Also
// houses the extended self-calibration audit (`auditRuleAccuracy`) used by
// the autonomous agent's morning cycle (Part 2, STEP 7).

import { randomUUID } from "crypto";
import type { db as defaultDb } from "@/db";
import { findings as findingsTable } from "@/db/schema";
import type {
  BeliefFabricResult,
  EvaluatedRule,
  Finding,
  LeadosEvent,
  RuleAccuracyReport,
} from "./types";
import { allRuleDefinitions } from "./ruleRegistry";
import {
  getAllRules,
  getRecentEvaluations,
  recordRuleEvaluation,
} from "./ruleStore";
import { computeBrierScore } from "./selfImprove";
import { clamp } from "./temporal";

type Database = typeof defaultDb;

export interface EvaluateRulesOptions {
  cycleId?: string | null;
  persist?: boolean; // defaults to true
}

export async function evaluateRules(
  db: Database,
  beliefs: BeliefFabricResult,
  events: LeadosEvent[],
  now: Date,
  options: EvaluateRulesOptions = {},
): Promise<EvaluatedRule[]> {
  const persist = options.persist ?? true;
  const storedRules = await getAllRules(db);
  const weightByKey = new Map(storedRules.map((r) => [r.key, r.weight]));

  const results: EvaluatedRule[] = [];

  for (const def of allRuleDefinitions()) {
    const outcome = def.evaluate({ beliefs, events, now });
    const weight = weightByKey.get(def.key) ?? 1;
    const severity = clamp(Math.round(def.baseSeverity * weight), 1, 5);

    let finding: Finding | null = null;
    if (outcome.fired) {
      finding = {
        id: randomUUID(),
        ruleKey: def.key,
        domain: def.domain,
        severity,
        title: `${def.name} (${Math.round(outcome.probability * 100)}% confidence)`,
        description: outcome.detail ?? def.name,
        createdAt: now.toISOString(),
        cycleId: options.cycleId ?? null,
      };
    }

    if (persist) {
      await recordRuleEvaluation(db, {
        ruleKey: def.key,
        domain: String(def.domain),
        fired: outcome.fired,
        severity,
        predictedProbability: outcome.probability,
        evaluatedAt: now,
      });
      if (finding) {
        await db.insert(findingsTable).values({
          id: finding.id,
          ruleKey: finding.ruleKey,
          domain: String(finding.domain),
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          cycleId: finding.cycleId,
          createdAt: now,
        });
      }
    }

    results.push({
      ruleKey: def.key,
      name: def.name,
      domain: def.domain,
      fired: outcome.fired,
      severity,
      weight,
      probability: outcome.probability,
      finding,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Extended self-calibration (Part 2)
// ─────────────────────────────────────────────────────────────────────────

const MIN_EVALUATIONS_FOR_AUDIT = 10;
const BRIER_DECREASE_THRESHOLD = 0.25;
const CALIBRATION_INCREASE_THRESHOLD = 0.6;

/**
 * Audits each rule's last `lookbackDays` of evaluations that have a
 * recorded outcome. Computes:
 *  - brierScore: mean squared error between predicted probability and
 *    realized outcome.
 *  - calibration: fraction of "critical" (severity >= 4, fired) evaluations
 *    whose outcome was true (i.e. followed by a real event) — a proxy for
 *    "when this rule screamed, was it right".
 *
 * Only rules with >= 10 historical evaluations that HAVE an outcome
 * recorded are scored; otherwise brierScore/calibration are null.
 */
export async function auditRuleAccuracy(
  db: Database,
  lookbackDays = 90,
): Promise<RuleAccuracyReport[]> {
  const storedRules = await getAllRules(db);
  const reports: RuleAccuracyReport[] = [];

  for (const rule of storedRules) {
    const evaluations = await getRecentEvaluations(db, rule.key, lookbackDays);
    const withOutcome = evaluations.filter((e) => e.outcomeRecorded && e.outcome !== null);

    if (withOutcome.length < MIN_EVALUATIONS_FOR_AUDIT) {
      reports.push({
        ruleKey: rule.key,
        name: rule.name,
        domain: rule.domain,
        brierScore: null,
        calibration: null,
        truePositives: 0,
        falsePositives: 0,
        totalEvaluations: evaluations.length,
        recommendedWeightAdjustment: "none",
        reason: `insufficient_data (${withOutcome.length}/${MIN_EVALUATIONS_FOR_AUDIT} resolved evaluations)`,
      });
      continue;
    }

    const brierScore = computeBrierScore(
      withOutcome.map((e) => ({ predicted: e.predictedProbability, outcome: Boolean(e.outcome) })),
    );

    const criticalFired = withOutcome.filter((e) => e.fired && e.severity >= 4);
    const truePositives = criticalFired.filter((e) => e.outcome === true).length;
    const falsePositives = criticalFired.filter((e) => e.outcome === false).length;
    const calibration = criticalFired.length > 0 ? truePositives / criticalFired.length : null;

    let recommendedWeightAdjustment: RuleAccuracyReport["recommendedWeightAdjustment"] = "none";
    let reason = "within acceptable calibration bounds";

    if (brierScore > BRIER_DECREASE_THRESHOLD || falsePositives > truePositives) {
      recommendedWeightAdjustment = "decrease";
      reason = `brierScore=${brierScore.toFixed(2)} exceeds ${BRIER_DECREASE_THRESHOLD}, or false positives (${falsePositives}) outnumber true positives (${truePositives})`;
    } else if (calibration !== null && calibration >= CALIBRATION_INCREASE_THRESHOLD && brierScore < BRIER_DECREASE_THRESHOLD) {
      recommendedWeightAdjustment = "increase";
      reason = `calibration=${calibration.toFixed(2)} >= ${CALIBRATION_INCREASE_THRESHOLD} with low brierScore=${brierScore.toFixed(2)}`;
    }

    reports.push({
      ruleKey: rule.key,
      name: rule.name,
      domain: rule.domain,
      brierScore,
      calibration,
      truePositives,
      falsePositives,
      totalEvaluations: evaluations.length,
      recommendedWeightAdjustment,
      reason,
    });
  }

  return reports;
}
