/**
 * app/core/domain/loneWorkingSchema.js — the fail-closed storage contract of the
 * Lone-Working Welfare Check Register (ADR-0242, Schema v196).
 *
 * FOUR COLLECTIONS, ALL EMPTY AT UPGRADE: `lwkDeployments`, `lwkCheckins`,
 * `lwkEscalations` and the rule's `lwkMarkers`. Nothing derived is stored — no
 * state, no deadline, no lateness, no overrun, no confirmation verdict. Every one
 * of those is recomputed on read, because a deadline written into a file is a
 * deadline that can disagree with the interval beside it, and the disagreement
 * would surface as a supervisor believing somebody was checked on.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here completes a missing site, repairs an interval, guesses which
 * deployment a contact belongs to, re-dates a close, or rescues a row that names
 * a person off the roster. A row that cannot be read exactly is DROPPED with a
 * counted warning, and the screen prints the count.
 *
 * THE FIVE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A deployment with NO WRITTEN PROTOCOL REFERENCE is DROPPED. Sending
 *      somebody out alone is a decision taken against an assessment; a
 *      deployment nobody can trace to one is exactly the plausible default the
 *      Bulletproof Reliability Mandate forbids.
 *   2. A deployment whose INTERVAL is not a whole number of minutes inside the
 *      declared bounds is DROPPED. A repaired interval would produce a deadline
 *      no human ever set, and the whole register is a timer running against that
 *      deadline.
 *   3. A CLOSE ARRIVES WHOLE OR NOT AT ALL: a closed instant without an outcome,
 *      an outcome without an instant, or either without the hand that recorded it,
 *      is unreadable. A half-closed deployment is one the reader could print as
 *      both open and closed depending on which field it looked at.
 *   4. A contact or an escalation is admitted only through a deployment this
 *      loader was handed, and never before that deployment's declared start, so a
 *      hand-edited file cannot invent a contact that pre-dates the deployment it
 *      supposedly reassured.
 *   5. TWO CONTACTS AT THE SAME INSTANT ARE ONE CONTACT. The later row is
 *      dropped rather than counted twice, because a doubled contact would inflate
 *      the only figure this register prints about how often anybody checked.
 */

import { LWK_BOUNDS, LWK_CHANNEL_KEYS, LWK_CHECKIN_OUTCOME_KEYS, LWK_CLOSE_OUTCOME_KEYS, LWK_DEFAULTS, LWK_ESCALATION_BASIS_KEYS, LWK_ESCALATION_OUTCOME_KEYS, LWK_LIMITS as L, LWK_SETTING_KEYS } from './loneWorkingRegistry.js';
import { instantMs } from './loneWorkingMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function lwkInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A short declared thing — a site reference or a task: bounded and non-empty. */
export function lwkShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** The written protocol reference a deployment is declared against. */
export function lwkProtocol(value) {
  const candidate = text(value, L.textMax + 40);
  if (candidate.length < L.protocolMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A written basis, bounded. Used for escalations and close notes. */
export function lwkReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** The declared check-in interval in whole minutes, or null. Never rounded. */
export function lwkInterval(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.intervalMin || value > L.intervalMax) return null;
  return value;
}

/** The declared grace in whole minutes, or null. `0` is a legitimate declaration. */
export function lwkGrace(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > L.graceMax) return null;
  return value;
}

/* ------------------------------------------------------------ deployments */

/**
 * Deployments. A row that cannot be read exactly is DROPPED with a counted
 * warning: no re-dating, no repaired interval, no invented protocol, no
 * half-closed deployment.
 *
 * A deployment whose named person is not on the roster is NOT dropped here — the
 * reader prints it as an orphan with its reason, exactly as the assurance,
 * probation and workplace-adjustment registers do, because dropping it would
 * silently delete a live welfare duty from the record.
 */
export function normalizeLwkDeployments(rows, warnings = []) {
  const warn = (message) => warnings.push(`[lone-working] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the deployment ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.deployments) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const personId = id(row.personId);
    const lineManagerId = id(row.lineManagerId);
    const siteRef = lwkShort(row.siteRef);
    const task = lwkShort(row.task);
    const protocolRef = lwkProtocol(row.protocolRef);
    const intervalMinutes = lwkInterval(row.intervalMinutes);
    const graceMinutes = lwkGrace(row.graceMinutes);
    const startAt = lwkInstant(row.startAt);
    const expectedEndAt = lwkInstant(row.expectedEndAt);
    const declaredById = id(row.declaredById);
    const closedAt = row.closedAt === null || row.closedAt === undefined || row.closedAt === '' ? null : lwkInstant(row.closedAt);
    const closeOutcome = row.closeOutcome ? (LWK_CLOSE_OUTCOME_KEYS.includes(row.closeOutcome) ? row.closeOutcome : null) : null;
    const closedById = row.closedById ? id(row.closedById) : null;

    if (!rowId || seen.has(rowId) || !personId || !lineManagerId || !siteRef || !task || !protocolRef
      || intervalMinutes === null || graceMinutes === null || !startAt || !expectedEndAt || !declaredById) {
      dropped += 1;
      continue;
    }
    // A span that is empty, reversed or longer than the declared bound is not a
    // deployment, and a deadline cannot be computed from it.
    const startMs = instantMs(startAt);
    const endMs = instantMs(expectedEndAt);
    if (endMs <= startMs) { dropped += 1; continue; }
    if ((endMs - startMs) / 60_000 > L.spanMaxMinutes) { dropped += 1; continue; }

    // Close fields arrive whole or not at all.
    const closeFields = [closedAt, closeOutcome, closedById];
    const closePresent = closeFields.filter((value) => value !== null).length;
    if (closePresent !== 0 && closePresent !== 3) { dropped += 1; continue; }
    if (closedAt && instantMs(closedAt) < startMs) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      personId,
      lineManagerId,
      siteRef,
      task,
      protocolRef,
      intervalMinutes,
      graceMinutes,
      startAt,
      expectedEndAt,
      declaredById,
      closedAt,
      closeOutcome,
      closedById,
      closeNote: closedAt ? text(row.closeNote, L.textMax) : '',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} deployment row(s) could not be read exactly — an unreadable person, line, site, task, protocol reference, interval, grace, instant or close-out — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------- check-ins */

/**
 * Contacts. A contact is admitted only through a deployment this loader was
 * handed, and never before that deployment's declared start. Two contacts at the
 * same instant are one contact: the second is dropped, not counted.
 */
export function normalizeLwkCheckins(rows, deployments = [], warnings = []) {
  const warn = (message) => warnings.push(`[lone-working] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the contact ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(deployments).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const instants = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.checkins) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const deploymentId = id(row.deploymentId);
    const parent = deploymentId ? parents.get(deploymentId) : null;
    const at = lwkInstant(row.at);
    const channel = LWK_CHANNEL_KEYS.includes(row.channel) ? row.channel : null;
    const outcome = LWK_CHECKIN_OUTCOME_KEYS.includes(row.outcome) ? row.outcome : null;
    const recordedById = id(row.recordedById);

    if (!rowId || seen.has(rowId) || !parent || !at || !channel || !outcome || !recordedById) {
      dropped += 1;
      continue;
    }
    if (instantMs(at) < instantMs(parent.startAt)) { dropped += 1; continue; }
    const pair = `${deploymentId}::${at}`;
    if (instants.has(pair)) { dropped += 1; continue; }

    seen.add(rowId);
    instants.add(pair);
    out.push({
      id: rowId,
      deploymentId,
      at,
      channel,
      outcome,
      recordedById,
      note: text(row.note, L.textMax),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} contact row(s) could not be read exactly — an unknown deployment, an unreadable instant, channel, outcome or recorded-by, a contact before the deployment started, or a second contact at the same instant — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------- escalations */

/**
 * Escalations. The response to a failed contact, recorded by the hand that made
 * it. Admitted only through a deployment this loader was handed and never before
 * that deployment's declared start.
 */
export function normalizeLwkEscalations(rows, deployments = [], warnings = []) {
  const warn = (message) => warnings.push(`[lone-working] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the escalation ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(deployments).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.escalations) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const deploymentId = id(row.deploymentId);
    const parent = deploymentId ? parents.get(deploymentId) : null;
    const raisedAt = lwkInstant(row.raisedAt);
    const raisedById = id(row.raisedById);
    const basis = LWK_ESCALATION_BASIS_KEYS.includes(row.basis) ? row.basis : null;
    const outcome = LWK_ESCALATION_OUTCOME_KEYS.includes(row.outcome) ? row.outcome : null;
    const detail = lwkReason(row.detail);

    if (!rowId || seen.has(rowId) || !parent || !raisedAt || !raisedById || !basis || !outcome || !detail) {
      dropped += 1;
      continue;
    }
    if (instantMs(raisedAt) < instantMs(parent.startAt)) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      deploymentId,
      raisedAt,
      raisedById,
      basis,
      outcome,
      detail,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} escalation row(s) could not be read exactly — an unknown deployment, an unreadable instant, seat, basis or outcome, a missing written detail, or an escalation before the deployment started — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------------ markers */

/** Identity-free rule markers: unique keys, capped, never repaired. */
export function normalizeLwkMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[lone-working] ${message}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) { warn('a marker row was not an object and was dropped'); continue; }
    const key = id(row.key, 240);
    if (!key || seen.has(key)) continue;
    if (typeof row.detail !== 'string' || !row.detail.trim()) continue;
    seen.add(key);
    out.push({
      key,
      at: typeof row.at === 'string' ? row.at : '',
      ruleId: id(row.ruleId, 60) || '',
      kind: id(row.kind, 60) || 'lone-working',
      detail: row.detail.trim().slice(0, 400),
    });
  }
  if (out.length > L.markers) out.splice(0, out.length - L.markers);
  return out;
}

/* ----------------------------------------------------------------- settings */

const clampBound = (value, bound, fallback) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < bound.min) return bound.min;
  if (n > bound.max) return bound.max;
  return n;
};

/**
 * The register's conventions, clamped on load and REFUSED (never clamped) by the
 * setter. Keyed by the FULL setting keys they are persisted under, exactly as
 * every register in this workspace keys its own switches: a key missing here is a
 * switch that cannot be recorded.
 */
export function normalizeLwkSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [LWK_SETTING_KEYS.autoPropagate]: s[LWK_SETTING_KEYS.autoPropagate] !== false,
    [LWK_SETTING_KEYS.privacyFloor]: clampBound(s[LWK_SETTING_KEYS.privacyFloor], LWK_BOUNDS.privacyFloor, LWK_DEFAULTS.privacyFloor),
    [LWK_SETTING_KEYS.horizonDays]: clampBound(s[LWK_SETTING_KEYS.horizonDays], LWK_BOUNDS.horizonDays, LWK_DEFAULTS.horizonDays),
  };
}
