/**
 * app/core/domain/deferralOption.js — the Deferral Option Terminal
 * (Schema v68, ADR-0059).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * Every delay-pricing surface in this workspace is one-sided. Decision Tempo
 * derives a carrying cost per week, Cost of Waiting prices the queue, the
 * Consequence Lab integrates the conditional survival curve to an expected
 * carrying cost, and Information Value prices what a test would tell you. All
 * of them answer *what waiting costs*. None of them answers the question that
 * decides whether waiting is rational at all:
 *
 *     *what is the flexibility to wait WORTH?*
 *
 * That is not the same question as the value of information. Value of
 * information prices learning about a state you cannot observe. An option to
 * defer has value even with nothing left to learn, because committing sinks
 * money into a call that the world can still invalidate. The two are separate
 * quantities and this module refuses to add them together.
 *
 * WHAT IS COMPUTED (named methods, each actually implemented)
 * -----------------------------------------------------------
 *  1. **Deferral as an American option (McDonald & Siegel 1986; Dixit &
 *     Pindyck 1994; Trigeorgis 1996).** The value at stake V evolves as a
 *     geometric Brownian motion. Committing now pays `V0 − K`, where `K` is the
 *     commitment cost the leader sinks (the reversal cost of the call, not the
 *     stake). Waiting preserves the right — never the obligation — to commit
 *     at a better value or to abandon, at a running cost of `c` per week (the
 *     workspace's own derived/declared delay price). The optimal policy is an
 *     exercise boundary: commit when V ≥ V*(t), wait below it. The gap between
 *     V* and K is hysteresis, and it exists only because the call is
 *     irreversible and the value is uncertain.
 *  2. **Cox–Ross–Rubinstein (1979) binomial backward induction**, N steps,
 *     American exercise at every node. Validated against the Black–Scholes–
 *     Merton (1973) European price, which the same tree reproduces as N grows
 *     — pinned by test.
 *  3. **Real-world (decision-analysis) measure, not risk-neutral pricing.**
 *     A leadership decision has no replicating portfolio, so there is no
 *     risk-neutral measure to price it under. The tree therefore runs on the
 *     leader's declared drift (default 0) and the value is a decision-analysis
 *     expected value, discounted at a declared rate (default 0). This is the
 *     Smith (1996) MAD framing, and it is stated on screen: these are not
 *     tradable prices and must never be read as market values.
 *  4. **Carry cost entered as a cash outflow, never as drift.** Putting the
 *     delay price into the drift *and* charging it would double count the Cost
 *     of Waiting arithmetic; the drift carries only the leader's declared
 *     growth. The module prints both so the two never silently merge.
 *  5. **Volatility from the leader's own record.** σ is not typed in from
 *     nowhere: it is the robust log-scale spread (1.4826 × MAD, Rousseeuw &
 *     Croux 1993) of this workspace's realised ÷ assessed magnitudes — settled
 *     case exposure ratios and delivered plan effort ratios — annualised by
 *     root-time scaling, with the median observed horizon printed. Below the
 *     observation floor it refuses and offers an explicit declaration instead.
 *  6. **Break-even inversion.** The carry price at which waiting stops paying,
 *     and the volatility below which it never pays, solved by bisection on the
 *     same tree. That is the number the Cost of Waiting's declared price is
 *     compared against, and it is printed beside it.
 *
 * HARD HONESTY BOUNDARIES
 * -----------------------
 *  - Money is never summed across currencies; one frame is one currency.
 *  - An unpriced value at stake refuses the option model. A missing number is
 *    never zero, and the class weekly price alone does not reveal the stake.
 *  - σ below the floor is withheld, not defaulted; a declared σ is labelled as
 *    declared and carries the leader's own words, not a derived provenance.
 *  - GBM with constant σ is a model, not a forecast of the future. No jumps,
 *    no stochastic volatility, no learning-by-waiting (that is EVSI, a
 *    different module), no assumption that the world is a traded market.
 *  - No person is scored, no message is sent, no option is chosen.
 *
 * Pure module: no DOM, no storage, no network, no Math.random, no wall clock
 * (callers pass `now`). Deterministic.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import { caseCostPairs, estimatePairs } from './calibration.js';
import { decisionValueTerms, derivedRatePerWeek } from './decisionTempo.js';

export const DEFERRAL_ENGINE_VERSION = 'deferral-option-2026.10-v1';

export const DEFERRAL_DEFAULTS = Object.freeze({
  deferralAutoPropagate: true,
  deferralMinObservations: 5,
  deferralSigmaFloorPct: 5,
  deferralSteps: 200,
  deferralDiscountPct: 0,
  deferralMaxHorizonDays: 180,
  deferralWatchBandPct: 10,
  deferralMaterialityPct: 1,
  deferralReviewCap: 40,
});

export const DEFERRAL_SIGNAL_IDS = Object.freeze({
  DUE: 'DRO-01',
  TRIGGERED: 'DRO-02',
  EXPIRED: 'DRO-03',
  BASELINE: 'DRO-04',
});

export const DEFERRAL_RULE_IDS = Object.freeze({
  FROZEN: 'RULE-DRO-01',
  SCAN: 'RULE-DRO-02',
  GRADE: 'RULE-DRO-03',
});

export const DEFERRAL_EVENTS = Object.freeze({
  FROZEN: 'deferral.frozen',
  SCAN: 'deferral.scan',
  GRADED: 'deferral.graded',
});

const DAY_MS = 86400000;
const YEAR_DAYS = 365;
const MAX_STEPS = 400;
const MIN_STEPS = 20;
const VERDICTS = Object.freeze(['commit-now', 'wait', 'indifferent', 'act-or-drop', 'withheld']);

/* ------------------------------------------------------------------ */
/* 0. Conventions                                                      */
/* ------------------------------------------------------------------ */

export function deferralConventions(settings = {}) {
  const s = { ...DEFERRAL_DEFAULTS, ...(settings || {}) };
  const num = (value, lo, hi, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  return {
    autoPropagate: s.deferralAutoPropagate !== false,
    minObservations: Math.round(num(s.deferralMinObservations, 2, 50, 5)),
    sigmaFloor: num(s.deferralSigmaFloorPct, 1, 200, 5) / 100,
    steps: Math.round(num(s.deferralSteps, MIN_STEPS, MAX_STEPS, 200)),
    discountRate: num(s.deferralDiscountPct, 0, 30, 0) / 100,
    maxHorizonDays: Math.round(num(s.deferralMaxHorizonDays, 7, 730, 180)),
    watchBand: num(s.deferralWatchBandPct, 0, 50, 10) / 100,
    materiality: num(s.deferralMaterialityPct, 0.1, 25, 1) / 100,
    reviewCap: Math.round(num(s.deferralReviewCap, 5, 40, 40)),
  };
}

/* ------------------------------------------------------------------ */
/* 1. Numerical primitives                                             */
/* ------------------------------------------------------------------ */

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 1.5e-7). */
export function normalCdf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * z);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return x >= 0 ? 1 - upper : upper;
}

export function normalPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black–Scholes–Merton European call (1973). Exported as the validation anchor
 * for the binomial tree, not used to price a leadership decision.
 */
export function blackScholesCall({ spot, strike, rate = 0, sigma, years }) {
  if (!(spot > 0) || !(strike > 0) || !(sigma > 0) || !(years > 0)) return null;
  const vol = sigma * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (sigma * sigma) / 2) * years) / vol;
  const d2 = d1 - vol;
  return spot * normalCdf(d1) - strike * Math.exp(-rate * years) * normalCdf(d2);
}

function latticeParams({ sigma, horizonDays, drift = 0, discountRate = 0, steps = 200 }) {
  const n = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.round(steps)));
  // Per-STEP time in years. Cox–Ross–Rubinstein scales the up/down factors by
  // the square root of the step, not of the whole horizon.
  const dt = Math.max(1e-6, horizonDays / YEAR_DAYS) / n;
  const volStep = sigma * Math.sqrt(dt);
  const u = Math.exp(volStep);
  const d = 1 / u;
  const growth = Math.exp(drift * dt);
  const denom = u - d;
  if (!(denom > 1e-12)) return null;
  const p = (growth - d) / denom;
  if (!(p >= -1e-9 && p <= 1 + 1e-9)) return null;
  return { n, dt, u, d, p: Math.min(1, Math.max(0, p)), disc: Math.exp(-discountRate * dt) };
}

/**
 * European call on the same CRR tree. Used only to prove the tree is correct
 * against the closed form; a leadership frame is never priced with it.
 */
export function europeanCallCRR({ spot, strike, rate = 0, sigma, years, steps = 200 }) {
  const pars = latticeParams({ sigma, horizonDays: years * YEAR_DAYS, drift: rate, discountRate: rate, steps });
  if (!pars || !(spot > 0) || !(strike >= 0)) return null;
  const { n, u, d, p, disc } = pars;
  let values = [];
  for (let i = 0; i <= n; i += 1) {
    const terminal = spot * u ** i * d ** (n - i);
    values.push(Math.max(terminal - strike, 0));
  }
  for (let step = n - 1; step >= 0; step -= 1) {
    const next = [];
    for (let i = 0; i <= step; i += 1) {
      next.push(disc * (p * values[i + 1] + (1 - p) * values[i]));
    }
    values = next;
  }
  return values[0];
}

/**
 * The American deferral option.
 *
 * At every node the leader may (a) commit now and take `max(V − K, 0)`,
 * (b) keep waiting and pay the weekly carry rate `c` for the right to commit
 * later, or (c) let the window expire worthless. The lattice solves that
 * stopping problem by backward induction and then walks the real-world
 * probability measure forward to answer the two questions a leader actually
 * asks: *when would I commit?* and *how likely am I to commit before the
 * window closes?*
 *
 * @returns a bounded result object, never throws, never guesses.
 */
export function americanCommitOption({
  valueNow,
  commitCost,
  carryPerWeek = 0,
  sigma,
  horizonDays,
  drift = 0,
  discountRate = 0,
  steps = 200,
} = {}) {
  const V0 = Number(valueNow);
  const K = Number(commitCost);
  const hazard = Number(carryPerWeek);
  const vol = Number(sigma);
  const horizon = Number(horizonDays);
  if (!(V0 > 0)) return { ok: false, reason: 'No positive value at stake; the option has nothing to be written on.', code: 'no-value' };
  if (!(vol >= 0) || !Number.isFinite(vol)) return { ok: false, reason: 'A negative or non-numeric volatility cannot price an option; declare σ ≥ 0.', code: 'no-sigma' };
  if (!(horizon > 0)) return { ok: false, reason: 'The deferral window is empty.', code: 'no-window' };
  if (!Number.isFinite(K) || K < 0) return { ok: false, reason: 'The commitment cost must be a finite, non-negative amount.', code: 'bad-cost' };
  if (!(hazard >= 0) || !Number.isFinite(hazard)) return { ok: false, reason: 'A negative carry would make waiting a source of income; the delay price must be zero or positive.', code: 'bad-carry' };

  // The deterministic limit. σ = 0 is a legitimate input — a leader may declare
  // that the value cannot move — and it must produce the exact, checkable
  // answer rather than a degenerate lattice.
  if (vol === 0) {
    const years = horizon / YEAR_DAYS;
    const disc = Math.exp(-discountRate * years);
    const future = Math.max(V0 * Math.exp(drift * years) - K, 0) * disc - hazard * (horizon / 7) * disc;
    const nowValue = Math.max(V0 - K, 0);
    const waitValue = Math.max(nowValue, future, 0);
    return {
      ok: true,
      deterministic: true,
      steps: 0,
      stepDays: horizon,
      up: 1,
      down: 1,
      probabilityUp: 1,
      discountPerStep: disc,
      carryPerStep: round(hazard * (horizon / 7), 4),
      waitValue: round(waitValue, 2),
      commitNow: round(nowValue, 2),
      premium: round(waitValue - nowValue, 2),
      immediateExercise: nowValue >= future,
      thresholdNow: nowValue > 0 ? round(K, 2) : null,
      thresholdDay: 0,
      boundary: [{ step: 0, day: 0, commitThreshold: nowValue > 0 ? round(K, 2) : null, abandonThreshold: null }],
      exerciseProbability: nowValue >= future ? 1 : 0,
      exerciseProbabilityPct: nowValue >= future ? 100 : 0,
      commitProbability: nowValue >= future ? 1 : 0,
      commitProbabilityPct: nowValue >= future ? 100 : 0,
      expectedWaitDays: 0,
      abandonProbability: nowValue >= future ? 0 : 1,
      carryOverExpectedWait: 0,
    };
  }

  const pars = latticeParams({ sigma: vol, horizonDays: horizon, drift, discountRate, steps });
  if (!pars) return { ok: false, reason: 'The lattice parameters are degenerate for this drift and volatility.', code: 'bad-lattice' };
  const { n, dt, u, d, p, disc } = pars;
  const stepDays = horizon / n;
  const carryPerStep = hazard * (dt * YEAR_DAYS / 7);

  // Payoff grid at expiry, then backward induction with the carry outflow.
  const exercise = [];
  let values = [];
  for (let i = 0; i <= n; i += 1) {
    const nodeValue = V0 * u ** i * d ** (n - i);
    values.push(Math.max(nodeValue - K, 0));
  }
  for (let step = n - 1; step >= 0; step -= 1) {
    const next = [];
    const flag = [];
    for (let i = 0; i <= step; i += 1) {
      const nodeValue = V0 * u ** i * d ** (step - i);
      const continuation = disc * (p * values[i + 1] + (1 - p) * values[i]) - carryPerStep;
      const immediate = Math.max(nodeValue - K, 0);
      const hold = immediate > continuation;
      next.push(hold ? immediate : Math.max(continuation, 0));
      flag.push(hold);
    }
    values = next;
    exercise[step] = flag;
  }

  const commitNow = Math.max(V0 - K, 0);
  const waitValue = values[0];
  const premium = waitValue - commitNow;
  const immediateExercise = Boolean(exercise[0] && exercise[0][0]);

  // The exercise boundary at each step: the lowest node value at which the
  // optimal policy commits (rather than abandons or waits). A node below K is
  // a *walk-away* threshold, not a commit threshold, and the two are reported
  // separately so a leader is never told to commit into a negative payoff.
  const boundary = [];
  for (let step = 0; step <= n; step += 1) {
    const flag = exercise[step] || [];
    let commitThreshold = null;
    let abandonThreshold = null;
    for (let i = 0; i < flag.length; i += 1) {
      if (!flag[i]) continue;
      const nodeValue = V0 * u ** i * d ** (step - i);
      if (nodeValue > K) {
        if (commitThreshold === null) commitThreshold = round(nodeValue, 2);
      } else if (abandonThreshold === null) {
        abandonThreshold = round(nodeValue, 2);
      }
    }
    boundary.push({ step, day: round(step * stepDays, 2), commitThreshold, abandonThreshold });
  }

  // Forward walk under the real-world measure, following the optimal policy.
  // Committing and abandoning are both "exercise", but only committing is a
  // commitment. The two are counted separately; conflating them would report a
  // 100% "commit probability" for a policy that abandons at the first step.
  let prob = [1];
  let commitProbability = 0;
  let abandonProbability = 0;
  let commitDaysSum = 0;
  let carryExpected = 0;
  for (let step = 0; step < n; step += 1) {
    const next = new Array(step + 2).fill(0);
    for (let i = 0; i <= step; i += 1) {
      const mass = prob[i];
      if (!(mass > 0)) continue;
      if (exercise[step][i]) {
        const nodeValue = V0 * u ** i * d ** (step - i);
        carryExpected += mass * (step * stepDays / 7) * hazard;
        if (nodeValue > K) {
          commitProbability += mass;
          commitDaysSum += mass * step * stepDays;
        } else {
          abandonProbability += mass;
        }
        continue;
      }
      carryExpected += mass * (stepDays / 7) * hazard;
      next[i + 1] += mass * p;
      next[i] += mass * (1 - p);
    }
    prob = next;
  }
  // Terminal nodes: the window expires. If committing at expiry is optimal the
  // call is exercised then; otherwise it lapses and the stake is abandoned.
  for (let i = 0; i <= n; i += 1) {
    const mass = prob[i];
    if (!(mass > 0)) continue;
    const nodeValue = V0 * u ** i * d ** (n - i);
    if (nodeValue > K) {
      commitProbability += mass;
      commitDaysSum += mass * horizon;
    } else {
      abandonProbability += mass;
    }
  }
  const expectedWait = commitProbability > 0.0001 ? commitDaysSum / commitProbability : null;

  const deterministic = hazard <= 0 && (vol <= 1e-9 || drift <= -vol * vol / 2);

  return {
    ok: true,
    steps: n,
    stepDays: round(stepDays, 4),
    up: round(u, 6),
    down: round(d, 6),
    probabilityUp: round(p, 6),
    discountPerStep: round(disc, 8),
    carryPerStep: round(carryPerStep, 4),
    waitValue: round(waitValue, 2),
    commitNow: round(commitNow, 2),
    premium: round(premium, 2),
    immediateExercise,
    thresholdNow: boundary[0]?.commitThreshold
      ?? boundary.find((row) => row.commitThreshold !== null)?.commitThreshold
      ?? null,
    thresholdDay: boundary[0]?.commitThreshold !== null && boundary[0]?.commitThreshold !== undefined
      ? 0
      : (boundary.find((row) => row.commitThreshold !== null)?.day ?? null),
    boundary,
    // `exerciseProbability` is the probability the optimal policy *commits*
    // before the window closes. Abandoning is not a commitment, so the two are
    // counted separately; the alias keeps the historic field name honest.
    exerciseProbability: round(commitProbability, 4),
    exerciseProbabilityPct: round(commitProbability * 100, 1),
    commitProbability: round(commitProbability, 4),
    commitProbabilityPct: round(commitProbability * 100, 1),
    expectedWaitDays: expectedWait === null ? null : round(expectedWait, 1),
    abandonProbability: round(abandonProbability, 4),
    carryOverExpectedWait: round(carryExpected, 2),
    deterministic,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Volatility from the leader’s own record                          */
/* ------------------------------------------------------------------ */

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * σ from realised ÷ assessed magnitudes. Two independent families, both already
 * in the workspace: settled case exposure and delivered plan effort. The
 * estimator is the robust log-scale dispersion (1.4826 × MAD), annualised by
 * root-time scaling from the median observed horizon. A ratio distribution is
 * assumed to be a scale mixture lognormal — an assumption, printed, not tested.
 *
 * The floor is applied here, not by the caller: a σ below the floor is
 * *withheld*, with `belowFloor: true` and no usable number, because a premium
 * computed from it would be indistinguishable from rounding. Each family is
 * reported separately so a leader can see which half of the record the
 * estimate actually rests on.
 */
export function deriveVolatility(state = {}, conventions = deferralConventions({}), now = new Date()) {
  const families = [];
  const gather = (key, label, pairs, ratioOf, horizonOf) => {
    const samples = [];
    for (const pair of pairs) {
      const ratio = Number(ratioOf(pair));
      if (!(ratio > 0) || !Number.isFinite(ratio)) continue;
      samples.push({ ratio, days: Math.max(1, Number(horizonOf(pair)) || 1) });
    }
    const logs = samples.map((row) => Math.log(row.ratio));
    const centre = logs.length ? median(logs) : null;
    const mad = logs.length ? median(logs.map((value) => Math.abs(value - centre))) : null;
    const spread = mad === null ? null : 1.4826 * mad;
    families.push({
      key,
      label,
      observations: samples.length,
      medianRatio: centre === null ? null : round(Math.exp(centre), 4),
      spread: spread === null ? null : round(spread, 4),
      available: samples.length > 0 && spread !== null && spread > 0,
      samples,
    });
    return samples;
  };

  const caseSamples = gather('case-exposure', 'settled case exposure ÷ assessed',
    caseCostPairs(state),
    (pair) => pair.exposureRatio,
    (pair) => {
      const opened = pair.openedOn ? new Date(`${pair.openedOn}T00:00:00Z`) : null;
      const settled = pair.settledOn ? new Date(`${pair.settledOn}T00:00:00Z`) : null;
      return opened && settled ? Math.round((settled - opened) / DAY_MS) : 30;
    });
  const planSamples = gather('plan-effort', 'delivered effort ÷ assessed',
    estimatePairs(state),
    (pair) => pair.ratio,
    (pair) => Number(pair.expected) || Number(pair.actual) || 1);

  const samples = [...caseSamples, ...planSamples];
  const minObs = Math.max(2, conventions.minObservations);
  const familyView = families.map(({ samples: _samples, ...rest }) => rest);
  const logs = samples.map((row) => Math.log(row.ratio));
  const centre = samples.length ? median(logs) : null;
  const mad = samples.length ? median(logs.map((value) => Math.abs(value - centre))) : null;
  const sigmaLog = mad === null ? null : 1.4826 * mad;
  const horizons = samples.map((row) => row.days).filter((d) => d > 0);
  const medianHorizon = horizons.length ? median(horizons) : null;
  const annualised = sigmaLog !== null && medianHorizon
    ? sigmaLog * Math.sqrt(YEAR_DAYS / Math.min(3650, Math.max(1, medianHorizon)))
    : null;
  const base = {
    available: false,
    sigma: null,
    sigmaLog: sigmaLog === null ? null : round(sigmaLog, 4),
    observations: samples.length,
    n: samples.length,
    needed: minObs,
    medianHorizonDays: medianHorizon === null ? null : round(medianHorizon, 1),
    floor: conventions.sigmaFloor,
    families: familyView,
    method: '1.4826 × MAD of log(realised ÷ assessed), root-time annualised: σ_annual = spread × √(365 ÷ median horizon days)',
    caution: 'A ratio distribution is treated as a scale mixture lognormal. That is an assumption of the estimator, not a finding about your work.',
  };
  if (samples.length < minObs) {
    return {
      ...base,
      belowFloor: false,
      reason: `Volatility is withheld: only ${samples.length} settled realised ÷ assessed observation(s) exist and the estimator needs ${minObs}. Declare a σ explicitly if you want a frame, and label it as declared.`,
    };
  }
  if (!(sigmaLog > 0) || annualised === null) {
    return {
      ...base,
      belowFloor: false,
      reason: 'Volatility is withheld: every settled ratio is identical, so the robust dispersion is zero. A zero-volatility world makes waiting worthless — that is a claim about your record, not a measurement of one.',
    };
  }
  if (annualised < conventions.sigmaFloor) {
    return {
      ...base,
      belowFloor: true,
      sigma: round(annualised, 4),
      reason: `Volatility is withheld: the derived σ of ${(annualised * 100).toFixed(1)}% is below the declared ${(conventions.sigmaFloor * 100).toFixed(0)}% floor, so any premium would be noise.`,
    };
  }
  return {
    ...base,
    available: true,
    belowFloor: false,
    sigma: round(annualised, 4),
    reason: null,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Candidates and frames                                            */
/* ------------------------------------------------------------------ */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isOpenDecision(decision) {
  if (!decision || typeof decision !== 'object') return false;
  const status = String(decision.status || 'open');
  if (status !== 'open') return false;
  if (decision.chosen || decision.decidedOn) return false;
  return Boolean(decision.id);
}

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Open decisions the terminal can price, expressed in the workspace's own
 * money. A decision whose only price is a declared class price has no value at
 * stake and cannot be option-priced: the weekly price of waiting does not
 * reveal the size of the thing being waited for.
 */
/**
 * The money this decision has already committed, taken from budget lines that
 * point at it. That is the closest thing the workspace has to an exercise
 * price: it is what a commitment sinks, and unlike the value at stake it is
 * never inferred. Returns null when nothing is recorded — never 0-by-default,
 * because "no commitment recorded" and "committing costs nothing" are
 * different claims.
 */
export function committedCostFor(state = {}, decisionId) {
  const totals = new Map();
  for (const budget of asArray(state.budgets)) {
    const currency = String(budget?.currency || 'USD').toUpperCase();
    for (const line of asArray(budget.lines)) {
      if (line.sourceType !== 'decision' || line.sourceId !== decisionId) continue;
      const amount = Number(line.committedAmount ?? line.actualAmount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      totals.set(currency, round((totals.get(currency) || 0) + amount, 2));
    }
  }
  if (!totals.size) return null;
  const [currency, amount] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  return { currency, amount };
}

export function deferralCandidates(state = {}, now = new Date(), settings = {}) {
  const conventions = deferralConventions(settings);
  const today = dayKey(now);
  const rows = [];
  for (const decision of asArray(state.decisions)) {
    if (!isOpenDecision(decision)) continue;
    const terms = decisionValueTerms(state, decision);
    if (!terms.priced || !terms.dominant) continue;
    const currency = terms.dominant.currency;
    const valueNow = round(terms.dominant.amount, 2);
    const deadline = validDay(decision.reviewOn);
    const horizonDays = deadline ? Math.max(0, daysBetween(today, deadline)) : null;
    rows.push({
      decision,
      id: decision.id,
      title: decision.title || decision.question || 'Untitled decision',
      currency,
      valueNow,
      carryPerWeek: derivedRatePerWeek(valueNow, 12),
      reversibility: decision.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
      deadline,
      horizonDays,
      ageDays: decision.date ? Math.max(0, daysBetween(decision.date, today)) : null,
      valueBasis: `${currency} ${valueNow.toFixed(2)} at stake across ${terms.termCount} typed value term(s)`,
      recordedCommit: committedCostFor(state, decision.id),
      otherCurrencies: terms.otherCurrencies.map((t) => t.currency),
    });
  }
  rows.sort((a, b) => b.valueNow - a.valueNow || a.title.localeCompare(b.title));
  return rows.map((row) => ({ ...row, horizonCapped: row.horizonDays !== null && row.horizonDays > conventions.maxHorizonDays }));
}

/**
 * The commitment cost convention. A reversible call can be undone, so the
 * money that is genuinely sunk is small; an irreversible call can sink the
 * stake. The leader may override either with a recorded number, and the frame
 * prints which basis it used.
 */
export function commitCostBasis(candidate, override = null) {
  const declared = override === null || override === undefined || override === ''
    ? null
    : Number(override);
  if (declared !== null && Number.isFinite(declared) && declared >= 0) {
    return { amount: round(declared, 2), basis: 'declared commitment cost' };
  }
  // Reversibility decides the convention before money does: a call the leader
  // can undo sinks nothing, whatever is committed on paper, so its option is
  // worth zero and the module says to decide it.
  if (candidate.reversibility === 'reversible') {
    return {
      amount: 0,
      basis: 'recorded as reversible, so committing sinks nothing; a reversible call has almost no option value — decide now',
    };
  }
  const recorded = candidate.recordedCommit && candidate.recordedCommit.currency === candidate.currency
    ? Number(candidate.recordedCommit.amount)
    : null;
  if (recorded !== null && Number.isFinite(recorded) && recorded > 0) {
    return {
      amount: round(recorded, 2),
      basis: `recorded as ${candidate.reversibility}; budget lines pointed at this call already commit ${candidate.currency} ${round(recorded, 2)}, and that is the money an irreversible commitment sinks`,
    };
  }
  return {
    amount: round(candidate.valueNow, 2),
    basis: 'recorded as irreversible with no committed budget line, so the full stake at risk is treated as sunk; override with the real reversal cost if it is smaller',
  };
}

function breakEvenCarry(base, ceiling) {
  if (!(base.premium > 0)) return null;
  let lo = 0;
  let hi = Math.max(1, ceiling);
  if (base.waitValue <= base.commitNow) return 0;
  for (let iter = 0; iter < 40; iter += 1) {
    const mid = (lo + hi) / 2;
    const trial = americanCommitOption({ ...base.args, carryPerWeek: mid });
    if (!trial.ok) return null;
    if (trial.premium > 0) lo = mid; else hi = mid;
  }
  return round(lo, 2);
}

function breakEvenSigma(base, upper = 3) {
  let lo = 0;
  let hi = upper;
  const atZero = americanCommitOption({ ...base.args, sigma: 0 });
  if (!atZero.ok || atZero.premium > 0) return atZero.ok && atZero.premium > 0 ? 0 : null;
  const atTop = americanCommitOption({ ...base.args, sigma: hi });
  if (!atTop.ok || atTop.premium <= 0) return null;
  for (let iter = 0; iter < 60; iter += 1) {
    const mid = (lo + hi) / 2;
    const trial = americanCommitOption({ ...base.args, sigma: mid });
    if (!trial.ok) return null;
    if (trial.premium > 0) hi = mid; else lo = mid;
  }
  return round(hi, 4);
}

/**
 * Assemble one decision's deferral frame: money, cost, carry, volatility,
 * window, and the lattice result plus its break-evens. Every refusal returns a
 * frame with `refusal` set and no numbers, so the UI never prints a figure the
 * inputs do not support.
 */
export function buildDeferralFrame(state, candidate, now = new Date(), settings = {}, overrides = {}) {
  const conventions = deferralConventions(settings);
  const today = dayKey(now);
  const volatility = deriveVolatility(state, conventions, now);
  const declaredSigma = overrides.sigma === null || overrides.sigma === undefined || overrides.sigma === ''
    ? NaN
    : Number(overrides.sigma);
  const sigma = Number.isFinite(declaredSigma) && declaredSigma > 0
    ? round(declaredSigma, 4)
    : volatility.sigma;
  const sigmaSource = Number.isFinite(declaredSigma) && declaredSigma > 0
    ? 'declared'
    : volatility.available ? 'derived' : 'withheld';
  const commit = commitCostBasis(candidate, overrides.commitCost);
  const declaredCarry = overrides.carryPerWeek === null || overrides.carryPerWeek === undefined || overrides.carryPerWeek === ''
    ? null
    : Number(overrides.carryPerWeek);
  const carryPerWeek = declaredCarry !== null && Number.isFinite(declaredCarry) && declaredCarry >= 0
    ? round(declaredCarry, 2)
    : candidate.carryPerWeek;
  const horizonDays = Number.isFinite(Number(overrides.horizonDays))
    ? Math.round(Math.min(conventions.maxHorizonDays, Math.max(1, Number(overrides.horizonDays))))
    : Math.min(conventions.maxHorizonDays, Math.max(1, candidate.horizonDays || conventions.maxHorizonDays));
  const deadline = overrides.deadline && validDay(overrides.deadline)
    ? overrides.deadline
    : dayKey(addDays(now, horizonDays));
  const drift = Number.isFinite(Number(overrides.drift)) ? Math.min(1, Math.max(-1, Number(overrides.drift))) : 0;

  const frame = {
    decisionId: candidate.id,
    title: candidate.title,
    currency: candidate.currency,
    valueNow: candidate.valueNow,
    valueBasis: candidate.valueBasis,
    carryPerWeek,
    carryBasis: declaredCarry !== null && Number.isFinite(declaredCarry) && declaredCarry >= 0
      ? `${candidate.currency} ${round(declaredCarry, 2)}/week — declared for this frame, not the Cost of Waiting derivation`
      : `${candidate.currency} ${candidate.carryPerWeek.toFixed(2)}/week — the same linear cost-of-delay rate the Cost of Waiting terminal derives (stake ÷ 12-week erosion window)`,
    commitCost: commit.amount,
    commitBasis: commit.basis,
    reversibility: candidate.reversibility,
    sigma,
    sigmaSource,
    sigmaFloor: conventions.sigmaFloor,
    volatility,
    horizonDays,
    deadline,
    drift,
    discountRate: conventions.discountRate,
    steps: conventions.steps,
    today,
    watchBand: conventions.watchBand,
    materiality: conventions.materiality,
    refusal: null,
    option: null,
    verdict: null,
    breakEven: { carryPerWeek: null, sigma: null },
  };

  if (sigmaSource === 'withheld' || !(sigma > 0)) {
    frame.refusal = volatility.reason || 'Volatility is withheld; an option premium without a volatility would be an invented number.';
    frame.verdict = verdictOf(frame);
    return frame;
  }
  // The floor polices the *derived* estimator, not the leader. A declared σ is
  // an assumption with a name on it; it is labelled `declared` on screen and in
  // the frozen record, and refusing it would silently override the leader.
  if (sigmaSource === 'derived' && sigma < conventions.sigmaFloor) {
    frame.refusal = `Derived volatility ${(sigma * 100).toFixed(1)}% is below the ${(conventions.sigmaFloor * 100).toFixed(0)}% floor; the premium would be indistinguishable from rounding.`;
    frame.verdict = verdictOf(frame);
    return frame;
  }
  if (!(candidate.valueNow > 0)) {
    frame.refusal = 'This decision has no priced value at stake, so there is nothing to model. Unpriced is not zero.';
    frame.verdict = verdictOf(frame);
    return frame;
  }

  const option = americanCommitOption({
    valueNow: candidate.valueNow,
    commitCost: commit.amount,
    carryPerWeek,
    sigma,
    horizonDays,
    drift,
    discountRate: conventions.discountRate,
    steps: conventions.steps,
  });
  if (!option.ok) {
    frame.refusal = option.reason;
    frame.verdict = verdictOf(frame);
    return frame;
  }
  frame.option = option;
  frame.breakEven.carryPerWeek = breakEvenCarry({
    premium: option.premium,
    waitValue: option.waitValue,
    commitNow: option.commitNow,
    args: {
      valueNow: candidate.valueNow,
      commitCost: commit.amount,
      sigma,
      horizonDays,
      drift,
      discountRate: conventions.discountRate,
      steps: Math.min(conventions.steps, 120),
    },
  }, Math.max(1, candidate.carryPerWeek * 20));
  frame.breakEven.sigma = breakEvenSigma({
    premium: option.premium,
    waitValue: option.waitValue,
    commitNow: option.commitNow,
    args: {
      valueNow: candidate.valueNow,
      commitCost: commit.amount,
      carryPerWeek: candidate.carryPerWeek,
      horizonDays,
      drift,
      discountRate: conventions.discountRate,
      steps: Math.min(conventions.steps, 120),
    },
  });
  frame.verdict = verdictOf(frame);
  return frame;
}

/**
 * The recommendation is the exercise decision at the root of the tree, not a
 * score. `wait` means the optimal policy is to hold the option today; the
 * premium is what that policy is worth over committing immediately.
 */
export function verdictOf(frame) {
  if (!frame || frame.refusal || !frame.option) {
    return {
      id: 'withheld',
      label: 'Withheld',
      headline: frame?.refusal || 'The frame has no supportable inputs.',
      detail: 'Nothing is printed rather than a guessed premium. Supply the missing input or declare the assumption explicitly.',
    };
  }
  const option = frame.option;
  const threshold = option.thresholdNow;
  const premium = option.premium;
  const money = (amount) => `${frame.currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const materiality = (frame.materiality ?? 0.01) * frame.valueNow;
  if (!option.immediateExercise && premium > 0 && premium < materiality) {
    return {
      id: 'indifferent',
      label: 'Indifferent',
      headline: `Waiting is worth ${money(premium)} — under the ${(((frame.materiality ?? 0.01)) * 100).toFixed(1)}% materiality floor of ${money(materiality)}.`,
      detail: `A premium below the floor is not a reason to postpone a call. The cost of holding this decision open — the attention, the carry at ${money(frame.carryPerWeek)}/week and the risk that the window closes first — is larger than the modelled flexibility. Decide it, and spend the option premium on something that clears its own cost.`,
    };
  }
  if (!option.immediateExercise && premium >= 0.01) {
    return {
      id: 'wait',
      label: 'Waiting pays',
      headline: `Holding the option is worth ${money(premium)} over committing today.`,
      detail: `${threshold !== null ? `Commit when the stake reaches ${money(threshold)}. ` : ''}The tree expects the policy to commit ${option.commitProbabilityPct}% of the time before ${frame.deadline} — abandoning on the rest — with a mean ${option.expectedWaitDays === null ? '—' : `${option.expectedWaitDays} day(s)`} of waiting before that commit, and ${money(option.carryOverExpectedWait)} of carry paid along the way. This is not a licence to delay indefinitely — the window expires on ${frame.deadline}.`,
    };
  }
  if (frame.valueNow > frame.commitCost) {
    return {
      id: 'commit-now',
      label: 'Decide now',
      headline: `Commit now — the stake (${money(frame.valueNow)}) is at or above the exercise boundary${threshold === null ? '' : ` (${money(threshold)})`}.`,
      detail: `Waiting is worth ${money(premium)} against a carry cost of ${money(frame.carryPerWeek)}/week. The option is already in the money: postponing past this point is a decision to keep paying the carry cost for flexibility you are not using.`,
    };
  }
  return {
    id: 'act-or-drop',
    label: 'Act or drop',
    headline: 'At today’s stake, committing does not clear its own cost — waiting only buys the chance the value rises.',
    detail: `The exercise boundary is ${threshold === null ? 'above the tested range' : money(threshold)}; the stake is ${money(frame.valueNow)} against a commitment cost of ${money(frame.commitCost)}. The option premium (${money(premium)}) is what patience is worth here; the carry cost is ${money(frame.carryPerWeek)}/week. Re-scope the call, or close it deliberately rather than letting the window lapse.`,
  };
}

/* ------------------------------------------------------------------ */
/* 4. The report                                                       */
/* ------------------------------------------------------------------ */

export function deferralReport(state = {}, now = new Date(), settings = {}, focusId = null, overrides = {}) {
  const conventions = deferralConventions(settings);
  const candidates = deferralCandidates(state, now, settings);
  const frames = candidates.map((candidate) => buildDeferralFrame(state, candidate, now, settings));
  const live = frames.filter((f) => !f.refusal);
  const chosen = (focusId && frames.find((f) => f.decisionId === focusId))
    || live[0]
    || frames[0]
    || null;
  // What-if inputs apply to the focused frame only: changing one call's
  // declared carry or commitment cost must not silently rewrite every other
  // frame in the list.
  const hasOverrides = overrides && Object.values(overrides).some((value) => value !== null && value !== undefined && value !== '');
  const selected = chosen && hasOverrides
    ? buildDeferralFrame(state, candidates.find((c) => c.id === chosen.decisionId), now, settings, overrides)
    : chosen;
  const records = (Array.isArray(state.deferralFrames) ? state.deferralFrames : [])
    .slice()
    .sort((a, b) => String(b.frozenAt || '').localeCompare(String(a.frozenAt || '')));
  return {
    today: dayKey(now),
    conventions,
    candidates: frames,
    focusId: selected?.decisionId || null,
    focused: selected,
    overrides: hasOverrides ? { ...overrides } : {},
    frames: live,
    withheld: frames.filter((f) => f.refusal),
    records,
    counts: {
      open: frames.length,
      priced: live.length,
      withheld: frames.length - live.length,
      wait: live.filter((f) => f.verdict.id === 'wait').length,
      commitNow: live.filter((f) => f.verdict.id === 'commit-now').length,
      frozen: records.length,
      due: records.filter((r) => !r.graded && r.reviewOn <= dayKey(now)).length,
    },
    calibration: deferralCalibration(state),
  };
}

/** Freeze one frame. Bounded, identity-free, no titles or notes. */
export function buildDeferralRecord(frame, now = new Date(), id) {
  if (!frame || frame.refusal || !frame.option) {
    return { ok: false, reason: frame?.refusal || 'A frame with no supportable option cannot be frozen.' };
  }
  return {
    ok: true,
    record: {
      id,
      decisionId: frame.decisionId,
      frozenAt: now.toISOString(),
      reviewOn: frame.deadline,
      horizonDays: frame.horizonDays,
      currency: frame.currency,
      valueNow: frame.valueNow,
      commitCost: frame.commitCost,
      carryPerWeek: frame.carryPerWeek,
      sigma: frame.sigma,
      sigmaSource: frame.sigmaSource,
      drift: frame.drift,
      verdict: frame.verdict.id,
      premium: frame.option.premium,
      waitValue: frame.option.waitValue,
      commitNow: frame.option.commitNow,
      threshold: frame.option.thresholdNow,
      expectedWaitDays: frame.option.expectedWaitDays,
      predictedCommitByDeadlinePct: frame.option.commitProbabilityPct,
      graded: null,
    },
  };
}

/**
 * Grade one frozen frame exactly once, after its window has closed. The
 * outcome is the decision's *recorded* date: a decision chosen on or before
 * the review date commits inside the window; a decision with no recorded date
 * is ungradable rather than late.
 */
export function gradeDeferralRecord(record, state = {}, now = new Date()) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'No frozen frame to grade.' };
  if (record.graded) return { ok: false, reason: 'This frame has already been graded; a forecast is scored once.' };
  const today = dayKey(now);
  if (!record.reviewOn || record.reviewOn > today) {
    return { ok: false, reason: `Wait until the window closes on ${record.reviewOn || 'its review date'}; grading before then would score a forecast against an unfinished future.` };
  }
  const decision = (state.decisions || []).find((d) => d.id === record.decisionId);
  if (!decision) return { ok: false, reason: 'The decision this frame was frozen on is missing from the workspace, so its outcome cannot be read.' };
  if (decision.chosen && !decision.decidedOn) {
    return { ok: false, reason: 'There is no dated decision: it was recorded as chosen without a date, so whether it was committed inside the window cannot be established.' };
  }
  const decidedOn = validDay(decision.decidedOn);
  const committedByDeadline = Boolean(decision.chosen && decidedOn && decidedOn <= record.reviewOn);
  const probability = Math.min(1, Math.max(0, Number(record.predictedCommitByDeadlinePct) / 100 || 0));
  const brier = round((probability - (committedByDeadline ? 1 : 0)) ** 2, 4);
  return {
    ok: true,
    committedByDeadline,
    brier,
    grade: {
      gradedAt: now.toISOString(),
      committedByDeadline,
      decisionDate: decidedOn,
      brier,
    },
    outcome: committedByDeadline,
  };
}

/**
 * Calibration of every graded frame. Below five grades the module prints the
 * loss and refuses the skill claim, exactly like every other forecast family
 * in this workspace: a Brier score on three forecasts is an anecdote.
 */
export function deferralCalibration(state = {}) {
  const graded = (Array.isArray(state.deferralFrames) ? state.deferralFrames : [])
    .filter((row) => row && row.graded && Number.isFinite(Number(row.graded.brier)));
  const brierMean = graded.length ? round(graded.reduce((sum, row) => sum + Number(row.graded.brier), 0) / graded.length, 4) : null;
  const committed = graded.filter((row) => row.graded.committedByDeadline).length;
  const baseRate = graded.length ? round(committed / graded.length, 4) : null;
  const baselineBrier = graded.length ? round(baseRate * (1 - baseRate), 4) : null;
  const skill = graded.length >= 5 && baselineBrier > 0
    ? round(1 - brierMean / baselineBrier, 4)
    : null;
  return {
    graded: graded.length,
    required: 5,
    brier: brierMean,
    baseRate,
    baselineBrier,
    skill,
    verdict: graded.length < 5
      ? `Scored ${graded.length} of the 5 frames a skill claim requires; the loss is printed, the skill is refused.`
      : skill === null
        ? 'Every graded frame resolved the same way, so the base rate has no variance to beat.'
        : skill > 0
          ? `The frozen frames beat their own base rate by ${(skill * 100).toFixed(1)}%.`
          : `The frozen frames lost to their own base rate by ${(Math.abs(skill) * 100).toFixed(1)}%.`,
  };
}

/* ------------------------------------------------------------------ */
/* 5. Signals, attention and the brief                                 */
/* ------------------------------------------------------------------ */

export function deferralSignals(state = {}, now = new Date(), settings = {}) {
  // The nav badge is computed from the state alone, so fall back to the
  // workspace's own conventions rather than silently using the defaults: a
  // leader who raised the σ floor must see the frames that floor refuses.
  const effective = settings && Object.keys(settings).length ? settings : (state.settings || {});
  const report = deferralReport(state, now, effective);
  const findings = [];
  const today = dayKey(now);
  const records = report.records;
  const due = records.filter((r) => !r.graded && r.reviewOn && r.reviewOn <= today);
  if (due.length) {
    findings.push({
      ruleId: DEFERRAL_SIGNAL_IDS.DUE,
      domain: 'Deferral options',
      title: `${due.length} deferral frame${due.length === 1 ? '' : 's'} reached the review date`,
      detail: 'A frozen frame is a prediction with a date on it. Grading it now keeps the record honest; the module refuses to grade before the window closes and refuses a second grade.',
      severity: 3,
      confidence: 'high',
      evidence: due.slice(0, 5).map((r) => `Frame ${r.id} closed ${r.reviewOn}`),
      action: { label: 'Grade the frames', route: '#/deferral?panel=frozen' },
    });
  }

  const triggered = [];
  for (const record of records) {
    if (record.graded) continue;
    const frame = report.candidates.find((f) => f.decisionId === record.decisionId);
    if (!frame || frame.refusal) continue;
    if (record.threshold !== null && frame.valueNow >= record.threshold * (1 - frame.watchBand)) {
      triggered.push({ record, frame });
    }
  }
  if (triggered.length) {
    findings.push({
      ruleId: DEFERRAL_SIGNAL_IDS.TRIGGERED,
      domain: 'Deferral options',
      title: `${triggered.length} frozen wait crossed its own exercise boundary`,
      detail: 'The frame said "wait until the stake reaches this level". It has reached it. Re-read the call rather than letting the trigger pass: an option that is never exercised is just a delayed decision.',
      severity: 3,
      confidence: 'high',
      evidence: triggered.slice(0, 5).map(({ frame }) => `${frame.title} — stake ${frame.currency} ${frame.valueNow}`),
      action: { label: 'Review the triggered frames', route: '#/deferral?panel=frames' },
    });
  }

  const expired = [];
  for (const record of records) {
    if (record.graded || !record.reviewOn) continue;
    if (record.reviewOn > today) continue;
    const decision = (state.decisions || []).find((d) => d.id === record.decisionId);
    if (decision && decision.status === 'open' && !decision.chosen) expired.push(record);
  }
  if (expired.length) {
    findings.push({
      ruleId: DEFERRAL_SIGNAL_IDS.EXPIRED,
      domain: 'Deferral options',
      title: `${expired.length} deferral window${expired.length === 1 ? '' : 's'} expired with the decision still open`,
      detail: 'The horizon the leader chose has passed and no call was recorded. The option expired unused — that is a decision too, and it is worth knowing which one.',
      severity: 4,
      confidence: 'high',
      evidence: expired.slice(0, 5).map((r) => `Window closed ${r.reviewOn}`),
      action: { label: 'Close or re-open the calls', route: '#/deferral?panel=frozen' },
    });
  }

  const calibration = report.calibration;
  if (calibration.skill !== null && calibration.skill < 0) {
    findings.push({
      ruleId: DEFERRAL_SIGNAL_IDS.BASELINE,
      domain: 'Deferral options',
      title: 'The deferral forecasts trail their own base rate',
      detail: calibration.verdict,
      severity: 2,
      confidence: 'medium',
      evidence: [`Brier ${calibration.brier} vs base-rate ${calibration.baselineBrier} across ${calibration.graded} grade(s)`],
      action: { label: 'Read the calibration', route: '#/deferral?panel=method' },
    });
  }

  return findings;
}

export function deferralAttentionCount(state = {}, now = new Date(), settings = {}) {
  return deferralSignals(state, now, settings).filter((f) => f.severity >= 3).length;
}

/**
 * Identity-free board brief: it prints the focused verdict, its money, its
 * refusals, and the calibration state. No decision title, no owner, no note.
 */
export function deferralBrief(report, now = new Date()) {
  // Accepts either the report or one frame, so a caller cannot print an empty
  // brief by passing the object it just read.
  const frame = report?.focused ?? (report && report.decisionId ? report : null);
  const lines = [`DEFERRAL OPTIONS · ${dayKey(now)}`];
  if (!frame) {
    lines.push('No open decision carries a priced value at stake, so no option frame can be built. Unpriced is not free.');
    lines.push('Cross-module: the Cost of Waiting terminal prices the delay; this terminal prices the flexibility. They are different quantities and are never summed.');
    return lines.join('\n');
  }
  const money = (amount) => `${frame.currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (frame.refusal) {
    lines.push(`Refused: ${frame.refusal}`);
  } else {
    lines.push(`${frame.verdict.label.toUpperCase()} — ${frame.verdict.headline}`);
    lines.push(`Stake ${money(frame.valueNow)} · commitment cost ${money(frame.commitCost)} · carry ${money(frame.carryPerWeek)}/week · window closes ${frame.deadline}`);
    lines.push(`Volatility ${(frame.sigma * 100).toFixed(1)}% (${frame.sigmaSource}${frame.sigmaSource === 'derived' ? `, n=${frame.volatility.n}, median horizon ${frame.volatility.medianHorizonDays}d` : ''}) · lattice ${frame.option.steps} steps · discount ${(frame.discountRate * 100).toFixed(1)}%`);
    lines.push(`Option premium ${money(frame.option.premium)} · commit-now value ${money(frame.option.commitNow)} · commit probability ${frame.option.commitProbabilityPct}% · abandon ${(frame.option.abandonProbability * 100).toFixed(1)}% · expected wait ${frame.option.expectedWaitDays === null ? '—' : `${frame.option.expectedWaitDays}d`}`);
    if (frame.breakEven.carryPerWeek !== null) lines.push(`Break-even carry: ${money(frame.breakEven.carryPerWeek)}/week (declared/derived ${money(frame.carryPerWeek)}/week).`);
    if (frame.breakEven.sigma !== null) lines.push(`Break-even volatility: ${(frame.breakEven.sigma * 100).toFixed(1)}% (used ${(frame.sigma * 100).toFixed(1)}%).`);
  }
  const counts = report.counts || {};
  lines.push(`Frames: ${counts.priced || 0} priced, ${counts.withheld || 0} withheld, ${counts.frozen || 0} frozen, ${counts.due || 0} due for grading.`);
  if (report.calibration) lines.push(`Calibration: ${report.calibration.verdict}`);
  lines.push('These are decision-analysis expected values on a real-world measure, not a market price, not EVSI, and not advice. The option premium is never added to either.');
  return lines.join('\n');
}

export const DEFERRAL_VERDICTS = VERDICTS;
