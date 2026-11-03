/**
 * app/core/domain/altitudeRouterSchema.js — fail-closed normalizers for Schema
 * v88 (ADR-0081). A malformed or hostile blob is dropped or clamped, never
 * repaired into a figure nobody typed. Every cap is declared in the registry.
 */
import { ROUTER_LIMITS, ROUTER_CONVENTION_DEFAULTS } from './altitudeRouterRegistry.js';
import { ALTITUDE_KEYS } from './chainRegistry.js';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(v)?.slice(0, 10) === v ? v : null);
const hash = (v) => (typeof v === 'string' && /^[a-f0-9]{16}$/.test(v) ? v : '');
const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const boundedNumber = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Fail-closed, NOT clamped-to-boundary: a value outside the declared window is
 * treated as "not answered" and gets the default, exactly like missionCellFloor.
 * Clamping a typo to a floor would silently switch a safety guard off.
 */
export function normalizeRouterSettings(settings = {}) {
  const d = ROUTER_CONVENTION_DEFAULTS;
  const within = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const ef = Number(settings.routingEvidenceFloor);
  return {
    routingEvidenceFloor: Number.isFinite(ef) && ef >= 1 && ef <= 10 ? Math.round(ef * 10) / 10 : d.routingEvidenceFloor,
    routingReliabilityFloorPct: within(settings.routingReliabilityFloorPct, 50, 95, d.routingReliabilityFloorPct),
    routingCalibrationFloorN: within(settings.routingCalibrationFloorN, 3, 20, d.routingCalibrationFloorN),
    routingReviewDays: within(settings.routingReviewDays, 3, 90, d.routingReviewDays),
    routingAutoPropagate: settings.routingAutoPropagate === undefined ? d.routingAutoPropagate : bool(settings.routingAutoPropagate, false),
  };
}

const STATUSES = ['analyzed', 'confirmed', 'dismissed'];

function normalizeSeatPath(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw.slice(0, ROUTER_LIMITS.ladder)) {
    if (!object(row) || !text(row.seatId) || seen.has(row.seatId)) continue;
    const rank = Number(row.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 5) continue;
    if (!ALTITUDE_KEYS.includes(row.altitudeKey)) continue;
    if (!['names', 'unit', 'aggregate'].includes(row.disclosure)) continue;
    seen.add(row.seatId);
    out.push({
      seatId: text(row.seatId, 80), rank, altitudeKey: row.altitudeKey,
      label: text(row.label, 80), disclosure: row.disclosure,
      horizonDays: Number.isFinite(row.horizonDays) ? row.horizonDays : null,
    });
  }
  return out;
}

function normalizeModuleRoutes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, ROUTER_LIMITS.moduleRoutes).flatMap((m) => {
    if (!object(m) || !text(m.categoryId) || !text(m.module) || !text(m.route)) return [];
    const p = Number(m.probability);
    return [{ categoryId: text(m.categoryId, 60), module: text(m.module, 80), route: text(m.route, 80),
      probability: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0 }];
  });
}

function normalizeEvidence(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, ROUTER_LIMITS.evidenceSpans).flatMap((e) => {
    if (!object(e) || !text(e.term)) return [];
    return [{ term: text(e.term, 60), weight: Number.isFinite(e.weight) ? e.weight : 0,
      sentenceIndex: Number.isInteger(e.sentenceIndex) ? e.sentenceIndex : 0,
      negated: e.negated === true }];
  });
}

/**
 * One row is BOTH the routing plan and its later grading record: there is no
 * second ledger that could drift from the decision it describes. `sourceText`
 * stays local (like intakeDrafts) and is NEVER exported in the brief or CSV.
 */
export function normalizeRouterPlans(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw.slice(0, ROUTER_LIMITS.plans * 2)) {
    if (!object(row) || !text(row.id) || seen.has(row.id)) { warnings.push('Altitude routing: dropped a malformed or duplicate plan.'); continue; }
    if (!STATUSES.includes(row.status)) { warnings.push('Altitude routing: dropped a plan with an unknown status.'); continue; }
    if (!iso(row.createdAt) || !hash(row.sourceHash) || !hash(row.fingerprint)) {
      warnings.push('Altitude routing: dropped a plan with a broken timestamp or fingerprint.'); continue;
    }
    const detected = row.detectedAltitudeKey === null || row.detectedAltitudeKey === undefined ? null : row.detectedAltitudeKey;
    if (detected !== null && !ALTITUDE_KEYS.includes(detected)) { warnings.push('Altitude routing: dropped a plan with an unknown detected altitude.'); continue; }
    const confirmed = row.confirmedAltitudeKey === null || row.confirmedAltitudeKey === undefined ? null : row.confirmedAltitudeKey;
    if (confirmed !== null && !ALTITUDE_KEYS.includes(confirmed)) { warnings.push('Altitude routing: dropped a plan with an unknown confirmed altitude.'); continue; }
    const graded = row.gradedAltitudeKey === null || row.gradedAltitudeKey === undefined ? null : row.gradedAltitudeKey;
    if (graded !== null && !ALTITUDE_KEYS.includes(graded)) { warnings.push('Altitude routing: dropped a plan with an unknown graded altitude.'); continue; }
    const seatPath = normalizeSeatPath(row.seatPath);
    if (!seatPath.length) { warnings.push('Altitude routing: dropped a plan with no resolved seat path.'); continue; }
    seen.add(row.id);
    out.push({
      id: text(row.id, 80), status: row.status,
      createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) || iso(row.createdAt),
      engineVersion: text(row.engineVersion, 60),
      sourceHash: hash(row.sourceHash), fingerprint: hash(row.fingerprint),
      sourceText: text(row.sourceText, ROUTER_LIMITS.noteChars),
      sourceLength: Number.isInteger(row.sourceLength) && row.sourceLength >= 0 ? row.sourceLength : 0,
      primaryCategoryId: text(row.primaryCategoryId, 60) || null,
      primaryModule: text(row.primaryModule, 80), primaryRoute: text(row.primaryRoute, 80),
      moduleRoutes: normalizeModuleRoutes(row.moduleRoutes),
      detectedAltitudeKey: detected, confirmedAltitudeKey: confirmed, gradedAltitudeKey: graded,
      altitudeConfidence: boundedNumber(row.altitudeConfidence),
      altitudeBand: ['high', 'medium', 'low', 'none'].includes(row.altitudeBand) ? row.altitudeBand : 'none',
      altitudeMargin: boundedNumber(row.altitudeMargin),
      evidenceWeight: Number.isFinite(row.evidenceWeight) && row.evidenceWeight >= 0 ? Math.min(200, row.evidenceWeight) : 0,
      altitudeEvidence: normalizeEvidence(row.altitudeEvidence),
      refusalReasons: Array.isArray(row.refusalReasons) ? row.refusalReasons.map((r) => text(r, 240)).filter(Boolean).slice(0, ROUTER_LIMITS.refusalReasons) : [],
      refused: bool(row.refused), needsReview: bool(row.needsReview),
      stakesReviewRequired: bool(row.stakesReviewRequired), privacyBlocked: bool(row.privacyBlocked),
      stakesFloorRank: Number.isInteger(row.stakesFloorRank) && row.stakesFloorRank >= 0 && row.stakesFloorRank <= 5 ? row.stakesFloorRank : 0,
      ownerSeatId: text(row.ownerSeatId, 80), ownerSeatLabel: text(row.ownerSeatLabel, 100),
      effectiveRank: Number.isInteger(row.effectiveRank) && row.effectiveRank >= 1 && row.effectiveRank <= 5 ? row.effectiveRank : 1,
      seatPath,
      confirmedCaseId: text(row.confirmedCaseId, 80) || null,
      confirmedOn: day(row.confirmedOn), gradedOn: day(row.gradedOn),
      gradeNote: text(row.gradeNote, 400),
      correct: row.correct === null || row.correct === undefined ? null : bool(row.correct),
      overrideCorrect: row.overrideCorrect === null || row.overrideCorrect === undefined ? null : bool(row.overrideCorrect),
    });
    if (out.length >= ROUTER_LIMITS.plans) break;
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function normalizeRouterMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const value of raw) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 200 && !out.includes(value)) out.push(value);
    if (out.length >= ROUTER_LIMITS.markers) break;
  }
  return out;
}
