/**
 * app/core/domain/personalDealingActions.js — the seat-checked commands of the
 * Personal-Account Dealing & Insider-List Register (ADR-0245, Schema v199).
 *
 * Eight human acts and a scan, and nothing else: DECLARE a designation, END a
 * designation, DECLARE a closed-period event and its window, REQUEST a clearance,
 * DECIDE a clearance, RECORD an executed dealing, re-declare the conventions, and
 * the explicit scan. Every window verdict, clearance state, dealing state,
 * days-late figure and breach offset is re-derived on read by `personalDealing.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A DESIGNATION carries a PERSON, a WRITTEN INSTRUMENT, a CLOSED BASIS and a
 *    DECLARED START DAY, or it is refused. No designation is inferred from a job
 *    title, a pay grade or a span: an insider list nobody was appointed to is a
 *    list that will be wrong in both directions.
 *  - AN EVENT carries a SUBJECT, an ANCHOR DISCLOSURE DAY and EXPLICIT WHOLE-DAY
 *    BOUNDS before and after it, or it is refused. There is NO DEFAULT WINDOW
 *    anywhere in this file: a `0` is a legitimate declaration and a missing number
 *    is not. A window the software chose would silently decide, every day, that
 *    dealing was open.
 *  - A CLEARANCE REQUEST carries a SECURITY, a SIDE and a WHOLE QUANTITY, or it is
 *    refused. A request that cannot say what it asks to trade cannot be compared
 *    against a decision or a dealing.
 *  - A DECISION IS REFUSED FROM THE REQUESTER, AND FROM ANY SEAT NOT STRICTLY
 *    ABOVE THEM. This is the register's central control, and it is proved against
 *    the live reporting graph through the one matrix engine — never against a role
 *    string an administrator could configure. A cleared decision MUST declare its
 *    last valid day; a refusal MUST state its written reason. Neither is
 *    defaulted, and neither may be invented by the software.
 *  - ONE DECISION PER CLEARANCE. A clearance is answered once; a second answer
 *    would overwrite the first.
 *  - AN EXECUTED DEALING carries a BROKER'S OWN CONTRACT-NOTE REFERENCE, or it is
 *    refused. The door does NOT refuse to record a trade made in a closed window
 *    or after a refusal — a bad trade is a FACT, and a register that refused it
 *    would push the fact off the record entirely, which is the opposite of a
 *    control. What the door refuses is a dealing citing a clearance that belongs
 *    to somebody else or is not on the record.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that infers a designation, no
 * command that clears a trade for the hand that asked, no command that treats
 * silence as approval, no command that deletes a breach, no command that re-dates
 * an act, no command that edits an executed trade away, and no command that scores
 * a person. The absence of those commands is the design.
 */

import { dayKey, daysBetween } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor, matrixJointApex } from './matrix.js';
import { buildPersonalDealing, dwlCanDecide, dwlIndependentDecider, personalDealingAttentionCount } from './personalDealing.js';
import {
  DWL_BASIS_BY_KEY,
  DWL_BOUNDS,
  DWL_DECIDE_MIN_RANK,
  DWL_EVENTS,
  DWL_EVENT_KIND_BY_KEY,
  DWL_LIMITS as L,
  DWL_REFUSALS,
  DWL_RIGHTS,
  DWL_ROUTE,
  DWL_SETTING_KEYS,
  DWL_SIDE_KEYS,
} from './personalDealingRegistry.js';
import {
  dwlNote,
  dwlOptionalNote,
  dwlPersonId,
  dwlSubject,
  dwlWindowBound,
  normalizeDwlClearances,
  normalizeDwlDealings,
  normalizeDwlDecisions,
  normalizeDwlDesignations,
  normalizeDwlEvents,
  normalizeDwlSettings,
} from './personalDealingSchema.js';
import { dwlDay, dwlQuantity, dwlSecurityRef, turnaroundDueOn, validThrough } from './personalDealingMath.js';
import { dwlBrokerRef, dwlInstrumentRef } from './personalDealingSchema.js';

const REFUSAL = (key) => `personal-dealing:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value) => (Array.isArray(value) ? value : []);

export function createPersonalDealingActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(DWL_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check,
   * so the right is re-proved HERE. Without it, a person's own dealing record
   * would be readable by a seat the individual record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(DWL_REFUSALS.notSeated);
    const verdict = canAct(DWL_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, today: dayKey(at) };
  }

  /** Does the acting seat hold this hand (itself, its span, or a declared line)? */
  function holdsHand(check, personId) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  function personRow(personId) {
    return rows('people').find((row) => row && row.id === personId) || null;
  }

  /** A declared day that is not in the future. A record is about what happened. */
  function declaredDay(check, value, field, { allowFuture = false, maxFuture = 0, maxBackDays = L.actMaxBackDays } = {}) {
    const day = dwlDay(value);
    if (!day) return { error: fail('Give a real day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const ahead = daysBetween(check.today, day);
    if (!allowFuture && ahead > 0) {
      return { error: fail('That day is in the future. This register records what a human declared or did, not what will be.', field, REFUSAL('day-future')) };
    }
    if (allowFuture && ahead > maxFuture) {
      return { error: fail(`That day is more than ${maxFuture} days ahead. A disclosure date the register cannot plausibly hold is not one it will accept.`, field, REFUSAL('day-too-far')) };
    }
    if (daysBetween(day, check.today) > maxBackDays) {
      return { error: fail(`A record cannot be back-dated more than ${maxBackDays} days; an act nobody recorded in the moment cannot be reconstructed after the fact.`, field, REFUSAL('day-too-old')) };
    }
    return { day };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  const designations = () => normalizeDwlDesignations(rows('dwlDesignations'), []);
  const events = () => normalizeDwlEvents(rows('dwlEvents'), []);
  const clearances = () => normalizeDwlClearances(rows('dwlClearances'), designations(), []);
  const decisions = () => normalizeDwlDecisions(rows('dwlDecisions'), clearances(), []);
  const dealings = () => normalizeDwlDealings(rows('dwlDealings'), clearances(), []);

  function clearanceContext(check, clearanceId) {
    const id = text(clearanceId, L.idMax) || null;
    if (!id) return fail('Choose the clearance this act concerns.', 'clearanceId');
    const clearance = clearances().find((row) => row.id === id) || null;
    if (!clearance) return fail(DWL_REFUSALS.notFound, 'clearanceId', REFUSAL('clearance-not-found'));
    return { ok: true, clearance };
  }

  /** The reach test: the seat acts only on hands it holds. */
  function clearanceReach(check, clearance) {
    if (check.seat.fullAccess) return true;
    return holdsHand(check, clearance.personId);
  }

  return {
    /* ----------------------------------------------------------- designation */

    /**
     * DECLARE a designation: the person, the written instrument, the closed
     * basis, and the day it takes effect. Never inferred from a title.
     */
    dwlDeclareDesignation(input = {}) {
      const check = seatFor(DWL_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const personId = dwlPersonId(input.personId);
      if (!personId) return fail('Name the person this designation applies to. A designation is about a named hand, not a role.', 'personId', REFUSAL('person-missing'));
      if (!personRow(personId)) return fail(DWL_REFUSALS.personNotFound, 'personId', REFUSAL('person-not-found'));

      const basis = text(input.basis, L.basisMax);
      if (!DWL_BASIS_BY_KEY[basis]) {
        return fail('Choose the basis on which this person is designated. A job title is not a legal basis: statutory insider, person discharging managerial responsibility, access to unpublished price-sensitive information, or contractual.', 'basis', REFUSAL('basis-invalid'));
      }

      const instrumentRef = dwlInstrumentRef(input.instrumentRef);
      if (!instrumentRef) {
        return fail(`Cite the written instrument in at least ${L.instrumentRefMin} characters — the policy clause, the appointment letter, the engagement. A person on an insider list with no instrument is a designation nobody can defend or remove.`, 'instrumentRef', REFUSAL('instrument-missing'));
      }

      const declaredOn = declaredDay(check, input.declaredOn, 'declaredOn');
      if (declaredOn.error) return declaredOn.error;

      let endsOn = null;
      if (input.endsOn !== undefined && input.endsOn !== null && input.endsOn !== '') {
        const day = dwlDay(input.endsOn);
        if (!day) return fail('Give a real day for the end of the designation (YYYY-MM-DD).', 'endsOn', REFUSAL('day-invalid'));
        if (daysBetween(declaredOn.day, day) < 0) {
          return fail('A designation cannot end before it began. An appointment that ends on or before its first day is not a designation.', 'endsOn', REFUSAL('term-reversed'));
        }
        endsOn = day;
      }

      // A second live designation on the SAME basis for the same person is a
      // duplicate, not a new appointment.
      const duplicate = designations().find((row) => row.personId === personId
        && row.basis === basis
        && (row.endsOn === null || row.endsOn >= declaredOn.day));
      if (duplicate) {
        return fail('That person already carries a live designation on this basis. A second one would be a duplicate appointment, not a new one; end the earlier designation first if the basis has changed.', 'personId', REFUSAL('already-designated'));
      }

      if (designations().length >= L.designations) return fail(DWL_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const id = idFactory('dwl-des');
      const row = {
        id,
        personId,
        basis,
        instrumentRef,
        declaredOn: declaredOn.day,
        endsOn,
        note: dwlOptionalNote(input.note),
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeDwlDesignations([...rows('dwlDesignations'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The designation could not be stored as a row this register can read back. Nothing was saved.', 'instrumentRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dwlDesignations = Array.isArray(draft.dwlDesignations) ? draft.dwlDesignations : [];
        draft.dwlDesignations.push(stored);
      }, {
        type: DWL_EVENTS.DESIGNATION_DECLARED,
        entity: 'workspace',
        entityId: id,
        summary: `Designation declared on ${DWL_BASIS_BY_KEY[basis].label.toLowerCase()} from ${declaredOn.day}${endsOn ? ` to ${endsOn}` : ', open-ended'} (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, designation: stored });
    },

    /** END a designation: the day it stops. Forward-only, and recorded once. */
    dwlEndDesignation(input = {}) {
      const check = seatFor(DWL_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const id = text(input.designationId, L.idMax) || null;
      if (!id) return fail('Choose the designation to end.', 'designationId');
      const current = designations().find((row) => row.id === id) || null;
      if (!current) return fail(DWL_REFUSALS.notFound, 'designationId', REFUSAL('designation-not-found'));
      if (current.endsOn) return fail('That designation already carries an end day. A designation ends once; re-dating it would rewrite history.', 'designationId', REFUSAL('already-ended'));

      const endsOn = declaredDay(check, input.endsOn, 'endsOn');
      if (endsOn.error) return endsOn.error;
      if (daysBetween(current.declaredOn, endsOn.day) < 0) {
        return fail('A designation cannot end before it began. Record the end on or after its start day.', 'endsOn', REFUSAL('term-reversed'));
      }

      const target = rows('dwlDesignations').find((row) => row && row.id === id);
      if (!target) return fail(DWL_REFUSALS.notFound, 'designationId', REFUSAL('designation-not-found'));
      const updated = { ...target, endsOn: endsOn.day, updatedAt: check.at.toISOString() };
      const stored = normalizeDwlDesignations(
        rows('dwlDesignations').map((row) => (row && row.id === id ? updated : row)), [],
      ).find((row) => row.id === id) || null;
      if (!stored) return fail('The end day could not be stored as a row this register can read back. Nothing was saved.', 'endsOn', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dwlDesignations = rows('dwlDesignations').map((row) => (row && row.id === id ? stored : row));
      }, {
        type: DWL_EVENTS.DESIGNATION_ENDED,
        entity: 'workspace',
        entityId: id,
        summary: `Designation ended ${endsOn.day} (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, designation: stored });
    },

    /* ----------------------------------------------------------------- event */

    /**
     * DECLARE a closed-period event and ITS WINDOW: the anchor disclosure day plus
     * the explicit whole days before and after it. There is no default.
     */
    dwlDeclareEvent(input = {}) {
      const check = seatFor(DWL_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const kind = text(input.kind, 60);
      if (!DWL_EVENT_KIND_BY_KEY[kind]) {
        return fail('Choose what kind of event closes the window: a results announcement, a transaction, or ad-hoc inside information.', 'kind', REFUSAL('kind-invalid'));
      }

      const subject = dwlSubject(input.subject);
      if (!subject) return fail(`Write the subject in at least ${L.subjectMin} characters — what information this window exists to protect.`, 'subject', REFUSAL('subject-invalid'));

      const disclosesOn = declaredDay(check, input.disclosesOn, 'disclosesOn', { allowFuture: true, maxFuture: L.disclosureMaxAheadDays });
      if (disclosesOn.error) return disclosesOn.error;

      const beforeDays = dwlWindowBound(Number(input.beforeDays), 'before');
      if (beforeDays === null) {
        return fail(`Declare how many WHOLE days before the disclosure day the window is closed, between ${L.beforeDaysMin} and ${L.beforeDaysMax}. Zero is a legitimate declaration; a missing number is not, and the register holds no default window.`, 'beforeDays', REFUSAL('before-days-invalid'));
      }
      const afterDays = dwlWindowBound(Number(input.afterDays), 'after');
      if (afterDays === null) {
        return fail(`Declare how many WHOLE days after the disclosure day the window stays closed, between ${L.afterDaysMin} and ${L.afterDaysMax}. Zero is a legitimate declaration; a missing number is not.`, 'afterDays', REFUSAL('after-days-invalid'));
      }

      const scopeLineIds = [...new Set(list(input.scopeLineIds).map((value) => text(value, L.idMax)).filter(Boolean))];
      for (const lineId of scopeLineIds) {
        if (!personRow(lineId)) return fail(`The scope line “${lineId}” is not a hand on this record. Nothing was saved.`, 'scopeLineIds', REFUSAL('line-not-found'));
      }

      if (events().length >= L.events) return fail(DWL_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const id = idFactory('dwl-evt');
      const row = {
        id,
        kind,
        subject,
        disclosesOn: disclosesOn.day,
        beforeDays,
        afterDays,
        scopeLineIds,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeDwlEvents([...rows('dwlEvents'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The event could not be stored as a row this register can read back. Nothing was saved.', 'subject', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dwlEvents = Array.isArray(draft.dwlEvents) ? draft.dwlEvents : [];
        draft.dwlEvents.push(stored);
      }, {
        type: DWL_EVENTS.EVENT_DECLARED,
        entity: 'workspace',
        entityId: id,
        summary: `Closed period declared for the disclosure on ${disclosesOn.day}: ${beforeDays} day(s) closed before it and ${afterDays} after (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, event: stored });
    },

    /* ------------------------------------------------------------- clearance */

    /** REQUEST a clearance: what, which side, how much, asked on a day. */
    dwlRequestClearance(input = {}) {
      const check = seatFor(DWL_RIGHTS.REQUEST);
      if (!check.ok) return check;

      const personId = dwlPersonId(input.personId);
      if (!personId) return fail('Name the person the clearance is for.', 'personId', REFUSAL('person-missing'));
      if (!personRow(personId)) return fail(DWL_REFUSALS.personNotFound, 'personId', REFUSAL('person-not-found'));
      if (!holdsHand(check, personId)) return fail(DWL_REFUSALS.noReach, 'personId', REFUSAL('not-your-line'));

      // A clearance is asked about a designated person. Asking for somebody not on
      // the list is refused rather than quietly accepted, because this register
      // measures the dealings of designated persons.
      const designationAtRequest = designations().find((row) => row.personId === personId
        && row.declaredOn <= check.today
        && (row.endsOn === null || row.endsOn >= check.today));
      if (!designationAtRequest) return fail(DWL_REFUSALS.designationMissing, 'personId', REFUSAL('not-designated'));

      const securityRef = dwlSecurityRef(input.securityRef, { min: L.securityRefMin, max: L.securityRefMax });
      if (!securityRef) return fail(`Write the security in at least ${L.securityRefMin} characters — the reference the broker or the instrument uses.`, 'securityRef', REFUSAL('security-missing'));

      const side = text(input.side, 20);
      if (!DWL_SIDE_KEYS.includes(side)) return fail('Choose the side of the trade: buy or sell.', 'side', REFUSAL('side-invalid'));

      const quantity = dwlQuantity(typeof input.quantity === 'number' ? input.quantity : Number(input.quantity), { min: L.quantityMin, max: L.quantityMax });
      if (quantity === null) {
        return fail(`The quantity must be a whole number between ${L.quantityMin} and ${L.quantityMax}. It is refused rather than rounded: a clearance for "about" a number of shares approves nothing exact.`, 'quantity', REFUSAL('quantity-invalid'));
      }

      if (clearances().length >= L.clearances) return fail(DWL_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const id = idFactory('dwl-clr');
      const row = {
        id,
        personId,
        securityRef,
        side,
        quantity,
        requestedOn: check.today,
        requestedById: check.actorId,
        reason: dwlOptionalNote(input.reason),
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeDwlClearances([...rows('dwlClearances'), row], designations(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The clearance request could not be stored as a row this register can read back. Nothing was saved.', 'securityRef', REFUSAL('unreadable'));

      const dueOn = turnaroundDueOn(check.today, normalizeDwlSettings(settings())[DWL_SETTING_KEYS.clearanceTurnaroundDays]);
      writeDraft((draft) => {
        draft.dwlClearances = Array.isArray(draft.dwlClearances) ? draft.dwlClearances : [];
        draft.dwlClearances.push(stored);
      }, {
        type: DWL_EVENTS.CLEARANCE_REQUESTED,
        entity: 'workspace',
        entityId: id,
        summary: `Clearance requested on ${check.today} for ${quantity} ${side === 'buy' ? 'bought' : 'sold'} against ${securityRef}; a decision is owed by ${dueOn || 'the declared turnaround'} (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, clearance: stored, dueOn });
    },

    /**
     * DECIDE a clearance. THE CENTRAL CONTROL: refused from the requester, and
     * refused from any hand not strictly above them on the reporting graph through
     * every line they hold.
     */
    dwlDecideClearance(input = {}) {
      const check = seatFor(DWL_RIGHTS.DECIDE);
      if (!check.ok) return check;

      const context = clearanceContext(check, input.clearanceId);
      if (!context.ok) return context;
      const { clearance } = context;

      if (!clearanceReach(check, clearance)) {
        return fail(DWL_REFUSALS.noReach, 'clearanceId', REFUSAL('not-your-line'));
      }
      if (decisions().some((row) => row.clearanceId === clearance.id)) {
        return fail(DWL_REFUSALS.alreadyDecided, 'clearanceId', REFUSAL('already-decided'));
      }

      // THE INDEPENDENCE TEST, PROVED AGAINST THE LIVE GRAPH. `activeSeat` has a
      // `nodeId` for a declared person; the full-access operator view is
      // deliberately NOT exempt from this test in spirit — but the operator view
      // has no person on the graph, so it is treated as the workspace leader, the
      // one seat that sits above everybody. That is stated plainly rather than
      // hidden: an undeclared operator is acting as the enterprise's own apex.
      const deciderId = check.actorId;
      if (deciderId === clearance.requestedById) {
        return fail(DWL_REFUSALS.selfDecision, 'clearanceId', REFUSAL('self-decision'));
      }
      const report = buildPersonalDealing(store.state, { now: check.at, settings: check.cfg, seat: null });
      const can = dwlCanDecide(report.matrix, deciderId, clearance.requestedById);
      if (!can.ok) {
        if (can.reason === 'self') return fail(DWL_REFUSALS.selfDecision, 'clearanceId', REFUSAL('self-decision'));
        return fail(`${DWL_REFUSALS.notAboveRequester} ${can.reason === 'not-above' ? 'The hands strictly above the requester through their lines are named on the clearance row.' : (can.reason || '')}`.trim(), 'clearanceId', REFUSAL('not-above-requester'));
      }

      const outcome = text(input.outcome, 20);
      if (outcome !== 'cleared' && outcome !== 'refused') return fail('Decide the clearance: cleared or refused. There is no third answer, and silence is not one.', 'outcome', REFUSAL('outcome-invalid'));

      const decidedOn = declaredDay(check, input.decidedOn, 'decidedOn');
      if (decidedOn.error) return decidedOn.error;
      if (daysBetween(clearance.requestedOn, decidedOn.day) < 0) {
        return fail(`The decision cannot be dated before the request (${clearance.requestedOn}). An act dated before the act it depends on is a breach, not a shortcut.`, 'decidedOn', REFUSAL('decided-before-request'));
      }

      let validityDays = null;
      let reason = '';
      if (outcome === 'cleared') {
        validityDays = Number(input.validityDays);
        if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > L.validityMaxDays) {
          return fail(`A cleared decision must declare the last day it is valid for, as a whole number between 1 and ${L.validityMaxDays} days from the decision. Without it a clearance would approve a trade indefinitely.`, 'validityDays', REFUSAL('validity-missing'));
        }
        reason = dwlOptionalNote(input.reason);
      } else {
        reason = dwlNote(input.reason);
        if (!reason) {
          return fail(`A refusal must state its written reason, in at least ${L.textMin} characters. A refusal nobody explained is not a decision anybody can appeal, and it is not a control.`, 'reason', REFUSAL('reason-missing'));
        }
      }

      if (decisions().length >= L.decisions) return fail(DWL_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const id = idFactory('dwl-dec');
      const row = {
        id,
        clearanceId: clearance.id,
        decidedOn: decidedOn.day,
        decidedById: deciderId,
        outcome,
        validityDays: outcome === 'cleared' ? validityDays : null,
        reason,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeDwlDecisions([...rows('dwlDecisions'), row], clearances(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The decision could not be stored as a row this register can read back. Nothing was saved.', 'outcome', REFUSAL('unreadable'));

      const through = outcome === 'cleared' ? validThrough(decidedOn.day, validityDays) : null;
      writeDraft((draft) => {
        draft.dwlDecisions = Array.isArray(draft.dwlDecisions) ? draft.dwlDecisions : [];
        draft.dwlDecisions.push(stored);
      }, {
        type: DWL_EVENTS.CLEARANCE_DECIDED,
        entity: 'workspace',
        entityId: id,
        summary: outcome === 'cleared'
          ? `Clearance granted ${decidedOn.day} by a hand strictly above the requester, valid through ${through} (${DWL_ROUTE}).`.slice(0, 300)
          : `Clearance refused ${decidedOn.day} with a written reason (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, decision: stored, validThrough: through });
    },

    /* --------------------------------------------------------------- dealing */

    /**
     * RECORD an executed dealing. The door does NOT refuse a bad trade: a register
     * that dropped a trade made in a closed window would push the fact off the
     * record. It refuses only a citation that is not a clearance for this person.
     */
    dwlRecordDealing(input = {}) {
      const check = seatFor(DWL_RIGHTS.REQUEST);
      if (!check.ok) return check;

      const personId = dwlPersonId(input.personId);
      if (!personId) return fail('Name the person who dealt.', 'personId', REFUSAL('person-missing'));
      if (!personRow(personId)) return fail(DWL_REFUSALS.personNotFound, 'personId', REFUSAL('person-not-found'));
      if (!holdsHand(check, personId)) return fail(DWL_REFUSALS.noReach, 'personId', REFUSAL('not-your-line'));

      const securityRef = dwlSecurityRef(input.securityRef, { min: L.securityRefMin, max: L.securityRefMax });
      if (!securityRef) return fail(`Write the security in at least ${L.securityRefMin} characters — the reference the broker uses.`, 'securityRef', REFUSAL('security-missing'));

      const side = text(input.side, 20);
      if (!DWL_SIDE_KEYS.includes(side)) return fail('Choose the side of the trade: buy or sell.', 'side', REFUSAL('side-invalid'));

      const quantity = dwlQuantity(typeof input.quantity === 'number' ? input.quantity : Number(input.quantity), { min: L.quantityMin, max: L.quantityMax });
      if (quantity === null) {
        return fail(`The quantity must be a whole number between ${L.quantityMin} and ${L.quantityMax}. It is refused rather than rounded.`, 'quantity', REFUSAL('quantity-invalid'));
      }

      const dealtOn = declaredDay(check, input.dealtOn, 'dealtOn');
      if (dealtOn.error) return dealtOn.error;

      const brokerRef = dwlBrokerRef(input.brokerRef);
      if (!brokerRef) {
        return fail(`Cite the broker’s own contract note in at least ${L.brokerRefMin} characters. The executed trade is a fact and it is recorded against the note that proves it; without the note the register would be holding an assertion.`, 'brokerRef', REFUSAL('broker-ref-missing'));
      }

      let clearanceId = null;
      if (input.clearanceId !== undefined && input.clearanceId !== null && input.clearanceId !== '') {
        const context = clearanceContext(check, input.clearanceId);
        if (!context.ok) return context;
        // A dealing may only cite a clearance for the SAME person. A trade citing
        // somebody else's approval is not an approval of this trade.
        if (context.clearance.personId !== personId) {
          return fail('That clearance was asked for by another person. A trade cannot cite somebody else’s approval; record the clearance for this person first.', 'clearanceId', REFUSAL('clearance-not-yours'));
        }
        clearanceId = context.clearance.id;
      }

      if (dealings().length >= L.dealings) return fail(DWL_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const id = idFactory('dwl-dlg');
      const row = {
        id,
        personId,
        securityRef,
        side,
        quantity,
        dealtOn: dealtOn.day,
        brokerRef,
        clearanceId,
        note: dwlOptionalNote(input.note),
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeDwlDealings([...rows('dwlDealings'), row], clearances(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The dealing could not be stored as a row this register can read back. Nothing was saved.', 'brokerRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dwlDealings = Array.isArray(draft.dwlDealings) ? draft.dwlDealings : [];
        draft.dwlDealings.push(stored);
      }, {
        type: DWL_EVENTS.DEALING_RECORDED,
        entity: 'workspace',
        entityId: id,
        summary: `Executed dealing recorded on ${dealtOn.day} against contract note ${brokerRef}${clearanceId ? ', citing a clearance' : ', citing no clearance'} (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, dealing: stored });
    },

    /* ------------------------------------------------------------ conventions */

    dwlSetConventions(input = {}) {
      const check = seatFor(DWL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const current = normalizeDwlSettings(settings());
      const patch = input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch) ? input.patch : input;
      const known = new Set(Object.values(DWL_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === DWL_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = DWL_BOUNDS[key === DWL_SETTING_KEYS.privacyFloor ? 'privacyFloor' : 'clearanceTurnaroundDays'];
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: DWL_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: DWL_ROUTE,
        summary: `Personal-dealing conventions re-declared: the clearance turnaround, the privacy floor and whether the rule may file asks (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: normalizeDwlSettings(store.state.settings || {}) });
    },

    /* ---------------------------------------------------------------- reads */

    dwlReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildPersonalDealing(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    dwlAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: personalDealingAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * The candidates a dialog may name, narrowed to what this seat may actually
     * reach: the hands it holds, the designations those hands carry, the
     * clearances open to them, and — for a decision — the hands strictly above a
     * requester, named from the graph rather than guessed.
     */
    dwlCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildPersonalDealing(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      const people = rows('people')
        .filter((row) => row && row.status !== 'archived' && row.id)
        .filter((row) => holdsHand(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const designations = report.designationRows.map((row) => ({
        id: row.designation.id,
        personId: row.designation.personId,
        personName: row.personName,
        basis: row.designation.basis,
        basisLabel: row.basisLabel,
        declaredOn: row.designation.declaredOn,
        endsOn: row.designation.endsOn,
        live: row.live,
      }));
      const clearances = report.clearanceRows.map((row) => ({
        id: row.clearance.id,
        personId: row.clearance.personId,
        personName: row.personName,
        securityRef: row.clearance.securityRef,
        side: row.clearance.side,
        quantity: row.clearance.quantity,
        requestedOn: row.clearance.requestedOn,
        requestedById: row.clearance.requestedById,
        stateKey: row.state.key,
        hasDecision: Boolean(row.decision),
        // The seats the graph proves independent of the requester, named so the
        // dialog can offer exactly those and nothing else.
        independentDeciderIds: row.independence?.ok ? row.independence.apexIds : [],
        independentDeciderNames: (row.independence?.ok ? row.independence.apexIds : []).map((id) => {
          const node = report.matrix?.nodes?.get(id);
          return node?.name || id;
        }),
      }));
      const decisions = report.decisions.map((row) => ({
        id: row.id,
        clearanceId: row.clearanceId,
        decidedOn: row.decidedOn,
        outcome: row.outcome,
        validityDays: row.validityDays,
      }));
      const events = report.eventRows.map((row) => ({
        id: row.event.id,
        subject: row.event.subject,
        kind: row.event.kind,
        disclosesOn: row.event.disclosesOn,
        opensOn: row.span?.opensOn || null,
        closesOn: row.span?.closesOn || null,
        resolvable: row.resolvable,
        openOnAsOf: row.openOnAsOf,
      }));
      return { ok: true, people, designations, clearances, decisions, events };
    },

    /** The explicit scan. Pausable: a pause is a pause on every path. */
    dwlScan() {
      const check = seatFor(DWL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.dwlMarkers = Array.isArray(draft.dwlMarkers) ? draft.dwlMarkers : [];
      }, {
        type: DWL_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: DWL_ROUTE,
        summary: `Personal-dealing register scanned; the rule re-reads every designation, window, clearance turnaround and dealing against its declared day (${DWL_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

export const PERSONAL_DEALING_CONTEXT = 'Read the personal-account dealing and insider-list register (#/personal-dealing). It records the written designation that puts a person on the insider list, the declared closed period around a disclosure, the clearance request as its own dated act, the independent decision by a hand strictly above the requester with its validity or its written refusal reason, and the executed dealing against the window it fell in and the clearance it cites. It scores no person, holds no broker feed and carries no market data.';
