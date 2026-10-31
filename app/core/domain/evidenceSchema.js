/**
 * app/core/domain/evidenceSchema.js — the persisted contract of the Evidence
 * Terminal (Schema v66, ADR-0055).
 *
 * Two structures, both fail-closed:
 *
 *   evidenceReviews   a frozen claim about what the pooled evidence said on a
 *                     date. It stores aggregates only — no study titles, no
 *                     hypotheses, no notes — so a review cannot become a
 *                     second, un-redacted copy of the workspace behind the
 *                     export boundary, and cannot be silently rewritten by a
 *                     later change to the studies behind it.
 *
 *   evidenceMarkers   marker-idempotency keys for RULE-EBM-01..05.
 *
 * A review is a PREDICTION, so it is normalised the way every other prediction
 * in this workspace is: the frozen numbers are kept exactly, a record that
 * claims a grade it does not carry is repaired downward with a warning, and
 * the grading function re-derives today's figures from live records rather
 * than trusting a stored one.
 */

const MAX_REVIEWS = 40;
const MAX_MARKERS = 400;
const MAX_CELLS = 60;
const MAX_RANK_ROWS = 12;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(value) {
  return typeof value === 'string' ? value : '';
}

function clampText(value, max) {
  return str(value).slice(0, max);
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function calendarDayOrNull(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${y}-${m}-${d}`;
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round3(n) {
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const CELL_VERDICT_CODES = [
  'no-evidence', 'counts-only', 'works-here', 'harms-here', 'no-detectable-effect', 'heterogeneous',
];

function cleanCell(raw, warnings, index) {
  if (!isPlainObject(raw)) return null;
  const key = clampText(raw.key, 160);
  if (!key) {
    warnings.push(`Evidence reviews: dropped a frozen cell with no key.`);
    return null;
  }
  if (!Number.isFinite(numOrNull(raw.pooled))) {
    // A cell with no pooled estimate is a count, not a finding, and freezing
    // one would let an empty claim be graded as if it had been a prediction.
    warnings.push(`Evidence reviews: dropped frozen cell ${index + 1} because it carried no pooled estimate.`);
    return null;
  }
  const cell = {
    key,
    interventionType: clampText(raw.interventionType, 60) || 'other',
    outcomeId: clampText(raw.outcomeId, 60) || null,
    n: Math.max(0, clampInt(raw.n, 0, 9999, 0)),
    nConfirmatory: Math.max(0, clampInt(raw.nConfirmatory, 0, 9999, 0)),
    pooled: round3(numOrNull(raw.pooled)),
    lo: round3(numOrNull(raw.lo)),
    hi: round3(numOrNull(raw.hi)),
    i2: round3(clampNum(raw.i2, 0, 100, 0)),
    tau2: round3(clampNum(raw.tau2, 0, 1e9, 0)),
    verdict: CELL_VERDICT_CODES.includes(raw.verdict) ? raw.verdict : 'no-detectable-effect',
  };
  if (cell.lo === null || cell.hi === null || cell.hi < cell.lo) {
    warnings.push(`Evidence reviews: frozen cell "${key}" had an unusable interval, so the interval was dropped (the pooled estimate is kept).`);
    cell.lo = null;
    cell.hi = null;
  }
  return cell;
}

function cleanRankRow(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    interventionType: clampText(raw.interventionType, 60) || 'other',
    n: Math.max(0, clampInt(raw.n, 0, 9999, 0)),
    mean: round3(numOrNull(raw.mean)),
    lcb: round3(numOrNull(raw.lcb)),
    evsi: round3(numOrNull(raw.evsi)),
    rank: round3(numOrNull(raw.rank)),
    position: Math.max(1, clampInt(raw.position, 1, 99, 1)),
  };
}

function cleanGrade(raw, warnings, reviewId) {
  if (!raw) return null;
  if (!isPlainObject(raw)) {
    warnings.push(`Evidence reviews: review ${reviewId} carried an unreadable grade; it was cleared and the review returns to frozen.`);
    return null;
  }
  const coverageRate = numOrNull(raw.coverageRate);
  if (!Array.isArray(raw.pairs) || !raw.pairs.length || !Number.isFinite(coverageRate)) {
    warnings.push(`Evidence reviews: review ${reviewId} claimed a grade with no graded cells; it was repaired to frozen.`);
    return null;
  }
  return {
    gradedAt: isoOrNull(raw.gradedAt) || new Date().toISOString(),
    cellsGraded: Math.max(0, clampInt(raw.cellsGraded, 0, 9999, raw.pairs.length)),
    cellsCovered: Math.max(0, clampInt(raw.cellsCovered, 0, 9999, 0)),
    coverageRate: round3(clampNum(coverageRate, 0, 1, 0)),
    meanAbsoluteError: round3(clampNum(raw.meanAbsoluteError, 0, 1e9, 0)),
    medianFrozenWidth: round3(clampNum(raw.medianFrozenWidth, 0, 1e9, 0)),
    note: clampText(raw.note, 600) || null,
    pairs: raw.pairs.filter(isPlainObject).slice(0, MAX_CELLS).map((pair) => ({
      key: clampText(pair.key, 160),
      frozenPooled: round3(numOrNull(pair.frozenPooled)),
      realisedPooled: round3(numOrNull(pair.realisedPooled)),
      covered: pair.covered === true,
      absoluteError: round3(clampNum(pair.absoluteError, 0, 1e9, 0)),
      nThen: Math.max(0, clampInt(pair.nThen, 0, 9999, 0)),
      nNow: Math.max(0, clampInt(pair.nNow, 0, 9999, 0)),
    })),
  };
}

/** Fail-closed normaliser for the frozen evidence-review ledger. */
export function normalizeEvidenceReviews(raw, now, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const [index, item] of raw.entries()) {
    if (!isPlainObject(item)) continue;
    const id = str(item.id).trim().slice(0, 60);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const cells = (Array.isArray(item.cells) ? item.cells : [])
      .map((cell, i) => cleanCell(cell, warnings, i))
      .filter(Boolean)
      .slice(0, MAX_CELLS);
    const reviewOn = calendarDayOrNull(item.reviewOn);
    const record = {
      id,
      label: clampText(item.label, 200) || `Evidence review ${index + 1}`,
      outcomeId: clampText(item.outcomeId, 60) || null,
      outcomeLabel: clampText(item.outcomeLabel, 120) || null,
      frozenAt: isoOrNull(item.frozenAt) || now,
      reviewOn,
      engineVersion: clampText(item.engineVersion, 60) || null,
      conventions: isPlainObject(item.conventions)
        ? {
          minPoolStudies: clampInt(item.conventions.minPoolStudies, 1, 99, 3),
          minHeterogeneity: clampInt(item.conventions.minHeterogeneity, 1, 99, 4),
          alpha: [0.2, 0.1, 0.05].includes(Number(item.conventions.alpha)) ? Number(item.conventions.alpha) : 0.1,
          horizonDecisions: clampInt(item.conventions.horizonDecisions, 1, 999, 6),
          exploreWeight: clampNum(item.conventions.exploreWeight, 0, 10, 1),
        }
        : null,
      counts: isPlainObject(item.counts) ? { ...item.counts } : {},
      cells,
      ranking: (Array.isArray(item.ranking) ? item.ranking : [])
        .map(cleanRankRow)
        .filter(Boolean)
        .slice(0, MAX_RANK_ROWS),
      resolution: isPlainObject(item.resolution)
        ? {
          n: Math.max(0, clampInt(item.resolution.n, 0, 9999, 0)),
          brier: round3(clampNum(item.resolution.brier, 0, 4, 0)),
          referenceBrier: round3(clampNum(item.resolution.referenceBrier, 0, 4, 0)),
          skill: round3(clampNum(item.resolution.skill, -10, 1, 0)),
          gapPp: round3(clampNum(item.resolution.gapPp, -100, 100, 0)),
          scored: item.resolution.scored === true,
        }
        : null,
      graded: cleanGrade(item.graded, warnings, id),
    };
    out.push(record);
    if (out.length >= MAX_REVIEWS) break;
  }
  return out;
}

export function normalizeEvidenceMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((marker) => typeof marker === 'string' && marker.length > 0)
    .map((marker) => marker.slice(0, 200))
    .slice(0, MAX_MARKERS);
}

export const EVIDENCE_SCHEMA_CAPS = Object.freeze({
  reviews: MAX_REVIEWS,
  markers: MAX_MARKERS,
  cellsPerReview: MAX_CELLS,
  rankRows: MAX_RANK_ROWS,
});

export function evidenceReviewById(state, id) {
  if (!id) return null;
  return (state?.evidenceReviews || []).find((review) => review.id === id) || null;
}
