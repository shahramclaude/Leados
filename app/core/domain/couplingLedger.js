/**
 * app/core/domain/couplingLedger.js — the Coupling Ledger engine
 * (Schema v78, ADR-0070).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * Since Schema v69 the Deferral Portfolio prices a correlated joint tail on a
 * leader-declared ρ for every pair of calls the typed graph shows sharing a
 * premise. The panel says the honest thing — "the graph identified the pairs;
 * the number is yours to declare" — which also means the most consequential
 * assumption in the deferral terminal was the only one with no read-back
 * anywhere. Sessions 98 and 99 both listed "ρ calibration" as a top-three
 * carry, and both attached it to a ledger that cannot do it: a Brier reading
 * grades a probability about an outcome, while ρ is a dependence between two
 * processes, and one book-level binary per reading identifies neither.
 *
 * The estimator that works was already in the data. Every decision carries a
 * creation date and, once made, a frozen `decidedOn`. So every call has an
 * at-risk calendar window and a resolution block, and two declared partners
 * either resolved inside the same block or they did not. That is a realised
 * joint outcome the workspace already stores — nothing is entered for this
 * screen, no volatility is invented for a call that has already been made, and
 * the estimand fits in one sentence.
 *
 * WHAT IS COMPUTED (named methods, each actually implemented)
 * -----------------------------------------------------------
 *  1. CONDITIONS ON BOTH RESOLVING. The estimand is co-resolution given that
 *     both calls resolved, measured in `blockDays` calendar blocks. A pair with
 *     an open member is refused with a printed reason and never counted as a
 *     non-coincidence; a pair whose whole common window fits inside one block
 *     is refused too, because a coincidence there is arithmetically certain.
 *  2. STRUCTURE-PRESERVING ROTATION NULL. Under no coupling, a call's
 *     resolution block is exchangeable within its own at-risk window. Each
 *     call's block is rotated inside its own window by
 *     `s = (rotation + 31·callIndex) mod window`, so every call keeps its
 *     marginal exposure, a call belonging to several pairs keeps ONE placement
 *     across all of them (per-pair p-values are not independent, so Fisher's
 *     method would be invalid here), and the family is deterministic — the
 *     p-value never moves between machines or runs. Because each rotation
 *     window is at least as wide as the pair's common window, the null makes a
 *     coincidence no MORE likely than a uniform-over-overlap null would, so the
 *     reported p-values overstate, never understate, the evidence.
 *  3. BOTH TAILS. With zero observed coincidences the upper test returns p = 1
 *     forever, so a confirm-the-declaration test would report success in
 *     exactly the most damning case. The deficit tail (`pValueLow`) is what
 *     reaches `hedged` and `over-declared`.
 *  4. DECLARED ρ IS A COPULA PARAMETER, AND TWO MAPPINGS ARE PRINTED. A
 *     declared ρ is a Pearson correlation of value innovations; a coincidence
 *     is a rank correlation of times. There is no unit conversion, so the
 *     module maps one onto the other through a Gaussian copula on the block
 *     index under BOTH defensible mappings — τ = ρ, and the exact normal-theory
 *     Spearman transform τ = 2·sin(πρ/6) (Kruskal 1958) — with each side's
 *     marginal uniform over its own common window. At ρ = 0 the curve
 *     reproduces the printed independence rate 1/k exactly; at ρ → 1 it
 *     reaches 1. Where the two mappings disagree about a magnitude, the
 *     finding is flagged mapping-dependent and no work is opened on it.
 *  5. SIX VERDICTS, SIX ASSESSMENTS, AND A REFUSAL THAT IS NOT A VERDICT.
 *     `insufficient` (below the pair floor), `unidentifiable` (too few expected
 *     coincidences), `inconclusive`, `independent`, `coupled`, `hedged` become
 *     `confirmed`, `over-declared`, `under-declared`, `overstated`,
 *     `understated`, `unresolved`. A band below the floor prints NO assessment:
 *     a thin band reads "unresolved", never "independent".
 *  6. A FROZEN REVIEW IS AGGREGATE-ONLY AND GRADED EXACTLY ONCE. Counts, the
 *     rotation summary, the model reference, one prospective probability from a
 *     Laplace-smoothed commitment hazard re-based to the review's own window,
 *     and member ids. No title, no question, no person, no note.
 *  7. NOTHING IS EVER WRITTEN BACK. There is no write path from this module to
 *     `correlationDeclarations`. It never clamps, defaults, derives or applies a
 *     declaration.
 *
 * NOT CLAIMED: that a coincidence rate identifies a Pearson correlation of
 * value innovations (it does not — the mapping is a printed convention, and its
 * inversion carries an explicit `identified` flag); that block boundaries are
 * the right grain (a convention, and the panel states what the grid removes);
 * that a refused pair means the calls were uncoupled (it means the record cannot
 * see them resolve); that the rotation family is an exact combinatorial test (it
 * is a quasi-enumeration with a printed floor of 1/(R+1)); or that a four-pair
 * floor is the right evidence bar.
 */

import { addDays, dayKey } from '../time.js';
import { normalizeCouplingSettings } from './couplingLedgerSchema.js';

/** Printed on the panel so a reader knows which engine produced the reading. */
export const COUPLING_LEDGER_ENGINE_VERSION = 'coupled-block rotation v1';

export const COUPLING_LEDGER_RULE_IDS = Object.freeze({
  FROZEN: 'RULE-CPL-01',
  SCAN: 'RULE-CPL-02',
  DECLARED: 'RULE-CPL-03',
});

export const COUPLING_LEDGER_SIGNAL_IDS = Object.freeze({
  UNDER_DECLARED: 'CPL-01',
  OVER_DECLARED: 'CPL-02',
  DUE: 'CPL-03',
  UNDECLARED: 'CPL-04',
  UNREADABLE: 'CPL-05',
});

export const COUPLING_LEDGER_EVENTS = Object.freeze({
  FROZEN: 'couplingLedger.frozen',
  SCAN: 'couplingLedger.scan',
  DECLARED: 'deferralPortfolio.declared',
});

/** Bands over the declared ρ. Half-open on the low end, gapless by test. */
export const COUPLING_BANDS = Object.freeze([
  { key: 'hedge', label: 'Declared hedging (negative ρ)', min: -0.99, max: -0.2 },
  { key: 'weak', label: 'Declared near-independent', min: -0.2, max: 0.2 },
  { key: 'moderate', label: 'Declared moderately coupled', min: 0.2, max: 0.55 },
  { key: 'strong', label: 'Declared strongly coupled', min: 0.55, max: 0.99 },
]);

/** Human readings. A view never invents its own sentence for a verdict. */
export const COUPLING_ASSESSMENT_TEXT = Object.freeze({
  confirmed: 'the record agrees with the strength declared',
  'over-declared': 'declared coupled, resolved apart',
  'under-declared': 'declared independent, resolved together',
  overstated: 'resolved together less often than the declaration implies',
  understated: 'resolved together more often than the declaration implies',
  unresolved: 'no reading is printed for this band',
});

export const COUPLING_VERDICT_TEXT = Object.freeze({
  insufficient: 'too few testable pairs for a verdict',
  unidentifiable: 'too few coincidences are expected for the test to have power',
  inconclusive: 'the record neither rules coupling in nor out',
  independent: 'no co-resolution beyond chance',
  coupled: 'more co-resolution than chance',
  hedged: 'materially less co-resolution than chance',
});

/**
 * The single predicate every consumer uses for "this band's declaration is
 * contradicted". A mapping-dependent magnitude is deliberately NOT a
 * contradiction: if the finding flips between the two defensible mappings, the
 * record has not settled it.
 */
export function contradictionOf(band) {
  return Boolean(band) && band.contradiction === true && band.mappingDisagreement !== true;
}

export function couplingLedgerConventions(settings) {
  const s = normalizeCouplingSettings(settings);
  return Object.freeze({
    blockDays: s.couplingBlockDays,
    minPairs: s.couplingMinPairs,
    minExpectedCollisions: s.couplingMinExpectedCollisions,
    alpha: s.couplingAlphaPct / 100,
    liftTolerance: s.couplingLiftTolerancePct / 100,
    rotations: s.couplingRotations,
    reviewHorizonDays: s.couplingReviewHorizonDays,
    reviewCap: s.couplingReviewCap,
    autoPropagate: s.couplingLedgerAutoPropagate,
  });
}

/* ------------------------------------------------------------------ *
 * 1. Special functions — Φ, Φ⁻¹ and the bivariate normal Φ₂
 * ------------------------------------------------------------------ */

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |ε| < 7.5e-8). */
export function normalCdf(z) {
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const poly = t * (0.319381530
    + t * (-0.356563782
      + t * (1.781477937
        + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - tail : tail;
}

/** Inverse standard normal (Wichura AS241). */
export function inverseNormalCdf(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const q = p - 0.5;
  if (Math.abs(q) < 0.425) {
    const r = 0.180625 - q * q;
    const num = (((((((2509.0809287301226727 * r + 33430.575583588128105) * r
      + 67265.770927008700853) * r + 45921.953931549871457) * r
      + 13731.693765509461125) * r + 1971.5909503065514427) * r
      + 133.14166789178437745) * r + 3.387132872796366608);
    const den = ((((((5226.495278852545703 * r + 28729.085735721942674) * r
      + 39307.89580009271061) * r + 21213.794301586595867) * r
      + 5394.1960214247511077) * r + 687.1870074920579083) * r
      + 42.313330701600911252) * r + 1;
    return (q * num) / den;
  }
  let r = Math.sqrt(-Math.log(q > 0 ? 1 - p : p));
  let value;
  if (r <= 5) {
    r -= 1.6;
    const num = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r
      + 0.24178072517745061177) * r + 1.27045825245236838258) * r
      + 3.64784832476320460504) * r + 5.7694972214606914055) * r
      + 4.6303378461565452959) * r + 1.42343711074968357734);
    const den = ((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r
      + 0.0151986665636164571966) * r + 0.14810397642748007459) * r
      + 0.68976733498510000455) * r + 1.6763848301838038494) * r
      + 2.05319162663775882187) * r + 1;
    value = num / den;
  } else {
    r -= 5;
    const num = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r
      + 0.0012426609473880784386) * r + 0.026532189526576123093) * r
      + 0.29656057182850489123) * r + 1.7848265399172913358) * r
      + 5.4637849111641143699) * r + 6.6579046435011037772);
    const den = ((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r
      + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r
      + 0.0148753612908506148525) * r + 0.13692988092273580531) * r
      + 0.59983220655588793769) * r + 1;
    value = num / den;
  }
  return q < 0 ? -value : value;
}

const QUAD_GRID = (() => {
  const n = 8000;
  const a = -10;
  const b = 10;
  const step = (b - a) / n;
  const xs = new Float64Array(n + 1);
  const phi = new Float64Array(n + 1);
  for (let i = 0; i <= n; i += 1) {
    const x = a + i * step;
    xs[i] = x;
    phi[i] = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }
  return { n, step, xs, phi };
})();

/**
 * Bivariate standard normal CDF by the one-factor representation
 *
 *     X = √ρ·T + √(1−ρ)·U,  T, U independent standard normals
 *     Φ₂(h,k;ρ) = ∫ φ(t)·Φ((h − √ρt)/√(1−ρ))·Φ((k − √ρt)/√(1−ρ)) dt
 *
 * THE BUG THIS REPLACES: the first build conditioned on T and integrated
 * Φ((h − ρt)/√(1−ρ²)) — the tempting shortcut — which is the CDF for a
 * correlation of **ρ²**. At ρ = 0.5 it returned 0.290 against a true 0.333, a
 * 13-point error in the middle of the range this module reads. The grid had to
 * move too: the integrand's feature width is √(1−ρ), so a panel count that is
 * accurate at ρ = 0.3 is badly wrong at ρ = 0.95; panels now scale with
 * 1/√(1−ρ). Pinned against Φ₂(0,0;ρ) = ¼ + arcsin(ρ)/2π.
 */
const BIVARIATE_MEMO = new Map();

export function bivariateNormal(h, k, rho) {
  const r = Math.max(-0.999999, Math.min(0.999999, Number(rho) || 0));
  const key = `${h.toFixed(6)}|${k.toFixed(6)}|${r.toFixed(6)}`;
  const hit = BIVARIATE_MEMO.get(key);
  if (hit !== undefined) return hit;
  let out;
  if (Math.abs(r) < 1e-12) {
    out = normalCdf(h) * normalCdf(k);
  } else if (r < 0) {
    // Φ₂(h,k;ρ) = Φ(h) − Φ₂(h,−k;−ρ): the quadrature only ever runs on a
    // non-negative correlation.
    out = normalCdf(h) - bivariateNormal(h, -k, -r);
  } else {
    const sr = Math.sqrt(r);
    const sn = Math.sqrt(1 - r);
    const panels = Math.min(4000, Math.max(400, Math.ceil(400 / sn)));
    const { n, step, xs, phi } = QUAD_GRID;
    const stride = Math.max(1, Math.round(n / panels));
    let total = 0;
    let j = 0;
    for (let i = 0; i <= n; i += stride) {
      const t = xs[i];
      const f = phi[i]
        * normalCdf((h - sr * t) / sn)
        * normalCdf((k - sr * t) / sn);
      // Simpson: 1 at both ends, 4 on odd panels, 2 on even interior panels.
      const weight = (i === 0 || i + stride > n) ? 1 : (j % 2 === 1 ? 4 : 2);
      total += weight * f;
      j += 1;
    }
    out = (total * step * stride) / 3;
    if (!Number.isFinite(out)) out = normalCdf(h) * normalCdf(k);
    out = Math.min(normalCdf(Math.min(h, k)), Math.max(0, out));
  }
  if (BIVARIATE_MEMO.size > 40000) BIVARIATE_MEMO.clear();
  BIVARIATE_MEMO.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. The declared-ρ → coincidence mapping (a stated convention)
 * ------------------------------------------------------------------ */

/**
 * P(two calls resolve in the same block | copula ρ, k blocks).
 *
 * Each side's marginal is uniform over the k common blocks — the module's own
 * null — and the two uniforms are joined by a Gaussian copula with parameter
 * `rho`. The diagonal cell mass is
 *
 *     P(X = Y = i) = C(u_i,u_i) − 2·C(u_{i−1},u_i) + C(u_{i−1},u_{i−1})
 *
 * so at ρ = 0 the sum telescopes to k·(1/k)² = 1/k (the printed independence
 * rate) and at ρ → 1 it tends to 1. Monotone in ρ over the whole range.
 */
export function collisionProbability(rho, blocks) {
  const k = Math.round(Number(blocks));
  if (!(k > 0)) return 0;
  if (k === 1) return 1;
  const r = Number(rho);
  if (!Number.isFinite(r)) return 1 / k;
  if (r <= -0.999) return 1 / k;
  const z = [];
  for (let i = 0; i <= k; i += 1) z.push(inverseNormalCdf(i / k));
  let total = 0;
  for (let i = 1; i <= k; i += 1) {
    total += bivariateNormal(z[i], z[i], r)
      - 2 * bivariateNormal(z[i - 1], z[i], r)
      + bivariateNormal(z[i - 1], z[i - 1], r);
  }
  return Math.max(0, Math.min(1, total));
}

/** The two printed mappings from a declared ρ to a copula rank correlation. */
export function rankCorrelationMappings(rho) {
  const r = Number(rho) || 0;
  return { identity: r, spearman: 2 * Math.sin((Math.PI * r) / 6) };
}

export function bandFor(rho) {
  const r = Math.max(-0.99, Math.min(0.99, Number(rho) || 0));
  for (const band of COUPLING_BANDS) {
    if (r > band.min && r <= band.max) return band;
  }
  return r > 0.2 ? COUPLING_BANDS[COUPLING_BANDS.length - 1] : COUPLING_BANDS[0];
}

/**
 * The advisory inversion. One moment (a coincidence rate) inverted against a
 * one-parameter curve is a weak estimate: it is printed with an explicit
 * `identified` flag, never applied to a declaration, and refused outright when
 * the observed rate is impossible for any copula parameter.
 */
export function impliedRankCorrelation(observedRate, blocks) {
  const rate = Number(observedRate);
  const k = Math.round(Number(blocks));
  if (!Number.isFinite(rate)) {
    return { rho: null, identified: false, reason: 'no observed rate to invert' };
  }
  const lo = collisionProbability(-0.9, k);
  const hi = collisionProbability(0.99, k);
  if (rate < lo - 1e-9 || rate > hi + 1e-9) {
    return {
      rho: null,
      identified: false,
      reason: `the observed rate is outside the range any copula parameter can produce on a ${k}-block window`,
    };
  }
  let best = null;
  let bestGap = Infinity;
  const gaps = [];
  for (let i = 0; i <= 180; i += 1) {
    const rho = Number((-0.9 + i * 0.01).toFixed(2));
    const gap = Math.abs(collisionProbability(rho, k) - rate);
    gaps.push(gap);
    if (gap < bestGap) { bestGap = gap; best = rho; }
  }
  const flat = gaps.filter((g) => g <= bestGap + 1e-9).length;
  // A minimiser on the edge of the grid is not an estimate: the record is
  // saying "at least this much", not "this much".
  const atEdge = best <= -0.85 || best >= 0.95;
  const identified = flat <= 5 && bestGap <= 0.02 && !atEdge;
  return {
    rho: best,
    identified,
    reason: identified
      ? 'the observed rate pins the copula parameter on this window'
      : 'the curve is too flat here for one moment to identify the parameter',
  };
}

/* ------------------------------------------------------------------ *
 * 3. Observations — realised joint timing from dated decisions
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function dayNumber(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

function isoDay(value) {
  const n = dayNumber(value);
  return n === null ? null : new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function decisionTiming(state, conventions, today) {
  const blockDays = conventions.blockDays;
  const todayDay = dayNumber(today);
  const map = new Map();
  for (const decision of state?.decisions || []) {
    if (!decision || typeof decision.id !== 'string') continue;
    const committedAt = isoDay(decision.decidedOn);
    const enteredAt = isoDay(decision.date) || isoDay(decision.createdAt);
    if (!enteredAt || todayDay === null) continue;
    const startDay = dayNumber(enteredAt);
    const endDay = committedAt ? dayNumber(committedAt) : null;
    const blockOf = (d) => Math.floor(d / blockDays);
    const lo = blockOf(startDay);
    const hi = blockOf(endDay === null ? todayDay : endDay);
    map.set(decision.id, {
      id: decision.id,
      enteredAt,
      committedAt,
      block: endDay === null ? null : blockOf(endDay),
      lo,
      hi: Math.max(lo, hi),
      window: Math.max(1, Math.max(lo, hi) - lo + 1),
    });
  }
  return map;
}

/** Premise → decisions, from the typed graph and the premise's own owner. */
function premiseMembers(state) {
  const map = new Map();
  const add = (premiseId, decisionId) => {
    if (typeof premiseId !== 'string' || typeof decisionId !== 'string') return;
    if (!map.has(premiseId)) map.set(premiseId, new Set());
    map.get(premiseId).add(decisionId);
  };
  for (const premise of state?.premises || []) {
    if (premise && typeof premise.id === 'string') add(premise.id, premise.decisionId);
  }
  for (const link of state?.links || []) {
    if (!link || link.targetType !== 'premise' || link.sourceType !== 'decision') continue;
    if (link.relation !== 'rests-on' && link.relation !== 'tests' && link.relation !== 'assumes') continue;
    add(link.targetId, link.sourceId);
  }
  return map;
}

/**
 * Harvest every declared pair and count the premise-sharing pairs that carry no
 * declaration. A pair is either testable (both members carry a decision date
 * inside a common window wide enough to be able to differ) or refused, and a
 * refusal always carries its reason in text.
 */
export function couplingObservations(state, conventions) {
  const rules = conventions || couplingLedgerConventions({});
  const today = typeof state?.__today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.__today)
    ? state.__today
    : dayKey(new Date());
  const timing = decisionTiming(state, rules, today);
  const declarations = Array.isArray(state?.correlationDeclarations) ? state.correlationDeclarations : [];
  const pairs = [];
  const refusals = [];
  const declaredKeys = new Set();
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const declaration of declarations) {
    if (!declaration || typeof declaration.aId !== 'string' || typeof declaration.bId !== 'string') continue;
    const a = timing.get(declaration.aId);
    const b = timing.get(declaration.bId);
    if (!a || !b) continue;
    declaredKeys.add(pairKey(declaration.aId, declaration.bId));
    const rho = Number(declaration.rho);
    const band = bandFor(rho);
    const base = {
      declarationId: typeof declaration.id === 'string' ? declaration.id : '',
      aId: declaration.aId,
      bId: declaration.bId,
      rho: Number.isFinite(rho) ? rho : 0,
      declaredAt: declaration.declaredAt || null,
      band: band.key,
      bandLabel: band.label,
    };
    if (!a.committedAt || !b.committedAt) {
      const openId = !a.committedAt ? a.id : b.id;
      refusals.push({
        ...base,
        reason: `a member call (${openId}) has not resolved, so there is no realised joint timing to read`,
      });
      continue;
    }
    const commonLo = Math.max(a.lo, b.lo);
    const commonHi = Math.min(a.hi, b.hi);
    const commonBlocks = commonHi - commonLo + 1;
    if (commonHi < commonLo || commonBlocks < 2) {
      refusals.push({
        ...base,
        commonBlocks: Math.max(0, commonBlocks),
        reason: `the pair resolves inside a single 30-day block, where a coincidence is arithmetically certain and carries no evidence`,
      });
      continue;
    }
    pairs.push({
      ...base,
      blockA: a.block,
      blockB: b.block,
      loA: a.lo,
      hiA: a.hi,
      loB: b.lo,
      hiB: b.hi,
      windowA: a.window,
      windowB: b.window,
      commonBlocks,
      collision: a.block === b.block ? 1 : 0,
      collided: a.block === b.block,
      // The analytic independence expectation |A∩B| / (|A|·|B|), printed
      // beside every count so the lift always has a denominator independent of
      // the rotation family.
      expectedCollision: commonBlocks / (a.window * b.window),
    });
  }

  const members = premiseMembers(state);
  // Premises that nominated each decision, so a pair can carry the premises
  // that couple it — RULE-CPL-01 writes a `measures-coupling` edge to each.
  const decisionPremises = new Map();
  for (const [premiseId, set] of members.entries()) {
    for (const id of set) {
      if (!decisionPremises.has(id)) decisionPremises.set(id, new Set());
      decisionPremises.get(id).add(premiseId);
    }
  }
  const premisesOf = (id) => decisionPremises.get(id) || new Set();
  for (const pair of pairs) {
    const b = premisesOf(pair.bId);
    pair.premiseIds = [...premisesOf(pair.aId)].filter((id) => b.has(id));
  }
  let undeclared = 0;
  const undeclaredPairs = [];
  for (const [premiseId, set] of members.entries()) {
    const ids = [...set].filter((id) => timing.has(id));
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        if (declaredKeys.has(pairKey(ids[i], ids[j]))) continue;
        undeclared += 1;
        const existing = undeclaredPairs.find((row) => row.aId === ids[i] && row.bId === ids[j]);
        if (existing) existing.premiseIds.push(premiseId);
        else if (undeclaredPairs.length < 60) {
          undeclaredPairs.push({ premiseId, premiseIds: [premiseId], aId: ids[i], bId: ids[j] });
        }
      }
    }
  }

  return { pairs, refusals, undeclared, undeclaredPairs, timing, today, conventions: rules };
}

/* ------------------------------------------------------------------ *
 * 4. The rotation null
 * ------------------------------------------------------------------ */

/**
 * Pooled rotation test over a set of testable pairs.
 *
 * Each decision gets ONE block placement per rotation,
 * `lo + ((block − lo + s) mod window)` with `s = (rotation + 31·index) mod
 * window`. Because s ↦ (rotation + 31·index) mod window is a bijection for each
 * decision, the family is equidistributed over every placement the call can
 * take; because a call in several pairs is placed once, the pooled statistic
 * never pretends the coupling graph is independent.
 */
export function rotationTest(pairs, rotations = 1000) {
  const list = Array.isArray(pairs) ? pairs : [];
  const r = Math.max(100, Math.round(Number(rotations) || 1000));
  if (!list.length) {
    return {
      testablePairs: 0,
      collisions: 0,
      expectedCollisions: 0,
      nullMeanCollisions: null,
      pValue: null,
      pValueLow: null,
      lift: null,
      rotations: r,
      minAttainableP: 1 / (r + 1),
    };
  }
  const observed = list.reduce((sum, pair) => sum + pair.collision, 0);
  const expected = list.reduce((sum, pair) => sum + pair.expectedCollision, 0);
  const order = [];
  const seen = new Set();
  for (const pair of list) {
    for (const id of [pair.aId, pair.bId]) {
      if (!seen.has(id)) { seen.add(id); order.push(id); }
    }
  }
  const geometry = new Map();
  order.forEach((id, i) => {
    const pair = list.find((p) => p.aId === id || p.bId === id);
    const isA = pair.aId === id;
    const lo = isA ? pair.loA : pair.loB;
    const hi = isA ? pair.hiA : pair.hiB;
    geometry.set(id, {
      lo,
      window: Math.max(1, hi - lo + 1),
      block: isA ? pair.blockA : pair.blockB,
      spin: 31 * i,
    });
  });
  const placed = new Map();
  let atLeast = 0;
  let atMost = 0;
  let totalNull = 0;
  for (let m = 0; m < r; m += 1) {
    placed.clear();
    for (const id of order) {
      const g = geometry.get(id);
      if (g.window <= 1) { placed.set(id, g.block); continue; }
      const shift = (m + g.spin) % g.window;
      placed.set(id, g.lo + ((((g.block - g.lo + shift) % g.window) + g.window) % g.window));
    }
    let total = 0;
    for (const pair of list) {
      if (placed.get(pair.aId) === placed.get(pair.bId)) total += 1;
    }
    totalNull += total;
    if (total >= observed) atLeast += 1;
    if (total <= observed) atMost += 1;
  }
  return {
    testablePairs: list.length,
    collisions: observed,
    expectedCollisions: expected,
    nullMeanCollisions: totalNull / r,
    pValue: (1 + atLeast) / (r + 1),
    pValueLow: (1 + atMost) / (r + 1),
    lift: expected > 0 ? observed / expected : null,
    rotations: r,
    minAttainableP: 1 / (r + 1),
  };
}

/* ------------------------------------------------------------------ *
 * 5. Verdicts and assessments
 * ------------------------------------------------------------------ */

/**
 * The verdict for one band. Every floor comes from the conventions object that
 * was actually passed in — never from the band descriptor, where `minPairs`,
 * `alpha` and `liftTolerance` are `undefined` and every floor silently
 * disappears. That was a real defect in the first build: a two-pair band
 * printed `coupled`.
 */
export function verdictFor({ conventions, testablePairs, expectedCollisions, lift, pValue, pValueLow }) {
  const c = conventions || {};
  const minPairs = Number.isFinite(c.minPairs) ? c.minPairs : 4;
  const minExpected = Number.isFinite(c.minExpectedCollisions) ? c.minExpectedCollisions : 1;
  const alpha = Number.isFinite(c.alpha) ? c.alpha : 0.05;
  const tolerance = Number.isFinite(c.liftTolerance) ? c.liftTolerance : 0.25;
  if (!testablePairs || testablePairs < minPairs) return 'insufficient';
  if (!(expectedCollisions >= minExpected)) return 'unidentifiable';
  if (!Number.isFinite(lift)) return 'inconclusive';
  const upper = Number.isFinite(pValue) ? pValue : 1;
  const lower = Number.isFinite(pValueLow) ? pValueLow : 1;
  if (Math.abs(lift - 1) <= tolerance && upper > alpha && lower > alpha) return 'independent';
  if (upper <= alpha && lift > 1) return 'coupled';
  if (lower <= alpha && lift < 1) return 'hedged';
  return 'inconclusive';
}

function assessFor(verdict, declaredMidRho, observedPct, modelPct, materialityPct) {
  if (verdict === 'insufficient' || verdict === 'unidentifiable' || verdict === 'inconclusive') {
    return 'unresolved';
  }
  const weak = Math.abs(declaredMidRho) <= 0.2;
  if (verdict === 'independent') return weak ? 'confirmed' : 'over-declared';
  if (verdict === 'hedged') return weak ? 'confirmed' : 'over-declared';
  if (weak) return 'under-declared';
  const delta = observedPct - modelPct;
  if (Math.abs(delta) <= materialityPct) return 'confirmed';
  return delta > 0 ? 'understated' : 'overstated';
}

const MAGNITUDE = new Set(['over-declared', 'under-declared', 'overstated', 'understated']);

/* ------------------------------------------------------------------ *
 * 6. The report
 * ------------------------------------------------------------------ */

export function analyseBands(observations, conventions) {
  const rules = conventions || couplingLedgerConventions({});
  const buckets = new Map();
  const bucketFor = (key) => {
    if (!buckets.has(key)) buckets.set(key, { pairs: [], refusals: [] });
    return buckets.get(key);
  };
  for (const pair of observations.pairs) bucketFor(pair.band).pairs.push(pair);
  for (const refusal of observations.refusals) bucketFor(refusal.band).refusals.push(refusal);

  const bands = [];
  for (const band of COUPLING_BANDS) {
    const bucket = buckets.get(band.key);
    if (!bucket) continue;
    const all = [...bucket.pairs, ...bucket.refusals];
    const testable = bucket.pairs;
    const rotation = rotationTest(testable, rules.rotations);
    const declaredMidRho = all.reduce((sum, row) => sum + row.rho, 0) / all.length;
    const observedPct = testable.length ? (rotation.collisions / testable.length) * 100 : 0;
    const modelFor = (mapping) => (testable.length
      ? (testable.reduce((sum, pair) => {
        const mapped = mapping === 'spearman'
          ? rankCorrelationMappings(pair.rho).spearman
          : pair.rho;
        return sum + collisionProbability(mapped, pair.commonBlocks);
      }, 0) / testable.length) * 100
      : 0);
    const modelByMapping = [
      { mapping: 'identity', label: 'τ = ρ', collisionAllTestablePct: modelFor('identity') },
      { mapping: 'spearman', label: 'τ = 2·sin(πρ/6)', collisionAllTestablePct: modelFor('spearman') },
    ];
    const modelCollisionPct = modelByMapping[0].collisionAllTestablePct;
    const modelSpearmanPct = modelByMapping[1].collisionAllTestablePct;
    const modelIndependentPct = testable.length
      ? (testable.reduce((sum, pair) => sum + 100 / pair.commonBlocks, 0) / testable.length)
      : 0;
    const materiality = Math.max(5, 0.2 * modelCollisionPct);
    const verdict = verdictFor({
      conventions: rules,
      testablePairs: rotation.testablePairs,
      expectedCollisions: rotation.expectedCollisions,
      lift: rotation.lift,
      pValue: rotation.pValue,
      pValueLow: rotation.pValueLow,
    });
    const assessment = assessFor(verdict, declaredMidRho, observedPct, modelCollisionPct, materiality);
    const assessmentAlt = assessFor(verdict, declaredMidRho, observedPct, modelSpearmanPct, materiality);
    // A magnitude finding the second defensible mapping would overturn is
    // reported as mapping-dependent, and no work is opened on it.
    const mappingDisagreement = MAGNITUDE.has(assessment) && assessmentAlt !== assessment;
    const contradiction = MAGNITUDE.has(assessment) && !mappingDisagreement;
    const meanBlocks = testable.length
      ? Math.round(testable.reduce((sum, pair) => sum + pair.commonBlocks, 0) / testable.length)
      : 2;
    const implied = impliedRankCorrelation(observedPct / 100, meanBlocks);
    const round1 = (v) => Math.round(v * 10) / 10;
    bands.push({
      key: band.key,
      label: band.label,
      declaredMinRho: band.min,
      declaredMaxRho: band.max,
      declaredMidRho,
      pairs: all.length,
      testablePairs: rotation.testablePairs,
      refusals: bucket.refusals.length,
      collisions: rotation.collisions,
      expectedCollisions: rotation.expectedCollisions,
      nullMeanCollisions: rotation.nullMeanCollisions,
      lift: rotation.lift,
      pValue: rotation.pValue,
      pValueLow: rotation.pValueLow,
      rotations: rotation.rotations,
      minAttainableP: rotation.minAttainableP,
      floorP: rotation.minAttainableP,
      verdict,
      assessment,
      assessmentText: COUPLING_ASSESSMENT_TEXT[assessment],
      verdictText: COUPLING_VERDICT_TEXT[verdict],
      contradiction,
      mappingDisagreement,
      alpha: rules.alpha,
      // The pair rows this band audits, and the median common window the
      // copula reference was evaluated on (printed, so the reader can see the
      // grains the model used).
      rows: testable,
      medianBlocks: meanBlocks,
      hint: `${COUPLING_VERDICT_TEXT[verdict]} across ${rotation.testablePairs} testable pair(s) whose common windows were wide enough for a coincidence to be possible — ${COUPLING_ASSESSMENT_TEXT[assessment]}.`,
      observedCollisionPct: round1(observedPct),
      modelCollisionPct: round1(modelCollisionPct),
      modelSpearmanPct: round1(modelSpearmanPct),
      modelIndependentPct: round1(modelIndependentPct),
      modelByMapping: modelByMapping.map((row) => ({
        ...row,
        collisionAllTestablePct: round1(row.collisionAllTestablePct),
      })),
      materiality: round1(materiality),
      // The printed reference curve, so the panel draws the model it quotes.
      implied: {
        rho: implied.rho,
        identified: implied.identified,
        reason: implied.reason,
        grid: collisionCurve(meanBlocks),
      },
      impliedRho: implied.rho,
      impliedIdentified: implied.identified,
      impliedReason: implied.reason,
      blockDays: rules.blockDays,
    });
  }
  return bands;
}

/**
 * `reviewOn` IS the window close. Storing the close date (rather than the freeze
 * date) is what makes a review gradable exactly once, on the day its own claim
 * falls due — and it is why the panel prints it as "Window closes".
 */
function reviewCloseDay(record) {
  return isoDay(record.reviewOn);
}

function dueReviewRecords(reviews, today) {
  return reviews.filter((record) => {
    if (!record || record.graded) return false;
    const close = reviewCloseDay(record);
    return close !== null && close <= today;
  });
}

export function couplingLedgerReport(state, now = new Date(), settings = {}) {
  const conventions = couplingLedgerConventions(settings);
  const today = dayKey(now);
  const observations = couplingObservations({ ...state, __today: today }, conventions);
  const bands = analyseBands(observations, conventions);
  const reviews = Array.isArray(state?.couplingReviews) ? state.couplingReviews : [];
  const due = dueReviewRecords(reviews, today);
  const totals = bands.reduce((acc, band) => ({
    declarations: acc.declarations + band.pairs,
    testable: acc.testable + band.testablePairs,
    collisions: acc.collisions + band.collisions,
    expectedCollisions: acc.expectedCollisions + band.expectedCollisions,
  }), { declarations: 0, testable: 0, collisions: 0, expectedCollisions: 0 });
  const graded = reviews.filter((record) => record.graded && Number.isFinite(record.graded.brier));
  const meanBrier = graded.length
    ? graded.reduce((sum, record) => sum + record.graded.brier, 0) / graded.length
    : null;
  return {
    ok: true,
    today,
    conventions,
    observations,
    bands,
    reviews,
    records: reviews.slice().sort((a, b) => String(b.frozenAt || '').localeCompare(String(a.frozenAt || ''))),
    undeclared: observations.undeclaredPairs,
    calibration: {
      graded: graded.length,
      meanBrier,
      verdict: !graded.length
        ? 'no frozen review has been graded yet, so nothing about this ledger’s own forecasting is claimed'
        : graded.length < 5
          ? `${graded.length} review(s) graded · Brier ${meanBrier.toFixed(3)} — skill is not claimed below five graded reviews`
          : `${graded.length} reviews graded · mean Brier ${meanBrier.toFixed(3)}`,
    },
    due,
    counts: {
      declarations: totals.declarations,
      testable: totals.testable,
      refused: observations.refusals.length,
      undeclared: observations.undeclared,
      bands: bands.length,
      reviews: reviews.length,
      due: due.length,
      contradictions: bands.filter((band) => band.contradiction).length,
      failures: bands.filter((band) => contradictionOf(band)).length,
    },
    totals: {
      ...totals,
      lift: totals.expectedCollisions > 0 ? totals.collisions / totals.expectedCollisions : null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 7. Freezing and grading
 * ------------------------------------------------------------------ */

/**
 * Freeze the current reading as one aggregate-only record.
 *
 * The prospective number is P(at least one open member call of the reviewed
 * graph resolves inside the review window), from the workspace's own
 * Laplace-smoothed commitment hazard re-based to THIS review's window. Reading a
 * 90-day base rate straight into a 30-day claim was a real defect in the first
 * build: it produced 95.7% where 65.1% was correct and the demo's own grade went
 * from Brier 0.0018 to 0.1218.
 */
export function buildCouplingReview(report, state, now = new Date(), idPrefix = 'cpl') {
  const conventions = report?.conventions || couplingLedgerConventions(state?.settings);
  const horizon = conventions.reviewHorizonDays;
  const memberIds = new Set();
  for (const pair of report?.observations?.pairs || []) {
    memberIds.add(pair.aId);
    memberIds.add(pair.bId);
  }
  for (const refusal of report?.observations?.refusals || []) {
    memberIds.add(refusal.aId);
    memberIds.add(refusal.bId);
  }
  if (!memberIds.size) {
    return { ok: false, reason: 'no declarations exist to review' };
  }
  if (!report?.bands?.length) {
    return { ok: false, reason: 'no band carries a readable declaration' };
  }
  const timing = report.observations.timing;
  const openMembers = [...memberIds].filter((id) => timing.get(id) && !timing.get(id).committedAt);
  if (!openMembers.length) {
    return {
      ok: false,
      reason: 'every member call has already resolved — there is no arrival left to forecast, and a prediction written after the answer is known is not a test',
    };
  }
  const resolvedHistory = [...timing.values()].filter((row) => row.committedAt);
  if (resolvedHistory.length < 5) {
    return {
      ok: false,
      reason: `only ${resolvedHistory.length} dated call(s) have resolved, too few to estimate a commitment hazard for a forecast`,
    };
  }
  const withHazard = resolvedHistory.filter((row) => {
    const start = dayNumber(row.enteredAt);
    const end = dayNumber(row.committedAt);
    return Number.isFinite(start) && Number.isFinite(end) && end - start <= horizon;
  });
  const hazard = (withHazard.length + 1) / (resolvedHistory.length + 2);
  const predicted = (1 - (1 - hazard) ** openMembers.length) * 100;
  const today = dayKey(now);
  const record = {
    id: idPrefix,
    frozenAt: new Date(now).toISOString(),
    reviewOn: isoDay(addDays(today, horizon)),
    windowDays: horizon,
    blockDays: conventions.blockDays,
    rotations: conventions.rotations,
    memberIds: [...memberIds].slice(0, 400),
    premiseIds: [],
    pairCount: new Set([...memberIds]).size ? report.observations.pairs.length + report.observations.refusals.length : 0,
    testablePairs: report.totals.testable,
    openMembers: openMembers.length,
    bands: report.bands.map((band) => ({
      key: band.key,
      label: band.label,
      declaredMidRho: band.declaredMidRho,
      declaredMinRho: band.declaredMinRho,
      declaredMaxRho: band.declaredMaxRho,
      pairs: band.pairs,
      testablePairs: band.testablePairs,
      collisions: band.collisions,
      expectedCollisions: band.expectedCollisions,
      lift: band.lift,
      pValue: band.pValue,
      pValueLow: band.pValueLow,
      rotations: band.rotations,
      verdict: band.verdict,
      assessment: band.assessment,
      contradiction: band.contradiction,
      mappingDisagreement: band.mappingDisagreement,
      observedCollisionPct: band.observedCollisionPct,
      modelCollisionPct: band.modelCollisionPct,
      modelSpearmanPct: band.modelSpearmanPct,
      modelIndependentPct: band.modelIndependentPct,
      impliedRho: band.impliedRho,
      impliedIdentified: band.impliedIdentified,
      materiality: band.materiality,
      blockDays: band.blockDays,
      minAttainableP: band.minAttainableP,
    })),
    pairs: [],
    hazardPct: hazard * 100,
    hazardBasis: `${withHazard.length} of ${resolvedHistory.length} dated calls resolved within ${horizon} days of their start (Laplace-smoothed to ${(hazard * 100).toFixed(2)}%), applied to ${openMembers.length} open member call(s) over this ${horizon}-day window`,
    predictedAnyCommitPct: Math.round(predicted * 10) / 10,
    graded: null,
    challengeNotes: [],
  };
  return { ok: true, record };
}

/** Grade a frozen review exactly once, and only after its window closes. */
export function gradeCouplingReview(record, state, now = new Date()) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'no review was supplied' };
  if (record.graded) return { ok: false, reason: 'this review has already been scored once' };
  const close = reviewCloseDay(record);
  const today = dayKey(now);
  if (close === null) return { ok: false, reason: 'the review has no readable window' };
  if (close > today) {
    return { ok: false, reason: `Wait until the window closes on ${close}; grading now would score a claim before its outcome exists` };
  }
  const byId = new Map((state?.decisions || []).map((decision) => [decision.id, decision]));
  const members = (record.memberIds || []).filter((id) => byId.has(id));
  if (!members.length) return { ok: false, reason: 'none of the reviewed calls still exist' };
  const anyCommitted = members.some((id) => {
    const decidedOn = isoDay(byId.get(id).decidedOn);
    return decidedOn !== null && decidedOn <= close;
  });
  const predicted = Math.min(1, Math.max(0, (Number(record.predictedAnyCommitPct) || 0) / 100));
  const outcome = anyCommitted ? 1 : 0;
  const brier = (predicted - outcome) ** 2;
  return {
    ok: true,
    grade: {
      gradedAt: new Date(now).toISOString(),
      anyCommitted,
      gradedMembers: members.length,
      brier,
    },
    anyCommitted,
    brier,
  };
}

/* ------------------------------------------------------------------ *
 * 8. Signals and the brief
 * ------------------------------------------------------------------ */

/**
 * CPL-01..05 in the workspace's own signal shape — `ruleId`, `domain`,
 * `detail`, `severity`, `evidence` and `action { label, route }` — because these
 * are consumed by the Signals board, the domain roll-up, Today and the nav
 * badge, not by this module's panel. A signal that only carried `id`/`why`
 * would appear on the board with an undefined rule and an unreachable action.
 */
export function couplingLedgerSignals(state, now = new Date(), settings = {}) {
  const conventions = couplingLedgerConventions(settings);
  const today = dayKey(now);
  const observations = couplingObservations({ ...state, __today: today }, conventions);
  const reviews = Array.isArray(state?.couplingReviews) ? state.couplingReviews : [];
  const signals = [];
  const push = (ruleId, title, detail, evidence, severity, route) => signals.push({
    ruleId,
    domain: 'Coupling ledger',
    title,
    detail,
    severity,
    confidence: 'high',
    evidence,
    action: { label: 'Open the Coupling Ledger', route },
  });

  // A frozen review is the quotable record, so it is read first: what was
  // written down outranks what the engine would say today.
  for (const record of reviews) {
    for (const band of record.bands || []) {
      const quoted = [
        `Frozen ${String(record.frozenAt || '').slice(0, 10)} · window closes ${record.reviewOn}`,
        `${band.testablePairs} testable pair(s) · ${band.collisions} coincidence(s) · ${Number(band.expectedCollisions).toFixed(2)} expected under independent timing`,
        `Lift ${band.lift === null || band.lift === undefined ? '—' : Number(band.lift).toFixed(2)} · p ${Number(band.pValue).toFixed(3)} · deficit p ${Number(band.pValueLow).toFixed(3)}`,
        `Declared ρ ${band.declaredMidRho} implies ${Number(band.modelCollisionPct).toFixed(1)}% coincidence on this record's own windows; observed ${Number(band.observedCollisionPct).toFixed(1)}%`,
      ];
      if (band.assessment === 'under-declared' && band.contradiction === true) {
        push('CPL-01',
          `Declared near-independent, resolved together: ${band.collisions} coincidence(s) in the ${band.label.toLowerCase()} band`,
          'Your own resolution dates put these calls in the same calendar block more often than independence allows, while the declaration priced them as separate. The frozen figures stand as history — a new declaration appends a challenge, never a rewrite.',
          quoted, 3, '#/deferral?panel=coupling');
      }
      if (band.assessment === 'over-declared' && band.contradiction === true) {
        push('CPL-02',
          `Declared coupled, resolved apart: no coincidence where the ${band.label.toLowerCase()} band predicted ${Number(band.modelCollisionPct).toFixed(0)}%`,
          'The joint tail in the Portfolio tab is describing a world your resolution dates do not show. The deficit tail carries this reading: with zero coincidences the upper test returns p = 1 forever, so a confirm-the-declaration test could never have reported it.',
          quoted, 3, '#/deferral?panel=coupling');
      }
    }
  }

  const due = dueReviewRecords(reviews, today);
  if (due.length) {
    push('CPL-03',
      `${due.length} frozen coupling review(s) are due for grading`,
      'A frozen coupling review grades once, from the resolutions inside its own window. Grading is refused before the window closes, so an ungraded review is either still open or overdue.',
      due.slice(0, 4).map((record) => `Frozen ${String(record.frozenAt || '').slice(0, 10)} · window closed ${record.reviewOn} · claimed ${record.predictedAnyCommitPct}%`),
      2, '#/deferral?panel=coupling');
  }

  // The live reading is only surfaced when nothing is frozen yet; otherwise the
  // frozen record is the claim and the live number is the panel's business.
  const live = analyseBands(observations, conventions);
  for (const band of live) {
    if (!reviews.length && band.contradiction && (band.assessment === 'under-declared' || band.assessment === 'over-declared')) {
      push(band.assessment === 'under-declared' ? 'CPL-01' : 'CPL-02',
        `Live reading: the ${band.label.toLowerCase()} band ${band.assessment === 'under-declared' ? 'resolved together more often than declared' : 'resolved apart where it declared coupling'}`,
        'Nothing is frozen yet, so this reading has no graded record behind it. Freeze it to make it a claim that can be scored.',
        [
          `${band.testablePairs} testable pair(s) · ${band.collisions} coincidence(s) · ${Number(band.expectedCollisions).toFixed(2)} expected`,
          `Lift ${band.lift === null ? '—' : Number(band.lift).toFixed(2)} · p ${Number(band.pValue).toFixed(3)} / deficit p ${Number(band.pValueLow).toFixed(3)}`,
        ],
        2, '#/deferral?panel=coupling');
    }
  }

  if (observations.undeclared > 0) {
    push('CPL-04',
      `${observations.undeclared} premise-sharing pair(s) carry no declared ρ`,
      'The typed graph identified these pairs; the correlation is the leader’s to declare. Until it is, the Portfolio tab refuses the joint tail for its book and this ledger cannot audit a number that does not exist.',
      observations.undeclaredPairs.slice(0, 4).map((row) => `Shared premise ${row.premiseId} · ${row.premiseIds.length} shared premise(s)`),
      1, '#/deferral?panel=portfolio');
  }

  const refusedOpen = observations.refusals.filter((row) => /has not resolved/.test(row.reason)).length;
  if (refusedOpen > 0) {
    push('CPL-05',
      `${refusedOpen} declared pair(s) cannot be read yet`,
      'One member of each pair is still open. An open member is refused with its reason and never counted as a non-coincidence, so the ledger waits rather than assuming the calls resolved apart.',
      observations.refusals.filter((row) => /has not resolved/.test(row.reason)).slice(0, 4).map((row) => row.reason),
      1, '#/deferral?panel=coupling');
  }

  return signals;
}

export function couplingLedgerAttentionCount(state, now = new Date(), settings = {}) {
  return couplingLedgerSignals(state, now, settings)
    .filter((signal) => signal.ruleId !== 'CPL-04').length;
}

export function couplingLedgerBrief(report, now = new Date()) {
  const lines = [];
  const counts = report?.counts || {};
  lines.push(`COUPLING LEDGER — ${dayKey(now)}`);
  lines.push(`${counts.declarations || 0} declared pair(s); ${counts.testable || 0} testable; ${counts.refused || 0} refused; ${counts.undeclared || 0} premise-sharing pair(s) undeclared.`);
  if (!report?.bands?.length) {
    lines.push('No band carries a readable declaration. Nothing is reported rather than a false reading.');
    return lines.join('\n');
  }
  for (const band of report.bands) {
    const head = `${band.label} (ρ ${band.declaredMinRho}…${band.declaredMaxRho}): ${band.testablePairs} testable pair(s)`;
    if (band.verdict === 'insufficient' || band.verdict === 'unidentifiable') {
      lines.push(`${head} — ${band.verdictText}. No assessment is printed.`);
      continue;
    }
    const lift = band.lift === null || band.lift === undefined ? '—' : Number(band.lift).toFixed(2);
    lines.push(`${head} — ${band.collisions} coincidence(s) vs ${Number(band.expectedCollisions).toFixed(2)} expected (lift ${lift}); p ${Number(band.pValue).toFixed(3)}, deficit p ${Number(band.pValueLow).toFixed(3)}; ${band.verdict}. ${band.assessmentText}.`);
    lines.push(`  Declared ρ implies ${Number(band.modelCollisionPct).toFixed(1)}% coincidence on this record's own windows; observed ${Number(band.observedCollisionPct).toFixed(1)}%; independence ${Number(band.modelIndependentPct).toFixed(1)}%.${band.impliedIdentified ? ` Implied ρ ≈ ${band.impliedRho} (advisory, never applied).` : ' The implied ρ is not identified by this record.'}`);
    if (band.mappingDisagreement) {
      lines.push('  The magnitude depends on which ρ→τ mapping is used, so no work is opened on it.');
    }
  }
  if (report.due?.length) lines.push(`${report.due.length} review(s) are due for grading.`);
  lines.push('No declaration was written, changed or applied by this module.');
  return lines.join('\n');
}

/** The printed ρ → coincidence curve at a stated block count, for the panel. */
export function collisionCurve(blocks, steps = 25) {
  const k = Math.max(2, Math.round(Number(blocks) || 2));
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const rho = Number((-0.9 + (1.8 * i) / steps).toFixed(3));
    out.push({ rho, pct: collisionProbability(rho, k) * 100 });
  }
  return out;
}
