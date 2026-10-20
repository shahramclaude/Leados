/**
 * Counterfactual & what-if engine (Part 05, section C). Wraps the
 * abduction-action-prediction machinery in `scm.ts` with the `Explain<T>`
 * envelope so the UI can render:
 *   - "Why is this happening?"      -> whyIsThisHappening()
 *   - "What would move this?"       -> whatWouldMoveThis()
 *   - "What if...?"                 -> whatIf()  (feeds Part 06's simulator)
 *
 * Every answer references real DAG paths computed by `scm.ts`'s
 * abduction-action-prediction trace (not a canned sentence), and every
 * answer links to evidence.
 */

import { explain, type EvidenceRef, type Explain } from "@/lib/explain";
import { counterfactual as runCounterfactual, loadSCM, whyExplanation, type Assignment, type CounterfactualTrace, type LoadedModel } from "./scm";
import type { CausalEstimate, StructuralCausalModel } from "./types";
import { renderInterventionSentence } from "./language";

export interface WhyAnswer {
  variable: string;
  value: number;
  parents: { variable: string; value: number; contribution: number }[];
  intercept: number;
  noiseContribution: number;
  path: string[];
}

export function whyIsThisHappening(
  scm: StructuralCausalModel,
  observed: Assignment,
  variable: string,
  evidence: EvidenceRef[]
): Explain<WhyAnswer> {
  const model = loadSCM(scm);
  const step = whyExplanation(model, observed, variable);

  if (!step) {
    return explain(
      { variable, value: observed[variable], parents: [], intercept: 0, noiseContribution: 0, path: [variable] },
      {
        summary: `${variable} is exogenous in this model (no structural parents recorded).`,
        steps: ["No structural assignment found for this variable; treated as a root cause in the current DAG."],
        evidence,
        confidence: "low",
        caveats: ["This variable may have real-world causes not yet modelled in the DAG."],
      }
    );
  }

  const varLabel = scm.variables.find((v) => v.id === variable)?.label ?? variable;
  const parentsWithValues = step.contributions.map((c) => ({
    variable: c.parent,
    value: observed[c.parent] ?? 0,
    contribution: c.contribution,
  }));

  const total = step.intercept + step.noiseContribution + step.contributions.reduce((a, c) => a + c.contribution, 0);
  const sortedByMagnitude = [...parentsWithValues].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return explain(
    {
      variable,
      value: observed[variable],
      parents: parentsWithValues,
      intercept: step.intercept,
      noiseContribution: step.noiseContribution,
      path: [variable, ...step.parents],
    },
    {
      summary: `${varLabel} is ${observed[variable].toFixed(2)}, mainly explained by ${
        sortedByMagnitude[0] ? sortedByMagnitude[0].variable : "its baseline"
      }.`,
      steps: [
        `${varLabel} := f(${step.parents.join(", ") || "exogenous"}) + noise, structural total ${total.toFixed(2)}.`,
        ...sortedByMagnitude.map(
          (p) => `${p.variable} = ${p.value.toFixed(2)} contributes ${p.contribution.toFixed(2)} to ${varLabel}.`
        ),
        `Baseline (intercept) contributes ${step.intercept.toFixed(2)}; idiosyncratic/unexplained noise contributes ${step.noiseContribution.toFixed(2)}.`,
      ],
      evidence,
      confidence: "medium",
      caveats: [
        "Decomposition assumes the structural model's functional form (linear/logistic) is correctly specified.",
        "Noise contribution bundles everything not explicitly modelled — it is not itself explained.",
      ],
    }
  );
}

export interface InterventionCandidate {
  variable: string;
  label: string;
  estimate: CausalEstimate;
  costPerUnit: number;
  candidateDelta: number; // proposed unit change to evaluate, e.g. +1 session/month
}

export interface RankedIntervention {
  variable: string;
  label: string;
  identifiable: boolean;
  expectedEffect: number | null;
  expectedEffectPerCost: number | null;
  sentence: string;
}

export function whatWouldMoveThis(
  candidates: InterventionCandidate[],
  evidence: EvidenceRef[]
): Explain<RankedIntervention[]> {
  const ranked: RankedIntervention[] = candidates.map((c) => {
    const sentence = renderInterventionSentence(c.label, c.estimate, c.costPerUnit);
    const expectedEffect =
      c.estimate.identifiable && c.estimate.estimate
        ? c.estimate.estimate.ate * c.candidateDelta
        : null;
    const expectedEffectPerCost =
      expectedEffect !== null ? expectedEffect / Math.max(c.costPerUnit, 1e-6) : null;
    return {
      variable: c.variable,
      label: c.label,
      identifiable: c.estimate.identifiable,
      expectedEffect,
      expectedEffectPerCost,
      sentence,
    };
  });

  ranked.sort((a, b) => (b.expectedEffectPerCost ?? -Infinity) - (a.expectedEffectPerCost ?? -Infinity));

  const actionable = ranked.filter((r) => r.identifiable);
  const nonActionable = ranked.filter((r) => !r.identifiable);

  return explain(ranked, {
    summary:
      actionable.length > 0
        ? `${actionable[0].label} ranks highest on expected effect per unit cost among identifiable levers.`
        : "No candidate lever currently has an identifiable causal effect; all ranked by association only.",
    steps: [
      `Ranked ${candidates.length} candidate interventions by (expected effect x proposed delta) / cost-per-unit.`,
      ...actionable.map((r) => r.sentence),
      ...(nonActionable.length > 0
        ? [`${nonActionable.length} candidate(s) excluded from causal ranking (not identifiable): ${nonActionable.map((r) => r.label).join(", ")}.`]
        : []),
    ],
    evidence,
    confidence: actionable.length > 0 ? "medium" : "low",
    caveats: nonActionable.map((r) => `${r.label}: ${r.sentence}`),
  });
}

export interface WhatIfResult extends CounterfactualTrace {
  summaryVariable: string;
}

export function whatIf(
  scm: StructuralCausalModel,
  observed: Assignment,
  interventions: Assignment,
  summaryVariable: string,
  evidence: EvidenceRef[]
): Explain<WhatIfResult> {
  const model: LoadedModel = loadSCM(scm);
  const trace = runCounterfactual(model, observed, interventions);

  const before = trace.before[summaryVariable];
  const after = trace.after[summaryVariable];
  const delta = after - before;

  const interventionDesc = Object.entries(interventions)
    .map(([k, v]) => `do(${k} = ${v})`)
    .join(", ");

  return explain(
    { ...trace, summaryVariable },
    {
      summary: `Under ${interventionDesc}, ${summaryVariable} moves from ${before.toFixed(2)} to ${after.toFixed(2)} (${delta >= 0 ? "+" : ""}${delta.toFixed(2)}) along the modelled DAG path.`,
      steps: [
        `Abduction: inferred this entity's idiosyncratic noise terms from its observed values.`,
        `Action: fixed ${interventionDesc}, cutting those variables' incoming structural edges.`,
        `Prediction: recomputed ${trace.path.length} downstream variable(s) in topological order: ${trace.path.join(" -> ")}.`,
        ...trace.steps.map(
          (s) => `${s.variable}: ${s.before.toFixed(2)} -> ${s.after.toFixed(2)} (intercept ${s.intercept.toFixed(2)}, parents ${s.contributions.map((c) => `${c.parent}=${c.contribution.toFixed(2)}`).join(", ") || "none"}, noise ${s.noiseContribution.toFixed(2)}).`
        ),
      ],
      evidence,
      confidence: "medium",
      caveats: [
        "This is a model-based counterfactual for ONE entity under the stated structural assumptions, not a guarantee — it does not replace running the actual intervention.",
        "Assumes the structural functional form and the DAG's parent sets are correctly specified.",
      ],
    }
  );
}
