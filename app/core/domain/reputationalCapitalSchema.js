/**
 * app/core/domain/reputationalCapitalSchema.js — the stored contract for Schema
 * v103 (ADR-0101, the Reputational Capital Ledger).
 *
 * `reputationalCapital.js` is the analysis; this module decides what a
 * half-written, hand-edited or older record is allowed to become on load. The
 * rules follow every other ledger in this app:
 *
 *  - **A recorded act survives exactly.** Its class, date, status and source are
 *    preserved. A malformed row is dropped with a warning; it is never repaired
 *    into a completed act a reader might act on.
 *  - **A derived act is never hand-edited.** `derived: true` rows are produced by
 *    the harvester from records other modules own; a hand-typed twin of the same
 *    source is rejected so the ledger cannot count the same work twice.
 *  - **Conventions are declared, clamped and printed.** The window, floors,
 *    gamma, breach weight, half-life, ask and coverage are conventions with
 *    defaults — never fitted values pretending to be findings.
 *  - **No free text is invented.** A dropped row leaves a warning naming the id
 *    prefix only; it never echoes the note it refused.
 */

import { dayKey } from '../time.js';
import {
  ACT_CLASS_KEYS,
  ACT_STATUSES,
  ENGAGEMENT_TIER_KEYS,
  POSITION_KINDS,
  POSITION_STATUSES,
  REPUTATION_DEFAULTS,
  REPUTATION_LIMITS,
} from './reputationalCapitalRegistry.js';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clean(text, max) {
  return str(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ---------------------------------------------------------- conventions */

/**
 * The declared class hazard rates — the α0/β0 anchor every cell starts from.
 * These are CONVENTIONS chosen so the anchor is visible, not estimates. The
 * screen prints them in the same table as the record so a reader can see what
 * the prior contributed.
 */
export const DEFAULT_CLASS_HAZARD = Object.freeze({
  delivery: 15,
  custody: 10,
  calibration: 35,
  stewardship: 25,
  continuity: 20,
  allocation: 20,
  forecast: 30,
  contribution: 5,
});

export function normalizeReputationSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = REPUTATION_DEFAULTS;
  const hazardRaw = isPlainObject(s.reputationClassHazard) ? s.reputationClassHazard : {};
  const classHazard = {};
  for (const key of ACT_CLASS_KEYS) {
    classHazard[key] = clampInt(hazardRaw[key], 1, 99, DEFAULT_CLASS_HAZARD[key]);
  }
  return {
    reputationWindowDays: clampInt(s.reputationWindowDays, REPUTATION_LIMITS.windowDaysMin, REPUTATION_LIMITS.windowDaysMax, d.reputationWindowDays),
    reputationActFloor: clampInt(s.reputationActFloor, REPUTATION_LIMITS.actFloorMin, REPUTATION_LIMITS.actFloorMax, d.reputationActFloor),
    reputationExposureFloor: clampInt(s.reputationExposureFloor, REPUTATION_LIMITS.exposureFloorMin, REPUTATION_LIMITS.exposureFloorMax, d.reputationExposureFloor),
    reputationObstacleGamma: clampNum(s.reputationObstacleGamma, 0, REPUTATION_LIMITS.premiumGammaMax, d.reputationObstacleGamma),
    reputationBreachBp: clampInt(s.reputationBreachBp, REPUTATION_LIMITS.breachBpMin, REPUTATION_LIMITS.breachBpMax, d.reputationBreachBp),
    reputationHalfLifeDays: clampInt(s.reputationHalfLifeDays, REPUTATION_LIMITS.halfLifeMin, REPUTATION_LIMITS.halfLifeMax, d.reputationHalfLifeDays),
    reputationAskActs: clampInt(s.reputationAskActs, REPUTATION_LIMITS.askActsMin, REPUTATION_LIMITS.askActsMax, d.reputationAskActs),
    reputationCoveragePct: clampInt(s.reputationCoveragePct, REPUTATION_LIMITS.coverageMin, REPUTATION_LIMITS.coverageMax, d.reputationCoveragePct),
    reputationPublishedCellFloor: clampInt(s.reputationPublishedCellFloor, 2, 10, REPUTATION_LIMITS.publishedCellFloor),
    reputationClassHazard: classHazard,
    reputationAutoPropagate: s.reputationAutoPropagate !== false,
  };
}

export function reputationConventions(rawSettings = {}) {
  return normalizeReputationSettings(rawSettings);
}

/* ---------------------------------------------------------------- acts */

/**
 * Fail-closed act normalizer.
 *
 * A derived act is regenerated on every read from the source record, so a stored
 * derived row is DROPPED here: keeping it would let a source record that has
 * since changed (a delegation reopened, a mandate revoked) leave behind a stale
 * "kept" act that still spends reputational capital. Only human-entered rows
 * survive, because only they have no other home.
 */
export function normalizeReputationActs(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const today = dayKey(now);
  const seen = new Set();
  const out = [];
  let derivedDropped = 0;
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    if (row.derived === true) {
      derivedDropped += 1;
      continue;
    }
    const id = clean(row.id, 80);
    if (!id || seen.has(id)) {
      if (id) warnings.push(`Reputation act: duplicate id "${id.slice(0, 12)}…" dropped`);
      continue;
    }
    const personId = clean(row.personId, 80);
    const actClass = ACT_CLASS_KEYS.includes(row.actClass) ? row.actClass : null;
    const status = ACT_STATUSES.includes(row.status) ? row.status : null;
    const on = day(row.on);
    if (!personId || !actClass || !status || !on) {
      warnings.push(`Reputation act: "${id.slice(0, 12)}…" has no person, class, status or date; dropped`);
      continue;
    }
    if (on > today) {
      warnings.push(`Reputation act: a future-dated act was dropped`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      personId,
      actClass,
      status,
      on,
      derived: false,
      sourceType: clean(row.sourceType, 40) || 'manual',
      sourceId: clean(row.sourceId, 80) || null,
      recordedBy: clean(row.recordedBy, 80) || null,
      createdAt: isoOrNull(row.createdAt),
    });
  }
  if (derivedDropped) {
    warnings.push(`Reputation acts: dropped ${derivedDropped} stored derived act(s) — they are re-harvested from their source records on every read, so a stored copy would go stale and keep spending capital the source no longer supports`);
  }
  return out.slice(-REPUTATION_LIMITS.acts);
}

/* ----------------------------------------------------------- positions */

/**
 * Fail-closed position normalizer. A guarantee or repair without a person, a
 * class, a tier, an opened date or a due date is dropped: an undated position is
 * a promise nobody can be held to, which is exactly what this ledger exists to
 * price.
 */
export function normalizeReputationPositions(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const today = dayKey(now);
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 80);
    if (!id || seen.has(id)) continue;
    const personId = clean(row.personId, 80);
    const actClass = ACT_CLASS_KEYS.includes(row.actClass) ? row.actClass : null;
    const kind = POSITION_KINDS.includes(row.kind) ? row.kind : null;
    const tier = ENGAGEMENT_TIER_KEYS.includes(row.tier) ? row.tier : 'vouching';
    const status = POSITION_STATUSES.includes(row.status) ? row.status : 'open';
    const openedOn = day(row.openedOn);
    const dueOn = day(row.dueOn);
    if (!personId || !actClass || !kind || !openedOn) {
      warnings.push(`Reputation position: "${id.slice(0, 12)}…" has no person, class, kind or opening date; dropped`);
      continue;
    }
    if (openedOn > today) {
      warnings.push('Reputation position: a future-dated position was dropped');
      continue;
    }
    if (dueOn && dueOn < openedOn) {
      warnings.push(`Reputation position: "${id.slice(0, 12)}…" is due before it opened; dropped`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      personId,
      actClass,
      kind,
      tier,
      status,
      openedOn,
      dueOn,
      askActs: clampInt(row.askActs, REPUTATION_LIMITS.askActsMin, REPUTATION_LIMITS.askActsMax, 0),
      closedOn: day(row.closedOn),
      outcome: ['kept', 'breached', 'withdrawn'].includes(row.outcome) ? row.outcome : null,
      // Provenance: the guarantee may rest on a decision, and a repair on a
      // breach. Ids only; no note and no rationale is copied here.
      decisionId: clean(row.decisionId, 80) || null,
      breaksActId: clean(row.breaksActId, 80) || null,
      openedBy: clean(row.openedBy, 80) || null,
      createdAt: isoOrNull(row.createdAt),
    });
  }
  return out.slice(-REPUTATION_LIMITS.positions);
}

/* ------------------------------------------------------------- markers */

export function normalizeReputationMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: clean(row.kind, 40) || 'unknown',
      key: clean(row.key, 240),
      personId: clean(row.personId, 80) || null,
      actClass: ACT_CLASS_KEYS.includes(row.actClass) ? row.actClass : null,
      decisionId: clean(row.decisionId, 80) || null,
      positionId: clean(row.positionId, 80) || null,
      weekKey: clean(row.weekKey, 20) || null,
      recordedOn: day(row.recordedOn),
      note: clean(row.note, 300),
    });
  }
  return out.slice(-REPUTATION_LIMITS.markers);
}
