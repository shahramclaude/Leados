/**
 * app/core/domain/delegationLineSchema.js — fail-closed normalization for
 * Cross-Line Ask Attribution (ADR-0178, Schema v143).
 *
 * STATUS (Session 242, 2026-11-11): FOUNDATION ONLY — NOT YET WIRED.
 * `app/core/schema.js` does not import these normalizers: `SCHEMA_VERSION` is
 * still 142, neither collection is in `COLLECTIONS`, the three settings are not
 * in `DEFAULT_SETTINGS`, and there is no migration. ADR-0178, Schema v143 and
 * `RULE-DLA-01` are RESERVED identifiers (ROADMAP.md, "In Progress"). The
 * functions below are complete and tested (`tests/app/delegation-lines.test.mjs`);
 * "WHAT IS STORED" describes the shape the wiring slice will store.
 *
 * WHAT IS STORED
 *   `delegationLineActs`     append-only dated attribution ACTS. One act names the
 *                            delegation, the person it was handed to, ONE reporting
 *                            line of that person, and a SNAPSHOT of that line's
 *                            manager and kind at the moment of attribution. The
 *                            latest act per delegation is the effective one.
 *   `delegationLineMarkers`  RULE-DLA-01's bounded idempotency / observation ledger.
 *   three settings           `delegationLineBudget`, `delegationLineAskDueDays`,
 *                            `delegationLineAutoPropagate`.
 *
 * WHAT IS NEVER STORED. A class, a verdict, a per-line count, an entitlement, an
 * "overloaded" flag. Every one is derived on read from the acts, the delegations
 * and the live matrix graph, so a printed figure cannot drift from its record.
 * The delegation row itself is NOT changed: 79 rule modules write that row, and
 * none of them has to know this ledger exists.
 *
 * FAIL CLOSED. A malformed act is DROPPED with a counted warning — never repaired
 * into an attribution nobody made. An act whose person differs from the
 * delegation's owner is dropped, not re-pointed. A manager or line that no longer
 * exists is KEPT exactly as stored: the reader prints that ask as `stale`
 * instead of rewriting which line was named.
 */

import {
  DELEGATION_LINE_BASES,
  DELEGATION_LINE_BOUNDS,
  DELEGATION_LINE_DEFAULTS,
  DELEGATION_LINE_LIMITS,
} from './delegationLineRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function normalizeDelegationLineSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  return {
    delegationLineBudget: boundedInt(src.delegationLineBudget, DELEGATION_LINE_BOUNDS.budget, DELEGATION_LINE_DEFAULTS.budget),
    delegationLineAskDueDays: boundedInt(src.delegationLineAskDueDays, DELEGATION_LINE_BOUNDS.askDueDays, DELEGATION_LINE_DEFAULTS.askDueDays),
    delegationLineAutoPropagate: src.delegationLineAutoPropagate !== false,
  };
}

/**
 * The effective act per delegation: the LATEST by timestamp; on an exact tie the
 * later-appended act wins. Returns `Map<delegationId, { act, index, actN, lineN }>`
 * where `lineN` is how many distinct lines the ask has ever been placed on.
 */
export function effectiveDelegationLineActs(acts) {
  const out = new Map();
  (Array.isArray(acts) ? acts : []).forEach((act, index) => {
    if (!act || !act.delegationId) return;
    const prev = out.get(act.delegationId);
    if (!prev) {
      out.set(act.delegationId, { act, index, actN: 1, lineIds: new Set([act.lineId]) });
      return;
    }
    prev.actN += 1;
    prev.lineIds.add(act.lineId);
    if (String(act.at) >= String(prev.act.at)) { prev.act = act; prev.index = index; }
  });
  for (const entry of out.values()) { entry.lineN = entry.lineIds.size; delete entry.lineIds; }
  return out;
}

/**
 * Bound the ledger WITHOUT ever dropping the effective attribution of an open
 * ask. Oldest-first eviction over acts that are superseded or belong to a
 * delegation that is no longer active. If every act is protected the ledger is
 * returned over the cap rather than silently un-attributing live work.
 */
export function compactDelegationLineActs(acts, delegations, cap = DELEGATION_LINE_LIMITS.acts) {
  const list = Array.isArray(acts) ? acts : [];
  if (list.length <= cap) return list;
  const active = new Set((Array.isArray(delegations) ? delegations : [])
    .filter((d) => d && d.status === 'active').map((d) => d.id));
  const effective = effectiveDelegationLineActs(list);
  const protectedIdx = new Set();
  for (const [delegationId, entry] of effective) {
    if (active.has(delegationId)) protectedIdx.add(entry.index);
  }
  let excess = list.length - cap;
  const out = [];
  list.forEach((act, index) => {
    if (excess > 0 && !protectedIdx.has(index)) { excess -= 1; return; }
    out.push(act);
  });
  return out;
}

/**
 * @param raw       stored acts
 * @param state     the state being normalized (delegations already normalized)
 * @param warnings  load warnings (mutated)
 */
export function normalizeDelegationLineActs(raw, state = {}, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const owners = new Map((state.delegations || []).filter(Boolean).map((d) => [d.id, d.personId]));
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let orphaned = 0;
  let mismatched = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = str(item.id);
    const delegationId = str(item.delegationId);
    const personId = str(item.personId);
    const lineId = str(item.lineId);
    const managerId = str(item.managerId);
    const basis = DELEGATION_LINE_BASES.includes(item.basis) ? item.basis : null;
    const byId = str(item.byId) || null;
    const at = isoOrNull(item.at);
    if (!id || id.length > DELEGATION_LINE_LIMITS.idMax || seen.has(id)
      || !delegationId || !personId || !lineId || lineId.length > 2 * DELEGATION_LINE_LIMITS.idMax
      || !managerId || managerId.length > DELEGATION_LINE_LIMITS.idMax
      || !basis || !at || (byId && byId.length > DELEGATION_LINE_LIMITS.idMax)
      // A seat-stamped act with no seat on it claims an authorship nobody held.
      || (basis === 'seat' && !byId)) { malformed += 1; continue; }
    if (!owners.has(delegationId)) { orphaned += 1; continue; }
    if (owners.get(delegationId) !== personId) { mismatched += 1; continue; }
    seen.add(id);
    out.push({
      id,
      delegationId,
      personId,
      lineId,
      managerId,
      lineKind: str(item.lineKind).slice(0, 40),
      basis,
      byId,
      at,
    });
  }
  if (malformed) warnings.push(`Cross-line asks: dropped ${malformed} malformed line-attribution act(s); no attribution was repaired or guessed`);
  if (orphaned) warnings.push(`Cross-line asks: dropped ${orphaned} line-attribution act(s) whose delegation no longer exists`);
  if (mismatched) warnings.push(`Cross-line asks: dropped ${mismatched} line-attribution act(s) naming a person other than the delegation’s owner; none was re-pointed`);
  return compactDelegationLineActs(out, state.delegations || []);
}

export function normalizeDelegationLineMarkers(raw) {
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
      pairKey: str(item.pairKey).slice(0, 280),
      taskId: str(item.taskId).slice(0, 80) || null,
      state: str(item.state).slice(0, 24),
      summary: str(item.summary).slice(0, 280),
      at: isoOrNull(item.at),
    });
  }
  const cap = DELEGATION_LINE_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}
