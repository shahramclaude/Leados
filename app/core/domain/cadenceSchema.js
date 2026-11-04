/**
 * app/core/domain/cadenceSchema.js — fail-closed normalizers for the Operating
 * Cadence Clock collections and conventions (Schema v91, ADR-0085).
 *
 * Malformed rows are dropped with an explicit warning rather than coerced into
 * half-valid records; out-of-range settings clamp to declared bounds. A forum
 * with no interval, an item with no class, and a reading with no frozen figure
 * are all refused, because each would otherwise silently widen a capacity
 * number that a leader is about to make a staffing decision on.
 */

import { ALTITUDE_KEYS, altitudeByKey } from './chainRegistry.js';
import {
  CADENCE_BOUNDS,
  CADENCE_DEFAULTS,
  CADENCE_LIMITS,
  FORUM_CADENCES,
  FORUM_CADENCE_DAYS,
  FORUM_KINDS,
  FORUM_STATUSES,
  INPUT_CLASS_KEYS,
  SESSION_STATUSES,
  TOPOLOGY_PATTERNS,
} from './cadenceRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v, max = 240) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function idOrNull(v) {
  const s = str(v, 80);
  return s || null;
}

function dayOrNull(v) {
  const s = str(v, 10);
  if (!ISO_DAY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

function isoOrFallback(v, fallback = '1970-01-01T00:00:00.000Z') {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function clampNum(v, [lo, hi], fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function intOrNull(v, [lo, hi]) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

function minOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function pctOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

function idList(raw, cap = 40) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = idOrNull(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

/* ---------------------------------------------------------------- settings */

export function normalizeCadenceSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    cadenceFloorN: Math.round(clampNum(
      s.cadenceFloorN,
      CADENCE_BOUNDS.cadenceFloorN,
      CADENCE_DEFAULTS.cadenceFloorN,
    )),
    cadenceCellFloor: Math.round(clampNum(
      s.cadenceCellFloor,
      CADENCE_BOUNDS.cadenceCellFloor,
      CADENCE_DEFAULTS.cadenceCellFloor,
    )),
    cadenceUtilisationTargetPct: Math.round(clampNum(
      s.cadenceUtilisationTargetPct,
      CADENCE_BOUNDS.cadenceUtilisationTargetPct,
      CADENCE_DEFAULTS.cadenceUtilisationTargetPct,
    )),
    cadencePlanningFactorPct: Math.round(clampNum(
      s.cadencePlanningFactorPct,
      CADENCE_BOUNDS.cadencePlanningFactorPct,
      CADENCE_DEFAULTS.cadencePlanningFactorPct,
    )),
    cadenceFlowTargetDays: Math.round(clampNum(
      s.cadenceFlowTargetDays,
      CADENCE_BOUNDS.cadenceFlowTargetDays,
      CADENCE_DEFAULTS.cadenceFlowTargetDays,
    )),
    cadenceAutoPropagate: s.cadenceAutoPropagate !== false,
  };
}

/* ------------------------------------------------------------------ forums */

export function normalizeCadenceForum(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const title = str(raw.title, 160);
  if (!id || !title) return null;
  if (!FORUM_KINDS.includes(raw.kind)) return null;
  if (!FORUM_CADENCES.includes(raw.cadence)) return null;
  if (!FORUM_STATUSES.includes(raw.status)) return null;

  const altitudeKey = ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : 'manager';
  const alt = altitudeByKey(altitudeKey);
  const horizonDays = Number.isInteger(raw.horizonDays) && raw.horizonDays > 0
    ? Math.min(730, raw.horizonDays)
    : (alt ? alt.horizonDays : 30);
  const intervalDays = FORUM_CADENCE_DAYS[raw.cadence];
  const decisionCapacity = intOrNull(raw.decisionCapacity, [1, 40]) ?? 3;
  const serviceDays = minOrNull(raw.serviceDays) ?? Math.max(1, Math.round(intervalDays * 0.5 * 10) / 10);
  const attending = idList(raw.attending, 40);
  const chairSeatId = idOrNull(raw.chairSeatId);
  if (!chairSeatId) return null;

  const createdAt = isoOrFallback(raw.createdAt);
  const updatedAt = isoOrFallback(raw.updatedAt, createdAt);

  return {
    id,
    title,
    purpose: str(raw.purpose, 400),
    kind: raw.kind,
    cadence: raw.cadence,
    intervalDays,
    // The forum's time-span of discretion. An item needing a longer horizon is
    // not this forum's to close, whatever its kind claims.
    horizonDays,
    altitudeKey,
    // `ownerId` mirrors the chair so `seat.js` (`recordPeople`) scopes the row
    // to that span and its leadership ancestors and denies sideways peer spans.
    ownerId: chairSeatId,
    chairSeatId,
    attending,
    /** Declarative: how many binding decisions one sitting can actually produce. */
    decisionCapacity,
    /** Declarative: nominal elapsed days from agenda lock to a closed decision. */
    serviceDays,
    stakes: raw.stakes === 'high' ? 'high' : 'normal',
    agendaRule: str(raw.agendaRule, 240),
    status: raw.status,
    lastHeldOn: dayOrNull(raw.lastHeldOn),
    createdAt,
    updatedAt,
  };
}

export function normalizeCadenceForums(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('cadenceForums was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeCadenceForum(item);
    if (!row) {
      warnings.push('cadenceForums: dropped a malformed forum record (kind, cadence, status and chair are required).');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`cadenceForums: dropped duplicate id "${row.id}".`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(-CADENCE_LIMITS.forums);
}

/* ---------------------------------------------------------------- sittings */

export function normalizeCadenceSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const forumId = idOrNull(raw.forumId);
  const heldOn = dayOrNull(raw.heldOn);
  if (!id || !forumId || !heldOn) return null;
  if (!SESSION_STATUSES.includes(raw.status)) return null;

  const capacity = intOrNull(raw.decisionCapacity, [0, 40]) ?? 0;
  const createdAt = isoOrFallback(raw.createdAt);

  return {
    id,
    forumId,
    heldOn,
    status: raw.status,
    // Declared once and frozen: the capacity that was in force at the sitting, so
    // a later edit of the forum cannot retroactively make history look slack.
    decisionCapacity: capacity,
    plannedN: intOrNull(raw.plannedN, [0, 200]) ?? 0,
    /** Items actually closed at THIS sitting — the measured service output. */
    closedN: intOrNull(raw.closedN, [0, 200]) ?? 0,
    closedClassKeys: idList(raw.closedClassKeys, INPUT_CLASS_KEYS.length).filter((k) => INPUT_CLASS_KEYS.includes(k)),
    attendeeIds: idList(raw.attendeeIds, 40),
    minutes: intOrNull(raw.minutes, [0, 1440]),
    note: str(raw.note, 400),
    /** Chair's own submitted estimate at agenda lock (planning-fallacy input). */
    estimatedServiceDays: minOrNull(raw.estimatedServiceDays),
    ownerId: idOrNull(raw.ownerId) || null,
    createdAt,
  };
}

export function normalizeCadenceSessions(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('cadenceSessions was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeCadenceSession(item);
    if (!row) {
      warnings.push('cadenceSessions: dropped a malformed sitting record (forum and date are required).');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`cadenceSessions: dropped duplicate id "${row.id}".`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(-CADENCE_LIMITS.sessions);
}

/* -------------------------------------------------------------- frozen clock */

/**
 * A reading is a frozen forecast about the *governance machine*, never about a
 * person: per-forum utilisation, flow time, breach probability and the constraint
 * that was binding on the day it froze, plus one prospective claim that is graded
 * afterwards. Nothing person-level is carried.
 */
export function normalizeCadenceReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const frozenOn = dayOrNull(raw.frozenOn);
  if (!id || !frozenOn) return null;

  const forums = Array.isArray(raw.forums)
    ? raw.forums.filter((f) => f && typeof f === 'object').slice(0, CADENCE_LIMITS.forums).map((f) => ({
      forumId: idOrNull(f.forumId) || '',
      title: str(f.title, 160),
      kind: FORUM_KINDS.includes(f.kind) ? f.kind : 'operating-review',
      cadence: FORUM_CADENCES.includes(f.cadence) ? f.cadence : 'weekly',
      intervalDays: minOrNull(f.intervalDays),
      demandDays: minOrNull(f.demandDays),
      capacityDays: minOrNull(f.capacityDays),
      rho: minOrNull(f.rho),
      queueN: intOrNull(f.queueN, [0, 10000]),
      flowDays: minOrNull(f.flowDays),
      breachPct: pctOrNull(f.breachPct),
      verdict: str(f.verdict, 24) || 'unmeasured',
      bindingClassKey: INPUT_CLASS_KEYS.includes(f.bindingClassKey) ? f.bindingClassKey : null,
      topology: TOPOLOGY_PATTERNS.includes(f.topology) ? f.topology : 'unmodelled',
    }))
    : [];

  return {
    id,
    frozenOn,
    engineVersion: str(raw.engineVersion, 40) || '',
    forums,
    constraint: forums.length
      ? {
        forumId: idOrNull(raw.constraint?.forumId),
        title: str(raw.constraint?.title, 160),
        type: str(raw.constraint?.type, 40) || 'none',
        detail: str(raw.constraint?.detail, 400),
        rho: minOrNull(raw.constraint?.rho),
      }
      : null,
    workspaceRho: minOrNull(raw.workspaceRho),
    unreviewableN: intOrNull(raw.unreviewableN, [0, 100000]),
    /** The one prospective claim this reading makes, graded afterwards. */
    prediction: raw.prediction && typeof raw.prediction === 'object'
      ? {
        forumId: idOrNull(raw.prediction.forumId),
        probabilityPct: pctOrNull(raw.prediction.probabilityPct),
        claim: str(raw.prediction.claim, 300),
        dueOn: dayOrNull(raw.prediction.dueOn),
      }
      : null,
    grade: raw.grade && typeof raw.grade === 'object'
      ? {
        gradedOn: dayOrNull(raw.grade.gradedOn),
        outcome: raw.grade.outcome === 'held' ? 'held' : raw.grade.outcome === 'failed' ? 'failed' : null,
        observedDays: minOrNull(raw.grade.observedDays),
        note: str(raw.grade.note, 300),
      }
      : null,
    ownerId: idOrNull(raw.ownerId) || null,
    createdAt: isoOrFallback(raw.createdAt),
  };
}

export function normalizeCadenceReadings(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('cadenceReadings was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeCadenceReading(item);
    if (!row) {
      warnings.push('cadenceReadings: dropped a malformed frozen reading.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`cadenceReadings: dropped duplicate id "${row.id}".`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(-CADENCE_LIMITS.readings);
}

/* ----------------------------------------------------------------- markers */

export function normalizeCadenceMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const key = str(item.key || item.id, 160);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: idOrNull(item.id) || `cdm-${out.length + 1}`,
      key,
      kind: str(item.kind, 40) || 'advisory',
      recordedOn: dayOrNull(item.recordedOn) || '1970-01-01',
      summary: str(item.summary, 240),
    });
  }
  return out.slice(-CADENCE_LIMITS.markers);
}
