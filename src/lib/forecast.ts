// ---------------------------------------------------------------------------
// Part 59 — Pipeline Forecasting & Revenue Attribution
//
// Pure, reproducible forecast function: probability of closing is derived
// from a transparent blend of (a) pipeline stage and (b) the lead's
// deterministic score from src/lib/scoring.ts. No ML, no black box — every
// forecast ships with a plain-language rationale, consistent with the rest
// of the LEADOS evidence model.
// ---------------------------------------------------------------------------

export type Stage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export const STAGE_WEIGHTS: Record<Stage, number> = {
  new: 0.05,
  contacted: 0.2,
  qualified: 0.4,
  proposal: 0.6,
  negotiation: 0.8,
  won: 1,
  lost: 0,
};

export const STAGE_ORDER: Stage[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function isStage(value: string): value is Stage {
  return (STAGE_ORDER as string[]).includes(value);
}

export interface ForecastInput {
  stage: Stage;
  score: number; // 0-100, from the scoring engine
  dealValue: number;
}

export interface ForecastResult {
  probability: number; // 0-100
  weightedValue: number;
  method: string;
  rationale: string;
}

const STAGE_BLEND = 0.5; // half the probability comes from pipeline stage...
const SCORE_BLEND = 0.5; // ...half comes from the lead's deterministic score

/**
 * Computes the current-period forecast for a single lead. This is a plain
 * weighted blend (documented here, not hidden in a model) rather than a
 * full Monte Carlo or regression-fitted conversion model.
 */
export function computeForecast(input: ForecastInput): ForecastResult {
  if (input.stage === "won") {
    return {
      probability: 100,
      weightedValue: round2(input.dealValue),
      method: "closed-won",
      rationale: "Stage is Won, so probability is fixed at 100% and the full deal value is recognized.",
    };
  }

  if (input.stage === "lost") {
    return {
      probability: 0,
      weightedValue: 0,
      method: "closed-lost",
      rationale: "Stage is Lost, so probability is fixed at 0% and no value is attributed.",
    };
  }

  const stageWeight = STAGE_WEIGHTS[input.stage];
  const scoreWeight = clamp(input.score, 0, 100) / 100;

  const probability = clamp(
    (stageWeight * STAGE_BLEND + scoreWeight * SCORE_BLEND) * 100,
    0,
    100,
  );
  const weightedValue = round2((probability / 100) * input.dealValue);

  return {
    probability: round2(probability),
    weightedValue,
    method: "stage-score-blend-50-50",
    rationale: `Blended 50% from pipeline stage "${input.stage}" (${Math.round(
      stageWeight * 100,
    )}% baseline) and 50% from the lead's deterministic score (${input.score}/100), producing a ${round2(
      probability,
    )}% close probability applied to a $${input.dealValue.toLocaleString()} deal value.`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Returns the fiscal-quarter period label (e.g. "2026-Q1") for "now",
 * used as the default forecast period when one isn't supplied explicitly.
 */
export function currentPeriod(date: Date = new Date()): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}
