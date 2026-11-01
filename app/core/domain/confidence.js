/**
 * app/core/domain/confidence.js — the Confidence Transport Terminal (Schema v72,
 * ADR-0064).
 *
 * THE QUESTION THIS MODULE EXISTS FOR
 * -----------------------------------
 * By Session 101 the workspace held more than a hundred places where a leader
 * writes a probability: a decision's "P(this works out well)", an assumption's
 * prior, a study's expected confidence, a recovery plan's adopted probability, a
 * deferral's P(commit by the deadline), a monitoring review's P(any false alarm),
 * a survival reading's per-item chance. Almost every one of those numbers is then
 * used as an input to arithmetic elsewhere in the product — expected value, cost
 * of carry, value of information, queue forecasts — and all of that arithmetic is
 * only as good as the numbers are calibrated.
 *
 * Every other terminal grades something the leader DID. This one grades the
 * instrument that produced the numbers. It answers, in order:
 *
 *   1. When you write "80%", how often is it true — on YOUR record? (A frequency
 *      with an interval, not a personality claim.)
 *   2. Would translating your words into your measured frequencies have helped?
 *      Measured out of sample, in the order reality arrived.
 *   3. What would today's open promises read as, if the certificate travels?
 *
 * NAMED METHODS, IMPLEMENTED RATHER THAN GESTURED AT
 * --------------------------------------------------
 *  - **Brier (1950) proper score.** The only scoring rule used to compare
 *    instruments. Strictly proper, so no map can be rewarded for hedging.
 *  - **Murphy (1973) reliability–resolution–uncertainty decomposition**:
 *    Brier = reliability − resolution + uncertainty, computed on the same
 *    ten-bin partition the isotonic map uses.
 *  - **Prequential (walk-forward) evaluation — Dawid (1984).** Each settlement is
 *    predicted by a map fitted ONLY on the settlements that preceded it, then
 *    scored. This is the honest question ("what would this map have said at the
 *    time?"), and it is why a fitted curve is never reported as if it were a
 *    forecast. The test window is the most recent 240 settlements, so every test
 *    point had a real training history behind it.
 *  - **Platt (1999) scaling** with Platt's smoothed targets, fitted by Newton's
 *    method on two parameters, bounded. Smooth and monotone by construction.
 *  - **Isotonic regression (Barlow, Bartholomew, Bremner & Brunk 1972) on binned
 *    declared probabilities**, solved by pool-adjacent-violators exactly as
 *    Zadrozny & Elkan (2002) recommend for calibration: bin, then pool. Blocks of
 *    contiguous bins with a non-decreasing rate ARE the map.
 *  - **Paired bootstrap interval** on the per-settlement Brier difference, with a
 *    fixed seed, so the same record always prints the same interval and the
 *    claim can be checked. The interval, not the point estimate, decides the
 *    verdict.
 *  - **Wilson (1927) score intervals** for every observed rate on the page.
 *  - **Niculescu-Mizil & Caruana (2005)**: isotonic beats sigmoid when data is
 *    plentiful and overfits when it is not, so both are fitted and the choice is
 *    made out of sample, with the simpler model preferred on ties.
 *
 * WHAT IT REFUSES TO DO, AND WHY THE REFUSALS ARE THE PRODUCT
 * -----------------------------------------------------------
 *  - **It never rewrites a declaration.** The declared number is the record. The
 *    transported number is a second reading printed beside it. Silent correction
 *    would make the calibration read itself a target ("declare 40%, mean 80%"),
 *    and no reader could audit a number that was quietly changed.
 *  - **It never calls transport supported from a fitted curve.** Below
 *    `confidenceMinSamples` it prints counts; below `confidenceMinScored` it
 *    refuses a verdict; and a material gain whose bootstrap interval crosses zero
 *    is "no gain", not "a small gain".
 *  - **It never mixes directions.** Assumptions are the chance something holds;
 *    monitoring reviews are the chance something goes wrong. Every sample is
 *    oriented so 1 is "the declared event happened", and the orientation is
 *    printed in the registry the screen reads.
 *  - **It never treats a half-outcome as a coin.** A decision reviewed "mixed" and
 *    a recovery plan "partially met" are excluded and counted as ambiguous,
 *    because a 0.5 label is a different question, not a noisy answer.
 *  - **It never scores a person.** The unit is the leader's own probability
 *    vocabulary, across modules. There is no per-report calibration anywhere in
 *    this file, and there is no way to ask for one.
 *  - **The certificate is graded once.** A frozen map is applied to the forecasts
 *    that resolve inside its window, scored, and never rewritten. That is the
 *    only prospective test this terminal has, and it says so on the page.
 *
 * Pure module: no DOM, no storage, no network, no Math.random, no wall clock.
 * The injected clock arrives through the caller.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { resolveLinkedEntity } from './cases.js';
import {
  CONFIDENCE_BANDS,
  CONFIDENCE_BOOTSTRAP_SEED,
  CONFIDENCE_DEFAULTS,
  CONFIDENCE_ISO_BLOCK_CAP,
  CONFIDENCE_MAP_SHORT,
  CONFIDENCE_MAX_PCT,
  CONFIDENCE_MIN_PCT,
  CONFIDENCE_SIGNAL_IDS,
  CONFIDENCE_SAMPLE_CAP,
  CONFIDENCE_SOURCE_IDS,
  CONFIDENCE_SOURCES,
  CONFIDENCE_VERDICT_LABELS,
  confidenceSource,
} from './confidenceRegistry.js';

const MAX_SCORED = 240;
// Precision of the Gaussian prior that pulls the sigmoid toward the identity map.
const PLATT_PRIOR = 0.5;
// A uniform Beta(1,1) prior per reliability bin, in pseudo-observations. It makes
// a bin holding one observation read 33% rather than 0% or 100%, and it vanishes
// as the bin fills. Documented on the Method panel rather than hidden.
const ISO_PSEUDO = 1;

/* -------------------------------------------------------------- arithmetic */

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function round4(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

export function sigmoid(z) {
  if (!Number.isFinite(z)) return 0.5;
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Logit of a probability given in per cent, clamped away from 0 and 100. */
export function logitPct(pct) {
  const p = clamp(pct, 0.5, 99.5) / 100;
  return Math.log(p / (1 - p));
}

/** Wilson (1927) score interval, in per cent, for k successes in n trials. */
export function wilsonInterval(k, n, z = 1.959964) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return { loPct: null, hiPct: null, pct: null };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    pct: round1(p * 100),
    loPct: round1(clamp(((centre - half) / denom) * 100, 0, 100)),
    hiPct: round1(clamp(((centre + half) / denom) * 100, 0, 100)),
  };
}

/** Deterministic PRNG (mulberry32). Seeded, so every interval is reproducible. */
function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validSamples(samples) {
  return (Array.isArray(samples) ? samples : []).filter((s) => s
    && Number.isFinite(s.declaredPct)
    && s.declaredPct >= CONFIDENCE_MIN_PCT && s.declaredPct <= CONFIDENCE_MAX_PCT
    && (s.outcome === 0 || s.outcome === 1));
}

/* ------------------------------------------------------------------ fits */

/**
 * Platt scaling (Platt 1999) with the smoothed targets that make the fit
 * finite: t+ = (n+ + 1)/(n+ + 2), t− = 1/(n− + 2). Newton's method on the two
 * coefficients.
 *
 * The objective carries a Gaussian prior centred on the IDENTITY map (a = 1,
 * b = 0) with precision `PLATT_PRIOR`. On a large record the prior is negligible
 * and this is ordinary Platt scaling; on a short one it is the difference between
 * a fitted curve and a step function pinned to the bounds, which is what an
 * unregularised logistic fit does to separable data. A map that has not earned
 * its bend should look like no map at all.
 */
export function fitPlatt(samples) {
  const rows = validSamples(samples);
  if (rows.length < 4) return { ok: false, reason: 'fewer than four settled forecasts', n: rows.length };
  const nPos = rows.reduce((sum, r) => sum + r.outcome, 0);
  const nNeg = rows.length - nPos;
  if (!nPos || !nNeg) return { ok: false, reason: 'every settled forecast had the same outcome', n: rows.length };
  const tPos = (nPos + 1) / (nPos + 2);
  const tNeg = 1 / (nNeg + 2);
  const prior = PLATT_PRIOR;
  let a = 1;
  let b = 0;
  let converged = false;
  for (let iter = 0; iter < 60; iter += 1) {
    let gA = prior * (a - 1);
    let gB = prior * b;
    let hAA = prior;
    let hAB = 0;
    let hBB = prior;
    for (const row of rows) {
      const x = logitPct(row.declaredPct);
      const p = sigmoid(a * x + b);
      const t = row.outcome === 1 ? tPos : tNeg;
      const d = p - t;
      const w = Math.max(1e-6, p * (1 - p));
      gA += d * x;
      gB += d;
      hAA += w * x * x;
      hAB += w * x;
      hBB += w;
    }
    const det = hAA * hBB - hAB * hAB;
    if (!(Math.abs(det) > 1e-12)) break;
    const stepA = (hBB * gA - hAB * gB) / det;
    const stepB = (-hAB * gA + hAA * gB) / det;
    a = clamp(a - stepA, -6, 6);
    b = clamp(b - stepB, -4, 4);
    if (Math.abs(stepA) < 1e-9 && Math.abs(stepB) < 1e-9) {
      converged = true;
      break;
    }
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, reason: 'the sigmoid fit did not converge', n: rows.length };
  }
  return { ok: true, a: round4(a), b: round4(b), n: rows.length, converged };
}

/**
 * Isotonic calibration on binned declared probabilities (Zadrzony & Elkan 2002):
 * bin the percentages, then pool adjacent violators exactly. Zero-weight bins are
 * removed before pooling, so an empty band cannot drag the map; a value in an
 * empty band maps to the nearest fitted block, and the block list is stored on
 * any certificate so the map can be re-applied years later without re-fitting.
 */
export function fitIsotonic(samples, { bins = CONFIDENCE_DEFAULTS.confidenceBins } = {}) {
  const rows = validSamples(samples);
  if (rows.length < 4) return { ok: false, reason: 'fewer than four settled forecasts', n: rows.length };
  const width = 100 / bins;
  const cells = Array.from({ length: bins }, (_, k) => ({ k, n: 0, x: 0, loPct: k * width, hiPct: (k + 1) * width }));
  for (const row of rows) {
    const k = Math.min(bins - 1, Math.max(0, Math.floor(row.declaredPct / width)));
    cells[k].n += 1;
    cells[k].x += row.outcome;
  }
  const live = cells.filter((c) => c.n > 0);
  if (!live.length) return { ok: false, reason: 'no bin held a settled forecast', n: rows.length };
  // Each occupied bin carries a uniform Beta(1,1) prior in pseudo-observations, so
  // a bin holding a single observation cannot produce a 0% or 100% map. The
  // smoothing is equivalent to weighting each bin by (n + 2) at rate
  // (x + 1)/(n + 2), which is what the pooled block below computes exactly.
  const stack = [];
  for (const cell of live) {
    stack.push({ loPct: cell.loPct, hiPct: cell.hiPct, n: cell.n + 2 * ISO_PSEUDO, x: cell.x + ISO_PSEUDO });
    while (stack.length > 1) {
      const cur = stack[stack.length - 1];
      const prev = stack[stack.length - 2];
      if (prev.x / prev.n <= cur.x / cur.n) break;
      stack.pop();
      stack.pop();
      stack.push({ loPct: prev.loPct, hiPct: cur.hiPct, n: prev.n + cur.n, x: prev.x + cur.x });
    }
  }
  const blocks = stack.slice(0, CONFIDENCE_ISO_BLOCK_CAP).map((block) => ({
    loPct: round1(block.loPct),
    hiPct: round1(block.hiPct),
    pct: round1(clamp((block.x / block.n) * 100, CONFIDENCE_MIN_PCT, CONFIDENCE_MAX_PCT)),
    // The reported weight is the OBSERVED count, never the pseudo-observations:
    // the screen says how much evidence a block stands on, not how much the
    // smoothing pretended it had.
    n: Math.max(0, Math.round(block.n - 2 * ISO_PSEUDO)),
  }));
  // Rounding can invert a pair by a tenth of a point; repair rather than print a
  // map that is not monotone.
  for (let i = 1; i < blocks.length; i += 1) {
    if (blocks[i].pct < blocks[i - 1].pct) blocks[i].pct = blocks[i - 1].pct;
  }
  return { ok: true, blocks, n: rows.length };
}

/** A map value object, so a fitted map and a frozen map go through one function. */
export function mapFromFit(fit, mapType) {
  if (mapType === 'platt') return { mapType, a: fit.a, b: fit.b };
  if (mapType === 'isotonic') return { mapType, blocks: fit.blocks };
  return { mapType: 'identity' };
}

export function mapFromCertificate(cert) {
  if (!cert || !cert.mapType || cert.mapType === 'identity') return { mapType: 'identity' };
  if (cert.mapType === 'platt') return { mapType: 'platt', a: cert.plattA, b: cert.plattB };
  return { mapType: 'isotonic', blocks: cert.isoBlocks || [] };
}

/**
 * Apply a map to a declared percentage. The output is clamped to the Cromwell
 * band: a transport cannot manufacture certainty the record never showed.
 */
export function applyMap(map, declaredPct) {
  const p = clamp(declaredPct, CONFIDENCE_MIN_PCT, CONFIDENCE_MAX_PCT);
  if (!map || !map.mapType || map.mapType === 'identity') return round1(p);
  if (map.mapType === 'platt') {
    if (!Number.isFinite(map.a) || !Number.isFinite(map.b)) return round1(p);
    return round1(clamp(sigmoid(map.a * logitPct(p) + map.b) * 100, CONFIDENCE_MIN_PCT, CONFIDENCE_MAX_PCT));
  }
  const blocks = Array.isArray(map.blocks) ? map.blocks : [];
  if (!blocks.length) return round1(p);
  const hit = blocks.find((block) => p >= block.loPct && p < block.hiPct);
  const out = hit ? hit.pct : (p < blocks[0].loPct ? blocks[0].pct : blocks[blocks.length - 1].pct);
  return round1(clamp(out, CONFIDENCE_MIN_PCT, CONFIDENCE_MAX_PCT));
}

/* ------------------------------------------------------------- the race */

function brierOf(pPct, outcome) {
  const d = pPct / 100 - outcome;
  return d * d;
}

/**
 * The prequential race. For each settlement after the warm-up, every model is
 * fitted on the settlements that came strictly before it and then scored on the
 * one that arrived. Nothing is ever scored on data the model saw.
 */
export function prequentialRace(samples, { minTrain = CONFIDENCE_DEFAULTS.confidenceMinTrain, bootstrap = CONFIDENCE_DEFAULTS.confidenceBootstrap, seed = CONFIDENCE_BOOTSTRAP_SEED } = {}) {
  const rows = validSamples(samples);
  const n = rows.length;
  const start = Math.max(minTrain, n - MAX_SCORED);
  const scored = [];
  for (let i = start; i < n; i += 1) {
    const train = rows.slice(0, i);
    const test = rows[i];
    const errs = { identity: brierOf(test.declaredPct, test.outcome), platt: null, isotonic: null };
    const platt = fitPlatt(train);
    errs.platt = platt.ok ? brierOf(applyMap(mapFromFit(platt, 'platt'), test.declaredPct), test.outcome) : null;
    const iso = fitIsotonic(train);
    errs.isotonic = iso.ok ? brierOf(applyMap(mapFromFit(iso, 'isotonic'), test.declaredPct), test.outcome) : null;
    scored.push({ declaredPct: test.declaredPct, outcome: test.outcome, errs });
  }
  const summarise = (key) => {
    const usable = scored.filter((row) => row.errs[key] !== null);
    if (!usable.length) return { key, n: 0, brier: null, skill: null, wins: 0 };
    const total = usable.reduce((sum, row) => sum + row.errs[key], 0);
    const brier = total / usable.length;
    const base = usable.reduce((sum, row) => sum + row.errs.identity, 0) / usable.length;
    return {
      key,
      n: usable.length,
      brier: round4(brier),
      skill: base > 0 ? round4(1 - brier / base) : null,
      wins: usable.filter((row) => row.errs[key] < row.errs.identity).length,
    };
  };
  const models = ['identity', 'platt', 'isotonic'].map(summarise);
  return { scored: scored.length, models, rows: scored, params: { minTrain, bootstrap, seed } };
}

/**
 * Paired bootstrap on the per-settlement Brier difference (declared minus
 * transported). A positive mean means the map was better. The 5th percentile is
 * the lower bound the verdict uses: a gain that cannot be separated from zero on
 * this record is not called a gain.
 */
export function pairedInterval(race, modelKey, { bootstrap = CONFIDENCE_DEFAULTS.confidenceBootstrap, seed = CONFIDENCE_BOOTSTRAP_SEED } = {}) {
  const diffs = race.rows
    .filter((row) => row.errs[modelKey] !== null)
    .map((row) => row.errs.identity - row.errs[modelKey]);
  if (diffs.length < 4) return { n: diffs.length, mean: null, lo: null, hi: null };
  const mean = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  const rng = makeRng(seed);
  const means = [];
  for (let b = 0; b < bootstrap; b += 1) {
    let sum = 0;
    for (let i = 0; i < diffs.length; i += 1) sum += diffs[Math.floor(rng() * diffs.length)];
    means.push(sum / diffs.length);
  }
  means.sort((x, y) => x - y);
  const at = (q) => means[Math.min(means.length - 1, Math.max(0, Math.floor(q * means.length)))];
  return { n: diffs.length, mean: round4(mean), lo: round4(at(0.05)), hi: round4(at(0.95)) };
}

/**
 * Murphy (1973) decomposition on the same ten-bin partition the isotonic map
 * uses, plus the per-bin reliability table the screen draws.
 */
export function murphyDecomposition(samples, { bins = CONFIDENCE_DEFAULTS.confidenceBins } = {}) {
  const rows = validSamples(samples);
  const width = 100 / bins;
  const cells = Array.from({ length: bins }, (_, k) => ({
    index: k,
    loPct: round1(k * width),
    hiPct: round1((k + 1) * width),
    n: 0,
    x: 0,
    sumPct: 0,
  }));
  for (const row of rows) {
    const k = Math.min(bins - 1, Math.max(0, Math.floor(row.declaredPct / width)));
    cells[k].n += 1;
    cells[k].x += row.outcome;
    cells[k].sumPct += row.declaredPct;
  }
  const n = rows.length;
  const baseRate = n ? rows.reduce((sum, r) => sum + r.outcome, 0) / n : null;
  let reliability = 0;
  let resolution = 0;
  const bands = cells.map((cell) => {
    const observedPct = cell.n ? (cell.x / cell.n) * 100 : null;
    const meanDeclaredPct = cell.n ? cell.sumPct / cell.n : null;
    const wilson = cell.n ? wilsonInterval(cell.x, cell.n) : { loPct: null, hiPct: null };
    if (cell.n && baseRate !== null) {
      const w = cell.n / n;
      reliability += w * ((meanDeclaredPct / 100) - (observedPct / 100)) ** 2;
      resolution += w * ((observedPct / 100) - baseRate) ** 2;
    }
    return {
      index: cell.index,
      loPct: cell.loPct,
      hiPct: cell.hiPct,
      n: cell.n,
      hits: cell.x,
      meanDeclaredPct: meanDeclaredPct === null ? null : round1(meanDeclaredPct),
      observedPct: observedPct === null ? null : round1(observedPct),
      gapPp: cell.n && meanDeclaredPct !== null ? round1(observedPct - meanDeclaredPct) : null,
      loPct95: wilson.loPct,
      hiPct95: wilson.hiPct,
    };
  });
  const brier = n ? rows.reduce((sum, r) => sum + brierOf(r.declaredPct, r.outcome), 0) / n : null;
  return {
    n,
    brier: brier === null ? null : round4(brier),
    reliability: n ? round4(reliability) : null,
    resolution: n ? round4(resolution) : null,
    uncertainty: baseRate === null ? null : round4(baseRate * (1 - baseRate)),
    baseRatePct: baseRate === null ? null : round1(baseRate * 100),
    bands,
  };
}

/* ---------------------------------------------------------- harvesting */

/**
 * Harvest every settled declared probability in the workspace. One adapter per
 * registry source; a source that has nothing to contribute returns nothing and
 * says so in the counts, rather than being silently absent.
 */
export function extractConfidenceSamples(state = {}, { cap = CONFIDENCE_SAMPLE_CAP } = {}) {
  const rows = [];
  const skipped = { ambiguous: 0, undated: 0, unoriented: 0 };
  const push = (row) => {
    if (!row) return;
    const declared = Number(row.declaredPct);
    if (!Number.isFinite(declared)) return;
    const issuedOn = row.issuedOn && /^\d{4}-\d{2}-\d{2}$/.test(row.issuedOn) ? row.issuedOn : null;
    const resolvedOn = row.resolvedOn && /^\d{4}-\d{2}-\d{2}$/.test(row.resolvedOn) ? row.resolvedOn : null;
    if (!resolvedOn) {
      skipped.undated += 1;
      return;
    }
    const horizonDays = issuedOn ? Math.max(0, daysBetween(issuedOn, resolvedOn) ?? 0) : null;
    rows.push({
      key: row.key,
      source: row.source,
      sourceType: row.sourceType || '',
      recordId: row.recordId || '',
      declaredPct: round1(clamp(declared, CONFIDENCE_MIN_PCT, CONFIDENCE_MAX_PCT)),
      outcome: row.outcome,
      issuedOn,
      resolvedOn,
      horizonDays,
    });
  };
  const dayOf = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null);

  // 1. Assumption ledger. The prior is the declaration; the human-recorded
  //    outcome is the answer. Inconclusive outcomes are not a coin flip.
  const premiseById = new Map((state.premises || []).map((p) => [p.id, p]));
  for (const outcome of state.premiseOutcomes || []) {
    if (!outcome || !outcome.premiseId) continue;
    if (outcome.verdict !== 'held' && outcome.verdict !== 'failed') {
      skipped.ambiguous += 1;
      continue;
    }
    const premise = premiseById.get(outcome.premiseId);
    if (!premise || !Number.isFinite(premise.priorPct)) continue;
    push({
      key: `assumptions:${outcome.id}`,
      source: 'assumptions',
      sourceType: 'premise',
      recordId: premise.id,
      declaredPct: premise.priorPct,
      outcome: outcome.verdict === 'held' ? 1 : 0,
      issuedOn: dayOf(premise.createdAt),
      resolvedOn: outcome.settledOn,
    });
  }

  // 2. Decision calls. "P(this works out well)" recorded when the call was made.
  //    Mixed is a different question, not a noisy answer, so it is excluded.
  for (const decision of state.decisions || []) {
    if (!decision || !decision.chosen || !Number.isFinite(decision.forecastProbability)) continue;
    if (!decision.reviewedOn) continue;
    if (decision.outcome === 'mixed') {
      skipped.ambiguous += 1;
      continue;
    }
    if (decision.outcome !== 'good' && decision.outcome !== 'bad') continue;
    push({
      key: `calls:${decision.id}`,
      source: 'calls',
      sourceType: 'decision',
      recordId: decision.id,
      declaredPct: decision.forecastProbability,
      outcome: decision.outcome === 'good' ? 1 : 0,
      issuedOn: decision.decidedOn || decision.date,
      resolvedOn: decision.reviewedOn,
    });
  }

  // 3. Impact studies. The declared confidence is a probability that the
  //    intervention would work; the scored verdict is the answer. Underpowered,
  //    pre-trend and unmeasurable studies say nothing about the leader's words.
  for (const study of state.impactStudies || []) {
    if (!study || !Number.isFinite(study.expectedConfidence) || !study.lockedOn) continue;
    const verdict = study.evaluation && study.evaluation.verdict;
    if (verdict !== 'supported' && verdict !== 'not-supported') {
      if (verdict) skipped.ambiguous += 1;
      continue;
    }
    push({
      key: `studies:${study.id}`,
      source: 'studies',
      sourceType: 'impact',
      recordId: study.id,
      declaredPct: study.expectedConfidence,
      outcome: verdict === 'supported' ? 1 : 0,
      issuedOn: dayOf(study.declaredOn) || dayOf(study.createdAt),
      resolvedOn: study.lockedOn,
    });
  }

  // 4. Recovery plans. The probability frozen at adoption, against the review.
  for (const concern of state.performanceConcerns || []) {
    const prediction = concern && concern.plan && concern.plan.prediction;
    if (!prediction || !Number.isFinite(prediction.probabilityPct)) continue;
    const outcome = concern.outcome;
    if (!outcome || !outcome.reviewedOn) continue;
    if (outcome.verdict === 'partial') {
      skipped.ambiguous += 1;
      continue;
    }
    if (outcome.verdict !== 'met' && outcome.verdict !== 'not-met') continue;
    push({
      key: `recoveries:${concern.id}`,
      source: 'recoveries',
      sourceType: 'perfconcern',
      recordId: concern.id,
      declaredPct: prediction.probabilityPct,
      outcome: outcome.verdict === 'met' ? 1 : 0,
      issuedOn: prediction.frozenOn || concern.plan.adoptedOn,
      resolvedOn: outcome.reviewedOn,
    });
  }

  // 5. Deferral timing. P(committed by the deadline), graded from the record.
  for (const frame of state.deferralFrames || []) {
    if (!frame || !Number.isFinite(frame.predictedCommitByDeadlinePct) || !frame.graded) continue;
    push({
      key: `timing:${frame.id}`,
      source: 'timing',
      sourceType: 'optionframe',
      recordId: frame.id,
      declaredPct: frame.predictedCommitByDeadlinePct,
      outcome: frame.graded.committedByDeadline ? 1 : 0,
      issuedOn: dayOf(frame.frozenAt),
      resolvedOn: dayOf(frame.graded.gradedAt),
    });
  }

  // 6. Monitoring reviews. P(any false alarm) against what was actually surfaced.
  //    The event being declared is the false alarm, so the orientation is direct.
  for (const review of state.integrityReviews || []) {
    if (!review || !Number.isFinite(review.predictedAnyFalseAlarmPct) || !review.graded) continue;
    push({
      key: `signals:${review.id}`,
      source: 'signals',
      sourceType: 'integrityreview',
      recordId: review.id,
      declaredPct: review.predictedAnyFalseAlarmPct,
      outcome: review.graded.anyFalse ? 1 : 0,
      issuedOn: dayOf(review.frozenAt),
      resolvedOn: dayOf(review.graded.gradedAt),
    });
  }

  // 7. Delivery survival. P(still open at the horizon) per item. An exit with no
  //    recorded date cannot be compared to a horizon, so it is censored and
  //    counted rather than guessed — the same rule the survival terminal uses.
  for (const reading of state.survivalReadings || []) {
    if (!reading || !reading.grade || !reading.frozenOn || !reading.horizonDays) continue;
    const horizonDay = addDays(reading.frozenOn, reading.horizonDays);
    for (const prediction of reading.predictions || []) {
      const outcome = prediction && prediction.outcome;
      if (!outcome || outcome.missing) continue;
      let value = null;
      if (outcome.completedOn && outcome.completedOn <= horizonDay) value = 0;
      else if (outcome.abandonedOn && outcome.abandonedOn <= horizonDay) value = 0;
      else if (outcome.completedOn || outcome.abandonedOn) value = 1;
      else if (reading.grade.gradedOn >= horizonDay) value = 1;
      if (value === null) {
        skipped.unoriented += 1;
        continue;
      }
      push({
        key: `delivery:${reading.id}:${prediction.itemKey}`,
        source: 'delivery',
        sourceType: 'reading',
        recordId: reading.id,
        declaredPct: prediction.probabilityPct,
        outcome: value,
        issuedOn: reading.frozenOn,
        resolvedOn: reading.grade.gradedOn,
      });
    }
  }

  // Deduplicate and sort in the order reality arrived. Ties break on the key so
  // the prequential walk is deterministic.
  const seen = new Set();
  const unique = rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  }).sort((a, b) => {
    if (a.resolvedOn !== b.resolvedOn) return a.resolvedOn < b.resolvedOn ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return {
    samples: unique.slice(-cap),
    truncated: Math.max(0, unique.length - cap),
    skipped,
  };
}

/* ------------------------------------------------------------ conventions */

export function confidenceConventions(settings = {}) {
  const s = settings || {};
  const clampInt = (value, min, max, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  };
  return {
    autoPropagate: s.confidenceAutoPropagate !== false,
    minSamples: clampInt(s.confidenceMinSamples, 8, 400, CONFIDENCE_DEFAULTS.confidenceMinSamples),
    minTrain: clampInt(s.confidenceMinTrain, 4, 200, CONFIDENCE_DEFAULTS.confidenceMinTrain),
    minScored: clampInt(s.confidenceMinScored, 6, 400, CONFIDENCE_DEFAULTS.confidenceMinScored),
    materialBrier: clamp(Number(s.confidenceMaterialBrierPct) || CONFIDENCE_DEFAULTS.confidenceMaterialBrierPct, 0, 500) / 10000,
    gapPct: clampInt(s.confidenceGapPct, 5, 40, CONFIDENCE_DEFAULTS.confidenceGapPct),
    reviewDays: clampInt(s.confidenceReviewDays, 7, 180, CONFIDENCE_DEFAULTS.confidenceReviewDays),
    skillFloor: clampInt(s.confidenceSkillFloor, 2, 40, CONFIDENCE_DEFAULTS.confidenceSkillFloor),
    shortDays: clampInt(s.confidenceShortDays, 3, 60, CONFIDENCE_DEFAULTS.confidenceShortDays),
    longDays: clampInt(s.confidenceLongDays, 30, 365, CONFIDENCE_DEFAULTS.confidenceLongDays),
    bins: clampInt(s.confidenceBins, 3, 20, CONFIDENCE_DEFAULTS.confidenceBins),
    bootstrap: clampInt(s.confidenceBootstrap, 100, 4000, CONFIDENCE_DEFAULTS.confidenceBootstrap),
    liveCap: clampInt(s.confidenceLiveCap, 1, 20, CONFIDENCE_DEFAULTS.confidenceLiveCap),
    taskCap: clampInt(s.confidenceTaskCap, 1, 20, CONFIDENCE_DEFAULTS.confidenceTaskCap),
  };
}

export function bandFor(days, conventions) {
  if (!Number.isFinite(days)) return null;
  if (days <= conventions.shortDays) return 'short';
  if (days <= conventions.longDays) return 'medium';
  return 'long';
}

/**
 * The race plus the verdict. `material` is expressed in Brier points and the
 * interval decides; on a tie the simpler instrument wins, because a more flexible
 * map that does not measurably help is a map that will not travel.
 */
export function decide(race, conventions) {
  const byKey = new Map(race.models.map((m) => [m.key, m]));
  const declared = byKey.get('identity');
  const candidates = ['isotonic', 'platt']
    .map((key) => byKey.get(key))
    .filter((m) => m && m.brier !== null && m.n >= conventions.minScored)
    .sort((a, b) => a.brier - b.brier);
  const base = {
    chosen: 'identity',
    verdict: race.scored < conventions.minScored ? 'insufficient' : 'no-gain',
    gain: null,
    interval: null,
  };
  if (!candidates.length) return base;
  const best = candidates[0];
  const gain = round4((declared.brier ?? 0) - best.brier);
  const interval = pairedInterval(race, best.key, { bootstrap: conventions.bootstrap });
  // Simplest-first: if Platt is within the materiality band of the best, prefer
  // it, because two bounded parameters travel better than a step function.
  const platt = byKey.get('platt');
  const isotonic = byKey.get('isotonic');
  let winner = best;
  if (platt && isotonic && platt.brier !== null && isotonic.brier !== null
    && isotonic.key === best.key && platt.brier - isotonic.brier <= conventions.materialBrier) {
    winner = platt;
  }
  const winnerGain = round4((declared.brier ?? 0) - winner.brier);
  const winnerInterval = winner.key === best.key ? interval : pairedInterval(race, winner.key, { bootstrap: conventions.bootstrap });
  if (winnerGain >= conventions.materialBrier && winnerInterval.lo !== null && winnerInterval.lo > 0) {
    return { chosen: winner.key, verdict: 'supported', gain: winnerGain, interval: winnerInterval };
  }
  if (interval.mean !== null && interval.mean <= -conventions.materialBrier && interval.hi !== null && interval.hi < 0) {
    return { chosen: 'identity', verdict: 'harmful', gain: round4(-interval.mean), interval };
  }
  return { chosen: 'identity', verdict: 'no-gain', gain: winnerGain, interval: winnerInterval };
}

/** The fitted map for the chosen instrument, or identity. */
function chosenMap(samples, chosen, conventions) {
  if (chosen === 'platt') {
    const fit = fitPlatt(samples);
    return fit.ok ? { map: mapFromFit(fit, 'platt'), fit } : { map: { mapType: 'identity' }, fit };
  }
  if (chosen === 'isotonic') {
    const fit = fitIsotonic(samples, { bins: conventions.bins });
    return fit.ok ? { map: mapFromFit(fit, 'isotonic'), fit } : { map: { mapType: 'identity' }, fit };
  }
  return { map: { mapType: 'identity' }, fit: { ok: false, reason: 'declared numbers kept' } };
}

/* -------------------------------------------------------- live readings */

/** The graph entity type a source module's records use, for typed edges. */
export function confidenceEntityType(sourceId) {
  return confidenceSource(sourceId)?.entityType || '';
}

function routeFor(state, source, recordId, fallback) {
  const entity = confidenceSource(source);
  if (!entity || !recordId) return fallback;
  try {
    const resolved = resolveLinkedEntity(state, entity.entityType, recordId);
    if (resolved && resolved.route) return resolved.route;
  } catch {
    // A resolver miss is a missing deep link, never a missing reading.
  }
  return fallback;
}

/**
 * Declared probabilities that are still open. These are the only place the map
 * touches the present, and it touches nothing: each row prints the number as
 * written, the number the certificate would render, and the gap between them.
 */
export function liveReadings(state = {}, { conventions, map, certified = false } = {}) {
  const rows = [];
  const today = dayKey(new Date());
  const add = (row) => {
    if (!row || !Number.isFinite(row.declaredPct)) return;
    const transportedPct = applyMap(map, row.declaredPct);
    const source = confidenceSource(row.source);
    rows.push({
      ...row,
      declaredPct: round1(row.declaredPct),
      transportedPct,
      gapPp: round1(row.declaredPct - transportedPct),
      absGapPp: round1(Math.abs(row.declaredPct - transportedPct)),
      direction: row.declaredPct - transportedPct > 0 ? 'over' : row.declaredPct - transportedPct < 0 ? 'under' : 'flat',
      family: source ? source.label : row.source,
      route: routeFor(state, row.source, row.recordId, source ? source.route : '#/confidence'),
      horizonDays: Number.isFinite(row.issuedOn ? (daysBetween(row.issuedOn, today) ?? null) : null)
        ? Math.max(0, daysBetween(row.issuedOn, today) ?? 0) : null,
      band: bandFor(row.issuedOn ? (daysBetween(row.issuedOn, today) ?? null) : null, conventions),
      certified,
    });
  };

  const settledPremises = new Set((state.premiseOutcomes || [])
    .filter((o) => o && (o.verdict === 'held' || o.verdict === 'failed'))
    .map((o) => o.premiseId));
  for (const premise of state.premises || []) {
    if (!premise || !Number.isFinite(premise.priorPct) || settledPremises.has(premise.id)) continue;
    if (premise.humanDisposition === 'retired') continue;
    add({
      key: `live:assumptions:${premise.id}`,
      source: 'assumptions',
      recordId: premise.id,
      label: premise.title || 'An open assumption',
      declaredPct: premise.priorPct,
      issuedOn: premise.createdAt ? String(premise.createdAt).slice(0, 10) : null,
      dueOn: premise.reviewBy || null,
    });
  }
  for (const decision of state.decisions || []) {
    if (!decision || !decision.chosen || !Number.isFinite(decision.forecastProbability)) continue;
    if (decision.outcome !== 'pending') continue;
    add({
      key: `live:calls:${decision.id}`,
      source: 'calls',
      recordId: decision.id,
      label: decision.title || 'An open call',
      declaredPct: decision.forecastProbability,
      issuedOn: decision.decidedOn || decision.date,
      dueOn: decision.reviewOn || null,
    });
  }
  for (const study of state.impactStudies || []) {
    if (!study || study.status === 'scored' || !Number.isFinite(study.expectedConfidence)) continue;
    add({
      key: `live:studies:${study.id}`,
      source: 'studies',
      recordId: study.id,
      label: study.title || 'An open study',
      declaredPct: study.expectedConfidence,
      issuedOn: study.declaredOn ? String(study.declaredOn).slice(0, 10) : null,
      dueOn: null,
    });
  }
  for (const concern of state.performanceConcerns || []) {
    const prediction = concern && concern.plan && concern.plan.prediction;
    if (!prediction || !Number.isFinite(prediction.probabilityPct) || concern.outcome) continue;
    add({
      key: `live:recoveries:${concern.id}`,
      source: 'recoveries',
      recordId: concern.id,
      label: 'A support plan whose prediction is open',
      declaredPct: prediction.probabilityPct,
      issuedOn: prediction.frozenOn || concern.plan.adoptedOn,
      dueOn: concern.plan.reviewOn || null,
    });
  }
  for (const frame of state.deferralFrames || []) {
    if (!frame || frame.graded || frame.lapsedOn || !Number.isFinite(frame.predictedCommitByDeadlinePct)) continue;
    add({
      key: `live:timing:${frame.id}`,
      source: 'timing',
      recordId: frame.id,
      label: frame.label || 'An open timing call',
      declaredPct: frame.predictedCommitByDeadlinePct,
      issuedOn: String(frame.frozenAt || '').slice(0, 10) || null,
      dueOn: frame.reviewOn || null,
    });
  }
  for (const review of state.integrityReviews || []) {
    if (!review || review.graded || !Number.isFinite(review.predictedAnyFalseAlarmPct)) continue;
    add({
      key: `live:signals:${review.id}`,
      source: 'signals',
      recordId: review.id,
      label: review.label || 'An open monitoring review',
      declaredPct: review.predictedAnyFalseAlarmPct,
      issuedOn: String(review.frozenAt || '').slice(0, 10) || null,
      dueOn: review.reviewOn || null,
    });
  }

  const bySource = new Map();
  for (const row of rows) {
    const list = bySource.get(row.source) || [];
    list.push(row);
    bySource.set(row.source, list);
  }
  const capped = [];
  for (const sourceId of CONFIDENCE_SOURCE_IDS) {
    const list = (bySource.get(sourceId) || [])
      .sort((a, b) => b.absGapPp - a.absGapPp || (a.label < b.label ? -1 : 1))
      .slice(0, conventions.liveCap);
    capped.push(...list);
  }
  return {
    rows: capped.sort((a, b) => b.absGapPp - a.absGapPp),
    total: rows.length,
    flagged: rows.filter((r) => r.absGapPp >= conventions.gapPct).length,
    omitted: Math.max(0, rows.length - capped.length),
  };
}

/* ---------------------------------------------------------- the report */

function certificateSkill(cert) {
  if (!cert || !cert.graded) return null;
  const { brierDeclared, brierTransported } = cert.graded;
  if (!(brierDeclared > 0)) return null;
  return round4(1 - brierTransported / brierDeclared);
}

export function certificateLedger(certificates = [], conventions = CONFIDENCE_DEFAULTS) {
  const rows = (Array.isArray(certificates) ? certificates : []).map((cert) => ({ ...cert, derivedSkill: certificateSkill(cert) }));
  const graded = rows.filter((r) => r.graded);
  const wins = graded.filter((r) => r.graded.brierTransported < r.graded.brierDeclared).length;
  const mean = (list, fn) => (list.length ? round4(list.reduce((sum, r) => sum + fn(r), 0) / list.length) : null);
  return {
    certificates: rows,
    graded: graded.length,
    wins,
    meanSkill: graded.length ? mean(graded, (r) => r.derivedSkill ?? 0) : null,
    meanBrierTransported: mean(graded, (r) => r.graded.brierTransported),
    meanBrierDeclared: mean(graded, (r) => r.graded.brierDeclared),
    needed: Math.max(0, conventions.skillFloor - graded.length),
    open: rows.filter((r) => !r.graded && !r.lapsedOn).length,
    lapsed: rows.filter((r) => r.lapsedOn).length,
  };
}

/**
 * The whole read. Every figure on the screen comes from here, and every figure is
 * either computed from dated records or explicitly withheld.
 */
export function confidenceReport(state = {}, now = new Date(), settings = {}) {
  const conventions = confidenceConventions(settings && Object.keys(settings).length ? settings : state.settings || {});
  const today = dayKey(now);
  const harvested = extractConfidenceSamples(state);
  const samples = harvested.samples;

  const race = prequentialRace(samples, { minTrain: conventions.minTrain, bootstrap: conventions.bootstrap });
  const verdicts = decide(race, conventions);
  const ready = samples.length >= conventions.minSamples && race.scored >= conventions.minScored;
  const verdict = ready ? verdicts.verdict : 'insufficient';
  const chosen = verdict === 'supported' ? verdicts.chosen : 'identity';
  const fitted = chosenMap(samples, chosen, conventions);
  const reliability = murphyDecomposition(samples, { bins: conventions.bins });
  const transportedReliability = chosen === 'identity'
    ? { ...reliability, derived: true }
    : murphyDecomposition(samples.map((s) => ({ ...s, declaredPct: applyMap(fitted.map, s.declaredPct) })), { bins: conventions.bins });

  const bands = CONFIDENCE_BANDS.map((band) => {
    const subset = samples.filter((s) => bandFor(s.horizonDays, conventions) === band);
    const pooled = subset.length < conventions.minSamples;
    const bandRace = pooled
      ? null
      : prequentialRace(subset, { minTrain: Math.min(conventions.minTrain, Math.max(4, Math.floor(subset.length / 3))), bootstrap: conventions.bootstrap });
    const bandDecided = bandRace ? decide(bandRace, conventions) : null;
    const useBand = bandRace && bandDecided && bandDecided.verdict === 'supported';
    const bandFit = useBand ? chosenMap(subset, bandDecided.chosen, conventions) : null;
    return {
      band,
      n: subset.length,
      pooled,
      sufficient: !pooled && Boolean(useBand),
      map: bandFit ? bandFit.map : null,
      mapType: bandFit ? bandDecided.chosen : 'pooled',
      verdict: bandDecided ? bandDecided.verdict : 'insufficient',
      brierDeclared: bandRace ? (bandRace.models.find((m) => m.key === 'identity') || {}).brier ?? null : null,
      brierBest: bandRace
        ? Math.min(...bandRace.models.filter((m) => m.brier !== null).map((m) => m.brier))
        : null,
      observedPct: subset.length ? round1((subset.reduce((sum, s) => sum + s.outcome, 0) / subset.length) * 100) : null,
      meanDeclaredPct: subset.length ? round1(subset.reduce((sum, s) => sum + s.declaredPct, 0) / subset.length) : null,
      mapForReading: bandFit ? bandFit.map : fitted.map,
    };
  });

  const certified = verdict === 'supported';
  const live = liveReadings(state, { conventions, map: fitted.map, certified });

  const certificates = certificateLedger(state.confidenceCertificates || [], conventions);
  const bySource = CONFIDENCE_SOURCES.map((source) => {
    const subset = samples.filter((s) => s.source === source.id);
    const hits = subset.reduce((sum, s) => sum + s.outcome, 0);
    return {
      id: source.id,
      label: source.label,
      module: source.module,
      route: source.route,
      quantity: source.quantity,
      outcome: source.outcome,
      n: subset.length,
      hits,
      observedPct: subset.length ? round1((hits / subset.length) * 100) : null,
      meanDeclaredPct: subset.length ? round1(subset.reduce((sum, s) => sum + s.declaredPct, 0) / subset.length) : null,
      gapPp: subset.length ? round1(((hits / subset.length) * 100) - (subset.reduce((sum, s) => sum + s.declaredPct, 0) / subset.length)) : null,
      live: live.rows.filter((r) => r.source === source.id).length,
    };
  });

  return {
    today,
    engineVersion: 'confidence-transport-2026.11-v1',
    conventions,
    samples,
    sampleCount: samples.length,
    truncated: harvested.truncated,
    skipped: harvested.skipped,
    bySource,
    counts: {
      bySource: bySource.filter((s) => s.n > 0).length,
      resolved: samples.length,
      fromRegistry: CONFIDENCE_SOURCE_IDS.length,
    },
    race,
    verdicts,
    verdict,
    verdictLabel: CONFIDENCE_VERDICT_LABELS[verdict],
    chosen,
    map: fitted.map,
    fit: fitted.fit,
    reliability,
    transportedReliability,
    bands,
    live,
    certificates,
    ready,
  };
}

/* --------------------------------------------------------------- signals */

/**
 * CFI-01..05. Every finding describes the leader's own probability vocabulary
 * across modules; none of them describes a person, and none of them changes a
 * declaration.
 */
export function confidenceSignals(state = {}, now = new Date(), settings = {}) {
  const report = state && state.__report ? state.__report : confidenceReport(state, now, settings);
  const out = [];
  const add = (finding) => out.push({ confidence: 'high', evidence: [], ...finding });
  const c = report.conventions;

  if (report.verdict === 'supported') {
    const model = CONFIDENCE_MAP_SHORT[report.chosen] || report.chosen;
    add({
      ruleId: CONFIDENCE_SIGNAL_IDS.SUPPORTED,
      domain: 'Confidence',
      title: `Your numbers read ${report.transportedReliability.baseRatePct ?? '—'}% overall — the ${model} map beat them out of sample`,
      detail: `Across ${report.sampleCount} settled forecasts, Brier ${report.race.models[1].brier ?? '—'} (sigmoid) and ${report.race.models[2].brier ?? '—'} (isotonic) against ${report.race.models[0].brier} for the numbers as written. `
        + `The paired difference's 90% interval is ${report.verdicts.interval ? `${report.verdicts.interval.lo} to ${report.verdicts.interval.hi}` : 'unavailable'}; ${report.chosen === 'platt' ? 'the sigmoid' : 'the isotonic map'} is the instrument this record supports. `
        + 'Freeze a certificate to test that claim prospectively.',
      severity: report.certificates.open ? 1 : 2,
      confidence: 'high',
      evidence: [`Brier declared ${report.race.models[0].brier}`, `Brier chosen ${report.verdicts.chosen === 'identity' ? 'declared' : report.race.models.find((m) => m.key === report.chosen)?.brier}`, `${report.sampleCount} settled`, report.verdicts.interval ? `90% interval ${report.verdicts.interval.lo}..${report.verdicts.interval.hi}` : 'no interval'],
      action: { label: 'Open confidence transport', route: '#/confidence' },
    });
  }

  if (report.live.flagged > 0 && report.verdict === 'supported') {
    const worst = report.live.rows[0];
    add({
      ruleId: CONFIDENCE_SIGNAL_IDS.READ,
      domain: 'Confidence',
      title: `${report.live.flagged} open promise(s) sit ${c.gapPct}+ points above what your record says they mean`,
      detail: worst
        ? `The largest: “${String(worst.label).slice(0, 70)}” is declared at ${worst.declaredPct}% where the certificate reads ${worst.transportedPct}% (${worst.gapPp > 0 ? '+' : ''}${worst.gapPp} points). `
          + 'The declaration is left exactly as written — the second reading is printed beside it, and the arithmetic that uses it is yours to re-run.'
        : 'Open declared probabilities read materially differently under the certificate.',
      severity: 3,
      confidence: report.certificates.graded >= c.skillFloor ? 'high' : 'medium',
      evidence: report.live.rows.slice(0, 4).map((r) => `${r.family}: declared ${r.declaredPct}% vs certified ${r.transportedPct}%`),
      action: { label: 'See the readings', route: '#/confidence?panel=readings' },
    });
  }

  if (report.verdict === 'harmful') {
    add({
      ruleId: CONFIDENCE_SIGNAL_IDS.LOST,
      domain: 'Confidence',
      title: 'Every fitted map scored worse than your numbers — do not transport this record',
      detail: `On ${report.race.scored} prequential settlements the declared numbers scored Brier ${report.race.models[0].brier} and both maps did worse. `
        + 'That is a finding, not a failure: it says your probability words are already well calibrated on this record and a correction would damage them.',
      severity: 2,
      confidence: 'high',
      evidence: report.race.models.filter((m) => m.brier !== null).map((m) => `${m.key} ${m.brier}`),
      action: { label: 'Read the race', route: '#/confidence?panel=race' },
    });
  }

  for (const cert of report.certificates.certificates) {
    if (cert.graded && cert.derivedSkill !== null && cert.derivedSkill < 0) {
      add({
        ruleId: CONFIDENCE_SIGNAL_IDS.LOST,
        domain: 'Confidence',
        title: `A frozen certificate lost to your declared numbers (skill ${cert.derivedSkill})`,
        detail: `The certificate issued ${cert.issuedOn} carried a ${cert.mapType} map and was graded on ${cert.graded.observed} settlement(s) that resolved inside its window: Brier ${cert.graded.brierTransported} transported against ${cert.graded.brierDeclared} declared. `
          + 'The map is not rewritten; the loss is recorded and the decision to keep transporting is opened.',
        severity: 3,
        confidence: 'high',
        evidence: [`issued ${cert.issuedOn}`, `review ${cert.reviewOn}`, `${cert.graded.successes}/${cert.graded.observed} occurred`],
        action: { label: 'Open the certificates', route: '#/confidence?panel=certificates' },
      });
      break;
    }
  }

  const due = report.certificates.certificates.filter((cert) => !cert.graded && !cert.lapsedOn && cert.reviewOn <= report.today);
  if (due.length) {
    add({
      ruleId: CONFIDENCE_SIGNAL_IDS.DUE,
      domain: 'Confidence',
      title: `${due.length} calibration certificate(s) are past their window and ungraded`,
      detail: `A certificate is graded once, from the forecasts that resolved inside its window. Run the scan to grade them; a window that closed with nothing in it lapses rather than being credited.`,
      severity: 2,
      confidence: 'high',
      evidence: due.slice(0, 4).map((cert) => `Review ${cert.reviewOn}`),
      action: { label: 'Grade now', route: '#/confidence?panel=certificates' },
    });
  }

  if (report.verdict === 'insufficient' && report.sampleCount > 0) {
    add({
      ruleId: CONFIDENCE_SIGNAL_IDS.THIN,
      domain: 'Confidence',
      title: `Calibration is unidentifiable so far: ${report.sampleCount} of ${c.minSamples} settled forecasts, ${report.race.scored} of ${c.minScored} prequential points`,
      detail: 'The terminal prints counts and refuses a map. Writing probabilities before outcomes arrive, and settling them afterwards, is the only thing that shortens this wait.',
      severity: 1,
      confidence: 'high',
      evidence: [`${report.sampleCount} settled`, `${report.race.scored} scored out of sample`],
      action: { label: 'Where the samples come from', route: '#/confidence?panel=method' },
    });
  }

  return out;
}

export function confidenceAttentionCount(state = {}, now = new Date()) {
  return confidenceSignals(state, now, state.settings || {}).reduce((sum, f) => sum + (f.severity >= 2 ? 1 : 0), 0);
}

/* --------------------------------------------------------------- brief */

/** An identity-free brief: counts, maps and figures only — no titles, ids or names. */
export function confidenceBrief(state = {}, now = new Date(), settings = {}) {
  const report = confidenceReport(state, now, settings);
  const lines = [];
  lines.push(`LEADOS — CONFIDENCE TRANSPORT BRIEF (${report.today})`);
  lines.push('What the leader\'s own declared probabilities have meant, measured across modules.');
  lines.push('');
  lines.push(`Settled forecasts: ${report.sampleCount} (${report.counts.bySource} source module(s) contributing).`);
  lines.push(`Prequential settlements scored out of sample: ${report.race.scored}.`);
  lines.push(`Verdict: ${report.verdictLabel}.`);
  lines.push(`Declared Brier ${report.race.models[0].brier ?? 'withheld'}; sigmoid ${report.race.models[1].brier ?? 'not fitted'}; isotonic ${report.race.models[2].brier ?? 'not fitted'}.`);
  if (report.verdicts.interval) {
    lines.push(`Paired Brier difference (declared − best map): mean ${report.verdicts.interval.mean}, 90% interval ${report.verdicts.interval.lo} to ${report.verdicts.interval.hi}.`);
  }
  lines.push('');
  lines.push('RELIABILITY (declared band → observed rate)');
  for (const band of report.reliability.bands) {
    if (!band.n) continue;
    lines.push(`  ${band.loPct}-${band.hiPct}%: n=${band.n}, declared mean ${band.meanDeclaredPct}%, observed ${band.observedPct}% (95% ${band.loPct95}-${band.hiPct95}%), gap ${band.gapPp} points.`);
  }
  lines.push('');
  lines.push('BY SOURCE MODULE');
  for (const source of report.bySource) {
    if (!source.n) continue;
    lines.push(`  ${source.label}: n=${source.n}, declared mean ${source.meanDeclaredPct}%, observed ${source.observedPct}%, gap ${source.gapPp} points.`);
  }
  lines.push('');
  lines.push(`Open declared promises read: ${report.live.total}; ${report.live.flagged} sit ${report.conventions.gapPct}+ points from the certified reading.`);
  lines.push(`Certificates: ${report.certificates.open} open, ${report.certificates.graded} graded, ${report.certificates.wins} won by the transported reading.`);
  lines.push('');
  lines.push('A transported number is a second reading of a declaration, never a replacement. No person is scored anywhere in this brief.');
  return lines.join('\n');
}

/* ------------------------------------------------------- certificates */

/**
 * Freeze the current instrument as a certificate. Refused unless transport is
 * supported: certifying an unsupported map would test a claim nobody made.
 */
export function buildConfidenceCertificate(report, { id, nowIso, reviewOn = null, label = '' } = {}) {
  if (!report || report.verdict !== 'supported' || report.chosen === 'identity') {
    return {
      ok: false,
      error: report && report.verdict === 'insufficient'
        ? 'This record cannot identify a map yet. Settle more forecasts first — a certificate for an unfitted instrument would test nothing.'
        : 'Transport is not supported on this record, so there is nothing to certify. The terminal will not freeze a map it has not shown to beat your numbers.',
    };
  }
  const issuedOn = String(nowIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) return { ok: false, error: 'The certificate needs a valid issue date.' };
  const window = reviewOn || addDays(issuedOn, report.conventions.reviewDays);
  if (window <= issuedOn) return { ok: false, error: 'The review day must be after the issue day.' };
  const platt = report.race.models.find((m) => m.key === 'platt') || {};
  const iso = report.race.models.find((m) => m.key === 'isotonic') || {};
  const elapsedDays = report.samples.length
    ? Math.max(1, daysBetween(report.samples[0].resolvedOn, issuedOn) ?? 1)
    : 1;
  const paceAtFit = round1((report.sampleCount / elapsedDays) * 30);
  const record = {
    id,
    label: String(label || '').slice(0, 120) || `Instrument certificate — ${report.chosen}`,
    issuedOn,
    reviewOn: window,
    mapType: report.chosen,
    verdict: report.verdict,
    sampleN: report.sampleCount,
    trainN: report.race.scored,
    scoredN: report.race.scored,
    plattA: report.map.mapType === 'platt' ? report.map.a : null,
    plattB: report.map.mapType === 'platt' ? report.map.b : null,
    isoBlocks: report.map.mapType === 'isotonic' ? report.map.blocks : [],
    brierDeclared: report.race.models[0].brier,
    brierPlatt: platt.brier ?? null,
    brierIsotonic: iso.brier ?? null,
    chosenBrier: report.race.models.find((m) => m.key === report.chosen)?.brier ?? null,
    skill: report.verdicts.gain,
    ciLo: report.verdicts.interval ? report.verdicts.interval.lo : null,
    ciHi: report.verdicts.interval ? report.verdicts.interval.hi : null,
    paceAtFit,
    expectedResolutions: Math.round((paceAtFit / 30) * Math.max(1, daysBetween(issuedOn, window) ?? report.conventions.reviewDays)),
    lapsedOn: null,
    graded: null,
  };
  return { ok: true, record };
}

/**
 * Grade a certificate once, from the forecasts that resolved strictly inside its
 * window. Nothing outside the window enters, and nothing is inferred from an
 * absence of resolutions — that is a lapse, not a win.
 */
export function gradeConfidenceCertificate(cert, state, now) {
  if (!cert || cert.graded || cert.lapsedOn) return null;
  const today = dayKey(now);
  if (today < cert.reviewOn) return null;
  const map = mapFromCertificate(cert);
  const harvested = extractConfidenceSamples(state);
  const inside = harvested.samples.filter((s) => s.resolvedOn > cert.issuedOn && s.resolvedOn <= cert.reviewOn);
  if (!inside.length) return null;
  let declared = 0;
  let transported = 0;
  let successes = 0;
  for (const sample of inside) {
    declared += brierOf(sample.declaredPct, sample.outcome);
    transported += brierOf(applyMap(map, sample.declaredPct), sample.outcome);
    successes += sample.outcome;
  }
  return {
    gradedAt: now.toISOString ? now.toISOString() : new Date(now).toISOString(),
    observed: inside.length,
    successes,
    brierDeclared: round4(declared / inside.length),
    brierTransported: round4(transported / inside.length),
    skill: null,
  };
}

export function certificateDue(cert, today) {
  return Boolean(cert) && !cert.graded && !cert.lapsedOn && cert.reviewOn <= today;
}

export { CONFIDENCE_ISO_BLOCK_CAP };
