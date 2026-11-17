/**
 * app/core/domain/authorisationSchema.js — the fail-closed storage contract of the
 * Statutory Authorisation & Licence-to-Operate Register (ADR-0247, Schema v201).
 *
 * SIX COLLECTIONS, ALL EMPTY AT UPGRADE: `ltoAuthorisations`, `ltoConditions`,
 * `ltoEvidence`, `ltoActions`, `ltoRenewals` and the rule’s `ltoMarkers`. Nothing
 * derived is stored — no state, no effective expiry, no days lapsed, no condition
 * verdict, no renewal verdict. Each is recomputed on read, because a status written
 * into a file is a status that can disagree with the expiry beside it, and the
 * disagreement would surface as a director believing a consent was held.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here completes a missing instrument, repairs a reversed span, guesses
 * which authority a condition belongs to, re-dates a notice, re-points a renewal at
 * a different licence, or rescues a row that names a person off the roster. A row
 * that cannot be read exactly is DROPPED with a counted warning, and the screen
 * prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. An authority with NO WRITTEN INSTRUMENT REFERENCE is DROPPED. Holding a
 *      power to operate is a grant on an instrument; an authority nobody can trace
 *      to one is exactly the plausible default the Bulletproof Reliability Mandate
 *      forbids.
 *   2. An authority whose DECLARED SPAN is empty, reversed or longer than the bound
 *      is DROPPED, and so is one whose RENEWAL LEAD is not a declared whole number
 *      of days. A repaired lead would print a responsible start date no human set.
 *   3. A HOLDER LIST IS READ WHOLE OR NOT AT ALL. One to four accountable people,
 *      every one a valid id, none repeated. If a holder id is unreadable the whole
 *      authority is dropped rather than read with one line invisible — the exact
 *      matrix failure the mandate names.
 *   4. A CONDITION belongs to an authority this loader was handed, and its
 *      `conditionKey` is unique within that authority. A second condition with the
 *      same key is dropped, because two windows under one key would make the
 *      evidence age ambiguous.
 *   5. EVIDENCE belongs to a condition this loader was handed, and two evidence
 *      rows at the same instant are ONE row: the later is dropped rather than
 *      counted twice.
 *   6. A REGULATOR ACTION is served and effective in that order, carries a written
 *      basis, and an improvement notice carries the compliance day its instrument
 *      set. An action that cannot be closed is still readable: close fields on a
 *      revocation or a variation are kept and PRINTED as having no effect, never
 *      silently discarded, because discarding them would hide a person believing
 *      they had lifted a revocation.
 *   7. A RENEWAL carries its submission instant and a written basis. A decision
 *      arrives whole or not at all; a GRANTED decision must carry a new expiry
 *      strictly later than the authority’s declared expiry, because a “grant” that
 *      shortens validity is not a grant; a REFUSED decision must carry none.
 */

import { dayKey } from '../time.js';
import { LTO_ACTION_KIND_BY_KEY, LTO_BOUNDS, LTO_CLOSE_KIND_BY_KEY, LTO_DEFAULTS, LTO_LIMITS as L, LTO_RENEWAL_DECISION_KEYS, LTO_SETTING_KEYS } from './authorisationRegistry.js';
import { instantMs } from './authorisationMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function ltoInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A site, an activity or an issuing authority: bounded and non-empty. */
export function ltoShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A written condition, basis or note: long enough to be a source, bounded. */
export function ltoReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** The written instrument reference an authority is held under. */
export function ltoInstrument(value) {
  const candidate = text(value, L.shortMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A declared renewal lead in whole days. `0` is legitimate. Never rounded. */
export function ltoLeadDays(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > L.leadDaysMax) return null;
  return value;
}

/** A declared condition re-evidence window in whole days. `0` means no window. */
export function ltoMaxAgeDays(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > L.conditionMaxAgeDays) return null;
  return value;
}

/** The compliance day a notice set. A date-only value, normalised to UTC. */
export function ltoDayKey(value) {
  const candidate = text(value, 40);
  if (!DAY_RE.test(candidate)) return null;
  if (dayKey(`${candidate}T00:00:00.000Z`) !== candidate) return null;
  return candidate;
}

/** One to four accountable hands, every one a valid id, none repeated. */
export function ltoHolders(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    const holderId = id(raw);
    if (!holderId) return null;
    if (!out.includes(holderId)) out.push(holderId);
  }
  if (!out.length || out.length > L.holdersMax) return null;
  return out;
}

/* ----------------------------------------------------------- authorisations */

/**
 * Authorities. A row that cannot be read exactly is DROPPED with a counted
 * warning: no repaired span, no invented instrument, no partial holder list.
 *
 * An authority whose holders are no longer on the roster is NOT dropped here — the
 * reader prints it as an orphan with its reason, because dropping it would silently
 * delete a live legal authority from the record.
 */
export function normalizeLtoAuthorisations(rows, warnings = []) {
  const warn = (message) => warnings.push(`[authorisations] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the authority ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.authorisations) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const siteRef = ltoShort(row.siteRef);
    const activityRef = ltoShort(row.activityRef);
    const authority = ltoShort(row.issuingAuthority ?? row.authority);
    const instrumentRef = ltoInstrument(row.instrumentRef);
    const grantedAt = ltoInstant(row.grantedAt);
    const expiresAt = ltoInstant(row.expiresAt);
    const renewalLeadDays = ltoLeadDays(row.renewalLeadDays);
    const accountableIds = ltoHolders(row.accountableIds);
    const declaredById = id(row.declaredById);

    if (!rowId || seen.has(rowId) || !siteRef || !activityRef || !authority || !instrumentRef
      || !grantedAt || !expiresAt || renewalLeadDays === null || !accountableIds || !declaredById) {
      dropped += 1;
      continue;
    }

    const grantedMs = instantMs(grantedAt);
    const expiresMs = instantMs(expiresAt);
    if (expiresMs <= grantedMs) { dropped += 1; continue; }
    if ((expiresMs - grantedMs) / 86_400_000 > L.spanMaxDays) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      siteRef,
      activityRef,
      issuingAuthority: authority,
      instrumentRef,
      grantedAt,
      expiresAt,
      renewalLeadDays,
      accountableIds,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} authority row(s) could not be read exactly — an unreadable id, site, activity, issuing body, instrument reference, grant, expiry, renewal lead or holder list — and were dropped. Nothing was repaired.`);
  return out;
}

/* ---------------------------------------------------------------- conditions */

/**
 * Conditions. A condition belongs to an authority this loader was handed, and its
 * `conditionKey` is unique within that authority. `maxAgeDays = 0` is a deliberate
 * declaration that the condition carries no re-evidence window; it is stored as
 * such and printed as such.
 */
export function normalizeLtoConditions(rows, authorisations = [], warnings = []) {
  const warn = (message) => warnings.push(`[authorisations] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the condition ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(authorisations).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const keysByAuthority = new Map();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.conditions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const authorisationId = id(row.authorisationId);
    const parent = authorisationId ? parents.get(authorisationId) : null;
    const conditionKey = id(row.conditionKey);
    const conditionRef = ltoReason(row.conditionRef);
    const maxAgeDays = ltoMaxAgeDays(row.maxAgeDays);

    if (!rowId || seen.has(rowId) || !parent || !conditionKey || !conditionRef || maxAgeDays === null) {
      dropped += 1;
      continue;
    }
    const held = keysByAuthority.get(authorisationId) || new Set();
    if (held.has(conditionKey)) { dropped += 1; continue; }
    held.add(conditionKey);
    keysByAuthority.set(authorisationId, held);

    seen.add(rowId);
    out.push({
      id: rowId,
      authorisationId,
      conditionKey,
      conditionRef,
      maxAgeDays,
      declaredById: id(row.declaredById),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} condition row(s) could not be read exactly — an unreadable id, authority, condition key, written condition or re-evidence window, or a duplicate key under one authority — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ evidence */

/**
 * Evidence. Admitted only through a condition this loader was handed. Two rows at
 * the same instant are one row: the later is dropped rather than counted twice,
 * because a doubled affirmation would inflate the only figure that says how often
 * anybody checked.
 */
export function normalizeLtoEvidence(rows, conditions = [], warnings = []) {
  const warn = (message) => warnings.push(`[authorisations] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the evidence ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(conditions).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const instants = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.evidence) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const conditionId = id(row.conditionId);
    const parent = conditionId ? parents.get(conditionId) : null;
    const evidenceRef = ltoInstrument(row.evidenceRef);
    const at = ltoInstant(row.at);
    const byId = id(row.byId);

    if (!rowId || seen.has(rowId) || !parent || !evidenceRef || !at || !byId) { dropped += 1; continue; }
    const key = `${conditionId}::${at}`;
    if (instants.has(key)) { dropped += 1; continue; }
    instants.add(key);

    seen.add(rowId);
    out.push({
      id: rowId,
      conditionId,
      evidenceRef,
      at,
      byId,
      note: text(row.note, L.textMax),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} evidence row(s) could not be read exactly — an unreadable id, condition, evidence reference, instant or hand, or a second affirmation at the same instant — and were dropped. Nothing was repaired.`);
  return out;
}

/* ---------------------------------------------------------- regulator actions */

/**
 * Regulator actions. The action is served and effective in that order and carries
 * a written basis. An improvement notice carries the compliance day its own
 * instrument set. Close fields arrive whole or not at all on a closable kind, and
 * the close kind must be one that kind permits.
 *
 * CLOSE FIELDS ON A NON-CLOSABLE KIND ARE KEPT AND FLAGGED, NOT DROPPED. A
 * revocation with “closure” fields on it is a record of somebody believing they
 * lifted a revocation. Deleting the row would erase the revocation; deleting the
 * fields would erase the belief. The reader prints both.
 */
export function normalizeLtoActions(rows, authorisations = [], warnings = []) {
  const warn = (message) => warnings.push(`[authorisations] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the regulator-action ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(authorisations).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.actions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const authorisationId = id(row.authorisationId);
    const parent = authorisationId ? parents.get(authorisationId) : null;
    const kind = LTO_ACTION_KIND_BY_KEY[row.kind] ? row.kind : null;
    const definition = kind ? LTO_ACTION_KIND_BY_KEY[kind] : null;
    const servedAt = ltoInstant(row.servedAt);
    const effectiveFrom = ltoInstant(row.effectiveFrom);
    const basisRef = ltoReason(row.basisRef);
    const noticeRef = row.noticeRef ? (ltoShort(row.noticeRef) || null) : null;
    const scopeRef = row.scopeRef ? (ltoShort(row.scopeRef) || null) : null;
    const recordedById = id(row.recordedById);
    const dueOn = row.dueOn === undefined || row.dueOn === null || row.dueOn === '' ? null : ltoDayKey(row.dueOn);

    if (!rowId || seen.has(rowId) || !parent || !definition || !servedAt || !effectiveFrom || !basisRef || !recordedById) {
      dropped += 1;
      continue;
    }
    if (instantMs(effectiveFrom) < instantMs(servedAt)) { dropped += 1; continue; }
    if (row.dueOn && !dueOn) { dropped += 1; continue; }
    if (definition.dueRequired && !dueOn) { dropped += 1; continue; }

    const closedAtRaw = row.closedAt === null || row.closedAt === undefined || row.closedAt === '' ? null : ltoInstant(row.closedAt);
    const closeKind = row.closeKind ? (LTO_CLOSE_KIND_BY_KEY[row.closeKind] ? row.closeKind : null) : null;
    const closeBasisRef = row.closeBasisRef ? (ltoReason(row.closeBasisRef) || null) : null;
    const closedById = row.closedById ? id(row.closedById) : null;
    const closePresent = [closedAtRaw, closeKind, closeBasisRef, closedById].filter((value) => value !== null).length;
    /** Presence measured on the RAW fields, so an unreadable close kind still counts. */
    const closeFieldsPresent = [row.closedAt, row.closeKind, row.closeBasisRef, row.closedById]
      .filter((value) => value !== null && value !== undefined && value !== '').length;

    let closeIgnored = false;
    let ignoredClose = null;
    let closedAt = null;
    if (!definition.closable) {
      /**
       * IDEMPOTENT BY CONSTRUCTION. On the first pass the raw fields are present and
       * are kept in `ignoredClose`; on a later pass the raw fields are already null,
       * so the flag and the payload are carried from the row. Without this, a second
       * normalisation would silently forget that somebody had recorded a lift against
       * a revocation — the exact fact the screen must print.
       */
      closeIgnored = closeFieldsPresent > 0 || row.closeIgnored === true;
      if (closeFieldsPresent > 0) {
        ignoredClose = {
          at: closedAtRaw,
          kind: typeof row.closeKind === 'string' ? row.closeKind.slice(0, 60) : null,
          basisRef: closeBasisRef,
          byId: closedById,
        };
      } else if (isPlainObject(row.ignoredClose)) {
        ignoredClose = {
          at: ltoInstant(row.ignoredClose.at),
          kind: typeof row.ignoredClose.kind === 'string' ? row.ignoredClose.kind.slice(0, 60) : null,
          basisRef: ltoReason(row.ignoredClose.basisRef) || null,
          byId: id(row.ignoredClose.byId),
        };
      }
    } else {
      if (closePresent !== 0 && closePresent !== 4) { dropped += 1; continue; }
      if (closePresent === 4) {
        if (!definition.closeKinds.includes(closeKind)) { dropped += 1; continue; }
        if (instantMs(closedAtRaw) < instantMs(effectiveFrom)) { dropped += 1; continue; }
        closedAt = closedAtRaw;
      }
    }

    seen.add(rowId);
    out.push({
      id: rowId,
      authorisationId,
      kind,
      servedAt,
      effectiveFrom,
      basisRef,
      noticeRef,
      scopeRef,
      dueOn,
      recordedById,
      closedAt,
      closeKind: closedAt ? closeKind : null,
      closeBasisRef: closedAt ? closeBasisRef : null,
      closedById: closedAt ? closedById : null,
      /** True when closure fields were recorded against an action that cannot close. */
      closeIgnored,
      ignoredClose,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} regulator-action row(s) could not be read exactly — an unreadable id, authority, kind, served instant, effective instant, written basis, compliance day or close — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------- renewals */

/**
 * Renewals. A submission is not a decision. A decision arrives whole or not at
 * all, a granted decision carries a new expiry strictly AFTER the authority’s
 * declared expiry, and a refused decision carries no expiry at all.
 */
export function normalizeLtoRenewals(rows, authorisations = [], warnings = []) {
  const warn = (message) => warnings.push(`[authorisations] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the renewal ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(authorisations).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.renewals) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const authorisationId = id(row.authorisationId);
    const parent = authorisationId ? parents.get(authorisationId) : null;
    const submittedAt = ltoInstant(row.submittedAt);
    const basisRef = ltoReason(row.basisRef);
    const submittedById = id(row.submittedById);
    const decision = row.decision ? (LTO_RENEWAL_DECISION_KEYS.includes(row.decision) ? row.decision : null) : null;
    const decidedAtRaw = row.decidedAt === null || row.decidedAt === undefined || row.decidedAt === '' ? null : ltoInstant(row.decidedAt);
    const grantedExpiresAtRaw = row.grantedExpiresAt === null || row.grantedExpiresAt === undefined || row.grantedExpiresAt === '' ? null : ltoInstant(row.grantedExpiresAt);
    const decidedById = row.decidedById ? id(row.decidedById) : null;

    if (!rowId || seen.has(rowId) || !parent || !submittedAt || !basisRef || !submittedById) { dropped += 1; continue; }

    const decisionPresent = [decision, decidedAtRaw, decidedById].filter((value) => value !== null).length;
    if (row.decision && !decision) { dropped += 1; continue; }
    if (decisionPresent !== 0 && decisionPresent !== 3) { dropped += 1; continue; }
    if (decisionPresent === 3 && instantMs(decidedAtRaw) < instantMs(submittedAt)) { dropped += 1; continue; }
    if (decision === 'granted') {
      if (!grantedExpiresAtRaw) { dropped += 1; continue; }
      if (instantMs(grantedExpiresAtRaw) <= instantMs(parent.expiresAt)) { dropped += 1; continue; }
    }
    if (decision === 'refused' && grantedExpiresAtRaw) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      authorisationId,
      submittedAt,
      basisRef,
      submittedById,
      decision: decisionPresent === 3 ? decision : null,
      decidedAt: decisionPresent === 3 ? decidedAtRaw : null,
      grantedExpiresAt: decision === 'granted' ? grantedExpiresAtRaw : null,
      decidedById: decisionPresent === 3 ? decidedById : null,
      note: text(row.note, L.textMax),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} renewal row(s) could not be read exactly — an unreadable id, authority, submission instant, written basis, submitting hand, half-decided decision, a grant with no expiry or a grant that would shorten validity — and were dropped. Nothing was repaired.`);
  return out;
}

/* -------------------------------------------------------------------- markers */

/** Identity-free observations written by the rule when nobody can be asked. */
export function normalizeLtoMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[authorisations] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the observation-marker ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const key = text(row.key, 240);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      at: typeof row.at === 'string' ? row.at : '',
      ruleId: typeof row.ruleId === 'string' ? row.ruleId : '',
      kind: typeof row.kind === 'string' ? row.kind : '',
      detail: text(row.detail, 400),
    });
    if (out.length >= L.markers) break;
  }
  return out;
}

/* ------------------------------------------------------------------- settings */

const clampBound = (value, bound, fallback) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < bound.min) return bound.min;
  if (n > bound.max) return bound.max;
  return n;
};

/**
 * The register’s conventions, clamped on load and REFUSED (never clamped) by the
 * setter. Keyed by the FULL setting keys they are persisted under.
 *
 * Note what is NOT here: a renewal window, a validity and a condition window. All
 * three are facts about a particular authority and its particular instrument,
 * declared on the row, so the workspace has no default that could one day decide a
 * consent was still good.
 */
export function normalizeLtoSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [LTO_SETTING_KEYS.autoPropagate]: s[LTO_SETTING_KEYS.autoPropagate] !== false,
    [LTO_SETTING_KEYS.privacyFloor]: clampBound(s[LTO_SETTING_KEYS.privacyFloor], LTO_BOUNDS.privacyFloor, LTO_DEFAULTS.privacyFloor),
    [LTO_SETTING_KEYS.horizonDays]: clampBound(s[LTO_SETTING_KEYS.horizonDays], LTO_BOUNDS.horizonDays, LTO_DEFAULTS.horizonDays),
  };
}
