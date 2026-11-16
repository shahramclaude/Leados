/**
 * app/core/domain/rqSchema.js — fail-closed normalizers for ADR-0235
 * (Regulator Information-Request & Examination Response Register,
 * `RULE-RQR-01`).
 *
 * A malformed request or act is DROPPED with a counted warning, and nothing is
 * repaired: no requester, instrument, scope, receipt day, reply clock, producer,
 * method, item count, privilege claim, review verdict, transmission reference or
 * response is invented. An act resolves only through a request that survived
 * normalization, so no act can outlive the demand it answers.
 *
 * THE RAW PER-KIND TIMESTAMP KEY IS CARRIED THROUGH the loader's output beside
 * the uniform `at` read timestamp (`assignedAt`/`producedAt`/`reviewedAt`/
 * `releasedAt`/`respondedAt`/`clockRestatedAt`/`extendedAt`), so the loader's
 * output is a valid stored row. A loader that refused its own output would
 * silently erase a real production, review or release on the next reload — the
 * exact class of defect this house has been bitten by before.
 *
 * THE LINE IS THE UNIT OF DUTY, AND THE PRIVILEGE CLAIM IS ITS OWN FACT. A line
 * with an inferred producer, an inferred method or an unreadable item count is
 * dropped rather than repaired, because a production nobody searched is not a
 * production. A privilege claim that cannot state its count and its basis is
 * dropped AND its line is dropped — a claim the register cannot describe is a
 * claim it cannot test, and silently storing it would let the line read as
 * protected on the strength of the word "privileged".
 */

import { dayKey } from '../time.js';
import {
  RQR_ACT_KINDS,
  RQR_INSTRUMENT_KEYS,
  RQR_LIMITS as L,
  RQR_MARKER_KIND,
  RQR_PRIVILEGE_OUTCOMES,
  RQR_REQUESTER_KEYS,
  RQR_RESPONSE_KEYS,
  RQR_REVIEW_VERDICTS,
  RQR_RULE_ID,
} from './rqRegistry.js';
import { rqReplyDay } from './rqMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const RESERVED_ID = 'leader';
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const rqrText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const rqrId = (value) => {
  const candidate = rqrText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
};

export function rqrInstant(value) {
  const raw = rqrText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function rqrDay(value) {
  if (typeof value !== 'string') return null;
  const key = dayKey(value.trim());
  return key && key >= L.dayMin && key <= L.dayMax && key === value.trim() ? key : null;
}

const rqrRef = (value, max = L.refMax) => {
  const text = rqrText(value, max + 20);
  return text.length >= L.refMin ? text.slice(0, max) : null;
};

/** A declared, whole, non-negative count of items. `0` is a real answer. */
const rqrCount = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 1e9 ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n <= 1e9 ? n : null;
  }
  return null;
};

/** The declared reply clock: whole days, inside the declared bounds, never guessed. */
const rqrClock = (value) => {
  const n = rqrCount(value);
  return n !== null && n >= L.clockMinDays && n <= L.clockMaxDays ? n : null;
};

/**
 * The privilege claim on a line. ABSENT (or `claimed:false`) is a complete answer:
 * the line withholds nothing. A claim must carry its own count and basis, or the
 * line is refused — see the file header for why a bare word is not enough.
 */
function normalizePrivilege(raw) {
  if (raw === undefined || raw === null) return { claimed: false, withheldCount: 0, basis: '' };
  if (!isPlainObject(raw)) return null;
  if (raw.claimed !== true) {
    if (raw.claimed === false && (raw.withheldCount === undefined || raw.withheldCount === null)) {
      return { claimed: false, withheldCount: 0, basis: '' };
    }
    return null;
  }
  const withheldCount = rqrCount(raw.withheldCount);
  const basis = rqrText(raw.basis, L.textMax);
  if (withheldCount === null || withheldCount <= 0 || basis.length < L.textMin) return null;
  return { claimed: true, withheldCount, basis };
}

/**
 * One production line. The SUBJECT and the DAY are required: a line with an
 * inferred subject is not a duty anybody agreed to carry, so the request is
 * dropped rather than carrying a manufactured one. The PRODUCER is deliberately
 * OPTIONAL: a demand is often recorded before the line that will carry it is
 * staffed, and the register prints `unassigned` rather than guessing a name from
 * the org chart.
 */
function normalizeLine(raw) {
  if (!isPlainObject(raw)) return null;
  const lineId = rqrId(raw.lineId);
  const producerId = raw.producerId === undefined || raw.producerId === null ? null : rqrId(raw.producerId);
  if (raw.producerId !== undefined && raw.producerId !== null && !producerId) return null;
  const roleLabel = rqrText(raw.roleLabel, L.refMax);
  const subject = rqrText(raw.subject, L.textMax);
  const dueOn = rqrDay(raw.dueOn);
  if (!lineId || subject.length < L.textMin || !dueOn) return null;
  return { lineId, producerId, roleLabel, subject, dueOn };
}

/**
 * Recorded requests. Malformed, duplicate or over-cap rows are dropped and
 * counted. The recorded identity — requester, kind, instrument, scope, receipt
 * day and clock — is never edited: a correction is a new request. The reply day
 * is DERIVED at load from the two declared facts, so a hand-edited `replyDay`
 * that disagrees with its own clock cannot survive a reload.
 */
export function normalizeRequests(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.requests || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = rqrId(raw.id);
    const requester = rqrText(raw.requester, L.requesterMax);
    const requesterKind = RQR_REQUESTER_KEYS.includes(raw.requesterKind) ? raw.requesterKind : null;
    const instrument = RQR_INSTRUMENT_KEYS.includes(raw.instrument) ? raw.instrument : null;
    const instrumentRef = rqrRef(raw.instrumentRef);
    const scope = rqrText(raw.scope, L.textMax);
    const receivedOn = rqrDay(raw.receivedOn);
    const replyClockDays = rqrClock(raw.replyClockDays);
    const receivedById = rqrId(raw.receivedById);
    const createdAt = rqrInstant(raw.createdAt);
    if (!id || seenIds.has(id) || requester.length < L.requesterMin || !requesterKind
      || !instrument || !instrumentRef || scope.length < L.textMin || !receivedOn
      || replyClockDays === null || !receivedById || !createdAt) {
      dropped += 1;
      continue;
    }
    const replyDay = rqReplyDay(receivedOn, replyClockDays);
    if (!replyDay || replyDay > L.dayMax) { dropped += 1; continue; }
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
      requester,
      requesterKind,
      instrument,
      instrumentRef,
      scope,
      receivedOn,
      replyClockDays,
      replyDay,
      receivedById,
      createdAt,
      lines,
    });
    if (lineDropped) {
      warnings.push(`Information requests: refused ${lineDropped} unreadable or duplicate production line(s) on ${id}; no producer, subject or day was repaired.`);
    }
  }
  if (dropped) {
    warnings.push(`Information requests: refused ${dropped} unreadable, duplicate or out-of-range row(s); no requester, instrument, scope, receipt day, reply clock, producer or line was repaired.`);
  }
  return kept;
}

/**
 * One act. Each kind carries the raw timestamp key it is read by, and every
 * kind's output carries that key through beside the uniform `at`.
 */
function normalizeAct(raw) {
  if (!isPlainObject(raw)) return null;
  const id = rqrId(raw.id);
  const requestId = rqrId(raw.requestId);
  const actorId = rqrId(raw.actorId);
  const kind = RQR_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !requestId || !actorId || !kind) return null;

  if (kind === 'assign') {
    const lineId = rqrId(raw.lineId);
    const producerId = rqrId(raw.producerId);
    const subject = rqrText(raw.subject, L.textMax);
    const dueOn = rqrDay(raw.dueOn);
    const assignedAt = rqrInstant(raw.assignedAt);
    if (!lineId || !producerId || subject.length < L.textMin || !dueOn || !assignedAt) return null;
    return { id, requestId, actorId, kind, lineId, producerId, subject, dueOn, assignedAt, at: assignedAt };
  }
  if (kind === 'produce') {
    const lineId = rqrId(raw.lineId);
    const methodText = rqrText(raw.methodText, L.textMax);
    const searchWindow = rqrText(raw.searchWindow, L.refMax);
    const itemCount = rqrCount(raw.itemCount);
    const complete = raw.complete === true || raw.complete === false ? raw.complete : null;
    const privilege = normalizePrivilege(raw.privilege);
    const producedAt = rqrInstant(raw.producedAt);
    if (!lineId || methodText.length < L.textMin || searchWindow.length < L.refMin
      || itemCount === null || complete === null || !privilege || !producedAt) return null;
    return { id, requestId, actorId, kind, lineId, methodText, searchWindow, itemCount, complete, privilege, producedAt, at: producedAt };
  }
  if (kind === 'review') {
    const lineId = rqrId(raw.lineId);
    const verdict = RQR_REVIEW_VERDICTS.includes(raw.verdict) ? raw.verdict : null;
    const methodText = rqrText(raw.methodText, L.textMax);
    const privilegeVerdict = raw.privilegeVerdict === null || raw.privilegeVerdict === undefined
      ? null
      : (RQR_PRIVILEGE_OUTCOMES.includes(raw.privilegeVerdict) ? raw.privilegeVerdict : 'INVALID');
    const reviewedAt = rqrInstant(raw.reviewedAt);
    if (!lineId || !verdict || methodText.length < L.textMin || !reviewedAt) return null;
    if (privilegeVerdict === 'INVALID') return null;
    return { id, requestId, actorId, kind, lineId, verdict, privilegeVerdict, methodText, reviewedAt, at: reviewedAt };
  }
  if (kind === 'release') {
    const transmissionRef = rqrRef(raw.transmissionRef);
    const releaseText = rqrText(raw.releaseText, L.textMax);
    const itemCount = rqrCount(raw.itemCount);
    const releasedAt = rqrInstant(raw.releasedAt);
    if (!transmissionRef || releaseText.length < L.textMin || itemCount === null || !releasedAt) return null;
    return { id, requestId, actorId, kind, transmissionRef, releaseText, itemCount, releasedAt, at: releasedAt };
  }
  if (kind === 'respond') {
    const response = RQR_RESPONSE_KEYS.includes(raw.response) ? raw.response : null;
    const responseRef = rqrRef(raw.responseRef);
    const responseText = rqrText(raw.responseText, L.textMax);
    const respondedAt = rqrInstant(raw.respondedAt);
    if (!response || !responseRef || responseText.length < L.textMin || !respondedAt) return null;
    return { id, requestId, actorId, kind, response, responseRef, responseText, respondedAt, at: respondedAt };
  }
  if (kind === 'clock') {
    const newClockDays = rqrCount(raw.newClockDays);
    const restatedReplyDay = rqrDay(raw.restatedReplyDay);
    const requesterReference = rqrRef(raw.requesterReference);
    const clockRestatedAt = rqrInstant(raw.clockRestatedAt);
    if (newClockDays === null || !restatedReplyDay || !requesterReference || !clockRestatedAt) return null;
    return { id, requestId, actorId, kind, newClockDays, restatedReplyDay, requesterReference, clockRestatedAt, at: clockRestatedAt };
  }
  // extend
  const previousReplyDay = rqrDay(raw.previousReplyDay);
  const newReplyDay = rqrDay(raw.newReplyDay);
  const reason = rqrText(raw.reason, L.textMax);
  const requesterAgreementRef = raw.requesterAgreementRef === undefined || raw.requesterAgreementRef === null
    ? null
    : rqrRef(raw.requesterAgreementRef);
  const extendedAt = rqrInstant(raw.extendedAt);
  if (!previousReplyDay || !newReplyDay || reason.length < L.textMin || !extendedAt) return null;
  if (raw.requesterAgreementRef !== undefined && raw.requesterAgreementRef !== null && !requesterAgreementRef) return null;
  return { id, requestId, actorId, kind, previousReplyDay, newReplyDay, reason, requesterAgreementRef, extendedAt, at: extendedAt };
}

/**
 * Acts. An act is dropped (counted) when it is malformed, duplicated, or points
 * at a request that did not survive normalization. Ordering, eligibility,
 * independence and the release rule are decided later by the reader, in
 * chronological order.
 */
export function normalizeRequestActs(value, requests, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownIds = new Set(requests.map((row) => row.id));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const act = normalizeAct(raw);
    if (!act || seenIds.has(act.id) || !knownIds.has(act.requestId)) { dropped += 1; continue; }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) {
    warnings.push(`Information-request acts: refused ${dropped} unreadable, duplicate, orphaned or over-cap row(s); no assignment, production, review, release, response, restated clock or extension was repaired.`);
  }
  return kept;
}

/**
 * Rule markers — the identity-free observations `RULE-RQR-01` writes when the
 * record owes an ask and nobody on the reporting graph can be asked.
 * Append-only and keyed, so a scan never files the same observation twice. A
 * marker carries no person id, no requester and no scope by construction.
 */
export function normalizeRequestMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenKeys = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = rqrText(raw.key, 200);
    const at = rqrInstant(raw.at);
    const detail = rqrText(raw.detail, 300);
    if (!key || seenKeys.has(key) || !at || detail.length < L.textMin) { dropped += 1; continue; }
    seenKeys.add(key);
    kept.push({ key, at, ruleId: rqrText(raw.ruleId, 40) || RQR_RULE_ID, kind: rqrText(raw.kind, 40) || RQR_MARKER_KIND, detail });
  }
  if (dropped) {
    warnings.push(`Information-request markers: refused ${dropped} unreadable, duplicate or over-cap row(s); no observation was repaired.`);
  }
  return kept;
}

/** Exported for tests and the action layer: the two declared numeric bounds. */
export const rqrCountBound = rqrCount;
export const rqrClockBound = rqrClock;
