/**
 * app/core/domain/paritySchema.js — persisted contract of the Leadership Parity
 * & Standard Consistency Terminal (Schema v65, ADR-0054).
 *
 * Two persisted structures, both fail-closed:
 *
 *   parityAudits     append-oriented frozen parity & consistency snapshots
 *                    committed by the leader with a future review date and an
 *                    optional probability forecast of improvement, graded once
 *                    after `reviewOn` against realized working records.
 *   parityMarkers    idempotency markers for RULE-PAR-01..05.
 *
 * Live disparity, promise fulfillment and standard consistency are NEVER stored
 * on open records — they are re-derived on every read from primary dated
 * workspace collections, so no stored figure can drift from the record.
 */

export const PARITY_SCHEMA_VERSION = 1;

export const PARITY_CHANNEL_KEYS = Object.freeze(['coaching', 'feedback', 'authority', 'sponsorship']);
export const PARITY_AUDIT_STATUSES = Object.freeze(['frozen', 'graded']);
export const PARITY_AUDIT_CAP = 60;
export const PARITY_MARKERS_CAP = 400;
export const PARITY_LABEL_MAX = 200;
export const PARITY_NOTE_MAX = 600;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function calendarDay(value) {
  const raw = str(value, 10);
  if (!DAY_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : null;
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function finiteOrNull(value, min = -1e9, max = 1e9) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(max, Math.max(min, n)) * 10000) / 10000;
}

function normalizeChannelSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = str(raw.key, 30);
  if (!PARITY_CHANNEL_KEYS.includes(key)) return null;
  return {
    key,
    available: raw.available === true,
    eligibleCount: Math.max(0, Math.round(Number(raw.eligibleCount) || 0)),
    giniPct: finiteOrNull(raw.giniPct, 0, 100),
    atkinsonPct: finiteOrNull(raw.atkinsonPct, 0, 100),
    theil: finiteOrNull(raw.theil, 0, 20),
    withinTheil: finiteOrNull(raw.withinTheil, 0, 20),
    betweenTheil: finiteOrNull(raw.betweenTheil, 0, 20),
    withinSharePct: finiteOrNull(raw.withinSharePct, 0, 100),
    zeroCount: Math.max(0, Math.round(Number(raw.zeroCount) || 0)),
  };
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedOn = calendarDay(raw.gradedOn);
  if (!gradedOn) return null;
  if (typeof raw.improved !== 'boolean') return null;
  return {
    gradedOn,
    gradedAt: isoOrNull(raw.gradedAt),
    improved: raw.improved,
    withinTheilBefore: finiteOrNull(raw.withinTheilBefore, 0, 20),
    withinTheilAfter: finiteOrNull(raw.withinTheilAfter, 0, 20),
    fringeBefore: Math.max(0, Math.round(Number(raw.fringeBefore) || 0)),
    fringeAfter: Math.max(0, Math.round(Number(raw.fringeAfter) || 0)),
    promiseGapBeforePp: finiteOrNull(raw.promiseGapBeforePp, 0, 100),
    promiseGapAfterPp: finiteOrNull(raw.promiseGapAfterPp, 0, 100),
    inversionsBefore: Math.max(0, Math.round(Number(raw.inversionsBefore) || 0)),
    inversionsAfter: Math.max(0, Math.round(Number(raw.inversionsAfter) || 0)),
    brier: finiteOrNull(raw.brier, 0, 1),
    summary: str(raw.summary, 400),
  };
}

/**
 * Normalize frozen parity audits. Fail-closed per record:
 * - missing id, frozenOn or reviewOn drops the record with a warning;
 * - claiming `status === 'graded'` without a valid `grade` repairs downward to
 *   `'frozen'` with a warning so nobody can import an unverified passing grade.
 */
export function normalizeParityAudits(raw, nowIso = new Date().toISOString(), warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = str(row.id, 80);
    if (!id || seen.has(id)) {
      if (id) warnings.push(`Parity audits: dropped duplicate id (${id}).`);
      continue;
    }
    const frozenOn = calendarDay(row.frozenOn);
    const reviewOn = calendarDay(row.reviewOn);
    if (!frozenOn || !reviewOn) {
      warnings.push(`Parity audits: dropped audit ${id} with missing or invalid frozenOn/reviewOn date.`);
      continue;
    }
    const label = str(row.label, PARITY_LABEL_MAX) || `Parity audit (${frozenOn})`;
    const windowDays = Math.min(365, Math.max(14, Math.round(Number(row.windowDays) || 90)));
    const channels = (Array.isArray(row.channels) ? row.channels : [])
      .map(normalizeChannelSnapshot)
      .filter(Boolean);
    const probRaw = finiteOrNull(row.predictedImprovementPct, 5, 95);
    const predictedImprovementPct = probRaw === null ? null : Math.round(probRaw);
    let status = PARITY_AUDIT_STATUSES.includes(row.status) ? row.status : 'frozen';
    let grade = status === 'graded' ? normalizeGrade(row.grade) : null;
    if (status === 'graded' && !grade) {
      warnings.push(`Parity audits: repaired ${id} from graded to frozen because its grade record was missing or invalid.`);
      status = 'frozen';
      grade = null;
    }
    seen.add(id);
    out.push({
      id,
      label,
      commitment: str(row.commitment, PARITY_NOTE_MAX),
      frozenOn,
      reviewOn,
      windowDays,
      eligibleCount: Math.max(0, Math.round(Number(row.eligibleCount) || 0)),
      withinTheilMean: finiteOrNull(row.withinTheilMean, 0, 20),
      fringeCount: Math.max(0, Math.round(Number(row.fringeCount) || 0)),
      promiseFulfillmentPct: finiteOrNull(row.promiseFulfillmentPct, 0, 100),
      promiseGapPp: finiteOrNull(row.promiseGapPp, 0, 100),
      overdueLeaderPromises: Math.max(0, Math.round(Number(row.overdueLeaderPromises) || 0)),
      inversionsCount: Math.max(0, Math.round(Number(row.inversionsCount) || 0)),
      predictedImprovementPct,
      channels,
      status,
      grade,
      notes: str(row.notes, PARITY_NOTE_MAX),
      createdAt: isoOrNull(row.createdAt) || nowIso,
      updatedAt: isoOrNull(row.updatedAt) || isoOrNull(row.createdAt) || nowIso,
    });
  }
  return out.slice(0, PARITY_AUDIT_CAP);
}

/** Normalize rule idempotency markers (bounded fail-closed string list). */
export function normalizeParityMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().slice(0, 200);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= PARITY_MARKERS_CAP) break;
  }
  return out;
}
