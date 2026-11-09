/**
 * app/core/domain/jurisdictionDrift.js — ADR-0115, the Cross-week Jurisdiction
 * Drift reader (`#/jurisdiction?panel=drift`).
 *
 * THE DUTY THIS SERVES
 * --------------------
 * A VP forecasting quarterly coordination risk and a chief reviewing
 * cross-division strategic exposure do not need another snapshot. They need to
 * know whether the SHARE of objectives that cross a reporting branch, and the
 * SIZE of the minimal coalition needed to hold them, are moving outside their
 * own history — and whether the pooled rate they were about to quote is hiding
 * a composition change. RULE-JUR-04 has frozen one identity-free span reading
 * per (span, ISO week) on the shared spine since ADR-0109; nothing compared the
 * weeks. This module is that comparison, and nothing else: it writes no reading,
 * invents no history and never re-prices a cluster.
 *
 * STATISTICS, IMPLEMENTED RATHER THAN NAME-DROPPED
 * ------------------------------------------------
 *  - Split-conformal one-sided band (Vovk et al. 2005; Angelopoulos & Bates
 *    2021): calibration residuals are the ABSOLUTE week-over-week changes of
 *    all strictly-prior weeks; k = ceil((n+1)·coverage); the achieved marginal
 *    finite-sample coverage k/(n+1) is printed beside the nominal one. When
 *    k > n the band is REFUSED, never extended to +∞ as a number. Exchange-
 *    ability is DECLARED, not proven; a band crossing is an anomaly, not a
 *    causal claim.
 *  - Yule (1903) / Simpson aggregation bias: the pooled share Σcross/Σobj and
 *    the unweighted MEAN OF UNIT RATES are printed side by side with their gap.
 *    A reorg that changes the number of spans moves the mean without moving the
 *    pooled rate; quoting only one of them is a real way to mislead a board.
 *  - Wilson-free small-cell honesty: RULE-JUR-04's `suppressed` flag stays a
 *    counted refusal, never a zero. An unsampled ISO week is a GAP, not a zero
 *    and never interpolated.
 *  - Jaques' time-span of discretion: the altitude is applied by SCOPE (the
 *    seat's own reporting subtree), by the printed question and by the look-back
 *    window — not by five separate dashboards.
 *
 * PURITY: no DOM, no storage, no network, no clock globals. `now` is injected.
 * Every special function is exported so a test can check it by hand.
 */

import { LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { jurConventions } from './jurisdiction.js';
import { JUR_REFUSALS } from './jurisdictionRegistry.js';
import {
  JUR_DRIFT_ALTITUDE_QUESTIONS, JUR_DRIFT_CSV_COLUMNS,
  JUR_DRIFT_ENGINE_VERSION, JUR_DRIFT_LIMITS,
} from './jurisdictionDriftRegistry.js';

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const WEEK_MS = 7 * 86400000;
const weekPattern = /^\d{4}-\d{2}-\d{2}$/;

/** Declared, clamped and printed by the EXISTING jurisdiction conventions. */
export function jurDriftConventions(settings = {}) {
  const c = jurConventions(settings);
  return Object.freeze({
    minWeeks: c.jurDriftMinWeeks,
    maxWeeks: Math.max(c.jurDriftMinWeeks, Math.min(c.jurDriftMaxWeeks, JUR_DRIFT_LIMITS.weeksCap)),
    coveragePct: c.jurDriftCoveragePct,
    coverage: round2(c.jurDriftCoveragePct / 100),
  });
}

/** Median of a numeric list; null when the list has no publishable member. */
export function medianOf(values) {
  const xs = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * One-sided split-conformal band on the newest week-over-week change.
 * `values` are chronological weekly LEVELS; a null level is a refusal, never a
 * zero. Returns a plain, hand-checkable object with the achieved coverage.
 */
export function conformalDriftBand(values, { coverage = 0.66, minWeeks = 4 } = {}) {
  const series = Array.isArray(values) ? values : [];
  const n = series.length;
  const base = {
    status: 'refused', n, m: 0, k: null, coverage: round2(coverage), coverageBound: null,
    bound: null, currentDelta: null, currentAbs: null, outside: false, p: null,
    minWeeks, reason: null,
    method: 'One-sided split conformal (Vovk et al., 2005); calibration residuals are strictly-prior |Δweek|, k = ceil((n+1)·coverage), marginal finite-sample coverage k/(n+1) under DECLARED exchangeability. Not a conditional guarantee and not a causal claim.',
  };
  if (n < minWeeks) return { ...base, reason: 'drift-thin-series' };
  if (series.some((v) => !Number.isFinite(v))) return { ...base, reason: 'drift-incomplete-series' };
  const deltas = [];
  for (let i = 1; i < n; i += 1) deltas.push(round2(series[i] - series[i - 1]));
  const calibration = deltas.slice(0, -1).map((d) => Math.abs(d)).sort((a, b) => a - b);
  const m = calibration.length;
  const k = Math.ceil((m + 1) * coverage);
  const currentDelta = deltas[deltas.length - 1];
  const currentAbs = Math.abs(currentDelta);
  const partial = {
    ...base, m, k, currentDelta, currentAbs,
    coverageBound: round2(k / (m + 1)),
  };
  if (m < 2 || k > m) return { ...partial, reason: 'drift-thin-calibration' };
  const bound = round2(calibration[k - 1]);
  const outside = currentAbs > bound + 1e-9;
  const p = round2((1 + calibration.filter((r) => r + 1e-9 >= currentAbs).length) / (m + 1));
  return {
    ...partial, status: 'published', bound, outside, p, reason: null,
  };
}

const validReading = (r) => Boolean(r && typeof r === 'object'
  && weekPattern.test(String(r.week || ''))
  && Number.isInteger(r.crossBranch) && r.crossBranch >= 0);

/**
 * One dated row per frozen ISO week in the scope. Every row is an AGGREGATE:
 * no span id, objective key, person, title or note is copied into it, so an
 * upward reading is identity-free by construction.
 */
export function jurDriftWeeklySeries(state, { scopeNodeIds = null } = {}) {
  const all = Array.isArray(state?.jurReadings) ? state.jurReadings : [];
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds
    : (Array.isArray(scopeNodeIds) ? new Set(scopeNodeIds) : null);
  const rows = all.filter((r) => validReading(r) && (!scope || scope.has(r.nodeId)));
  const byWeek = new Map();
  let invalidN = 0;
  for (const r of all) {
    if (!validReading(r)) { invalidN += 1; continue; }
    if (scope && !scope.has(r.nodeId)) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, []);
    byWeek.get(r.week).push(r);
  }
  const weeks = [...byWeek.keys()].sort();
  const out = [];
  let previous = null;
  for (const week of weeks) {
    const readings = byWeek.get(week);
    const units = readings.filter((r) => Number.isInteger(r.objectives) && r.objectives > 0
      && r.crossBranch <= r.objectives);
    const objectivesN = units.reduce((sum, r) => sum + r.objectives, 0);
    const crossBranchN = units.reduce((sum, r) => sum + r.crossBranch, 0);
    const pooledPct = objectivesN > 0 ? round1((100 * crossBranchN) / objectivesN) : null;
    const unitRates = units.map((r) => (100 * r.crossBranch) / r.objectives);
    const meanUnitPct = unitRates.length ? round1(unitRates.reduce((a, b) => a + b, 0) / unitRates.length) : null;
    const coalitionValues = units.map((r) => r.medianCoalitionSize).filter((v) => Number.isFinite(v) && v > 0);
    const medianCoalition = coalitionValues.length ? round1(medianOf(coalitionValues)) : null;
    const suppressedN = readings.filter((r) => r.suppressed === 1).length;
    const reason = pooledPct === null
      ? (readings.length && !units.length ? 'drift-no-denominator' : 'drift-suppressed')
      : null;
    out.push({
      week,
      spansN: readings.length,
      eligibleN: units.length,
      suppressedN,
      objectivesN,
      crossBranchN,
      pooledPct,
      meanUnitPct,
      compositionGapPct: pooledPct !== null && meanUnitPct !== null ? round1(pooledPct - meanUnitPct) : null,
      medianCoalition,
      coalitionReason: medianCoalition === null ? 'drift-no-coalition' : null,
      shareDelta: previous && pooledPct !== null && Number.isFinite(previous.pooledPct) ? round1(pooledPct - previous.pooledPct) : null,
      coalitionDelta: previous && medianCoalition !== null && Number.isFinite(previous.medianCoalition) ? round1(medianCoalition - previous.medianCoalition) : null,
      reason,
      reasonText: reason ? JUR_REFUSALS[reason] : null,
    });
    previous = out[out.length - 1];
  }
  return { weeks: out, invalidN };
}

/** Number of unsampled ISO weeks inside the observed window (gaps, never zeros). */
export function countedWeekGaps(weeks) {
  let gaps = 0;
  for (let i = 1; i < weeks.length; i += 1) {
    const delta = (Date.parse(`${weeks[i].week}T00:00:00Z`) - Date.parse(`${weeks[i - 1].week}T00:00:00Z`)) / WEEK_MS;
    if (Number.isFinite(delta) && delta > 1) gaps += Math.floor(delta - 1);
  }
  return gaps;
}

/**
 * The full report. `scopeNodeIds` null means the whole workspace (the operator
 * view / enterprise chief); a Set means one seat's reporting subtree.
 */
export function buildJurisdictionDrift(state, { now = new Date(), settings = null, scopeNodeIds = null, conventions = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const conv = conventions || jurDriftConventions(settings || state?.settings || {});
  const { weeks: allWeeks, invalidN } = jurDriftWeeklySeries(state, { scopeNodeIds });
  const window = allWeeks.slice(-conv.maxWeeks);
  const seriesReason = !allWeeks.length ? 'drift-no-readings'
    : window.length < conv.minWeeks ? 'drift-thin-series' : null;
  const refused = (reason) => ({
    status: 'refused', n: window.length, m: 0, k: null, coverage: conv.coverage,
    coverageBound: null, bound: null, currentDelta: null, currentAbs: null,
    outside: false, p: null, minWeeks: conv.minWeeks, reason, method: null,
  });
  const shareBand = seriesReason ? refused(seriesReason)
    : conformalDriftBand(window.map((w) => w.pooledPct), { coverage: conv.coverage, minWeeks: conv.minWeeks });
  const coalitionBand = seriesReason ? refused(seriesReason)
    : conformalDriftBand(window.map((w) => w.medianCoalition), { coverage: conv.coverage, minWeeks: conv.minWeeks });
  const outside = [
    shareBand.status === 'published' && shareBand.outside ? { metric: 'share', band: shareBand } : null,
    coalitionBand.status === 'published' && coalitionBand.outside ? { metric: 'coalition', band: coalitionBand } : null,
  ].filter(Boolean);
  // The cross-branch SHARE is the primary measure: if it cannot be graded the
  // whole verdict is refused, even when a secondary band published. A refused
  // SECONDARY band is still printed as a partial refusal beside a real verdict.
  const status = seriesReason || shareBand.status === 'refused' ? 'refused' : 'published';
  const verdict = status === 'refused' ? 'refused' : (outside.length ? 'drift' : 'within-band');
  const reason = seriesReason
    || (shareBand.status === 'refused' ? shareBand.reason : null)
    || (coalitionBand.status === 'refused' ? coalitionBand.reason : null);
  const directions = new Set(outside.map((o) => (o.band.currentDelta > 0 ? 'up' : o.band.currentDelta < 0 ? 'down' : 'flat')));
  const direction = !outside.length ? null : (directions.size > 1 ? 'mixed' : [...directions][0]);
  const latest = window.length ? window[window.length - 1] : null;
  return {
    ok: true,
    engineVersion: JUR_DRIFT_ENGINE_VERSION,
    at: at.toISOString(),
    week: String(latest?.week || ''),
    conventions: conv,
    weeks: window,
    allWeeksN: allWeeks.length,
    windowN: window.length,
    invalidN,
    gapWeeks: countedWeekGaps(window),
    bands: { share: shareBand, coalition: coalitionBand },
    outside,
    status,
    verdict,
    direction,
    reason,
    reasonText: reason ? JUR_REFUSALS[reason] : null,
    latest,
    totals: {
      weeks: allWeeks.length,
      windowWeeks: window.length,
      spans: window.reduce((sum, w) => sum + w.spansN, 0),
      suppressed: window.reduce((sum, w) => sum + w.suppressedN, 0),
      objectives: window.reduce((sum, w) => sum + w.objectivesN, 0),
      crossBranch: window.reduce((sum, w) => sum + w.crossBranchN, 0),
    },
    refusals: Object.fromEntries(Object.entries(JUR_REFUSALS).filter(([key]) => key.startsWith('drift-'))),
  };
}

/** The seat's reporting subtree + declared matrix lines is the ONLY scope cut. */
export function jurDriftScope(state, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  try {
    const effSettings = settings || state?.settings || {};
    const lineScope = matrixLineScopeFor(state, { now: at, settings: effSettings });
    const built = buildSeats(state, { now: at, settings: effSettings, ...(lineScope ? { lineScope } : {}) });
    const seat = activeSeat(built) || built.operatorSeat;
    const rank = seat?.rank || 0;
    const full = seat?.fullAccess === true;
    const scopeNodeIds = full ? null : new Set([
      ...(seat?.scope instanceof Set ? [...seat.scope] : []),
      ...(seat?.lineScope instanceof Set ? [...seat.lineScope] : []),
      seat?.nodeId,
      ...(rank >= 5 ? [LEADER_ID] : []),
    ].filter(Boolean));
    const scopeLabel = full ? 'Enterprise' : rank >= 4 ? 'Your function' : rank === 3 ? 'Your unit' : 'Your span';
    return {
      ok: true, rank, full, scopeNodeIds, scopeLabel,
      withheld: !full && rank > 2,
      altitudeKey: ({ 1: 'frontline', 2: 'manager', 3: 'director', 4: 'exec', 5: 'chief' })[rank] || 'operator',
      question: JUR_DRIFT_ALTITUDE_QUESTIONS[({ 1: 'frontline', 2: 'manager', 3: 'director', 4: 'exec', 5: 'chief' })[rank]]
        || JUR_DRIFT_ALTITUDE_QUESTIONS.chief,
    };
  } catch {
    return {
      ok: false, rank: 0, full: true, scopeNodeIds: null, scopeLabel: 'Enterprise',
      withheld: false, altitudeKey: 'operator', question: JUR_DRIFT_ALTITUDE_QUESTIONS.chief, chain: null,
    };
  }
}

/**
 * Identity-free brief. Built ONLY from numbers, week keys, declared codes and
 * refusal reasons — structurally incapable of carrying a span id, objective
 * key, person, title or note.
 */
export function jurDriftBrief(report, { rank = 0, scopeLabel = 'Enterprise' } = {}) {
  const lines = [
    '# Cross-week jurisdiction drift',
    `Scope rank ${rank} (${scopeLabel}). Engine ${report.engineVersion}. Generated ${report.at.slice(0, 10)}.`,
    '',
    `Verdict: ${report.verdict.toUpperCase()}${report.verdict === 'drift' ? ` — ${[...new Set(report.outside.map((o) => o.metric))].join(', ')} outside its conformal band (${report.direction})` : ''}.`,
    report.reasonText ? `Refusal: ${report.reasonText}` : 'No refusal pending.',
    `Frozen ISO weeks: ${report.allWeeksN}; in the look-back window: ${report.windowN}; unsampled weeks in that window: ${report.gapWeeks}. Declared week floor ${report.conventions.minWeeks}, nominal coverage ${report.conventions.coveragePct}%.`,
    '',
    '## Weekly aggregates (identity-free)',
  ];
  for (const w of report.weeks) {
    lines.push(`- ${w.week}: pooled cross-branch share ${w.pooledPct ?? 'refused'}%, mean of unit rates ${w.meanUnitPct ?? 'refused'}% (composition gap ${w.compositionGapPct ?? 'refused'} pp); median of span-median coalition sizes ${w.medianCoalition ?? 'refused'}; spans ${w.spansN}, suppressed ${w.suppressedN}, objectives ${w.objectivesN}, cross-branch ${w.crossBranchN}${w.reason ? `; REFUSED ${w.reason}` : ''}.`);
  }
  lines.push('', '## Conformal bands (distribution-free, DECLARED exchangeability)');
  for (const [key, band] of Object.entries(report.bands)) {
    lines.push(band.status === 'published'
      ? `- ${key}: newest Δ ${band.currentDelta}, calibration n=${band.m}, k=${band.k}, bound ${band.bound}, achieved coverage ${band.coverageBound}, conformal p ${band.p}; ${band.outside ? 'OUTSIDE' : 'within'} the band.`
      : `- ${key}: REFUSED (${band.reason}). ${JUR_REFUSALS[band.reason] || ''}`);
  }
  lines.push('', '## Method and honest limits',
    `- ${report.bands.share.method || 'Split conformal, one-sided, finite-sample.'}`,
    '- The pooled rate Σcross-branch/Σobjectives and the unweighted mean of unit rates are printed side by side: their gap is Yule/Simpson aggregation bias, not noise. A span count that changes after a reorganisation moves the mean without moving the pooled rate.',
    '- Units are the frozen span readings INSIDE THIS SCOPE. Nested spans overlap only through objectives they share; the pooled rate is count-weighted, never a claim of independent samples.',
    '- Median coalition size is the median of each span’s own frozen median — labelled as such, not a pooled median of individual clusters.',
    '- A band crossing is an anomaly under declared exchangeability, not a causal finding and not proof a boundary redraw is owed. An unsampled week is a gap, never a zero and never interpolated.',
    '- RULE-JUR-04 readings are identity-free aggregates; small-cell suppression is a counted refusal, not differential privacy. Local seats remain workflow declarations, not authentication.');
  return lines.join('\n');
}

/** Aggregate-only CSV rows. A refused figure is BLANK, never a printed zero. */
export function jurDriftCsvRows(report, { rank = 0 } = {}) {
  const rows = [];
  for (const w of report.weeks) {
    rows.push({
      row_kind: 'week', week: w.week, scope_rank: rank,
      spans: w.spansN, suppressed_spans: w.suppressedN,
      objectives: w.objectivesN, cross_branch: w.crossBranchN,
      pooled_pct: w.pooledPct, mean_unit_pct: w.meanUnitPct,
      composition_gap_pct: w.compositionGapPct, median_coalition: w.medianCoalition,
      share_delta: w.shareDelta, share_bound: null,
      coalition_delta: w.coalitionDelta, coalition_bound: null,
      coverage_bound: null, verdict: w.reason ? 'refused' : 'measured',
      reason_code: w.reason || w.coalitionReason || null,
    });
  }
  rows.push({
    row_kind: 'verdict', week: report.week || null, scope_rank: rank,
    spans: report.totals.spans, suppressed_spans: report.totals.suppressed,
    objectives: report.totals.objectives, cross_branch: report.totals.crossBranch,
    pooled_pct: report.latest?.pooledPct ?? null,
    mean_unit_pct: report.latest?.meanUnitPct ?? null,
    composition_gap_pct: report.latest?.compositionGapPct ?? null,
    median_coalition: report.latest?.medianCoalition ?? null,
    share_delta: report.bands.share.currentDelta,
    share_bound: report.bands.share.bound,
    coalition_delta: report.bands.coalition.currentDelta,
    coalition_bound: report.bands.coalition.bound,
    coverage_bound: report.bands.share.coverageBound,
    verdict: report.verdict,
    reason_code: report.reason || null,
  });
  return rows;
}

/** Seat-scoped read used by the view, the SAFE_READS API and the brief/CSV. */
export function jurDriftRead(state, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const scope = jurDriftScope(state, { now: at, settings });
  const report = buildJurisdictionDrift(state, {
    now: at, settings: settings || state?.settings || {},
    scopeNodeIds: scope.scopeNodeIds,
  });
  return {
    ...report,
    rank: scope.rank,
    fullAccess: scope.full,
    withheld: scope.withheld,
    scopeLabel: scope.scopeLabel,
    altitudeKey: scope.altitudeKey,
    question: scope.question,
    brief: jurDriftBrief(report, { rank: scope.rank, scopeLabel: scope.scopeLabel }),
    columns: JUR_DRIFT_CSV_COLUMNS,
    rows: jurDriftCsvRows(report, { rank: scope.rank }),
  };
}

/** Used by the rule: the enterprise-wide reading, without a seat. */
export function jurDriftEnterprise(state, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  return buildJurisdictionDrift(state, { now: at, settings: settings || state?.settings || {} });
}

export { JUR_DRIFT_CSV_COLUMNS, JUR_DRIFT_ENGINE_VERSION };
