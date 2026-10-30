/**
 * app/core/domain/leaderCalibration.js — the Leader Probability Calibration
 * Terminal (Session 79, Schema v56, ADR-0044).
 *
 * WHAT WAS MISSING
 * ----------------
 * The Information Value Terminal (v54) computes EVPI, EVSI and minimax regret
 * exactly from the leader's declared payoffs and probabilities, and Brier/log
 * loss scores a frame once the true state is known. What it does NOT answer is
 * the question every honest forecaster asks about themselves:
 *
 *     *when I say "70%", how often am I actually right?*
 *
 * Without that answer, EVPI is an upper bound over an *unchecked* set of
 * beliefs. An overconfident leader can declare a 95% probability that is true
 * 60% of the time and the arithmetic will be flawless — and wrong.
 *
 * This module is the calibration read. It answers five questions no leadership
 * tool currently answers:
 *
 *  1. **Am I over- or under-confident?** The calibration curve (reliability
 *     diagram) — Murphy (1973) decomposition of the multi-class Brier score
 *     into reliability, resolution and uncertainty — buckets declared
 *     probabilities into five probability bands and plots the observed hit
 *     rate in each band. The weighted mean reliability gap is a signed score:
 *     positive → overconfident (declare higher than reality), negative →
 *     underconfident.
 *  2. **Is there a base-rate bias?** The overall calibration gap: Σpᵢ −
 *     Σ1_{i=realised}, across all settled states on all settled frames.
 *  3. **Am I well-calibrated enough to trust my EVPI ceilings?** A verdict
 *     with a 95% Wilson interval on the hit rate in each band. Below three
 *     samples the verdict is withheld and counts only are shown.
 *  4. **Where am I miscalibrated most?** Per-band errors, so a leader who
 *     always declares 80% on things that are 50/50 sees it on the middle
 *     band, not buried in a composite score.
 *  5. **How should I adjust future declarations?** A recalibration suggestion
 *     — the Platt-style isotonic mapping implied by the track record — shown
 *     as an advisory band ("your 70% historically resolves at ~55%") rather
 *     than a silent rewrite of inputs.
 *
 * NAMED THEORY, IMPLEMENTED EXPLICITLY
 * ------------------------------------
 *  - **Proper scoring rules (Brier 1950; Good 1952).** Multi-class Brier is
 *    the primary composite. It is strictly proper: the optimal strategy is
 *    to state your true belief. Reporting mean-squared-error on binary hits
 *    loses information in multi-state frames, so the multi-class form is
 *    primary and the binary (one-vs-rest) form is reported per bucket.
 *  - **Murphy (1973) reliability-resolution-uncertainty decomposition.**
 *    Brier = reliability − resolution + uncertainty. "Reliability" is how
 *    far the observed rate in each bucket is from the bucket midpoint.
 *    "Resolution" measures how much the forecast discriminated between
 *    events that did and did not happen. "Uncertainty" is the underlying
 *    base-rate entropy — the irreducible floor no forecaster can beat.
 *  - **Reliability diagram bins (Bröcker & Smith 2007).** Five equal-range
 *    probability bands (0–20, 20–40, …, 80–100), with the observed hit
 *    rate in each plotted against the band midpoint. The equal-range bin
 *    choice is transparent; bins with fewer than three samples are reported
 *    as "thin" and excluded from the verdict line.
 *  - **Wilson (1927) score interval for binomial proportions.** Each band's
 *    hit rate is reported with a 95% Wilson interval — better at small
 *    samples than the normal approximation, and explicitly asymmetric near
 *    0 and 1. Withheld below three samples per band.
 *  - **Cromwell's rule (Dawid 1982; Lindley).** Probabilities of exactly 0%
 *    or 100% are clamped to the 5%/95% bands in the calibration read,
 *    consistent with the FORECAST_MIN_PCT/MAX_PCT convention already used
 *    for decision forecasts, because one 100% miss would dominate the
 *    score and it is a claim an honest forecaster cannot defend.
 *  - **Tetlock & Gardner (2015) Superforecasting feedback loops.** The page
 *    gives back the leader their own calibration curve and per-band gaps,
 *    not a punitive score. It includes a "per-domain" breakdown by
 *    premise-topic tag to surface where calibration drifts (e.g. "you are
 *    well-calibrated on delivery risk but systematically 20 points
 *    overconfident on hiring").
 *  - **Platt (1999) / isotonic regression suggestion.** The mapping from
 *    declared probability to observed hit rate per band is reported as an
 *    *advisory* mapping, never auto-applied to future declarations. Silent
 *    auto-correction of a leader's probabilities would substitute the
 *    past for the present and would make the calibration read itself a
 *    target for gaming.
 *
 * HARD HONESTY BOUNDARIES
 * -----------------------
 *  - **Counts-only below a floor.** The module reports counts only below
 *    five settled state-outcomes and refuses to render a verdict below
 *    ten. Calibration cannot be inferred from an anecdote.
 *  - **No correction is auto-applied.** The advisory recalibration mapping
 *    is printed. The leader's probabilities are never rewritten silently;
 *    that would be a hidden model of the leader and a recipe for feedback
 *    loops that no reader could audit.
 *  - **Domain splits use explicit premise tags only.** Topics are derived
 *    from the premise each state cites — never inferred from prose or
 *    option labels — because an unsupervised topic model would introduce
 *    clusters the leader cannot audit.
 *  - **Per-leader, not per-person.** This is a calibration read on the
 *    workspace user. It does not score named individuals and is never
 *    exported under a person's name.
 *  - **Conflicts and anonymous pulses are never read.** The module reads
 *    only voiDecisions, voiStudies, premises and the decision ledger.
 *
 * Pure module: no DOM, storage, network, Math.random or wall clock.
 */

import { dayKey, daysBetween } from '../time.js';
import { evaluateFrame } from './valueOfInformation.js';

export const LCAL_ENGINE_VERSION = 'leader-calibration-2026.10-v2';
export const LCAL_BINS = 5;
export const LCAL_COUNTS_ONLY_FLOOR = 5;
export const LCAL_VERDICT_FLOOR = 10;
export const LCAL_BIN_VERDICT_FLOOR = 3;
export const LCAL_CROMWELL_MIN_PCT = 5;
export const LCAL_CROMWELL_MAX_PCT = 95;
export const LCAL_RELIABILITY_BAD = 0.08;   // 8pp mean reliability gap
export const LCAL_RELIABILITY_WARN = 0.04;  // 4pp gap
export const LCAL_OVERCONFIDENCE_PP = 10;   // 10pp systematic overstatement

export const LCAL_RULE_IDS = Object.freeze({
  SCORED: 'RULE-LCAL-01',
  DRIFT: 'RULE-LCAL-02',
  OVERCONFIDENCE: 'RULE-LCAL-03',
  DECISION_BRIDGE: 'RULE-LCAL-04',
});

export const LCAL_RULES = Object.freeze([
  {
    id: LCAL_RULE_IDS.SCORED,
    name: 'Add a freshly-settled frame to the calibration sample',
    framework: 'Proper scoring · Brier (1950) · Murphy (1973)',
    trigger: 'voi.scanned (settle)',
    targetModule: 'voi',
    description: 'When a VOI frame is settled (fired as voi.scanned), the frozen probability distribution is counted in the calibration ledger; a signal is emitted if the new sample pushes the leader across the verdict floor.',
  },
  {
    id: LCAL_RULE_IDS.DRIFT,
    name: 'Flag calibration drift between cohorts',
    framework: 'PSI drift detection · Tetlock & Gardner (2015)',
    trigger: 'voi.scanned (settle)',
    targetModule: 'voi',
    description: 'When enough samples exist to split the ledger into an earlier and a recent cohort (ten each), compute PSI on the forecast-mix distribution and flag a drift signal when the reading exceeds 0.25.',
  },
  {
    id: LCAL_RULE_IDS.OVERCONFIDENCE,
    name: 'Surface overconfidence findings on open EVPI ceilings',
    framework: 'Proper scoring · calibration curve · Superforecasting feedback',
    trigger: 'voi.declared',
    targetModule: 'voi',
    description: 'When the full calibration verdict is overconfident, stamp an in-band advisory on a new open frame. Never auto-adjusts declared probabilities.',
  },
  {
    id: LCAL_RULE_IDS.DECISION_BRIDGE,
    name: 'Trace calibration sensitivity into a new decision',
    framework: 'Proper scoring · Jeffreys beta-binomial shrinkage · Wilson interval · value of information',
    trigger: 'voi.declared / voi.scanned (settlement)',
    targetModule: 'voi + typed provenance',
    description: 'For probability bands with at least three observations, append a clearly labelled EVPI stress and link up to three prior settled frames that contributed evidence. A newly mature history also connects already-open frames, with settlement sweeps capped at twenty and an explicit remainder event. It is not a posterior and never overwrites a declaration or frozen prediction.',
  },
]);

export const LCAL_CONVENTIONS = Object.freeze({
  minSamples: LCAL_COUNTS_ONLY_FLOOR,
  verdictSamples: LCAL_VERDICT_FLOOR,
  overconfidencePp: LCAL_OVERCONFIDENCE_PP,
  badReliability: LCAL_RELIABILITY_BAD,
  warnReliability: LCAL_RELIABILITY_WARN,
});

export function lcalConventionsFromSettings(state = {}) {
  const s = state?.settings || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const int = (value, min, max, fallback) => {
    const n = Math.round(num(value, fallback));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    minSamples: int(s.lcalMinSamples, 1, 50, LCAL_CONVENTIONS.minSamples),
    verdictSamples: int(s.lcalVerdictSamples, 5, 100, LCAL_CONVENTIONS.verdictSamples),
    overconfidencePp: int(s.lcalOverconfidencePp, 1, 50, LCAL_CONVENTIONS.overconfidencePp),
    badReliability: num(s.lcalBadReliability, LCAL_CONVENTIONS.badReliability),
    warnReliability: num(s.lcalWarnReliability, LCAL_CONVENTIONS.warnReliability),
  };
}

/* -------------------------------------------------------------- arithmetic */

function round4(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 10000) / 10000;
}

function round2(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

function clampPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return LCAL_CROMWELL_MIN_PCT;
  return Math.min(LCAL_CROMWELL_MAX_PCT, Math.max(LCAL_CROMWELL_MIN_PCT, n));
}

/**
 * Wilson (1927) score interval for a binomial proportion at 95%. Returns [lo, hi]
 * in [0,1]. Works at small samples and near 0/1; asymmetric.
 */
function wilson95(hits, n) {
  if (n <= 0) return [null, null];
  const z = 1.959963984540054; // 97.5th percentile of N(0,1)
  const p = hits / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/* ------------------------------------------------------ the sample stream */

/**
 * Extract calibration samples from the workspace.
 *
 * Standard probabilistic-forecast methodology (Tetlock & Gardner 2015; Murphy
 * 1973) takes ONE sample per resolved forecast: the probability declared for
 * the state that *actually occurred*, and binary outcome = 1 by construction
 * (that state did happen). The complementary probability on the non-realised
 * states is NOT an independent sample — it is the other side of the same
 * forecast — so pairing them together mechanically forces the average
 * forecast to equal the base rate and masks overconfidence.
 *
 * Per-frame we also derive a Brier-sample vector used in the multi-class
 * scoring; the reliability diagram and signed-gap verdict use the single-P
 * form, which is the industry standard for calibration curves on a
 * probability-for-the-winning-outcome basis.
 */
export function extractCalibrationSamples(state = {}) {
  const frames = Array.isArray(state.voiDecisions) ? state.voiDecisions : [];
  const premiseLookup = new Map((state.premises || []).map((p) => [p.id, p]));

  const samples = [];
  for (const frame of frames) {
    if (!frame || frame.status !== 'decided') continue;
    const outcomes = Array.isArray(frame.outcomes) ? frame.outcomes : [];
    for (const outcome of outcomes) {
      if (!outcome || !outcome.realizedStateId) continue;
      const realizedId = outcome.realizedStateId;
      const settledOn = outcome.settledOn || outcome.on || null;
      const probMap = new Map((Array.isArray(outcome.probabilities) ? outcome.probabilities : []).map((row) => [row.stateId, Number(row.pct)]));
      const snapshotExists = Array.isArray(outcome.probabilities) && outcome.probabilities.length > 0;

      // Find the realized state row.
      const realizedState = (Array.isArray(frame.states) ? frame.states : []).find((s) => s && s.id === realizedId);
      if (!realizedState) continue;
      const rawPct = snapshotExists ? probMap.get(realizedId) : Number(realizedState.probability);
      if (!Number.isFinite(rawPct)) continue;
      const forecastPct = clampPct(rawPct);
      const premiseId = realizedState.premiseId || null;
      const premise = premiseId ? premiseLookup.get(premiseId) : null;

      // For the multi-class Brier vector, produce one binary sample per state
      // (used only in the multi-class MSE figure; the verdict uses single-P).
      const allStateP = [];
      for (const s of Array.isArray(frame.states) ? frame.states : []) {
        if (!s || !s.id) continue;
        const p = snapshotExists ? probMap.get(s.id) : Number(s.probability);
        if (Number.isFinite(p)) allStateP.push({ stateId: s.id, pct: clampPct(p), hit: s.id === realizedId ? 1 : 0 });
      }

      samples.push({
        frameId: frame.id,
        frameLabel: frame.label || 'Untitled',
        stateId: realizedState.id,
        stateLabel: realizedState.label || 'Untitled state',
        premiseId,
        premiseTopic: premise?.topic || premise?.category || null,
        premiseTitle: premise?.title || null,
        forecastPct,
        realized: 1, // calibration curve: P(realized) — hit is always 1
        allStateP, // multi-class vector for Brier scoring
        settledOn,
        legacy: !snapshotExists,
        currency: frame.currency || 'USD',
        stake: Number.isFinite(Number(frame.stake)) ? Number(frame.stake) : null,
      });
    }
  }
  samples.sort((a, b) => `${a.settledOn}|${a.frameId}`.localeCompare(`${b.settledOn}|${b.frameId}`));
  return samples;
}

/* ---------------------------------------------------------- reliability */

/**
 * Bin index for a declared probability across five equal half-open bands
 * [0,20), [20,40), [40,60), [60,80), [80,100]. Cromwell-clamped 5%/95% land
 * in the bottom and top bands respectively.
 */
function binIndexFor(pct) {
  if (pct <= 0) return 0;
  if (pct >= 100) return LCAL_BINS - 1;
  if (pct >= 80) return LCAL_BINS - 1; // include 80..100 in the top band
  if (pct < 20) return 0;
  return Math.floor(pct / 20);
}

/**
 * Build the five-bin reliability diagram. Each (p, hit) binary pair from
 * each state of each outcome is placed in its band. The bin's hit rate is
 * hits/n against the mean forecast in that band.
 */
export function buildReliabilityBins(samples = []) {
  const bins = Array.from({ length: LCAL_BINS }, (_, i) => {
    const lo = i * 20;
    const hi = i === LCAL_BINS - 1 ? 100 : (i + 1) * 20;
    const midpoint = (lo + hi) / 2;
    return {
      index: i, lo, hi, midpoint,
      forecasts: [],
      binaryForecasts: [],
      binaryHits: [],
      count: 0,
      binaryCount: 0,
      hits: 0,
      meanForecast: null,
      hitRate: null,
      gap: null,
      gapPp: null,
      wilsonLo: null,
      wilsonHi: null,
      status: 'thin',
    };
  });

  for (const sample of samples) {
    if (sample.legacy) continue;
    const p = sample.forecastPct;
    const idx = binIndexFor(p);
    const bin = bins[idx];
    if (bin) {
      bin.forecasts.push(p);
      bin.count += 1;
    }
    for (const sp of (sample.allStateP || [])) {
      const j = binIndexFor(sp.pct);
      const b2 = bins[j];
      if (!b2) continue;
      b2.binaryForecasts.push(sp.pct);
      b2.binaryHits.push(sp.hit);
      b2.binaryCount += 1;
      if (sp.hit) b2.hits += 1;
    }
  }

  for (const bin of bins) {
    if (bin.binaryCount >= 1) {
      bin.meanForecast = round2(bin.binaryForecasts.reduce((s, v) => s + v, 0) / bin.binaryCount);
      bin.hitRate = round4(bin.hits / bin.binaryCount);
      bin.gap = round4((bin.meanForecast / 100) - bin.hitRate);
      bin.gapPp = round2(bin.gap * 100);
    }
    const n = bin.binaryCount;
    if (n >= LCAL_BIN_VERDICT_FLOOR) {
      const [lo, hi] = wilson95(bin.hits, n);
      bin.wilsonLo = lo === null ? null : round4(lo);
      bin.wilsonHi = hi === null ? null : round4(hi);
      bin.status = 'scored';
    } else if (n >= 1) {
      bin.status = 'counts-only';
    }
  }

  return bins;
}

/**
 * Murphy (1973) decomposition of mean Brier score over the multi-class
 * binary vectors. For each (state, outcome) pair, Brier_i = (p_i − o_i)^2.
 * The mean decomposes as Reliability − Resolution + Uncertainty over the
 * five reliability bins. Legacy samples are excluded.
 */
export function murphyDecomposition(samples = [], bins = null) {
  const usable = samples.filter((s) => !s.legacy);
  // Binary pairs from every state vector.
  const pairs = [];
  for (const s of usable) for (const sp of (s.allStateP || [])) pairs.push(sp);
  const n = pairs.length;
  if (!n) return { brier: null, reliability: null, resolution: null, uncertainty: null, n: 0 };

  const baseRate = pairs.reduce((s, v) => s + v.hit, 0) / n;
  const useBins = bins || buildReliabilityBins(usable);
  let reliability = 0;
  let resolution = 0;
  for (const bin of useBins) {
    const nk = bin.binaryCount;
    if (!nk) continue;
    const forecastProportion = (bin.meanForecast || 0) / 100;
    const hitRate = bin.hitRate || 0;
    reliability += (nk / n) * ((forecastProportion - hitRate) ** 2);
    resolution += (nk / n) * ((hitRate - baseRate) ** 2);
  }
  const uncertainty = baseRate * (1 - baseRate);
  const brier = reliability - resolution + uncertainty;
  const rawMse = pairs.reduce((s, v) => s + (((v.pct / 100) - v.hit) ** 2), 0) / n;
  return {
    brier: round4(rawMse),
    decomposedBrier: round4(brier),
    reliability: round4(reliability),
    resolution: round4(resolution),
    uncertainty: round4(uncertainty),
    n,
    baseRate: round4(baseRate),
  };
}

/* ------------------------------------------------------- cohort drift */

function psi(earlier, recent, bins = LCAL_BINS) {
  // Population Stability Index over the two forecast vectors. Bin by 20pp bands.
  const countsA = Array(bins).fill(0);
  const countsB = Array(bins).fill(0);
  for (const p of earlier) countsA[Math.max(0, Math.min(bins - 1, Math.floor((p / 100) * bins)))] += 1;
  for (const p of recent) countsB[Math.max(0, Math.min(bins - 1, Math.floor((p / 100) * bins)))] += 1;
  const totalA = countsA.reduce((s, v) => s + v, 0);
  const totalB = countsB.reduce((s, v) => s + v, 0);
  if (!totalA || !totalB) return null;
  const smooth = 0.5;
  let value = 0;
  for (let i = 0; i < bins; i += 1) {
    const a = (countsA[i] + smooth) / (totalA + smooth * bins);
    const b = (countsB[i] + smooth) / (totalB + smooth * bins);
    value += (a - b) * Math.log(a / b);
  }
  return round4(value);
}

/* ---------------------------------------------------- per-topic breakdown */

function topicLabelFor(sample) {
  if (sample.premiseTopic) return sample.premiseTopic;
  if (sample.premiseTitle) return `premise:${sample.premiseId || '?'}`;
  return '(no premise)';
}

function aggregateByTopic(samples = []) {
  const byTopic = new Map();
  for (const sample of samples) {
    if (sample.legacy) continue;
    const topic = topicLabelFor(sample);
    const entry = byTopic.get(topic) || { topic, pairs: [] };
    for (const sp of (sample.allStateP || [])) entry.pairs.push(sp);
    byTopic.set(topic, entry);
  }
  const topics = [];
  for (const { topic, pairs } of byTopic.values()) {
    const n = pairs.length;
    const meanForecast = n ? pairs.reduce((s, r) => s + r.pct, 0) / n : null;
    const hitRate = n ? pairs.reduce((s, r) => s + r.hit, 0) / n : null;
    const brier = n ? pairs.reduce((s, r) => s + (((r.pct / 100) - r.hit) ** 2), 0) / n : null;
    topics.push({
      topic,
      n,
      meanForecastPct: meanForecast === null ? null : round2(meanForecast),
      hitRate: hitRate === null ? null : round4(hitRate),
      calibrationGapPp: (meanForecast !== null && hitRate !== null) ? round2((meanForecast / 100 - hitRate) * 100) : null,
      brier: brier === null ? null : round4(brier),
      status: n >= LCAL_BIN_VERDICT_FLOOR ? 'scored' : 'counts-only',
    });
  }
  topics.sort((a, b) => b.n - a.n || String(a.topic).localeCompare(String(b.topic)));
  return topics;
}

/* --------------------------------------------------- advisory remap */

/**
 * An *advisory* Platt-style per-bin remap: declared p → observed hit rate in
 * the same bin. This is printed as a table the leader inspects, never
 * auto-applied. When the bin is thin the value is null.
 */
export function advisoryRemap(bins = []) {
  return bins.map((bin) => ({
    loPct: bin.lo,
    hiPct: bin.hi,
    declaredMidpointPct: bin.midpoint,
    observedHitRate: bin.status === 'scored' ? bin.hitRate : null,
    observedHitPct: bin.status === 'scored' ? round2(bin.hitRate * 100) : null,
    count: bin.binaryCount,
    outcomeCount: bin.count,
    status: bin.status,
    advisory: bin.status === 'scored'
      ? `When you say ~${bin.midpoint}%, history resolves at ~${round2(bin.hitRate * 100)}% (n=${bin.binaryCount}, 95% Wilson ${round2(bin.wilsonLo * 100)}–${round2(bin.wilsonHi * 100)}%)`
      : bin.binaryCount === 0
        ? 'no samples in this band'
        : `only ${bin.binaryCount} sample(s) — too few to trust`,
  }));
}

/* -------------------------------------------------- the full report */

export function buildCalibrationReport(state = {}, now = new Date()) {
  const conventions = lcalConventionsFromSettings(state);
  const samples = extractCalibrationSamples(state);
  const usable = samples.filter((s) => !s.legacy);
  const nOutcomes = usable.length; // single-P outcomes (one per resolved forecast)
  const legacyN = samples.length - usable.length;

  const bins = buildReliabilityBins(usable);
  const murphy = murphyDecomposition(usable, bins);

  // Signed calibration gap over the single-P (realised-state) forecasts.
  // Positive ⇒ overconfident (stated P(realised) higher than observed frequency).
  const singleP = usable.map((s) => s.forecastPct);
  const signedGapPp = singleP.length
    ? round2(((singleP.reduce((s, v) => s + v, 0) / singleP.length) / 100 - murphy.baseRate) * 100)
    : null;

  // Verdict.
  let verdict = 'insufficient';
  let verdictLabel = 'Not enough data';
  let verdictReason = `The calibration read needs at least ${conventions.verdictSamples} non-legacy settled decisions to grade. Below that the curve is an anecdote, not a signal.`;
  if (nOutcomes >= conventions.verdictSamples) {
    // Weighted absolute reliability gap (the magnitude of calibration error,
    // unsigned at the bin level then weighted by bin size). A forecaster who
    // is 40pp over in the top bin and 40pp under in the bottom bin is badly
    // calibrated overall — a simple signed mean would cancel to zero and
    // miss that.
    const scoredBins = bins.filter((b) => b.status === 'scored');
    const totalBinaryN = scoredBins.reduce((s, b) => s + b.binaryCount, 0);
    const weightedAbsGapPp = totalBinaryN
      ? round2(scoredBins.reduce((s, b) => s + Math.abs(b.gapPp || 0) * b.binaryCount, 0) / totalBinaryN)
      : null;
    // Signed gap from single-P forecasts: mean P(realised) − ideal (base rate
    // is not the right ideal — a well-calibrated forecaster's mean P(realised)
    // is NOT the base rate; a better summary is "mean P(realised) − expected
    // under perfect calibration" which requires full bin frequencies. We
    // therefore use the single-P median/mean vs the average frequency of
    // events at similar P; for simple over/under detection use signedGapPp
    // derived below against the implied well-calibrated mean).
    // A simpler directional signal: does the "high-P" bin (80–100) overshoot
    // and the "low-P" bin (0–20) undershoot symmetrically with the same sign?
    // The single-P signed gap is mean P(realised) − the expected value under
    // the empirical frequency of the forecast bands (the Murphy reliability-
    // weighted forecast). For overconfidence, the weighted absolute gap needs
    // to be bad AND the high-P bin shows a positive gap (states you said
    // would happen with ~90% happened much less often).
    const highBin = bins[4];
    const lowBin = bins[0];
    const highOver = highBin.status === 'scored' && highBin.gapPp >= conventions.overconfidencePp;
    const lowUnder = lowBin.status === 'scored' && lowBin.gapPp <= -conventions.overconfidencePp;
    // For underconfidence, high-P gap is negative, low-P gap positive.
    const highUnder = highBin.status === 'scored' && highBin.gapPp <= -conventions.overconfidencePp;
    const lowOver = lowBin.status === 'scored' && lowBin.gapPp >= conventions.overconfidencePp;

    // "Well calibrated" requires the mean absolute reliability gap to be within
    // the overconfidence-pp tolerance across scored bands. Brier on binary
    // forecasts at 50% base rate has floor 0.25, so we do not use Brier as a
    // calibrated/not threshold — we use reliability (the per-bin gap) directly.
    if (weightedAbsGapPp !== null && weightedAbsGapPp < conventions.overconfidencePp) {
      verdict = 'calibrated';
      verdictLabel = 'Well calibrated';
      verdictReason = `Your mean absolute reliability gap is ${weightedAbsGapPp}pp across scored bands, within the ${conventions.overconfidencePp}pp tolerance. Brier ${murphy.brier}, reliability ${murphy.reliability}.`;
    } else if (highOver && lowUnder) {
      verdict = 'overconfident';
      verdictLabel = 'Overconfident';
      verdictReason = `Events you placed ~${highBin.meanForecast}% probability on happened only ${round2((highBin.hitRate||0)*100)}% of the time (gap ${highBin.gapPp}pp), and events you placed ~${lowBin.meanForecast}% on happened ${round2((lowBin.hitRate||0)*100)}% of the time (gap ${lowBin.gapPp}pp) — a classic overconfidence signature: you call likely things too certain and unlikely things too impossible.`;
    } else if (highUnder && lowOver) {
      verdict = 'underconfident';
      verdictLabel = 'Underconfident';
      verdictReason = `Events you placed ~${highBin.meanForecast}% on happened more often than you said, and events you placed ~${lowBin.meanForecast}% on happened less often — you hedge past what your record supports.`;
    } else {
      verdict = 'miscalibrated';
      verdictLabel = 'Miscalibrated';
      verdictReason = `Your mean absolute reliability gap is ${weightedAbsGapPp}pp (above the ${conventions.overconfidencePp}pp tolerance) but the bias is not uniformly in one direction. Inspect the per-band chart.`;
    }
  } else if (nOutcomes >= conventions.minSamples) {
    verdict = 'counts-only';
    verdictLabel = 'Counts only';
    verdictReason = `${nOutcomes} settled decision(s) is enough to show counts per band but not enough to trust a verdict. Wait for ${conventions.verdictSamples - nOutcomes} more.`;
  }

  // Cohort drift split (PSI on forecast mix of single-P forecasts).
  let drift = null;
  if (nOutcomes >= 20) {
    const candidates = [];
    for (let i = 10; i <= nOutcomes - 10; i += 1) {
      if (usable[i - 1].settledOn < usable[i].settledOn) candidates.push(i);
    }
    const splitAt = candidates.sort((a, b) => Math.abs(a - nOutcomes / 2) - Math.abs(b - nOutcomes / 2))[0];
    if (splitAt !== undefined) {
      const earlier = usable.slice(0, splitAt);
      const recent = usable.slice(splitAt);
      const psiValue = psi(earlier.map((r) => r.forecastPct), recent.map((r) => r.forecastPct));
      drift = {
        psi: psiValue,
        earlierN: earlier.length,
        recentN: recent.length,
        earlierThrough: earlier[earlier.length - 1]?.settledOn || null,
        recentFrom: recent[0]?.settledOn || null,
        status: psiValue === null ? 'not-computable' : psiValue < 0.1 ? 'stable' : psiValue < 0.25 ? 'watch' : 'drifted',
      };
    }
  }

  // Per-topic breakdown.
  const topics = aggregateByTopic(usable);

  // Advisory remap.
  const remap = advisoryRemap(bins);

  // High-stakes open frames flagged when overconfident.
  let highStakesAdjustedCount = 0;
  if (verdict === 'overconfident') {
    const openFrames = (state.voiDecisions || []).filter((f) => f && f.status === 'open');
    highStakesAdjustedCount = openFrames.length;
  }

  return {
    engineVersion: LCAL_ENGINE_VERSION,
    conventions,
    samples,
    sampleCount: samples.length,
    usableCount: nOutcomes,
    legacyCount: legacyN,
    bins,
    murphy,
    signedGapPp,
    verdict,
    verdictLabel,
    verdictReason,
    drift,
    topics,
    remap,
    highStakesAdjustedCount,
    caveats: [
      'Each settled state-outcome is one binary sample: the declared probability of that state against whether it occurred. One settled k-state frame therefore produces k samples.',
      'Probabilities of 0% or 100% are Cromwell-clamped to 5%/95% in the read, because 0% and 100% are claims an honest forecaster cannot defend and a single 100% miss would dominate the score.',
      `Counts are shown at ${conventions.minSamples} samples but a verdict is withheld below ${conventions.verdictSamples}. Per-band verdicts are withheld below ${LCAL_BIN_VERDICT_FLOOR}.`,
      'The Wilson 95% interval on each bin\'s hit rate is the Clopper–Pearson-style score interval (Wilson 1927), chosen because it is asymmetric at small samples and stays inside [0,1].',
      'The advisory remap is printed for inspection only. Your declared probabilities are never silently rewritten — that would substitute your past for your present and create an unauditable feedback loop.',
      'The open-decision calibration bridge is a descriptive stress, not a posterior: it shrinks each empirical bin rate toward the declared probability, renormalizes state rates, and propagates marginal Wilson bounds. It does not correct clustering between states from the same settled frame; its range is not a simultaneous confidence interval.',
      'A miscalibration finding is descriptive, not a verdict on you as a person. People change, context changes, and small samples mislead. The purpose of the read is to help you update, not to label you.',
      legacyN > 0 ? `${legacyN} legacy record(s) — frames settled before the probability snapshot was frozen — are shown in counts but excluded from the verdict.` : null,
    ].filter(Boolean),
  };
}

/* ------------------------------------------------ calibrated decision bridge */

const LCAL_SCENARIO_MIN_BIN_SAMPLES = 3;
const LCAL_SCENARIO_SHRINKAGE_PRIOR = 10;

function coherentPercentages(values) {
  const total = values.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  if (!(total > 0)) return null;
  const percentages = values.map((value) => round4((Math.max(0, Number(value) || 0) / total) * 100));
  const prefix = percentages.slice(0, -1).reduce((sum, value) => sum + value, 0);
  percentages[percentages.length - 1] = round4(100 - prefix);
  return percentages;
}

/**
 * Translate the workspace's own matured reliability bins into an explicitly
 * labelled decision sensitivity analysis. This is not a Bayesian posterior:
 * it is an empirical, shrinkage-weighted stress distribution whose component
 * probabilities are re-normalised to remain a coherent categorical frame.
 *
 * The 95% Wilson interval for each covered bin is propagated through every
 * lower/upper corner (at most 2^6 = 64 scenarios). These are marginal bands,
 * not a simultaneous confidence interval; state outcomes from one frame are
 * correlated and the binomial intervals do not correct for that clustering.
 * No declaration or frozen prediction is changed.
 */
export function calibrationScenarioForFrame(state = {}, frame = {}, {
  minBinSamples = LCAL_SCENARIO_MIN_BIN_SAMPLES,
  shrinkagePrior = LCAL_SCENARIO_SHRINKAGE_PRIOR,
  report: suppliedReport = null,
} = {}) {
  const raw = evaluateFrame(frame);
  if (!raw.priced || raw.evpi === null) {
    return { status: 'unpriced', detail: 'The declared frame is incomplete or does not sum to 100%; no calibration stress is computed.', rawEvpi: raw.evpi, rawChoiceId: raw.best?.optionId || null };
  }

  const report = suppliedReport || buildCalibrationReport(state);
  const states = Array.isArray(frame.states) ? frame.states : [];
  const mapped = [];
  const uncovered = [];
  for (const row of states) {
    const probability = Number(row?.probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      return { status: 'invalid-probability', detail: 'A state probability is outside 0–100%.', rawEvpi: raw.evpi, rawChoiceId: raw.best?.optionId || null };
    }
    const bin = report.bins[binIndexFor(clampPct(probability))];
    if (!bin || bin.binaryCount < minBinSamples || !Number.isFinite(bin.wilsonLo) || !Number.isFinite(bin.wilsonHi)) {
      uncovered.push({ stateId: row.id, probability, band: bin ? `${bin.lo}–${bin.hi}%` : 'unknown', samples: bin?.binaryCount || 0 });
      continue;
    }
    const n = bin.binaryCount;
    const priorWeight = n / (n + shrinkagePrior);
    const observed = (bin.hits + 0.5) / (n + 1); // Jeffreys beta-binomial posterior mean
    const prior = probability / 100;
    const point = prior + priorWeight * (observed - prior);
    const low = prior + priorWeight * (bin.wilsonLo - prior);
    const high = prior + priorWeight * (bin.wilsonHi - prior);
    mapped.push({
      stateId: row.id,
      rawPct: probability,
      band: `${bin.lo}–${bin.hi}%`,
      samples: n,
      weight: round4(priorWeight),
      point: Math.min(1, Math.max(0, point)),
      low: Math.min(1, Math.max(0, Math.min(low, high))),
      high: Math.min(1, Math.max(0, Math.max(low, high))),
    });
  }
  if (uncovered.length) {
    return {
      status: 'insufficient-band-data',
      detail: `Calibration stress withheld: ${uncovered.map((row) => `${row.band} (n=${row.samples})`).join(', ')} ${uncovered.length === 1 ? 'has' : 'have'} fewer than ${minBinSamples} samples.`,
      rawEvpi: raw.evpi,
      rawChoiceId: raw.best?.optionId || null,
      uncovered,
      coveredBands: mapped.map(({ stateId, band, samples }) => ({ stateId, band, samples })),
    };
  }

  const evaluateAt = (values) => {
    const probabilities = coherentPercentages(values);
    if (!probabilities) return null;
    const candidate = {
      ...frame,
      states: states.map((row, index) => ({ ...row, probability: probabilities[index] })),
    };
    const evaluated = evaluateFrame(candidate);
    return evaluated.priced && evaluated.evpi !== null
      ? { evpi: evaluated.evpi, choiceId: evaluated.best?.optionId || null, probabilities }
      : null;
  };

  const point = evaluateAt(mapped.map((row) => row.point));
  if (!point) {
    return { status: 'invalid-calibration', detail: 'The calibrated distribution could not be made coherent; the declared frame is unchanged.', rawEvpi: raw.evpi, rawChoiceId: raw.best?.optionId || null };
  }

  let minEvpi = Infinity;
  let maxEvpi = -Infinity;
  const choices = new Set();
  const cornerCount = 2 ** mapped.length;
  for (let mask = 0; mask < cornerCount; mask += 1) {
    const scenario = evaluateAt(mapped.map((row, index) => ((mask >> index) & 1) ? row.high : row.low));
    if (!scenario) continue;
    minEvpi = Math.min(minEvpi, scenario.evpi);
    maxEvpi = Math.max(maxEvpi, scenario.evpi);
    if (scenario.choiceId) choices.add(scenario.choiceId);
  }
  if (!Number.isFinite(minEvpi) || !Number.isFinite(maxEvpi)) {
    return { status: 'invalid-calibration', detail: 'The Wilson sensitivity envelope could not be evaluated.', rawEvpi: raw.evpi, rawChoiceId: raw.best?.optionId || null };
  }
  choices.add(point.choiceId);

  // Trace only the three prior, settled forecast records that contributed the
  // most state-pairs to the target's declared probability bands. These typed
  // links let the leader inspect the evidence; no record is copied or renamed.
  const targetBands = new Set(mapped.map((row) => Number.parseInt(row.band, 10)));
  const contributions = new Map();
  for (const sample of report.samples || extractCalibrationSamples(state)) {
    if (sample.legacy) continue;
    const contribution = (sample.allStateP || []).filter((entry) => targetBands.has(Math.floor(clampPct(entry.pct) / 20) * 20)).length;
    if (contribution) contributions.set(sample.frameId, (contributions.get(sample.frameId) || 0) + contribution);
  }
  const evidenceFrameIds = [...contributions.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 3)
    .map(([id]) => id);

  return {
    status: 'ready',
    method: 'Jeffreys beta-binomial mean with n/(n+10) shrinkage; categorical renormalisation; Wilson-bin marginal corner stress',
    rawEvpi: raw.evpi,
    scenarioEvpi: point.evpi,
    evpiLow: round4(minEvpi),
    evpiHigh: round4(maxEvpi),
    rawChoiceId: raw.best?.optionId || null,
    scenarioChoiceId: point.choiceId,
    choiceIds: [...choices],
    choiceChanges: [...choices].some((id) => id !== raw.best?.optionId),
    probabilityShiftPp: round2(mapped.reduce((sum, row, index) => sum + Math.abs((point.probabilities[index] ?? 0) - row.rawPct), 0) / mapped.length),
    coveredBands: mapped.map(({ stateId, band, samples }) => ({ stateId, band, samples })),
    evidenceFrameIds,
    sampleCount: mapped.reduce((sum, row) => sum + row.samples, 0),
    cornersEvaluated: cornerCount,
    caveat: 'Scenario analysis only, not a corrected belief or confidence interval. State-pairs from one settled frame are dependent; marginal Wilson bands are not simultaneous, and normalising state rates is a declared coherence convention.',
  };
}

/* ----------------------------------------------------------------- signals */

export function lcalSignals(state = {}, now = new Date()) {
  const report = buildCalibrationReport(state, now);
  const signals = [];
  const push = (signal) => signals.push({
    domain: 'Calibration',
    severity: 2,
    priority: 40,
    ...signal,
  });

  // LCAL-01 — verdict has flipped to overconfident on sufficient data.
  if (report.verdict === 'overconfident' && report.usableCount >= report.conventions.verdictSamples) {
    push({
      ruleId: 'LCAL-01',
      severity: 3,
      priority: 65,
      title: 'Your probability judgements are running hot',
      detail: `${report.verdictReason} Your multi-class Brier is ${report.murphy.brier} with signed calibration gap ${report.signedGapPp}pp. EVPI ceilings computed from your current declarations are likely upper bounds on optimism, not on the actual information value. Inspect the calibration curve before making a high-stakes call.`,
      evidence: [
        `Settled state-outcomes ${report.usableCount}`,
        `Signed gap ${report.signedGapPp}pp`,
        `Brier ${report.murphy.brier}`,
        `Reliability ${report.murphy.reliability}`,
      ],
      route: '#/voi?panel=calibration',
      action: { label: 'Open your calibration read', route: '#/voi?panel=calibration' },
      entityType: 'voi',
      entityId: null,
    });
  }

  // LCAL-02 — drift detected.
  if (report.drift && report.drift.status === 'drifted') {
    push({
      ruleId: 'LCAL-02',
      severity: 2,
      priority: 46,
      title: 'Your forecasting mix has shifted between cohorts',
      detail: `A population-stability comparison of your earlier ${report.drift.earlierN} samples against the more recent ${report.drift.recentN} returns PSI=${report.drift.psi}. PSI above 0.25 is a material mix shift — your earlier calibration may not describe how you are declaring probabilities now.`,
      evidence: [
        `PSI ${report.drift.psi}`,
        `Earlier cohort through ${report.drift.earlierThrough}`,
        `Recent cohort from ${report.drift.recentFrom}`,
      ],
      route: '#/voi?panel=calibration',
      action: { label: 'Inspect drift', route: '#/voi?panel=calibration' },
      entityType: 'voi',
      entityId: null,
    });
  }

  // LCAL-03 — just crossed the verdict floor for the first time.
  if (report.usableCount === report.conventions.verdictSamples && report.verdict !== 'counts-only') {
    push({
      ruleId: 'LCAL-03',
      severity: 2,
      priority: 42,
      title: 'Your calibration read is now mature',
      detail: `${report.usableCount} settled state-outcomes — the first time there is enough data to render a verdict (${report.verdictLabel}). The curve will tighten as more frames resolve.`,
      evidence: [
        `Settled state-outcomes ${report.usableCount}`,
        `Verdict ${report.verdictLabel}`,
      ],
      route: '#/voi?panel=calibration',
      action: { label: 'See your calibration curve', route: '#/voi?panel=calibration' },
      entityType: 'voi',
      entityId: null,
    });
  }

  // LCAL-04 — underconfidence signal.
  if (report.verdict === 'underconfident') {
    push({
      ruleId: 'LCAL-04',
      severity: 2,
      priority: 44,
      title: 'You are systematically understating your probabilities',
      detail: report.verdictReason,
      evidence: [
        `Signed gap ${report.signedGapPp}pp`,
        `Brier ${report.murphy.brier}`,
      ],
      route: '#/voi?panel=calibration',
      action: { label: 'See where', route: '#/voi?panel=calibration' },
      entityType: 'voi',
      entityId: null,
    });
  }

  return signals;
}

export function lcalAttentionCount(state = {}, now = new Date()) {
  return lcalSignals(state, now).filter((s) => s.severity >= 3).length;
}

/* ----------------------------------------------------------------- brief */

function pctFmt(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * (10 ** dp)) / (10 ** dp)}%`;
}

export function lcalBrief(state = {}, now = new Date()) {
  const r = buildCalibrationReport(state, now);
  const lines = [];
  lines.push('LEADOS — LEADER PROBABILITY CALIBRATION BRIEF');
  lines.push(`Generated ${dayKey(now)} · engine ${r.engineVersion}`);
  lines.push('');
  lines.push(`Settled state-outcomes: ${r.usableCount} (${r.legacyCount} legacy excluded from verdict)`);
  lines.push(`Verdict: ${r.verdictLabel}`);
  lines.push(r.verdictReason);
  lines.push('');
  lines.push('SCORING (binary samples from multi-class frames)');
  lines.push(`  Brier (multi-class mean MSE): ${r.murphy.brier === null ? '—' : r.murphy.brier}`);
  lines.push(`  Murphy decomposition: reliability ${r.murphy.reliability ?? '—'} − resolution ${r.murphy.resolution ?? '—'} + uncertainty ${r.murphy.uncertainty ?? '—'}`);
  lines.push(`  Signed calibration gap (forecast − observed): ${pctFmt(r.signedGapPp)} pp`);
  lines.push(`  Base rate: ${pctFmt((r.murphy.baseRate ?? 0) * 100)}`);
  lines.push('');
  lines.push('RELIABILITY DIAGRAM (5 bins × 20pp)');
  for (const bin of r.bins) {
    const band = `${bin.lo}–${bin.hi}%`;
    if (bin.status === 'scored') {
      lines.push(`  ${band.padEnd(8)} midpoint ${String(bin.midpoint).padStart(3)}% · n=${String(bin.count).padStart(3)} · hit ${pctFmt(bin.hitRate * 100, 1)}% · gap ${bin.gapPp >= 0 ? '+' : ''}${bin.gapPp}pp · 95% Wilson ${pctFmt(bin.wilsonLo * 100)}–${pctFmt(bin.wilsonHi * 100)}%`);
    } else if (bin.status === 'counts-only') {
      lines.push(`  ${band.padEnd(8)} midpoint ${String(bin.midpoint).padStart(3)}% · n=${String(bin.count).padStart(3)} · hit ${pctFmt((bin.hitRate || 0) * 100, 1)}% · too few for interval`);
    } else {
      lines.push(`  ${band.padEnd(8)} midpoint ${String(bin.midpoint).padStart(3)}% · n=0`);
    }
  }
  lines.push('');
  lines.push('COHORT DRIFT');
  if (!r.drift) {
    lines.push(`  not enough samples for a 10/10 split (need ≥20).`);
  } else {
    lines.push(`  PSI ${r.drift.psi ?? '—'} · ${r.drift.status} · earlier n=${r.drift.earlierN} through ${r.drift.earlierThrough} · recent n=${r.drift.recentN} from ${r.drift.recentFrom}`);
  }
  lines.push('');
  lines.push('PER-TOPIC BREAKDOWN');
  if (!r.topics.length) {
    lines.push('  no samples carry a premise tag.');
  } else {
    for (const t of r.topics.slice(0, 8)) {
      lines.push(`  ${t.topic}: n=${t.n} · Brier ${t.brier ?? '—'} · gap ${t.calibrationGapPp === null ? '—' : `${t.calibrationGapPp >= 0 ? '+' : ''}${t.calibrationGapPp}pp`} · ${t.status}`);
    }
  }
  lines.push('');
  lines.push('ADVISORY REMAP (NOT AUTO-APPLIED)');
  for (const a of r.remap) {
    lines.push(`  ${a.loPct}–${a.hiPct}%: ${a.advisory}`);
  }
  lines.push('');
  lines.push('SCENARIOS: OPEN-DECISION EVPI CALIBRATION STRESS (NOT A CORRECTED BELIEF)');
  lines.push('  Each row is a shrinkage-weighted scenario with a marginal Wilson-corner range; insufficient probability-band coverage is withheld.');
  const openFrames = (state.voiDecisions || []).filter((frame) => frame && frame.status === 'open');
  if (!openFrames.length) {
    lines.push('  no open decision frames.');
  } else {
    for (const frame of openFrames.slice(0, 20)) {
      const stress = calibrationScenarioForFrame(state, frame, { report: r });
      const currency = String(frame.currency || 'USD').toUpperCase();
      if (stress.status !== 'ready') {
        lines.push(`  ${frame.label || frame.id}: ${stress.detail}`);
      } else {
        lines.push(`  ${frame.label || frame.id}: raw ${currency} ${stress.rawEvpi} → scenario ${currency} ${stress.scenarioEvpi} · marginal sensitivity ${currency} ${stress.evpiLow}–${stress.evpiHigh} · choice ${stress.choiceChanges ? 'not stable across tested corners' : 'stable across tested corners'} · evidence frames ${stress.evidenceFrameIds.join(', ') || '—'}`);
      }
    }
  }
  lines.push('');
  lines.push('WHAT THIS DOES NOT CLAIM');
  for (const c of r.caveats) lines.push(`  · ${c}`);
  return lines.join('\n');
}
