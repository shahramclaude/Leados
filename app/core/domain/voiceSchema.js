/**
 * app/core/domain/voiceSchema.js — the fail-closed storage contract of the
 * Employee Voice & Collective Consultation Register (ADR-0243, Schema v197).
 *
 * SEVEN COLLECTIONS, ALL EMPTY AT UPGRADE: `voiceBodies`, `voiceMembers`,
 * `voiceItems`, `voiceSittings`, `voiceResponses`, `voiceDecisions` and the rule's
 * `voiceMarkers`. Nothing derived is stored — no state, no close day, no days
 * early, no days late, no quorum verdict, no reply deadline. Every one of those is
 * recomputed on read, because a stored deadline is a deadline that can disagree
 * with the window beside it, and the disagreement would surface as a leader
 * believing a body was consulted before a decision it never saw.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here completes a missing instrument, repairs a window, invents a
 * membership, re-dates advice, or rescues a row that points at a body this loader
 * was not handed. A row that cannot be read exactly is DROPPED with a counted
 * warning, and the screen prints the count.
 *
 * THE SIX LOADER RULES THAT CARRY THE MANDATE:
 *   1. A BODY WITH NO WRITTEN INSTRUMENT is dropped. A consultation body is
 *      constituted by something somebody wrote; a body with no instrument has no
 *      quorum, no term and no competence, and would print a reassuring name over
 *      an unaccountable group.
 *   2. AN ITEM WITH NO INSTRUMENT, NO AFFECTED LINE OR A MISSING WINDOW is
 *      dropped. There is no default period anywhere in this file: a window that
 *      has to be guessed is exactly the plausible default the Bulletproof
 *      Reliability Mandate forbids, and an item no line owns is a change nobody
 *      is accountable for.
 *   3. A SITTING THAT NAMES A NON-MEMBER, OR AN ITEM OF ANOTHER BODY, is dropped.
 *      Attendance is a claim about who was in the room; a row that cannot say who
 *      was entitled to be there cannot support a quorum finding.
 *   4. ADVICE ARRIVES ONCE, AND ITS REPLY ARRIVES WHOLE OR NOT AT ALL. A second
 *      response to one item is dropped (the body advised once; a later note is a
 *      new item, not an edit of the old one), and a reply with a day but no note,
 *      or a note with no day, is unreadable.
 *   5. ORDERING BREACHES ARE KEPT, NEVER REPAIRED. A decision dated before its
 *      window closed, and an implementation dated before its decision, are
 *      RETAINED here even though the commands cannot create them — because a
 *      hand-edited or imported file that carries one is carrying the exact fact
 *      this register exists to surface, and dropping it would erase the breach.
 *      A decision dated before the item it decides is dropped, because that is
 *      not a breach of this duty but an unreadable pairing.
 *   6. A MEMBER'S TERM ARRIVES WHOLE. An end before the start, or an elected
 *      member with no election day, is unreadable: the term is the only thing
 *      that says whether a person was entitled to advise on the day they did.
 */

import {
  VOI_ADVICE_COURSE_KEYS,
  VOI_BODY_KIND_KEYS,
  VOI_BOUNDS,
  VOI_DECISION_COURSE_KEYS,
  VOI_DEFAULTS,
  VOI_ITEM_KIND_BY_KEY,
  VOI_ITEM_KIND_KEYS,
  VOI_LIMITS as L,
  VOI_MEMBER_ROLE_KEYS,
  VOI_SETTING_KEYS,
} from './voiceRegistry.js';
import { voiceDay } from './voiceMath.js';
import { daysBetween } from '../time.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value, max = L.idMax) => {
  const candidate = text(value, max);
  return ID_RE.test(candidate) ? candidate : null;
};

/** A body's name: bounded and non-empty, never a placeholder. */
export function voiceName(value) {
  const candidate = text(value, L.nameMax + 40);
  if (candidate.length < L.nameMin) return null;
  return candidate.slice(0, L.nameMax);
}

/** A short declared thing — a document label or a role. */
export function voiceShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** The subject a human actually put to a body. */
export function voiceSubject(value) {
  const candidate = text(value, L.subjectMax + 60);
  if (candidate.length < L.subjectMin) return null;
  return candidate.slice(0, L.subjectMax);
}

/** The written instrument a body is constituted by, or an item's clock rests on. */
export function voiceInstrument(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A written note — advice, a reply, a departure reason. */
export function voiceNote(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A declared consultation window in whole days, or null. Never defaulted. */
export function voiceWindow(value, kind = 'consultation') {
  if (kind === 'information') return value === 0 || value === undefined || value === null ? 0 : null;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.windowMin || value > L.windowMax) return null;
  return value;
}

/** A declared quorum in whole members, or null. */
export function voiceQuorum(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.quorumMin || value > L.quorumMax) return null;
  return value;
}

/* ------------------------------------------------------------------- bodies */

export function normalizeVoiceBodies(rows, warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the consultation-body ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.bodies) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const name = voiceName(row.name);
    const kind = VOI_BODY_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const instrumentRef = voiceInstrument(row.instrumentRef);
    const constitutedOn = voiceDay(row.constitutedOn);
    const termEndsOn = row.termEndsOn === null || row.termEndsOn === undefined || row.termEndsOn === '' ? null : voiceDay(row.termEndsOn);
    const quorumWhole = voiceQuorum(row.quorumWhole);
    if (!rowId || seen.has(rowId) || !name || !kind || !instrumentRef || !constitutedOn || quorumWhole === null) {
      dropped += 1;
      continue;
    }
    // A term that ends before it begins, or on its first day, is not a term.
    if (row.termEndsOn && termEndsOn === null) { dropped += 1; continue; }
    if (termEndsOn && daysBetween(constitutedOn, termEndsOn) < 1) { dropped += 1; continue; }
    seen.add(rowId);
    out.push({
      id: rowId,
      name,
      kind,
      instrumentRef,
      constitutedOn,
      termEndsOn,
      quorumWhole,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} consultation-body row(s) could not be read exactly — an id, a name, a kind, a written instrument, a constitution day, a quorum or a term that runs backwards — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ members */

export function normalizeVoiceMembers(rows, bodies = [], warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the membership ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(bodies).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.members) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const bodyId = id(row.bodyId);
    const body = bodyId ? parents.get(bodyId) : null;
    const personId = id(row.personId);
    const role = VOI_MEMBER_ROLE_KEYS.includes(row.role) ? row.role : null;
    const basis = row.basis === 'elected' || row.basis === 'appointed' ? row.basis : null;
    const termStart = voiceDay(row.termStart);
    const termEnd = row.termEnd === null || row.termEnd === undefined || row.termEnd === '' ? null : voiceDay(row.termEnd);
    const electedOn = row.electedOn === null || row.electedOn === undefined || row.electedOn === '' ? null : voiceDay(row.electedOn);
    const declaredById = id(row.declaredById);
    if (!rowId || seen.has(rowId) || !body || !personId || !role || !basis || !termStart || !declaredById) {
      dropped += 1;
      continue;
    }
    if (row.termEnd && termEnd === null) { dropped += 1; continue; }
    if (termEnd && daysBetween(termStart, termEnd) < 0) { dropped += 1; continue; }
    // An elected member's election day is the fact that makes the mandate real.
    if (basis === 'elected' && !electedOn) { dropped += 1; continue; }
    if (electedOn && daysBetween(termStart, electedOn) > 0) { dropped += 1; continue; }
    seen.add(rowId);
    out.push({
      id: rowId,
      bodyId,
      personId,
      role,
      basis,
      termStart,
      termEnd,
      electedOn,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} membership row(s) could not be read exactly — an unknown body, a person, a role, a basis, a term that runs backwards or an elected seat with no election day — and were dropped.`);
  return out;
}

/* -------------------------------------------------------------------- items */

export function normalizeVoiceItems(rows, bodies = [], warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the consultation-item ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(bodies).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.items) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const bodyId = id(row.bodyId);
    const body = bodyId ? parents.get(bodyId) : null;
    const subject = voiceSubject(row.subject);
    const kind = VOI_ITEM_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const instrumentRef = voiceInstrument(row.instrumentRef);
    const openedOn = voiceDay(row.openedOn);
    const declaredById = id(row.declaredById);
    const ownerIds = [...new Set(list(row.ownerIds).map((value) => id(value)).filter(Boolean))];
    const windowDays = kind ? voiceWindow(row.windowDays, kind) : null;

    if (!rowId || seen.has(rowId) || !body || !subject || !kind || !instrumentRef || !openedOn || !declaredById
      || !ownerIds.length || windowDays === null) {
      dropped += 1;
      continue;
    }

    const documents = [];
    for (const doc of list(row.documents).slice(0, 20)) {
      if (!isPlainObject(doc)) { dropped += 1; continue; }
      const label = voiceShort(doc.label);
      const on = voiceDay(doc.on);
      if (!label || !on) { dropped += 1; continue; }
      documents.push({ label, on });
    }
    documents.sort((a, b) => String(a.on).localeCompare(String(b.on)) || String(a.label).localeCompare(String(b.label)));

    seen.add(rowId);
    out.push({
      id: rowId,
      bodyId,
      subject,
      kind,
      ownerIds,
      instrumentRef,
      windowDays,
      openedOn,
      documents,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} consultation-item row(s) could not be read exactly — an unknown body, a subject, a kind, a written instrument, a window, a day, a declaring seat, an affected line or a document — and were dropped. Nothing was repaired and no period was guessed.`);
  return out;
}

/* ----------------------------------------------------------------- sittings */

export function normalizeVoiceSittings(rows, bodies = [], members = [], items = [], warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the sitting ledger was not an array; it was read as empty');
    return [];
  }
  const bodyIds = new Set(list(bodies).map((row) => row.id));
  const memberBody = new Map(list(members).map((row) => [row.id, row.bodyId]));
  const itemBody = new Map(list(items).map((row) => [row.id, row.bodyId]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.sittings) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const bodyId = id(row.bodyId);
    const on = voiceDay(row.on);
    const recordedById = id(row.recordedById);
    if (!rowId || seen.has(rowId) || !bodyId || !bodyIds.has(bodyId) || !on || !recordedById) {
      dropped += 1;
      continue;
    }
    // Attendance must name members of THIS body, and the items must be this
    // body's items: a sitting that cannot say who was entitled to be there
    // cannot support a quorum finding.
    const presentIds = [...new Set(list(row.presentIds).map((value) => id(value)).filter(Boolean))];
    if (presentIds.some((memberId) => memberBody.get(memberId) !== bodyId)) { dropped += 1; continue; }
    const itemIds = [...new Set(list(row.itemIds).map((value) => id(value)).filter(Boolean))];
    if (itemIds.some((itemId) => itemBody.get(itemId) !== bodyId)) { dropped += 1; continue; }

    const minutesOn = row.minutesOn === null || row.minutesOn === undefined || row.minutesOn === '' ? null : voiceDay(row.minutesOn);
    const minutesRef = row.minutesRef === null || row.minutesRef === undefined || row.minutesRef === '' ? null : text(row.minutesRef, L.textMax);
    if (row.minutesOn && minutesOn === null) { dropped += 1; continue; }
    const minuteFields = [minutesOn, minutesRef];
    const minutePresent = minuteFields.filter((value) => value !== null && value !== '').length;
    // Minutes arrive whole or not at all: a day with no reference is a claim
    // nobody can check, and a reference with no day is a minute undated.
    if (minutePresent !== 0 && minutePresent !== 2) { dropped += 1; continue; }
    if (minutesOn && daysBetween(on, minutesOn) < 0) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      bodyId,
      on,
      presentIds,
      itemIds,
      minutesOn,
      minutesRef,
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} sitting row(s) could not be read exactly — an unknown body, a non-member in attendance, an item of another body, an unreadable day, or minutes with half their facts — and were dropped.`);
  return out;
}

/* ---------------------------------------------------------------- responses */

export function normalizeVoiceResponses(rows, items = [], warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the advice ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(items).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const perItem = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.responses) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const itemId = id(row.itemId);
    const item = itemId ? parents.get(itemId) : null;
    const receivedOn = voiceDay(row.receivedOn);
    const advice = VOI_ADVICE_COURSE_KEYS.includes(row.advice) ? row.advice : null;
    const note = voiceNote(row.note);
    const recordedById = id(row.recordedById);
    if (!rowId || seen.has(rowId) || !item || !receivedOn || !advice || !note || !recordedById) {
      dropped += 1;
      continue;
    }
    // A body advises once. A second note is a new item, not an edit of the old.
    if (perItem.has(itemId)) { dropped += 1; continue; }
    if (daysBetween(item.openedOn, receivedOn) < 0) { dropped += 1; continue; }

    const replyOn = row.replyOn === null || row.replyOn === undefined || row.replyOn === '' ? null : voiceDay(row.replyOn);
    const replyNote = row.replyNote === null || row.replyNote === undefined || row.replyNote === '' ? null : voiceNote(row.replyNote);
    const replyById = row.replyById === null || row.replyById === undefined || row.replyById === '' ? null : id(row.replyById);
    if (row.replyOn && replyOn === null) { dropped += 1; continue; }
    const replyPresent = [replyOn, replyNote, replyById].filter((value) => value !== null).length;
    if (replyPresent !== 0 && replyPresent !== 3) { dropped += 1; continue; }
    if (replyOn && daysBetween(receivedOn, replyOn) < 0) { dropped += 1; continue; }

    seen.add(rowId);
    perItem.add(itemId);
    out.push({
      id: rowId,
      itemId,
      receivedOn,
      advice,
      note,
      recordedById,
      replyOn,
      replyNote,
      replyById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} advice row(s) could not be read exactly — an unknown item, a day before the item was opened, a course, a written note, a recording seat, a second response to the same item, or a reply with half its facts — and were dropped.`);
  return out;
}

/* ---------------------------------------------------------------- decisions */

export function normalizeVoiceDecisions(rows, items = [], warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the decision ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(items).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const perItem = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.decisions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const itemId = id(row.itemId);
    const item = itemId ? parents.get(itemId) : null;
    const decidedOn = voiceDay(row.decidedOn);
    const decidedById = id(row.decidedById);
    const course = VOI_DECISION_COURSE_KEYS.includes(row.course) ? row.course : null;
    if (!rowId || seen.has(rowId) || !item || !decidedOn || !decidedById || !course) {
      dropped += 1;
      continue;
    }
    // One decision per item: a decision is not a running commentary.
    if (perItem.has(itemId)) { dropped += 1; continue; }
    // A decision before the item existed is not an ordering breach, it is an
    // unreadable pairing.
    if (daysBetween(item.openedOn, decidedOn) < 0) { dropped += 1; continue; }

    // The departure and the no-advice route both carry their own written reason.
    // A decision that departs from advice without saying why is exactly the
    // record this register refuses to keep.
    const needsNote = course === 'departed' || course === 'proceeded-without-advice';
    const note = needsNote ? voiceNote(row.note) : text(row.note, L.textMax);
    if (needsNote && !note) { dropped += 1; continue; }

    // `implementedOn` is KEPT even when it precedes the decision: that ordering is
    // the `breach-implemented-before-decision` state and dropping the row would
    // erase it.
    const implementedOn = row.implementedOn === null || row.implementedOn === undefined || row.implementedOn === '' ? null : voiceDay(row.implementedOn);
    if (row.implementedOn && implementedOn === null) { dropped += 1; continue; }

    seen.add(rowId);
    perItem.add(itemId);
    out.push({
      id: rowId,
      itemId,
      decidedOn,
      decidedById,
      course,
      note,
      implementedOn,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} decision row(s) could not be read exactly — an unknown item, a day before the item was opened, a course, a deciding seat, a missing written reason for a departure, a second decision on the same item, or an unreadable implementation day — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------------ markers */

export function normalizeVoiceMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[employee-voice] ${message}`);
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
      kind: id(row.kind, 60) || 'employee-voice',
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
 * every register in this workspace keys its own switches.
 *
 * Note what is NOT here: a consultation window. The period a body is given is a
 * fact about each item's instrument, so it is declared per item and bounded in
 * `VOI_LIMITS`. A workspace-level default would be the jurisdiction table this
 * register refuses to hold.
 */
export function normalizeVoiceSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [VOI_SETTING_KEYS.autoPropagate]: s[VOI_SETTING_KEYS.autoPropagate] !== false,
    [VOI_SETTING_KEYS.privacyFloor]: clampBound(s[VOI_SETTING_KEYS.privacyFloor], VOI_BOUNDS.privacyFloor, VOI_DEFAULTS.privacyFloor),
    [VOI_SETTING_KEYS.replyDays]: clampBound(s[VOI_SETTING_KEYS.replyDays], VOI_BOUNDS.replyDays, VOI_DEFAULTS.replyDays),
    [VOI_SETTING_KEYS.minutesDueDays]: clampBound(s[VOI_SETTING_KEYS.minutesDueDays], VOI_BOUNDS.minutesDueDays, VOI_DEFAULTS.minutesDueDays),
  };
}

/** The item-kind record, exported for the reader without a second table. */
export function voiceItemKind(kind) {
  return VOI_ITEM_KIND_BY_KEY[kind] || null;
}
