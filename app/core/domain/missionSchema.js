/** Additive schema v87: immutable, identity-free Mission Brief snapshots. */
import { MISSION_LIMITS } from './missionRegistry.js';
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(v)?.slice(0, 10) === v ? v : null;
const nonnegative = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{16}$/.test(v) ? v : '';
const bound = (v) => object(v) && nonnegative(v.lower) !== null && nonnegative(v.upper) !== null && v.lower <= v.upper ? { lower: v.lower, upper: v.upper } : null;
export function normalizeMissionSettings(settings = {}) {
  const n = Number(settings.missionCellFloor);
  return { missionCellFloor: Number.isInteger(n) && n >= 3 && n <= 25 ? n : MISSION_LIMITS.floor };
}
export function normalizeMissionBriefs(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = []; const seen = new Set();
  for (const row of raw.slice(0, MISSION_LIMITS.briefs * 2)) {
    if (!object(row) || !text(row.id) || seen.has(row.id) || !text(row.seatId) || !Number.isInteger(row.rank) || row.rank < 1 || row.rank > 5
      || !iso(row.createdAt) || !day(row.reviewOn) || !bound(row.open) || !bound(row.overdue) || !bound(row.horizonDebt)
      || !Array.isArray(row.cells) || !Array.isArray(row.sources) || !hash(row.fingerprint) || nonnegative(row.sourceRevision) === null) {
      warnings.push('Mission briefs: dropped a malformed snapshot; no figures were inferred.'); continue;
    }
    const cells = row.cells.slice(0, MISSION_LIMITS.cells).map((c) => object(c) && text(c.key) && text(c.label) && bound(c.open) && bound(c.overdue)
      ? { key: text(c.key, 80), label: text(c.label, 100), seatId: text(c.seatId, 80) || null, open: c.open, overdue: c.overdue, horizonDebt: bound(c.horizonDebt) || c.open, suppressed: c.suppressed === true, reason: text(c.reason, 240) } : null);
    const sources = row.sources.slice(0, 40).map((s) => object(s) && text(s.key) && text(s.label) && bound(s.count)
      ? { key: text(s.key, 60), label: text(s.label, 100), count: s.count } : null);
    if (cells.includes(null) || sources.includes(null) || row.open.upper < cells.reduce((n, c) => n + c.open.lower, 0)) {
      warnings.push('Mission briefs: dropped a snapshot with malformed or inconsistent partitions.'); continue;
    }
    seen.add(row.id);
    out.push({ id: text(row.id, 80), seatId: text(row.seatId, 80), rank: row.rank, altitude: text(row.altitude, 40),
      createdAt: iso(row.createdAt), reviewOn: day(row.reviewOn), sourceRevision: row.sourceRevision,
      fingerprint: hash(row.fingerprint), cellFloor: Number.isInteger(row.cellFloor) && row.cellFloor >= 3 && row.cellFloor <= 25 ? row.cellFloor : 5,
      open: row.open, overdue: row.overdue, horizonDebt: row.horizonDebt, cells, sources,
      observedPeople: nonnegative(row.observedPeople) ?? 0, unassigned: nonnegative(row.unassigned) ?? 0,
      commitments: (Array.isArray(row.commitments) ? row.commitments : []).slice(0, 12).flatMap((m) => object(m) && /^[A-Z]{3}$/.test(m.currency) && Number.isFinite(m.committed) && m.committed >= 0 && Number.isFinite(m.actual) && m.actual >= 0 ? [{ currency: m.currency, committed: m.committed, actual: m.actual }] : []),
      limitations: (Array.isArray(row.limitations) ? row.limitations : []).map((v) => text(v, 500)).filter(Boolean).slice(0, 8),
    });
    if (out.length >= MISSION_LIMITS.briefs) break;
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
