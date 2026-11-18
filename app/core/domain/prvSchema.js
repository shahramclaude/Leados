/**
 * app/core/domain/prvSchema.js — the fail-closed storage contract of the
 * Provision & Reimbursement Register (ADR-0250, Schema v204).
 *
 * FIVE COLLECTIONS, ALL EMPTY AT UPGRADE: `prvAssessments`, `prvScenarios`,
 * `prvReimbursements`, `prvCarryings` and the rule's `prvMarkers`. Nothing
 * derived is stored — no state, no provision total, no asset, no reconciliation
 * verdict. Each is recomputed on read, because a stored provision is a figure
 * that can disagree with the classification and the best estimate beside it, and
 * the disagreement would surface as a chief financial officer carrying a number
 * the record does not support.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents a classification, completes a missing best estimate,
 * re-dates an assessment, re-points a scenario at another matter, or rescues a
 * row that names a person off the roster. A row that cannot be read exactly is
 * DROPPED with a counted warning, and the screen prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. An ASSESSMENT carries the matter, the classification (probable / possible /
 *      remote), the best-estimate method, the most-likely amount where that is
 *      the method, a currency, a written basis, one to four responsible hands,
 *      the assessing hand and the assessment day. A classification this register
 *      does not carry is DROPPED — the classification is the whole verdict, and a
 *      guessed one is a provision nobody decided.
 *   2. A SCENARIO carries its outcome, its probability in basis points, its
 *      amount, its currency and its written basis. A probability outside
 *      0..10,000 is DROPPED. The scenarios are NOT summed here: the reader sums
 *      them and refuses a set whose probabilities are not exactly 100%.
 *   3. A REIMBURSEMENT carries the matter, whether it is virtually certain, and a
 *      written basis. One per matter: two recognitions for one obligation would
 *      make the asset ambiguous, which is the same failure as two accruals for
 *      one matter.
 *   4. A CARRYING carries the currency, the amount the finance seat declares it
 *      is carrying, and a written reference to the finance record. One per
 *      currency. A carrying with no reference is DROPPED — a figure finance
 *      cannot trace to a record is the number that is discovered to be wrong at
 *      the audit.
 *
 * A NOTE ON WHAT IS NOT DROPPED. An assessment whose responsible hands are no
 * longer on the roster is NOT dropped here — the reader prints it as an orphan
 * with its reason, because dropping it would silently delete a live provision
 * from the record. An assessment whose matter is closed on the claim register is
 * NOT dropped either; the reader simply does not carry it into the open-matter
 * provision schedule.
 */

import { dayKey } from '../time.js';
import {
  PROV_BOUNDS,
  PROV_CLASSIFICATION_BY_KEY,
  PROV_DEFAULTS,
  PROV_ESTIMATE_METHOD_BY_KEY,
  PROV_LIMITS as L,
  PROV_SETTING_KEYS,
} from './prvRegistry.js';
import { instantMs, minorUnits } from './prvMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function prvInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A scenario outcome: bounded and non-empty. */
export function prvShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A written basis: long enough to be a source, bounded. */
export function prvReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** The written reference to the finance record a carrying is drawn from. */
export function prvInstrument(value) {
  const candidate = text(value, L.shortMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A `YYYY-MM-DD` day, normalised to UTC, or null. */
export function prvDayKey(value) {
  const candidate = text(value, 40);
  if (!DAY_RE.test(candidate)) return null;
  if (dayKey(`${candidate}T00:00:00.000Z`) !== candidate) return null;
  return candidate;
}

/** A probability in basis points: an integer 0..10,000, or null. */
export function prvProbability(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > L.probabilityBpsMax) return null;
  return value;
}

/** A three-letter currency code, upper-cased, or null. */
export function prvCurrency(value) {
  const candidate = text(value, 8).toUpperCase();
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

/**
 * One to four responsible hands, every one a valid id, none repeated.
 * Read WHOLE or not at all: a partial holder list is the exact matrix failure the
 * mandate names — one line would silently be invisible to every roll-up.
 */
export function prvHolders(value) {
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

/* --------------------------------------------------------------- assessments */

/**
 * Assessments. A row that cannot be read exactly is DROPPED with a counted
 * warning: no invented classification, no guessed method, no repaired holder
 * list, no default amount.
 *
 * An assessment whose responsible hands are off the roster is KEPT and printed
 * as an orphan by the reader — deleting it would erase a live provision.
 */
export function normalizePrvAssessments(rows, matters = [], warnings = []) {
  const warn = (message) => warnings.push(`[provisions] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the assessment ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(matters).map((row) => row.id));
  const out = [];
  const seenMatter = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.assessments) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const classification = text(row.classification, 60) || null;
    const classificationDefinition = classification ? PROV_CLASSIFICATION_BY_KEY[classification] : null;
    const estimateMethod = text(row.estimateMethod, 60) || null;
    const methodDefinition = estimateMethod ? PROV_ESTIMATE_METHOD_BY_KEY[estimateMethod] : null;
    const currency = prvCurrency(row.currency);
    const basisRef = prvReason(row.basisRef);
    const responsibleIds = prvHolders(row.responsibleIds);
    const assessedById = id(row.assessedById);
    const assessedAt = prvInstant(row.assessedAt);
    const assessedDay = prvDayKey(row.assessedDay);
    const mostLikelyMinor = row.mostLikelyMinor === undefined || row.mostLikelyMinor === null ? null : minorUnits(row.mostLikelyMinor);

    if (!rowId || seenId.has(rowId) || !matterId || !classificationDefinition || !methodDefinition
      || !currency || !basisRef || !responsibleIds || !assessedById || !assessedAt || !assessedDay) {
      dropped += 1;
      continue;
    }
    if (row.mostLikelyMinor !== undefined && row.mostLikelyMinor !== null && mostLikelyMinor === null) {
      dropped += 1;
      continue;
    }
    // A most-likely assessment MUST carry its single amount: an assessment with
    // no estimate is a classification without a figure, and the reader would have
    // to invent one. An expected-value assessment may carry one as well, but the
    // reader computes the figure from the scenarios.
    if (estimateMethod === 'most-likely' && mostLikelyMinor === null) {
      dropped += 1;
      continue;
    }
    if (!matterIds.has(matterId)) { orphan += 1; continue; }
    // Two assessments for one matter would make the provision ambiguous. Keep the
    // first and count the rest rather than let a reader pick either at random.
    if (seenMatter.has(matterId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenMatter.add(matterId);
    out.push({
      id: rowId,
      matterId,
      classification,
      estimateMethod,
      mostLikelyMinor,
      currency,
      basisRef,
      responsibleIds,
      assessedById,
      assessedAt,
      assessedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (orphan) warn(`${orphan} assessment row(s) name a matter that is not on the claim register and were dropped. An assessment cannot be attached to a matter that does not exist.`);
  if (dropped) warn(`${dropped} assessment row(s) could not be read exactly — an unreadable id, matter, classification, estimate method, currency, written basis, responsible hand, assessing hand, assessment instant or assessment day, a most-likely assessment with no amount, a second assessment for one matter, or an amount that is not whole minor units — and were dropped. Nothing was repaired.`);
  return out;
}

/* ----------------------------------------------------------------- scenarios */

/**
 * Scenarios. Each is one declared outcome of the obligation with its probability
 * and its exact amount. A scenario that cannot be read exactly is DROPPED. The
 * probabilities are NOT summed here: the reader sums them and refuses a set that
 * is not exactly 100%.
 */
export function normalizePrvScenarios(rows, assessments = [], warnings = []) {
  const warn = (message) => warnings.push(`[provisions] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the scenario ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(assessments).map((row) => row.matterId));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.scenarios) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const outcome = prvShort(row.outcome);
    const probabilityBps = prvProbability(row.probabilityBps);
    const amountMinor = row.amountMinor === undefined || row.amountMinor === null ? null : minorUnits(row.amountMinor);
    const currency = prvCurrency(row.currency);
    const basisRef = prvReason(row.basisRef);
    const declaredById = id(row.declaredById);
    const declaredAt = prvInstant(row.declaredAt);
    const declaredDay = prvDayKey(row.declaredDay);

    if (!rowId || seen.has(rowId) || !matterId || !outcome || probabilityBps === null
      || amountMinor === null || !currency || !basisRef || !declaredById || !declaredAt || !declaredDay) {
      dropped += 1;
      continue;
    }
    if (!matterIds.has(matterId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      matterId,
      outcome,
      probabilityBps,
      amountMinor,
      currency,
      basisRef,
      declaredById,
      declaredAt,
      declaredDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} scenario row(s) name a matter with no assessment and were dropped. A scenario cannot be attached to an obligation that was never assessed.`);
  if (dropped) warn(`${dropped} scenario row(s) could not be read exactly — an unreadable id, matter, outcome, probability, amount, currency, written basis, declaring hand, declaration instant or declaration day, or an amount that is not whole minor units — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------- reimbursements */

/**
 * Reimbursement recognitions. ONE per matter: two recognitions for one obligation
 * would make the asset ambiguous. A recognition carries whether it is virtually
 * certain and a written basis; the AMOUNT is derived on read from the insurance
 * register, never stored here.
 */
export function normalizePrvReimbursements(rows, assessments = [], warnings = []) {
  const warn = (message) => warnings.push(`[provisions] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the reimbursement ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(assessments).map((row) => row.matterId));
  const out = [];
  const seenMatter = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.reimbursements) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const virtuallyCertain = typeof row.virtuallyCertain === 'boolean' ? row.virtuallyCertain : null;
    const basisRef = prvReason(row.basisRef);
    const declaredById = id(row.declaredById);
    const declaredAt = prvInstant(row.declaredAt);
    const declaredDay = prvDayKey(row.declaredDay);

    if (!rowId || seenId.has(rowId) || !matterId || virtuallyCertain === null || !basisRef
      || !declaredById || !declaredAt || !declaredDay) {
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
      virtuallyCertain,
      basisRef,
      declaredById,
      declaredAt,
      declaredDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} reimbursement row(s) name a matter with no assessment and were dropped.`);
  if (dropped) warn(`${dropped} reimbursement row(s) could not be read exactly — an unreadable id, matter, virtual-certainty flag, written basis, declaring hand, declaration instant or declaration day, or a second recognition for one matter — and were dropped. Nothing was repaired.`);
  return out;
}

/* ----------------------------------------------------------------- carryings */

/**
 * Finance carryings. ONE per currency: the figure the finance seat declares it is
 * carrying as the provision, with a written reference to the finance record. A
 * carrying with no reference is DROPPED — a figure finance cannot trace to a
 * record is the number that is discovered to be wrong at the audit.
 */
export function normalizePrvCarryings(rows, warnings = []) {
  const warn = (message) => warnings.push(`[provisions] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the carrying ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seenCurrency = new Set();
  const seenId = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.carryings) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const currency = prvCurrency(row.currency);
    const carriedMinor = row.carriedMinor === undefined || row.carriedMinor === null ? null : minorUnits(row.carriedMinor);
    const carriedRef = prvInstrument(row.carriedRef);
    const declaredById = id(row.declaredById);
    const declaredAt = prvInstant(row.declaredAt);
    const declaredDay = prvDayKey(row.declaredDay);

    if (!rowId || seenId.has(rowId) || !currency || carriedMinor === null || !carriedRef
      || !declaredById || !declaredAt || !declaredDay) {
      dropped += 1;
      continue;
    }
    if (seenCurrency.has(currency)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenCurrency.add(currency);
    out.push({
      id: rowId,
      currency,
      carriedMinor,
      carriedRef,
      declaredById,
      declaredAt,
      declaredDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} finance carrying row(s) could not be read exactly — an unreadable id, currency, carried amount, written reference, declaring hand, declaration instant or declaration day, or a second carrying for one currency — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------- markers */

/** Identity-free observation markers written by RULE-PROV-01. */
export function normalizePrvMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[provisions] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the provision marker ledger was not an array; it was read as empty');
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
      at: prvInstant(row.at) || '',
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
 * The register's conventions. `provPrivacyFloor` is the floor below which a
 * per-state export is withheld. There is NO warning horizon in this register: a
 * provision carries no clock, so there is no band to enter.
 *
 * TWO DIFFERENT REFUSALS, DELIBERATELY. At the DOOR an out-of-bounds convention is
 * REFUSED with its reason, so the figure on the screen is always the figure
 * somebody declared. Here, on load, an unreadable value falls back to the declared
 * default rather than being clamped to whatever the bound happens to be — a clamp
 * would print a number nobody chose as though it were a declaration.
 */
export function normalizePrvSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  const floorRaw = Number(source[PROV_SETTING_KEYS.privacyFloor]);
  const floor = Number.isInteger(floorRaw) && floorRaw >= PROV_BOUNDS.privacyFloor.min && floorRaw <= PROV_BOUNDS.privacyFloor.max
    ? floorRaw
    : PROV_DEFAULTS.privacyFloor;
  return {
    [PROV_SETTING_KEYS.autoPropagate]: source[PROV_SETTING_KEYS.autoPropagate] !== false,
    [PROV_SETTING_KEYS.privacyFloor]: floor,
  };
}
