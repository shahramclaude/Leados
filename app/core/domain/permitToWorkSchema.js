/**
 * app/core/domain/permitToWorkSchema.js — the fail-closed storage contract of the
 * Permit-to-Work, Energy-Isolation & Simultaneous-Operations Register
 * (ADR-0246, Schema v200).
 *
 * SEVEN COLLECTIONS, ALL EMPTY AT UPGRADE: `ptwPermits`, `ptwIsolations`,
 * `ptwAtmosphere`, `ptwHandovers`, `ptwSuspensions`, `ptwClosures` and the rule's
 * `ptwMarkers`. Nothing derived is stored — no permit state, no expiry, no minutes
 * remaining, no isolation verdict, no atmosphere pass, no conflict. Every one of
 * those is recomputed on read from the declarations and the injected clock,
 * because a stored verdict is a verdict that can disagree with the reading beside
 * it, and on this register the disagreement would surface as a green tick over a
 * space nobody can breathe in.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here completes a missing area, defaults a validity, invents a limit,
 * rounds a fractional window, re-dates a removal, confirms a removal nobody
 * confirmed, or rescues a row that points at a permit this loader was not handed.
 * A row that cannot be read exactly is DROPPED with a counted warning, and the
 * screen prints the count.
 *
 * THE ELEVEN LOADER RULES THAT CARRY THE MANDATE:
 *   1. A PERMIT WITH NO AREA, NO WORK REFERENCE, NO HOLDER, NO ISSUER OR NO
 *      WRITTEN BASIS IS DROPPED. A permit is a dated human authorisation of a
 *      defined task in a defined place against a written method; without the basis
 *      there is nothing anybody can be held to, and without the area it authorises
 *      work somewhere in the world.
 *   2. A PERMIT WHOSE VALIDITY IS NOT A WHOLE NUMBER OF MINUTES INSIDE THE
 *      DECLARED BOUNDS IS DROPPED. There is no default validity anywhere in this
 *      file. A repaired validity would produce an end instant no human ever chose,
 *      and every reading of this register runs against that instant.
 *   3. A PERMIT WHOSE ISSUER IS ITS OWN HOLDER IS KEPT, AND FLAGGED. The door
 *      refuses the act outright — there is no command that can create it — but when
 *      an imported or hand-edited record carries one it is the single clearest
 *      separation-of-duties failure on the record, and dropping it would erase it.
 *      The loader keeps the row, marks `selfIssued: true`, and the reader prints it.
 *   4. A PERMIT OF AN IGNITION KIND WITH NO FIRE WATCH IS KEPT, AND FLAGGED
 *      (`noFireWatch: true`). Same discipline: the door cannot create one, and the
 *      record that carries one prints the hole instead of hiding it.
 *   5. AN ATMOSPHERE PLAN THAT CANNOT BE READ DROPS THE WHOLE PERMIT. A permit
 *      whose declared limits are unreadable is a permit nobody can judge, and
 *      silently discarding one unreadable limit would make the reader believe the
 *      permit declared fewer tests than it does — the exact direction of error that
 *      lets a person into a space with no limit on it. Duplicate test keys drop the
 *      permit too, because two limits for one gas is two controls for one hazard.
 *   6. A PERMIT OF AN ATMOSPHERE-REQUIRING KIND WITH AN EMPTY PLAN IS DROPPED.
 *      Confined-space entry with no declared test plan is not a permit, it is a
 *      signature.
 *   7. AN ISOLATION WITH NO POINT, NO LOCK REFERENCE, NO ENERGY KIND, NO APPLIED
 *      INSTANT AND HAND, OR NO DECLARED VERIFICATION WINDOW IS DROPPED. The window
 *      is a human decision about this plant and this task; there is no default.
 *   8. AN ISOLATION THAT CITES A PERMIT THIS LOADER WAS NOT HANDED IS DROPPED. An
 *      isolation cannot protect a permit that is not on the record.
 *   9. A REMOVAL ARRIVES WHOLE OR NOT AT ALL: a removed instant without the hand
 *      that removed it, or either before the isolation was applied, is unreadable.
 *      A removal with no confirmation is KEPT and marked `removalConfirmed: false`
 *      — it is a printed state, not a malformed row, because the plant's real state
 *      is exactly what is unknown.
 *  10. A GAS READING IS KEPT EVEN WHEN IT FAILS THE LIMIT. A reading is a fact
 *      about the air; a register that dropped inconvenient readings would be the
 *      reason nobody records a bad one. It is dropped only when it is unreadable —
 *      no test key, no finite reading, no instant, no instrument, no hand — or when
 *      it names a test the permit never declared, because a reading of a gas nobody
 *      asked about cannot be compared to anything.
 *  11. A HANDOVER, SUSPENSION, RESUMPTION OR CLOSURE IS ADMITTED ONLY THROUGH A
 *      PERMIT THIS LOADER WAS HANDED, never before that permit's declared validity
 *      start, and a closure is a single act — a second closure is dropped rather
 *      than allowed to overwrite the first.
 */

import {
  PTW_ATMOSPHERE_TEST_BY_KEY,
  PTW_ATMOSPHERE_TEST_KEYS,
  PTW_AUTHORITY_KINDS,
  PTW_BOUNDS,
  PTW_CLOSURE_OUTCOME_KEYS,
  PTW_DEFAULTS,
  PTW_ENERGY_KIND_KEYS,
  PTW_LIMITS as L,
  PTW_SETTING_KEYS,
  PTW_WORK_KIND_BY_KEY,
  PTW_WORK_KIND_KEYS,
} from './permitToWorkRegistry.js';
import { instantMs } from './permitToWorkMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => {
  const candidate = text(value, L.idMax);
  return ID_RE.test(candidate) ? candidate : null;
};
const authorityKeys = PTW_AUTHORITY_KINDS.map((row) => row.key);

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function ptwInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A short declared thing — an area, a work reference, a point, a lock, an instrument. */
export function ptwShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** The written method statement / assessment a permit rests on. */
export function ptwBasis(value) {
  const candidate = text(value, L.textMax + 40);
  if (candidate.length < L.basisMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A written note — a suspension reason, a closure note. */
export function ptwNote(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** An optional written note: empty is legitimate, unreadable is not. */
export function ptwOptionalNote(value) {
  return text(value, L.textMax);
}

/** A declared validity in whole minutes. Never rounded, never defaulted. */
export function ptwValidity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.validityMin || value > L.validityMax) return null;
  return value;
}

/** A declared verification window in whole minutes. Never defaulted. */
export function ptwVerifyWithin(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.verifyWithinMin || value > L.verifyWithinMax) return null;
  return value;
}

/** A declared gas-test freshness window in whole minutes. Never defaulted. */
export function ptwFreshness(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.freshnessMin || value > L.freshnessMax) return null;
  return value;
}

/**
 * One entry of a permit's atmosphere plan.
 *
 * THE LIMITS ARE BOUNDED BY THE TEST'S OWN PROFESSIONAL RANGE, and the DIRECTION is
 * taken from the published test definition rather than from the row: a row cannot
 * declare that an oxygen reading "at most 5%" is a pass, because the direction is
 * not a field a human writes here.
 */
export function ptwPlanEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const testKey = PTW_ATMOSPHERE_TEST_KEYS.includes(raw.testKey) ? raw.testKey : null;
  if (!testKey) return null;
  const def = PTW_ATMOSPHERE_TEST_BY_KEY[testKey];
  const limitMin = typeof raw.limitMin === 'number' && Number.isFinite(raw.limitMin) ? raw.limitMin : null;
  const limitMax = typeof raw.limitMax === 'number' && Number.isFinite(raw.limitMax) ? raw.limitMax : null;
  const freshnessMinutes = ptwFreshness(raw.freshnessMinutes);
  if (limitMin === null || limitMax === null || freshnessMinutes === null) return null;
  if (limitMin < def.limitMin || limitMin > def.limitMax) return null;
  if (limitMax < def.limitMin || limitMax > def.limitMax) return null;
  if (def.limitDirection === 'between' && limitMin > limitMax) return null;
  return {
    testKey,
    label: def.label,
    unit: def.unit,
    limitDirection: def.limitDirection,
    limitMin,
    limitMax,
    freshnessMinutes,
  };
}

/* ------------------------------------------------------------------ permits */

/**
 * Permits. A row that cannot be read exactly is DROPPED with a counted warning.
 *
 * A permit naming a holder who is not on the roster is NOT dropped here — the
 * reader prints it as an orphan with its reason, because dropping it would delete
 * a live authorisation to work on a plant from the record, and the plant is still
 * in whatever state the paper says it is.
 */
export function normalizePtwPermits(rows, warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the permit ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let selfIssued = 0;
  let noFireWatch = 0;
  let flightBad = 0;
  for (const row of rows) {
    if (out.length >= L.permits) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const workRef = ptwShort(row.workRef);
    const areaRef = ptwShort(row.areaRef);
    const workKind = PTW_WORK_KIND_KEYS.includes(row.workKind) ? row.workKind : null;
    const authorityKind = authorityKeys.includes(row.authorityKind) ? row.authorityKind : null;
    const holderId = id(row.holderId);
    const issuerId = id(row.issuerId);
    const lineManagerId = id(row.lineManagerId);
    const basisRef = ptwBasis(row.basisRef);
    const validityMinutes = ptwValidity(row.validityMinutes);
    const validFromAt = ptwInstant(row.validFromAt);
    const flightFromAt = row.flightFromAt ? ptwInstant(row.flightFromAt) : null;
    if (row.flightFromAt && !flightFromAt) { dropped += 1; flightBad += 1; continue; }
    const fireWatchId = row.fireWatchId ? id(row.fireWatchId) : null;
    const crewIds = list(row.crewIds).map((value) => id(value)).filter(Boolean);

    if (!rowId || seen.has(rowId) || !workRef || !areaRef || !workKind || !authorityKind
      || !holderId || !issuerId || !lineManagerId || !basisRef || validityMinutes === null || !validFromAt) {
      dropped += 1;
      continue;
    }

    // THE PLAN. An unreadable or duplicated entry drops the whole permit: a permit
    // whose limits cannot be read is a permit nobody can judge, and reading it as
    // "fewer tests declared" is the exact direction of error that lets somebody in.
    const def = PTW_WORK_KIND_BY_KEY[workKind];
    const rawPlan = list(row.atmospherePlan);
    const plan = [];
    const planKeys = new Set();
    let planBad = false;
    for (const entry of rawPlan) {
      const parsed = ptwPlanEntry(entry);
      if (!parsed || planKeys.has(parsed.testKey)) { planBad = true; break; }
      planKeys.add(parsed.testKey);
      plan.push(parsed);
    }
    if (planBad) { dropped += 1; continue; }
    if (def.atmosphere && plan.length === 0) { dropped += 1; continue; }

    const selfIssuedFlag = holderId === issuerId;
    if (selfIssuedFlag) selfIssued += 1;
    const fireWatchMissing = Boolean(def.ignition) && !fireWatchId;
    if (fireWatchMissing) noFireWatch += 1;

    seen.add(rowId);
    out.push({
      id: rowId,
      workRef,
      areaRef,
      workKind,
      authorityKind,
      holderId,
      issuerId,
      lineManagerId,
      basisRef,
      validityMinutes,
      validFromAt,
      /** A declared first-entry time. `live` means the first entry is done and work
       *  is inside validity; before it, the permit is still `not-yet-valid` though
       *  the issuer has authorised the entry to be made. */
      flightFromAt,
      fireWatchId,
      crewIds,
      atmospherePlan: plan,
      /** The permit's own kind requires a declared test plan. */
      atmosphereRequired: Boolean(def.atmosphere),
      ignition: Boolean(def.ignition),
      /**
       * DOES THIS PERMIT REQUIRE PROVEN ENERGY CONTROL? DECLARED BY THE ISSUER, never
       * inferred from the work kind alone — except where the kind inherently touches
       * stored energy, in which case the door forces it true and the loader reads it
       * true. There is no default: a permit that did not declare the answer reads as
       * false only because its kind genuinely carries no stored-energy hazard, and the
       * door refuses to let an inherently energetic kind waive it.
       */
      energyControl: def.inherentlyEnergy ? true : row.energyControl === true,
      energyControlForced: Boolean(def.inherentlyEnergy),
      selfIssued: selfIssuedFlag,
      noFireWatch: fireWatchMissing,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} permit row(s) could not be read exactly — an unreadable id, work reference, area, work kind, authority kind, holder, issuer, issuing line, basis, validity or start instant, an unreadable or duplicated atmosphere limit, or a confined-space permit with no declared test plan — and were dropped. Nothing was repaired.`);
  if (flightBad) warn(`${flightBad} permit row(s) carried a flight-window instant that could not be read; the whole row was dropped rather than defaulting a first-entry time.`);
  if (selfIssued) warn(`${selfIssued} permit(s) were issued by their own holder. They are KEPT and printed, because an imported separation-of-duties failure is the fact this register exists to surface; the door refuses to create one.`);
  if (noFireWatch) warn(`${noFireWatch} ignition permit(s) carry no named fire watch. They are KEPT and printed as a conflict, because a hot-work permit nobody is watching is not something to erase from the record.`);
  return out;
}

/* --------------------------------------------------------------- isolations */

/**
 * Isolations, admitted only through a permit this loader was handed.
 *
 * A removal with no confirmation is KEPT (`removalConfirmed: false`): the plant's
 * state is genuinely unknown, and that is a printed fact rather than a malformed
 * row.
 */
export function normalizePtwIsolations(rows, permits = [], warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the isolation ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(permits).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const pointKeys = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.isolations) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const permitId = id(row.permitId);
    const parent = permitId ? parents.get(permitId) : null;
    const pointRef = ptwShort(row.pointRef);
    const lockRef = ptwShort(row.lockRef);
    const energyKind = PTW_ENERGY_KIND_KEYS.includes(row.energyKind) ? row.energyKind : null;
    const appliedAt = ptwInstant(row.appliedAt);
    const appliedById = id(row.appliedById);
    const verifyWithinMinutes = ptwVerifyWithin(row.verifyWithinMinutes);
    const verifiedAt = row.verifiedAt ? ptwInstant(row.verifiedAt) : null;
    const verifiedById = row.verifiedById ? id(row.verifiedById) : null;
    const removedAt = row.removedAt ? ptwInstant(row.removedAt) : null;
    const removedById = row.removedById ? id(row.removedById) : null;
    const removalConfirmedById = row.removalConfirmedById ? id(row.removalConfirmedById) : null;

    if (!rowId || seen.has(rowId) || !parent || !pointRef || !lockRef || !energyKind
      || !appliedAt || !appliedById || verifyWithinMinutes === null) {
      dropped += 1;
      continue;
    }
    /**
     * AN ISOLATION IS ROUTINELY APPLIED BEFORE THE PERMIT BECOMES LIVE, and that is
     * the correct industrial sequence: the plant is made safe, proved dead, and only
     * then is work authorised under the permit. A loader that refused an isolation
     * applied before the permit's validity start would force crews to record a false
     * time for the only act that keeps them alive. What it does refuse is an
     * isolation attached to a permit this loader was not handed (rule 8 above).
     */

    // A verification arrives whole: an instant needs a hand.
    const verifyPresent = [verifiedAt, verifiedById].filter((value) => value !== null).length;
    if (verifyPresent === 1) { dropped += 1; continue; }
    if (verifiedAt && instantMs(verifiedAt) < instantMs(appliedAt)) { dropped += 1; continue; }

    // A removal arrives whole: an instant needs a hand, and cannot precede the apply.
    const removePresent = [removedAt, removedById].filter((value) => value !== null).length;
    if (removePresent === 1) { dropped += 1; continue; }
    if (removedAt && instantMs(removedAt) < instantMs(appliedAt)) { dropped += 1; continue; }
    if (removalConfirmedById && !removedAt) { dropped += 1; continue; }

    // ONE POINT, ONE LIVE CLAIM. Two rows isolating the same lock on the same permit
    // is one isolation counted twice, which would inflate every coverage figure.
    const pointKey = `${permitId}::${pointRef.toLowerCase()}::${lockRef.toLowerCase()}`;
    if (pointKeys.has(pointKey)) { dropped += 1; continue; }

    seen.add(rowId);
    pointKeys.add(pointKey);
    out.push({
      id: rowId,
      permitId,
      pointRef,
      lockRef,
      energyKind,
      appliedAt,
      appliedById,
      verifyWithinMinutes,
      verifiedAt,
      verifiedById,
      removedAt,
      removedById,
      removalConfirmedById,
      removalConfirmed: Boolean(removedAt && removalConfirmedById),
      removalNote: ptwOptionalNote(row.removalNote),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} isolation row(s) could not be read exactly — an unknown permit, an unreadable point, lock, energy kind, applied instant, hand or verification window, a half-recorded verification or removal, a verification or removal before the isolation was applied, a confirmation with no removal, or one point isolated twice on the same permit — and were dropped.`);
  return out;
}

/* -------------------------------------------------------------- atmosphere */

/**
 * Gas readings. A reading is KEPT even when it FAILS the permit's limit: a reading
 * is a fact about the air, and a register that dropped inconvenient readings would
 * be the reason nobody records a bad one.
 */
export function normalizePtwAtmosphere(rows, permits = [], warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the atmosphere ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(permits).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.atmosphere) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const permitId = id(row.permitId);
    const parent = permitId ? parents.get(permitId) : null;
    const testKey = PTW_ATMOSPHERE_TEST_KEYS.includes(row.testKey) ? row.testKey : null;
    const reading = typeof row.reading === 'number' && Number.isFinite(row.reading) ? row.reading : null;
    const testedAt = ptwInstant(row.testedAt);
    const testedById = id(row.testedById);
    const instrumentRef = ptwShort(row.instrumentRef);

    if (!rowId || seen.has(rowId) || !parent || !testKey || reading === null || !testedAt || !testedById || !instrumentRef) {
      dropped += 1;
      continue;
    }
    // A reading of a gas the permit never declared cannot be compared to anything.
    if (!parent.atmospherePlan.some((entry) => entry.testKey === testKey)) { dropped += 1; continue; }
    /**
     * A PRE-ENTRY TEST IS ROUTINELY TAKEN BEFORE THE PERMIT GOES LIVE — that is what
     * proves the space is fit to enter. The freshness window on the permit is what
     * bounds how old that reading may be when the work starts; refusing a reading
     * taken before the validity start would refuse the test the control depends on.
     */
    // A reading outside the instrument's own published range is not a reading.
    const def = PTW_ATMOSPHERE_TEST_BY_KEY[testKey];
    if (reading < def.readingMin || reading > def.readingMax) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      permitId,
      testKey,
      reading,
      testedAt,
      testedById,
      instrumentRef,
      note: ptwOptionalNote(row.note),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} atmosphere row(s) could not be read exactly — an unknown permit, an unreadable test key, reading, instant, instrument or hand, a test the permit never declared, a reading before the permit's validity began, or a reading outside the instrument's published range — and were dropped.`);
  return out;
}

/* ---------------------------------------------------------------- handovers */

/** A shift handover of the permit: from one holder to the next, a dated act. */
export function normalizePtwHandovers(rows, permits = [], warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the handover ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(permits).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.handovers) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const permitId = id(row.permitId);
    const parent = permitId ? parents.get(permitId) : null;
    const fromId = id(row.fromId);
    const toId = id(row.toId);
    const at = ptwInstant(row.at);
    const note = ptwNote(row.note);
    if (!rowId || seen.has(rowId) || !parent || !fromId || !toId || !at || !note) { dropped += 1; continue; }
    if (fromId === toId) { dropped += 1; continue; }
    if (instantMs(at) < instantMs(parent.validFromAt)) { dropped += 1; continue; }
    seen.add(rowId);
    out.push({ id: rowId, permitId, fromId, toId, at, note, createdAt: typeof row.createdAt === 'string' ? row.createdAt : '' });
  }
  if (dropped) warn(`${dropped} handover row(s) could not be read exactly — an unknown permit, an unreadable hand, instant or note, a handover to the same person, or a handover before the permit began — and were dropped.`);
  return out;
}

/* -------------------------------------------------------------- suspensions */

/** A suspension is a stop with a reason; a resumption is a separate dated act. */
export function normalizePtwSuspensions(rows, permits = [], warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the suspension ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(permits).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.suspensions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const permitId = id(row.permitId);
    const parent = permitId ? parents.get(row.permitId) : null;
    const suspendedAt = ptwInstant(row.suspendedAt);
    const suspendedById = id(row.suspendedById);
    const reason = ptwNote(row.reason);
    const resumedAt = row.resumedAt ? ptwInstant(row.resumedAt) : null;
    const resumedById = row.resumedById ? id(row.resumedById) : null;
    if (!rowId || seen.has(rowId) || !parent || !suspendedAt || !suspendedById || !reason) { dropped += 1; continue; }
    if (instantMs(suspendedAt) < instantMs(parent.validFromAt)) { dropped += 1; continue; }
    const resumePresent = [resumedAt, resumedById].filter((value) => value !== null).length;
    if (resumePresent === 1) { dropped += 1; continue; }
    if (resumedAt && instantMs(resumedAt) <= instantMs(suspendedAt)) { dropped += 1; continue; }
    seen.add(rowId);
    out.push({
      id: rowId, permitId, suspendedAt, suspendedById, reason,
      resumedAt, resumedById,
      resumeNote: resumedAt ? ptwOptionalNote(row.resumeNote) : '',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} suspension row(s) could not be read exactly — an unknown permit, an unreadable instant, hand or reason, a half-recorded resumption, a resumption at or before the suspension, or a suspension before the permit began — and were dropped.`);
  return out;
}

/* ----------------------------------------------------------------- closures */

/** A closure is ONE act; a second closure of the same permit is dropped, not merged. */
export function normalizePtwClosures(rows, permits = [], warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the closure ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(permits).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const byPermit = new Set();
  let dropped = 0;
  let second = 0;
  for (const row of rows) {
    if (out.length >= L.closures) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const permitId = id(row.permitId);
    const parent = permitId ? parents.get(permitId) : null;
    const closedAt = ptwInstant(row.closedAt);
    const closedById = id(row.closedById);
    const outcome = PTW_CLOSURE_OUTCOME_KEYS.includes(row.outcome) ? row.outcome : null;
    const note = ptwNote(row.note);
    if (!rowId || seen.has(rowId) || !parent || !closedAt || !closedById || !outcome || !note) { dropped += 1; continue; }
    if (instantMs(closedAt) < instantMs(parent.validFromAt)) { dropped += 1; continue; }
    if (byPermit.has(permitId)) { second += 1; continue; }
    seen.add(rowId);
    byPermit.add(permitId);
    out.push({ id: rowId, permitId, closedAt, closedById, outcome, note, createdAt: typeof row.createdAt === 'string' ? row.createdAt : '' });
  }
  if (dropped) warn(`${dropped} closure row(s) could not be read exactly — an unknown permit, an unreadable instant, hand, outcome or note, or a closure before the permit began — and were dropped.`);
  if (second) warn(`${second} second closure row(s) were refused: a permit is closed once, and the first closure on the record stands rather than being overwritten.`);
  return out;
}

/* ------------------------------------------------------------------ markers */

/** Identity-free rule markers: unique keys, capped, never repaired. */
export function normalizePtwMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[permit-to-work] ${message}`);
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
      kind: id(row.kind, 60) || 'permit-to-work',
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
 * NOTE WHAT IS NOT HERE: no default validity, no default oxygen limit, no default
 * gas-test freshness and no default verification window. Each is a declared
 * decision on the permit itself, so the workspace has no default that could one
 * day authorise work in an atmosphere nobody measured.
 */
export function normalizePtwSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [PTW_SETTING_KEYS.autoPropagate]: s[PTW_SETTING_KEYS.autoPropagate] !== false,
    [PTW_SETTING_KEYS.privacyFloor]: clampBound(s[PTW_SETTING_KEYS.privacyFloor], PTW_BOUNDS.privacyFloor, PTW_DEFAULTS.privacyFloor),
    [PTW_SETTING_KEYS.horizonDays]: clampBound(s[PTW_SETTING_KEYS.horizonDays], PTW_BOUNDS.horizonDays, PTW_DEFAULTS.horizonDays),
  };
}
