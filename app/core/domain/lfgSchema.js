/**
 * app/core/domain/lfgSchema.js — the fail-closed storage contract of the Claim,
 * Limitation & Settlement-Authority Register (ADR-0248, Schema v202).
 *
 * SEVEN COLLECTIONS, ALL EMPTY AT UPGRADE: `lfgMatters`, `lfgAccruals`, `lfgStays`,
 * `lfgResolutions`, `lfgConcessions`, `lfgAuthorityGrants` and the rule's
 * `lfgMarkers`. Nothing derived is stored — no state, no deadline, no days remaining,
 * no computed ceiling, no paid total, no `time-barred` flag. Each is recomputed on
 * read, because a stored deadline is a deadline that can disagree with the accrual
 * beside it, and the disagreement would surface as a general counsel believing a
 * claim was still in time.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents an accrual, completes a missing period, repairs a reversed
 * span, re-dates a stay, re-points a concession at a different matter, or rescues a
 * row that names a person off the roster. A row that cannot be read exactly is
 * DROPPED with a counted warning, and the screen prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A MATTER with no written reference on the document that started the clock, no
 *      party, no claim type, no forum and no responsible hand is DROPPED. A claim
 *      nobody can trace to a document is exactly the plausible default the
 *      Bulletproof Reliability Mandate forbids.
 *   2. A MATTER whose CLAIM TYPE is not one this register carries is KEPT — the claim
 *      is real whether or not the register knows its rule — but it must then carry
 *      its own written accrual rule, and the reader prints it as an unsupported type
 *      rather than pretending to know the period. Dropping it would erase a real
 *      claim from the record because the workspace lacked a vocabulary entry.
 *   3. AN ACCRUAL is one per matter, carries the day and the rule it relied on, and
 *      a knowledge-based type must carry the knowledge day. An accrual without a
 *      basis is DROPPED, because the basis is the one thing that distinguishes a
 *      derived clock from a date somebody typed.
 *   4. A STAY belongs to a matter this loader was handed, carries its kind, its span
 *      and the evidence its own kind requires. A stay whose evidence is absent is
 *      KEPT with `proved: false` — it is an allegation, it moves no deadline, and
 *      the reader prints what is missing rather than deleting the fact that somebody
 *      believed the clock had stopped.
 *   5. A RESOLUTION is one per matter, carries its kind and its day, and a kind that
 *      requires an amount must carry an exact integer amount in a three-letter
 *      currency. A resolution with no day is DROPPED; a settlement with no amount is
 *      DROPPED, because "it settled" with no number is not a record of a settlement.
 *   6. A CONCESSION carries its kind, its day, its written basis and — where the kind
 *      moves money — an exact integer amount. A concession with no basis is DROPPED:
 *      money moved on the record and nobody said why is worse than no row.
 *   7. AN AUTHORITY GRANT names a person, the scope it covers and the ceiling in
 *      minor units. A grant with no ceiling or no person is DROPPED. Nothing here
 *      derives a ceiling; the reader does, from the graph, and compares.
 *
 * A NOTE ON WHAT IS NOT DROPPED. A matter whose responsible hands are no longer on
 * the roster is NOT dropped here — the reader prints it as an orphan with its reason,
 * because dropping it would silently delete a live claim from the record.
 */

import { dayKey } from '../time.js';
import {
  LFG_BOUNDS,
  LFG_CLAIM_TYPE_KEYS,
  LFG_CONCESSION_KIND_KEYS,
  LFG_DEFAULTS,
  LFG_LIMITS as L,
  LFG_RESOLUTION_KIND_BY_KEY,
  LFG_STAY_KIND_BY_KEY,
  LFG_SETTING_KEYS,
} from './lfgRegistry.js';
import { instantMs, minorUnits, staySpanDays } from './lfgMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function lfgInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A party, forum or claim-type label: bounded and non-empty. */
export function lfgShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A written basis, rule or note: long enough to be a source, bounded. */
export function lfgReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** The written reference on the document that started the clock. */
export function lfgInstrument(value) {
  const candidate = text(value, L.shortMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A `YYYY-MM-DD` day, normalised to UTC, or null. */
export function lfgDayKey(value) {
  const candidate = text(value, 40);
  if (!DAY_RE.test(candidate)) return null;
  if (dayKey(`${candidate}T00:00:00.000Z`) !== candidate) return null;
  return candidate;
}

/** A declared limitation period in whole months. `> 0`, bounded. Never defaulted. */
export function lfgPeriodMonths(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value <= 0 || value > L.periodMonthsMax) return null;
  return value;
}

/** A three-letter currency code, upper-cased, or null. */
export function lfgCurrency(value) {
  const candidate = text(value, 8).toUpperCase();
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

/**
 * One to four responsible hands, every one a valid id, none repeated.
 * Read WHOLE or not at all: a partial holder list is the exact matrix failure the
 * mandate names — one line would silently be invisible to every roll-up.
 */
export function lfgHolders(value) {
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

/* ------------------------------------------------------------------- matters */

/**
 * Matters. A row that cannot be read exactly is DROPPED with a counted warning: no
 * invented reference, no guessed type, no repaired holder list.
 *
 * A matter whose responsible hands are off the roster is KEPT and printed as an
 * orphan by the reader — deleting it would erase a live claim.
 */
export function normalizeLfgMatters(rows, warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the matter ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.matters) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const matterRef = lfgInstrument(row.matterRef);
    const partyRef = lfgShort(row.partyRef);
    const claimType = text(row.claimType, 60) || null;
    const forumRef = lfgShort(row.forumRef);
    const responsibleIds = lfgHolders(row.responsibleIds);
    const openedById = id(row.openedById);
    const openedAt = lfgInstant(row.openedAt);
    const currency = lfgCurrency(row.currency);
    const claimedMinor = row.claimedMinor === undefined || row.claimedMinor === null ? null : minorUnits(row.claimedMinor);

    if (!rowId || seen.has(rowId) || !matterRef || !partyRef || !claimType || !forumRef
      || !responsibleIds || !openedById || !openedAt || !currency) {
      dropped += 1;
      continue;
    }
    // A claimed sum that is present but unreadable drops the row: the amount at risk
    // is the whole point of the matter record, and a null where a sum was written is
    // a figure the screen would render as "not claimed".
    if (row.claimedMinor !== undefined && row.claimedMinor !== null && claimedMinor === null) {
      dropped += 1;
      continue;
    }

    seen.add(rowId);
    out.push({
      id: rowId,
      matterRef,
      partyRef,
      claimType,
      forumRef,
      currency,
      claimedMinor,
      responsibleIds,
      openedById,
      openedAt,
      mergedIntoId: id(row.mergedIntoId) || null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} claim matter row(s) could not be read exactly — an unreadable id, document reference, party, claim type, forum, currency, responsible hand, opener or opening instant, or an amount that is not whole minor units — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ accruals */

/**
 * Accruals. ONE per matter: two accrual days for one cause of action would make the
 * deadline ambiguous, which is the same failure as two renewal lead times on one
 * licence. A knowledge-based claim type must carry the knowledge day AND the basis
 * for it; a type this register does not carry must carry its own written rule.
 */
export function normalizeLfgAccruals(rows, matters = [], warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the accrual ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(matters).map((row) => row.id));
  const out = [];
  const seenMatter = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.accruals) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const accrualDay = lfgDayKey(row.accrualDay);
    const accrualRule = lfgReason(row.accrualRule);
    const declaredById = id(row.declaredById);
    const periodMonths = lfgPeriodMonths(row.periodMonths);
    const knowledgeDay = row.knowledgeDay === undefined || row.knowledgeDay === null ? null : lfgDayKey(row.knowledgeDay);

    if (!rowId || seenId.has(rowId) || !matterId || !accrualDay || !accrualRule || !declaredById || periodMonths === null) {
      dropped += 1;
      continue;
    }
    if (row.knowledgeDay !== undefined && row.knowledgeDay !== null && knowledgeDay === null) {
      dropped += 1;
      continue;
    }
    // A DATE OF KNOWLEDGE THAT PRECEDES THE DAMAGE IS A CONTRADICTION, and the register
    // will not choose between the two days: whichever it picked would be a deadline
    // nobody could defend. The row is dropped and counted.
    if (knowledgeDay && accrualDay && instantMs(`${knowledgeDay}T00:00:00.000Z`) < instantMs(`${accrualDay}T00:00:00.000Z`)) {
      dropped += 1;
      continue;
    }
    if (!matterIds.has(matterId)) { orphan += 1; continue; }
    // Two accruals for one matter is ambiguous, not additive: keep the first and
    // count the rest rather than let a deadline be computed from either at random.
    if (seenMatter.has(matterId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenMatter.add(matterId);
    out.push({
      id: rowId,
      matterId,
      accrualDay,
      accrualRule,
      knowledgeDay,
      periodMonths,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} accrual row(s) name a matter that is not on the record and were dropped. A clock cannot be attached to a matter that does not exist.`);
  if (dropped) warn(`${dropped} accrual row(s) could not be read exactly — an unreadable matter, accrual day, accrual rule, declaring hand or limitation period, a second accrual for one matter, or a knowledge day that is present but not a day — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------------- stays */

/**
 * Stays. A stay belongs to a matter this loader was handed and names its span.
 *
 * AN UNPROVED STAY IS KEPT, NOT DROPPED. `proved` is computed here from the evidence
 * its own kind requires — never stored as a claim by whoever wrote the row. An
 * allegation that the clock stopped is a fact about what somebody believed, and
 * deleting it would erase the belief while leaving the deadline that belief moved.
 * It moves NOTHING; the reader prints what is missing.
 */
export function normalizeLfgStays(rows, matters = [], warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the stay ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(matters).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.stays) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const kind = text(row.kind, 60) || null;
    const instrumentRef = lfgInstrument(row.instrumentRef);
    const fromDay = lfgDayKey(row.fromDay);
    const toDay = lfgDayKey(row.toDay);
    const recordedById = id(row.recordedById);
    const parties = Array.isArray(row.parties)
      ? row.parties.map((part) => lfgShort(part)).filter(Boolean)
      : [];
    const definition = kind ? LFG_STAY_KIND_BY_KEY[kind] : null;

    if (!rowId || seen.has(rowId) || !matterId || !definition || !instrumentRef
      || !fromDay || !toDay || !recordedById) {
      dropped += 1;
      continue;
    }
    const spanDays = staySpanDays(`${fromDay}T00:00:00.000Z`, `${toDay}T00:00:00.000Z`);
    if (spanDays === null || spanDays > L.stayMaxDays) { dropped += 1; continue; }
    if (!matterIds.has(matterId)) { orphan += 1; continue; }

    // PROOF IS COMPUTED, NOT DECLARED. Each kind is proved by exactly the evidence
    // its own definition requires — a standstill needs both parties named, the other
    // three need the instrument reference they carry (which the loader already
    // demanded). Anything short of that is an allegation.
    const missing = [];
    if (kind === 'standstill-agreement' && parties.length < 2) {
      missing.push('both parties named as signatories to the standstill');
    }
    if (kind !== 'standstill-agreement' && !instrumentRef) {
      missing.push('the instrument reference for this suspension');
    }

    seen.add(rowId);
    out.push({
      id: rowId,
      matterId,
      kind,
      instrumentRef,
      parties,
      fromDay,
      toDay,
      spanDays,
      proved: missing.length === 0,
      missing,
      recordedById,
      note: text(row.note, L.textMax),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} stay row(s) name a matter that is not on the record and were dropped. A suspension cannot be attached to a matter that does not exist.`);
  if (dropped) warn(`${dropped} stay row(s) could not be read exactly — an unreadable matter, unknown kind, instrument, start or end day, recording hand, or a reversed or overlong span — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------- resolutions */

/**
 * Resolutions. ONE per matter — a second resolution would mean the matter closed
 * twice for two different amounts. A kind that requires an amount must carry an
 * exact integer in a three-letter currency; a settlement with no sum is dropped,
 * because "it settled" is not a record of a settlement.
 */
export function normalizeLfgResolutions(rows, matters = [], warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the resolution ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(matters).map((row) => row.id));
  const out = [];
  const seenMatter = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.resolutions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const kind = text(row.kind, 60) || null;
    const definition = kind ? LFG_RESOLUTION_KIND_BY_KEY[kind] : null;
    const resolvedDay = lfgDayKey(row.resolvedDay);
    const basisRef = lfgReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const currency = row.currency === undefined || row.currency === null ? null : lfgCurrency(row.currency);
    const amountMinor = row.amountMinor === undefined || row.amountMinor === null ? null : minorUnits(row.amountMinor);

    if (!rowId || seenId.has(rowId) || !matterId || !definition || !resolvedDay || !basisRef || !recordedById) {
      dropped += 1;
      continue;
    }
    if (definition.requiresAmount) {
      if (amountMinor === null || !currency) { dropped += 1; continue; }
    } else if (row.amountMinor !== undefined && row.amountMinor !== null) {
      // A kind that takes no amount carrying one is contradictory: the row would
      // print money against a dismissal. Refused rather than silently stripped.
      dropped += 1;
      continue;
    }
    if (!matterIds.has(matterId)) { orphan += 1; continue; }
    if (seenMatter.has(matterId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenMatter.add(matterId);
    out.push({
      id: rowId,
      matterId,
      kind,
      resolvedDay,
      amountMinor,
      currency,
      basisRef,
      mergedIntoId: definition.key === 'merged' ? (id(row.mergedIntoId) || null) : null,
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} resolution row(s) name a matter that is not on the record and were dropped.`);
  if (dropped) warn(`${dropped} resolution row(s) could not be read exactly — an unreadable matter, unknown kind, resolution day, basis or recording hand, a second resolution for one matter, a settlement with no exact amount and currency, or an amount on a kind that takes none — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------- concessions */

/**
 * Concessions. Every row is money or obligation moving on a stated day with a written
 * basis. A kind that moves money must carry an exact integer minor-unit amount; a
 * concession with no basis is dropped, because money moved on the record and nobody
 * said why is worse than no row at all.
 */
export function normalizeLfgConcessions(rows, matters = [], warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the concession ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(matters).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  let unreadableAmounts = 0;
  for (const row of rows) {
    if (out.length >= L.concessions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const kind = text(row.kind, 60) || null;
    const atDay = lfgDayKey(row.atDay);
    const basisRef = lfgReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const currency = row.currency === undefined || row.currency === null ? null : lfgCurrency(row.currency);
    const amountMinor = row.amountMinor === undefined || row.amountMinor === null ? null : minorUnits(row.amountMinor);

    if (!rowId || seen.has(rowId) || !matterId || !kind || !LFG_CONCESSION_KIND_KEYS.includes(kind)
      || !atDay || !basisRef || !recordedById) {
      dropped += 1;
      continue;
    }
    if (row.amountMinor !== undefined && row.amountMinor !== null && (amountMinor === null || !currency)) {
      // Present but unreadable: counted separately because the row is a real
      // concession whose amount cannot be trusted, and a total that silently
      // skipped it would understate what was conceded.
      unreadableAmounts += 1;
      dropped += 1;
      continue;
    }
    if (!matterIds.has(matterId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      matterId,
      kind,
      atDay,
      amountMinor,
      currency,
      basisRef,
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} concession row(s) name a matter that is not on the record and were dropped.`);
  if (unreadableAmounts) warn(`${unreadableAmounts} concession row(s) carried an amount that is not a whole number of minor units in a three-letter currency and were dropped rather than rounded into a total.`);
  if (dropped - unreadableAmounts > 0) warn(`${dropped - unreadableAmounts} concession row(s) could not be read exactly — an unreadable id, matter, kind, day, written basis or recording hand — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------- authority grants */

/**
 * Authority grants. A grant names a person, the scope it covers and the ceiling in
 * minor units. Nothing here derives a ceiling — the reader computes the ceiling from
 * the reporting graph and compares a settlement against it; this ledger records the
 * authority a human was actually given, so the two facts can be printed apart.
 */
export function normalizeLfgAuthorityGrants(rows, warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the authority-grant ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.authorityGrants) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const personId = id(row.personId);
    const scopeRef = lfgShort(row.scopeRef);
    const currency = lfgCurrency(row.currency);
    const ceilingMinor = minorUnits(row.ceilingMinor);
    const basisRef = lfgReason(row.basisRef);
    const declaredById = id(row.declaredById);
    if (!rowId || seen.has(rowId) || !personId || !scopeRef || !currency || ceilingMinor === null || !basisRef || !declaredById) {
      dropped += 1;
      continue;
    }
    seen.add(rowId);
    out.push({
      id: rowId,
      personId,
      scopeRef,
      currency,
      ceilingMinor,
      basisRef,
      declaredById,
      declaredAt: lfgInstant(row.declaredAt) || '',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} authority-grant row(s) could not be read exactly — an unreadable person, scope, currency, ceiling, written basis or declaring hand — and were dropped. An authority nobody can price is not an authority.`);
  return out;
}

/* ------------------------------------------------------------------- markers */

/** Identity-free observation markers written by RULE-LFG-01. */
export function normalizeLfgMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[claims] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the claim marker ledger was not an array; it was read as empty');
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
      at: lfgInstant(row.at) || '',
      ruleId: text(row.ruleId, 40) || '',
      kind: text(row.kind, 40) || '',
      detail: text(row.detail, 400),
    });
    if (out.length >= L.markers) break;
  }
  return out;
}

/* ------------------------------------------------------------------ settings */

/**
 * The register's conventions. `warningHorizonDays` is a PLANNING convention — how far
 * ahead the bench wants to see — and is deliberately not a limitation period: no
 * default period exists in this register at all.
 *
 * TWO DIFFERENT REFUSALS, DELIBERATELY. At the DOOR an out-of-bounds convention is
 * REFUSED with its reason, so the figure on the screen is always the figure somebody
 * declared. Here, on load, an unreadable value falls back to the declared default
 * rather than being clamped to whatever the bound happens to be — a clamp would print
 * a number nobody chose as though it were a declaration. Either way the workspace never
 * ends up outside its own bounds.
 */
export function normalizeLfgSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  const floorRaw = Number(source[LFG_SETTING_KEYS.privacyFloor]);
  const horizonRaw = Number(source[LFG_SETTING_KEYS.warningHorizonDays]);
  const floor = Number.isInteger(floorRaw) && floorRaw >= LFG_BOUNDS.privacyFloor.min && floorRaw <= LFG_BOUNDS.privacyFloor.max
    ? floorRaw
    : LFG_DEFAULTS.privacyFloor;
  const horizon = Number.isInteger(horizonRaw) && horizonRaw >= LFG_BOUNDS.warningHorizonDays.min && horizonRaw <= LFG_BOUNDS.warningHorizonDays.max
    ? horizonRaw
    : LFG_DEFAULTS.warningHorizonDays;
  return {
    [LFG_SETTING_KEYS.autoPropagate]: source[LFG_SETTING_KEYS.autoPropagate] !== false,
    [LFG_SETTING_KEYS.privacyFloor]: floor,
    [LFG_SETTING_KEYS.warningHorizonDays]: horizon,
  };
}
