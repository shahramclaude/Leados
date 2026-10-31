/**
 * app/core/domain/survivalSchema.js — the persisted contract for the Delivery
 * Survival Terminal (Schema v63).
 *
 * The collection is small on purpose. The curve itself is *derived* on every
 * read from the leader's portfolio, cases, requisitions, changes, delegations
 * and decisions — storing it would let a stored number drift away from the
 * records that produced it. What is persisted is the one thing that cannot be
 * recomputed: **the prediction that was frozen at a moment in time**, so it can
 * be graded out of sample later without being quietly improved.
 *
 * A `survivalReading` holds:
 *
 *   horizonDays   the forward window the reading was about
 *   reviewOn      the date by which each predicted item either completed or did not
 *   curveDigest   the sample the reading stood on: how many items, how many
 *                 exited, how many were censored, the longest observation and
 *                 the at-risk floor that was in force. Frozen, not re-derived.
 *   predictions   one row per open item: the real source id, its elapsed age,
 *                 the at-risk count at that age and the probability that was
 *                 printed. Frozen verbatim, including the ones that were wrong.
 *   outcome       filled in only when the reading is graded, from the source
 *                 record's own terminal state. Never back-filled from memory.
 *   grade         Brier score, base-rate Brier and the skill score, once.
 *
 * Normalisation follows the workspace's prediction rules: frozen numbers are
 * read back as stored, an unreadable record is dropped with a warning rather
 * than repaired into something plausible, dangling sources are marked missing
 * rather than deleted (a prediction about a deleted record is still evidence
 * that the prediction was made), and every list is bounded.
 */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calendarDayOrNull(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clampText(value, max) {
  return str(value).trim().slice(0, max);
}

function intIn(value, fallback, min, max) {
  const n = num(value);
  if (n === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function rate100(value) {
  const n = num(value);
  if (n === null) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

export const SURVIVAL_SCHEMA_VERSION = 1;

export const READING_STATUSES = Object.freeze(['frozen', 'graded']);
export const READING_STATUS_LABELS = Object.freeze({
  frozen: 'Frozen, awaiting its review date',
  graded: 'Graded against the record',
});

export const PREDICTION_SOURCE_TYPES = Object.freeze([
  'portfolio', 'case', 'requisition', 'change', 'delegation', 'decision',
]);

const MAX_READINGS = 60;
const MAX_PREDICTIONS = 40;
const MAX_HISTORY = 60;
const MAX_MARKERS = 160;
const MAX_NOTES = 20;

function normalizeOutcome(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    completedOn: calendarDayOrNull(raw.completedOn),
    abandonedOn: calendarDayOrNull(raw.abandonedOn),
    missing: raw.missing === true,
  };
}

function normalizePredictions(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const sourceType = PREDICTION_SOURCE_TYPES.includes(row.sourceType) ? row.sourceType : null;
    const sourceId = clampText(row.sourceId, 120);
    if (!sourceType || !sourceId) continue;
    const key = `${sourceType}:${sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const probability = rate100(row.probabilityPct);
    // A prediction with no frozen probability is not a prediction. It is
    // dropped rather than filled with the class median.
    if (probability === null) continue;
    out.push({
      itemKey: `${sourceType}:${sourceId}`,
      sourceType,
      sourceId,
      title: clampText(row.title, 160),
      kind: clampText(row.kind, 40),
      elapsedDays: intIn(row.elapsedDays, 0, 0, 36500),
      probabilityPct: probability,
      atRisk: num(row.atRisk) === null ? null : intIn(row.atRisk, 0, 0, 100000),
      classKey: clampText(row.classKey, 40),
      outcome: normalizeOutcome(row.outcome),
    });
    if (out.length >= MAX_PREDICTIONS) break;
  }
  return out;
}

function normalizeGrade(raw) {
  if (!isPlainObject(raw) || !calendarDayOrNull(raw.gradedOn)) return null;
  return {
    gradedOn: calendarDayOrNull(raw.gradedOn),
    settledCount: intIn(raw.settledCount, 0, 0, MAX_PREDICTIONS),
    brier: num(raw.brier),
    baselineBrier: num(raw.baselineBrier),
    baseRatePct: num(raw.baseRatePct),
    skillScore: num(raw.skillScore),
    hits: intIn(raw.hits, 0, 0, MAX_PREDICTIONS),
    misses: intIn(raw.misses, 0, 0, MAX_PREDICTIONS),
    belowFloor: raw.belowFloor === true,
  };
}

function normalizeCurveDigest(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    n: intIn(source.n, 0, 0, 100000),
    completions: intIn(source.completions, 0, 0, 100000),
    abandonments: intIn(source.abandonments, 0, 0, 100000),
    censored: intIn(source.censored, 0, 0, 100000),
    maxObservedDays: intIn(source.maxObservedDays, 0, 0, 36500),
    riskFloorPct: num(source.riskFloorPct),
  };
}

function normalizeReading(raw, now, warnings) {
  if (!isPlainObject(raw)) return null;
  const label = clampText(raw.label, 200);
  if (label.length < 3) {
    warnings.push('Delivery survival: dropped a reading with no usable label');
    return null;
  }
  const predictions = normalizePredictions(raw.predictions);
  if (!predictions.length) {
    // A reading with no prediction is a screenshot of a page, not a forecast.
    warnings.push('Delivery survival: dropped a reading that froze no item prediction');
    return null;
  }
  const status = READING_STATUSES.includes(raw.status) ? raw.status : 'frozen';
  const grade = normalizeGrade(raw.grade);
  return {
    id: clampText(raw.id, 80),
    label,
    horizonDays: intIn(raw.horizonDays, 14, 1, 180),
    reviewOn: calendarDayOrNull(raw.reviewOn),
    frozenOn: calendarDayOrNull(raw.frozenOn) || calendarDayOrNull(isoOrNull(raw.createdAt)) || null,
    // A reading cannot be "graded" without a grade; the pair is repaired
    // downward rather than upward, because claiming a grade that does not exist
    // is the one error this module must never make.
    status: status === 'graded' && !grade ? 'frozen' : status,
    curveDigest: normalizeCurveDigest(raw.curveDigest),
    predictions,
    grade,
    notes: (Array.isArray(raw.notes) ? raw.notes : [])
      .filter((row) => isPlainObject(row) && typeof row.text === 'string')
      .slice(-MAX_NOTES)
      .map((row) => ({
        at: isoOrNull(row.at) || now,
        source: clampText(row.source, 40) || 'manual',
        text: clampText(row.text, 900),
      })),
    markers: (Array.isArray(raw.markers) ? raw.markers : [])
      .filter((marker) => typeof marker === 'string' && marker.length > 0)
      .map((marker) => marker.slice(0, 200))
      .slice(-MAX_MARKERS),
    history: (Array.isArray(raw.history) ? raw.history : [])
      .filter((row) => isPlainObject(row) && typeof row.summary === 'string')
      .slice(-MAX_HISTORY)
      .map((row) => ({
        at: isoOrNull(row.at) || now,
        type: clampText(row.type, 40) || 'updated',
        summary: clampText(row.summary, 300),
      })),
    createdAt: isoOrNull(raw.createdAt) || now,
    updatedAt: isoOrNull(raw.updatedAt) || isoOrNull(raw.createdAt) || now,
  };
}

/**
 * Fail-closed collection normaliser. `state` is unused today and kept in the
 * signature so a future cross-check has somewhere to read from without
 * changing the call site in `schema.js`.
 */
export function normalizeSurvivalReadings(raw, state, now, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const reading = normalizeReading(row, now, warnings);
    if (!reading) continue;
    if (!reading.id) reading.id = `surv-${out.length + 1}`;
    if (seen.has(reading.id)) {
      warnings.push('Delivery survival: dropped a duplicate reading id');
      continue;
    }
    seen.add(reading.id);
    out.push(reading);
    if (out.length >= MAX_READINGS) break;
  }
  return out;
}

/** A marker array for rule idempotency that survives a reload, bounded. */
export function normalizeSurvivalMarkers(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((marker) => typeof marker === 'string' && marker.length > 0)
    .map((marker) => marker.slice(0, 200))
    .slice(-400);
}
