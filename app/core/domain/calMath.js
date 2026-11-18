/**
 * app/core/domain/calMath.js — the exact arithmetic of the Performance
 * Calibration Decision Register (ADR-0261).
 *
 * Four computations, all derived on read, all refused below their floors:
 *
 *   - **Distribution counts.** Proposed and calibrated counts per rating, per
 *     session. The reader's totals re-add to their rows; `figuresComplete` is
 *     separate from `balances`.
 *   - **Cohen's kappa (Cohen 1960).** Inter-rater agreement where two lines
 *     rated the same person. Observed agreement, chance agreement, kappa.
 *     Refused below the paired floor or where one cell carries the table.
 *   - **Four-fifths ratio (EEOC 1978).** Favourable-decision rate
 *     (often-exceeds + sets-standard) by declared group. Ratio below 0.8
 *     flags. Refused below the floor. A screening heuristic, not a legal
 *     conclusion.
 *   - **Day counts.** Whole-day differences for overdue sessions, computed
 *     exactly and printed beside every verdict.
 *
 * Pure module: no DOM, no storage, no wall-clock globals.
 */

import { CAL_RATING_KEYS, calRatingRank } from './calRegistry.js';

export function wholeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function utcDayMs(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function dayLabel(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '—';
}

export function daysBetweenDays(fromDay, toDay) {
  const from = utcDayMs(fromDay);
  const to = utcDayMs(toDay);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * Distribution counts per rating. Returns counts keyed by rating, plus total.
 * Never invents a rating: an unknown rating is counted as `unknown` and the
 * caller prints it.
 */
export function distributionCounts(ratings) {
  const counts = {};
  for (const key of CAL_RATING_KEYS) counts[key] = 0;
  counts.unknown = 0;
  let total = 0;
  for (const rating of ratings || []) {
    if (CAL_RATING_KEYS.includes(rating)) counts[rating] += 1;
    else counts.unknown += 1;
    total += 1;
  }
  return { counts, total };
}

/**
 * Cohen's kappa for two raters on the same 4-point scale.
 * Pairs: array of {a, b} where a and b are rating keys.
 * Returns {n, observed, chance, kappa, refused, reason}.
 * Refused below floor (n < 5) or where one cell carries the table.
 */
export function cohensKappa(pairs, { floor = 5 } = {}) {
  const valid = (pairs || []).filter((p) => p && CAL_RATING_KEYS.includes(p.a) && CAL_RATING_KEYS.includes(p.b));
  const n = valid.length;
  if (n < floor) {
    return { n, observed: null, chance: null, kappa: null, refused: true, reason: `paired floor ${floor} not met (n=${n})` };
  }
  // 4x4 table
  const table = {};
  for (const a of CAL_RATING_KEYS) {
    table[a] = {};
    for (const b of CAL_RATING_KEYS) table[a][b] = 0;
  }
  for (const p of valid) table[p.a][p.b] += 1;
  // Check one cell carries the table (all pairs in one cell)
  let maxCell = 0;
  for (const a of CAL_RATING_KEYS) for (const b of CAL_RATING_KEYS) maxCell = Math.max(maxCell, table[a][b]);
  if (maxCell === n) {
    return { n, observed: null, chance: null, kappa: null, refused: true, reason: 'one cell carries the table' };
  }
  let observedCount = 0;
  for (const k of CAL_RATING_KEYS) observedCount += table[k][k];
  const observed = observedCount / n;
  // Chance agreement from marginals
  const rowTotals = {};
  const colTotals = {};
  for (const k of CAL_RATING_KEYS) { rowTotals[k] = 0; colTotals[k] = 0; }
  for (const p of valid) { rowTotals[p.a] += 1; colTotals[p.b] += 1; }
  let chance = 0;
  for (const k of CAL_RATING_KEYS) chance += (rowTotals[k] / n) * (colTotals[k] / n);
  let kappa = null;
  if (chance < 1) kappa = (observed - chance) / (1 - chance);
  else kappa = observed === 1 ? 1 : 0;
  return { n, observed, chance, kappa, refused: false, reason: null };
}

/**
 * Four-fifths ratio. Groups: array of {key, favourable, total}.
 * Returns {ratio, flagged, refused, reason, groups}.
 * Favourable = often-exceeds + sets-standard.
 * Refused below floor (any group total < floor) or where a group has no
 * favourable decisions to compare.
 */
export function fourFifths(groups, { floor = 3 } = {}) {
  const valid = (groups || []).filter((g) => g && typeof g.key === 'string' && Number.isFinite(g.favourable) && Number.isFinite(g.total) && g.total > 0);
  if (valid.length < 2) {
    return { ratio: null, flagged: false, refused: true, reason: 'fewer than two declared groups', groups: valid };
  }
  for (const g of valid) {
    if (g.total < floor) {
      return { ratio: null, flagged: false, refused: true, reason: `group ${g.key} below floor ${floor} (total=${g.total})`, groups: valid };
    }
  }
  const rates = valid.map((g) => ({ key: g.key, rate: g.favourable / g.total, favourable: g.favourable, total: g.total }));
  const maxRate = Math.max(...rates.map((r) => r.rate));
  const minRate = Math.min(...rates.map((r) => r.rate));
  if (maxRate === 0) {
    return { ratio: null, flagged: false, refused: true, reason: 'no favourable decisions in any group', groups: rates };
  }
  const ratio = minRate / maxRate;
  return { ratio, flagged: ratio < 0.8, refused: false, reason: null, groups: rates };
}

/**
 * Rating gap between two proposed ratings. Returns absolute rank difference,
 * or null where either rating is unknown.
 */
export function ratingGap(a, b) {
  const ra = calRatingRank(a);
  const rb = calRatingRank(b);
  if (ra === null || rb === null) return null;
  return Math.abs(ra - rb);
}
