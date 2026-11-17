/**
 * app/core/domain/insSchema.js — the fail-closed storage contract of the Insurance
 * Notification & Recovery Register (ADR-0249, Schema v203).
 *
 * FIVE COLLECTIONS, ALL EMPTY AT UPGRADE: `insPolicies`, `insCoverages`,
 * `insNotifications`, `insRecoveries` and the rule's `insMarkers`. Nothing
 * derived is stored — no state, no deadline, no days remaining, no net cost, no
 * `notification-late` flag. Each is recomputed on read, because a stored deadline
 * is a deadline that can disagree with the policy window beside it, and the
 * disagreement would surface as a finance director believing the insurer was
 * told in time.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents a notification window, completes a missing period,
 * re-dates a notification, re-points a recovery at a different coverage, or
 * rescues a row that names a person off the roster. A row that cannot be read
 * exactly is DROPPED with a counted warning, and the screen prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A POLICY with no written reference on the declaration page, no insurer, no
 *      class, no basis, no period, no limit, no deductible and no declared
 *      notification window is DROPPED. A policy nobody can trace to a document
 *      is exactly the plausible default the Bulletproof Reliability Mandate
 *      forbids.
 *   2. A POLICY whose CLASS is not one this register carries is KEPT — the policy
 *      is real whether or not the register knows its trigger — but it must then
 *      carry its own written trigger, and the reader prints it as an unsupported
 *      class rather than pretending to know the trigger. Dropping it would erase
 *      a real policy from the record because the workspace lacked a vocabulary
 *      entry.
 *   3. A COVERAGE links a matter to a policy, one per (matter, policy) pair. A
 *      second link for the same pair would make the recovery ambiguous, which is
 *      the same failure as two accruals for one matter. A coverage with no
 *      written basis is DROPPED, because the basis is what distinguishes a tested
 *      link from a guess.
 *   4. A NOTIFICATION is one per coverage: the insurer is told once per claim per
 *      policy. A notification with no day, no method and no reference is DROPPED.
 *      A notification recorded after the derived deadline is KEPT — it is a
 *      breach fact, and the reader prints `notification-late` with the exact days
 *      it ran over. Deleting it would erase the breach while leaving the recovery
 *      that followed it.
 *   5. A RECOVERY carries its kind, its day, its written basis and — where the
 *      kind moves money or opens a claim — an exact integer amount. A recovery
 *      with no basis is DROPPED: money moved on the record and nobody said why
 *      is worse than no row. A DENIAL is KEPT with its reason; it moves the net
 *      cost back to gross and deleting it would leave the recovery ledger
 *      reading as though nothing was ever claimed.
 *
 * A NOTE ON WHAT IS NOT DROPPED. A policy whose responsible hands are no longer
 * on the roster is NOT dropped here — the reader prints it as an orphan with its
 * reason, because dropping it would silently delete live cover from the record.
 * A coverage whose trigger day falls outside the policy period is NOT dropped
 * here either — the reader prints `no-cover` with the reason, because the link
 * is a fact about what somebody believed and the period test is the reader's job.
 */

import { dayKey } from '../time.js';
import {
  INS_BOUNDS,
  INS_DEFAULTS,
  INS_LIMITS as L,
  INS_POLICY_BASIS_BY_KEY,
  INS_POLICY_CLASS_BY_KEY,
  INS_RECOVERY_KIND_BY_KEY,
  INS_SETTING_KEYS,
} from './insRegistry.js';
import { instantMs, minorUnits } from './insMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function insInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** An insurer, a policy class or a notification method: bounded and non-empty. */
export function insShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A written basis, trigger or note: long enough to be a source, bounded. */
export function insReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** The written reference on the declaration page. */
export function insInstrument(value) {
  const candidate = text(value, L.shortMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A `YYYY-MM-DD` day, normalised to UTC, or null. */
export function insDayKey(value) {
  const candidate = text(value, 40);
  if (!DAY_RE.test(candidate)) return null;
  if (dayKey(`${candidate}T00:00:00.000Z`) !== candidate) return null;
  return candidate;
}

/** A declared notification window in whole days. `>= 0`, bounded. Never defaulted. */
export function insWindowDays(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > L.notificationWindowMaxDays) return null;
  return value;
}

/** A three-letter currency code, upper-cased, or null. */
export function insCurrency(value) {
  const candidate = text(value, 8).toUpperCase();
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

/**
 * One to four responsible hands, every one a valid id, none repeated.
 * Read WHOLE or not at all: a partial holder list is the exact matrix failure the
 * mandate names — one line would silently be invisible to every roll-up.
 */
export function insHolders(value) {
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

/* ------------------------------------------------------------------- policies */

/**
 * Policies. A row that cannot be read exactly is DROPPED with a counted warning:
 * no invented reference, no guessed class, no repaired holder list, no default
 * window.
 *
 * A policy whose responsible hands are off the roster is KEPT and printed as an
 * orphan by the reader — deleting it would erase live cover.
 */
export function normalizeInsPolicies(rows, warnings = []) {
  const warn = (message) => warnings.push(`[insurance] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the policy ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.policies) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const policyRef = insInstrument(row.policyRef);
    const insurerRef = insShort(row.insurerRef);
    const policyClass = text(row.policyClass, 60) || null;
    const basis = text(row.basis, 60) || null;
    const basisDefinition = basis ? INS_POLICY_BASIS_BY_KEY[basis] : null;
    const periodStartDay = insDayKey(row.periodStartDay);
    const periodEndDay = insDayKey(row.periodEndDay);
    const notificationWindowDays = insWindowDays(row.notificationWindowDays);
    const responsibleIds = insHolders(row.responsibleIds);
    const declaredById = id(row.declaredById);
    const declaredAt = insInstant(row.declaredAt);
    const currency = insCurrency(row.currency);
    const limitMinor = row.limitMinor === undefined || row.limitMinor === null ? null : minorUnits(row.limitMinor);
    const deductibleMinor = row.deductibleMinor === undefined || row.deductibleMinor === null ? null : minorUnits(row.deductibleMinor);
    const triggerRef = row.triggerRef === undefined || row.triggerRef === null ? null : insReason(row.triggerRef);

    if (!rowId || seen.has(rowId) || !policyRef || !insurerRef || !policyClass || !basisDefinition
      || !periodStartDay || !periodEndDay || notificationWindowDays === null
      || !responsibleIds || !declaredById || !declaredAt || !currency) {
      dropped += 1;
      continue;
    }
    // A limit or deductible that is present but unreadable drops the row: the
    // amount the policy answers for is the whole point of the policy record, and
    // a null where a limit was written is a figure the screen would render as
    // "unlimited".
    if (row.limitMinor !== undefined && row.limitMinor !== null && limitMinor === null) {
      dropped += 1;
      continue;
    }
    if (row.deductibleMinor !== undefined && row.deductibleMinor !== null && deductibleMinor === null) {
      dropped += 1;
      continue;
    }
    // A period that ends before it starts is a contradiction, and the register
    // will not choose between the two days: whichever it picked would be a cover
    // test nobody could defend. The row is dropped and counted.
    if (instantMs(`${periodEndDay}T00:00:00.000Z`) < instantMs(`${periodStartDay}T00:00:00.000Z`)) {
      dropped += 1;
      continue;
    }
    // An unsupported class must carry its own written trigger, and the reader
    // prints it as an unsupported class rather than pretending to know the
    // trigger. A supported class may carry one as well; it is printed beside it.
    const classDefinition = INS_POLICY_CLASS_BY_KEY[policyClass] || null;
    if (!classDefinition && !triggerRef) {
      dropped += 1;
      continue;
    }

    seen.add(rowId);
    out.push({
      id: rowId,
      policyRef,
      insurerRef,
      policyClass,
      basis,
      periodStartDay,
      periodEndDay,
      notificationWindowDays,
      limitMinor,
      deductibleMinor,
      currency,
      triggerRef,
      responsibleIds,
      declaredById,
      declaredAt,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} insurance policy row(s) could not be read exactly — an unreadable id, policy reference, insurer, class, basis, period, notification window, currency, responsible hand, declaring hand or declaration instant, an unsupported class with no written trigger, a reversed period, or an amount that is not whole minor units — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ coverages */

/**
 * Coverages. ONE per (matter, policy) pair: two links for the same pair would
 * make the recovery ambiguous. A coverage carries the matter, the policy, the
 * covered amount where the policy answers for part of the loss, and the written
 * basis for the link. The cover TEST (trigger day against period) is the
 * reader's job, not the loader's: a link the period does not support is KEPT and
 * prints `no-cover`.
 */
export function normalizeInsCoverages(rows, matters = [], policies = [], warnings = []) {
  const warn = (message) => warnings.push(`[insurance] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the coverage ledger was not an array; it was read as empty');
    return [];
  }
  const matterIds = new Set(list(matters).map((row) => row.id));
  const policyIds = new Set(list(policies).map((row) => row.id));
  const out = [];
  const seenPair = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.coverages) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const matterId = id(row.matterId);
    const policyId = id(row.policyId);
    const basisRef = insReason(row.basisRef);
    const declaredById = id(row.declaredById);
    const coveredMinor = row.coveredMinor === undefined || row.coveredMinor === null ? null : minorUnits(row.coveredMinor);
    const currency = row.currency === undefined || row.currency === null ? null : insCurrency(row.currency);

    if (!rowId || seenId.has(rowId) || !matterId || !policyId || !basisRef || !declaredById) {
      dropped += 1;
      continue;
    }
    if (row.coveredMinor !== undefined && row.coveredMinor !== null && (coveredMinor === null || !currency)) {
      dropped += 1;
      continue;
    }
    if (!matterIds.has(matterId) || !policyIds.has(policyId)) { orphan += 1; continue; }
    // Two coverages for one (matter, policy) pair is ambiguous, not additive:
    // keep the first and count the rest rather than let a recovery be computed
    // from either at random.
    const pair = `${matterId}::${policyId}`;
    if (seenPair.has(pair)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenPair.add(pair);
    out.push({
      id: rowId,
      matterId,
      policyId,
      coveredMinor,
      currency,
      basisRef,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} coverage row(s) name a matter or a policy that is not on the record and were dropped. A link cannot be attached to a matter or a policy that does not exist.`);
  if (dropped) warn(`${dropped} coverage row(s) could not be read exactly — an unreadable matter, policy, written basis or declaring hand, a second coverage for one (matter, policy) pair, or a covered amount that is present but not whole minor units in a three-letter currency — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------- notifications */

/**
 * Notifications. ONE per coverage: the insurer is told once per claim per policy.
 * A notification carries the day, the method and the reference that proves it.
 * A notification recorded after the derived deadline is KEPT — it is a breach
 * fact, and the reader prints `notification-late` with the exact days it ran
 * over. Deleting it would erase the breach while leaving the recovery that
 * followed it.
 */
export function normalizeInsNotifications(rows, coverages = [], warnings = []) {
  const warn = (message) => warnings.push(`[insurance] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the notification ledger was not an array; it was read as empty');
    return [];
  }
  const coverageIds = new Set(list(coverages).map((row) => row.id));
  const out = [];
  const seenCoverage = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.notifications) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const coverageId = id(row.coverageId);
    const notifiedDay = insDayKey(row.notifiedDay);
    const method = text(row.method, 60) || null;
    const referenceRef = insInstrument(row.referenceRef);
    const recordedById = id(row.recordedById);

    if (!rowId || seenId.has(rowId) || !coverageId || !notifiedDay || !method || !referenceRef || !recordedById) {
      dropped += 1;
      continue;
    }
    if (!coverageIds.has(coverageId)) { orphan += 1; continue; }
    // Two notifications for one coverage is ambiguous: the insurer was told once.
    // Keep the first and count the rest.
    if (seenCoverage.has(coverageId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenCoverage.add(coverageId);
    out.push({
      id: rowId,
      coverageId,
      notifiedDay,
      method,
      referenceRef,
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} notification row(s) name a coverage that is not on the record and were dropped. A notification cannot be attached to a coverage that does not exist.`);
  if (dropped) warn(`${dropped} notification row(s) could not be read exactly — an unreadable coverage, notification day, method, reference or recording hand, or a second notification for one coverage — and were dropped. Nothing was repaired.`);
  return out;
}

/* ----------------------------------------------------------------- recoveries */

/**
 * Recoveries. Every row is the insurer's answer moving on a stated day with a
 * written basis. A kind that moves money or opens a claim must carry an exact
 * integer minor-unit amount; a recovery with no basis is dropped, because money
 * moved on the record and nobody said why is worse than no row at all. A DENIAL
 * is kept with its reason — it moves the net cost back to gross.
 */
export function normalizeInsRecoveries(rows, coverages = [], warnings = []) {
  const warn = (message) => warnings.push(`[insurance] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the recovery ledger was not an array; it was read as empty');
    return [];
  }
  const coverageIds = new Set(list(coverages).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  let unreadableAmounts = 0;
  for (const row of rows) {
    if (out.length >= L.recoveries) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const coverageId = id(row.coverageId);
    const kind = text(row.kind, 60) || null;
    const definition = kind ? INS_RECOVERY_KIND_BY_KEY[kind] : null;
    const atDay = insDayKey(row.atDay);
    const basisRef = insReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const currency = row.currency === undefined || row.currency === null ? null : insCurrency(row.currency);
    const amountMinor = row.amountMinor === undefined || row.amountMinor === null ? null : minorUnits(row.amountMinor);

    if (!rowId || seen.has(rowId) || !coverageId || !definition || !atDay || !basisRef || !recordedById) {
      dropped += 1;
      continue;
    }
    if (row.amountMinor !== undefined && row.amountMinor !== null && (amountMinor === null || !currency)) {
      // Present but unreadable: counted separately because the row is a real
      // recovery whose amount cannot be trusted, and a total that silently
      // skipped it would understate what was recovered.
      unreadableAmounts += 1;
      dropped += 1;
      continue;
    }
    // A kind that moves money or opens a claim must carry an exact amount. A
    // denial carries no amount — it is the refusal, and the reason is the basis.
    if ((definition.movesMoney || definition.key === 'claimed') && amountMinor === null) {
      dropped += 1;
      continue;
    }
    if (!coverageIds.has(coverageId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      coverageId,
      kind,
      atDay,
      amountMinor,
      currency,
      basisRef,
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} recovery row(s) name a coverage that is not on the record and were dropped.`);
  if (unreadableAmounts) warn(`${unreadableAmounts} recovery row(s) carried an amount that is not a whole number of minor units in a three-letter currency and were dropped rather than rounded into a total.`);
  if (dropped - unreadableAmounts > 0) warn(`${dropped - unreadableAmounts} recovery row(s) could not be read exactly — an unreadable id, coverage, kind, day, written basis or recording hand, or a money-moving kind with no exact amount — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------- markers */

/** Identity-free observation markers written by RULE-INS-01. */
export function normalizeInsMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[insurance] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the insurance marker ledger was not an array; it was read as empty');
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
      at: insInstant(row.at) || '',
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
 * The register's conventions. `warningHorizonDays` is a PLANNING convention — how
 * far ahead the bench wants to see a notification deadline — and is deliberately
 * not a notification window: no default window exists in this register at all.
 *
 * TWO DIFFERENT REFUSALS, DELIBERATELY. At the DOOR an out-of-bounds convention
 * is REFUSED with its reason, so the figure on the screen is always the figure
 * somebody declared. Here, on load, an unreadable value falls back to the
 * declared default rather than being clamped to whatever the bound happens to be
 * — a clamp would print a number nobody chose as though it were a declaration.
 * Either way the workspace never ends up outside its own bounds.
 */
export function normalizeInsSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  const floorRaw = Number(source[INS_SETTING_KEYS.privacyFloor]);
  const horizonRaw = Number(source[INS_SETTING_KEYS.warningHorizonDays]);
  const floor = Number.isInteger(floorRaw) && floorRaw >= INS_BOUNDS.privacyFloor.min && floorRaw <= INS_BOUNDS.privacyFloor.max
    ? floorRaw
    : INS_DEFAULTS.privacyFloor;
  const horizon = Number.isInteger(horizonRaw) && horizonRaw >= INS_BOUNDS.warningHorizonDays.min && horizonRaw <= INS_BOUNDS.warningHorizonDays.max
    ? horizonRaw
    : INS_DEFAULTS.warningHorizonDays;
  return {
    [INS_SETTING_KEYS.autoPropagate]: source[INS_SETTING_KEYS.autoPropagate] !== false,
    [INS_SETTING_KEYS.privacyFloor]: floor,
    [INS_SETTING_KEYS.warningHorizonDays]: horizon,
  };
}
