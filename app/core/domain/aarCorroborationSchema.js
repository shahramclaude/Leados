/**
 * app/core/domain/aarCorroborationSchema.js — fail-closed storage contract for
 * Cross-Line After-Action Corroboration & Lesson-Adoption Parity (ADR-0188,
 * Schema v149).
 *
 * Requests freeze the material review context and the complete active Matrix
 * line set of every participant. Answers are separate, append-only, first-person
 * acts against exactly one request. Adoption acts are separate again and belong
 * to a LINE, not to a person. Currentness, expiry, coverage and parity are all
 * derived in `aarCorroboration.js`; none of them is stored here.
 *
 * Everything below is TOTAL and FAIL-CLOSED: a row that cannot be read exactly
 * is dropped and counted with a warning. Nothing is clamped into plausibility,
 * because a repaired row is a row the register would then print as fact.
 */

import { daysBetween } from '../time.js';
import {
  AAR_CORROBORATION_ANSWER_KIND_KEYS,
  AAR_CORROBORATION_DEFAULTS,
  AAR_CORROBORATION_BOUNDS,
  AAR_CORROBORATION_LIMITS,
  AAR_CORROBORATION_OUTCOME_KEYS,
  AAR_CORROBORATION_SETTING_KEYS,
} from './aarCorroborationRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function id(value) {
  const candidate = text(value, 120);
  return ID_RE.test(candidate) ? candidate : null;
}

export function aarCorroborationDay(value) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function stringList(value, maxItems = 40, maxText = 80) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxText)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, maxItems);
}

function boundedInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ------------------------------------------------------------------ settings */

export function normalizeAarCorroborationSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = AAR_CORROBORATION_SETTING_KEYS;
  return {
    [K.dueDays]: boundedInt(src[K.dueDays], AAR_CORROBORATION_BOUNDS.dueDays, AAR_CORROBORATION_DEFAULTS.dueDays),
    [K.minLines]: boundedInt(src[K.minLines], AAR_CORROBORATION_BOUNDS.minLines, AAR_CORROBORATION_DEFAULTS.minLines),
    [K.adoptWarnDays]: boundedInt(src[K.adoptWarnDays], AAR_CORROBORATION_BOUNDS.adoptWarnDays, AAR_CORROBORATION_DEFAULTS.adoptWarnDays),
    // Only an explicit `false` pauses the rule. An unreadable value must never
    // read as "somebody turned governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

export const AAR_CORROBORATION_DEFAULTS_RESOLVED = Object.freeze(normalizeAarCorroborationSettings({}));

/* ----------------------------------------------------------------- snapshot */

function normalizePerson(raw) {
  if (!isPlainObject(raw)) return null;
  const personId = id(raw.id);
  const name = text(raw.name, 120);
  if (!personId || !name) return null;
  return {
    id: personId,
    name,
    role: text(raw.role, 120),
    team: text(raw.team, 80),
    managerId: id(raw.managerId) || null,
  };
}

function normalizeLine(raw) {
  if (!isPlainObject(raw)) return null;
  const lineKey = id(raw.lineKey);
  const personId = id(raw.personId);
  const role = raw.role === 'primary' ? 'primary' : raw.role === 'secondary' ? 'secondary' : null;
  const managerId = id(raw.managerId);
  const managerName = text(raw.managerName, 120);
  if (!lineKey || !personId || !role || !managerId || !managerName) return null;
  return {
    lineKey,
    personId,
    role,
    managerId,
    managerName,
    kind: text(raw.kind, 48),
    fromISO: aarCorroborationDay(raw.fromISO),
    toISO: aarCorroborationDay(raw.toISO),
  };
}

/**
 * A frozen review context. `review` carries the review's own account as it stood
 * when the request was issued; `participants` carries every participant and the
 * COMPLETE active line set each of them held at that moment. A missing or
 * unreadable line set is not repaired to the home line: the snapshot is refused,
 * because the request would otherwise ask the wrong line to answer.
 */
function normalizeSnapshot(raw, { reviewId, holderId, personId }) {
  if (!isPlainObject(raw) || raw.version !== 1) return null;
  const snapshotReviewId = id(raw.review?.id);
  if (snapshotReviewId !== reviewId) return null;
  if (!isPlainObject(raw.review)) return null;

  const review = {
    id: snapshotReviewId,
    subjectType: text(raw.review.subjectType, 24),
    subjectId: id(raw.review.subjectId) || null,
    subjectLabel: text(raw.review.subjectLabel, 200),
    outcomeOn: aarCorroborationDay(raw.review.outcomeOn),
    heldOn: aarCorroborationDay(raw.review.heldOn),
    intended: text(raw.review.intended, 1200),
    actual: text(raw.review.actual, 1200),
    cause: text(raw.review.cause, 1200),
    improve: text(raw.review.improve, 1200),
    participantIds: stringList(raw.review.participantIds, AAR_CORROBORATION_LIMITS.participants),
  };
  if (!review.subjectLabel || !review.heldOn || review.cause.length < 12 || review.intended.length < 12 || review.actual.length < 12) {
    return null;
  }

  const lessonRaw = raw.lesson;
  let lesson = null;
  if (lessonRaw !== null && lessonRaw !== undefined) {
    if (!isPlainObject(lessonRaw)) return null;
    const lessonId = id(lessonRaw.id);
    const lessonText = text(lessonRaw.text, 600);
    if (!lessonId || lessonText.length < 10) return null;
    lesson = {
      id: lessonId,
      class: text(lessonRaw.class, 32),
      text: lessonText,
      changeType: text(lessonRaw.changeType, 32),
      state: text(lessonRaw.state, 24),
      ownerId: id(lessonRaw.ownerId) || null,
      evidencePersonIds: stringList(
        (Array.isArray(lessonRaw.evidencePersonIds) ? lessonRaw.evidencePersonIds : []),
        AAR_CORROBORATION_LIMITS.participants,
      ),
    };
  }

  const peopleRaw = Array.isArray(raw.people) ? raw.people : [];
  if (!peopleRaw.length || peopleRaw.length > AAR_CORROBORATION_LIMITS.participants) return null;
  const people = [];
  const seenPeople = new Set();
  for (const source of peopleRaw) {
    const person = normalizePerson(source);
    if (!person || seenPeople.has(person.id)) return null;
    seenPeople.add(person.id);
    people.push(person);
  }
  people.sort((a, b) => a.id.localeCompare(b.id));

  const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
  if (linesRaw.length < 2 || linesRaw.length > AAR_CORROBORATION_LIMITS.participants * AAR_CORROBORATION_LIMITS.snapshotLines) {
    return null;
  }
  const lines = [];
  const seenLines = new Set();
  for (const source of linesRaw) {
    const line = normalizeLine(source);
    if (!line || seenLines.has(line.lineKey)) return null;
    if (!seenPeople.has(line.personId)) return null;
    seenLines.add(line.lineKey);
    lines.push(line);
  }
  lines.sort((a, b) => a.lineKey.localeCompare(b.lineKey));

  // The requested holder must really hold a line over the named participant in
  // the frozen set. A holder who holds nobody in this review cannot be asked to
  // answer for it, and the manager id is never repaired from the home line.
  const target = lines.find((line) => line.managerId === holderId && line.personId === personId);
  if (!target) return null;
  // The requested line must belong to somebody in the snapshot, and the snapshot
  // must actually be a matrix: at least two distinct managers across the
  // participant set. A single-line snapshot is refused rather than stored as a
  // cross-line request that cannot be one.
  const managerIds = new Set(lines.map((line) => line.managerId));
  if (managerIds.size < 2) return null;

  // `holderId` is part of the frozen context on purpose: if the review is later
  // re-pointed at a different holder, the canonical snapshot differs and every
  // prior answer becomes history rather than being silently re-attributed.
  return {
    version: 1,
    holderId,
    review,
    lesson,
    people,
    lines,
  };
}

/* ----------------------------------------------------------------- requests */

export function normalizeAarCorroborationRequests(raw, warnings = [], today = null) {
  const source = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  let dropped = 0;
  let duplicates = 0;
  for (const item of source) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const rowId = id(item.id);
    const reviewId = id(item.reviewId);
    const lessonId = id(item.lessonId);
    const holderId = id(item.holderId);
    const personId = id(item.personId);
    const requestedOn = aarCorroborationDay(item.requestedOn);
    const requestedAt = stamp(item.requestedAt);
    const dueOn = aarCorroborationDay(item.dueOn);
    const requestedBySeatId = id(item.requestedBySeatId);
    const dueDays = requestedOn && dueOn ? daysBetween(requestedOn, dueOn) : null;
    const [minDue, maxDue] = AAR_CORROBORATION_LIMITS.requestDueDays;
    const snapshot = normalizeSnapshot(item.snapshot, { reviewId, holderId, personId });
    if (
      !rowId || seenIds.has(rowId)
      || !reviewId || !holderId || !personId || !requestedBySeatId
      || !requestedOn || !requestedAt || requestedAt.slice(0, 10) !== requestedOn
      || (today && requestedOn > today)
      || !dueOn || dueDays === null || dueDays < minDue || dueDays > maxDue
      || !snapshot
    ) { dropped += 1; continue; }
    // A lesson id on the request must be the lesson the snapshot froze.
    if (lessonId !== (snapshot.lesson?.id || null)) { dropped += 1; continue; }
    const key = `${reviewId}|${lessonId || 'account'}|${holderId}`;
    if (seenKeys.has(key)) { duplicates += 1; continue; }
    seenIds.add(rowId);
    seenKeys.add(key);
    out.push({
      id: rowId,
      reviewId,
      lessonId,
      personId,
      holderId,
      requestedOn,
      requestedAt,
      requestedBySeatId,
      dueOn,
      prompt: text(item.prompt, AAR_CORROBORATION_LIMITS.promptMax),
      snapshot,
    });
    if (out.length >= AAR_CORROBORATION_LIMITS.requests) break;
  }
  if (dropped) warnings.push(`AAR corroboration: dropped ${dropped} malformed request(s); no scope, due date or snapshot was inferred.`);
  if (duplicates) warnings.push(`AAR corroboration: collapsed ${duplicates} duplicate request(s) for the same review, lesson and line.`);
  if (source.length > AAR_CORROBORATION_LIMITS.requests) warnings.push(`AAR corroboration: request ledger was capped at ${AAR_CORROBORATION_LIMITS.requests}; later rows were not loaded.`);
  return out;
}

/* ---------------------------------------------------------------- responses */

export function normalizeAarCorroborationResponses(raw, requests, warnings = [], today = null) {
  const source = Array.isArray(raw) ? raw : [];
  const requestById = new Map((Array.isArray(requests) ? requests : []).map((request) => [request.id, request]));
  const out = [];
  const seenIds = new Set();
  const seenRequests = new Set();
  let dropped = 0;
  for (const item of source) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const rowId = id(item.id);
    const requestId = id(item.requestId);
    const request = requestById.get(requestId);
    const outcome = AAR_CORROBORATION_OUTCOME_KEYS.includes(item.outcome) ? item.outcome : null;
    const kind = AAR_CORROBORATION_ANSWER_KIND_KEYS.includes(item.kind) ? item.kind : null;
    const respondedOn = aarCorroborationDay(item.respondedOn);
    const respondedAt = stamp(item.respondedAt);
    const responderSeatId = id(item.responderSeatId);
    const validThrough = aarCorroborationDay(item.validThrough);
    const reason = text(item.reason, AAR_CORROBORATION_LIMITS.reasonMax);
    const note = text(item.note, AAR_CORROBORATION_LIMITS.noteMax);
    const ageDays = request && respondedOn ? daysBetween(request.requestedOn, respondedOn) : null;
    const termDays = respondedOn && validThrough ? daysBetween(respondedOn, validThrough) : null;
    const [minTerm, maxTerm] = AAR_CORROBORATION_LIMITS.responseTermDays;
    const minText = AAR_CORROBORATION_LIMITS.reasonMin;
    if (
      !rowId || seenIds.has(rowId) || !request || !outcome || !kind
      || !respondedOn || !respondedAt || respondedAt.slice(0, 10) !== respondedOn
      || (today && respondedOn > today)
      || respondedAt < request.requestedAt
      || ageDays === null || ageDays < 0
      || !responderSeatId
      || seenRequests.has(requestId)
      || request.reviewId !== id(item.reviewId)
      || request.holderId !== id(item.holderId)
      || responderSeatId !== request.holderId
      || (kind === 'corroboration' && (!validThrough || termDays === null || termDays < minTerm || termDays > maxTerm))
      || (kind === 'observation' && validThrough !== null)
      || ((outcome === 'disputed' || outcome === 'declined') && reason.length < minText)
      || (outcome === 'partly' && note.length < minText)
    ) { dropped += 1; continue; }
    seenIds.add(rowId);
    seenRequests.add(requestId);
    out.push({
      id: rowId,
      requestId,
      reviewId: request.reviewId,
      lessonId: request.lessonId,
      personId: request.personId,
      holderId: request.holderId,
      kind,
      outcome,
      respondedOn,
      respondedAt,
      responderSeatId,
      validThrough: kind === 'corroboration' ? validThrough : null,
      reason: (outcome === 'disputed' || outcome === 'declined') ? reason : '',
      note: (outcome === 'partly' || outcome === 'corroborated') ? note : '',
    });
    if (out.length >= AAR_CORROBORATION_LIMITS.responses) break;
  }
  if (dropped) warnings.push(`AAR corroboration: dropped ${dropped} malformed answer(s); no first-person act or validity window was inferred.`);
  if (source.length > AAR_CORROBORATION_LIMITS.responses) warnings.push(`AAR corroboration: answer ledger was capped at ${AAR_CORROBORATION_LIMITS.responses}; later rows were not loaded.`);
  return out;
}

/* ---------------------------------------------------------------- adoptions */

export function normalizeAarAdoptions(raw, warnings = [], today = null) {
  const source = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  let dropped = 0;
  let duplicates = 0;
  for (const item of source) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const rowId = id(item.id);
    const reviewId = id(item.reviewId);
    const lessonId = id(item.lessonId);
    const holderId = id(item.holderId);
    const adoptedOn = aarCorroborationDay(item.adoptedOn);
    const adoptedAt = stamp(item.adoptedAt);
    const outcome = item.outcome === 'adopted' || item.outcome === 'refused' ? item.outcome : null;
    const note = text(item.note, AAR_CORROBORATION_LIMITS.noteMax);
    if (
      !rowId || seenIds.has(rowId)
      || !reviewId || !lessonId || !holderId || !outcome
      || !adoptedOn || !adoptedAt || adoptedAt.slice(0, 10) !== adoptedOn
      || (today && adoptedOn > today)
      || note.length < AAR_CORROBORATION_LIMITS.reasonMin
    ) { dropped += 1; continue; }
    const key = `${reviewId}|${lessonId}|${holderId}`;
    if (seenKeys.has(key)) { duplicates += 1; continue; }
    seenIds.add(rowId);
    seenKeys.add(key);
    out.push({
      id: rowId,
      reviewId,
      lessonId,
      holderId,
      outcome,
      adoptedOn,
      adoptedAt,
      adoptedBySeatId: id(item.adoptedBySeatId),
      note,
    });
    if (out.length >= AAR_CORROBORATION_LIMITS.adoptions) break;
  }
  if (dropped) warnings.push(`AAR corroboration: dropped ${dropped} malformed adoption act(s); no adoption was inferred from anything else.`);
  if (duplicates) warnings.push(`AAR corroboration: collapsed ${duplicates} duplicate adoption act(s) for the same review, lesson and holder.`);
  if (source.length > AAR_CORROBORATION_LIMITS.adoptions) warnings.push(`AAR corroboration: adoption ledger was capped at ${AAR_CORROBORATION_LIMITS.adoptions}; later rows were not loaded.`);
  return out;
}

/* --------------------------------------------------------------- ask parsing */

export const AAR_CORROBORATION_ASK_SUMMARY_PREFIX = 'AAR-CORR-ASK';

/**
 * The rule's asks are ordinary `delegations` rows. The condition they answer is
 * identified by a deterministic signature carried in the summary, so the rule is
 * idempotent across commits and a human closure is never overwritten.
 */
export function parseAarCorroborationAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(AAR_CORROBORATION_ASK_SUMMARY_PREFIX)) return null;
  const sig = trimmed.slice(AAR_CORROBORATION_ASK_SUMMARY_PREFIX.length).trim();
  return /^aac1:\d+:[0-9a-f]{16}$/.test(sig) ? { signature: sig } : null;
}

/** Canonical, stable signature for one rule condition. FNV-1a 64-bit, hex. */
export function aarCorroborationSignature(signatureText) {
  const text_ = String(signatureText || '').slice(0, 300);
  // Two independent 32-bit lanes, so a reordering of a large ledger does not
  // collide the way a single 32-bit hash does.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text_.length; i += 1) {
    const c = text_.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + i) & 0xff;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const hex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  return `aac1:${text_.length}:${hex}`;
}
