/**
 * Part 51 — Explainability contract (Phase 1 / Phase 3c).
 *
 * Every rendered recommendation MUST carry all five fields. `lintExplainabilityCard`
 * is the enforcement point: the ranking engine calls it before returning any
 * card, and the property-test suite asserts 100% coverage (a card missing any
 * one of the five fields fails the lint).
 */

import { suggestVerificationMetric } from "@/lib/experiments";
import type { Context, Explain, ExplainabilityCard, Intervention } from "./types";

export const EXPLAINABILITY_FIELDS = [
  "whyNow",
  "expectedEffect",
  "whatItCosts",
  "whatWeDontKnow",
  "howToVerify",
] as const;

export function lintExplainabilityCard(card: Partial<ExplainabilityCard>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const field of EXPLAINABILITY_FIELDS) {
    const v = card[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      errors.push(`missing or empty field: ${field}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function buildExplainabilityCard(
  intervention: Intervention,
  context: Context,
  effect: Explain<number>,
  matchedContexts: number,
  isSerendipity: boolean,
): ExplainabilityCard {
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const whyNow =
    effect.sampleSize > 0
      ? `Triggered because your context matches ${matchedContexts} of ${Math.max(
          1,
          intervention.applicableContexts.length,
        )} known-applicable context pattern(s) for "${intervention.title}", and ${
          effect.sampleSize
        } measured outcome(s) exist for this exact context signature.`
      : isSerendipity
        ? `Surfaced as a serendipity slot: this play is outside your usual profile match, but has accumulated strong evidence (${effect.evidenceClass}) in other contexts — included deliberately to avoid narrowing your options.`
        : `Triggered from the intervention library because your context matches ${matchedContexts} of ${Math.max(
            1,
            intervention.applicableContexts.length,
          )} known-applicable pattern(s); no org-specific measurements exist yet, so this reflects the play's prior evidence class only.`;

  const expectedEffect = `~${pct(effect.value)} chance of a positive measured outcome (interval ${pct(
    effect.interval[0],
  )}–${pct(effect.interval[1])}), evidence class: ${effect.evidenceClass}, n=${effect.sampleSize}.`;

  const whatItCosts = `${intervention.cost.amount} ${intervention.cost.unit.replace("_", " ")}; reversibility: ${
    intervention.reversibility
  }; effort: ${intervention.effort}.`;

  const dontKnowParts: string[] = [];
  if (effect.sampleSize < 5) {
    dontKnowParts.push("small sample size means this interval is wide and could shift substantially with more data");
  }
  if (effect.evidenceClass === "anecdotal" || effect.evidenceClass === "correlational") {
    dontKnowParts.push("evidence class is below experimental — this is not a causal claim, only an association/prior");
  }
  dontKnowParts.push(
    `estimate assumes your context (${Object.entries(context)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}...) is representative of the matched pattern(s)`,
  );
  const whatWeDontKnow = dontKnowParts.join("; ") + ".";

  const metric = suggestVerificationMetric(intervention.slug, intervention.category);
  const howToVerify = `Watch ${metric} for 2–4 weeks after adoption. Log a commitment follow-through or run a Part 30 experiment to turn this into verified evidence — unverified acceptance alone will not move this estimate.`;

  return { whyNow, expectedEffect, whatItCosts, whatWeDontKnow, howToVerify };
}
