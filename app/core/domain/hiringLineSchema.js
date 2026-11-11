/**
 * app/core/domain/hiringLineSchema.js — fail-closed normalization for Cross-Line
 * Selection Corroboration (ADR-0176, Schema v141).
 *
 * WHAT IS STORED
 *   `hiringLinePlans`    append-only dated ACTS. `declared` names the home
 *                        manager and the additional line managers a hire on one
 *                        requisition will report to; `withdrawn` retracts the
 *                        effective declaration with a reason. The latest act per
 *                        requisition is the effective plan.
 *   `hiringLineMarkers`  RULE-HLC-01's bounded idempotency / observation ledger.
 *   two settings         `hiringLineAskDueDays`, `hiringLineAutoPropagate`.
 *
 * WHAT IS NEVER STORED. A line state, a verdict, a rate, a "corroborated" flag.
 * Every one is derived on read from the acts, the candidates' evidence and the
 * live matrix graph, so a printed figure cannot drift from its record.
 *
 * FAIL CLOSED. A malformed act is DROPPED with a counted warning — never
 * repaired into a plan nobody declared. A manager id absent from today's roster
 * is KEPT exactly as stored: people leave, and the reader prints that line as
 * unreadable instead of rewriting who was named.
 */

import {
  HIRING_LINE_ACT_KINDS,
  HIRING_LINE_BOUNDS,
  HIRING_LINE_DEFAULTS,
  HIRING_LINE_LIMITS,
} from './hiringLineRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeHiringLineSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const [min, max] = HIRING_LINE_BOUNDS.askDueDays;
  const n = typeof src.hiringLineAskDueDays === 'number' && Number.isFinite(src.hiringLineAskDueDays)
    ? Math.min(max, Math.max(min, Math.round(src.hiringLineAskDueDays)))
    : HIRING_LINE_DEFAULTS.askDueDays;
  return {
    hiringLineAskDueDays: n,
    hiringLineAutoPropagate: src.hiringLineAutoPropagate !== false,
  };
}

/**
 * @param raw       stored acts
 * @param state     the state being normalized (requisitions already normalized)
 * @param warnings  load warnings (mutated)
 */
export function normalizeHiringLinePlans(raw, state = {}, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const reqIds = new Set((state.requisitions || []).map((r) => r && r.id));
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let orphaned = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = str(item.id);
    const reqId = str(item.reqId);
    const kind = HIRING_LINE_ACT_KINDS.includes(item.kind) ? item.kind : null;
    const at = isoOrNull(item.at);
    if (!id || id.length > HIRING_LINE_LIMITS.idMax || seen.has(id) || !reqId || !kind || !at) { malformed += 1; continue; }
    if (!reqIds.has(reqId)) { orphaned += 1; continue; }
    let homeManagerId = null;
    let lineManagerIds = [];
    if (kind === 'declared') {
      homeManagerId = str(item.homeManagerId);
      if (!homeManagerId || homeManagerId.length > HIRING_LINE_LIMITS.idMax) { malformed += 1; continue; }
      if (!Array.isArray(item.lineManagerIds)) { malformed += 1; continue; }
      const ids = item.lineManagerIds.map(str);
      const distinct = new Set(ids);
      // A duplicated, blank, oversized or home-repeating line is not trimmed into
      // a different plan: the act is refused whole.
      if (ids.some((v) => !v || v.length > HIRING_LINE_LIMITS.idMax) || distinct.size !== ids.length
        || distinct.has(homeManagerId) || ids.length > HIRING_LINE_LIMITS.additionalLines) { malformed += 1; continue; }
      lineManagerIds = ids;
    }
    seen.add(id);
    out.push({
      id,
      reqId,
      kind,
      homeManagerId,
      lineManagerIds,
      note: str(item.note).slice(0, HIRING_LINE_LIMITS.noteMax),
      at,
    });
  }
  if (malformed) warnings.push(`Co-hiring lines: dropped ${malformed} malformed line-plan act(s); no plan was repaired or guessed`);
  if (orphaned) warnings.push(`Co-hiring lines: dropped ${orphaned} line-plan act(s) whose requisition no longer exists`);
  const cap = HIRING_LINE_LIMITS.acts;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

export function normalizeHiringLineMarkers(raw) {
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
  const cap = HIRING_LINE_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}
