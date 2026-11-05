/**
 * app/core/domain/spanCalibration.js — the Discretion Calibrator engine
 * (`#/span-calibration`, Schema v102, ADR-0100).
 *
 * WHAT IT COMPUTES, AND FROM WHAT
 * -------------------------------
 * The Command Chain (ADR-0075) reads work out of every registered source and
 * attributes it to the span that owns it. This module asks the chain's OWN
 * harvester for the whole history (`includeClosed`) and treats each item as a
 * survival observation:
 *
 *   duration = the day it was decided − the day it opened      (event)
 *   follow-up = today − the day it opened                      (censored)
 *
 * Items still open are CENSORED at their current age, never counted as
 * failures, never dropped. The estimator is Kaplan–Meier (1958) on that
 * sample, per altitude rung, with Greenwood's (1926) variance and a log–log
 * transformed band. The span a record implies at a declared coverage q is the
 * q-quantile of that curve, obtained by INVERTING the band — the
 * Brookmeyer–Crowley (1982) test-inversion idea, evaluated at q rather than
 * only at the median. When the curve never reaches 1 − q, or the risk set
 * falls below a declared floor, or no item has ever been observed as old as the
 * declared span, the quantile is REFUSED and the reason is printed. A median
 * read off three observations is the kind of number this product exists to
 * refuse.
 *
 * Then two things happen that no surveyed product does:
 *
 *  1. The rungs are reconciled. A ladder whose measured rungs run downhill is
 *     not a ladder, so weighted PAVA (pool adjacent violators — Barlow, Bartholomew,
 *     Bremner & Brunk 1972) pools crossing rungs into one block and the block is
 *     printed as pooled. Silently reordering would be inventing an organisation.
 *  2. The consequence is counted. Every OPEN item is re-placed on the measured
 *     ladder and the difference from the declared ladder is printed as a
 *     partition: how many items would move a rung up, how many down, and how
 *     many would demand a rung this chain does not contain. That is the price of
 *     the declared spiral, in the workspace's own units, not in a slide.
 *
 * WHAT IT MAY NEVER DO
 * --------------------
 *  - Move a declared horizon. `proposeLadder` is a proposal; adoption is a
 *    dated human declaration naming the reading that justified it.
 *  - Name, rate or rank a person. The unit is a rung and a span.
 *  - Read an individual-sensitive source. `performanceConcerns` is excluded by
 *    name and the exclusion is counted and printed.
 *  - Score a claim it cannot observe. A frozen reading quotes, per rung, the
 *    probability that work is still open at the declared span; grading happens
 *    once, later, on items opened AFTER the freeze (strictly out of sample) and
 *    refuses below the declared floor.
 *
 * Purity: no DOM, no storage, no wall clock. Every function takes `now`.
 */
import { addDays, dayKey, daysBetween, round } from '../time.js';
import {
  ALTITUDES,
  LEADER_ID,
  buildChain,
  harvestWork,
  ladderFor,
} from './chain.js';
import {
  SIGNAL_SOURCES,
  altitudeByKey,
  altitudeByRank,
  altitudeRank,
} from './chainRegistry.js';
import {
  SPAN_DEFAULTS,
  SPAN_ENGINE_VERSION,
  SPAN_PREMISE,
  SPAN_DISCLOSURE,
  SPAN_VERDICTS,
} from './spanCalibrationRegistry.js';
import { spanCalibrationConventions } from './spanCalibrationSchema.js';

/* ------------------------------------------------------------------ utils */

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pct(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return round((num / den) * 100, 1);
}

/** Acklam's inverse normal (|error| < 1.15e-9) — used only for the band width. */
function probit(p) {
  if (!(p > 0 && p < 1)) return null;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* ------------------------------------------------------------------ */
/* 1. Kaplan–Meier with Greenwood variance and a log–log band          */
/* ------------------------------------------------------------------ */

/**
 * Build a Kaplan–Meier curve from `{ t, event }` observations.
 *
 * `t` is whole days; `event` is true when the item was decided, false when it is
 * still open (censored). Ties in the same direction are collapsed into one step
 * so the estimator does not depend on row order.
 *
 * The curve records, per step: the survival estimate, the risk set, the number
 * of events and censorings there, the Greenwood variance of Ŝ, and the log–log
 * transformed 90% band. A step whose risk set falls below `riskFloor` is marked
 * `thin` — readable as a count, never usable as a rate.
 */
export function survivalCurve(samples, { riskFloor = 3, bandZ = 1.6448536269514722 } = {}) {
  const usable = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.t) && s.t >= 0)
    .map((s) => ({ t: Math.round(s.t), event: s.event === true }));
  const n = usable.length;
  const eventsN = usable.filter((s) => s.event).length;
  const censoredN = n - eventsN;
  if (!n) {
    return { n: 0, eventsN: 0, censoredN: 0, steps: [], maxTime: null, finalS: null, estimable: false, refused: 'no observation at all' };
  }
  const byTime = new Map();
  for (const sample of usable) {
    const bucket = byTime.get(sample.t) || { d: 0, c: 0 };
    if (sample.event) bucket.d += 1;
    else bucket.c += 1;
    byTime.set(sample.t, bucket);
  }
  const times = [...byTime.keys()].sort((a, b) => a - b);
  let atRisk = n;
  let S = 1;
  let green = 0;
  const steps = [];
  for (const t of times) {
    const { d, c } = byTime.get(t);
    if (d > 0 && atRisk > 0) {
      const factor = 1 - d / atRisk;
      S *= factor;
      // Greenwood: sum d / (n(n−d)). When d === atRisk the estimator is zero
      // and the variance term is undefined; the band is [0, 0] and is recorded
      // as such rather than as an infinite interval.
      if (atRisk - d > 0) green += d / (atRisk * (atRisk - d));
      else green = Infinity;
    }
    const variance = Number.isFinite(green) ? S * S * green : null;
    let lo = S;
    let hi = S;
    if (S > 0 && S < 1 && Number.isFinite(green) && green > 0) {
      const se = Math.sqrt(green) / Math.abs(Math.log(S));
      lo = Math.min(1, Math.max(0, S ** Math.exp(bandZ * se)));
      hi = Math.min(1, Math.max(0, S ** Math.exp(-bandZ * se)));
      if (lo > hi) { const swap = lo; lo = hi; hi = swap; }
    }
    const thin = atRisk < riskFloor;
    steps.push({
      t,
      s: round(S, 4),
      lo: round(lo, 4),
      hi: round(hi, 4),
      atRisk,
      events: d,
      censored: c,
      variance: variance === null ? null : round(variance, 6),
      thin,
    });
    atRisk -= d + c;
  }
  return {
    n,
    eventsN,
    censoredN,
    steps,
    maxTime: times[times.length - 1],
    finalS: round(S, 4),
    estimable: eventsN > 0,
    refused: eventsN > 0 ? null : 'nothing at this rung has closed yet',
  };
}

/** Survival at day `t` (right-continuous step). Null when nothing has been observed that long. */
export function survivalAt(curve, t, { riskFloor = 3 } = {}) {
  if (!curve || !curve.steps.length || !Number.isFinite(t)) return { s: null, refused: 'no curve' };
  if (t > curve.maxTime) {
    return { s: null, refused: `nothing on this record has been observed at ${Math.round(t)} days (longest follow-up: ${curve.maxTime})` };
  }
  let chosen = null;
  for (const step of curve.steps) {
    if (step.t <= t) chosen = step;
    else break;
  }
  if (!chosen) return { s: 1 , lo: 1, hi: 1, atRisk: curve.n, refused: null };
  if (chosen.atRisk < riskFloor) {
    return { s: null, refused: `the risk set at ${chosen.t} days is ${chosen.atRisk}, below the declared floor of ${riskFloor}` };
  }
  return { s: chosen.s, lo: chosen.lo, hi: chosen.hi, atRisk: chosen.atRisk, refused: null, step: chosen.t };
}

/**
 * The span a curve implies at a declared coverage, with a test-inverted interval.
 *
 * `days` is the first day at which the curve is at or below `1 − coverage`, and
 * is refused when the curve never reaches it, when the reaching step's risk set
 * is below the floor, or when the follow-up does not extend past the coverage
 * point. `ciLo`/`ciHi` invert the log–log band: the smallest day whose UPPER
 * band has crossed the target, and the largest day whose LOWER band has not.
 * A null end is printed as "not bounded" — never as zero and never as infinite.
 */
export function quantileFromCurve(curve, coveragePct, { riskFloor = 3 } = {}) {
  const coverage = Number(coveragePct);
  if (!curve || !curve.steps.length) return { days: null, ciLo: null, ciHi: null, refused: 'no observation' };
  if (!Number.isFinite(coverage) || coverage <= 0 || coverage >= 100) return { days: null, ciLo: null, ciHi: null, refused: 'coverage is not a percentage' };
  const target = 1 - coverage / 100;
  const readable = curve.steps.filter((step) => step.atRisk >= riskFloor);
  if (!readable.length) return { days: null, ciLo: null, ciHi: null, refused: `no step has a risk set of ${riskFloor} or more` };
  const point = readable.find((step) => step.s <= target);
  if (!point) {
    return {
      days: null,
      ciLo: null,
      ciHi: null,
      refused: `the curve never reaches ${round(target * 100, 1)}% still-open inside ${curve.maxTime} days of follow-up`,
      reached: round(readable[readable.length - 1].s * 100, 1),
    };
  }
  const loStep = readable.find((step) => step.hi <= target);
  const hiCandidates = readable.filter((step) => step.lo > target);
  const hiStep = hiCandidates.length ? hiCandidates[hiCandidates.length - 1] : null;
  return {
    days: point.t,
    ciLo: loStep ? loStep.t : null,
    ciHi: hiStep ? hiStep.t : null,
    // A band that begins after the point estimate is incoherent and is not
    // printed; the point estimate stands alone with its own refusal reason.
    coherent: (!loStep || loStep.t <= point.t) && (!hiStep || hiStep.t >= point.t),
    coveragePct: coverage,
    target: round(target, 3),
    refused: null,
  };
}

/** A compact step curve for the screen: every survival change, capped. */
export function curveForChart(steps, maxPoints = 48) {
  const usable = (Array.isArray(steps) ? steps : []).filter((step) => Number.isFinite(step.t));
  if (usable.length <= maxPoints) return usable.map((step) => ({ t: step.t, s: step.s, lo: step.lo, hi: step.hi, atRisk: step.atRisk }));
  const stride = Math.ceil(usable.length / maxPoints);
  const out = [];
  for (let index = 0; index < usable.length; index += stride) {
    const step = usable[index];
    out.push({ t: step.t, s: step.s, lo: step.lo, hi: step.hi, atRisk: step.atRisk });
  }
  const last = usable[usable.length - 1];
  if (out[out.length - 1]?.t !== last.t) out.push({ t: last.t, s: last.s, lo: last.lo, hi: last.hi, atRisk: last.atRisk });
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. The sample, from the chain's own harvester                       */
/* ------------------------------------------------------------------ */

/**
 * One cohort per altitude rung, built from the items the Command Chain counts.
 *
 * Returns the samples plus what was left out and why — a calibration that
 * silently drops half its history is worse than no calibration.
 */
export function buildSpanCohorts(state, chain, { now = new Date(), settings = null, conventions = null } = {}) {
  const conv = conventions || spanCalibrationConventions(settings || state?.settings || {});
  const items = harvestWork(state, chain, { now, settings: settings || state?.settings, includeClosed: true });
  const samplesByAltitude = new Map(ALTITUDES.map((a) => [a.key, []]));
  const bySource = new Map();
  const excludedSources = [];
  const defects = { negativeDuration: 0, undated: 0, unowned: 0 };

  for (const source of SIGNAL_SOURCES) {
    if (source.derived) continue;
    if (source.sensitive) excludedSources.push({ key: source.key, label: source.label, reason: 'individual-sensitive records never enter an organisational measurement' });
  }
  const sensitiveKeys = new Set(excludedSources.map((s) => s.key));

  for (const item of items) {
    if (item.sensitive || sensitiveKeys.has(item.type)) continue;
    if (!item.ownerAltitude) { defects.unowned += 1; continue; }
    const closed = item.closed === true && Number.isFinite(item.durationDays);
    const t = closed ? item.durationDays : item.ageDays;
    if (!Number.isFinite(t) || t < 0) { defects.negativeDuration += 1; continue; }
    const bucket = bySource.get(item.type) || { key: item.type, label: item.typeLabel, decidedN: 0, censoredN: 0 };
    if (closed) bucket.decidedN += 1; else bucket.censoredN += 1;
    bySource.set(item.type, bucket);
    const sample = { t, event: closed, type: item.type, ownerNodeId: item.ownerNodeId, ownerRank: item.ownerRank };
    const list = samplesByAltitude.get(item.ownerAltitude);
    if (list) list.push(sample);
    else defects.unowned += 1;
  }

  const curves = new Map();
  for (const [key, samples] of samplesByAltitude) {
    curves.set(key, survivalCurve(samples, { riskFloor: conv.riskFloor }));
  }
  return {
    items,
    samplesByAltitude,
    curves,
    bySource: [...bySource.values()].sort((a, b) => (b.decidedN + b.censoredN) - (a.decidedN + a.censoredN)),
    excludedSources,
    defects,
    totalN: items.length,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Weighted PAVA — a ladder that runs downhill is not a ladder      */
/* ------------------------------------------------------------------ */

/**
 * Pool adjacent violators on `{ key, value, weight }` in rank order, so the
 * result is non-decreasing. Returns the pooled values, the block each value
 * belongs to, and whether pooling happened at all.
 */
export function isotopeRungs(rows) {
  const blocks = [];
  for (const row of rows) {
    const value = Number(row.value);
    if (!Number.isFinite(value)) {
      blocks.push({ value: null, weight: 0, keys: [row.key] });
      continue;
    }
    blocks.push({ value, weight: Math.max(1, Number(row.weight) || 1), keys: [row.key] });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (prev.value === null || last.value === null || prev.value <= last.value) break;
      const weight = prev.weight + last.weight;
      const merged = {
        value: (prev.value * prev.weight + last.value * last.weight) / weight,
        weight,
        keys: [...prev.keys, ...last.keys],
      };
      blocks.splice(blocks.length - 2, 2, merged);
    }
  }
  const values = new Map();
  const pooled = new Set();
  for (const block of blocks) {
    for (const key of block.keys) {
      values.set(key, block.value === null ? null : round(block.value, 1));
      if (block.keys.length > 1) pooled.add(key);
    }
  }
  return { values, pooled, blocks: blocks.map((b) => ({ keys: b.keys, value: b.value === null ? null : round(b.value, 1) })) };
}

/* ------------------------------------------------------------------ */
/* 4. The calibration reading                                          */
/* ------------------------------------------------------------------ */

/**
 * One rung: the declared span measured against the record, with its verdict.
 *
 * THE TEST. The span a rung declares is a COVERAGE promise: work at that rung
 * should be decided inside it, at the declared coverage `q`. So the readable
 * quantity is not a quantile (which needs the whole tail to be estimable) but
 * the survival estimate AT the declared span, Ŝ(h), with its log–log band, and
 * the test is where that band sits relative to `1 − q`:
 *
 *   the band is entirely ABOVE 1 − q   more work is still open at the span than
 *                                      the promise allows  → **too narrow**
 *   the band is entirely BELOW 1 − q   the span allows more time than the work
 *                                      needs                → **too wide**
 *   the band straddles 1 − q and is    the record cannot separate the declared
 *     wider than the declared width    span from noise     → **insufficient**
 *   the band straddles 1 − q narrowly  consistent with the declaration →
 *                                                           **calibrated**
 *
 * The quantile is still computed and printed — it is the number a human adopts —
 * but it is a PROPOSAL quantity, not the test: an unbounded quantile interval is
 * reported as unbounded rather than turning a stable survival estimate into a
 * refusal.
 */
function calibrateRung({ altitude, curve, conventions, bandZ }) {
  const declaredDays = altitude.horizonDays;
  const coveragePct = conventions.coveragePct;
  const target = 1 - coveragePct / 100;
  const quantile = quantileFromCurve(curve, coveragePct, { riskFloor: conventions.riskFloor });
  const atDeclared = survivalAt(curve, declaredDays, { riskFloor: conventions.riskFloor });
  const censoringPct = pct(curve.censoredN, curve.n);
  const base = {
    key: altitude.key,
    rank: altitude.rank,
    label: altitude.label,
    shortLabel: altitude.shortLabel,
    declaredDays,
    declaredSource: altitude.horizonSource || 'declared',
    decidedN: curve.eventsN,
    censoredN: curve.censoredN,
    totalN: curve.n,
    censoringPct,
    coveragePct,
    targetPct: round(target * 100, 1),
    measuredDays: quantile.days,
    ciLo: quantile.ciLo,
    ciHi: quantile.ciHi,
    quantileRefused: quantile.refused,
    survivalAtDeclaredPct: atDeclared.s === null ? null : round(atDeclared.s * 100, 1),
    survivalAtDeclaredLoPct: atDeclared.lo === undefined || atDeclared.lo === null ? null : round(atDeclared.lo * 100, 1),
    survivalAtDeclaredHiPct: atDeclared.hi === undefined || atDeclared.hi === null ? null : round(atDeclared.hi * 100, 1),
    survivalAtDeclaredRefused: atDeclared.refused,
    maxFollowUpDays: curve.maxTime,
    bandZ,
    curve: curveForChart(curve.steps),
    eventsN: curve.eventsN,
  };

  const insufficient = (reason) => ({ ...base, verdict: 'insufficient', reason: `${reason} [${curve.eventsN} decided, ${curve.censoredN} still open]` });
  if (!curve.n) return insufficient('No item has ever been recorded at this rung, so there is nothing to measure.');
  if (curve.eventsN < conventions.decidedFloor) {
    return insufficient(`Only ${curve.eventsN} decided item(s) at this rung, below the declared floor of ${conventions.decidedFloor}: a span read off fewer is an anecdote.`);
  }
  if (censoringPct !== null && censoringPct >= conventions.censoringPct) {
    return insufficient(`${censoringPct}% of this rung's items are still open, at or above the declared ${conventions.censoringPct}% censoring ceiling, so the curve is dominated by work that has not resolved.`);
  }
  if (atDeclared.s === null) {
    return insufficient(`The declared span cannot be read: ${atDeclared.refused}.`);
  }
  const lo = round(atDeclared.lo * 100, 1);
  const hi = round(atDeclared.hi * 100, 1);
  const targetPct = round(target * 100, 1);
  const width = round(hi - lo, 1);
  if (width > conventions.maxWidthPct) {
    return insufficient(`The interval at the declared ${declaredDays} days is ${width} points wide (${lo}–${hi}% still open), above the declared ${conventions.maxWidthPct}-point ceiling: this record cannot separate the declared span from noise.`);
  }
  if (lo > targetPct) {
    return {
      ...base,
      verdict: 'too-narrow',
      reason: `At the declared ${declaredDays} days, ${base.survivalAtDeclaredPct}% of this rung's work is still open (${lo}–${hi}%), above the ${coveragePct}% coverage promise's ${targetPct}% ceiling: work here runs past the span it was given.`,
    };
  }
  if (hi < targetPct) {
    return {
      ...base,
      verdict: 'too-wide',
      reason: `At the declared ${declaredDays} days only ${base.survivalAtDeclaredPct}% of this rung's work is still open (${lo}–${hi}%), below the ${coveragePct}% coverage promise's ${targetPct}% ceiling: the span allows more time than this work needs.`,
    };
  }
  return {
    ...base,
    verdict: 'calibrated',
    reason: `At the declared ${declaredDays} days, ${base.survivalAtDeclaredPct}% of this rung's work is still open (${lo}–${hi}%), which contains the ${targetPct}% the ${coveragePct}% coverage promise allows: the declaration is consistent with the record.`,
  };
}

/**
 * The ladder the record supports, clamped to how far a human may move a declared
 * span and forced monotone. This is a PROPOSAL: nothing is written by computing it.
 *
 * The proposal follows the point estimate of the measured span, not its band,
 * because the band is printed beside it: a human adopting a span sees both the
 * number and how well the record bounds it.
 */
export function proposeLadder(rungs, declaredLadder, conventions) {
  const minFactor = conventions.adoptMinPct / 100;
  const maxFactor = conventions.adoptMaxPct / 100;
  const base = declaredLadder.map((altitude) => {
    const row = rungs.find((rung) => rung.key === altitude.key) || null;
    const declared = altitude.declaredHorizonDays || altitude.horizonDays;
    let value = declared;
    let source = 'declared';
    if (row && row.verdict !== 'insufficient' && Number.isFinite(row.measuredDays)) {
      value = Math.max(1, Math.round(row.measuredDays));
      source = value === declared ? 'declared' : 'measured';
    }
    const min = Math.ceil(declared * minFactor);
    const max = Math.round(declared * maxFactor);
    return {
      key: altitude.key,
      rank: altitude.rank,
      label: altitude.label,
      declaredDays: declared,
      days: Math.min(max, Math.max(min, value)),
      source,
    };
  });
  for (let index = 1; index < base.length; index += 1) {
    const floor = base[index - 1].days + 1;
    const ceiling = base[index - 1].days * conventions.ladderStepMax;
    if (base[index].days < floor) { base[index].days = floor; base[index].clampedMonotone = true; }
    if (base[index].days > ceiling) { base[index].days = Math.round(ceiling); base[index].clampedStep = true; }
  }
  return base;
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* 5. The consequence: re-place every open item on the measured ladder */
/* ------------------------------------------------------------------ */

/**
 * What would change if this workspace routed work on the measured ladder?
 * Returns an exact partition of the open items — not a percentage of a sample.
 */
export function spanCounterfactual(items, { fromLadder, toLadder, leaderRank = 5 } = {}) {
  const from = Array.isArray(fromLadder) && fromLadder.length ? fromLadder : ALTITUDES;
  const to = Array.isArray(toLadder) && toLadder.length ? toLadder : from;
  const rankForAge = (ageDays, ladder) => {
    for (const altitude of ladder) if (ageDays <= altitude.horizonDays) return altitude.rank;
    return ladder[ladder.length - 1].rank;
  };
  const rows = new Map(to.map((altitude) => [altitude.key, {
    key: altitude.key, rank: altitude.rank, label: altitude.label,
    itemsN: 0, riseN: 0, fallN: 0, unchangedN: 0, aboveTopN: 0,
  }]));
  let riseN = 0;
  let fallN = 0;
  let unchangedN = 0;
  let aboveTopN = 0;
  for (const item of items || []) {
    const open = (item.closed === true) ? false : true;
    if (!open) continue;
    const ownerRank = altitudeRank(item.ownerAltitude) || item.ownerRank || 1;
    const declaredRank = Number.isFinite(item.requiredRank) ? item.requiredRank : ownerRank;
    const measuredRank = Math.max(ownerRank, rankForAge(item.ageDays, to));
    const row = rows.get(altitudeByRank(measuredRank)?.key || 'frontline');
    if (row) {
      row.itemsN += 1;
      if (measuredRank > declaredRank) row.riseN += 1;
      else if (measuredRank < declaredRank) row.fallN += 1;
      else row.unchangedN += 1;
      if (measuredRank > leaderRank) row.aboveTopN += 1;
    }
    if (measuredRank > declaredRank) riseN += 1;
    else if (measuredRank < declaredRank) fallN += 1;
    else unchangedN += 1;
    if (measuredRank > leaderRank) aboveTopN += 1;
  }
  const total = riseN + fallN + unchangedN;
  return {
    itemsN: total,
    riseN,
    fallN,
    unchangedN,
    aboveTopN,
    rows: [...rows.values()].filter((row) => row.itemsN > 0).sort((a, b) => a.rank - b.rank),
    changed: from.some((altitude, index) => to[index] && to[index].horizonDays !== altitude.horizonDays),
    note: total
      ? `${riseN} of ${total} open item(s) would demand a higher rung, ${fallN} a lower one, and ${aboveTopN} a rung this chain does not contain — under the span this record supports, not the one declared.`
      : 'This workspace holds no open item to re-place, so the counterfactual is empty rather than zero.',
  };
}

/* ------------------------------------------------------------------ */
/* 6. Roll-up (counts only, small cells suppressed)                    */
/* ------------------------------------------------------------------ */

function buildRollup(chain, cohorts, conventions) {
  const samples = [...cohorts.samplesByAltitude.values()].flat();
  const rows = [];
  for (const node of chain.nodes.values()) {
    const scope = new Set(node.subtreeIds || []);
    if (!scope.size) continue;
    const mine = samples.filter((sample) => scope.has(sample.ownerNodeId));
    if (!mine.length) continue;
    const decidedN = mine.filter((sample) => sample.event).length;
    const censoredN = mine.length - decidedN;
    const suppressed = mine.length < conventions.cellFloor;
    rows.push({
      nodeId: suppressed ? null : node.id,
      name: node.id === LEADER_ID ? node.name : node.name,
      altitudeKey: node.altitude,
      rank: altitudeRank(node.altitude),
      depth: node.depth,
      itemsN: suppressed ? null : mine.length,
      decidedN: suppressed ? null : decidedN,
      censoredN: suppressed ? null : censoredN,
      censoringPct: suppressed ? null : pct(censoredN, mine.length),
      suppressed,
      reason: suppressed ? `fewer than ${conventions.cellFloor} observation(s) in this span: suppressed, because a share of one identifies a lead` : null,
    });
  }
  // Complementary suppression: blanking one cell and printing its parent total
  // recovers it by subtraction, so the smallest printable sibling is blanked too.
  const byParent = new Map();
  for (const row of rows) if (!row.suppressed) {
    const list = byParent.get(row.depth) || [];
    list.push(row);
    byParent.set(row.depth, list);
  }
  if (rows.some((row) => row.suppressed)) {
    for (const list of byParent.values()) {
      if (list.length < 2) continue;
      const smallest = list.reduce((min, row) => (row.itemsN < min.itemsN ? row : min), list[0]);
      smallest.complementary = true;
      smallest.suppressed = true;
      smallest.itemsN = null;
      smallest.decidedN = null;
      smallest.censoredN = null;
      smallest.censoringPct = null;
      smallest.reason = 'complementary suppression: a single blank beside an exact total can be recovered by subtraction';
    }
  }
  return rows.sort((a, b) => a.rank - b.rank || a.depth - b.depth || String(a.name).localeCompare(String(b.name)));
}

/* ------------------------------------------------------------------ */
/* 7. The report                                                       */
/* ------------------------------------------------------------------ */

const PLAYBOOK = Object.freeze({
  frontline: {
    title: 'You are the rung this measures',
    question: 'Is the week I promised my team the week my work actually takes?',
    horizon: 'Your span is days, so read the decided count, not the percentage.',
    see: 'Your own rung: how many items you have decided, how long they actually took, and whether any rung above you is holding work longer than it promised.',
    act: 'Freeze a reading when your own rung has enough decided items. A span you did not measure is a span you cannot defend in your next review.',
    hand: 'Hand up the rung-level tension only — never a person, never an item title.',
  },
  manager: {
    title: 'Your rungs and their mix',
    question: 'Does the span I declared for my team leads match the work they actually decide?',
    horizon: 'Your span is around a month: the curve needs a month of history to say anything.',
    see: 'Per-rung decided and censored counts, the span the record supports, and the counterfactual for open work in your unit.',
    act: 'Adopt nothing yourself: a ladder is workspace-wide. Freeze the reading, and open the tension with your director in one conversation.',
    hand: 'Hand up the counterfactual counts — how many items would move rung — not the names of the people holding them.',
  },
  director: {
    title: 'Multi-rung calibration',
    question: 'Which rungs in my organisation are running on a declared span the record contradicts?',
    horizon: 'A quarter. Below that the censoring share on senior rungs is too high to read.',
    see: 'Every rung, its interval, the pooled blocks where measured rungs crossed, and the exact partition of open work that would move.',
    act: 'If a rung is declared too wide, the decision is structural: either that work belongs one rung up, or the span is wrong. Say which, in writing.',
    hand: 'Hand up the calibrated table and the reading id that justified it.',
  },
  executive: {
    title: 'The organisation’s real spiral',
    question: 'Is the company running the number of leadership layers it thinks it is?',
    horizon: 'Two quarters. Senior rungs need a year of history before their interval closes.',
    see: 'The measured ladder against the declared one, the rungs whose intervals exclude the declaration, and the enterprise count of work that would change rung.',
    act: 'Approve or refuse a dated adoption. The record proposes; you declare; the workspace remembers both.',
    hand: 'Hand the board the rung-level verdicts and the interval — never a person and never an item.',
  },
  enterprise: {
    title: 'The ladder itself',
    question: 'Does the enterprise ladder — the one every escalation in this workspace is priced against — survive its own record?',
    horizon: 'A year. Anything shorter is a reading, not a calibration.',
    see: 'The full table, the pooled blocks, the counterfactual and the history of every adoption with its before and after.',
    act: 'Adopt, restore, or leave the declaration standing with the tension printed. All three are honest; none is automatic.',
    hand: 'An identity-free ladder table, so the board sees spans and intervals, not people.',
  },
});

/**
 * The read model. Pure: it derives everything from the record on every call, so
 * a calibration can never drift away from the history it claims to describe.
 */
export function buildSpanCalibrationReport(state = {}, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const conventions = spanCalibrationConventions(effective);
  const bandZ = probit(0.5 + conventions.bandPct / 200) ?? 1.6448536269514722;
  const chain = buildChain(state, { now, settings: effective });
  const cohorts = buildSpanCohorts(state, chain, { now, settings: effective, conventions });
  const ladder = ladderFor(effective);
  const leaderRank = altitudeRank(chain.leader.altitude) || 5;

  const rungs = ladder.map((altitude) => calibrateRung({
    altitude,
    curve: cohorts.curves.get(altitude.key) || survivalCurve([], { riskFloor: conventions.riskFloor }),
    conventions,
    bandZ,
  }));

  // Pool crossing measured rungs, then build the proposal from the pooled table.
  const measurables = rungs
    .filter((rung) => rung.verdict !== 'insufficient' && Number.isFinite(rung.measuredDays))
    .map((rung) => ({ key: rung.key, value: rung.measuredDays, weight: Math.max(1, rung.decidedN) }));
  const isotonic = isotopeRungs(measurables);
  for (const rung of rungs) {
    if (isotonic.values.has(rung.key)) {
      rung.pooledMeasuredDays = isotonic.values.get(rung.key);
      rung.pooled = isotonic.pooled.has(rung.key);
    } else {
      rung.pooledMeasuredDays = null;
      rung.pooled = false;
    }
  }
  const proposed = proposeLadder(rungs, ladder, conventions);
  const counterfactual = spanCounterfactual(
    cohorts.items.filter((item) => !item.sensitive),
    { fromLadder: ladder, toLadder: proposed.map((row) => ({ ...altitudeByKey(row.key), horizonDays: row.days })), leaderRank },
  );
  const rollup = buildRollup(chain, cohorts, conventions);

  const openItems = cohorts.items.filter((item) => item.closed !== true);
  const verdictCounts = rungs.reduce((acc, rung) => {
    acc[rung.verdict] = (acc[rung.verdict] || 0) + 1;
    return acc;
  }, {});

  const readings = (Array.isArray(state.spanReadings) ? state.spanReadings : []);
  const latest = readings[0] || null;
  const openDecisions = (Array.isArray(state.decisions) ? state.decisions : [])
    .filter((row) => row && !row.chosen && Array.isArray(row.tags) && row.tags.includes('span-calibration'))
    .slice(0, 20);
  const adoptions = (Array.isArray(state.spanAdoptions) ? state.spanAdoptions : []).slice(0, 12);

  const withheld = [];
  if (cohorts.excludedSources.length) {
    withheld.push({ n: cohorts.excludedSources.length, reason: `${cohorts.excludedSources.map((s) => s.label).join(', ')}: individual-sensitive records never enter an organisational measurement` });
  }
  for (const rung of rungs) {
    if (rung.verdict === 'insufficient') withheld.push({ n: 1, reason: `${rung.label}: ${rung.reason}` });
  }
  const suppressedRollup = rollup.filter((row) => row.suppressed).length;
  if (suppressedRollup) withheld.push({ n: suppressedRollup, reason: `${suppressedRollup} span cell(s) in the roll-up are blank at the declared floor of ${conventions.cellFloor}` });

  return {
    ok: true,
    engine: SPAN_ENGINE_VERSION,
    generatedOn: dayKey(now),
    premise: SPAN_PREMISE,
    disclosure: SPAN_DISCLOSURE,
    conventions,
    bandZ,
    ladder: {
      source: ladder[0]?.horizonSource === 'calibrated' ? 'calibrated' : 'declared',
      adoptedOn: effective.chainAdoptedOn || null,
      adoptedReadingId: effective.chainAdoptedReadingId || null,
      declared: ALTITUDES.map((altitude) => ({ key: altitude.key, label: altitude.label, days: altitude.horizonDays })),
      effective: ladder.map((altitude) => ({ key: altitude.key, label: altitude.label, days: altitude.horizonDays, declaredDays: altitude.declaredHorizonDays ?? altitude.horizonDays })),
      proposed: proposed.map((row) => ({ ...row })),
      moves: proposed.filter((row) => row.days !== row.declaredDays).length,
    },
    rungs,
    verdictCounts,
    cohorts: cohorts.bySource,
    excludedSources: cohorts.excludedSources,
    defects: cohorts.defects,
    counterfactual,
    rollup,
    totals: {
      itemsN: cohorts.totalN,
      openN: openItems.length,
      decidedN: cohorts.totalN - openItems.length,
      readingsN: readings.length,
      falsifiedN: (verdictCounts['too-wide'] || 0) + (verdictCounts['too-narrow'] || 0),
      measurableRungs: rungs.filter((rung) => rung.verdict !== 'insufficient').length,
    },
    readings,
    latestReading: latest,
    adoptions,
    openDecisions,
    withheld,
    playbook: PLAYBOOK[chain.nodes.get(LEADER_ID)?.altitude || 'manager'] || PLAYBOOK.manager,
    chain,
  };
}

/* ------------------------------------------------------------------ */
/* 8. Freezing, grading and adopting                                   */
/* ------------------------------------------------------------------ */

/**
 * Freeze a reading: the per-rung verdicts, the proposed table, the
 * counterfactual counts and — for each measurable rung — the ONE prospective
 * claim this reading makes: the probability that work at this rung is still
 * open at its declared span. Grading later reads only items opened after this
 * date, so the claim is scored out of sample or not at all.
 */
export function buildSpanReading(state, { id, now = new Date(), settings = null } = {}) {
  const report = buildSpanCalibrationReport(state, { now, settings });
  const conventions = report.conventions;
  const rungs = report.rungs.map((rung) => ({
    key: rung.key,
    rank: rung.rank,
    declaredDays: rung.declaredDays,
    decidedN: rung.decidedN,
    censoredN: rung.censoredN,
    censoringPct: rung.censoringPct,
    measuredDays: rung.measuredDays,
    pooledMeasuredDays: rung.pooledMeasuredDays,
    pooled: rung.pooled,
    ciLo: rung.ciLo,
    ciHi: rung.ciHi,
    survivalAtDeclaredPct: rung.survivalAtDeclaredPct,
    survivalAtDeclaredLoPct: rung.survivalAtDeclaredLoPct,
    survivalAtDeclaredHiPct: rung.survivalAtDeclaredHiPct,
    verdict: rung.verdict,
    reason: rung.reason,
  }));
  if (!rungs.some((rung) => rung.verdict !== 'insufficient')) {
    return { ok: false, error: 'No rung can be measured yet: freeze the ladder once at least one rung has decided items above the declared floor.' };
  }
  const reviewDays = clampInt(conventions.reviewDays, 14, 365, SPAN_DEFAULTS.spanCalibrationReviewDays);
  return {
    ok: true,
    reading: {
      id,
      frozenOn: dayKey(now),
      reviewOn: addDays(dayKey(now), reviewDays),
      reviewDays,
      coveragePct: conventions.coveragePct,
      decidedFloor: conventions.decidedFloor,
      censoringPct: conventions.censoringPct,
      riskFloor: conventions.riskFloor,
      bandPct: conventions.bandPct,
      ladderSource: report.ladder.source,
      adoptedOn: report.ladder.adoptedOn,
      declaredLadder: report.ladder.effective.map((row) => ({ key: row.key, days: row.days })),
      proposedLadder: report.ladder.proposed.map((row) => ({ key: row.key, days: row.days, declaredDays: row.declaredDays, source: row.source })),
      rungs,
      counterfactual: {
        itemsN: report.counterfactual.itemsN,
        riseN: report.counterfactual.riseN,
        fallN: report.counterfactual.fallN,
        unchangedN: report.counterfactual.unchangedN,
        aboveTopN: report.counterfactual.aboveTopN,
      },
      totals: { itemsN: report.totals.itemsN, decidedN: report.totals.decidedN, falsifiedN: report.totals.falsifiedN },
      engine: SPAN_ENGINE_VERSION,
      gradedAt: null,
      grade: null,
    },
  };
}

/**
 * Grade a frozen reading ONCE, after its review date, on items opened AFTER the
 * freeze. For each rung with a quoted probability, the observed outcome is
 * whether each post-freeze item was still open at the declared span (1) or
 * closed inside it (0). Refused when too few items have become observable, and
 * never re-graded.
 */
export function gradeSpanReading(reading, state, { now = new Date(), settings = null } = {}) {
  if (!isPlainObject(reading) || !reading.id) return { ok: false, error: 'No reading to grade.' };
  if (reading.gradedAt) return { ok: false, error: `Reading ${reading.id} was already graded on ${reading.gradedAt}; a frozen claim is graded once.` };
  const today = dayKey(now);
  const reviewOn = reading.reviewOn || addDays(reading.frozenOn, 14);
  if (today < reviewOn) return { ok: false, error: `This reading cannot be graded before ${reviewOn}.` };
  const effective = settings || state?.settings || {};
  const conventions = spanCalibrationConventions(effective);
  const chain = buildChain(state, { now, settings: effective });
  // The split is strictly out of sample by OPENING date: an item that was
  // already open when the claim was frozen is exactly the sample the claim was
  // derived from, so scoring it would be grading a model on its own training set.
  const items = harvestWork(state, chain, { now, settings: effective, includeClosed: true })
    .filter((item) => item.openedOn && item.openedOn > reading.frozenOn && !item.sensitive);
  const graded = [];
  for (const rung of reading.rungs || []) {
    if (rung.survivalAtDeclaredPct === null || rung.survivalAtDeclaredPct === undefined) {
      graded.push({ key: rung.key, outcome: 'refused', reason: 'this rung quoted no probability, so there is nothing to score', predictedPct: null, observedPct: null, brier: null, n: 0 });
      continue;
    }
    const horizon = Number(rung.declaredDays);
    const mine = items.filter((item) => item.ownerAltitude === rung.key);
    let observableN = 0;
    let overN = 0;
    for (const item of mine) {
      if (item.closed) {
        if (item.durationDays >= horizon) { observableN += 1; overN += 1; }
        else { observableN += 1; }
      } else if (item.ageDays >= horizon) {
        observableN += 1; overN += 1;
      }
      // still open and younger than the span: not yet observable, so not scored
    }
    if (observableN < conventions.decidedFloor) {
      graded.push({
        key: rung.key, outcome: 'pending', predictedPct: rung.survivalAtDeclaredPct, observedPct: pct(overN, observableN),
        brier: null, n: observableN,
        reason: `${observableN} post-freeze item(s) at this rung are observable, below the declared floor of ${conventions.decidedFloor}`,
      });
      continue;
    }
    const observed = overN / observableN;
    const predicted = Number(rung.survivalAtDeclaredPct) / 100;
    graded.push({
      key: rung.key,
      outcome: 'graded',
      predictedPct: rung.survivalAtDeclaredPct,
      observedPct: round(observed * 100, 1),
      brier: round((predicted - observed) ** 2, 4),
      n: observableN,
      overN,
      reason: null,
    });
  }
  const scored = graded.filter((row) => row.outcome === 'graded');
  if (!scored.length) {
    return { ok: false, error: 'No rung has enough post-freeze observations to grade yet; the reading stays ungraded rather than being scored on its own sample.' , graded };
  }
  return {
    ok: true,
    grade: {
      gradedOn: today,
      rows: graded,
      rungsScoredN: scored.length,
      meanBrier: round(scored.reduce((sum, row) => sum + row.brier, 0) / scored.length, 4),
    },
  };
}

/**
 * The ladder a human may adopt from a reading: the proposed table, clamped to
 * the declared move band and forced monotone, exactly as `proposeLadder` built it.
 * This function exists so the action and the view cannot disagree about it.
 */
export function adoptableLadder(reading, ladder, conventions) {
  if (!isPlainObject(reading)) return null;
  const proposed = Array.isArray(reading.proposedLadder) ? reading.proposedLadder : [];
  if (!proposed.length) return null;
  const rows = ladder.map((altitude) => {
    const match = proposed.find((row) => row.key === altitude.key);
    const declared = altitude.declaredHorizonDays || altitude.horizonDays;
    const value = match && Number.isFinite(Number(match.days)) ? Math.round(Number(match.days)) : declared;
    const min = Math.ceil(declared * (conventions.adoptMinPct / 100));
    const max = Math.round(declared * (conventions.adoptMaxPct / 100));
    return { key: altitude.key, rank: altitude.rank, days: Math.min(max, Math.max(min, value)) };
  });
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].days <= rows[index - 1].days) rows[index].days = rows[index - 1].days + 1;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* 9. Signals, attention and the brief                                 */
/* ------------------------------------------------------------------ */

/**
 * Signal ids are stable so a frozen reading can be compared with a later one.
 *  SPC-01 a rung the record says is declared too wide (work runs past its span)
 *  SPC-02 a rung the record says is declared too narrow (span allows more than the work needs)
 *  SPC-03 the ladder in force was adopted and the record has since moved
 *  SPC-04 not enough history to calibrate anything yet
 */
export function spanCalibrationSignals(state = {}, now = new Date(), settings = null) {
  const report = buildSpanCalibrationReport(state, { now, settings });
  const signals = [];
  for (const rung of report.rungs) {
    if (rung.verdict === 'too-wide') {
      signals.push({
        id: 'SPC-01', key: rung.key, tone: 'bad',
        title: `${rung.label}: declared ${rung.declaredDays}d, record says ${rung.ciLo}–${rung.ciHi}d`,
        detail: rung.reason,
        evidence: [`${rung.decidedN} decided / ${rung.censoredN} censored`, `coverage ${rung.coveragePct}%`],
      });
    } else if (rung.verdict === 'too-narrow') {
      signals.push({
        id: 'SPC-02', key: rung.key, tone: 'warn',
        title: `${rung.label}: declared ${rung.declaredDays}d, record says ${rung.ciLo}–${rung.ciHi}d`,
        detail: rung.reason,
        evidence: [`${rung.decidedN} decided / ${rung.censoredN} censored`],
      });
    }
  }
  if (report.ladder.source === 'calibrated' && report.ladder.moves) {
    const adopted = report.ladder.effective.map((row) => row.days).join('/');
    const proposed = report.ladder.proposed.map((row) => row.days).join('/');
    if (adopted !== proposed) {
      signals.push({
        id: 'SPC-03', tone: 'warn',
        title: 'The adopted ladder and the record disagree',
        detail: `In force: ${adopted} days. The record now supports ${proposed}. Freeze a reading and decide again — nothing changes by itself.`,
        evidence: [`adopted ${report.ladder.adoptedOn || 'unknown date'}`],
      });
    }
  }
  if (!report.totals.measurableRungs) {
    signals.push({
      id: 'SPC-04', tone: 'neutral',
      title: 'Not enough history to calibrate a rung yet',
      detail: `No rung has ${report.conventions.decidedFloor} decided items with less than ${report.conventions.censoringPct}% still open. Keep deciding work and closing it; the record is the instrument.`,
      evidence: [`${report.totals.itemsN} item(s)`, `${report.totals.openN} still open`],
    });
  }
  return signals;
}

export function spanCalibrationAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildSpanCalibrationReport(state, { now, settings });
  const falsified = report.totals.falsifiedN;
  const ungraded = report.readings.filter((reading) => !reading.gradedAt && reading.reviewOn && reading.reviewOn <= dayKey(now)).length;
  return falsified + ungraded;
}

export function spanCalibrationBriefText(report) {
  if (!report || !report.ok) return '';
  const parts = [];
  parts.push(`Discretion calibration as of ${report.generatedOn}: ${report.totals.decidedN} decided and ${report.totals.openN} still-open item(s) across ${report.totals.itemsN}.`);
  const denominator = report.ladder.source === 'calibrated' ? 'adopted' : 'declared';
  parts.push(`The ${denominator} ladder is ${report.ladder.effective.map((row) => `${row.key} ${row.days}d`).join(' / ')}.`);
  for (const rung of report.rungs) {
    if (rung.verdict === 'insufficient') {
      parts.push(`${rung.label}: not estimable — ${rung.reason}`);
    } else {
      const band = rung.ciLo === null || rung.ciHi === null
        ? `${rung.measuredDays}d (band not bounded)`
        : `${rung.measuredDays}d (interval ${rung.ciLo}–${rung.ciHi})`;
      parts.push(`${rung.label}: declared ${rung.declaredDays}d, record supports ${band}, verdict ${SPAN_VERDICTS[rung.verdict]?.label || rung.verdict}.`);
    }
  }
  if (report.ladder.moves) {
    parts.push(`A human adoption would move ${report.ladder.moves} rung(s): ${report.ladder.proposed.map((row) => `${row.key} ${row.declaredDays}→${row.days}d`).join(', ')}. Nothing is changed until someone dates the decision.`);
  }
  parts.push(report.counterfactual.note);
  parts.push(`Identity-free: no person, item or record title appears in this brief. ${report.conventions.decidedFloor} decided items per rung is the declared floor.`);
  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* 10. CSV rows (aggregate only, refusals blank)                       */
/* ------------------------------------------------------------------ */

export function spanCalibrationCsvRows(report) {
  if (!report || !report.ok) return [];
  const rows = [];
  for (const rung of report.rungs) {
    rows.push({
      row_kind: 'rung',
      altitude: rung.key,
      altitude_rank: rung.rank,
      declared_days: rung.declaredDays,
      declared_source: rung.declaredSource,
      coverage_pct: rung.coveragePct,
      decided_n: rung.decidedN,
      censored_n: rung.censoredN,
      censoring_pct: rung.censoringPct,
      measured_days: rung.measuredDays ?? '',
      pooled_measured_days: rung.pooled ? (rung.pooledMeasuredDays ?? '') : '',
      interval_low_days: rung.ciLo ?? '',
      interval_high_days: rung.ciHi ?? '',
      survival_at_declared_pct: rung.survivalAtDeclaredPct ?? '',
      survival_low_pct: rung.survivalAtDeclaredLoPct ?? '',
      survival_high_pct: rung.survivalAtDeclaredHiPct ?? '',
      verdict: rung.verdict,
      withheld: rung.verdict === 'insufficient' ? 'yes' : 'no',
      n: '',
      change_n: '',
    });
  }
  for (const row of report.counterfactual.rows) {
    rows.push({
      row_kind: 'counterfactual', altitude: row.key, altitude_rank: row.rank, declared_days: '', declared_source: '',
      coverage_pct: report.conventions.coveragePct, decided_n: '', censored_n: '', censoring_pct: '',
      measured_days: '', pooled_measured_days: '', interval_low_days: '', interval_high_days: '',
      survival_at_declared_pct: '', survival_low_pct: '', survival_high_pct: '', verdict: '',
      withheld: 'no', n: row.itemsN, change_n: row.riseN - row.fallN,
    });
  }
  for (const row of report.rollup) {
    rows.push({
      row_kind: 'span', altitude: row.altitudeKey, altitude_rank: row.rank, declared_days: '', declared_source: '',
      coverage_pct: '', decided_n: row.suppressed ? '' : row.decidedN, censored_n: row.suppressed ? '' : row.censoredN,
      censoring_pct: row.suppressed ? '' : row.censoringPct, measured_days: '', pooled_measured_days: '',
      interval_low_days: '', interval_high_days: '', survival_at_declared_pct: '', survival_low_pct: '',
      survival_high_pct: '', verdict: '', withheld: row.suppressed ? 'yes' : 'no',
      n: row.suppressed ? '' : row.itemsN, change_n: '',
    });
  }
  return rows;
}
