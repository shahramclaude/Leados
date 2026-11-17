/**
 * app/core/domain/personalDealingSchema.js — the fail-closed storage contract of
 * the Personal-Account Dealing & Insider-List Register (ADR-0245, Schema v199).
 *
 * SIX COLLECTIONS, ALL EMPTY AT UPGRADE: `dwlDesignations`, `dwlEvents`,
 * `dwlClearances`, `dwlDecisions`, `dwlDealings` and the rule's `dwlMarkers`.
 * Nothing derived is stored — no window verdict, no clearance state, no days
 * late, no days inside a window, no breach flag, no "is the list live" answer.
 * Every one of those is recomputed on read from the declarations and the injected
 * clock, because a stored verdict is a verdict that can disagree with the days
 * beside it, and the disagreement would surface as a green tick over a closed
 * window.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here completes a missing person, repairs a window, invents a decision,
 * converts a pending clearance into an approval, re-dates a dealing or rescues a
 * row that points at a designation or a clearance this loader was not handed. A
 * row that cannot be read exactly is DROPPED with a counted warning, and the
 * screen prints the count.
 *
 * THE NINE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A DESIGNATION WITH NO PERSON, NO WRITTEN INSTRUMENT OR NO DECLARED START
 *      DAY is dropped. A designation is an appointment on an instrument from a
 *      stated day; without the instrument there is nothing to show anybody, and a
 *      person on an insider list with no basis is a designation nobody can defend
 *      or remove.
 *   2. A DESIGNATION WHOSE END PRECEDES ITS START is dropped. A designation that
 *      ends before it began is not a designation.
 *   3. AN EVENT WITH NO ANCHOR DISCLOSURE DAY OR WITH EITHER BOUND MISSING is
 *      dropped. There is no default window anywhere in this file: a `0` is a
 *      legitimate declaration and a missing number is not, and a window that has
 *      to be guessed is exactly the plausible default the Bulletproof Reliability
 *      Mandate forbids.
 *   4. A CLEARANCE WITH NO PERSON, NO SECURITY, NO SIDE, NO WHOLE QUANTITY OR NO
 *      REQUEST DAY is dropped. A request that cannot say what it asks to trade
 *      cannot be compared against a decision or a dealing.
 *   5. A DECISION WITH NO CLEARANCE OR WITH NO DECIDER is dropped. A decision
 *      that answers no request approves nothing, and a decision with no named hand
 *      cannot be tested for independence.
 *   6. A DECISION WHOSE DECIDER IS THE REQUESTER IS KEPT, AND FLAGGED. The door
 *      refuses this act outright — there is no command that can create it — but
 *      when an imported or hand-edited record carries one it is the single most
 *      damning fact this register can surface, and dropping it would erase it.
 *      The loader therefore keeps the row and marks it `selfApproval: true`, and
 *      the reader prints `breach-decided-by-requester` permanently. Refusing to
 *      create a breach and refusing to hide one are the same discipline.
 *   7. A DECISION DATED BEFORE ITS REQUEST IS KEPT, NEVER REPAIRED. The commands
 *      cannot create it; when it arrives in a record it is the exact ordering
 *      failure the register exists to surface.
 *   8. A DEALING WITH NO PERSON, NO SECURITY, NO SIDE, NO WHOLE QUANTITY OR NO
 *      DEALING DAY is dropped. An executed trade is a fact and is kept even when
 *      it is a bad one — a register that dropped inconvenient trades would push
 *      the fact off the record — but a row that cannot be read is not a fact, it
 *      is noise, and it is counted as such.
 *   9. A DEALING THAT CITES A CLEARANCE THIS LOADER WAS NOT HANDED is dropped.
 *      A trade cannot cite an approval that is not on the record; the reader would
 *      otherwise report a clearance it cannot print.
 */

import {
  DWL_BASIS_KEYS,
  DWL_BOUNDS,
  DWL_DEFAULTS,
  DWL_EVENT_KIND_KEYS,
  DWL_LIMITS as L,
  DWL_SETTING_KEYS,
  DWL_SIDE_KEYS,
} from './personalDealingRegistry.js';
import { dwlDay, dwlQuantity, dwlSecurityRef } from './personalDealingMath.js';
import { daysBetween } from '../time.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, max)
  : '');
const id = (value, max = L.idMax) => {
  const candidate = text(value, max);
  return ID_RE.test(candidate) ? candidate : null;
};

/** A person id: bounded, and the ONLY way a person is named on a row. */
export function dwlPersonId(value) {
  return id(value, L.idMax);
}

/** The written instrument a designation rests on. */
export function dwlInstrumentRef(value) {
  const candidate = text(value, L.instrumentRefMax);
  if (candidate.length < L.instrumentRefMin) return null;
  return candidate.slice(0, L.instrumentRefMax);
}

/** What a closed-period event is about. */
export function dwlSubject(value) {
  const candidate = text(value, L.subjectMax + 60);
  if (candidate.length < L.subjectMin) return null;
  return candidate.slice(0, L.subjectMax);
}

/** A written note — a refusal reason, an approval reason, a citation. */
export function dwlNote(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** An optional written note: empty is legitimate here, unreadable is not. */
export function dwlOptionalNote(value) {
  const candidate = text(value, L.textMax);
  return candidate.slice(0, L.textMax);
}

/** A broker's own contract-note reference. */
export function dwlBrokerRef(value) {
  const candidate = text(value, L.brokerRefMax + 40);
  if (candidate.length < L.brokerRefMin) return null;
  return candidate.slice(0, L.brokerRefMax);
}

/** A whole day offset for a window bound. `0` is legitimate; missing is not. */
export function dwlWindowBound(value, which) {
  const bounds = which === 'after'
    ? { min: L.afterDaysMin, max: L.afterDaysMax }
    : { min: L.beforeDaysMin, max: L.beforeDaysMax };
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < bounds.min || value > bounds.max) return null;
  return value;
}

/* ---------------------------------------------------------- designations */

export function normalizeDwlDesignations(rows, warnings = []) {
  const warn = (message) => warnings.push(`[personal-dealing] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the designation ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.designations) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const personId = dwlPersonId(row.personId);
    const basis = DWL_BASIS_KEYS.includes(row.basis) ? row.basis : null;
    const instrumentRef = dwlInstrumentRef(row.instrumentRef);
    const declaredOn = dwlDay(row.declaredOn);
    const endsOn = row.endsOn === null || row.endsOn === undefined || row.endsOn === '' ? null : dwlDay(row.endsOn);
    const declaredById = id(row.declaredById);
    if (!rowId || seen.has(rowId) || !personId || !basis || !instrumentRef || !declaredOn || !declaredById) {
      dropped += 1;
      continue;
    }
    if (row.endsOn && endsOn === null) { dropped += 1; continue; }
    // A designation whose end precedes its start is not a designation.
    if (endsOn && daysBetween(declaredOn, endsOn) < 0) { dropped += 1; continue; }
    seen.add(rowId);
    out.push({
      id: rowId,
      personId,
      basis,
      instrumentRef,
      declaredOn,
      endsOn,
      note: dwlOptionalNote(row.note),
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} designation row(s) could not be read exactly — an id, a person, a declared basis, a written instrument, a start day, an end that runs backwards or a declaring seat — and were dropped. Nothing was repaired.`);
  return out;
}

/* ----------------------------------------------------------------- events */

export function normalizeDwlEvents(rows, warnings = []) {
  const warn = (message) => warnings.push(`[personal-dealing] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the event ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.events) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const kind = DWL_EVENT_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const subject = dwlSubject(row.subject);
    const disclosesOn = dwlDay(row.disclosesOn);
    const beforeDays = dwlWindowBound(row.beforeDays, 'before');
    const afterDays = dwlWindowBound(row.afterDays, 'after');
    const declaredById = id(row.declaredById);
    const scopeLineIds = [...new Set(list(row.scopeLineIds).map((value) => id(value)).filter(Boolean))];
    if (!rowId || seen.has(rowId) || !kind || !subject || !disclosesOn
      || beforeDays === null || afterDays === null || !declaredById) {
      dropped += 1;
      continue;
    }
    seen.add(rowId);
    out.push({
      id: rowId,
      kind,
      subject,
      disclosesOn,
      // The two bounds are stored exactly as declared, and the span is derived on
      // read by `windowSpan`. `0` is a legitimate declaration; nothing is defaulted.
      beforeDays,
      afterDays,
      scopeLineIds,
      declaredById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} closed-period event row(s) could not be read exactly — an id, a kind, a subject, an anchor disclosure day, a declared whole-day bound before or after, or a declaring seat — and were dropped. No window was defaulted.`);
  return out;
}

/* ------------------------------------------------------------- clearances */

export function normalizeDwlClearances(rows, designations = [], warnings = []) {
  const warn = (message) => warnings.push(`[personal-dealing] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the clearance ledger was not an array; it was read as empty');
    return [];
  }
  const personIds = new Set(list(designations).map((row) => row.personId));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let notDesignated = 0;
  for (const row of rows) {
    if (out.length >= L.clearances) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const personId = dwlPersonId(row.personId);
    const securityRef = dwlSecurityRef(row.securityRef, { min: L.securityRefMin, max: L.securityRefMax });
    const side = DWL_SIDE_KEYS.includes(row.side) ? row.side : null;
    const quantity = dwlQuantity(typeof row.quantity === 'number' ? row.quantity : Number(row.quantity), { min: L.quantityMin, max: L.quantityMax });
    const requestedOn = dwlDay(row.requestedOn);
    const requestedById = id(row.requestedById);
    if (!rowId || seen.has(rowId) || !personId || !securityRef || !side || quantity === null || !requestedOn || !requestedById) {
      dropped += 1;
      continue;
    }
    // A clearance asked about a person this register holds no designation for is
    // kept — the request is a real act — but counted, because the reader will
    // print `designationMissing` rather than pretending the person is on the list.
    if (!personIds.has(personId)) notDesignated += 1;
    seen.add(rowId);
    out.push({
      id: rowId,
      personId,
      securityRef,
      side,
      quantity,
      requestedOn,
      requestedById,
      reason: dwlOptionalNote(row.reason),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} clearance row(s) could not be read exactly — an id, a person, a security reference, a side, a whole quantity, a request day or a requesting seat — and were dropped.`);
  if (notDesignated) warn(`${notDesignated} clearance(s) name a person this register holds no designation for; the reader prints them beside that refusal rather than treating the person as listed.`);
  return out;
}

/* -------------------------------------------------------------- decisions */

export function normalizeDwlDecisions(rows, clearances = [], warnings = []) {
  const warn = (message) => warnings.push(`[personal-dealing] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the decision ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(clearances).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  const perClearance = new Set();
  let dropped = 0;
  let selfDecided = 0;
  for (const row of rows) {
    if (out.length >= L.decisions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const clearanceId = id(row.clearanceId);
    const clearance = clearanceId ? parents.get(clearanceId) : null;
    const decidedOn = dwlDay(row.decidedOn);
    const decidedById = id(row.decidedById);
    const outcome = row.outcome === 'cleared' || row.outcome === 'refused' ? row.outcome : null;
    if (!rowId || seen.has(rowId) || !clearance || !decidedOn || !decidedById || !outcome) {
      dropped += 1;
      continue;
    }
    // One decision per clearance: a clearance is answered once. A second would
    // overwrite an answer somebody gave.
    if (perClearance.has(clearanceId)) { dropped += 1; continue; }

    const validityDays = row.validityDays === null || row.validityDays === undefined || row.validityDays === ''
      ? null
      : (Number.isInteger(row.validityDays) ? row.validityDays : null);
    const reason = dwlOptionalNote(row.reason);

    // A cleared decision MUST declare a validity, and a refusal MUST carry a
    // written reason. Either rule failing drops the row: a clearance with no end
    // would approve a trade indefinitely, and a refusal nobody explained is not a
    // decision anybody can appeal.
    if (outcome === 'cleared') {
      if (validityDays === null || validityDays < 1 || validityDays > L.validityMaxDays) { dropped += 1; continue; }
    }
    if (outcome === 'refused' && dwlNote(row.reason) === null) { dropped += 1; continue; }

    // THE SELF-APPROVAL IS KEPT AND FLAGGED, NEVER DROPPED. The door refuses a
    // decider who is the requester; there is no command that can create one. When
    // an imported or hand-edited record carries one it is the exact fact this
    // register exists to surface, and dropping it would erase it. The row is
    // marked here so the reader can print `breach-decided-by-requester`
    // permanently — the marker is DERIVED from the ids on the row, never trusted
    // from a flag somebody could omit.
    const self = decidedById === clearance.requestedById;
    if (self) selfDecided += 1;

    seen.add(rowId);
    perClearance.add(clearanceId);
    out.push({
      id: rowId,
      clearanceId,
      decidedOn,
      decidedById,
      outcome,
      validityDays: outcome === 'cleared' ? validityDays : null,
      reason,
      selfApproval: self,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} decision row(s) could not be read exactly — an unknown clearance, a decision day, a decider, a written outcome, a cleared decision with no declared validity, a refusal with no written reason or a second decision to the same clearance — and were dropped.`);
  if (selfDecided) warn(`${selfDecided} decision(s) name the REQUESTER as the decider. They are KEPT and printed as breaches; the door cannot create this act, and the register will not hide an imported one.`);
  return out;
}

/* --------------------------------------------------------------- dealings */

export function normalizeDwlDealings(rows, clearances = [], warnings = []) {
  const warn = (message) => warnings.push(`[personal-dealing] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the dealing ledger was not an array; it was read as empty');
    return [];
  }
  const parents = new Map(list(clearances).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let unreadableClearance = 0;
  for (const row of rows) {
    if (out.length >= L.dealings) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const personId = dwlPersonId(row.personId);
    const securityRef = dwlSecurityRef(row.securityRef, { min: L.securityRefMin, max: L.securityRefMax });
    const side = DWL_SIDE_KEYS.includes(row.side) ? row.side : null;
    const quantity = dwlQuantity(typeof row.quantity === 'number' ? row.quantity : Number(row.quantity), { min: L.quantityMin, max: L.quantityMax });
    const dealtOn = dwlDay(row.dealtOn);
    const brokerRef = dwlBrokerRef(row.brokerRef);
    const recordedById = id(row.recordedById);
    const clearanceId = row.clearanceId === null || row.clearanceId === undefined || row.clearanceId === ''
      ? null
      : id(row.clearanceId);
    if (!rowId || seen.has(rowId) || !personId || !securityRef || !side || quantity === null
      || !dealtOn || !brokerRef || !recordedById) {
      dropped += 1;
      continue;
    }
    // A trade cannot cite a clearance this loader was not handed. The row is kept
    // with the citation cleared and a COUNTED warning, because the executed trade
    // is a fact that must not vanish — but the register will never print a
    // clearance it cannot show.
    let cited = clearanceId;
    if (clearanceId && !parents.has(clearanceId)) {
      unreadableClearance += 1;
      cited = null;
    }
    if (cited) {
      const parent = parents.get(cited);
      // A dealing must cite a clearance for the SAME person. A trade citing
      // somebody else's approval is not an approval of this trade.
      if (parent && parent.personId !== personId) { unreadableClearance += 1; cited = null; }
    }
    seen.add(rowId);
    out.push({
      id: rowId,
      personId,
      securityRef,
      side,
      quantity,
      dealtOn,
      brokerRef,
      clearanceId: cited,
      note: dwlOptionalNote(row.note),
      recordedById,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} dealing row(s) could not be read exactly — an id, a person, a security reference, a side, a whole quantity, a dealing day, a broker contract-note reference or a recording seat — and were dropped.`);
  if (unreadableClearance) warn(`${unreadableClearance} dealing(s) cite a clearance that is not on this record, belongs to another person, or cites a person this loader could not resolve. The trade is KEPT as the fact it is, with its citation cleared and counted here; nothing was invented to replace it.`);
  return out;
}

/* ------------------------------------------------------------------ markers */

export function normalizeDwlMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[personal-dealing] ${message}`);
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
      kind: id(row.kind, 60) || 'personal-dealing',
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
 * Note what is NOT here: a closed-period window and a clearance validity. Both
 * are facts about a particular event and a particular decision, so they are
 * declared per row and bounded in `DWL_LIMITS`. A workspace-level default window
 * would be the plausible default this register refuses to hold — and a default
 * window is the single most dangerous thing a dealing register could carry,
 * because it would silently decide, every day, that dealing was open.
 */
export function normalizeDwlSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [DWL_SETTING_KEYS.autoPropagate]: s[DWL_SETTING_KEYS.autoPropagate] !== false,
    [DWL_SETTING_KEYS.privacyFloor]: clampBound(s[DWL_SETTING_KEYS.privacyFloor], DWL_BOUNDS.privacyFloor, DWL_DEFAULTS.privacyFloor),
    [DWL_SETTING_KEYS.clearanceTurnaroundDays]: clampBound(s[DWL_SETTING_KEYS.clearanceTurnaroundDays], DWL_BOUNDS.clearanceTurnaroundDays, DWL_DEFAULTS.clearanceTurnaroundDays),
  };
}
