/**
 * Metrics intelligence surface — audited for causal language (Part 05,
 * section D). This module used to be where "correlation" numbers were
 * computed and shown directly as plain-English claims; it now ALWAYS routes
 * through `runCausalQuery` (identification before estimation) and renders
 * text exclusively through `renderClaimSentence`, so a correlation can never
 * be shown using causal verbs. Dashboards, briefing templates, and any
 * other product surface that wants to describe "what moves with what" must
 * call `describeMetricRelationship`, not compute `pearson()` directly.
 */

import type { Row } from "./estimation";
import { runCausalQuery } from "./query";
import { renderClaimSentence } from "./language";
import type { CausalEstimate, EvidenceRef, StructuralCausalModel } from "./types";

export interface MetricRelationship {
  metric: string;
  outcome: string;
  estimate: CausalEstimate;
  headline: string; // produced ONLY by renderClaimSentence — never hand-written copy
}

export function describeMetricRelationship(
  scm: StructuralCausalModel,
  data: Row[],
  metricLabel: string,
  metric: string,
  outcomeLabel: string,
  outcome: string,
  evidence: EvidenceRef[]
): MetricRelationship {
  const estimate = runCausalQuery({
    scm,
    query: { effect: metric, on: outcome, population: "all active employees, trailing 12 months" },
    data,
    evidence,
  });

  return {
    metric,
    outcome,
    estimate,
    headline: renderClaimSentence(metricLabel, outcomeLabel, estimate),
  };
}

/**
 * Builds the "what moves with what" board for a dashboard: every candidate
 * metric against a target outcome, each one individually identified before
 * any number is shown.
 */
export function buildMetricsBoard(
  scm: StructuralCausalModel,
  data: Row[],
  outcome: string,
  outcomeLabel: string,
  candidateMetrics: { id: string; label: string }[],
  evidence: EvidenceRef[]
): MetricRelationship[] {
  return candidateMetrics
    .filter((c) => c.id !== outcome)
    .map((c) => describeMetricRelationship(scm, data, c.label, c.id, outcomeLabel, outcome, evidence));
}
