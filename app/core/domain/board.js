/**
 * app/core/domain/board.js — the Board Room engine (Schema v90, ADR-0084).
 *
 * Pure read model. No storage writes, no clock reads, no DOM. Every figure is
 * derived from a module's own report, so the board line cannot drift from the
 * record it summarises.
 *
 * The engine has four parts, and each is deliberately small:
 *
 *   1. MEASURE. One adapter per declared claim. An adapter either returns a
 *      measurement with an interval, or a refusal with a printed reason. There
 *      is no third outcome — no zero, no default, no interpolation.
 *   2. ADJUDICATE. A claim's declared threshold is tested against the
 *      CONSERVATIVE end of its interval. Point estimates never decide a
 *      verdict: "holding" requires the interval's lower bound to clear a floor,
 *      "failing" requires its upper bound to miss it, and everything between is
 *      "inconclusive" — a word this module will not soften.
 *   3. CROSS-EXAMINE. Declared pairs of modules that must agree. Two different
 *      machines producing the same reading is evidence; disagreeing is the
 *      finding. No composite score is ever computed, because a composite is how
 *      one green number hides two red ones.
 *   4. DECOMPOSE. Every claim that can be attributed to a span is partitioned
 *      over the reporting tree, and the partition is CHECKED to reconcile with
 *      the total. A roll-up that does not add up is reported as broken rather
 *      than drawn.
 *
 * Statistical notes, printed wherever they are used:
 *   - Wilson (1927) score interval for a proportion; no normal approximation
 *     below the declared cell floor.
 *   - The required sample for settling an inconclusive claim inverts that same
 *     interval: n ≈ z²·p(1−p)/d², the smallest n whose half-width is under the
 *     distance from the threshold. It is a planning figure, not a promise.
 */

import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { buildChain, LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import { successionReport } from './succession.js';
import { solvencyReport } from './solvency.js';
import { calibrateAuthority } from './authorityCalibration.js';
import { concordanceRead } from './concordance.js';
import { teamHealth } from './health.js';
import { sealReport } from './sealChain.js';
import { scepticReport } from './sceptic.js';
import {
  BOARD_CLAIMS,
  BOARD_CLAIM_KEYS,
  BOARD_CONVENTION_DEFAULTS,
  BOARD_CROSS_CHECKS,
  BOARD_LIMITS,
  BOARD_RULES,
  BOARD_TAGS,
  BOARD_VERDICTS,
  boardClaim,
  boardFingerprint,
} from './boardRegistry.js';

const Z95 = 1.959963984540054;
const round = (v, d = 1) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10 ** d) / 10 ** d : null);

/* ------------------------------------------------------------- conventions */

export function boardConventions(settings = {}) {
  const d = BOARD_CONVENTION_DEFAULTS;
  const pick = (key, min, max) => {
    const n = Math.round(Number(settings?.[key]));
    return Number.isFinite(n) && n >= min && n <= max ? n : d[key];
  };
  return {
    cellFloor: pick('boardCellFloor', 1, 50),
    evidenceFloor: pick('boardEvidenceFloor', 1, 20),
    materialityPct: pick('boardMaterialityPct', 1, 90),
    recheckDays: pick('boardRecheckDays', 7, 365),
    autoPropagate: settings?.boardAutoPropagate !== false,
    declared: { ...d },
  };
}

/** Wilson score interval for a proportion, in percent. Null below n = 1. */
export function boardWilson(successes, n, z = Z95) {
  if (!Number.isFinite(n) || n <= 0) return { lower: null, upper: null };
  const p = Math.min(1, Math.max(0, successes / n));
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, Math.round((centre - half) * 1000) / 10),
    upper: Math.min(100, Math.round((centre + half) * 1000) / 10),
  };
}

/**
 * How many observations would it take for the interval to exclude the
 * threshold? Inverts the normal-approximation half-width around the CURRENT
 * point estimate. Returns null when the claim sits exactly on its threshold,
 * because no sample size settles a coin that is exactly fair.
 */
export function boardRequiredSample({ valuePct, thresholdPct, z = Z95 }) {
  if (!Number.isFinite(valuePct) || !Number.isFinite(thresholdPct)) return null;
  const p = Math.min(1, Math.max(0, valuePct / 100));
  const d = Math.abs(p - thresholdPct / 100);
  if (d < 0.005) return null;
  const n = Math.ceil((z * z * p * (1 - p)) / (d * d));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1_000_000, n);
}

/* ------------------------------------------------------------ measurement */

const empty = {};

function safe(fn, fallback = null) {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

/** Compute every source report once, defensively, so one broken module cannot
 *  take the whole memo down and cannot silently become a zero either. */
export function boardSources(state, { now = new Date(), settings = null } = {}) {
  const s = settings || state?.settings || {};
  return {
    succession: safe(() => successionReport(state, { now, settings: s }), empty),
    solvency: safe(() => solvencyReport(state, now, s), empty),
    authority: safe(() => calibrateAuthority(state, { now, settings: s }), empty),
    concordance: safe(() => concordanceRead(state, { now, settings: s }), empty),
    health: safe(() => teamHealth(state, now, { withTrend: true }), empty),
    seal: safe(() => sealReport(state, { now, settings: s }), empty),
    sceptic: safe(() => scepticReport(state, now, s), empty),
  };
}

/** Number(v) coerces null to 0. A board figure must never do that. */
function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const refused = (reason, extra = {}) => ({ refused: reason, value: null, lower: null, upper: null, n: 0, ...extra });

function measureBench(state, sources, { claimKey }) {
  const spans = Array.isArray(sources.succession.spans) ? sources.succession.spans : [];
  const measured = spans.filter((span) => span && span.quotable);
  if (!spans.length) return refused('This workspace has no leadership span to measure. A bench claim about an empty tree would be a sentence about nobody.', { spansN: 0 });
  if (!measured.length) {
    return refused(
      sources.succession.certification?.refused
        || `${spans.length} span(s) exist and none could be measured. That is the finding: the bench has never been tested here, which is not the same as being healthy.`,
      { spansN: spans.length },
    );
  }
  const bad = claimKey === 'bench-concentration'
    ? measured.filter((span) => span.verdict === 'concentrated' || span.verdict === 'certified-gap').length
    : measured.filter((span) => span.verdict !== 'covered').length;
  const good = measured.length - bad;
  // bench-coverage counts spans that pass; bench-concentration counts spans
  // that fail, so both are read as a proportion of the measured spans.
  const successes = claimKey === 'bench-concentration' ? bad : good;
  const { lower, upper } = boardWilson(successes, measured.length);
  return {
    value: round((successes / measured.length) * 100, 1),
    lower, upper,
    n: measured.length,
    successes,
    denominatorLabel: `${measured.length} measured span(s) of ${spans.length}`,
    attribution: measured.map((span) => ({ nodeId: span.nodeId, ok: claimKey === 'bench-concentration' ? !(span.verdict === 'concentrated' || span.verdict === 'certified-gap') : span.verdict === 'covered' })),
    sourceLabel: 'Leadership bench certification',
  };
}

function measureSolvency(sources) {
  const counts = sources.solvency.counts || {};
  const open = Number(counts.open) || 0;
  const overdue = Number(counts.overdue) || 0;
  if (!open) return refused('No dated promise is open in this workspace, so there is no reliability rate to report. An empty book is not a perfect one.', { open: 0 });
  const successes = Math.max(0, open - overdue);
  const { lower, upper } = boardWilson(successes, open);
  return {
    value: round((successes / open) * 100, 1),
    lower, upper,
    n: open,
    successes,
    denominatorLabel: `${open} open promise(s), ${overdue} already past its date`,
    sourceLabel: 'Promise solvency book',
    detail: { open, overdue },
  };
}

function measureAuthority(sources) {
  const report = sources.authority;
  const n = Number(report.totalTrials) || 0;
  if (!n) return refused('No authority contract has reached a terminal state, so there is no hold rate. A right nobody has exercised is not evidence that it works.', { n: 0 });
  if (report.overallRefused) {
    return refused(`Only ${n} terminal authority trial(s), below the declared floor of ${report.conv?.floorN ?? 5}. The rate is withheld rather than quoted from a handful.`, { n });
  }
  const successes = Number(report.totalCompleted) || 0;
  const { lower, upper } = boardWilson(successes, n);
  return {
    value: round((successes / n) * 100, 1),
    lower, upper,
    n,
    successes,
    denominatorLabel: `${n} terminal authority trial(s)`,
    sourceLabel: 'Authority calibration ledger',
    attributionByAltitude: Array.isArray(report.altitudeReadings) ? report.altitudeReadings : [],
  };
}

function measureConcordance(sources) {
  const pairs = Array.isArray(sources.concordance.pairs) ? sources.concordance.pairs : [];
  const assessed = pairs.filter((pair) => pair && pair.latestStats && !pair.latestStats.refused && pair.latestStats.kappaPct !== null);
  if (!assessed.length) {
    return refused(
      pairs.length
        ? `${pairs.length} pair(s) on file and none has a two-sided closed round with a quotable agreement figure. The instrument has not been run.`
        : 'No expectation round has been closed here, so no pair has two gauges to compare.',
      { pairsN: pairs.length },
    );
  }
  const clear = assessed.filter((pair) => pair.latestStats.clearsFloor);
  const { lower, upper } = boardWilson(clear.length, assessed.length);
  return {
    value: round((clear.length / assessed.length) * 100, 1),
    lower, upper,
    n: assessed.length,
    successes: clear.length,
    denominatorLabel: `${assessed.length} assessed pair(s) of ${pairs.length} on file`,
    sourceLabel: 'Expectation concordance',
    attribution: assessed.map((pair) => ({ nodeId: pair.nodeId || LEADER_ID, ok: Boolean(pair.latestStats.clearsFloor), key: pair.key })),
  };
}

function measureCulture(state, sources) {
  const health = sources.health;
  if (!Number.isFinite(Number(health.overall))) {
    return refused(health.label || 'No culture dimension is scored yet: the index has nothing behind it.');
  }
  // The index scores an empty workspace at zero, which is a real value for the
  // arithmetic and a lie for a board line. A culture claim needs dated records
  // behind it before it may be quoted at all.
  const dated = [
    ...(Array.isArray(state.oneOnOnes) ? state.oneOnOnes : []),
    ...(Array.isArray(state.feedback) ? state.feedback : []),
    ...(Array.isArray(state.pulses) ? state.pulses : []),
    ...(Array.isArray(state.recognition) ? state.recognition : []),
  ].filter((row) => row && row.date).length;
  if (dated < 3) {
    return refused(`The health index can be computed from ${dated} dated record(s). An index over an empty workspace reads zero, and zero is not a measurement of culture.`, { dated });
  }
  const scored = (health.dimensions || []).filter((d) => typeof d?.score === 'number');
  return {
    value: round(health.overall, 1),
    lower: null,
    upper: null,
    n: dated,
    successes: null,
    pointOnly: true,
    denominatorLabel: `${scored.length} of ${(health.dimensions || []).length} dimension(s) scored on ${dated} dated record(s)`,
    sourceLabel: 'Health & pulse index',
    detail: { grade: health.grade, coverage: health.coverage },
  };
}

function measureSeal(sources) {
  const seal = sources.seal;
  if (!seal || (!seal.enabled && !seal.blocks)) {
    return refused('Sealing is not enabled in this workspace. The record cannot be attested, which is a different statement from being altered — and the memo will not print one as the other.');
  }
  const chainValid = seal.verification?.chainValid === true;
  const contentValid = seal.verification?.contentValid === true;
  const ok = chainValid && contentValid;
  return {
    value: ok ? 100 : 0,
    lower: null,
    upper: null,
    n: Number(seal.blocks) || 0,
    successes: ok ? 1 : 0,
    binary: true,
    denominatorLabel: `${seal.blocks || 0} sealed block(s), mode ${seal.activeMode || 'none'}`,
    sourceLabel: 'Sealed audit chain',
    detail: { chainValid, contentValid, breaks: seal.verification?.breaks?.length || 0, keyed: seal.keyed === true },
  };
}

const MEASURERS = Object.freeze({
  'bench-coverage': (state, sources) => measureBench(state, sources, { claimKey: 'bench-coverage' }),
  'bench-concentration': (state, sources) => measureBench(state, sources, { claimKey: 'bench-concentration' }),
  'promise-reliability': (state, sources) => measureSolvency(sources),
  'authority-hold': (state, sources) => measureAuthority(sources),
  'expectation-alignment': (state, sources) => measureConcordance(sources),
  'culture-signal': (state, sources) => measureCulture(state, sources),
  'record-integrity': (state, sources) => measureSeal(sources),
});

export function boardMeasure(state, claimKey, { sources = null, now = new Date(), settings = null } = {}) {
  const declared = boardClaim(claimKey);
  if (!declared) return refused('No declared claim by that key.');
  const measure = MEASURERS[claimKey];
  if (!measure) return refused('This claim has no measurer registered. A claim that cannot be measured is refused, never defaulted.');
  const src = sources || boardSources(state, { now, settings });
  try {
    return measure(state, src);
  } catch (error) {
    return refused(`The source module failed while producing this figure (${String(error?.message || error).slice(0, 160)}). A failed read is not a zero.`);
  }
}

/* -------------------------------------------------------------- adjudicate */

function floorFor(claim, conventions) {
  if (claim.unit === 'binary') return 1;
  if (claim.unit === 'score') return Math.max(1, Math.min(3, conventions.cellFloor));
  return conventions.cellFloor;
}

/**
 * One claim, one verdict. The tag says where the number came from; the verdict
 * says whether the record supports the sentence.
 */
export function boardEvaluateClaim(declared, memoClaim, measurement, conventions) {
  const threshold = numOrNull(memoClaim?.threshold);
  const row = {
    key: declared.key,
    label: declared.label,
    assertion: declared.assertion,
    question: declared.question,
    module: declared.module,
    source: declared.source,
    unit: declared.unit,
    comparator: declared.comparator,
    class: declared.class,
    cost: declared.cost,
    route: declared.route,
    threshold,
    declaredAt: memoClaim?.declaredAt || null,
    lookedAt: memoClaim?.lookedAt || null,
    revisedAfterLook: memoClaim?.revisedAfterLook === true,
    note: memoClaim?.note || '',
    value: null,
    lower: null,
    upper: null,
    n: Number(measurement?.n) || 0,
    denominatorLabel: measurement?.denominatorLabel || '',
    sourceLabel: measurement?.sourceLabel || declared.module,
    verdict: 'refused',
    tag: 'refused',
    reason: '',
    distancePp: null,
    requiredN: null,
    settleable: null,
    pointOnly: measurement?.pointOnly === true,
    detail: measurement?.detail || null,
    contributions: measurement?.attribution || null,
  };
  if (!BOARD_VERDICTS.includes(row.verdict)) row.verdict = 'refused';

  if (measurement?.refused) {
    row.verdict = 'refused';
    row.tag = 'refused';
    row.reason = measurement.refused;
    return row;
  }
  if (threshold === null) {
    row.verdict = 'refused';
    row.tag = 'refused';
    row.reason = 'No threshold was declared for this claim, so there is nothing to test it against. A claim without a refutation condition is an opinion.';
    return row;
  }
  const nFloor = floorFor(declared, conventions);
  if (row.n < nFloor) {
    row.verdict = 'withheld';
    row.tag = 'withheld';
    row.reason = `Only ${row.n} observation(s) behind this figure against a declared floor of ${nFloor}. The counts are printed; the rate is not.`;
    return row;
  }

  row.value = numOrNull(measurement.value);
  row.lower = numOrNull(measurement.lower);
  row.upper = numOrNull(measurement.upper);

  if (row.value === null) {
    row.verdict = 'refused';
    row.tag = 'refused';
    row.reason = 'The source module returned no usable figure. Nothing is substituted.';
    return row;
  }

  const gte = declared.comparator === 'gte';
  const pointOnly = row.pointOnly || row.lower === null || row.upper === null;
  if (pointOnly) {
    row.verdict = gte ? (row.value >= threshold ? 'holding' : 'failing') : (row.value <= threshold ? 'holding' : 'failing');
    row.reason = 'Point reading: this source produces an index, not a sampled proportion, so there is no interval to lean on. The verdict is exact and the uncertainty is not.';
  } else {
    const holds = gte ? row.lower >= threshold : row.upper <= threshold;
    const fails = gte ? row.upper < threshold : row.lower > threshold;
    row.verdict = holds ? 'holding' : fails ? 'failing' : 'inconclusive';
    row.reason = holds
      ? `The conservative end of the interval (${gte ? row.lower : row.upper}%) clears the ${threshold}% threshold.`
      : fails
        ? `Even the optimistic end of the interval (${gte ? row.upper : row.lower}%) misses the ${threshold}% threshold.`
        : `The interval ${row.lower}–${row.upper}% straddles the ${threshold}% threshold. The record cannot say which side it is on.`;
  }

  row.distancePp = round(Math.abs(row.value - threshold), 1);
  // The materiality of a miss is measured BELOW the line, not by distance from
  // it in the favourable direction.
  const missPp = gte ? threshold - row.value : row.value - threshold;
  row.missPp = round(missPp, 1);
  row.material = row.verdict === 'failing' && missPp >= conventions.materialityPct;
  row.marginMaterial = row.verdict === 'failing' && !row.material;

  if (row.verdict === 'inconclusive' && !pointOnly) {
    const required = boardRequiredSample({ valuePct: row.value, thresholdPct: threshold });
    row.requiredN = required;
    row.settleable = required === null ? false : required <= Math.max(row.n * 25, 400);
    row.reason += required === null
      ? ' The point estimate sits on its own threshold, and no sample size settles a claim that is exactly on the line.'
      : ` About ${required.toLocaleString('en-US')} observation(s) would put the interval on one side; this workspace has ${row.n}.${row.settleable ? '' : ' At the rate this record grows, that is not a next-quarter fix.'}`;
  }
  row.tag = 'recomputed';
  return row;
}

/* ------------------------------------------------------------- cross-checks */

function crossCheckRows(sources, rowsByKey) {
  const out = [];
  const row = (key) => rowsByKey.get(key) || null;
  const push = (check, triggered, left, right, finding) => {
    out.push({
      key: check.key,
      label: check.label,
      statement: check.statement,
      route: check.route,
      leftClaim: check.left,
      rightModule: check.rightModule,
      triggered: Boolean(triggered),
      left: left || null,
      right: right || null,
      finding: triggered ? finding : null,
    });
  };

  if (BOARD_CROSS_CHECKS.some((c) => c.key === 'bench-count-vs-flow')) {
    const check = BOARD_CROSS_CHECKS.find((c) => c.key === 'bench-count-vs-flow');
    const bench = row('bench-coverage');
    const cert = sources.succession?.certification || {};
    const pLower = Number.isFinite(Number(cert.pLower)) ? Number(cert.pLower) : null;
    const triggered = Boolean(bench && bench.verdict === 'holding' && pLower !== null && pLower >= 25);
    push(check, triggered, bench ? { label: bench.label, value: bench.value, unit: '%', extra: `interval ${bench.lower}–${bench.upper}%` } : null,
      { label: 'Joint gap probability (lower bound)', value: pLower, unit: '%', extra: cert.method ? 'assumption-free union bound' : null },
      `Coverage reads ${bench?.value}% and the flow test says at least one untested gap is ${pLower}% likely before the review date. A count can pass a flow that does not.`);
  }

  if (BOARD_CROSS_CHECKS.some((c) => c.key === 'promise-rate-vs-book')) {
    const check = BOARD_CROSS_CHECKS.find((c) => c.key === 'promise-rate-vs-book');
    const promise = row('promise-reliability');
    const overdue = Number(sources.solvency?.counts?.overdue) || 0;
    const open = Number(sources.solvency?.counts?.open) || 0;
    const triggered = Boolean(promise && promise.verdict === 'holding' && overdue > 0);
    push(check, triggered, promise ? { label: promise.label, value: promise.value, unit: '%', extra: `${promise.n} open promise(s)` } : null,
      { label: 'Overdue promises in the book', value: overdue, unit: '', extra: `of ${open} open` },
      `${overdue} promise(s) are already past their own date while the reliability rate reads ${promise?.value}%. The rate is a summary; the board question is the list.`);
  }

  if (BOARD_CROSS_CHECKS.some((c) => c.key === 'integrity-vs-examination')) {
    const check = BOARD_CROSS_CHECKS.find((c) => c.key === 'integrity-vs-examination');
    const integrity = row('record-integrity');
    const counts = sources.sceptic?.counts || {};
    const claimCount = Number(counts.claims) || 0;
    const examined = Number(counts.examined) || 0;
    const triggered = Boolean(integrity && integrity.verdict === 'holding' && (claimCount === 0 || examined === 0));
    push(check, triggered, integrity ? { label: integrity.label, value: integrity.value, unit: '', extra: `${integrity.n} sealed block(s)` } : null,
      { label: 'Claims cross-examined', value: examined, unit: '', extra: `of ${claimCount} extracted` },
      claimCount === 0
        ? 'The chain verifies and the workspace holds no examinable claim: the seal attests the writing, not the content.'
        : `The chain verifies and ${examined} of ${claimCount} claims have ever been examined. An unaltered record is not a true one.`);
  }
  return out;
}

/* --------------------------------------------------------------- decompose */

const contributionOk = (row) => (row.ok ? 1 : 0);

/**
 * Partition a claim's denominator over the reporting tree (or over altitude
 * when the source attributes by rank, or state that it does not partition).
 * The reconciliation check is the point: a roll-up whose parts do not sum to
 * the whole is reported as broken, never drawn as if it were fine.
 */
export function boardPartition(state, claimRow, { now = new Date(), settings = null, sources = null, labelNames = true } = {}) {
  const declared = boardClaim(claimRow.key);
  if (!declared) return null;
  if (declared.partition === 'none') {
    return {
      dimension: 'none',
      rows: [],
      totals: { n: claimRow.n, successes: claimRow.successes ?? null },
      reconciles: true,
      reason: `${declared.label} is a workspace-level reading. It is not decomposed into spans, because doing so would print a figure about a team that the instrument never measured separately.`,
    };
  }
  if (!claimRow.contributions || !claimRow.contributions.length) {
    return {
      dimension: declared.partition,
      rows: [],
      totals: { n: claimRow.n, successes: null },
      reconciles: false,
      reason: 'The source module did not attribute this figure to spans, so no roll-up is drawn. A decomposition this app cannot check is not shown.',
    };
  }

  const chain = safe(() => buildChain(state, { now, settings }), null);
  const groups = new Map();
  for (const contribution of claimRow.contributions) {
    let key = contribution.nodeId || LEADER_ID;
    let label = '';
    let altitudeKey = null;
    if (declared.partition === 'altitude') {
      const node = chain?.nodes?.get(key);
      altitudeKey = node?.altitude || 'chief';
      key = altitudeKey;
      label = altitudeByKey(altitudeKey)?.label || 'Unassigned altitude';
    } else {
      const node = chain?.nodes?.get(key);
      altitudeKey = node?.altitude || null;
      label = labelNames ? (node?.name || 'Workspace leader') : `${altitudeByKey(altitudeKey)?.shortLabel || 'Span'} (span name withheld at this altitude)`;
    }
    if (!groups.has(key)) groups.set(key, { key, label, altitudeKey, n: 0, successes: 0 });
    const group = groups.get(key);
    group.n += 1;
    group.successes += contributionOk(contribution);
  }

  const rows = [...groups.values()]
    .map((group) => ({
      ...group,
      value: group.n ? round((group.successes / group.n) * 100, 1) : null,
      interval: boardWilson(group.successes, group.n),
    }))
    .sort((a, b) => (b.n - a.n) || String(a.label).localeCompare(String(b.label)));

  const totalN = rows.reduce((sum, r) => sum + r.n, 0);
  const totalOk = rows.reduce((sum, r) => sum + r.successes, 0);
  const reconciles = totalN === claimRow.n;
  return {
    dimension: declared.partition,
    rows,
    totals: { n: totalN, successes: totalOk, value: totalN ? round((totalOk / totalN) * 100, 1) : null },
    reconciles,
    reason: reconciles
      ? `Every observation is counted exactly once: the ${rows.length} row(s) sum to ${totalN}, the claim's own denominator.`
      : `BROKEN ROLL-UP: the rows sum to ${totalN} observations but the claim's denominator is ${claimRow.n}. The partition is printed with the defect rather than hidden by it.`,
  };
}

/* ------------------------------------------------------- the unasked question */

/**
 * The one question worth asking next. Chosen by the smallest gap between a
 * claim's point estimate and its threshold, scaled by how wide its interval
 * still is — i.e. the claim where a small amount of evidence would most change
 * what the pack says. A refused claim with the most records behind it is the
 * runner-up, because "we cannot produce this" is often the real answer.
 */
export function boardUnaskedQuestion(rows, conventions) {
  const ranked = rows
    .filter((r) => r.verdict === 'inconclusive' && Number.isFinite(r.value))
    .map((r) => {
      const halfWidth = Number.isFinite(r.lower) && Number.isFinite(r.upper) ? Math.max(0.1, (r.upper - r.lower) / 2) : null;
      const distance = Number.isFinite(r.distancePp) ? r.distancePp : null;
      const score = distance === null || halfWidth === null ? Number.POSITIVE_INFINITY : distance / halfWidth;
      return { row: r, score };
    })
    .sort((a, b) => a.score - b.score);

  if (ranked.length) {
    const { row } = ranked[0];
    return {
      kind: 'settle',
      claimKey: row.key,
      title: `What would settle “${row.label}”?`,
      question: row.question,
      why: `${row.reason}`,
      action: row.requiredN
        ? `Collect about ${row.requiredN.toLocaleString('en-US')} observation(s) of this claim (${row.n} today). Until then the memo marks it inconclusive — it does not get a direction.`
        : 'The point estimate sits on the threshold. Either move the threshold with a written reason (which will be marked post-hoc) or replace the instrument; more of the same record will not settle it.',
      route: row.route,
    };
  }

  const refusedRows = rows.filter((r) => r.verdict === 'refused').sort((a, b) => (b.n - a.n));
  if (refusedRows.length) {
    const row = refusedRows[0];
    return {
      kind: 'produce',
      claimKey: row.key,
      title: `Which number can this organisation not produce?`,
      question: row.question,
      why: row.reason,
      action: `Open ${row.module} and create the record this claim rests on, or remove the claim from the pack. An unproducible figure never becomes a small one.`,
      route: row.route,
    };
  }

  const failing = rows.filter((r) => r.verdict === 'failing').sort((a, b) => (Math.abs(b.missPp || 0) - Math.abs(a.missPp || 0)));
  if (failing.length) {
    const row = failing[0];
    return {
      kind: 'act',
      claimKey: row.key,
      title: `Which sentence would you have to retract first?`,
      question: row.question,
      why: `${row.label} misses its declared threshold by ${Math.abs(row.missPp || 0).toFixed(1)} point(s): ${row.reason}`,
      action: `Take the decision the record already opened, or change the claim in the memo — with the post-hoc mark on it.`,
      route: row.route,
    };
  }

  return {
    kind: 'none',
    claimKey: null,
    title: 'Every declared claim is inside its own threshold on this record.',
    question: 'What would make you wrong next quarter?',
    why: 'A memo where nothing fails is not proof of health; it is proof that the thresholds were chosen by the same people being measured.',
    action: `Re-check in ${conventions.recheckDays} days, and declare at least one claim you expect to fail.`,
    route: '#/board?panel=claims',
  };
}

/* ------------------------------------------------------------------- read */

function attestationFor(seal) {
  if (!seal || (!seal.enabled && !seal.blocks)) {
    return { available: false, verified: false, mode: 'none', blocks: 0, head: null, note: 'Sealing is not enabled; the memo carries no cryptographic attestation.' };
  }
  const verified = seal.verification?.chainValid === true && seal.verification?.contentValid === true;
  return {
    available: true,
    verified,
    mode: seal.activeMode || 'none',
    keyed: seal.keyed === true,
    blocks: Number(seal.blocks) || 0,
    head: seal.chainHead || null,
    note: verified
      ? `The chain verifies from genesis (${seal.blocks} block(s), ${seal.activeMode} mode). It attests non-alteration since each seal was written — not the truth of any claim.`
      : `The chain does NOT verify (${seal.verification?.breaks?.length || 0} break(s)). Every recomputed figure in this memo is marked attested, not verified.`,
  };
}

function sealTagFor(seal) {
  if (!seal || (!seal.enabled && !seal.blocks)) return 'recomputed';
  const verified = seal.verification?.chainValid === true && seal.verification?.contentValid === true;
  return verified ? 'recomputed' : 'attested';
}

/**
 * Evaluate one memo against the record as it stands now. The memo stores
 * declarations; this function is where they meet reality.
 */
export function boardEvaluateMemo(state, memo, { now = new Date(), settings = null, sources = null, labelNames = true } = {}) {
  const conv = boardConventions(settings || state?.settings || {});
  const src = sources || boardSources(state, { now, settings });
  const declaredByKey = new Map((memo.claims || []).map((c) => [c.key, c]));
  const rows = [];
  for (const declared of BOARD_CLAIMS) {
    const memoClaim = declaredByKey.get(declared.key);
    if (!memoClaim) continue;
    const measurement = boardMeasure(state, declared.key, { sources: src, now, settings });
    const row = boardEvaluateClaim(declared, memoClaim, measurement, conv);
    row.tag = row.tag === 'recomputed' ? sealTagFor(src.seal) : row.tag;
    row.partition = boardPartition(state, { ...row, successes: measurement?.successes }, { now, settings, sources: src, labelNames });
    rows.push(row);
  }
  const rowsByKey = new Map(rows.map((r) => [r.key, r]));
  const discrepancies = crossCheckRows(src, rowsByKey);
  const counts = {
    declared: rows.length,
    holding: rows.filter((r) => r.verdict === 'holding').length,
    failing: rows.filter((r) => r.verdict === 'failing').length,
    inconclusive: rows.filter((r) => r.verdict === 'inconclusive').length,
    withheld: rows.filter((r) => r.verdict === 'withheld').length,
    refused: rows.filter((r) => r.verdict === 'refused').length,
    materialFailing: rows.filter((r) => r.material).length,
    postHoc: rows.filter((r) => r.revisedAfterLook).length,
    discrepancies: discrepancies.filter((d) => d.triggered).length,
    evaluated: rows.filter((r) => ['holding', 'failing', 'inconclusive'].includes(r.verdict)).length,
  };
  const fingerprint = boardFingerprint(rows.map((r) => `${r.key}:${r.threshold}:${r.verdict}:${r.value}:${r.lower}:${r.upper}:${r.n}`).join('|'));
  const evaluable = counts.evaluated >= conv.evidenceFloor;
  return {
    memo,
    rows,
    discrepancies,
    counts,
    conventions: conv,
    unasked: boardUnaskedQuestion(rows, conv),
    attestation: attestationFor(src.seal),
    fingerprint,
    evaluable,
    committable: evaluable && memo.status === 'draft',
    commitRefusal: evaluable ? null : `${counts.evaluated} claim(s) could be evaluated against a declared floor of ${conv.evidenceFloor}. A memo committed on fewer is a press release with a timestamp.`,
    stale: memo.committedAt ? (daysBetween(String(memo.committedAt).slice(0, 10), dayKey(now)) ?? 0) >= conv.recheckDays : false,
    sources: src,
  };
}

function snapshotFor(evaluation, now) {
  return {
    takenAt: now.toISOString(),
    fingerprint: evaluation.fingerprint,
    claims: evaluation.rows.map((row) => ({
      key: row.key,
      verdict: row.verdict,
      value: row.value,
      lower: row.lower,
      upper: row.upper,
      n: row.n,
      threshold: row.threshold,
      tag: row.tag,
    })),
  };
}

/**
 * The read model. One evaluation of the selected memo, plus the cheap ledger
 * facts every panel needs. `seatId` scopes span NAMES at executive rank — the
 * figures are enterprise-level and carry no person detail either way.
 */
export function boardRead(state = {}, { now = new Date(), settings = null, seatId = null, memoId = null } = {}) {
  const effective = settings || state.settings || {};
  const conv = boardConventions(effective);
  const memos = Array.isArray(state.boardMemos) ? state.boardMemos : [];
  let seat = null;
  try {
    const built = buildSeats(state, { now, settings: effective });
    seat = seatId ? (built.byId.get(seatId) || null) : activeSeat(built);
  } catch {
    seat = null;
  }
  const labelNames = !seat || seat.fullAccess || (seat.rank || 5) >= 5;
  const selected = (memoId ? memos.find((m) => m.id === memoId) : null)
    || memos.find((m) => m.status === 'frozen')
    || memos.find((m) => m.status === 'committed')
    || memos.find((m) => m.status === 'draft')
    || null;
  const evaluation = selected ? boardEvaluateMemo(state, selected, { now, settings: effective, labelNames }) : null;
  const ledger = {
    total: memos.length,
    draft: memos.filter((m) => m.status === 'draft').length,
    committed: memos.filter((m) => m.status === 'committed').length,
    frozen: memos.filter((m) => m.status === 'frozen').length,
    superseded: memos.filter((m) => m.status === 'superseded').length,
  };
  return {
    now,
    conventions: conv,
    memos,
    ledger,
    memo: selected,
    evaluation,
    seat: seat ? { id: seat.id, label: seat.label, rank: seat.rank, fullAccess: seat.fullAccess } : null,
    labelNames,
    claimCatalogue: BOARD_CLAIMS,
    crossChecks: BOARD_CROSS_CHECKS,
    canCommit: !seat || seat.fullAccess || (seat.rank || 5) >= 5,
  };
}

/** Freeze the live evaluation into a memo record (used by the commit action). */
export function boardSnapshot(evaluation, memo, now = new Date()) {
  return {
    ...memo,
    status: 'committed',
    committedAt: now.toISOString(),
    snapshot: snapshotFor(evaluation, now),
    updatedAt: now.toISOString(),
  };
}

/* ------------------------------------------------------------------- text */

const VERDICT_LABEL = Object.freeze({
  holding: 'HOLDS',
  failing: 'FAILS',
  inconclusive: 'INCONCLUSIVE',
  withheld: 'WITHHELD',
  refused: 'REFUSED',
});

const showPct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v}%`);

/**
 * The disclosure memorandum as text. Deterministic: the same record produces the
 * same document. Every figure carries its tag, every refusal prints its reason,
 * and the unverified marks are counted at the top so a reader cannot miss them.
 */
export function boardMemoText(state = {}, { now = new Date(), settings = null, memoId = null } = {}) {
  const read = boardRead(state, { now, settings, memoId });
  const evaluation = read.evaluation;
  if (!evaluation) {
    return [
      'BOARD DISCLOSURE MEMORANDUM',
      '',
      'No memo is open. Nothing is disclosed.',
      'A board line is written here only from a memo whose claims were declared before they were measured.',
    ].join('\n');
  }
  const { memo, rows, counts, attestation, unasked } = evaluation;
  const lines = [];
  lines.push('BOARD DISCLOSURE MEMORANDUM');
  lines.push(`Cycle: ${memo.cycle || 'unlabelled'} · Revision ${memo.revision} · Status ${memo.status.toUpperCase()}`);
  lines.push(`Prepared: ${dayKey(now)} · Claims declared before the first look: ${counts.declared - counts.postHoc} of ${counts.declared}${counts.postHoc ? ` · REVISED AFTER LOOKING: ${counts.postHoc}` : ''}`);
  lines.push(`Verdicts: ${counts.holding} holds · ${counts.failing} fails · ${counts.inconclusive} inconclusive · ${counts.withheld} withheld · ${counts.refused} refused`);
  lines.push(`Unverified figures: ${counts.withheld + counts.refused}${counts.inconclusive ? ` · Unsettled figures: ${counts.inconclusive}` : ''} · Material failures: ${counts.materialFailing}`);
  lines.push('');
  lines.push('WHAT WE WOULD TELL THE BOARD');
  for (const row of rows) {
    const figure = row.unit === 'binary'
      ? (row.value === null ? 'no reading' : row.value >= 100 ? 'verified' : 'NOT VERIFIED')
      : row.value === null
        ? (row.n ? `${row.n} observation(s), rate withheld` : 'no reading')
        : `${showPct(row.value)}${row.lower !== null && row.upper !== null ? ` (interval ${showPct(row.lower)}–${showPct(row.upper)})` : ' (no interval)'} against a ${showPct(row.threshold)} ${row.comparator === 'gte' ? 'floor' : 'ceiling'}`;
    lines.push(`- [${VERDICT_LABEL[row.verdict]}] ${row.label}: ${row.assertion}`);
    lines.push(`    Figure: ${figure}. Tag: ${row.tag}${row.revisedAfterLook ? ' · THRESHOLD REVISED AFTER LOOKING' : ''}.`);
    if (row.reason) lines.push(`    Reason: ${row.reason}`);
    if (row.verdict === 'refused') lines.push('    Marked UNVERIFIED in this pack.');
  }
  if (counts.discrepancies) {
    lines.push('');
    lines.push('WHERE OUR OWN MODULES DISAGREE');
    for (const check of evaluation.discrepancies.filter((c) => c.triggered)) {
      lines.push(`- ${check.label}: ${check.finding}`);
    }
  }
  lines.push('');
  lines.push('THE QUESTION WE ARE NOT ASKING');
  lines.push(`- ${unasked.title} ${unasked.why}`);
  lines.push(`  Next step: ${unasked.action}`);
  lines.push('');
  lines.push('ATTESTATION');
  lines.push(`- ${attestation.note}`);
  lines.push(`- Memo fingerprint ${evaluation.fingerprint}. A re-evaluation against a changed record produces a different fingerprint; that difference is the audit trail.`);
  lines.push('');
  lines.push('WHAT THIS DOCUMENT IS NOT');
  lines.push('- It is not a summary of people. No person, 1:1, coaching note or individual rating is included by construction.');
  lines.push('- It is not an average. No composite score exists here: a composite is how one green number hides two red ones.');
  lines.push('- It is not a forecast. Each verdict describes the record as it stands today, with its uncertainty printed.');
  return lines.join('\n');
}

/* -------------------------------------------------------------------- csv */

/**
 * Aggregate-only export. One row per claim plus a workspace row. No memo id, no
 * operator, no note, no span name. A refused figure is BLANK, never zero.
 */
export function boardCsvRows(state = {}, { now = new Date(), settings = null, memoId = null } = {}) {
  const read = boardRead(state, { now, settings, memoId });
  const ledger = read.ledger;
  const rows = [{
    scope: 'workspace',
    claim: '',
    verdict: '',
    value_pct: null,
    interval_lo_pct: null,
    interval_hi_pct: null,
    threshold_pct: null,
    comparator: '',
    observations: null,
    material: '',
    post_hoc: '',
    tag: '',
    memos_total: ledger.total,
    memos_draft: ledger.draft,
    memos_committed: ledger.committed,
    memos_frozen: ledger.frozen,
    attestation: read.evaluation?.attestation?.verified ? 'verified' : read.evaluation?.attestation?.available ? 'not-verified' : 'none',
    fingerprint: read.evaluation?.fingerprint || '',
  }];
  if (!read.evaluation) return rows;
  for (const row of read.evaluation.rows) {
    rows.push({
      scope: 'claim',
      claim: row.key,
      verdict: row.verdict,
      value_pct: Number.isFinite(row.value) ? row.value : null,
      interval_lo_pct: Number.isFinite(row.lower) ? row.lower : null,
      interval_hi_pct: Number.isFinite(row.upper) ? row.upper : null,
      threshold_pct: Number.isFinite(row.threshold) ? row.threshold : null,
      comparator: row.comparator,
      observations: row.n,
      material: row.material ? 'yes' : 'no',
      post_hoc: row.revisedAfterLook ? 'yes' : 'no',
      tag: row.tag,
      memos_total: ledger.total,
      memos_draft: ledger.draft,
      memos_committed: ledger.committed,
      memos_frozen: ledger.frozen,
      attestation: read.evaluation.attestation.verified ? 'verified' : read.evaluation.attestation.available ? 'not-verified' : 'none',
      fingerprint: read.evaluation.fingerprint,
    });
  }
  return rows;
}

/* --------------------------------------------------------------- attention */

const ACTIVE = Object.freeze(['draft', 'committed', 'frozen']);

/**
 * The nav badge. Cheap on purpose: it reads stored snapshots and statuses only
 * — never a module report — because the badge is computed on every render.
 */
export function boardAttentionCount(state = {}, now = new Date(), settings = null) {
  const conv = boardConventions(settings || state?.settings || {});
  const today = dayKey(now);
  let count = 0;
  for (const memo of Array.isArray(state.boardMemos) ? state.boardMemos : []) {
    if (!memo || !ACTIVE.includes(memo.status)) continue;
    if (memo.status === 'draft') { count += 1; continue; }
    if (memo.status === 'committed') {
      const age = daysBetween(String(memo.committedAt || '').slice(0, 10), today);
      if (age === null || age >= conv.recheckDays) count += 1;
      const failing = (memo.snapshot?.claims || []).filter((c) => c.verdict === 'failing').length;
      if (failing) count += 1;
    }
  }
  return count;
}

/** One-line brief for Today/Signals; identity-free and cheap. */
export function boardBriefText(state = {}, { now = new Date(), settings = null, memoId = null } = {}) {
  const read = boardRead(state, { now, settings, memoId });
  if (!read.evaluation) return 'Board Room: no memo open. Nothing is disclosed and nothing is claimed.';
  const { counts, attestation, memo } = read.evaluation;
  return [
    `Board memo ${memo.revision} (${memo.status}): ${counts.holding} holding, ${counts.failing} failing, ${counts.inconclusive} inconclusive, ${counts.withheld + counts.refused} unverified.`,
    counts.postHoc ? `${counts.postHoc} threshold(s) were revised after the first look and are marked post-hoc.` : 'Every threshold was declared before the first look.',
    attestation.note,
  ].join(' ');
}

/* --------------------------------------------------------------- utilities */

export function boardMemoKeys() {
  return BOARD_CLAIM_KEYS.slice();
}

export function boardRuleTagsFor(memo, week = null) {
  const stamp = week || weekKey(new Date());
  return {
    obligation: (claimKey) => `${BOARD_RULES.OBLIGATION}:${memo?.id || 'memo'}:${memo?.revision || 1}:${claimKey}`,
    rollup: () => `${BOARD_RULES.ROLLUP}:${memo?.id || 'memo'}:${memo?.revision || 1}`,
    advisory: () => `${BOARD_RULES.ADVISORY}:${stamp}`,
  };
}

export { BOARD_TAGS, BOARD_LIMITS, boardFingerprint, boardClaim };
