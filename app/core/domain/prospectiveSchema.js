/**
 * app/core/domain/prospectiveSchema.js — persistence contract for the
 * Prospective Intervention Contract (Schema v97, ADR-0094).
 *
 * A contract is frozen at declaration: probability, threshold, horizon and the
 * EXACT cohort of record ids. A grade is immutable and once-only. Everything
 * that travels upward (brief, CSV, graph node) is built from these rows without
 * ever copying a title, a cohort id, a person name or an amount into it — the
 * normalizer exposes no such field on the outward shapes, so a leak cannot be
 * added by accident. A malformed row is DROPPED with a warning, never repaired
 * into something a leader might act on.
 */
import { ALTITUDE_KEYS } from './chainRegistry.js';
import {
  PROSPECTIVE_DEFAULTS,
  PROSPECTIVE_ENGINE_VERSION,
  PROSPECTIVE_INSTRUMENT_KEYS,
  PROSPECTIVE_LIMITS,
  PROSPECTIVE_MARKER_KINDS,
} from './prospectiveRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTRUMENTS = new Set(PROSPECTIVE_INSTRUMENT_KEYS);
const ALTITUDES = new Set(ALTITUDE_KEYS);
const MARKER_KINDS = new Set(PROSPECTIVE_MARKER_KINDS);

function text(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function idOrNull(value, max = 80) {
  const result = text(value, max);
  return result || null;
}

function validDay(value) {
  const day = text(value, 10);
  if (!ISO_DAY_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : day;
}

function isoOrNull(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function boundedInt(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function pctOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(100, Math.max(0, number)) * 10) / 10;
}

function scoreOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(4, Math.max(0, number)) * 10000) / 10000;
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

export function normalizeProspectiveSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const L = PROSPECTIVE_LIMITS;
  return {
    prospectiveEvidenceFloor: boundedInt(source.prospectiveEvidenceFloor, L.evidenceFloorMin, L.evidenceFloorMax, PROSPECTIVE_DEFAULTS.prospectiveEvidenceFloor),
    prospectiveCellFloor: boundedInt(source.prospectiveCellFloor, L.cellFloorMin, L.cellFloorMax, PROSPECTIVE_DEFAULTS.prospectiveCellFloor),
    prospectiveSkillFloorPct: boundedInt(source.prospectiveSkillFloorPct, L.skillFloorMin, L.skillFloorMax, PROSPECTIVE_DEFAULTS.prospectiveSkillFloorPct),
    prospectiveReviewDays: boundedInt(source.prospectiveReviewDays, L.reviewDaysMin, L.reviewDaysMax, PROSPECTIVE_DEFAULTS.prospectiveReviewDays),
    prospectiveAutoPropagate: source.prospectiveAutoPropagate !== false,
  };
}

export function prospectiveConventions(rawSettings = {}) {
  return normalizeProspectiveSettings({ ...PROSPECTIVE_DEFAULTS, ...(rawSettings || {}) });
}

/** Validate a declaration input. Returns either a clean declaration or a refusal. */
export function validateProspectiveDeclaration(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const L = PROSPECTIVE_LIMITS;
  const instrumentKey = text(source.instrumentKey, 40);
  if (!INSTRUMENTS.has(instrumentKey)) return { ok: false, error: 'Choose one of the four declared observable instruments.', field: 'instrumentKey' };
  const probabilityPct = Number(source.probabilityPct);
  if (!Number.isFinite(probabilityPct) || probabilityPct < L.probabilityMin || probabilityPct > L.probabilityMax) {
    return { ok: false, error: `Declare a probability between ${L.probabilityMin}% and ${L.probabilityMax}%. A certainty of 0 or 100 has no calibration meaning.`, field: 'probabilityPct' };
  }
  const thresholdPct = Number(source.thresholdPct);
  if (!Number.isFinite(thresholdPct) || thresholdPct < L.thresholdMin || thresholdPct > L.thresholdMax) {
    return { ok: false, error: `Declare a threshold between ${L.thresholdMin}% and ${L.thresholdMax}%.`, field: 'thresholdPct' };
  }
  const horizonDays = Number(source.horizonDays);
  if (!Number.isInteger(horizonDays) || horizonDays < L.horizonDaysMin || horizonDays > L.horizonDaysMax) {
    return { ok: false, error: `The horizon must be a whole number of days between ${L.horizonDaysMin} and ${L.horizonDaysMax}.`, field: 'horizonDays' };
  }
  const title = text(source.title, L.titleMax);
  if (!title) return { ok: false, error: 'Name the bet in one short line so the governed decision can be read back.', field: 'title' };
  return {
    ok: true,
    declaration: {
      instrumentKey,
      probabilityPct: boundedInt(probabilityPct, L.probabilityMin, L.probabilityMax),
      thresholdPct: boundedInt(thresholdPct, L.thresholdMin, L.thresholdMax),
      horizonDays,
      title,
    },
  };
}

/** A frozen, immutable pre-registration. No status field: gradedness is derived. */
export function normalizeProspectiveContract(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const declaredOn = validDay(raw.declaredOn);
  const horizonOn = validDay(raw.horizonOn);
  const instrumentKey = text(raw.instrumentKey, 40);
  if (!id || !declaredOn || !horizonOn || horizonOn < declaredOn || !INSTRUMENTS.has(instrumentKey)) return null;
  const cohortIds = Array.isArray(raw.cohortIds)
    ? [...new Set(raw.cohortIds.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 80)))].slice(0, PROSPECTIVE_LIMITS.cohortCap)
    : [];
  if (!cohortIds.length) return null;
  const probabilityPct = boundedInt(raw.probabilityPct, PROSPECTIVE_LIMITS.probabilityMin, PROSPECTIVE_LIMITS.probabilityMax, 50);
  const thresholdPct = boundedInt(raw.thresholdPct, PROSPECTIVE_LIMITS.thresholdMin, PROSPECTIVE_LIMITS.thresholdMax, 50);
  return {
    id,
    title: text(raw.title, PROSPECTIVE_LIMITS.titleMax),
    declaredOn,
    horizonOn,
    scopeSeatId: idOrNull(raw.scopeSeatId),
    altitudeKey: ALTITUDES.has(raw.altitudeKey) ? raw.altitudeKey : null,
    rank: boundedInt(raw.rank, 1, 5, 1),
    instrumentKey,
    probabilityPct,
    thresholdPct,
    cohortN: cohortIds.length,
    cohortIds,
    cohortFingerprint: text(raw.cohortFingerprint, 40) || '',
    engineVersion: text(raw.engineVersion, 40) || PROSPECTIVE_ENGINE_VERSION,
    createdAt: isoOrNull(raw.createdAt) || `${declaredOn}T00:00:00.000Z`,
  };
}

export function normalizeProspectiveContracts(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('prospectiveContracts was not a list; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeProspectiveContract(item);
    if (!row) {
      warnings.push('prospectiveContracts: dropped a malformed frozen contract.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push('prospectiveContracts: dropped a duplicate contract id.');
      continue;
    }
    seen.add(row.id);
    out.push(row);
    if (out.length >= PROSPECTIVE_LIMITS.contracts) break;
  }
  out.sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

/** One immutable grade per contract, written once. */
export function normalizeProspectiveGrade(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const contractId = idOrNull(raw.contractId);
  const gradedOn = validDay(raw.gradedOn);
  if (!id || !contractId || !gradedOn) return null;
  const outcome = raw.outcome === 1 || raw.outcome === 0 ? raw.outcome : null;
  if (outcome === null) return null;
  const instrumentKey = text(raw.instrumentKey, 40);
  if (!INSTRUMENTS.has(instrumentKey)) return null;
  return {
    id,
    contractId,
    gradedOn,
    declaredOn: validDay(raw.declaredOn),
    horizonOn: validDay(raw.horizonOn),
    scopeSeatId: idOrNull(raw.scopeSeatId),
    altitudeKey: ALTITUDES.has(raw.altitudeKey) ? raw.altitudeKey : null,
    rank: boundedInt(raw.rank, 1, 5, 1),
    instrumentKey,
    probabilityPct: boundedInt(raw.probabilityPct, 0, 100, 50),
    thresholdPct: boundedInt(raw.thresholdPct, 0, 100, 50),
    cohortN: boundedInt(raw.cohortN, 0, PROSPECTIVE_LIMITS.cohortCap, 0),
    observedN: boundedInt(raw.observedN, 0, PROSPECTIVE_LIMITS.cohortCap, 0),
    reachedN: boundedInt(raw.reachedN, 0, PROSPECTIVE_LIMITS.cohortCap, 0),
    observedPct: pctOrNull(raw.observedPct),
    outcome,
    brier: scoreOrNull(raw.brier),
    baseRatePct: pctOrNull(raw.baseRatePct),
    referenceBrier: scoreOrNull(raw.referenceBrier),
    late: boolOrNull(raw.late) === true,
    engineVersion: text(raw.engineVersion, 40) || PROSPECTIVE_ENGINE_VERSION,
    createdAt: isoOrNull(raw.createdAt) || `${gradedOn}T00:00:00.000Z`,
  };
}

export function normalizeProspectiveGrades(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('prospectiveGrades was not a list; reset to [].');
    return [];
  }
  const seenContract = new Set();
  const seenId = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeProspectiveGrade(item);
    if (!row || seenId.has(row.id) || seenContract.has(row.contractId)) {
      warnings.push('prospectiveGrades: dropped a malformed or duplicate grade (one grade per contract).');
      continue;
    }
    seenId.add(row.id);
    seenContract.add(row.contractId);
    out.push(row);
    if (out.length >= PROSPECTIVE_LIMITS.grades) break;
  }
  out.sort((a, b) => String(a.gradedOn).localeCompare(String(b.gradedOn)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
}

export function normalizeProspectiveMarker(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const kind = text(raw.kind, 30);
  if (!id || !MARKER_KINDS.has(kind)) return null;
  return {
    id,
    kind,
    contractId: idOrNull(raw.contractId),
    gradeId: idOrNull(raw.gradeId),
    cellKey: idOrNull(raw.cellKey, 80),
    decisionId: idOrNull(raw.decisionId),
    taskId: idOrNull(raw.taskId),
    weekKey: idOrNull(raw.weekKey, 12),
    recordedOn: validDay(raw.recordedOn),
    note: text(raw.note, PROSPECTIVE_LIMITS.noteMax),
  };
}

export function normalizeProspectiveMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeProspectiveMarker(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= PROSPECTIVE_LIMITS.markers) break;
  }
  return out;
}
