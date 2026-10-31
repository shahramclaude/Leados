/**
 * app/core/domain/deferralPortfolio.js — the Deferral Portfolio read model
 * (Schema v69, ADR-0060).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * The Deferral Option Terminal (Schema v68) prices one call at a time. A
 * leader rarely holds one call. They hold a *book* of open, priced,
 * irreversible decisions — and the calls in that book are not independent:
 * several of them rest on the same premise, so one dated piece of news can
 * move all of them at once. Session 97 explicitly deferred this: "calls whose
 * values are correlated cannot be priced one at a time, and the graph already
 * knows which decisions share premises. Requires a declared correlation, not
 * a derived one."
 *
 * WHAT IS COMPUTED (named methods, each actually implemented)
 * -----------------------------------------------------------
 *  1. **The additivity theorem, stated and exploited, not simulated.** Each
 *     member call is exercised by its own boundary policy, which depends only
 *     on that call's own value path. Payoff_i is therefore a functional of
 *     path_i alone, and for ANY joint law with those marginals
 *
 *         E[Σ_i Payoff_i] = Σ_i E[Payoff_i]
 *
 *     by linearity of expectation. Correlation does NOT change what the book
 *     of flexibility is worth in expectation — the exact portfolio premium is
 *     the sum of the per-call CRR premiums, and this module prints that sum
 *     from the lattices, never from the simulation. What correlation changes
 *     is the *distribution* of the total: how much of the book fails at once.
 *     That is the quantity this module exists to measure, and it is the
 *     honest reason no "portfolio premium uplift" number appears anywhere.
 *  2. **Correlated GBM with declared correlations (Cholesky 1910 factor).**
 *     The typed graph identifies which member pairs share a premise; the
 *     leader declares ρ for each such pair (a declaration, never derived —
 *     co-movement in a leadership record cannot identify correlation). Pairs
 *     that share no premise are ρ = 0 by printed convention. The declared
 *     matrix must be positive semi-definite; if it is not (e.g. 0.9, 0.9,
 *     −0.9), no joint distribution has those pairwise correlations and the
 *     module refuses rather than projecting.
 *  3. **Common-random-numbers Monte Carlo, seeded and deterministic**
 *     (mulberry32; Box–Muller 1958 normals). Fixed exercise grid over the
 *     portfolio window; each call follows its own frozen lattice boundary
 *     (tabulated once per member onto the grid — printed), pays its own carry
 *     while open, lapses worthless at its own earlier deadline. The per-call
 *     marginal commit rate is printed beside its lattice anchor so the grid
 *     error is visible, never hidden.
 *  4. **Coherent tail risk (Artzner et al. 1999; Rockafellar & Uryasev
 *     2000).** VaR and CVaR (Expected Shortfall) of the total net wait value
 *     — payoffs discounted, carry paid while holding — at the declared tail
 *     level. CVaR is subadditive, so the **diversification credit**
 *     Σ_i CVaR_i − CVaR_total is ≥ 0 by construction and shrinks to 0 as the
 *     declared ρ → 1. That credit is the honest portfolio effect: not more
 *     expected flexibility, but less tail per unit of flexibility.
 *  5. **Component risk contributions (Tasche 1999).** For the total in its
 *     worst tail, contribution_i = E[Payoff_i | total in tail]; these sum to
 *     CVaR_total exactly (they are conditional means of a partition), so each
 *     member's *share of the tail* is printed beside its *share of the
 *     premium*. A call that is 20% of the expected flexibility but 60% of its
 *     tail is the concentration finding no other surface can print.
 *  6. **Shared-premise joint-lapse stress.** For each premise coupling ≥ 2
 *     members: P(all coupled members lapse together) from the correlated
 *     simulation, against the independence benchmark (the product of their
 *     marginal lapse rates — the same marginals under any ρ). The excess in
 *     percentage points is what the declared correlation buys in "everything
 *     fails at once". No shock size is invented; the stress is read off the
 *     same paths.
 *  7. **Concentration indices.** Herfindahl–Hirschman on premium shares and
 *     on tail-contribution shares (the same index the Decision Portfolio
 *     terminal applies to approvers), plus the top member's tail share
 *     against the declared concentration convention.
 *  8. **Frozen readings, graded once (Brier 1950).** A reading freezes the
 *     aggregate-only book state — currency, member count, Σ premium, CVaR,
 *     diversification credit, HHI, P(all lapse) and exactly ONE prospective
 *     claim: P(at least one member commits by the window close). It is graded
 *     once, after the window, against whether any member decision carries a
 *     *dated* recorded choice on or before the review date. Skill waits for
 *     five grades, exactly like every other forecast family here.
 *
 * HARD HONESTY BOUNDARIES
 * -----------------------
 *  - One portfolio is one currency. Money is never pooled across currencies.
 *  - No ρ is ever derived from data. The graph proposes pairs; the leader
 *    declares numbers, and an undeclared premise-sharing pair refuses the
 *    tail analysis (the per-call premiums still print — they need no ρ).
 *  - The expected total is the lattice sum, never the simulation mean; the
 *    simulation exists for the joint distribution only.
 *  - No premium uplift, no "portfolio value add", no summing of the premium
 *    into EVSI or the Cost of Waiting. The premium is what it was; only its
 *    risk profile is portfolio-level.
 *  - GBM with constant σ per call, no jumps, no stochastic volatility, no
 *    learning-by-waiting; the same model family as the per-call terminal,
 *    with its same refusals (σ withheld below the floor, unpriced stake
 *    refused).
 *  - No person is scored, no message is sent, no call is chosen.
 *
 * Pure module: no DOM, no storage, no network, no Math.random, no wall clock
 * (callers pass `now`). Deterministic for a fixed seed.
 */

import { addDays, dayKey, round } from '../time.js';
import { mulberry32 } from './dynamics.js';
import {
  buildDeferralFrame,
  deferralCandidates,
  deferralConventions,
} from './deferralOption.js';

export const DEFERRAL_PORTFOLIO_ENGINE_VERSION = 'deferral-portfolio-2026.10-v1';

export const DEFERRAL_PORTFOLIO_DEFAULTS = Object.freeze({
  deferralPortfolioAutoPropagate: true,
  deferralPortfolioMaxMembers: 6,
  deferralPortfolioPaths: 4000,
  deferralPortfolioSeed: 20261031,
  deferralPortfolioGridDays: 1,
  deferralPortfolioTailPct: 90,
  deferralPortfolioConcentrationPct: 60,
  deferralPortfolioJointLapsePp: 10,
  deferralPortfolioReviewCap: 20,
});

export const DEFERRAL_PORTFOLIO_SIGNAL_IDS = Object.freeze({
  DUE: 'DPO-01',
  CONCENTRATION: 'DPO-02',
  JOINT_LAPSE: 'DPO-03',
  EXPIRED: 'DPO-04',
  BASELINE: 'DPO-05',
});

export const DEFERRAL_PORTFOLIO_RULE_IDS = Object.freeze({
  FROZEN: 'RULE-DPO-01',
  SCAN: 'RULE-DPO-02',
  GRADE: 'RULE-DPO-03',
  PREMISE: 'RULE-DPO-04',
});

export const DEFERRAL_PORTFOLIO_EVENTS = Object.freeze({
  FROZEN: 'deferralPortfolio.frozen',
  SCAN: 'deferralPortfolio.scan',
  GRADED: 'deferralPortfolio.graded',
});

const YEAR_DAYS = 365;
const MIN_MEMBERS = 2;
const MAX_PAIR_RHO = 0.99;

/* ------------------------------------------------------------------ */
/* 0. Conventions                                                      */
/* ------------------------------------------------------------------ */

export function deferralPortfolioConventions(settings = {}) {
  const s = { ...DEFERRAL_PORTFOLIO_DEFAULTS, ...(settings || {}) };
  const num = (value, lo, hi, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  return {
    autoPropagate: s.deferralPortfolioAutoPropagate !== false,
    maxMembers: Math.round(num(s.deferralPortfolioMaxMembers, MIN_MEMBERS, 8, 6)),
    paths: Math.round(num(s.deferralPortfolioPaths, 500, 20000, 4000)),
    seed: Math.round(num(s.deferralPortfolioSeed, 1, 2147483647, 20261031)),
    gridDays: Math.round(num(s.deferralPortfolioGridDays, 1, 7, 1)),
    tailLevel: num(s.deferralPortfolioTailPct, 50, 99, 90) / 100,
    concentration: num(s.deferralPortfolioConcentrationPct, 10, 100, 60) / 100,
    jointLapsePp: num(s.deferralPortfolioJointLapsePp, 1, 50, 10),
    reviewCap: Math.round(num(s.deferralPortfolioReviewCap, 5, 20, 20)),
  };
}

/* ------------------------------------------------------------------ */
/* 1. Numerical primitives                                             */
/* ------------------------------------------------------------------ */

/**
 * Cholesky factorisation of a correlation matrix. Returns the lower
 * triangular L with R = L·Lᵀ, or `null` when the matrix is not positive
 * semi-definite — which means the declared pairwise correlations are mutually
 * inconsistent and no joint distribution with those margins exists. Refusing
 * is the only honest answer; projecting onto the PSD cone would silently
 * change numbers the leader declared.
 */
export function cholesky(matrix) {
  const n = matrix?.length || 0;
  if (!n || matrix.some((row) => !Array.isArray(row) || row.length !== n)) return null;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k += 1) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(sum > 1e-10)) return null;
        L[i][j] = Math.sqrt(sum);
      } else {
        if (!(L[j][j] > 1e-12)) return null;
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Deterministic standard normals from a seeded uniform stream (Box–Muller 1958). */
export function standardNormals(rand, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i += 2) {
    let u1 = rand();
    let u2 = rand();
    if (u1 <= 1e-12) u1 = 1e-12;
    if (u2 <= 1e-12) u2 = 1e-12;
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    out[i] = radius * Math.cos(angle);
    if (i + 1 < count) out[i + 1] = radius * Math.sin(angle);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. The coupling graph: which calls share a premise                  */
/* ------------------------------------------------------------------ */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isOpenPriced(frame) {
  return Boolean(frame && frame.decisionId && !frame.refusal && frame.option);
}

/**
 * Every unordered pair of decisions that share a recorded premise, with the
 * premises they share. Sources: the premise's own `decisionId` field and
 * `rests-on`/`tests` edges from a decision to a premise. This is the graph
 * identifying WHICH pairs need a declared correlation — it never supplies the
 * number itself, because co-movement in a leadership record cannot identify
 * correlation.
 */
export function sharedPremisePairs(state = {}) {
  const openDecisions = new Set(asArray(state.decisions)
    .filter((d) => d && d.id && String(d.status || 'open') === 'open' && !d.chosen && !d.decidedOn)
    .map((d) => d.id));
  const byPremise = new Map();
  const attach = (premiseId, decisionId) => {
    if (!premiseId || !decisionId || !openDecisions.has(decisionId)) return;
    if (!byPremise.has(premiseId)) byPremise.set(premiseId, new Set());
    byPremise.get(premiseId).add(decisionId);
  };
  for (const premise of asArray(state.premises)) {
    if (!premise || !premise.id) continue;
    if (premise.decisionId) attach(premise.id, premise.decisionId);
  }
  for (const link of asArray(state.links)) {
    if (!link || link.targetType !== 'premise' || link.sourceType !== 'decision') continue;
    if (link.relation !== 'rests-on' && link.relation !== 'tests') continue;
    attach(link.targetId, link.sourceId);
  }
  const pairs = new Map();
  for (const [premiseId, decisionIds] of byPremise) {
    const ids = [...decisionIds].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        if (!pairs.has(key)) pairs.set(key, { aId: ids[i], bId: ids[j], premiseIds: [] });
        if (!pairs.get(key).premiseIds.includes(premiseId)) {
          pairs.get(key).premiseIds.push(premiseId);
        }
      }
    }
  }
  return [...pairs.values()].sort((x, y) => x.aId.localeCompare(y.aId) || x.bId.localeCompare(y.bId));
}

function declarationFor(declarations, aId, bId) {
  return asArray(declarations).find((row) => row
    && typeof row.rho === 'number' && Number.isFinite(row.rho)
    && ((row.aId === aId && row.bId === bId) || (row.aId === bId && row.bId === aId))) || null;
}

/**
 * Assemble the correlation structure for one portfolio's members.
 * A premise-sharing pair with no declaration refuses the tail analysis —
 * defaulting it to zero would invent precisely the number the module exists
 * to make the leader declare. Pairs sharing no premise are ρ = 0 by printed
 * convention (the graph shows no coupling between them).
 */
export function correlationStructure(members, pairs, declarations = []) {
  const ids = members.map((m) => m.decisionId);
  const idSet = new Set(ids);
  const rows = [];
  const missing = [];
  // A correlation matrix carries 1 on the diagonal by definition; every
  // off-diagonal starts at the printed ρ = 0 convention and only a declared
  // premise-sharing pair may write a number into it.
  const matrix = ids.map((_row, i) => ids.map((_col, j) => (i === j ? 1 : 0)));
  for (const pair of pairs) {
    if (!idSet.has(pair.aId) || !idSet.has(pair.bId)) continue;
    const declared = declarationFor(declarations, pair.aId, pair.bId);
    if (!declared) {
      missing.push(pair);
      continue;
    }
    const i = ids.indexOf(pair.aId);
    const j = ids.indexOf(pair.bId);
    matrix[i][j] = declared.rho;
    matrix[j][i] = declared.rho;
    rows.push({
      aId: pair.aId, bId: pair.bId, rho: declared.rho, source: 'declared',
      premiseIds: pair.premiseIds.slice(), declaredAt: declared.declaredAt || null,
    });
  }
  const coupledCount = rows.length + missing.length;
  return {
    matrix,
    rows,
    missing,
    coupledPairs: coupledCount,
    conventions: `pairs sharing a premise: declared ρ; the other ${ids.length * (ids.length - 1) / 2 - coupledCount} pair(s): ρ = 0 by convention (the graph records no coupling between them)`,
  };
}

/* ------------------------------------------------------------------ */
/* 3. The correlated simulation                                        */
/* ------------------------------------------------------------------ */

/**
 * Interpolate one call's exercise boundary to an arbitrary day inside its own
 * window. The lattice boundary is a step-indexed set of commit and abandon
 * thresholds; linear interpolation between defined points, first/last value
 * clamped outside. `null` thresholds mean the optimal policy does not act at
 * that step, and the interpolation carries that honesty forward.
 */
export function boundaryLookup(frame, day) {
  const boundary = frame?.option?.boundary;
  if (!Array.isArray(boundary) || !boundary.length) return { commit: null, abandon: null };
  const points = boundary;
  if (day <= points[0].day) {
    return { commit: points[0].commitThreshold, abandon: points[0].abandonThreshold };
  }
  const last = points[points.length - 1];
  if (day >= last.day) {
    return { commit: last.commitThreshold, abandon: last.abandonThreshold };
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (day >= a.day && day <= b.day) {
      const span = b.day - a.day || 1;
      const t = (day - a.day) / span;
      const lerp = (x, y) => (x === null || y === null ? x : x + (y - x) * t);
      return { commit: lerp(a.commitThreshold, b.commitThreshold), abandon: lerp(a.abandonThreshold, b.abandonThreshold) };
    }
  }
  return { commit: last.commitThreshold, abandon: last.abandonThreshold };
}

/**
 * Precompute one member's exercise thresholds at every decision point of the
 * simulation grid. Interpolating the lattice boundary per path per step would
 * be O(paths × steps × boundary length); tabulating it once per member makes
 * the path loop pure arithmetic, which is what keeps a daily grid affordable
 * inside a render.
 */
function boundaryTable(frame, steps, stepDays) {
  const commit = new Array(steps + 1).fill(null);
  const abandon = new Array(steps + 1).fill(null);
  for (let s = 0; s <= steps; s += 1) {
    const row = boundaryLookup(frame, s * stepDays);
    commit[s] = row.commit;
    abandon[s] = row.abandon;
  }
  return { commit, abandon };
}

/**
 * Simulate the book on a fixed grid (daily by convention), under the declared
 * correlation. Every member follows its OWN lattice policy — commit at its
 * boundary, abandon at its abandon threshold, lapse at its own (possibly
 * earlier) deadline — so the marginal behaviour of each call is the per-call
 * terminal's behaviour and only the JOINT distribution is new. Payoffs are
 * discounted at each frame's own declared rate and charged that frame's carry
 * while open.
 *
 * Returns per-path, per-member net wait values plus bookkeeping, all derived
 * from ONE fixed draw set (common random numbers), so leave-one-out and
 * premise stress read the same world.
 */
export function simulatePortfolio(frames, {
  rho, paths = 4000, seed = 20261031, windowDays = 90, gridDays = 1,
} = {}) {
  const members = frames.filter(isOpenPriced);
  const n = members.length;
  if (n < MIN_MEMBERS) {
    return { ok: false, reason: `A portfolio needs at least ${MIN_MEMBERS} priced open calls; this one has ${n}.`, code: 'too-few-members' };
  }
  if (!Array.isArray(rho) || rho.length !== n || rho.some((row) => !Array.isArray(row) || row.length !== n)) {
    return { ok: false, reason: 'The correlation matrix does not match the member set.', code: 'bad-matrix' };
  }
  const L = cholesky(rho);
  if (!L) {
    return {
      ok: false,
      reason: 'The declared correlations are mutually inconsistent: the matrix is not positive semi-definite, so no joint distribution has exactly those pairwise correlations. Adjust the declarations — the module will not silently project them onto a valid matrix.',
      code: 'not-psd',
    };
  }
  const grid = Math.max(1, Math.min(7, Math.round(gridDays) || 1));
  const steps = Math.max(1, Math.min(366, Math.ceil(windowDays / grid)));
  const stepDays = windowDays / steps;
  const dt = (stepDays / YEAR_DAYS);
  const rand = mulberry32(seed);
  const perMember = members.map((frame) => ({
    frame,
    sigma: frame.sigma,
    drift: Number(frame.drift) || 0,
    discountRate: Number(frame.discountRate) || 0,
    carryPerStep: frame.carryPerWeek * (stepDays / 7),
    table: boundaryTable(frame, steps, stepDays),
  }));

  const payoffs = Array.from({ length: n }, () => new Array(paths).fill(0));
  const committed = Array.from({ length: n }, () => new Array(paths).fill(false));
  const allZeroSigma = perMember.every((m) => !(m.sigma > 0));

  for (let p = 0; p < paths; p += 1) {
    const z = standardNormals(rand, n);
    const correlated = new Array(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let k = 0; k <= i; k += 1) sum += L[i][k] * z[k];
      correlated[i] = sum;
    }
    const values = perMember.map((m) => m.frame.valueNow);
    const alive = perMember.map(() => true);
    for (let s = 0; s < steps; s += 1) {
      // Decision points sit at the START of each grid step — including
      // day 0, so the root of the tree (the per-call verdict's own
      // commit-now decision) is honoured, not skipped.
      const dayNow = s * stepDays;
      const dayEnd = (s + 1) * stepDays;
      for (let i = 0; i < n; i += 1) {
        if (!alive[i]) continue;
        const m = perMember[i];
        const ownHorizon = m.frame.horizonDays || windowDays;
        const commit = m.table.commit[s];
        const abandon = m.table.abandon[s];
        if (commit !== null && values[i] >= commit) {
          const disc = Math.exp(-m.discountRate * (dayNow / YEAR_DAYS));
          payoffs[i][p] = (values[i] - m.frame.commitCost) * disc;
          committed[i][p] = true;
          alive[i] = false;
          continue;
        }
        if (abandon !== null && values[i] <= abandon) {
          // The lattice abandons a worthless call — taking zero now rather
          // than paying carry for a continuation worth less than nothing —
          // and the simulation mirrors that policy at the same threshold.
          payoffs[i][p] = 0;
          alive[i] = false;
          continue;
        }
        if (ownHorizon <= dayNow + 1e-9) {
          // The member's own window has closed: terminal exercise is
          // automatic in the lattice (max(V − K, 0) at expiry), so it is
          // automatic here too.
          const disc = Math.exp(-m.discountRate * (ownHorizon / YEAR_DAYS));
          payoffs[i][p] = values[i] > m.frame.commitCost
            ? (values[i] - m.frame.commitCost) * disc
            : 0;
          if (payoffs[i][p] > 0) committed[i][p] = true;
          alive[i] = false;
          continue;
        }
        // Still open: evolve to the next decision point, or only as far as
        // the member's own earlier window, charging carry for the fraction
        // of the step actually waited.
        const horizon = Math.min(dayEnd, ownHorizon);
        const frac = Math.max(0, Math.min(1, (horizon - dayNow) / stepDays));
        const stepDt = dt * frac;
        payoffs[i][p] -= m.carryPerStep * frac;
        values[i] *= Math.exp((m.drift - (m.sigma * m.sigma) / 2) * stepDt
          + (m.sigma > 0 ? m.sigma * Math.sqrt(stepDt) * correlated[i] : 0));
      }
    }
  }

  const totals = new Array(paths).fill(0);
  for (let p = 0; p < paths; p += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += payoffs[i][p];
    totals[p] = sum;
  }
  return {
    ok: true,
    members,
    paths,
    steps,
    stepDays: round(stepDays, 4),
    seed,
    payoffs,
    committed,
    totals,
    deterministic: allZeroSigma,
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Tail statistics of one sample (Rockafellar & Uryasev 2000 in the empirical
 * measure): the level-q quantile (VaR) and the mean of the worst (1−q) share
 * (CVaR / expected shortfall). Coherent: translation-equivariant,
 * monotone, positively homogeneous and subadditive — which is exactly why the
 * diversification credit below cannot be negative.
 */
export function tailStats(samples, level = 0.9) {
  const sorted = samples.slice().sort((a, b) => a - b);
  if (!sorted.length) return { var: null, cvar: null, tailCount: 0 };
  const alpha = Math.min(0.99, Math.max(0.01, 1 - level));
  const tailCount = Math.max(1, Math.floor(alpha * sorted.length));
  const tail = sorted.slice(0, tailCount);
  return {
    var: round(quantile(sorted, alpha), 4),
    cvar: round(tail.reduce((sum, v) => sum + v, 0) / tail.length, 4),
    tailCount,
  };
}

function meanOf(samples) {
  if (!samples.length) return 0;
  return samples.reduce((sum, v) => sum + v, 0) / samples.length;
}

function sdOf(samples) {
  if (samples.length < 2) return 0;
  const m = meanOf(samples);
  return Math.sqrt(samples.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (samples.length - 1));
}

/**
 * The full portfolio read: exact per-call premiums from the lattices, the
 * declared correlation structure, the correlated joint distribution, tail
 * risk, component contributions, concentration and shared-premise stress.
 * Every refusal is a result with a reason, never a zero.
 */
export function analysePortfolio(frames, { pairs = [], declarations = [], conventions = deferralPortfolioConventions({}), windowDays = null } = {}) {
  const members = frames.filter(isOpenPriced);
  if (members.length < MIN_MEMBERS) {
    return {
      ok: false,
      code: 'too-few-members',
      reason: `A deferral portfolio needs at least ${MIN_MEMBERS} priced open calls in one currency; this workspace offers ${members.length}. The per-call terminal below still prices each call on its own.`,
      refusal: `A deferral portfolio needs at least ${MIN_MEMBERS} priced open calls in one currency; this workspace offers ${members.length}. The per-call terminal below still prices each call on its own.`,
      members,
    };
  }
  const sumPremium = round(members.reduce((sum, f) => sum + (f.option?.premium || 0), 0), 2);
  const sumStake = round(members.reduce((sum, f) => sum + f.valueNow, 0), 2);
  const maxHorizon = Math.max(...members.map((f) => f.horizonDays || 0));
  const window = Math.max(7, Math.min(730, Math.round(Number.isFinite(windowDays) ? windowDays : maxHorizon)));
  const windowClose = dayKey(addDays(new Date(`${members[0].today}T00:00:00Z`), window));

  const structure = correlationStructure(members, pairs, declarations);
  const base = {
    ok: true,
    members,
    memberCount: members.length,
    currency: members[0].currency,
    sumPremium,
    sumStake,
    windowDays: window,
    windowClose,
    correlation: structure,
    simulation: null,
    refusal: null,
  };
  if (structure.missing.length) {
    return {
      ...base,
      refusal: `${structure.missing.length} premise-sharing pair(s) have no declared correlation, so the joint tail cannot be priced. The graph identified the pairs; the number is yours to declare — a default would be an invented fact. The exact per-call premiums above need no correlation and still stand.`,
    };
  }
  const sim = simulatePortfolio(members, {
    rho: structure.matrix,
    paths: conventions.paths,
    seed: conventions.seed,
    windowDays: window,
    gridDays: conventions.gridDays,
  });
  if (!sim.ok) {
    return { ...base, refusal: sim.reason };
  }

  const level = conventions.tailLevel;
  const total = tailStats(sim.totals, level);
  const memberRows = members.map((frame, i) => {
    const standalone = tailStats(sim.payoffs[i], level);
    const latticeCommit = frame.option.commitProbability;
    const mcCommit = meanOf(sim.committed[i].map((c) => (c ? 1 : 0)));
    const mcMean = meanOf(sim.payoffs[i]);
    const sd = sdOf(sim.payoffs[i]);
    return {
      decisionId: frame.decisionId,
      title: frame.title,
      premium: frame.option.premium,
      premiumShare: sumPremium > 0 ? frame.option.premium / sumPremium : 0,
      sigma: frame.sigma,
      horizonDays: frame.horizonDays,
      deadline: frame.deadline,
      verdict: frame.verdict.id,
      latticeCommitPct: round(latticeCommit * 100, 1),
      mcCommitPct: round(mcCommit * 100, 1),
      mcMeanPayoff: round(mcMean, 2),
      mcSe: round(sd / Math.sqrt(sim.paths), 2),
      standaloneCvar: standalone.cvar,
      contribution: null,
      contributionShare: null,
      cvarIfCommittedNow: null,
    };
  });

  // Component contributions (Tasche 1999): conditional means of each member's
  // payoff inside the portfolio's own worst tail. They partition the tail
  // mean, so they sum to CVaR exactly — no allocation heuristic.
  const sortedIdx = sim.totals
    .map((value, idx) => ({ value, idx }))
    .sort((a, b) => a.value - b.value)
    .slice(0, total.tailCount)
    .map((row) => row.idx);
  let cvarSum = 0;
  for (const i of sortedIdx) cvarSum += sim.totals[i];
  const cvarExact = cvarSum / sortedIdx.length;
  for (let i = 0; i < members.length; i += 1) {
    let contribution = 0;
    for (const p of sortedIdx) contribution += sim.payoffs[i][p];
    memberRows[i].contribution = round(contribution / sortedIdx.length, 2);
    memberRows[i].contributionShare = cvarExact !== 0 && Number.isFinite(memberRows[i].contribution / cvarExact)
      ? memberRows[i].contribution / cvarExact
      : null;
  }

  // Leave-one-out CVaR from the SAME paths (common random numbers): what the
  // book's tail would be if this call were committed now and left the book.
  for (let i = 0; i < members.length; i += 1) {
    const reduced = sim.totals.map((value, p) => value - sim.payoffs[i][p]);
    memberRows[i].cvarIfCommittedNow = tailStats(reduced, level).cvar;
  }

  const standaloneCvarSum = round(memberRows.reduce((sum, row) => sum + (row.standaloneCvar || 0), 0), 2);
  // CVaR is carried in payoff terms (negative = loss), so subadditivity reads
  // cvar(book) >= sum(standalone cvar): pooling can only soften the tail. The
  // credit is how much softer, and a small negative MEASURED credit is
  // simulation noise, not a theorem violation — the panel says which is which.
  const diversificationCredit = round(total.cvar - standaloneCvarSum, 2);
  const hhiPremium = sumPremium > 0
    ? round(memberRows.reduce((sum, row) => sum + row.premiumShare ** 2, 0), 4)
    : null;
  const shares = memberRows.map((row) => row.contributionShare).filter((v) => v !== null && Number.isFinite(v));
  const hhiContribution = shares.length === memberRows.length
    ? round(shares.reduce((sum, v) => sum + v * v, 0), 4)
    : null;
  const topContribution = memberRows.reduce((best, row) => (
    (row.contributionShare ?? -Infinity) > (best?.contributionShare ?? -Infinity) ? row : best
  ), null);

  // Shared-premise joint-lapse stress from the same paths. The independence
  // benchmark multiplies the SAME marginal lapse rates the simulation
  // produced, so the comparison is apples-to-apples under common random
  // numbers.
  const memberIndex = new Map(memberRows.map((row, i) => [row.decisionId, i]));
  const premiseRows = [];
  const premiseNames = new Map();
  for (const pair of structure.rows) {
    for (const pid of pair.premiseIds) {
      if (!premiseNames.has(pid)) premiseNames.set(pid, null);
    }
  }
  for (const pair of structure.missing) {
    for (const pid of pair.premiseIds) {
      if (!premiseNames.has(pid)) premiseNames.set(pid, null);
    }
  }
  const coupledByPremise = new Map();
  for (const row of structure.rows) {
    for (const pid of row.premiseIds) {
      if (!coupledByPremise.has(pid)) coupledByPremise.set(pid, new Set());
      coupledByPremise.get(pid).add(row.aId);
      coupledByPremise.get(pid).add(row.bId);
    }
  }
  for (const [premiseId, decisionIds] of coupledByPremise) {
    const idxs = [...decisionIds].map((id) => memberIndex.get(id)).filter((i) => i !== undefined);
    if (idxs.length < 2) continue;
    let joint = 0;
    for (let p = 0; p < sim.paths; p += 1) {
      if (idxs.every((i) => !sim.committed[i][p])) joint += 1;
    }
    const jointPct = round((joint / sim.paths) * 100, 1);
    let independence = 1;
    for (const i of idxs) {
      const lapseRate = meanOf(sim.committed[i].map((c) => (c ? 0 : 1)));
      independence *= lapseRate;
    }
    premiseRows.push({
      premiseId,
      memberIds: idxs.map((i) => memberRows[i].decisionId),
      memberCount: idxs.length,
      jointLapsePct: jointPct,
      independenceLapsePct: round(independence * 100, 1),
      excessPp: round(jointPct - independence * 100, 1),
      premiumSharePct: sumPremium > 0
        ? round((idxs.reduce((sum, i) => sum + memberRows[i].premium, 0) / sumPremium) * 100, 1)
        : null,
    });
  }
  premiseRows.sort((a, b) => b.excessPp - a.excessPp || b.memberCount - a.memberCount);

  // Book-level joint outcomes, read straight off the same paths: the share of
  // worlds in which no member commits at all (the whole book lapses) and its
  // complement (at least one commit inside the window).
  const allLapsePaths = sim.totals.filter((_value, p) => sim.committed.every((row) => !row[p])).length;
  const pAllLapsePct = round((allLapsePaths / sim.paths) * 100, 1);
  const pAnyCommitPct = round(100 - pAllLapsePct, 1);

  return {
    ...base,
    simulation: {
      paths: sim.paths,
      steps: sim.steps,
      stepDays: sim.stepDays,
      seed: sim.seed,
      deterministic: sim.deterministic,
      meanTotal: round(meanOf(sim.totals), 2),
      seTotal: round(sdOf(sim.totals) / Math.sqrt(sim.paths), 2),
      latticeSumPremium: sumPremium,
      var: total.var,
      cvar: total.cvar,
      tailLevel: level,
      pAllLapsePct,
      pAnyCommitPct,
      diversificationCredit,
      standaloneCvarSum,
      hhiPremium,
      hhiContribution,
      topContributionShare: topContribution ? topContribution.contributionShare : null,
      topContributionDecisionId: topContribution ? topContribution.decisionId : null,
      members: memberRows,
      premises: premiseRows,
      method: 'Weekly-grid GBM under declared Cholesky-correlated shocks; each call follows its own frozen CRR boundary. Common random numbers; the exact expected total is the lattice sum, never this simulation.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* 4. The report                                                       */
/* ------------------------------------------------------------------ */

/**
 * The full Deferral Portfolio read model. One portfolio per currency, built
 * from the open priced calls the per-call terminal already frames — no new
 * intake, no new data entry. Frozen readings are listed newest first.
 */
export function portfolioDeferralReport(state = {}, now = new Date(), settings = {}) {
  const conventions = deferralPortfolioConventions(settings);
  const perCallConventions = deferralConventions(settings);
  const candidates = deferralCandidates(state, now, settings);
  const pairs = sharedPremisePairs(state);
  const declarations = asArray(state.correlationDeclarations);
  const frames = candidates
    .map((candidate) => buildDeferralFrame(state, candidate, now, settings))
    .filter((frame) => isOpenPriced(frame));
  const byCurrency = new Map();
  for (const frame of frames) {
    if (!byCurrency.has(frame.currency)) byCurrency.set(frame.currency, []);
    byCurrency.get(frame.currency).push(frame);
  }
  const portfolios = [...byCurrency.entries()]
    .map(([currency, list]) => {
      const chosen = list.slice().sort((a, b) => b.valueNow - a.valueNow).slice(0, conventions.maxMembers);
      const excluded = list.length - chosen.length;
      const analysis = analysePortfolio(chosen, {
        pairs,
        declarations,
        conventions,
      });
      return {
        currency,
        excludedPricedCalls: excluded > 0 ? `${excluded} priced call(s) beyond the ${conventions.maxMembers}-member cap` : null,
        ...analysis,
      };
    })
    .sort((a, b) => b.sumStake - a.sumStake);
  const records = asArray(state.deferralPortfolioReadings)
    .slice()
    .sort((a, b) => String(b.frozenAt || '').localeCompare(String(a.frozenAt || '')));
  return {
    today: dayKey(now),
    conventions,
    perCallConventions,
    portfolios,
    records,
    counts: {
      currencies: portfolios.length,
      members: portfolios.reduce((sum, p) => sum + (p.memberCount || 0), 0),
      withheld: portfolios.filter((p) => p.refusal).length,
      readings: records.length,
      due: records.filter((r) => !r.graded && r.reviewOn <= dayKey(now)).length,
    },
    calibration: portfolioDeferralCalibration(state),
  };
}

/** Freeze one reading. Bounded, identity-free: ids, aggregates, one probability. */
export function buildPortfolioReading(analysis, now = new Date(), id) {
  if (!analysis || !analysis.ok || analysis.refusal || !analysis.simulation) {
    return { ok: false, reason: analysis?.refusal || 'Only a priced portfolio with a declared correlation structure can be frozen.' };
  }
  const sim = analysis.simulation;
  return {
    ok: true,
    record: {
      id,
      frozenAt: now.toISOString(),
      reviewOn: analysis.windowClose,
      windowDays: analysis.windowDays,
      currency: analysis.currency,
      memberIds: analysis.members.map((f) => f.decisionId),
      stressedPremiseIds: sim.premises.map((p) => p.premiseId).slice(0, 8),
      paths: sim.paths,
      steps: sim.steps,
      seed: sim.seed,
      sumPremium: analysis.sumPremium,
      sumStake: analysis.sumStake,
      mcMeanTotal: sim.meanTotal,
      mcSeTotal: sim.seTotal,
      cvar: sim.cvar,
      var: sim.var,
      tailLevel: sim.tailLevel,
      diversificationCredit: sim.diversificationCredit,
      hhiPremium: sim.hhiPremium,
      hhiContribution: sim.hhiContribution,
      topContributionShare: sim.topContributionShare === null ? null : round(sim.topContributionShare, 4),
      worstJointLapseExcessPp: sim.premises.length
        ? round(Math.max(...sim.premises.map((p) => (Number.isFinite(p.excessPp) ? p.excessPp : 0))), 1)
        : null,
      pAllLapsePct: sim.pAllLapsePct,
      stressedPremiseCount: sim.premises.length,
      predictedAnyCommitPct: sim.pAnyCommitPct,
      graded: null,
      challengeNotes: [],
    },
  };
}

/**
 * Grade one frozen reading exactly once, after the window closes. The outcome
 * is whether ANY member decision carries a dated recorded choice on or before
 * the review date. A member chosen without a date contributes nothing; a
 * member deleted from the workspace is skipped, and a reading whose members
 * are all gone is ungradable rather than guessed.
 */
export function gradePortfolioReading(record, state = {}, now = new Date()) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'No frozen reading to grade.' };
  if (record.graded) return { ok: false, reason: 'This reading has already been graded; a forecast is scored once.' };
  const today = dayKey(now);
  if (!record.reviewOn || record.reviewOn > today) {
    return { ok: false, reason: `Wait until the window closes on ${record.reviewOn || 'its review date'}; grading before then would score a forecast against an unfinished future.` };
  }
  const decisions = asArray(state.decisions);
  const members = record.memberIds
    .map((id) => decisions.find((d) => d && d.id === id))
    .filter(Boolean);
  if (!members.length) {
    return { ok: false, reason: 'Every member decision of this reading is gone from the workspace, so its outcome cannot be read.' };
  }
  let anyCommitted = false;
  let dated = 0;
  for (const decision of members) {
    if (!decision.chosen) continue;
    const decidedOn = typeof decision.decidedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(decision.decidedOn) ? decision.decidedOn : null;
    if (decidedOn === null) continue;
    dated += 1;
    if (decidedOn <= record.reviewOn) anyCommitted = true;
  }
  if (dated === 0 && !anyCommitted) {
    // Undated choices cannot establish timing; they are ungradable, not late.
    const chosenCount = members.filter((d) => d.chosen).length;
    if (chosenCount > 0) {
      return { ok: false, reason: 'Member decisions were recorded as chosen without dates, so whether any commit landed inside the window cannot be established.' };
    }
  }
  const probability = Math.min(1, Math.max(0, Number(record.predictedAnyCommitPct) / 100 || 0));
  const brier = round((probability - (anyCommitted ? 1 : 0)) ** 2, 4);
  return {
    ok: true,
    anyCommitted,
    brier,
    grade: {
      gradedAt: now.toISOString(),
      anyCommitted,
      gradedMembers: members.length,
      brier,
    },
    outcome: anyCommitted,
  };
}

/** Calibration across graded readings; skill waits for five grades. */
export function portfolioDeferralCalibration(state = {}) {
  const graded = asArray(state.deferralPortfolioReadings)
    .filter((row) => row && row.graded && Number.isFinite(Number(row.graded.brier)));
  const brierMean = graded.length ? round(graded.reduce((sum, row) => sum + Number(row.graded.brier), 0) / graded.length, 4) : null;
  const committed = graded.filter((row) => row.graded.anyCommitted).length;
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
      ? `Scored ${graded.length} of the 5 readings a skill claim requires; the loss is printed, the skill is refused.`
      : skill === null
        ? 'Every graded reading resolved the same way, so the base rate has no variance to beat.'
        : skill > 0
          ? `The frozen readings beat their own base rate by ${(skill * 100).toFixed(1)}%.`
          : `The frozen readings lost to their own base rate by ${(Math.abs(skill) * 100).toFixed(1)}%.`,
  };
}

/* ------------------------------------------------------------------ */
/* 5. Signals, attention and the brief                                 */
/* ------------------------------------------------------------------ */

export function portfolioDeferralSignals(state = {}, now = new Date(), settings = {}) {
  const effective = settings && Object.keys(settings).length ? settings : (state.settings || {});
  // The signals read FROZEN READINGS, not the live simulation: a nav badge must
  // stay cheap, and a signal is more honest when it cites a recorded fact — a
  // reading id and a freeze date — than when it cites a number that changes
  // with every render. The live book is the Portfolio panel's job.
  const conventions = deferralPortfolioConventions(effective);
  const findings = [];
  const today = dayKey(now);
  const records = asArray(state.deferralPortfolioReadings)
    .slice()
    .sort((a, b) => String(b.frozenAt || '').localeCompare(String(a.frozenAt || '')));

  const due = records.filter((r) => !r.graded && r.reviewOn && r.reviewOn <= today);
  if (due.length) {
    findings.push({
      ruleId: DEFERRAL_PORTFOLIO_SIGNAL_IDS.DUE,
      domain: 'Deferral portfolio',
      title: `${due.length} portfolio reading${due.length === 1 ? '' : 's'} reached the review date`,
      detail: 'A frozen reading is one probability — that at least one member call commits before the window closes. Grade it now against the recorded decision dates; the module refuses a second grade.',
      severity: 3,
      confidence: 'high',
      evidence: due.slice(0, 5).map((r) => `Reading ${r.id} closed ${r.reviewOn}`),
      action: { label: 'Grade the readings', route: '#/deferral?panel=portfolio' },
    });
  }

  const byCurrencyLatest = new Map();
  for (const record of records) {
    if (record.graded) continue;
    if (!byCurrencyLatest.has(record.currency)) byCurrencyLatest.set(record.currency, record);
  }
  for (const [currency, record] of byCurrencyLatest) {
    const top = record.topContributionShare;
    if (Number.isFinite(top) && top >= 0 && top >= conventions.concentration) {
      findings.push({
        ruleId: DEFERRAL_PORTFOLIO_SIGNAL_IDS.CONCENTRATION,
        domain: 'Deferral portfolio',
        title: `${currency} flexibility tail concentrates on one call`,
        detail: `Reading ${record.id} (frozen ${String(record.frozenAt || '').slice(0, 10)}) put ${(top * 100).toFixed(0)}% of the book's ${(conventions.tailLevel * 100).toFixed(0)}% tail on its largest member — above the ${(conventions.concentration * 100).toFixed(0)}% convention. Concentration is about the tail, not the premium: the expected total is additive whatever the correlation. Freeze a fresh reading to re-measure the live book.`,
        severity: 3,
        confidence: 'medium',
        evidence: [`${(record.memberIds || []).length} member call(s) · Σ premium ${currency} ${Number(record.sumPremium || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} · reading ${record.id}`],
        action: { label: 'Open the concentration table', route: '#/deferral?panel=portfolio' },
      });
    }
    const worst = record.worstJointLapseExcessPp;
    if (Number.isFinite(worst) && worst >= conventions.jointLapsePp) {
      findings.push({
        ruleId: DEFERRAL_PORTFOLIO_SIGNAL_IDS.JOINT_LAPSE,
        domain: 'Deferral portfolio',
        title: `Coupled calls can lapse together: ${(record.stressedPremiseCount || 0)} shared premise reading${(record.stressedPremiseCount || 0) === 1 ? '' : 's'}`,
        detail: `Reading ${record.id} (frozen ${String(record.frozenAt || '').slice(0, 10)}) measured the book's coupled calls lapsing together ${(worst).toFixed(1)}pp more often than independence would give — above the ${conventions.jointLapsePp}pp convention. The premise carrying that coupling owns a share of the book's premium; a breach there is a portfolio event, not a single-call event. Freeze a fresh reading to re-measure the live book.`,
        severity: 3,
        confidence: 'medium',
        evidence: [`${(record.stressedPremiseCount || 0)} stressed premise(s) · worst excess ${(worst).toFixed(1)}pp vs independence · reading ${record.id}`],
        action: { label: 'Read the premise stress', route: '#/deferral?panel=portfolio' },
      });
    }
  }

  const expired = records.filter((record) => {
    if (record.graded || !record.reviewOn || record.reviewOn > today) return false;
    return (record.memberIds || []).some((id) => {
      const decision = (state.decisions || []).find((d) => d && d.id === id);
      return decision && String(decision.status || 'open') === 'open' && !String(decision.chosen || '').trim();
    });
  });
  if (expired.length) {
    findings.push({
      ruleId: DEFERRAL_PORTFOLIO_SIGNAL_IDS.EXPIRED,
      domain: 'Deferral portfolio',
      title: `${expired.length} portfolio window${expired.length === 1 ? '' : 's'} expired with calls still open`,
      detail: 'The window the reading froze has passed and at least one member call is still unrecorded. The flexibility the book was carrying expired unused — that is a decision too.',
      severity: 4,
      confidence: 'high',
      evidence: expired.slice(0, 5).map((r) => `Window closed ${r.reviewOn}`),
      action: { label: 'Close or re-open the calls', route: '#/deferral?panel=portfolio' },
    });
  }

  const calibration = portfolioDeferralCalibration(state);
  if (calibration.skill !== null && calibration.skill < 0) {
    findings.push({
      ruleId: DEFERRAL_PORTFOLIO_SIGNAL_IDS.BASELINE,
      domain: 'Deferral portfolio',
      title: 'The portfolio forecasts trail their own base rate',
      detail: calibration.verdict,
      severity: 2,
      confidence: 'medium',
      evidence: [`Brier ${calibration.brier} vs base-rate ${calibration.baselineBrier} across ${calibration.graded} grade(s)`],
      action: { label: 'Read the calibration', route: '#/deferral?panel=portfolio' },
    });
  }

  return findings;
}

export function portfolioDeferralAttentionCount(state = {}, now = new Date(), settings = {}) {
  return portfolioDeferralSignals(state, now, settings).filter((f) => f.severity >= 3).length;
}

/**
 * Identity-free board brief: aggregate book state, the additivity statement,
 * the tail, the concentration and the refusals. No decision title, no owner.
 */
export function portfolioDeferralBrief(report, now = new Date()) {
  const lines = [`DEFERRAL PORTFOLIO · ${dayKey(now)}`];
  if (!report.portfolios.length) {
    lines.push('No currency holds two or more priced open calls, so there is no book to analyse. The per-call terminal still prices each call on its own.');
    return lines.join('\n');
  }
  for (const portfolio of report.portfolios) {
    lines.push(`${portfolio.currency}: ${portfolio.memberCount} call(s) · Σ stake ${portfolio.currency} ${Number(portfolio.sumStake).toLocaleString('en-US', { maximumFractionDigits: 2 })} · Σ premium ${portfolio.currency} ${Number(portfolio.sumPremium).toLocaleString('en-US', { maximumFractionDigits: 2 })} (exact, per-call lattices).`);
    if (portfolio.refusal) {
      lines.push(`  Tail analysis refused: ${portfolio.refusal}`);
      continue;
    }
    const sim = portfolio.simulation;
    lines.push(`  Expected total is additive under any correlation (independent exercise); the simulation exists for the joint distribution only. MC mean ${portfolio.currency} ${Number(sim.meanTotal).toLocaleString('en-US', { maximumFractionDigits: 2 })} ± ${Number(sim.seTotal).toLocaleString('en-US', { maximumFractionDigits: 2 })} over ${sim.paths} paths on the ${sim.stepDays < 1.05 ? 'daily' : `${sim.stepDays.toFixed(1)}-day`} grid.`);
    lines.push(`  Tail ${(sim.tailLevel * 100).toFixed(0)}%: VaR ${portfolio.currency} ${Number(sim.var).toLocaleString('en-US', { maximumFractionDigits: 2 })} · CVaR ${portfolio.currency} ${Number(sim.cvar).toLocaleString('en-US', { maximumFractionDigits: 2 })} · diversification credit ${portfolio.currency} ${Number(sim.diversificationCredit).toLocaleString('en-US', { maximumFractionDigits: 2 })} (Σ standalone CVaR ${portfolio.currency} ${Number(sim.standaloneCvarSum).toLocaleString('en-US', { maximumFractionDigits: 2 })}).`);
    if (sim.topContributionShare !== null) lines.push(`  Concentration: top call carries ${(sim.topContributionShare * 100).toFixed(0)}% of the tail · HHI(premium) ${sim.hhiPremium} · HHI(tail) ${sim.hhiContribution}.`);
    if (sim.premises.length) {
      const worst = sim.premises[0];
      lines.push(`  Shared-premise stress: ${sim.premises.length} premise(sha) couple member calls; worst: all coupled calls lapse together ${worst.jointLapsePct}% vs ${worst.independenceLapsePct}% under independence (+${worst.excessPp}pp).`);
    }
  }
  const counts = report.counts || {};
  lines.push(`Readings: ${counts.readings || 0} frozen, ${counts.due || 0} due for grading. Calibration: ${report.calibration.verdict}`);
  lines.push('Correlations are declared, never derived. No premium uplift is claimed: correlation changes how flexibility fails together, not what it is worth in expectation. Not a market price, not EVSI, never added to the Cost of Waiting.');
  return lines.join('\n');
}

export const DEFERRAL_PORTFOLIO_MAX_PAIR_RHO = MAX_PAIR_RHO;
export const DEFERRAL_PORTFOLIO_MIN_MEMBERS = MIN_MEMBERS;
