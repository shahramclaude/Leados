/**
 * app/core/domain/mutualAidSchema.js — the fail-closed storage contract of the
 * Mutual-Aid Activation & Resource-Commitment Register (ADR-0244, Schema v198).
 *
 * SEVEN COLLECTIONS, ALL EMPTY AT UPGRADE: `mutualAidAgreements`,
 * `mutualAidRequests`, `mutualAidAcceptances`, `mutualAidArrivals`,
 * `mutualAidWithdrawals`, `mutualAidReleases` and the rule's `mutualAidMarkers`.
 * Nothing derived is stored — no state, no close day, no days-overdue figure, no
 * days-late figure, no coverage verdict. Every one of those is recomputed on
 * read, because a stored promise is a promise that can disagree with the arrival
 * beside it, and the disagreement would surface as a commander planning around
 * help that never came.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here completes a missing agreement, repairs a validity, invents an
 * acceptance, re-dates an arrival, or rescues a row that points at an agreement
 * or a request this loader was not handed. A row that cannot be read exactly is
 * DROPPED with a counted warning, and the screen prints the count.
 *
 * THE SEVEN LOADER RULES THAT CARRY THE MANDATE:
 *   1. AN AGREEMENT WITH NO WRITTEN REFERENCE is dropped. A bilateral
 *      arrangement is the document; without its written reference the register
 *      would hold a partnership with no instrument behind it, and a request made
 *      under it would be a request nobody was ever bound to answer.
 *   2. A REQUEST WITH NO AGREEMENT, NO SUBJECT OR A MISSING VALIDITY is dropped.
 *      There is no default validity anywhere in this file: a window that has to
 *      be guessed is exactly the plausible default the Bulletproof Reliability
 *      Mandate forbids, and a request under no agreement is a commitment with no
 *      basis.
 *   3. AN ACCEPTANCE WITH NO WRITTEN CONFIRMATION, OR A SECOND ACCEPTANCE TO
 *      THE SAME REQUEST, is dropped. Acceptance is the partner's own act and it
 *      is cited to the partner's own written confirmation; an acceptance nobody
 *      can point to is an inferred promise. A second acceptance is a promise
 *      somebody already made being overwritten.
 *   4. AN ARRIVAL WITH NO ACCEPTANCE, OR A SECOND ARRIVAL TO THE SAME PROMISE,
 *      is dropped. Help cannot arrive against a promise that is not on the
 *      record, and one arrival per promise is the only reading of "the day the
 *      help actually came" that cannot be overwritten by a later note.
 *   5. A WITHDRAWAL OR A RELEASE WITH NO ACCEPTANCE is dropped, and a RELEASE
 *      DATED BEFORE ITS WITHDRAWAL is KEPT, NEVER REPAIRED. The release-before-
 *      withdrawal ordering is unreachable through the door — the commands refuse
 *      it — but a hand-edited or imported file that carries one is carrying the
 *      exact fact this register exists to surface, and dropping it would erase
 *      the breach.
 *   6. A CANCELLATION DATED AFTER THE ACCEPTANCE IS KEPT, NEVER REPAIRED, and a
 *      cancellation with no acceptance is kept only when it is dated before any
 *      acceptance would have been possible. A cancellation closes a request that
 *      was still awaiting an answer; the exact ordering is the fact.
 *   7. RESOURCE LINES ARRIVE WHOLE. A line with an unknown kind, a non-integer
 *      quantity or a quantity outside the declared bounds is dropped rather than
 *      clamped: the coverage comparison is exact integer arithmetic, and a
 *      rounded line would make a shortfall print as a different number.
 */

import {
  MAA_BOUNDS,
  MAA_DEFAULTS,
  MAA_LIMITS as L,
  MAA_REQUEST_KIND_KEYS,
  MAA_SETTING_KEYS,
} from './mutualAidRegistry.js';
import { maaDay, normaliseResourceLines } from './mutualAidMath.js';
import { daysBetween } from '../time.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value, max = L.idMax) => {
  const candidate = text(value, max);
  return ID_RE.test(candidate) ? candidate : null;
};

/** A partner organisation's name: bounded and non-empty, never a placeholder. */
export function maaName(value) {
  const candidate = text(value, L.nameMax + 40);
  if (candidate.length < L.nameMin) return null;
  return candidate.slice(0, L.nameMax);
}

/** The subject of a request — what help is actually being asked for. */
export function maaSubject(value) {
  const candidate = text(value, L.subjectMax + 60);
  if (candidate.length < L.subjectMin) return null;
  return candidate.slice(0, L.subjectMax);
}

/** The written bilateral agreement a request is made under. */
export function maaAgreementRef(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.agreementRefMin) return null;
  return candidate.slice(0, L.textMax);
}

/** The partner's own written confirmation that it accepts. */
export function maaConfirmationRef(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.confirmationRefMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A written note — a scope note, a reason, a citation. */
export function maaNote(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A declared request validity in whole days, or null. Never defaulted. */
export function maaValidity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.validityMin || value > L.validityMax) return null;
  return value;
}

/** A declared quantity of one resource line, or null. */
export function maaQuantity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.quantityMin || value > L.quantityMax) return null;
  return value;
}

/* -------------------------------------------------------------- agreements */

export function normalizeMutualAidAgreements(rows, warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the agreement ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.agreements) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const partnerOrg = maaName(row.partnerOrg);
    const agreementRef = maaAgreementRef(row.agreementRef);
    const agreedOn = maaDay(row.agreedOn);
    const expiresOn = row.expiresOn === null || row.expiresOn === undefined || row.expiresOn === '' ? null : maaDay(row.expiresOn);
    const scopeNote = text(row.scopeNote, L.textMax);
    const declaredById = id(row.declaredById);
    if (!rowId || seen.has(rowId) || !partnerOrg || !agreementRef || !agreedOn || !declaredById) {
      dropped += 1;
      continue;
    }
    if (row.expiresOn && expiresOn === null) { dropped += 1; continue; }
    // An agreement whose term ends before it begins is not an agreement.
    if (expiresOn && daysBetween(agreedOn, expiresOn) < 0) { dropped += 1; continue; }
    seen.add(rowId);
    out.push({
      id: rowId,
      partnerOrg,
      agreementRef,
      agreedOn,
      expiresOn,
      scopeNote,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} agreement row(s) could not be read exactly — an id, a partner name, a written reference, an agreement day, a term that runs backwards or a declaring seat — and were dropped. Nothing was repaired.`);
  return out;
}

/* ---------------------------------------------------------------- requests */

export function normalizeMutualAidRequests(rows, agreements = [], warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the request ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(agreements).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.requests) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const agreementId = id(row.agreementId);
    const agreement = agreementId ? parents.get(agreementId) : null;
    const subject = maaSubject(row.subject);
    const kind = MAA_REQUEST_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const openedOn = maaDay(row.openedOn);
    const validityDays = maaValidity(row.validityDays);
    const requestingLineIds = [...new Set(list(row.requestingLineIds).map((value) => id(value)).filter(Boolean))];
    const declaredById = id(row.declaredById);
    // A cancellation is a dated act stored on the request itself: one per
    // request, enforced by the door. The loader keeps a cancellation dated
    // AFTER the acceptance — that ordering is the `breach-cancelled-after-
    // acceptance` fact the register exists to surface, and dropping it would
    // erase it. A cancellation dated before the request was opened is an
    // unreadable pairing and is dropped.
    const cancelledOn = row.cancelledOn === null || row.cancelledOn === undefined || row.cancelledOn === '' ? null : maaDay(row.cancelledOn);
    const cancelledById = row.cancelledById === null || row.cancelledById === undefined || row.cancelledById === '' ? null : id(row.cancelledById);
    if (row.cancelledOn && cancelledOn === null) { dropped += 1; continue; }
    if (cancelledOn && daysBetween(openedOn, cancelledOn) < 0) { dropped += 1; continue; }
    const askedLines = normaliseResourceLines(row.askedLines, MAA_REQUEST_KIND_KEYS, warnings);
    // A request whose ask is EMPTY after the line filter is dropped: a request
    // that cannot say what it asked for cannot be compared against a promise,
    // and an empty ask would make every acceptance read as "as asked".
    if (!rowId || seen.has(rowId) || !agreement || !subject || !kind || !openedOn || validityDays === null
      || !requestingLineIds.length || !askedLines.length || !declaredById) {
      dropped += 1;
      continue;
    }
    seen.add(rowId);
    out.push({
      id: rowId,
      agreementId,
      partnerOrg: agreement.partnerOrg,
      subject,
      kind,
      openedOn,
      validityDays,
      requestingLineIds,
      askedLines,
      cancelledOn,
      cancelledById,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} request row(s) could not be read exactly — an unknown agreement, a subject, a kind, a day, a declared validity, a requesting line, a declaring seat or an unreadable resource line — and were dropped. Nothing was repaired and no validity was guessed.`);
  return out;
}

/* ------------------------------------------------------------- acceptances */

export function normalizeMutualAidAcceptances(rows, requests = [], warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the acceptance ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(requests).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const perRequest = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.acceptances) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const requestId = id(row.requestId);
    const request = requestId ? parents.get(requestId) : null;
    const acceptedOn = maaDay(row.acceptedOn);
    const confirmationRef = maaConfirmationRef(row.confirmationRef);
    const acceptingHand = text(row.acceptingHand, L.shortMax);
    const promisedArrivalOn = maaDay(row.promisedArrivalOn);
    const promisedLines = normaliseResourceLines(row.promisedLines, MAA_REQUEST_KIND_KEYS, warnings);
    const recordedById = id(row.recordedById);
    if (!rowId || seen.has(rowId) || !request || !acceptedOn || !confirmationRef || !promisedArrivalOn
      || !promisedLines.length || !recordedById) {
      dropped += 1;
      continue;
    }
    // One acceptance per request: a promise is a promise somebody made, and a
    // second one would overwrite it.
    if (perRequest.has(requestId)) { dropped += 1; continue; }
    seen.add(rowId);
    perRequest.add(requestId);
    out.push({
      id: rowId,
      requestId,
      acceptedOn,
      confirmationRef,
      acceptingHand,
      promisedArrivalOn,
      promisedLines,
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} acceptance row(s) could not be read exactly — an unknown request, an acceptance day, a written confirmation, a promised arrival day, a promised resource line, a recording seat or a second acceptance to the same request — and were dropped.`);
  return out;
}

/* --------------------------------------------------------------- arrivals */

export function normalizeMutualAidArrivals(rows, acceptances = [], warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the arrival ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(acceptances).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const perAcceptance = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.arrivals) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const acceptanceId = id(row.acceptanceId);
    const acceptance = acceptanceId ? parents.get(acceptanceId) : null;
    const arrivedOn = maaDay(row.arrivedOn);
    const arrivedLines = normaliseResourceLines(row.arrivedLines, MAA_REQUEST_KIND_KEYS, warnings);
    const recordedById = id(row.recordedById);
    if (!rowId || seen.has(rowId) || !acceptance || !arrivedOn || !arrivedLines.length || !recordedById) {
      dropped += 1;
      continue;
    }
    // One arrival per promise: "the day the help actually came" is a single
    // fact, and a second arrival would overwrite it.
    if (perAcceptance.has(acceptanceId)) { dropped += 1; continue; }
    seen.add(rowId);
    perAcceptance.add(acceptanceId);
    out.push({
      id: rowId,
      acceptanceId,
      arrivedOn,
      arrivedLines,
      note: text(row.note, L.textMax),
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} arrival row(s) could not be read exactly — an unknown acceptance, an arrival day, an arrived resource line, a recording seat or a second arrival against the same promise — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------ withdrawals */

export function normalizeMutualAidWithdrawals(rows, acceptances = [], warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the withdrawal ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(acceptances).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const perAcceptance = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.withdrawals) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const acceptanceId = id(row.acceptanceId);
    const acceptance = acceptanceId ? parents.get(acceptanceId) : null;
    const withdrawnOn = maaDay(row.withdrawnOn);
    const recordedById = id(row.recordedById);
    if (!rowId || seen.has(rowId) || !acceptance || !withdrawnOn || !recordedById) {
      dropped += 1;
      continue;
    }
    if (perAcceptance.has(acceptanceId)) { dropped += 1; continue; }
    seen.add(rowId);
    perAcceptance.add(acceptanceId);
    out.push({
      id: rowId,
      acceptanceId,
      withdrawnOn,
      note: text(row.note, L.textMax),
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} withdrawal row(s) could not be read exactly — an unknown acceptance, a withdrawal day, a recording seat or a second withdrawal against the same promise — and were dropped.`);
  return out;
}

/* --------------------------------------------------------------- releases */

export function normalizeMutualAidReleases(rows, acceptances = [], withdrawals = [], warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the release ledger was not an array; it was read as empty');
    return [];
  }
  const acceptanceById = new Map(list(acceptances).map((row) => [row.id, row]));
  const withdrawalByAcceptance = new Map();
  for (const row of list(withdrawals)) {
    if (row && row.acceptanceId) withdrawalByAcceptance.set(row.acceptanceId, row);
  }
  const out = [];
  const seen = new Set();
  const perAcceptance = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.releases) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const acceptanceId = id(row.acceptanceId);
    const acceptance = acceptanceId ? acceptanceById.get(acceptanceId) : null;
    const releasedOn = maaDay(row.releasedOn);
    const recordedById = id(row.recordedById);
    if (!rowId || seen.has(rowId) || !acceptance || !releasedOn || !recordedById) {
      dropped += 1;
      continue;
    }
    if (perAcceptance.has(acceptanceId)) { dropped += 1; continue; }
    seen.add(rowId);
    perAcceptance.add(acceptanceId);
    out.push({
      id: rowId,
      acceptanceId,
      releasedOn,
      note: text(row.note, L.textMax),
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} release row(s) could not be read exactly — an unknown acceptance, a release day, a recording seat or a second release against the same commitment — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------------ markers */

export function normalizeMutualAidMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[mutual-aid] ${message}`);
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
      kind: id(row.kind, 60) || 'mutual-aid',
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
 * Note what is NOT here: a request validity. The window a request stays open is
 * a fact about each request and the situation it was made in, so it is declared
 * per request and bounded in `MAA_LIMITS`. A workspace-level default would be
 * the plausible default this register refuses to hold.
 */
export function normalizeMutualAidSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [MAA_SETTING_KEYS.autoPropagate]: s[MAA_SETTING_KEYS.autoPropagate] !== false,
    [MAA_SETTING_KEYS.privacyFloor]: clampBound(s[MAA_SETTING_KEYS.privacyFloor], MAA_BOUNDS.privacyFloor, MAA_DEFAULTS.privacyFloor),
    [MAA_SETTING_KEYS.releaseGraceDays]: clampBound(s[MAA_SETTING_KEYS.releaseGraceDays], MAA_BOUNDS.releaseGraceDays, MAA_DEFAULTS.releaseGraceDays),
  };
}
