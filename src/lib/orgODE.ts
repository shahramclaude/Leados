/**
 * orgODE.ts — Part 06 section B: the organizational physics layer.
 *
 * A small coupled system of difference equations (discrete Euler
 * integration, dt = 1 simulated day) describing four state variables per
 * team:
 *
 *   load        hours of demand currently queued against the team (stock)
 *   burnout     "workload pressure index" in [0,1] — NOT a medical claim,
 *               a unitless accumulated-overload proxy. Accumulates when
 *               load exceeds capacity, decays when load is sustained below
 *               capacity ("recovers on sustained load < capacity").
 *   quality     output quality index in [qMin,1]; degrades under schedule
 *               pressure, recovers under slack.
 *   debt        accumulated process/technical debt units; grows under
 *               sustained crunch, is paid down during slack.
 *
 * Every parameter below is declared with its symbol, documented range, and
 * default value. Defaults are placeholders until `fitOrgODEParameters`
 * calibrates them against history (see orgPhysics.ts). Always report
 * whether a value in use is "fitted" or "default" — never silently present
 * a default as calibrated.
 */

export interface OrgODEParams {
  /** k_accum: workload-pressure accumulation rate under overload. Range [0, 1]/day. */
  kAccum: number;
  /** k_recover: workload-pressure recovery rate under slack. Range [0, 1]/day. */
  kRecover: number;
  /** k_q: quality degradation rate under schedule pressure. Range [0, 1]/day. */
  kQualityDegrade: number;
  /** k_q_recover: quality recovery rate under slack. Range [0, 1]/day. */
  kQualityRecover: number;
  /** k_debt: debt accumulation rate under schedule pressure. Range [0, 2]/day. */
  kDebtAccum: number;
  /** k_payoff: debt payoff rate (fraction of debt paid per day of full slack). Range [0, 1]/day. */
  kDebtPayoff: number;
  /** Brooks's-law communication-overhead coefficient c in cost = c * n(n-1)/2. Range [0, 0.05]. */
  brooksCoefficient: number;
  /** Minimum achievable quality floor under sustained crunch. Range [0, 1]. */
  qualityFloor: number;
}

export const ORG_ODE_PARAM_DOCS: Record<
  keyof OrgODEParams,
  { symbol: string; unit: string; range: [number, number]; description: string }
> = {
  kAccum: {
    symbol: "k_accum",
    unit: "1/day",
    range: [0, 1],
    description: "Workload-pressure accumulation rate when load/capacity > 1.",
  },
  kRecover: {
    symbol: "k_recover",
    unit: "1/day",
    range: [0, 1],
    description: "Workload-pressure recovery rate when load/capacity < 1 (sustained).",
  },
  kQualityDegrade: {
    symbol: "k_q",
    unit: "1/day",
    range: [0, 1],
    description: "Rate at which quality index degrades under schedule pressure.",
  },
  kQualityRecover: {
    symbol: "k_q_recover",
    unit: "1/day",
    range: [0, 1],
    description: "Rate at which quality index recovers under slack.",
  },
  kDebtAccum: {
    symbol: "k_debt",
    unit: "1/day",
    range: [0, 2],
    description: "Rate at which process/technical debt accumulates under pressure.",
  },
  kDebtPayoff: {
    symbol: "k_payoff",
    unit: "1/day",
    range: [0, 1],
    description: "Fraction of outstanding debt paid down per day of full slack.",
  },
  brooksCoefficient: {
    symbol: "c",
    unit: "unitless",
    range: [0, 0.05],
    description: "Brooks's-law coefficient: communication overhead = c * n(n-1)/2.",
  },
  qualityFloor: {
    symbol: "q_min",
    unit: "unitless",
    range: [0, 1],
    description: "Lowest quality index reachable under sustained maximal crunch.",
  },
};

/** Conservative, literature-informed defaults — label as DEFAULT, not fitted. */
export const DEFAULT_ORG_ODE_PARAMS: OrgODEParams = {
  kAccum: 0.15,
  kRecover: 0.1,
  kQualityDegrade: 0.2,
  kQualityRecover: 0.08,
  kDebtAccum: 0.25,
  kDebtPayoff: 0.08,
  brooksCoefficient: 0.01,
  qualityFloor: 0.4,
};

export interface OrgODEState {
  day: number;
  load: number;
  capacity: number;
  burnout: number;
  quality: number;
  debt: number;
  teamSize: number;
}

export interface OrgODEStepInput {
  state: OrgODEState;
  /** New hours of demand arriving this day. */
  inflow: number;
  /** Raw (pre-overhead) capacity in hours/day for the team this day. */
  rawCapacity: number;
  /** Team size this day (drives Brooks's-law overhead). */
  teamSize: number;
  /** Fractional capacity lost to context-switching/interruptions in [0,1). */
  interruptionLoad: number;
  /** Onboarding ramp multiplier in (0,1], 1 = fully ramped. */
  onboardingRampFactor: number;
  params: OrgODEParams;
}

export interface OrgODEStepOutput {
  state: OrgODEState;
  effectiveCapacity: number;
  throughput: number;
  commOverheadFraction: number;
  schedulePressure: number;
  slack: number;
}

/** Brooks's-law communication overhead as a fraction of raw capacity lost. */
export function brooksOverhead(teamSize: number, coefficient: number): number {
  if (teamSize <= 1) return 0;
  const pairs = (teamSize * (teamSize - 1)) / 2;
  // Normalize by team size so overhead is a *fraction of capacity*, not an
  // unbounded hour count; clamp to keep effective capacity non-negative.
  return Math.min(0.9, coefficient * (pairs / teamSize));
}

/** One Euler step (dt = 1 day) of the organizational physics ODE system. */
export function stepOrgODE(input: OrgODEStepInput): OrgODEStepOutput {
  const { state, inflow, rawCapacity, teamSize, interruptionLoad, onboardingRampFactor, params } =
    input;

  const commOverheadFraction = brooksOverhead(teamSize, params.brooksCoefficient);
  const effectiveCapacity = Math.max(
    0,
    rawCapacity * (1 - commOverheadFraction) * (1 - interruptionLoad) * onboardingRampFactor,
  );

  const loadBefore = state.load + inflow;
  const throughput = Math.min(loadBefore, effectiveCapacity);
  const loadAfter = Math.max(0, loadBefore - throughput);

  const utilization = effectiveCapacity > 0 ? loadBefore / effectiveCapacity : loadBefore > 0 ? 2 : 0;
  const schedulePressure = Math.max(0, utilization - 1);
  const slack = Math.max(0, 1 - utilization);

  const burnout = clamp01(
    state.burnout + params.kAccum * schedulePressure - params.kRecover * slack * state.burnout,
  );

  const quality = clamp(
    state.quality -
      params.kQualityDegrade * schedulePressure * (state.quality - params.qualityFloor) +
      params.kQualityRecover * slack * (1 - state.quality),
    params.qualityFloor,
    1,
  );

  const debt = Math.max(
    0,
    state.debt + params.kDebtAccum * schedulePressure - params.kDebtPayoff * slack * state.debt,
  );

  return {
    state: {
      day: state.day + 1,
      load: loadAfter,
      capacity: rawCapacity,
      burnout,
      quality,
      debt,
      teamSize,
    },
    effectiveCapacity,
    throughput,
    commOverheadFraction,
    schedulePressure,
    slack,
  };
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function initialOrgODEState(teamSize: number, rawCapacity: number): OrgODEState {
  return {
    day: 0,
    load: rawCapacity * 0.8,
    capacity: rawCapacity,
    burnout: 0.1,
    quality: 0.95,
    debt: 0.05,
    teamSize,
  };
}
