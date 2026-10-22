/**
 * src/content/legacyNarratives.ts
 *
 * PHASE 0 — DISCOVER artifact.
 *
 * The repository snapshot available for this part contained only the
 * default Vite/React/Tailwind scaffold — no prior LEADOS dashboard copy to
 * grep. To make the audit concrete and testable (and to give the lint/gate
 * machinery something real to catch), this file documents the kind of
 * unsupported causal language that is typical of CRM/analytics dashboards
 * like LEADOS ("X drove Y", "impact of", "improved because") and that this
 * part's engine is built to replace. Each entry below is the "before"
 * state; `src/lib/causal/hypotheses.ts` + `languagePolicy.ts` generate the
 * "after" state shown in the product today.
 *
 * This file is NOT rendered in the app. It exists purely as the Phase 0
 * findings artifact and as an input to the self-test in
 * scripts/causalLint.ts (which proves the linter actually catches this kind
 * of language when it is mislabeled as "causal").
 */

export interface LegacyFinding {
  surface: string;
  phrase: string;
  impliedClaimStrength: "causal" | "suggestive" | "associational";
  evidenceClassBehindIt: string;
  verdict: string;
}

export const PHASE_0_FINDINGS: LegacyFinding[] = [
  {
    surface: "Pipeline velocity widget",
    phrase: "New outreach cadence drove a 24% lift in conversions",
    impliedClaimStrength: "causal",
    evidenceClassBehindIt: "Before/after trend on the treated cohort only, no control group, no pre-trend check.",
    verdict: "FAIL — reclassified as associational pending a DiD or matching design; see psm-training / did-outreach-cadence claims.",
  },
  {
    surface: "Rep performance leaderboard",
    phrase: "Reps who completed training improved because of the new content",
    impliedClaimStrength: "causal",
    evidenceClassBehindIt: "Raw correlation between self-selected training completion and quota attainment; training completion is opt-in.",
    verdict: "FAIL — self-selection confound undisclosed. Replaced by IPW-weighted estimate with balance diagnostics (psm-training).",
  },
  {
    surface: "Regional revenue summary",
    phrase: "The price change in Region C caused the revenue dip",
    impliedClaimStrength: "causal",
    evidenceClassBehindIt: "Single before/after comparison for one region, no comparison group, no account for seasonality.",
    verdict: "FAIL — single-unit intervention needs a synthetic control, not a before/after read. Replaced by synth-control-price claim with RMSPE + placebo-in-space diagnostics.",
  },
  {
    surface: "Tool adoption report",
    phrase: "Impact of lead-scoring tool: +5pp conversion",
    impliedClaimStrength: "causal",
    evidenceClassBehindIt: "Comparison of adopters vs. non-adopters with no handling of who self-selects into adoption (likely higher performers).",
    verdict: "FAIL — selection bias on adoption. Replaced by instrumented estimate using rollout-wave assignment (iv-lead-scoring), explicitly flagged if the instrument is weak.",
  },
  {
    surface: "Approval workflow analytics",
    phrase: "Manager review requirement improved deal quality",
    impliedClaimStrength: "causal",
    evidenceClassBehindIt: "Comparison of deals above/below an approval-triggering size threshold with no discontinuity design, confounding deal size itself with the rule.",
    verdict: "FAIL — deal size is a confounder of the outcome by itself. Replaced by RDD local-linear estimate at the threshold (rdd-approval-threshold) with bandwidth-sensitivity check.",
  },
  {
    surface: "Executive summary auto-narrative",
    phrase: "Momentum in Q3 was because reps focused on bigger accounts",
    impliedClaimStrength: "causal",
    evidenceClassBehindIt: "Narrative generated from a single quarter-over-quarter correlation with no counterfactual or adjustment of any kind.",
    verdict: "FAIL — no identification strategy at all. Under the new policy this can only be labeled associational ('moved together with') unless a design is attached.",
  },
];
