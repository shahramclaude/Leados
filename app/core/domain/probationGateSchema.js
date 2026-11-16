/**
 * app/core/domain/probationGateSchema.js — fail-closed normalizers for ADR-0233
 * (Probation Confirmation Gate Register, `RULE-PBG-01`).
 *
 * A malformed gate or act is DROPPED with a counted warning, and nothing is
 * repaired: no window, cap, expectation, recommendation, decision, extension or
 * notification instant is invented. An act resolves only through a gate that
 * survived normalization, so no act can outlive the record it belongs to. The
 * synthetic workspace leader is never a declaring manager, an asked line
 * holder, a submitter or a deciding manager: the kernel drops those rows by
 * design, and a write that would vanish on reload is refused now instead.
 *
 * The per-kind raw timestamp key is carried THROUGH the loader's output beside
 * the uniform `at` read timestamp (`askedAt`/`submittedAt`/`decidedAt`/
 * `notifiedAt`), so the loader's output is a valid stored row. A loader that
 * refused its own output would silently erase a real ask, submission,
 * decision or notification on the next reload.
 */

import { dayKey } from '../time.js';
import {
  PBG_ACT_KINDS,
  PBG_DECISIONS,
  PBG_INSTRUMENT_KEYS,
  PBG_LIMITS as L,
  PBG_MARKER_KIND,
  PBG_RECOMMENDATION_KEYS,
  PBG_RULE_ID,
} from './probationRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const RESERVED_ID = 'leader';
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const pbgText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const pbgId = (value) => {
  const candidate = pbgText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
};

export function pbgInstant(value) {
  const raw = pbgText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function pbgDay(value) {
  if (typeof value !== 'string') return null;
  const key = dayKey(value.trim());
  return key && key >= L.dayMin && key <= L.dayMax && key === value.trim() ? key : null;
}

const pbgRef = (value) => {
  const text = pbgText(value, L.refMax + 20);
  return text.length >= L.refMin ? text.slice(0, L.refMax) : null;
};

const pbgInt = (value, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

const dayDiff = (fromDay, toDay) => (
  (Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / 86400000
);

/**
 * Declared gates. Malformed, duplicate or over-cap rows are dropped and
 * counted. A declared span is read against the declared legal cap where one is
 * given: a window that exceeds the cap it itself declares is refused, never
 * repaired — an out-of-cap probation is a defect in the terms, and recording
 * it silently would endorse them.
 */
export function normalizeProbationGates(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.gates || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = pbgId(raw.id);
    const joinerId = pbgId(raw.joinerId);
    const roleLabel = raw.roleLabel === undefined || raw.roleLabel === null ? '' : pbgText(raw.roleLabel, L.refMax);
    const startOn = pbgDay(raw.startOn);
    const endOn = pbgDay(raw.endOn);
    const expectations = pbgText(raw.expectations, L.textMax);
    const instrument = PBG_INSTRUMENT_KEYS.includes(raw.instrument) ? raw.instrument : null;
    const instrumentRef = pbgRef(raw.instrumentRef);
    const declaredById = pbgId(raw.declaredById);
    const createdAt = pbgInstant(raw.createdAt);
    if (!id || seenIds.has(id) || !joinerId || !startOn || !endOn || !instrument || !instrumentRef
      || expectations.length < L.textMin || !declaredById || !createdAt) {
      dropped += 1;
      continue;
    }
    const allowsExtension = raw.allowsExtension === true;
    const legalCapDays = raw.legalCapDays === undefined || raw.legalCapDays === null
      ? null
      : pbgInt(raw.legalCapDays, L.capMinDays, L.capMaxDays);
    if (raw.legalCapDays !== undefined && raw.legalCapDays !== null && legalCapDays === null) { dropped += 1; continue; }
    const noticeDays = raw.noticeDays === undefined || raw.noticeDays === null
      ? null
      : pbgInt(raw.noticeDays, 0, 365);
    if (raw.noticeDays !== undefined && raw.noticeDays !== null && noticeDays === null) { dropped += 1; continue; }
    const spanDays = dayDiff(startOn, endOn);
    if (!(spanDays >= L.spanMinDays && spanDays <= L.spanMaxDays)) { dropped += 1; continue; }
    if (legalCapDays !== null && spanDays > legalCapDays) { dropped += 1; continue; }
    seenIds.add(id);
    kept.push({
      id,
      joinerId,
      roleLabel,
      startOn,
      endOn,
      expectations,
      instrument,
      instrumentRef,
      allowsExtension,
      legalCapDays,
      noticeDays,
      declaredById,
      createdAt,
    });
  }
  if (dropped) {
    warnings.push(`Probation gates: refused ${dropped} unreadable, duplicate, out-of-range or over-cap row(s); no window, cap, expectation or instrument term was repaired.`);
  }
  return kept;
}

/**
 * One act. Each kind carries the raw timestamp key it is read by, and every
 * kind's output carries that key through beside the uniform `at`.
 */
function normalizeAct(raw) {
  const id = pbgId(raw.id);
  const gateId = pbgId(raw.gateId);
  const actorId = pbgId(raw.actorId);
  const kind = PBG_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !gateId || !actorId || !kind) return null;
  // The declared line this act belongs to: the home line (the confirming
  // manager's own) or a declared matrix line. A home act carries no line id;
  // a line act must name one and the holder it was made on.
  const lineKind = raw.lineKind === 'home' || raw.lineKind === 'matrix' ? raw.lineKind : null;
  const lineId = lineKind === 'matrix' ? pbgId(raw.lineId) : (lineKind === 'home' ? null : null);
  const lineHolderId = pbgId(raw.lineHolderId);

  if (kind === 'ask') {
    if (lineKind !== 'matrix' || !lineId || !lineHolderId) return null;
    const dueOn = pbgDay(raw.dueOn);
    const note = pbgText(raw.note, L.textMax);
    const askedAt = pbgInstant(raw.askedAt);
    if (!dueOn || !askedAt) return null;
    return { id, gateId, actorId, kind, lineKind, lineId, lineHolderId, dueOn, note, askedAt, at: askedAt };
  }
  if (kind === 'submit') {
    if (!lineKind) return null;
    if (lineKind === 'matrix' && (!lineId || !lineHolderId)) return null;
    if (lineKind === 'home' && (lineId || lineHolderId)) return null;
    const observedText = pbgText(raw.observedText, L.textMax);
    const recommendation = PBG_RECOMMENDATION_KEYS.includes(raw.recommendation) ? raw.recommendation : null;
    const submittedAt = pbgInstant(raw.submittedAt);
    if (observedText.length < L.textMin || !recommendation || !submittedAt) return null;
    return { id, gateId, actorId, kind, lineKind, lineId, lineHolderId, observedText, recommendation, submittedAt, at: submittedAt };
  }
  if (kind === 'extend') {
    if (raw.lineKind !== undefined && raw.lineKind !== null) return null;
    const reason = pbgText(raw.reason, L.textMax);
    const newEndOn = pbgDay(raw.newEndOn);
    const extendedAt = pbgInstant(raw.extendedAt);
    if (reason.length < L.textMin || !newEndOn || !extendedAt) return null;
    return { id, gateId, actorId, kind, lineKind: null, lineId: null, lineHolderId: null, reason, newEndOn, extendedAt, at: extendedAt };
  }
  if (kind === 'decide') {
    if (raw.lineKind !== undefined && raw.lineKind !== null) return null;
    const decision = PBG_DECISIONS.includes(raw.decision) ? raw.decision : null;
    const reason = pbgText(raw.reason, L.textMax);
    const decidedAt = pbgInstant(raw.decidedAt);
    if (!decision || reason.length < L.textMin || !decidedAt) return null;
    return { id, gateId, actorId, kind, lineKind: null, lineId: null, lineHolderId: null, decision, reason, decidedAt, at: decidedAt };
  }
  // notify
  if (lineKind !== null || lineId !== null || lineHolderId !== null) return null;
  if (raw.lineKind !== undefined && raw.lineKind !== null) return null;
  const instrumentRef = pbgRef(raw.instrumentRef);
  const notifiedAt = pbgInstant(raw.notifiedAt);
  if (!instrumentRef || !notifiedAt) return null;
  return { id, gateId, actorId, kind, lineKind: null, lineId: null, lineHolderId: null, instrumentRef, notifiedAt, at: notifiedAt };
}

/**
 * Acts. An act is dropped (counted) when it is malformed, duplicated, or points
 * at a gate that did not survive normalization. Ordering, authority and the
 * evidence rule are decided later by the reader, in chronological order.
 */
export function normalizeProbationActs(value, gates, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownIds = new Set(gates.map((row) => row.id));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const act = normalizeAct(raw);
    if (!act || seenIds.has(act.id) || !knownIds.has(act.gateId)) { dropped += 1; continue; }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) {
    warnings.push(`Probation gate acts: refused ${dropped} unreadable, duplicate, orphaned, or over-cap row(s); no ask, submission, decision or notification was repaired.`);
  }
  return kept;
}

/**
 * Rule markers — the identity-free observations `RULE-PBG-01` writes when the
 * record owes an ask and nobody on the reporting graph can be asked.
 * Append-only and keyed, so a scan never files the same observation twice. A
 * marker carries no person id by construction.
 */
export function normalizeProbationMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenKeys = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = pbgText(raw.key, 200);
    const at = pbgInstant(raw.at);
    const detail = pbgText(raw.detail, 300);
    if (!key || seenKeys.has(key) || !at || detail.length < L.textMin) { dropped += 1; continue; }
    seenKeys.add(key);
    kept.push({ key, at, ruleId: pbgText(raw.ruleId, 40) || PBG_RULE_ID, kind: pbgText(raw.kind, 40) || PBG_MARKER_KIND, detail });
  }
  if (dropped) {
    warnings.push(`Probation gate markers: refused ${dropped} unreadable, duplicate, or over-cap row(s); no observation was repaired.`);
  }
  return kept;
}
