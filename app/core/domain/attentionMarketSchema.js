/**
 * app/core/domain/attentionMarketSchema.js — the persisted contract for the
 * Attention Market (Schema v57).
 *
 * A plan record is a PREDICTION, and it is normalised the way the rest of the
 * workspace normalises predictions: the frozen result is kept exactly as it was
 * written (it is the thing being graded), the mutable edges around it are
 * clamped, and an unreadable record is dropped rather than repaired into
 * something plausible.
 *
 * The three rules this file enforces:
 *
 *  1. A committed plan keeps its frozen numbers. Re-deriving `value`, `lpBound`
 *     or `shadowPrice` on load would silently grade the plan against a market
 *     that has moved, which is exactly the drift the frozen result exists to
 *     prevent. They are read back as stored, and only their types are repaired.
 *  2. A record with no `committedOn`, no `currency` or no result arrays is not
 *     a plan. It is dropped with a warning, not turned into an empty one.
 *  3. The arrays that grow — markers, notes, history, readings — are bounded,
 *     and the caps are the same order as every other append-only collection in
 *     the workspace so a long-lived tenant cannot bloat the save.
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

export const ATT_SCHEMA_VERSION = 1;
const MAX_PLANS = 240;
const MAX_ITEMS = 64;
const MAX_NOTES = 24;
const MAX_HISTORY = 40;
const MAX_MARKERS = 240;
const MAX_READINGS = 64;

function nonNegativeOrNull(value) {
  const n = num(value);
  if (n === null) return null;
  return n < 0 ? 0 : Math.round(n * 100) / 100;
}

function finiteOrNull(value) {
  const n = num(value);
  return n === null ? null : Math.round(n * 1000) / 1000;
}

function clampText(value, max) {
  return str(value).trim().slice(0, max);
}

function normalizeItem(raw) {
  if (!isPlainObject(raw)) return null;
  const sourceType = clampText(raw.sourceType, 40);
  const sourceId = clampText(raw.sourceId, 80);
  if (!sourceType || !sourceId) return null;
  return {
    id: clampText(raw.id, 120) || `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    title: clampText(raw.title, 200),
    route: clampText(raw.route, 300),
    mode: ['do', 'delegate', 'drop'].includes(raw.mode) ? raw.mode : 'do',
    hours: nonNegativeOrNull(raw.hours),
    hoursIfDoneByLeader: nonNegativeOrNull(raw.hoursIfDoneByLeader),
    exposure: nonNegativeOrNull(raw.exposure),
    currency: clampText(raw.currency, 6).toUpperCase() || null,
    probability: finiteOrNull(raw.probability),
    probabilityMeasured: raw.probabilityMeasured === true,
    value: nonNegativeOrNull(raw.value),
    delegateId: clampText(raw.delegateId, 80) || null,
    delegateName: clampText(raw.delegateName, 120) || null,
  };
}

function normalizeForgone(raw) {
  if (!isPlainObject(raw)) return null;
  const sourceType = clampText(raw.sourceType, 40);
  const sourceId = clampText(raw.sourceId, 80);
  if (!sourceType || !sourceId) return null;
  return {
    id: clampText(raw.id, 120) || `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    title: clampText(raw.title, 200),
    hours: nonNegativeOrNull(raw.hours),
    exposure: nonNegativeOrNull(raw.exposure),
    currency: clampText(raw.currency, 6).toUpperCase() || null,
    forgone: nonNegativeOrNull(raw.forgone),
    reason: clampText(raw.reason, 400),
  };
}

function normalizeResult(raw) {
  if (!isPlainObject(raw)) return null;
  const items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeItem).filter(Boolean).slice(0, MAX_ITEMS);
  const forgone = (Array.isArray(raw.forgone) ? raw.forgone : []).map(normalizeForgone).filter(Boolean).slice(0, MAX_ITEMS);
  const committedOn = calendarDayOrNull(raw.committedOn);
  if (!committedOn) return null;
  return {
    currency: clampText(raw.currency, 6).toUpperCase() || 'USD',
    budgetHours: nonNegativeOrNull(raw.budgetHours),
    usedHours: nonNegativeOrNull(raw.usedHours),
    leftHours: nonNegativeOrNull(raw.leftHours),
    value: nonNegativeOrNull(raw.value),
    lpBound: nonNegativeOrNull(raw.lpBound),
    gapPct: finiteOrNull(raw.gapPct),
    shadowPrice: nonNegativeOrNull(raw.shadowPrice),
    saturated: raw.saturated === true,
    totalExposure: nonNegativeOrNull(raw.totalExposure),
    coveragePct: finiteOrNull(raw.coveragePct),
    unpricedCount: nonNegativeOrNull(raw.unpricedCount),
    unpricedHours: nonNegativeOrNull(raw.unpricedHours),
    horizonDays: nonNegativeOrNull(raw.horizonDays),
    handoffSharePct: finiteOrNull(raw.handoffSharePct),
    reviewOn: calendarDayOrNull(raw.reviewOn),
    committedOn,
    items,
    forgone,
    otherMarkets: (Array.isArray(raw.otherMarkets) ? raw.otherMarkets : []).slice(0, 8).map((row) => ({
      currency: clampText(row?.currency, 6).toUpperCase() || 'USD',
      budgetHours: nonNegativeOrNull(row?.budgetHours),
      value: nonNegativeOrNull(row?.value),
      chosen: nonNegativeOrNull(row?.chosen),
      dropped: nonNegativeOrNull(row?.dropped),
    })),
  };
}

function normalizeReading(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    id: clampText(raw.id, 120),
    title: clampText(raw.title, 200),
    sourceType: clampText(raw.sourceType, 40),
    predicted: finiteOrNull(raw.predicted),
    frozenExposure: nonNegativeOrNull(raw.frozenExposure),
    currentExposure: nonNegativeOrNull(raw.currentExposure),
    verdict: ['realised', 'contradicted', 'open', 'unmeasured'].includes(raw.verdict) ? raw.verdict : 'unmeasured',
    avoided: nonNegativeOrNull(raw.avoided),
    note: clampText(raw.note, 240),
  };
}

function normalizeReview(raw) {
  if (!isPlainObject(raw)) return null;
  const reviewedOn = calendarDayOrNull(raw.reviewedOn);
  if (!reviewedOn) return null;
  const counts = isPlainObject(raw.counts) ? raw.counts : {};
  return {
    reviewedOn,
    currency: clampText(raw.currency, 6).toUpperCase() || null,
    predictedValue: nonNegativeOrNull(raw.predictedValue),
    measuredAvoided: nonNegativeOrNull(raw.measuredAvoided),
    attainmentPct: finiteOrNull(raw.attainmentPct),
    brier: finiteOrNull(raw.brier),
    brierN: nonNegativeOrNull(raw.brierN),
    complete: raw.complete === true,
    counts: {
      total: nonNegativeOrNull(counts.total) || 0,
      realised: nonNegativeOrNull(counts.realised) || 0,
      contradicted: nonNegativeOrNull(counts.contradicted) || 0,
      open: nonNegativeOrNull(counts.open) || 0,
      unmeasured: nonNegativeOrNull(counts.unmeasured) || 0,
    },
    readings: (Array.isArray(raw.readings) ? raw.readings : []).map(normalizeReading).filter(Boolean).slice(0, MAX_READINGS),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map((line) => clampText(line, 400)).filter(Boolean).slice(0, 12),
  };
}

export function normalizeAttentionPlans(raw, state = {}, now = new Date().toISOString(), warnings = null) {
  const push = (message) => { if (Array.isArray(warnings)) warnings.push(message); };
  const rows = Array.isArray(raw) ? raw : [];
  const personIds = new Set((state.people || []).map((person) => person && person.id).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const entry of rows) {
    if (!isPlainObject(entry)) continue;
    const id = clampText(entry.id, 120);
    const result = normalizeResult(entry.result);
    if (!id || !result) { push('Attention plans: dropped a record with no id or no frozen result'); continue; }
    if (seen.has(id)) { push('Attention plans: dropped a duplicate plan id'); continue; }
    seen.add(id);
    const status = ['committed', 'reviewed', 'abandoned'].includes(entry.status) ? entry.status : 'committed';
    // A reviewed plan with no review body is a status without a fact. Keep the
    // status truthful instead of the label.
    const review = normalizeReview(entry.review);
    const notes = (Array.isArray(entry.notes) ? entry.notes : [])
      .filter((row) => isPlainObject(row) && str(row.text).trim())
      .map((row) => ({
        at: str(row.at).slice(0, 40) || now,
        source: clampText(row.source, 80),
        text: clampText(row.text, 900),
      }))
      .slice(-MAX_NOTES);
    const history = (Array.isArray(entry.history) ? entry.history : [])
      .filter((row) => isPlainObject(row))
      .map((row) => ({ at: str(row.at).slice(0, 40) || now, type: clampText(row.type, 40), summary: clampText(row.summary, 400) }))
      .slice(-MAX_HISTORY);
    const markers = (Array.isArray(entry.markers) ? entry.markers : [])
      .filter((marker) => typeof marker === 'string' && marker.length > 0)
      .map((marker) => marker.slice(0, 200))
      .slice(0, MAX_MARKERS);
    // Items whose delegate has left the roster keep their record — the plan did
    // name them — but the pointer is cleared so a stale id cannot look live.
    for (const item of result.items) {
      if (item.delegateId && !personIds.has(item.delegateId)) item.delegateId = null;
    }
    out.push({
      id,
      label: clampText(entry.label, 200) || `Plan ${result.committedOn}`,
      status: review ? 'reviewed' : status === 'reviewed' ? 'committed' : status,
      currency: result.currency,
      budgetHours: result.budgetHours,
      committedOn: result.committedOn,
      provenance: {
        kind: ['declared', 'demo'].includes(entry.provenance?.kind) ? entry.provenance.kind : 'declared',
      },
      result,
      review,
      markers,
      notes,
      history,
      createdAt: str(entry.createdAt).slice(0, 40) || now,
      updatedAt: str(entry.updatedAt).slice(0, 40) || now,
    });
  }
  out.sort((a, b) => (a.committedOn < b.committedOn ? 1 : a.committedOn > b.committedOn ? -1 : 0));
  if (out.length > MAX_PLANS) {
    push(`Attention plans: kept the ${MAX_PLANS} most recent plans and dropped the rest`);
    out.splice(MAX_PLANS);
  }
  return out;
}
