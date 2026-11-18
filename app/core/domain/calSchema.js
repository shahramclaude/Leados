/**
 * app/core/domain/calSchema.js — the fail-closed storage contract of the
 * Performance Calibration Decision Register (ADR-0261, Schema v213).
 *
 * THREE COLLECTIONS, ALL EMPTY AT UPGRADE: `calSessions`, `calDecisions` and
 * the rule's `calMarkers`. Nothing derived is stored — no distribution, no
 * kappa, no bias ratio, no state, no day count. Each is recomputed on read,
 * because a stored distribution is a verdict that can disagree with the
 * sessions and decisions beside it, and the disagreement would surface as a
 * committee being told its distribution was balanced when the decisions say
 * otherwise.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents a session, completes a missing rationale, rescues a
 * decision with no session, upgrades a proposed rating to a calibrated one, or
 * rescues a row that names a person off the roster. A row that cannot be read
 * exactly is DROPPED with a counted warning, and the screen prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A SESSION carries the session reference, the cycle label as declared,
 *      the title, the scope as declared, the status from the closed vocabulary,
 *      the opened day, the closed day (for a closed session), the declared
 *      distribution target as declared text, one to four responsible hands, and
 *      the recording hand and instant. A status this register does not carry
 *      is DROPPED — the kind is the verdict, and a guessed one is a session
 *      nobody classified. The distribution target is optional: its absence is
 *      DERIVED as "no target declared", never repaired here.
 *   2. A DECISION carries the session, the person, the review, the proposed
 *      rating and the calibrated rating from the closed vocabulary, the written
 *      rationale, the deciding hand and the decided day and instant. ONE per
 *      (session, person). A decision with no rationale is DROPPED — a
 *      calibration nobody justified is an overwrite, not a decision.
 *   3. A MARKER is the rule's identity-free observation. It carries the
 *      condition, the session reference and the instant. No person, no rating,
 *      no rationale.
 *
 * A NOTE ON WHAT IS NOT DROPPED. A session or decision whose responsible hands
 * are no longer on the roster is NOT dropped here — the reader prints it as an
 * orphan with its reason, because dropping it would silently delete a live
 * calibration duty from the record. A child row pointing at a parent that does
 * not exist IS dropped: a decision cannot be attached to a session that was
 * never recorded.
 */

import { dayKey } from '../time.js';
import {
  CAL_BOUNDS,
  CAL_DEFAULTS,
  CAL_LIMITS as L,
  CAL_RATING_BY_KEY,
  CAL_SESSION_STATUS_BY_KEY,
  CAL_SETTING_KEYS,
} from './calRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

export function calDayKey(value) {
  const candidate = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return DAY_RE.test(candidate) ? candidate : null;
}

export function calInstant(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function calShort(value, max = L.shortMax) {
  const candidate = text(value, max + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, max);
}

export function calHolders(value) {
  const raw = list(value);
  const out = [];
  for (const entry of raw) {
    const candidate = id(entry);
    if (candidate && !out.includes(candidate)) out.push(candidate);
    if (out.length >= L.holdersMax) break;
  }
  return out;
}

export function normalizeCalSessions(raw, warnings = []) {
  const out = [];
  const seen = new Set();
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('calSessions: dropped non-object row'); continue; }
    const sessionId = id(row.sessionId || row.id);
    const cycle = text(row.cycle, L.cycleMax);
    const title = text(row.title, L.titleMax);
    const scope = text(row.scope, L.scopeMax);
    const status = text(row.status);
    const openedOn = calDayKey(row.openedOn);
    const closedOn = row.closedOn === null || row.closedOn === undefined ? null : calDayKey(row.closedOn);
    const declaredDistribution = text(row.declaredDistribution, L.distributionMax);
    const holders = calHolders(row.holders || row.responsibleHands);
    const createdBy = id(row.createdBy);
    const createdAt = calInstant(row.createdAt);
    if (!sessionId || !cycle || !title || !CAL_SESSION_STATUS_BY_KEY[status] || !openedOn || holders.length < L.holdersMin || !createdBy || !createdAt) {
      warnings.push('calSessions: dropped session with missing reference, cycle, title, status, opened day, holders or recording hand');
      continue;
    }
    if (status === 'closed' && !closedOn) {
      warnings.push('calSessions: dropped closed session with no closed day');
      continue;
    }
    if (status === 'open' && closedOn) {
      warnings.push('calSessions: dropped open session with a closed day');
      continue;
    }
    if (seen.has(sessionId)) { warnings.push(`calSessions: dropped duplicate session ${sessionId}`); continue; }
    seen.add(sessionId);
    out.push({
      sessionId,
      cycle,
      title,
      scope,
      status,
      openedOn,
      closedOn,
      declaredDistribution,
      holders,
      createdBy,
      createdAt,
    });
  }
  return out;
}

export function normalizeCalDecisions(raw, sessions, warnings = []) {
  const out = [];
  const sessionIds = new Set(list(sessions).map((s) => s.sessionId));
  const seen = new Set();
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('calDecisions: dropped non-object row'); continue; }
    const decisionId = id(row.decisionId || row.id);
    const sessionId = id(row.sessionId);
    const personId = id(row.personId);
    const reviewId = id(row.reviewId);
    const proposedRating = text(row.proposedRating);
    const calibratedRating = text(row.calibratedRating);
    const rationale = text(row.rationale, L.rationaleMax);
    const decidedBy = id(row.decidedBy);
    const decidedOn = calDayKey(row.decidedOn);
    const decidedAt = calInstant(row.decidedAt);
    if (!decisionId || !sessionId || !personId || !reviewId || !CAL_RATING_BY_KEY[proposedRating] || !CAL_RATING_BY_KEY[calibratedRating] || !rationale || !decidedBy || !decidedOn || !decidedAt) {
      warnings.push('calDecisions: dropped decision with missing session, person, review, ratings, rationale, deciding hand or decided day');
      continue;
    }
    if (!sessionIds.has(sessionId)) { warnings.push(`calDecisions: dropped decision ${decisionId} naming no live session`); continue; }
    const key = `${sessionId}:${personId}`;
    if (seen.has(key)) { warnings.push(`calDecisions: dropped duplicate decision for ${key}`); continue; }
    seen.add(key);
    out.push({
      decisionId,
      sessionId,
      personId,
      reviewId,
      proposedRating,
      calibratedRating,
      rationale,
      decidedBy,
      decidedOn,
      decidedAt,
    });
  }
  return out;
}

export function normalizeCalMarkers(raw, warnings = []) {
  const out = [];
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('calMarkers: dropped non-object row'); continue; }
    const markerId = id(row.markerId || row.id);
    const condition = text(row.condition);
    const sessionId = id(row.sessionId);
    const at = calInstant(row.at || row.createdAt);
    if (!markerId || !condition || !sessionId || !at) { warnings.push('calMarkers: dropped marker with missing id, condition, session or instant'); continue; }
    out.push({ markerId, condition, sessionId, at });
  }
  return out;
}

export function normalizeCalSettings(raw = {}) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  const auto = source[CAL_SETTING_KEYS.autoPropagate];
  out[CAL_SETTING_KEYS.autoPropagate] = auto === undefined ? CAL_DEFAULTS.autoPropagate : Boolean(auto);
  const floorRaw = source[CAL_SETTING_KEYS.privacyFloor];
  const floorNum = Math.round(Number(floorRaw));
  out[CAL_SETTING_KEYS.privacyFloor] = Number.isFinite(floorNum)
    ? Math.min(CAL_BOUNDS.privacyFloor.max, Math.max(CAL_BOUNDS.privacyFloor.min, floorNum))
    : CAL_DEFAULTS.privacyFloor;
  const horizonRaw = source[CAL_SETTING_KEYS.warnHorizonDays];
  const horizonNum = Math.round(Number(horizonRaw));
  out[CAL_SETTING_KEYS.warnHorizonDays] = Number.isFinite(horizonNum)
    ? Math.min(CAL_BOUNDS.warnHorizonDays.max, Math.max(CAL_BOUNDS.warnHorizonDays.min, horizonNum))
    : CAL_DEFAULTS.warnHorizonDays;
  return out;
}

export function calSettings(state) {
  return normalizeCalSettings(state?.settings || {});
}

export function calToday(now) {
  return dayKey(now instanceof Date ? now : new Date(now || Date.now()));
}
