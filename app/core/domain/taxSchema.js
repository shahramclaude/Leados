/**
 * app/core/domain/taxSchema.js — the fail-closed storage contract of the Tax
 * Controversy & Appeal-Control Register (ADR-0257, Schema v209).
 *
 * SIX COLLECTIONS, ALL EMPTY AT UPGRADE: `taxNotices`, `taxDeadlines`,
 * `taxFilings`, `taxEvidence`, `taxResolutions` and the rule's `taxMarkers`.
 * Nothing derived is stored — no state, no timeliness, no swing, no days
 * remaining. Each is recomputed on read, because a stored state is a verdict
 * that can disagree with the notice, the deadline and the filings beside it,
 * and the disagreement would surface as a chief financial officer being told a
 * deadline was met when the filing day says otherwise.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents a deadline, completes a missing receipt, re-dates a
 * filing, re-points an evidence item at another notice, or rescues a row that
 * names a person off the roster. A row that cannot be read exactly is DROPPED
 * with a counted warning, and the screen prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A NOTICE carries the authority reference, the disputed position, the
 *      jurisdiction as declared, the tax type, the notice day, the disputed
 *      amount, a currency, a written basis, one to four responsible hands, and
 *      optionally the finance record reference where the uncertain-tax
 *      provision for the same position is carried. A tax type this register
 *      does not carry is DROPPED — the kind is the verdict, and a guessed one
 *      is a dispute nobody classified.
 *   2. A DEADLINE carries the notice, the deadline day and a written
 *      jurisdictional basis. ONE per notice. A deadline with no basis is
 *      DROPPED — a date nobody cited is the deadline this register exists to
 *      refuse.
 *   3. A FILING carries the notice, the filing kind, the filed day and the
 *      authority's receipt reference. A filing with no receipt is DROPPED — an
 *      unreceipted filing is an intention, not a filing.
 *   4. An EVIDENCE item carries the notice, its label and the document
 *      reference it is drawn from. A bare label is DROPPED — it is not a packet.
 *   5. A RESOLUTION carries the notice, the closed-vocabulary outcome, the
 *      resolved day, the resolved amount and a written basis. ONE per notice.
 *
 * A NOTE ON WHAT IS NOT DROPPED. A notice whose responsible hands are no longer
 * on the roster is NOT dropped here — the reader prints it as an orphan with
 * its reason, because dropping it would silently delete a live controversy
 * from the record. A notice whose deadline, filing or resolution names a notice
 * that does not exist IS dropped: a child cannot be attached to a controversy
 * that was never recorded.
 */

import { dayKey } from '../time.js';
import {
  TAX_FILING_KIND_BY_KEY,
  TAX_LIMITS as L,
  TAX_OUTCOME_BY_KEY,
  TAX_SETTING_KEYS,
  TAX_BOUNDS,
  TAX_DEFAULTS,
  TAX_TYPE_BY_KEY,
} from './taxRegistry.js';
import { instantMs, minorUnits } from './taxMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function taxInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A notice reference, a receipt reference, an evidence reference: bounded and non-empty. */
export function taxShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A written basis: long enough to be a source, bounded. */
export function taxReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A jurisdiction label as declared: a code or a name, bounded. Never a calendar key. */
export function taxJurisdiction(value) {
  const candidate = text(value, L.jurisdictionMax + 20);
  if (candidate.length < L.jurisdictionMin) return null;
  return candidate.slice(0, L.jurisdictionMax);
}

/** The written reference to the finance record where the provision is carried. */
export function taxInstrument(value) {
  const candidate = text(value, L.shortMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A `YYYY-MM-DD` day, normalised to UTC, or null. */
export function taxDayKey(value) {
  const candidate = text(value, 40);
  if (!DAY_RE.test(candidate)) return null;
  if (dayKey(`${candidate}T00:00:00.000Z`) !== candidate) return null;
  return candidate;
}

/** A three-letter currency code, upper-cased, or null. */
export function taxCurrency(value) {
  const candidate = text(value, 8).toUpperCase();
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

/**
 * One to four responsible hands, every one a valid id, none repeated.
 * Read WHOLE or not at all: a partial holder list is the exact matrix failure
 * the mandate names — one line would silently be invisible to every roll-up.
 */
export function taxHolders(value) {
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

/* -------------------------------------------------------------------- notices */

/**
 * Notices. A row that cannot be read exactly is DROPPED with a counted warning:
 * no invented tax type, no guessed jurisdiction, no repaired holder list, no
 * default amount.
 *
 * A notice whose responsible hands are off the roster is KEPT and printed as an
 * orphan by the reader — deleting it would erase a live controversy.
 */
export function normalizeTaxNotices(rows, warnings = []) {
  const warn = (message) => warnings.push(`[tax-controversy] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the notice ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seenId = new Set();
  const seenRef = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.notices) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const noticeRef = taxShort(row.noticeRef);
    const position = taxShort(row.position);
    const jurisdiction = taxJurisdiction(row.jurisdiction);
    const taxType = text(row.taxType, 60) || null;
    const typeDefinition = taxType ? TAX_TYPE_BY_KEY[taxType] : null;
    const noticeDay = taxDayKey(row.noticeDay);
    const disputedMinor = row.disputedMinor === undefined || row.disputedMinor === null ? null : minorUnits(row.disputedMinor);
    const currency = taxCurrency(row.currency);
    const basisRef = taxReason(row.basisRef);
    const responsibleIds = taxHolders(row.responsibleIds);
    const recordedById = id(row.recordedById);
    const recordedAt = taxInstant(row.recordedAt);
    const recordedDay = taxDayKey(row.recordedDay);
    const provisionRef = row.provisionRef === undefined || row.provisionRef === null || row.provisionRef === ''
      ? null
      : taxInstrument(row.provisionRef);

    if (!rowId || seenId.has(rowId) || !noticeRef || !position || !jurisdiction || !typeDefinition
      || !noticeDay || disputedMinor === null || !currency || !basisRef || !responsibleIds
      || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (row.provisionRef !== undefined && row.provisionRef !== null && row.provisionRef !== '' && provisionRef === null) {
      dropped += 1;
      continue;
    }
    // Two notices with one authority reference would make the controversy
    // ambiguous. Keep the first and count the rest rather than let a reader
    // pick either at random.
    if (seenRef.has(noticeRef)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenRef.add(noticeRef);
    out.push({
      id: rowId,
      noticeRef,
      position,
      jurisdiction,
      taxType,
      noticeDay,
      disputedMinor,
      currency,
      basisRef,
      responsibleIds,
      recordedById,
      recordedAt,
      recordedDay,
      provisionRef,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} notice row(s) could not be read exactly — an unreadable id, notice reference, disputed position, jurisdiction, tax type, notice day, disputed amount, currency, written basis, responsible hand, recording hand, recording instant or recording day, a provision reference that is not a finance record reference, or a second notice for one authority reference — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------- deadlines */

/**
 * Deadlines. ONE per notice. A deadline carries the deadline day and a written
 * jurisdictional basis. A deadline with no basis is DROPPED: a date nobody
 * cited is the deadline this register exists to refuse.
 */
export function normalizeTaxDeadlines(rows, notices = [], warnings = []) {
  const warn = (message) => warnings.push(`[tax-controversy] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the deadline ledger was not an array; it was read as empty');
    return [];
  }
  const noticeIds = new Set(list(notices).map((row) => row.id));
  const out = [];
  const seenNotice = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.deadlines) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const noticeId = id(row.noticeId);
    const deadlineDay = taxDayKey(row.deadlineDay);
    const basisRef = taxReason(row.basisRef);
    const declaredById = id(row.declaredById);
    const declaredAt = taxInstant(row.declaredAt);
    const declaredDay = taxDayKey(row.declaredDay);

    if (!rowId || seenId.has(rowId) || !noticeId || !deadlineDay || !basisRef
      || !declaredById || !declaredAt || !declaredDay) {
      dropped += 1;
      continue;
    }
    if (!noticeIds.has(noticeId)) { orphan += 1; continue; }
    if (seenNotice.has(noticeId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenNotice.add(noticeId);
    out.push({
      id: rowId,
      noticeId,
      deadlineDay,
      basisRef,
      declaredById,
      declaredAt,
      declaredDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} deadline row(s) name a notice that is not on the register and were dropped. A deadline cannot be attached to a controversy that was never recorded.`);
  if (dropped) warn(`${dropped} deadline row(s) could not be read exactly — an unreadable id, notice, deadline day, written jurisdictional basis, declaring hand, declaration instant or declaration day, or a second deadline for one notice — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------------- filings */

/**
 * Filings. Each is one act in the dispute path with its kind, its filed day and
 * the authority's receipt reference. A filing with no receipt is DROPPED: an
 * unreceipted filing is an intention, not a filing.
 */
export function normalizeTaxFilings(rows, notices = [], warnings = []) {
  const warn = (message) => warnings.push(`[tax-controversy] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the filing ledger was not an array; it was read as empty');
    return [];
  }
  const noticeIds = new Set(list(notices).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.filings) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const noticeId = id(row.noticeId);
    const filingKind = text(row.filingKind, 60) || null;
    const kindDefinition = filingKind ? TAX_FILING_KIND_BY_KEY[filingKind] : null;
    const filedDay = taxDayKey(row.filedDay);
    const receiptRef = taxShort(row.receiptRef);
    const basisRef = taxReason(row.basisRef);
    const filedById = id(row.filedById);
    const filedAt = taxInstant(row.filedAt);
    const filedDayStamp = taxDayKey(row.filedDayStamp);

    if (!rowId || seen.has(rowId) || !noticeId || !kindDefinition || !filedDay || !receiptRef
      || !basisRef || !filedById || !filedAt || !filedDayStamp) {
      dropped += 1;
      continue;
    }
    if (!noticeIds.has(noticeId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      noticeId,
      filingKind,
      filedDay,
      receiptRef,
      basisRef,
      filedById,
      filedAt,
      filedDayStamp,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} filing row(s) name a notice that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} filing row(s) could not be read exactly — an unreadable id, notice, filing kind, filed day, receipt reference, written basis, filing hand, filing instant or filing day, or a filing kind this register does not carry — and were dropped. Nothing was repaired.`);
  return out;
}

/* -------------------------------------------------------------------- evidence */

/**
 * Evidence items. Each names the notice whose disputed position it supports and
 * carries the document reference it is drawn from. A bare label is DROPPED: it
 * is not a packet.
 */
export function normalizeTaxEvidence(rows, notices = [], warnings = []) {
  const warn = (message) => warnings.push(`[tax-controversy] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the evidence ledger was not an array; it was read as empty');
    return [];
  }
  const noticeIds = new Set(list(notices).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.evidence) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const noticeId = id(row.noticeId);
    const itemLabel = taxShort(row.itemLabel);
    const itemRef = taxShort(row.itemRef);
    const suppliedDay = taxDayKey(row.suppliedDay);
    const basisRef = taxReason(row.basisRef);
    const suppliedById = id(row.suppliedById);
    const suppliedAt = taxInstant(row.suppliedAt);
    const suppliedDayStamp = taxDayKey(row.suppliedDayStamp);

    if (!rowId || seen.has(rowId) || !noticeId || !itemLabel || !itemRef || !suppliedDay
      || !basisRef || !suppliedById || !suppliedAt || !suppliedDayStamp) {
      dropped += 1;
      continue;
    }
    if (!noticeIds.has(noticeId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      noticeId,
      itemLabel,
      itemRef,
      suppliedDay,
      basisRef,
      suppliedById,
      suppliedAt,
      suppliedDayStamp,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} evidence row(s) name a notice that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} evidence row(s) could not be read exactly — an unreadable id, notice, item label, document reference, supplied day, written basis, supplying hand, supply instant or supply day — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ resolutions */

/**
 * Resolutions. ONE per notice. A resolution carries the closed-vocabulary
 * outcome, the resolved day, the resolved amount and a written basis. An
 * outcome this register does not carry is DROPPED: the register never infers
 * an outcome from an amount or a payment.
 */
export function normalizeTaxResolutions(rows, notices = [], warnings = []) {
  const warn = (message) => warnings.push(`[tax-controversy] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the resolution ledger was not an array; it was read as empty');
    return [];
  }
  const noticeIds = new Set(list(notices).map((row) => row.id));
  const out = [];
  const seenNotice = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.resolutions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const noticeId = id(row.noticeId);
    const outcome = text(row.outcome, 60) || null;
    const outcomeDefinition = outcome ? TAX_OUTCOME_BY_KEY[outcome] : null;
    const resolvedDay = taxDayKey(row.resolvedDay);
    const resolvedMinor = row.resolvedMinor === undefined || row.resolvedMinor === null ? null : minorUnits(row.resolvedMinor);
    const currency = taxCurrency(row.currency);
    const basisRef = taxReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = taxInstant(row.recordedAt);
    const recordedDay = taxDayKey(row.recordedDay);

    if (!rowId || seenId.has(rowId) || !noticeId || !outcomeDefinition || !resolvedDay
      || resolvedMinor === null || !currency || !basisRef || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!noticeIds.has(noticeId)) { orphan += 1; continue; }
    if (seenNotice.has(noticeId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenNotice.add(noticeId);
    out.push({
      id: rowId,
      noticeId,
      outcome,
      resolvedDay,
      resolvedMinor,
      currency,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} resolution row(s) name a notice that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} resolution row(s) could not be read exactly — an unreadable id, notice, outcome, resolved day, resolved amount, currency, written basis, recording hand, recording instant or recording day, an outcome this register does not carry, or a second resolution for one notice — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------------- markers */

/** Identity-free observation markers written by RULE-TAX-01. */
export function normalizeTaxMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[tax-controversy] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the controversy marker ledger was not an array; it was read as empty');
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
      at: taxInstant(row.at) || '',
      ruleId: text(row.ruleId, 40) || '',
      kind: text(row.kind, 40) || '',
      detail: text(row.detail, 400),
    });
    if (out.length >= L.markers) break;
  }
  return out;
}

/* -------------------------------------------------------------------- settings */

/**
 * The register's conventions. `taxPrivacyFloor` is the floor below which a
 * per-state export is withheld. `taxResolutionHorizonDays` is the declared
 * horizon beyond which a filed-but-unresolved controversy is asked for a status
 * review. There is NO warning horizon derived from a jurisdiction: the register
 * holds no calendar, so there is no band to enter.
 *
 * TWO DIFFERENT REFUSALS, DELIBERATELY. At the DOOR an out-of-bounds convention
 * is REFUSED with its reason, so the figure on the screen is always the figure
 * somebody declared. Here, on load, an unreadable value falls back to the
 * declared default rather than being clamped to whatever the bound happens to
 * be — a clamp would print a number nobody chose as though it were a
 * declaration.
 */
export function normalizeTaxSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  const floorRaw = Number(source[TAX_SETTING_KEYS.privacyFloor]);
  const floor = Number.isInteger(floorRaw) && floorRaw >= TAX_BOUNDS.privacyFloor.min && floorRaw <= TAX_BOUNDS.privacyFloor.max
    ? floorRaw
    : TAX_DEFAULTS.privacyFloor;
  const horizonRaw = Number(source[TAX_SETTING_KEYS.resolutionHorizonDays]);
  const horizon = Number.isInteger(horizonRaw) && horizonRaw >= TAX_BOUNDS.resolutionHorizonDays.min && horizonRaw <= TAX_BOUNDS.resolutionHorizonDays.max
    ? horizonRaw
    : TAX_DEFAULTS.resolutionHorizonDays;
  return {
    [TAX_SETTING_KEYS.autoPropagate]: source[TAX_SETTING_KEYS.autoPropagate] !== false,
    [TAX_SETTING_KEYS.privacyFloor]: floor,
    [TAX_SETTING_KEYS.resolutionHorizonDays]: horizon,
  };
}
