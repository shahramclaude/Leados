/**
 * app/core/domain/authorityReaffirmationSchema.js — fail-closed normalizers
 * for Frozen Authority Re-Affirmation & Drift Settlement (ADR-0159, Schema v130).
 *
 * WHAT IS STORED
 * --------------
 * `authorityReaffirmations` — append-only dated human acts on one drifted
 * frozen decision (`merit-cycle`, `decision`, `board-memo`):
 *
 *   {
 *     id,
 *     recordType: 'merit-cycle' | 'decision' | 'board-memo',
 *     recordId,
 *     outcome: 'stand-behind' | 'refer-reopen',
 *     decidedOn,          // YYYY-MM-DD
 *     decidedBySeatId,    // acting seat id (LEADER_ID or roster person id)
 *     via: 'seat' | 'operator',
 *     underAuthorityIds,  // sorted unique live authority holder ids at act time
 *     reason,             // stated human words — never defaulted
 *     referralDecisionId, // optional governed re-decision id on `refer-reopen`
 *     at,                 // ISO timestamp
 *   }
 *
 * `authorityReaffirmationMarkers` — RULE-ACR-01's idempotency ledger.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a settlement verdict (`settled`, `stale`, `unsettled`), a population or
 *    reconciled claim flag, or any edited field on `meritCycles`, `decisions`
 *    or `boardMemos`. Every verdict and every staleness check is DERIVED on
 *    read against the live matrix, so a subsequent re-org turns an earlier
 *    sign-off `stale` immediately instead of letting a stored boolean lie.
 *  - an inferred authority set or a blank reason. A row missing its record
 *    pointer, outcome, date, seat, non-empty `underAuthorityIds` or stated
 *    `reason` is DROPPED with a printed warning — never repaired.
 *
 * Deliberately EMPTY on upgrade (`129 -> 130`): no drifted frozen decision has
 * been settled yet, so every drifted record honestly reads `unsettled`.
 */

import {
  AUTHORITY_CONTINUITY_TYPES,
  AUTHORITY_REAFFIRMATION_BOUNDS,
  AUTHORITY_REAFFIRMATION_DEFAULTS,
  AUTHORITY_REAFFIRMATION_LIMITS,
  AUTHORITY_REAFFIRMATION_OUTCOME_LIST,
} from './authorityContinuityRegistry.js';

const VALID_TYPES = new Set(AUTHORITY_CONTINUITY_TYPES.map((t) => t.key));
const VALID_OUTCOMES = new Set(AUTHORITY_REAFFIRMATION_OUTCOME_LIST);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value.trim())
    ? value.trim()
    : null;
}

function cleanDay(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function cleanStamp(value) {
  const s = text(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function clampInt(value, [min, max], fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeAuthorityReaffirmationSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    authorityReaffirmDueDays: clampInt(
      source.authorityReaffirmDueDays,
      AUTHORITY_REAFFIRMATION_BOUNDS.dueDays,
      AUTHORITY_REAFFIRMATION_DEFAULTS.dueDays,
    ),
    authorityReaffirmAutoPropagate: source.authorityReaffirmAutoPropagate !== false,
  };
}

export const AUTHORITY_REAFFIRMATION_DEFAULTS_RESOLVED = Object.freeze(
  normalizeAuthorityReaffirmationSettings({}),
);

function normalizeAct(raw, warnings) {
  if (!isPlainObject(raw)) {
    if (warnings) warnings.push('Authority re-affirmation: dropped a settlement row that was not an object.');
    return null;
  }
  const rowId = cleanId(raw.id);
  const recordType = VALID_TYPES.has(raw.recordType) ? raw.recordType : null;
  const recordId = cleanId(raw.recordId);
  const outcome = VALID_OUTCOMES.has(raw.outcome) ? raw.outcome : null;
  const decidedOn = cleanDay(raw.decidedOn);
  const decidedBySeatId = cleanId(raw.decidedBySeatId);
  const reason = text(raw.reason, AUTHORITY_REAFFIRMATION_BOUNDS.maxReason);
  const rawAuthorities = Array.isArray(raw.underAuthorityIds) ? raw.underAuthorityIds : [];
  const underAuthorityIds = [...new Set(rawAuthorities.map((entry) => cleanId(entry)).filter(Boolean))].sort();

  if (!rowId || !recordType || !recordId || !outcome || !decidedOn || !decidedBySeatId) {
    if (warnings) {
      warnings.push('Authority re-affirmation: dropped a settlement row missing its id, record type, record id, outcome, date or acting seat. No settlement was inferred.');
    }
    return null;
  }
  if (!underAuthorityIds.length) {
    if (warnings) {
      warnings.push('Authority re-affirmation: dropped a settlement row with no recorded live authority set (`underAuthorityIds`). A settlement that cannot be checked against future drift is refused.');
    }
    return null;
  }
  if (reason.length < AUTHORITY_REAFFIRMATION_BOUNDS.minReason) {
    if (warnings) {
      warnings.push(`Authority re-affirmation: dropped a settlement row whose stated reason was shorter than ${AUTHORITY_REAFFIRMATION_BOUNDS.minReason} characters.`);
    }
    return null;
  }

  return {
    id: rowId,
    recordType,
    recordId,
    outcome,
    decidedOn,
    decidedBySeatId,
    via: raw.via === 'operator' ? 'operator' : 'seat',
    underAuthorityIds,
    reason,
    referralDecisionId: outcome === 'refer-reopen' ? cleanId(raw.referralDecisionId) : null,
    at: cleanStamp(raw.at) || `${decidedOn}T00:00:00.000Z`,
  };
}

export function normalizeAuthorityReaffirmations(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const clean = normalizeAct(item, warnings);
    if (!clean) continue;
    if (seen.has(clean.id)) {
      if (warnings) warnings.push(`Authority re-affirmation: dropped duplicate settlement id "${clean.id}".`);
      continue;
    }
    seen.add(clean.id);
    out.push(clean);
  }
  const cap = AUTHORITY_REAFFIRMATION_LIMITS.acts;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

export function normalizeAuthorityReaffirmationMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const key = text(item.key, 240);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: text(item.kind, 40) || 'obligation',
      recordType: VALID_TYPES.has(item.recordType) ? item.recordType : null,
      recordId: cleanId(item.recordId),
      authorityKey: text(item.authorityKey, 200),
      taskId: cleanId(item.taskId),
      summary: text(item.summary, 280),
      at: cleanStamp(item.at) || '1970-01-01T00:00:00.000Z',
    });
  }
  const cap = AUTHORITY_REAFFIRMATION_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}
