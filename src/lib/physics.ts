/**
 * physics.ts — facade + documentation table for the org-physics layer, plus
 * two small emergent-dynamics models shared by `simulation.ts` and
 * `orgPhysics.ts`:
 *
 *   - onboarding ramp curve (new hires are not instantly 100% productive)
 *   - context-switching penalty (Brooks/Weinberg-style concurrent-task cost)
 *   - an `IAttentionModel` seam for Part 12's interruption/attention model
 *
 * HONESTY NOTE: the onboarding ramp curve and the context-switch penalty
 * table below are *not yet fitted* to Leados event history — there is no
 * recorded new-hire ramp data or interruption telemetry in this sandbox.
 * They are widely-cited rule-of-thumb shapes (documented with source),
 * explicitly labeled `provenance: "assumed"`, and are the first candidates
 * to replace with fitted curves once Part 01 has enough new-hire /
 * interruption events and Part 12 ships the real attention model.
 */
import { ORG_ODE_PARAM_DOCS, OrgODEParams } from "@/lib/orgODE";
import type { Rng } from "@/lib/prng";

export type Provenance = "fitted" | "default" | "assumed";

export interface DocumentedParam {
  name: string;
  symbol: string;
  unit: string;
  range: [number, number];
  value: number;
  provenance: Provenance;
  description: string;
  source?: string;
}

/** Full documentation table for the physics layer, for UI/report rendering. */
export function describeOrgODEParams(
  params: OrgODEParams,
  provenance: Provenance,
): DocumentedParam[] {
  return (Object.keys(params) as Array<keyof OrgODEParams>).map((key) => {
    const doc = ORG_ODE_PARAM_DOCS[key];
    return {
      name: key,
      symbol: doc.symbol,
      unit: doc.unit,
      range: doc.range,
      value: params[key],
      provenance,
      description: doc.description,
    };
  });
}

// ---------------------------------------------------------------------------
// Onboarding ramp curve
// ---------------------------------------------------------------------------
export interface OnboardingRampConfig {
  /** Productivity fraction on day 0 of tenure. Range [0,1]. */
  startFraction: number;
  /** Days to reach ~63% of the remaining gap closed (exponential half-life-ish). */
  rampDays: number;
}

export const DEFAULT_ONBOARDING_RAMP: OnboardingRampConfig = {
  startFraction: 0.25,
  rampDays: 45,
};
export const ONBOARDING_RAMP_PROVENANCE: Provenance = "assumed";
export const ONBOARDING_RAMP_SOURCE =
  "Rule-of-thumb 'full productivity in ~2-3 months' commonly cited in engineering-management " +
  "literature (e.g. onboarding ramp studies summarized by LeadDev/Pragmatic Engineer surveys). " +
  "Not yet fitted to Leados event history — replace via Part 01 new-hire throughput events.";

/** Productivity multiplier in (0,1] given tenure in days. */
export function onboardingRampFactor(
  tenureDays: number,
  cfg: OnboardingRampConfig = DEFAULT_ONBOARDING_RAMP,
): number {
  if (tenureDays <= 0) return cfg.startFraction;
  const gap = 1 - cfg.startFraction;
  return Math.min(1, cfg.startFraction + gap * (1 - Math.exp(-tenureDays / cfg.rampDays)));
}

// ---------------------------------------------------------------------------
// Context-switching penalty
// ---------------------------------------------------------------------------
export const CONTEXT_SWITCH_PROVENANCE: Provenance = "assumed";
export const CONTEXT_SWITCH_SOURCE =
  "Widely-cited informal figures (Weinberg, 'Quality Software Management Vol.1', context " +
  "switching cost table: 2 tasks ~20% loss, 3 ~40%, 4 ~60%, 5 ~75%). Treated as an assumed " +
  "rule-of-thumb, not a Leados-fitted curve.";

/** Fraction of nominal capacity retained when an agent juggles `n` concurrent items. */
export function contextSwitchRetention(concurrentItems: number): number {
  const lossTable: Record<number, number> = { 1: 0, 2: 0.2, 3: 0.4, 4: 0.6, 5: 0.75 };
  const n = Math.max(1, Math.round(concurrentItems));
  const loss = n in lossTable ? lossTable[n] : 0.85; // cap: diminishing but severe beyond 5
  return Math.max(0.05, 1 - loss);
}

// ---------------------------------------------------------------------------
// Attention model seam (Part 12)
// ---------------------------------------------------------------------------
export interface IAttentionModel {
  /** Fractional capacity lost to interruptions for this agent on this day, in [0, 0.9]. */
  interruptionLoad(agentId: string, day: number, rng: Rng): number;
}

/**
 * STAND-IN for Part 12's attention/interruption model. Returns a baseline
 * interruption load plus seeded jitter. Replace with the real Part 12
 * import once available — the call signature is intentionally minimal so
 * swapping it in should not require changes to `simulation.ts`.
 */
export class DefaultAttentionModel implements IAttentionModel {
  constructor(private readonly baseline = 0.12, private readonly jitter = 0.05) {}
  interruptionLoad(_agentId: string, _day: number, rng: Rng): number {
    const draw = rng.normal(this.baseline, this.jitter);
    return Math.max(0, Math.min(0.9, draw));
  }
}
