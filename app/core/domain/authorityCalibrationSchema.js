/**
 * app/core/domain/authorityCalibrationSchema.js — normalization for the
 * Authority Calibration Ledger (Schema v85, ADR-0079).
 *
 * Calibration markers are system-generated idempotency records: one per
 * governed decision (per cell per ISO week) and one per cell that first
 * reaches the evidence floor. They are never authored by a person, so
 * normalization only validates shape — it never infers, clamps or back-fills.
 * Settings are clamped into a printed range; no range contains the value that
 * would silently disable its own test.
 */

/** Validate a YYYY-MM-DD calendar day (no impossible dates). */
function calendarDayOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const parsed = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v ? v : null;
}

export function normalizeAuthorityCalibrationMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    if (!row.id || typeof row.id !== 'string') continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      tag: typeof row.tag === 'string' ? row.tag.trim().slice(0, 200) : '',
      ruleId: typeof row.ruleId === 'string' ? row.ruleId.trim().slice(0, 80) : '',
      targetType: typeof row.targetType === 'string' ? row.targetType.trim().slice(0, 80) : '',
      targetId: typeof row.targetId === 'string' ? row.targetId.trim().slice(0, 120) : '',
      summary: typeof row.summary === 'string' ? row.summary.trim().slice(0, 500) : '',
      createdOn: calendarDayOrNull(row.createdOn),
    });
  }
  return out;
}

export function normalizeAuthorityCalibrationSettings(raw = {}) {
  const int = (key, min, max, fallback) => {
    const n = Math.round(Number(raw[key]));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    authorityCalibrationFloorN: int(
      'authorityCalibrationFloorN',
      1,
      50,
      5,
    ),
    authorityCalibrationReliabilityFloorPct: int(
      'authorityCalibrationReliabilityFloorPct',
      1,
      100,
      60,
    ),
    authorityCalibrationAutoPropagate: raw.authorityCalibrationAutoPropagate !== false,
  };
}
