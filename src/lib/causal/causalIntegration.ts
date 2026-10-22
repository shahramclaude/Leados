/**
 * src/lib/causal/causalIntegration.ts
 * Thin orchestration façade: the single import surface the UI should use to
 * get causal claims, run the backdoor demo, and lint narratives, so
 * components never reach into estimator internals directly.
 */
import { buildDemoBundle, type DemoBundle } from "./hypotheses";
import { checkBackdoorCriterion, type BackdoorCheckResult } from "./graph";
import type { CausalGraph } from "./types";
import { lintNarratives, type LintViolation } from "./languagePolicy";
import { simulateCounterfactual, type CounterfactualInput, type CounterfactualOutput } from "./counterfactual";

let cachedBundle: DemoBundle | null = null;

/** Returns the memoized demo bundle (claims + collider graph + uplift results). Pure given fixed seeds. */
export function getDemoBundle(): DemoBundle {
  if (!cachedBundle) cachedBundle = buildDemoBundle();
  return cachedBundle;
}

/** Run the backdoor criterion check for an arbitrary graph/treatment/outcome/adjustment-set combination. */
export function runBackdoorCheck(graph: CausalGraph, treatment: string, outcome: string, adjustmentSet: string[]): BackdoorCheckResult {
  return checkBackdoorCriterion(graph, treatment, outcome, adjustmentSet);
}

export function runCounterfactual(input: CounterfactualInput): CounterfactualOutput {
  return simulateCounterfactual(input);
}

export function lintAllNarratives(items: { id: string; text: string; claimClass: "causal" | "suggestive" | "associational" }[]): { id: string; violations: LintViolation[] }[] {
  return lintNarratives(items);
}

export * from "./types";
