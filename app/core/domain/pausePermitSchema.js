/**
 * app/core/domain/pausePermitSchema.js — fail-closed normalization for the
 * Automation Pause Permit Register (ADR-0182, Schema v145).
 *
 * WHAT IS STORED
 *   `pausePermits`          append-only dated PERMITS. One permit names the
 *                           switch it silences, the authorising seat, a written
 *                           reason, a compensating measure, a first and a last
 *                           day, an optional counterpart manager, an optional
 *                           span it matters to, and — when revoked — the dated
 *                           revocation and who made it.
 *   `pausePermitMarkers`    RULE-PMP-01's bounded idempotency / observation
 *                           ledger.
 *   four settings           `pausePermitDefaultDays`,
 *                           `pausePermitEscalateAfterDays`,
 *                           `pausePermitAskDueDays`, `pausePermitAutoPropagate`.
 *
 * WHAT IS NEVER STORED. A state, a reach flag, an "expired" mark, a count, an
 * unpermitted-pause flag. Every one is derived on read from the permits, the
 * declared switches and the switch value in force, so what a leader reads
 * cannot drift from what the record holds.
 *
 * FAIL CLOSED. A malformed permit is DROPPED with a counted warning — never
 * repaired into an authority nobody granted. A permit whose reason or
 * compensating measure is below the declared floor is dropped, not padded. A
 * permit naming a switch that is not a declared automatic switch is dropped: an
 * authority over a key that gates nothing is not an authority over a control.
 */

import { isPermittableSwitchKey } from './pausePermitRegistry.js';
import {
  PAUSE_PERMIT_BOUNDS,
  PAUSE_PERMIT_DEFAULTS,
  PAUSE_PERMIT_LIMITS,
  PAUSE_PERMIT_SCOPES,
  PAUSE_PERMIT_SETTING_KEYS,
} from './pausePermitRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** A calendar day (`YYYY-MM-DD`) or null. A timestamp is truncated to its UTC day. */
/** A full ISO timestamp, or null. Never truncated: the day of an act is a fact. */
function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dayOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function normalizePausePermitSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = PAUSE_PERMIT_SETTING_KEYS;
  return {
    [K.defaultDays]: boundedInt(src[K.defaultDays], PAUSE_PERMIT_BOUNDS.defaultDays, PAUSE_PERMIT_DEFAULTS.defaultDays),
    [K.escalateAfterDays]: boundedInt(src[K.escalateAfterDays], PAUSE_PERMIT_BOUNDS.escalateAfterDays, PAUSE_PERMIT_DEFAULTS.escalateAfterDays),
    [K.askDueDays]: boundedInt(src[K.askDueDays], PAUSE_PERMIT_BOUNDS.askDueDays, PAUSE_PERMIT_DEFAULTS.askDueDays),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/**
 * @param raw       stored permits
 * @param switches  the declared automatic switches (keys that exist in the
 *                  loaded settings and hold a boolean), as a Set or array
 * @param warnings  load warnings (mutated)
 */
export function normalizePausePermits(raw, switches, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const allowed = switches instanceof Set ? switches : new Set(Array.isArray(switches) ? switches : []);
  const L = PAUSE_PERMIT_LIMITS;
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let unknownSwitch = 0;
  let weak = 0;
  let badWindow = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = str(item.id);
    const key = str(item.key);
    const authoriserId = str(item.authoriserId) || null;
    const reason = str(item.reason);
    const mitigation = str(item.mitigation);
    const from = dayOrNull(item.from);
    const to = dayOrNull(item.to);
    const at = isoOrNull(item.at);
    const scope = PAUSE_PERMIT_SCOPES.includes(item.scope) ? item.scope : 'workspace';
    const scopeTargetId = str(item.scopeTargetId) || null;
    const counterpartId = str(item.counterpartId) || null;
    const revokedOn = dayOrNull(item.revokedOn);
    const revokedById = str(item.revokedById) || null;
    const revokedReason = str(item.revokedReason).slice(0, L.reasonMaxChars) || null;
    if (!id || id.length > L.idMax || seen.has(id)
      || !key || key.length > L.keyMax || !isPermittableSwitchKey(key)
      || (authoriserId && authoriserId.length > L.idMax)
      || (counterpartId && counterpartId.length > L.idMax)
      || (scopeTargetId && scopeTargetId.length > L.idMax)
      || (revokedById && revokedById.length > L.idMax)
      || !at) { malformed += 1; continue; }
    // An authority over a switch this workspace does not declare gates nothing.
    if (allowed.size && !allowed.has(key)) { unknownSwitch += 1; continue; }
    // A reason or a compensating measure below the declared floor is not one.
    if (reason.length < L.reasonMinChars || reason.length > L.reasonMaxChars
      || mitigation.length < L.mitigationMinChars || mitigation.length > L.mitigationMaxChars) { weak += 1; continue; }
    // A permit is a bounded window with a first day and a last day, in order.
    if (!from || !to || to < from) { badWindow += 1; continue; }
    // Revocation is all-or-nothing on the FLAG and the DAY. The authorising
    // seat is deliberately nullable: a full-access operator (the identity-free
    // single-operator view) revokes with no seat to name, and requiring one here
    // silently un-revoked the permit at the next load — the exact drift the
    // Bulletproof Reliability Mandate forbids. The flag plus a date is the fact;
    // the seat is an attribution, and its absence is printed as such.
    const revoked = item.revoked === true && Boolean(revokedOn);
    seen.add(id);
    out.push({
      id,
      key,
      authoriserId,
      reason: reason.slice(0, L.reasonMaxChars),
      mitigation: mitigation.slice(0, L.mitigationMaxChars),
      scope,
      scopeTargetId: scope === 'span' ? scopeTargetId : null,
      counterpartId,
      from,
      to,
      at,
      revoked,
      revokedOn: revoked ? revokedOn : null,
      revokedById: revoked ? revokedById : null,
      revokedReason: revoked ? revokedReason : null,
    });
  }
  if (malformed) warnings.push(`Pause permits: dropped ${malformed} malformed permit(s); none was repaired into an authority nobody granted`);
  if (unknownSwitch) warnings.push(`Pause permits: dropped ${unknownSwitch} permit(s) naming a switch this workspace does not declare; an authority over a switch that gates nothing is not an authority over a control`);
  if (weak) warnings.push(`Pause permits: dropped ${weak} permit(s) whose reason or compensating measure is shorter than the declared floor; neither was padded to pass`);
  if (badWindow) warnings.push(`Pause permits: dropped ${badWindow} permit(s) whose window is missing, reversed or unreadable; a permit is a bounded window, not an open-ended switch`);
  // Newest first is the reading order the register prints; the cap keeps the
  // most recent authorities rather than the oldest, and never silently edits one.
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(a.id).localeCompare(String(b.id)));
  return out.length > L.permits ? out.slice(0, L.permits) : out;
}

export function normalizePausePermitMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const key = str(item.key).slice(0, 320);
    if (!key || seen.has(key)) continue;
    const kind = item.kind === 'ask' || item.kind === 'observation' ? item.kind : null;
    if (!kind) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      subject: str(item.subject).slice(0, 160),
      taskId: str(item.taskId).slice(0, 80) || null,
      state: str(item.state).slice(0, 24),
      summary: str(item.summary).slice(0, 280),
      at: isoOrNull(item.at),
    });
  }
  const cap = PAUSE_PERMIT_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * The permits that name ONE switch, newest first. Pure, so the reader, the rule
 * and the suite agree about which permit governs a silence.
 */
export function permitsForKey(permits, key) {
  return (Array.isArray(permits) ? permits : []).filter((p) => p && p.key === key);
}

/**
 * The permit in force for `key` on `day`, or null. A permit is in force from its
 * first day to its last day INCLUSIVE and only while it has not been revoked.
 * When two permits somehow overlap (an imported file), the LAST day decides and
 * a tie falls to the earliest first day — deterministic, and the overlap is
 * counted separately by the reader rather than resolved silently.
 */
export function permitInForce(permits, key, day) {
  const live = permitsForKey(permits, key).filter((p) => !p.revoked && p.from <= day && day <= p.to);
  if (!live.length) return null;
  return live.slice().sort((a, b) => String(b.to).localeCompare(String(a.to)) || String(a.from).localeCompare(String(b.from)) || String(a.id).localeCompare(String(b.id)))[0];
}
