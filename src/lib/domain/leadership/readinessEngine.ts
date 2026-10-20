// Domain engine: PURE. Zero I/O, zero imports from `src/lib/platform` or
// `src/lib/app` or `src/app`, zero calls to `Date.now()` / `Math.random()` /
// `crypto.randomUUID()`. Every input it needs arrives as an argument and
// every output is a plain, deterministic value. This is the contract that
// `eslint.config.mjs` enforces mechanically for everything under
// `src/lib/domain/**` — see ARCHITECTURE.md.
//
// This is the first of what will become the LEADOS leadership-intelligence
// engine library. It computes a leadership "readiness" signal from a small
// set of observable inputs. The scoring model here is intentionally simple
// (Part 00 only needs to prove the layering end-to-end); later parts
// replace or extend the model without touching any caller, because callers
// only depend on this module's exported function signature.

export type ReadinessBand = "emerging" | "developing" | "ready" | "exemplary";

export interface ReadinessInputs {
  /** Average number of days between a decision being needed and being made. Lower is better. */
  decisionLatencyDays: number;
  /** 0-100 team engagement signal (survey, pulse score, etc). */
  teamEngagementScore: number;
  /** How many structured feedback touchpoints the leader runs per month. */
  feedbackFrequencyPerMonth: number;
}

export interface ReadinessResult {
  score: number;
  band: ReadinessBand;
  rationale: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bandFor(score: number): ReadinessBand {
  if (score >= 85) return "exemplary";
  if (score >= 65) return "ready";
  if (score >= 40) return "developing";
  return "emerging";
}

export function computeReadiness(inputs: ReadinessInputs): ReadinessResult {
  const rationale: string[] = [];

  const latencyScore = clamp(100 - inputs.decisionLatencyDays * 8, 0, 100);
  rationale.push(
    `Decision latency of ${inputs.decisionLatencyDays} day(s) contributes ${latencyScore.toFixed(0)}/100.`,
  );

  const engagementScore = clamp(inputs.teamEngagementScore, 0, 100);
  rationale.push(`Team engagement score contributes ${engagementScore.toFixed(0)}/100.`);

  const feedbackScore = clamp(inputs.feedbackFrequencyPerMonth * 20, 0, 100);
  rationale.push(
    `${inputs.feedbackFrequencyPerMonth} feedback touchpoint(s)/month contributes ${feedbackScore.toFixed(0)}/100.`,
  );

  const score = Math.round(latencyScore * 0.4 + engagementScore * 0.4 + feedbackScore * 0.2);
  const band = bandFor(score);

  return { score, band, rationale };
}
