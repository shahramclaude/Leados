/**
 * app/core/domain/undertakingSchema.js — fail-closed normalizers for ADR-0234
 * (Regulatory Undertaking & Outward-Commitment Closure Register, `RULE-UDT-01`).
 *
 * A malformed undertaking or act is DROPPED with a counted warning, and
 * nothing is repaired: no counterparty, instrument, scope, holder, deliverable,
 * due day, verdict, acknowledgement or report instant is invented. An act
 * resolves only through an undertaking that survived normalization, so no act
 * can outlive the record it belongs to.
 *
 * The per-kind raw timestamp key is carried THROUGH the loader's output beside
 * the uniform `at` read timestamp (`assignedAt`/`deliveredAt`/`verifiedAt`/
 * `reportedAt`/`notifiedAt`/`extendedAt`), so the loader's output is a valid
 * stored row. A loader that refused its own output would silently erase a real
 * assignment, assertion, verification, report or acknowledgement on the next
 * reload.
 *
 * THE LINE IS THE UNIT OF DUTY. A line names its holder, its deliverable and
 * its own day. It is dropped rather than repaired when any of those cannot be
 * read, because a line with an inferred holder is a duty nobody agreed to.
 */

import { dayKey } from '../time.js';
import {
  UDT_ACKNOWLEDGEMENT_KEYS,
  UDT_ACT_KINDS,
  UDT_COUNTERPARTY_KEYS,
  UDT_INSTRUMENT_KEYS,
  UDT_LIMITS as L,
  UDT_MARKER_KIND,
  UDT_RULE_ID,
  UDT_VERDICT_KEYS,
} from './undertakingRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const RESERVED_ID = 'leader';
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const udtText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const udtId = (value) => {
  const candidate = udtText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
};

export function udtInstant(value) {
  const raw = udtText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function udtDay(value) {
  if (typeof value !== 'string') return null;
  const key = dayKey(value.trim());
  return key && key >= L.dayMin && key <= L.dayMax && key === value.trim() ? key : null;
}

const udtRef = (value, max = L.refMax) => {
  const text = udtText(value, max + 20);
  return text.length >= L.refMin ? text.slice(0, max) : null;
};

const dayDiff = (fromDay, toDay) => (
  (Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / 86400000
);

/**
 * One obligation line. The DELIVERABLE and the DAY are required: a line with an
 * inferred deliverable or an inferred day is not a duty anybody agreed to, so
 * the undertaking is dropped rather than carrying a manufactured one. The
 * HOLDER is deliberately OPTIONAL: a promise to a regulator is often declared
 * before the line that will carry it has been staffed, and the register prints
 * `unassigned` rather than guessing a name from the org chart.
 */
function normalizeLine(raw) {
  if (!isPlainObject(raw)) return null;
  const lineId = udtId(raw.lineId);
  const holderId = raw.holderId === undefined || raw.holderId === null ? null : udtId(raw.holderId);
  if (raw.holderId !== undefined && raw.holderId !== null && !holderId) return null;
  const roleLabel = udtText(raw.roleLabel, L.refMax);
  const deliverable = udtText(raw.deliverable, L.textMax);
  const dueOn = udtDay(raw.dueOn);
  if (!lineId || deliverable.length < L.textMin || !dueOn) return null;
  return { lineId, holderId, roleLabel, deliverable, dueOn };
}

/**
 * Declared undertakings. Malformed, duplicate or over-cap rows are dropped and
 * counted. The declared identity — counterparty, kind, instrument, scope, due
 * day — is never edited after declaration: a correction is a new undertaking.
 */
export function normalizeUndertakings(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.undertakings || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = udtId(raw.id);
    const counterparty = udtText(raw.counterparty, L.counterpartyMax);
    const counterpartyKind = UDT_COUNTERPARTY_KEYS.includes(raw.counterpartyKind) ? raw.counterpartyKind : null;
    const instrument = UDT_INSTRUMENT_KEYS.includes(raw.instrument) ? raw.instrument : null;
    const instrumentRef = udtRef(raw.instrumentRef);
    const scope = udtText(raw.scope, L.textMax);
    const dueOn = udtDay(raw.dueOn);
    const declaredById = udtId(raw.declaredById);
    const createdAt = udtInstant(raw.createdAt);
    if (!id || seenIds.has(id) || counterparty.length < L.counterpartyMin || !counterpartyKind
      || !instrument || !instrumentRef || scope.length < L.textMin || !dueOn
      || !declaredById || !createdAt) {
      dropped += 1;
      continue;
    }
    const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
    const lines = [];
    const seenLines = new Set();
    let lineDropped = 0;
    for (const lineRaw of rawLines) {
      const line = normalizeLine(lineRaw);
      if (!line || seenLines.has(line.lineId)) { lineDropped += 1; continue; }
      seenLines.add(line.lineId);
      lines.push(line);
    }
    if (!lines.length || lines.length > L.linesMax) { dropped += 1; continue; }
    seenIds.add(id);
    kept.push({
      id,
      counterparty,
      counterpartyKind,
      instrument,
      instrumentRef,
      scope,
      dueOn,
      declaredById,
      createdAt,
      lines,
    });
    if (lineDropped) {
      warnings.push(`Undertaking ${id}: refused ${lineDropped} unreadable or duplicate obligation line(s); no holder, deliverable or day was repaired.`);
    }
  }
  if (dropped) {
    warnings.push(`Undertakings: refused ${dropped} unreadable, duplicate or out-of-range row(s); no counterparty, instrument, scope, holder, deliverable or due day was repaired.`);
  }
  return kept;
}

/**
 * One act. Each kind carries the raw timestamp key it is read by, and every
 * kind's output carries that key through beside the uniform `at`.
 */
function normalizeAct(raw) {
  const id = udtId(raw.id);
  const undertakingId = udtId(raw.undertakingId);
  const actorId = udtId(raw.actorId);
  const kind = UDT_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !undertakingId || !actorId || !kind) return null;

  if (kind === 'assign') {
    const lineId = udtId(raw.lineId);
    const holderId = udtId(raw.holderId);
    const deliverable = udtText(raw.deliverable, L.textMax);
    const dueOn = udtDay(raw.dueOn);
    const assignedAt = udtInstant(raw.assignedAt);
    if (!lineId || !holderId || deliverable.length < L.textMin || !dueOn || !assignedAt) return null;
    return { id, undertakingId, actorId, kind, lineId, holderId, deliverable, dueOn, assignedAt, at: assignedAt };
  }
  if (kind === 'deliver') {
    const lineId = udtId(raw.lineId);
    const evidenceText = udtText(raw.evidenceText, L.textMax);
    const referenceRef = udtRef(raw.referenceRef);
    const deliveredAt = udtInstant(raw.deliveredAt);
    if (!lineId || evidenceText.length < L.textMin || !referenceRef || !deliveredAt) return null;
    return { id, undertakingId, actorId, kind, lineId, evidenceText, referenceRef, deliveredAt, at: deliveredAt };
  }
  if (kind === 'verify') {
    const lineId = udtId(raw.lineId);
    const verdict = UDT_VERDICT_KEYS.includes(raw.verdict) ? raw.verdict : null;
    const methodText = udtText(raw.methodText, L.textMax);
    const verifiedAt = udtInstant(raw.verifiedAt);
    if (!lineId || !verdict || methodText.length < L.textMin || !verifiedAt) return null;
    return { id, undertakingId, actorId, kind, lineId, verdict, methodText, verifiedAt, at: verifiedAt };
  }
  if (kind === 'report') {
    const reportRef = udtRef(raw.reportRef);
    const reportText = udtText(raw.reportText, L.textMax);
    const reportedAt = udtInstant(raw.reportedAt);
    if (!reportRef || reportText.length < L.textMin || !reportedAt) return null;
    return { id, undertakingId, actorId, kind, reportRef, reportText, reportedAt, at: reportedAt };
  }
  if (kind === 'notify') {
    const acknowledgement = UDT_ACKNOWLEDGEMENT_KEYS.includes(raw.acknowledgement) ? raw.acknowledgement : null;
    const acknowledgementRef = udtRef(raw.acknowledgementRef);
    const notifiedAt = udtInstant(raw.notifiedAt);
    if (!acknowledgement || !acknowledgementRef || !notifiedAt) return null;
    return { id, undertakingId, actorId, kind, acknowledgement, acknowledgementRef, notifiedAt, at: notifiedAt };
  }
  // extend
  const previousDueOn = udtDay(raw.previousDueOn);
  const newDueOn = udtDay(raw.newDueOn);
  const reason = udtText(raw.reason, L.textMax);
  const counterpartyAgreementRef = raw.counterpartyAgreementRef === undefined || raw.counterpartyAgreementRef === null
    ? null
    : udtRef(raw.counterpartyAgreementRef);
  const extendedAt = udtInstant(raw.extendedAt);
  if (!previousDueOn || !newDueOn || reason.length < L.textMin || !extendedAt) return null;
  if (raw.counterpartyAgreementRef !== undefined && raw.counterpartyAgreementRef !== null && !counterpartyAgreementRef) return null;
  return { id, undertakingId, actorId, kind, previousDueOn, newDueOn, reason, counterpartyAgreementRef, extendedAt, at: extendedAt };
}

/**
 * Acts. An act is dropped (counted) when it is malformed, duplicated, or points
 * at an undertaking that did not survive normalization. Ordering, authority,
 * independence and the closure rule are decided later by the reader, in
 * chronological order.
 */
export function normalizeUndertakingActs(value, undertakings, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownIds = new Set(undertakings.map((row) => row.id));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const act = normalizeAct(raw);
    if (!act || seenIds.has(act.id) || !knownIds.has(act.undertakingId)) { dropped += 1; continue; }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) {
    warnings.push(`Undertaking acts: refused ${dropped} unreadable, duplicate, orphaned or over-cap row(s); no assignment, assertion, verification, report, acknowledgement or extension was repaired.`);
  }
  return kept;
}

/**
 * Rule markers — the identity-free observations `RULE-UDT-01` writes when the
 * record owes an ask and nobody on the reporting graph can be asked.
 * Append-only and keyed, so a scan never files the same observation twice. A
 * marker carries no person id, no counterparty and no scope by construction.
 */
export function normalizeUndertakingMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenKeys = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = udtText(raw.key, 200);
    const at = udtInstant(raw.at);
    const detail = udtText(raw.detail, 300);
    if (!key || seenKeys.has(key) || !at || detail.length < L.textMin) { dropped += 1; continue; }
    seenKeys.add(key);
    kept.push({ key, at, ruleId: udtText(raw.ruleId, 40) || UDT_RULE_ID, kind: udtText(raw.kind, 40) || UDT_MARKER_KIND, detail });
  }
  if (dropped) {
    warnings.push(`Undertaking markers: refused ${dropped} unreadable, duplicate or over-cap row(s); no observation was repaired.`);
  }
  return kept;
}

/** Exported for tests and the action layer: whole days between two day keys. */
export const udtDayDiff = dayDiff;
