/**
 * app/core/domain/mutualAidActions.js — the seat-checked commands of the
 * Mutual-Aid Activation & Resource-Commitment Register (ADR-0244).
 *
 * Nine human acts and a scan, and nothing else: DECLARE a bilateral agreement,
 * OPEN a request under it, RECORD the partner's ACCEPTANCE, RECORD the
 * ARRIVAL of the promised help, RECORD its WITHDRAWAL, RECORD the RELEASE that
 * ends the commitment, CANCEL a request that was never accepted, re-declare the
 * conventions, and the explicit scan. Every state, validity, days-overdue
 * figure, days-late figure, coverage verdict and shortfall is re-derived on read
 * by `mutualAid.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - An agreement carries a PARTNER NAME and a WRITTEN REFERENCE, or it is
 *    refused. A partnership with no instrument behind it is a request nobody was
 *    ever bound to answer.
 *  - A request carries a SUBJECT, a KIND, a WRITTEN AGREEMENT, a DECLARED
 *    VALIDITY and at least one requesting line, or it is refused. There is no
 *    default validity anywhere in this file: a window the software chose is a
 *    window nobody can defend.
 *  - A REQUEST IS NEVER OPENED UNDER A LAPSED AGREEMENT. The partner is not
 *    bound to answer a request made under an agreement that has expired, and the
 *    door refuses the request rather than collecting a promise from a basis that
 *    no longer exists.
 *  - AN ACCEPTANCE IS REFUSED WITHOUT A WRITTEN CONFIRMATION. The partner's
 *    acceptance is its own act; it is recorded only when the actor can cite the
 *    partner's own written confirmation, with the promised resources and the
 *    promised arrival day. This is the register's central control: a request is
 *    never read as an acceptance.
 *  - ONE ACCEPTANCE PER REQUEST, ONE ARRIVAL PER PROMISE, ONE WITHDRAWAL AND ONE
 *    RELEASE PER COMMITMENT. Every one of those is a single dated fact, and a
 *    second would overwrite the first.
 *  - A RELEASE IS REFUSED BEFORE ITS WITHDRAWAL, and a CANCELLATION IS REFUSED
 *    AFTER THE ACCEPTANCE. An act dated before the act it depends on is a
 *    breach, not a shortcut.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that infers an acceptance from a
 * request, none that records an arrival without a promise, none that withdraws
 * without an acceptance, none that releases before the help leaves, none that
 * cancels an accepted request, none that re-dates an act, none that deletes a
 * breach, and none that scores a partner, an external hand or a requesting
 * line. The absence of those commands is the design.
 */

import { dayKey, daysBetween } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor, matrixJointApex } from './matrix.js';
import { buildMutualAid, mutualAidAttentionCount } from './mutualAid.js';
import {
  MAA_BOUNDS,
  MAA_EVENTS,
  MAA_LIMITS as L,
  MAA_REQUEST_KIND_BY_KEY,
  MAA_REQUEST_KIND_KEYS,
  MAA_REFUSALS,
  MAA_RIGHTS,
  MAA_ROUTE,
  MAA_SETTING_KEYS,
} from './mutualAidRegistry.js';
import {
  maaAgreementRef,
  maaConfirmationRef,
  maaName,
  maaQuantity,
  maaSubject,
  maaValidity,
  normalizeMutualAidAcceptances,
  normalizeMutualAidAgreements,
  normalizeMutualAidArrivals,
  normalizeMutualAidReleases,
  normalizeMutualAidRequests,
  normalizeMutualAidSettings,
  normalizeMutualAidWithdrawals,
} from './mutualAidSchema.js';
import { maaDay } from './mutualAidMath.js';

const REFUSAL = (key) => `mutual-aid:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value) => (Array.isArray(value) ? value : []);

/** Read resource lines from a dialog exactly: closed kinds, whole quantities. */
function readResourceLines(value, field) {
  const out = [];
  for (const line of list(value)) {
    if (!line || typeof line !== 'object') return { error: `Each resource line needs a kind and a quantity.`, field };
    const kind = text(line.kind, 40);
    if (!MAA_REQUEST_KIND_KEYS.includes(kind)) return { error: `“${kind || '—'}” is not a kind of help this register can promise. Choose personnel, equipment, transport or specialist advice.`, field };
    const quantity = maaQuantity(Number(line.quantity));
    if (quantity === null) return { error: `The quantity for ${MAA_REQUEST_KIND_BY_KEY[kind]?.label || kind} must be a whole number between ${L.quantityMin} and ${L.quantityMax}. It is refused rather than rounded.`, field };
    out.push({ kind, quantity });
  }
  return { lines: out };
}

export function createMutualAidActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail(MAA_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check,
   * so the right is re-proved HERE. Without it, what an outside organisation was
   * asked and promised would be readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(MAA_REFUSALS.notSeated);
    const verdict = canAct(MAA_RIGHTS.READ, seat);
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

  function holdsAnyLine(check, lineIds) {
    return list(lineIds).some((lineId) => holdsHand(check, lineId));
  }

  function personRow(personId) {
    return rows('people').find((row) => row && row.id === personId) || null;
  }

  /** A declared day that is not in the future. A record is about what happened. */
  function declaredDay(check, value, field, { allowFuture = false, maxFuture = 0, maxBackDays = L.actMaxBackDays } = {}) {
    const day = maaDay(value);
    if (!day) return { error: fail('Give a real day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const ahead = daysBetween(check.today, day);
    if (!allowFuture && ahead > 0) {
      return { error: fail('That day is in the future. This register records what a human declared or did, not what will be.', field, REFUSAL('day-future')) };
    }
    if (allowFuture && ahead > maxFuture) {
      return { error: fail(`That day is more than ${maxFuture} days ahead. A promise the partner cannot plausibly be asked to keep is not a promise the register will hold.`, field, REFUSAL('day-too-far')) };
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

  const agreements = () => normalizeMutualAidAgreements(rows('mutualAidAgreements'), []);
  const requests = () => normalizeMutualAidRequests(rows('mutualAidRequests'), agreements(), []);
  const acceptances = () => normalizeMutualAidAcceptances(rows('mutualAidAcceptances'), requests(), []);
  const arrivals = () => normalizeMutualAidArrivals(rows('mutualAidArrivals'), acceptances(), []);
  const withdrawals = () => normalizeMutualAidWithdrawals(rows('mutualAidWithdrawals'), acceptances(), []);
  const releases = () => normalizeMutualAidReleases(rows('mutualAidReleases'), acceptances(), withdrawals(), []);

  function agreementContext(check, agreementId) {
    const id = text(agreementId, L.idMax) || null;
    if (!id) return fail('Choose the agreement this act concerns.', 'agreementId');
    const agreement = agreements().find((row) => row.id === id) || null;
    if (!agreement) return fail(MAA_REFUSALS.notFound, 'agreementId', REFUSAL('agreement-not-found'));
    return { ok: true, agreement };
  }

  function requestContext(check, requestId) {
    const id = text(requestId, L.idMax) || null;
    if (!id) return fail('Choose the request this act concerns.', 'requestId');
    const request = requests().find((row) => row.id === id) || null;
    if (!request) return fail(MAA_REFUSALS.notFound, 'requestId', REFUSAL('request-not-found'));
    const agreement = agreements().find((row) => row.id === request.agreementId) || null;
    return { ok: true, request, agreement };
  }

  function acceptanceContext(check, acceptanceId) {
    const id = text(acceptanceId, L.idMax) || null;
    if (!id) return fail('Choose the acceptance this act concerns.', 'acceptanceId');
    const acceptance = acceptances().find((row) => row.id === id) || null;
    if (!acceptance) return fail(MAA_REFUSALS.notFound, 'acceptanceId', REFUSAL('acceptance-not-found'));
    const request = requests().find((row) => row.id === acceptance.requestId) || null;
    return { ok: true, acceptance, request };
  }

  /** The reach test every act on a request has to clear. */
  function requestReach(check, request) {
    if (check.seat.fullAccess) return true;
    return holdsAnyLine(check, request.requestingLineIds);
  }

  return {
    /* ------------------------------------------------------------ agreement */

    /** DECLARE a bilateral agreement: with whom, on what written reference, for how long. */
    maaDeclareAgreement(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const partnerOrg = maaName(input.partnerOrg);
      if (!partnerOrg) return fail(`Name the partner organisation in at least ${L.nameMin} characters. “The neighbours” is not an organisation anybody can call.`, 'partnerOrg', REFUSAL('name-invalid'));

      const agreementRef = maaAgreementRef(input.agreementRef);
      if (!agreementRef) {
        return fail(`Cite the written agreement in at least ${L.agreementRefMin} characters — its name and the clause. A partnership with no written reference is a request nobody was ever bound to answer.`, 'agreementRef', REFUSAL('agreement-missing'));
      }

      const agreedOn = declaredDay(check, input.agreedOn, 'agreedOn', { maxBackDays: 730 });
      if (agreedOn.error) return agreedOn.error;

      // An expiry is the one declared day that may legitimately be in the future:
      // the agreement says when it ends, and requests can still be made under it
      // until that day.
      let expiresOn = null;
      if (input.expiresOn !== undefined && input.expiresOn !== null && input.expiresOn !== '') {
        const day = maaDay(input.expiresOn);
        if (!day) return fail('Give a real day for the end of the agreement (YYYY-MM-DD).', 'expiresOn', REFUSAL('day-invalid'));
        if (daysBetween(agreedOn.day, day) < 0) {
          return fail('The agreement cannot end before it was agreed. An agreement that ends on or before its first day is not an agreement.', 'expiresOn', REFUSAL('term-reversed'));
        }
        expiresOn = day;
      }

      if (agreements().length >= L.agreements) return fail('The agreement ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('maa-agr');
      const row = {
        id,
        partnerOrg,
        agreementRef,
        agreedOn: agreedOn.day,
        expiresOn,
        scopeNote: text(input.scopeNote, L.textMax),
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidAgreements([...rows('mutualAidAgreements'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The agreement could not be stored as a row this register can read back. Nothing was saved.', 'agreementRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidAgreements = Array.isArray(draft.mutualAidAgreements) ? draft.mutualAidAgreements : [];
        draft.mutualAidAgreements.push(stored);
      }, {
        type: MAA_EVENTS.AGREEMENT_DECLARED,
        entity: 'workspace',
        entityId: id,
        summary: `Bilateral agreement declared with ${partnerOrg}, on ${agreementRef}, agreed ${agreedOn.day}${expiresOn ? `, ending ${expiresOn}` : ', open-ended'} (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, agreement: stored });
    },

    /* -------------------------------------------------------------- request */

    /** OPEN a request for help under a live agreement, with a declared validity. */
    maaOpenRequest(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const agreement = agreementContext(check, input.agreementId);
      if (!agreement.ok) return agreement;

      // The door refuses a request under a lapsed agreement: the partner is not
      // bound to answer a request made under a basis that no longer exists.
      if (agreement.agreement.expiresOn && daysBetween(agreement.agreement.expiresOn, check.today) > 0) {
        return fail(MAA_REFUSALS.agreementLapsed, 'agreementId', REFUSAL('agreement-lapsed'));
      }

      const subject = maaSubject(input.subject);
      if (!subject) return fail(`Write the subject in at least ${L.subjectMin} characters — what help is actually being asked for, not “assistance”.`, 'subject', REFUSAL('subject-invalid'));

      const kind = text(input.kind, 40);
      if (!MAA_REQUEST_KIND_BY_KEY[kind]) return fail('Choose what kind of help is being asked for: personnel, equipment, transport or specialist advice.', 'kind', REFUSAL('kind-invalid'));

      const lineIds = [...new Set(list(input.requestingLineIds).map((value) => text(value, L.idMax)).filter(Boolean))];
      if (!lineIds.length) return fail(MAA_REFUSALS.noLine, 'requestingLineIds', REFUSAL('no-line'));
      for (const lineId of lineIds) {
        const person = personRow(lineId);
        if (!person) return fail(`The requesting line “${lineId}” is not a hand on this record. Nothing was saved.`, 'requestingLineIds', REFUSAL('line-not-found'));
      }
      if (!holdsAnyLine(check, lineIds)) {
        return fail(MAA_REFUSALS.noReach, 'requestingLineIds', REFUSAL('not-your-line'));
      }

      const validityDays = maaValidity(Number(input.validityDays));
      if (validityDays === null) {
        return fail(`Declare how many whole days this request stays open awaiting an answer, between ${L.validityMin} and ${L.validityMax}. There is no default validity: a window the software chose is a window nobody can defend.`, 'validityDays', REFUSAL('validity-invalid'));
      }

      const lines = readResourceLines(input.askedLines, 'askedLines');
      if (lines.error) return fail(lines.error, lines.field, REFUSAL('lines-invalid'));
      if (!lines.lines.length) return fail('List at least one resource line the help is being asked for. A request that cannot say what it asks for cannot be compared against a promise.', 'askedLines', REFUSAL('lines-empty'));

      if (requests().length >= L.requests) return fail('The request ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('maa-req');
      const row = {
        id,
        agreementId: agreement.agreement.id,
        subject,
        kind,
        openedOn: check.today,
        validityDays,
        requestingLineIds: lineIds,
        askedLines: lines.lines,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidRequests([...rows('mutualAidRequests'), row], agreements(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The request could not be stored as a row this register can read back. Nothing was saved.', 'askedLines', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidRequests = Array.isArray(draft.mutualAidRequests) ? draft.mutualAidRequests : [];
        draft.mutualAidRequests.push(stored);
      }, {
        type: MAA_EVENTS.REQUEST_OPENED,
        entity: 'workspace',
        entityId: id,
        summary: `Request for ${MAA_REQUEST_KIND_BY_KEY[kind].label.toLowerCase()} opened under the agreement with ${agreement.agreement.partnerOrg}, valid ${validityDays} day(s) from ${check.today} (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, request: stored });
    },

    /* ------------------------------------------------------------- acceptance */

    /**
     * RECORD the partner's acceptance: the central act of the register. It is
     * recorded only with the partner's own written confirmation, the promised
     * resources and the promised arrival day. A request is never read as an
     * acceptance.
     */
    maaRecordAcceptance(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const request = requestContext(check, input.requestId);
      if (!request.ok) return request;
      if (!requestReach(check, request.request)) {
        return fail(MAA_REFUSALS.noReach, 'requestId', REFUSAL('not-your-line'));
      }
      if (request.request.cancelledOn) {
        return fail('That request was cancelled before the partner answered. A cancelled request carries no acceptance; open a new request instead.', 'requestId', REFUSAL('request-cancelled'));
      }
      if (acceptances().some((row) => row.requestId === request.request.id)) {
        return fail(MAA_REFUSALS.alreadyAccepted, 'requestId', REFUSAL('already-accepted'));
      }

      const acceptedOn = declaredDay(check, input.acceptedOn, 'acceptedOn');
      if (acceptedOn.error) return acceptedOn.error;

      const confirmationRef = maaConfirmationRef(input.confirmationRef);
      if (!confirmationRef) {
        return fail(`Cite the partner’s own written confirmation in at least ${L.confirmationRefMin} characters — the message, the call log reference, the letter. An acceptance with no confirmation behind it is a promise inferred from a request, which is the exact reading this register refuses.`, 'confirmationRef', REFUSAL('confirmation-missing'));
      }

      const acceptingHand = text(input.acceptingHand, L.shortMax);
      if (!acceptingHand) return fail('Name the hand on the partner’s side that accepted. A promise with no named hand is a promise nobody can be held to.', 'acceptingHand', REFUSAL('hand-missing'));

      const promisedArrivalOn = declaredDay(check, input.promisedArrivalOn, 'promisedArrivalOn', { allowFuture: true, maxFuture: L.arrivalMaxAheadDays });
      if (promisedArrivalOn.error) return promisedArrivalOn.error;

      const lines = readResourceLines(input.promisedLines, 'promisedLines');
      if (lines.error) return fail(lines.error, lines.field, REFUSAL('lines-invalid'));
      if (!lines.lines.length) return fail('List at least one resource line the partner promised. An acceptance that cannot say what was promised is not an acceptance.', 'promisedLines', REFUSAL('lines-empty'));

      if (acceptances().length >= L.acceptances) return fail('The acceptance ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('maa-acc');
      const row = {
        id,
        requestId: request.request.id,
        acceptedOn: acceptedOn.day,
        confirmationRef,
        acceptingHand,
        promisedArrivalOn: promisedArrivalOn.day,
        promisedLines: lines.lines,
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidAcceptances([...rows('mutualAidAcceptances'), row], requests(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The acceptance could not be stored as a row this register can read back. Nothing was saved.', 'confirmationRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidAcceptances = Array.isArray(draft.mutualAidAcceptances) ? draft.mutualAidAcceptances : [];
        draft.mutualAidAcceptances.push(stored);
      }, {
        type: MAA_EVENTS.ACCEPTANCE_RECORDED,
        entity: 'workspace',
        entityId: id,
        summary: `Acceptance recorded for the request to ${request.agreement?.partnerOrg || 'the partner'} on ${acceptedOn.day}, promising arrival by ${promisedArrivalOn.day}, confirmed by ${confirmationRef} (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, acceptance: stored });
    },

    /* --------------------------------------------------------------- arrival */

    /** RECORD the arrival of the promised help, line by line. */
    maaRecordArrival(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const acceptance = acceptanceContext(check, input.acceptanceId);
      if (!acceptance.ok) return acceptance;
      if (!requestReach(check, acceptance.request)) {
        return fail(MAA_REFUSALS.noReach, 'acceptanceId', REFUSAL('not-your-line'));
      }
      if (arrivals().some((row) => row.acceptanceId === acceptance.acceptance.id)) {
        return fail(MAA_REFUSALS.alreadyArrived, 'acceptanceId', REFUSAL('already-arrived'));
      }

      const arrivedOn = declaredDay(check, input.arrivedOn, 'arrivedOn');
      if (arrivedOn.error) return arrivedOn.error;

      const lines = readResourceLines(input.arrivedLines, 'arrivedLines');
      if (lines.error) return fail(lines.error, lines.field, REFUSAL('lines-invalid'));
      if (!lines.lines.length) return fail('List at least one resource line that actually arrived. An arrival that cannot say what came is not an arrival.', 'arrivedLines', REFUSAL('lines-empty'));

      if (arrivals().length >= L.arrivals) return fail('The arrival ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('maa-arr');
      const row = {
        id,
        acceptanceId: acceptance.acceptance.id,
        arrivedOn: arrivedOn.day,
        arrivedLines: lines.lines,
        note: text(input.note, L.textMax),
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidArrivals([...rows('mutualAidArrivals'), row], acceptances(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The arrival could not be stored as a row this register can read back. Nothing was saved.', 'arrivedLines', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidArrivals = Array.isArray(draft.mutualAidArrivals) ? draft.mutualAidArrivals : [];
        draft.mutualAidArrivals.push(stored);
      }, {
        type: MAA_EVENTS.ARRIVAL_RECORDED,
        entity: 'workspace',
        entityId: id,
        summary: `Arrival recorded for the accepted promise on ${arrivedOn.day} (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, arrival: stored });
    },

    /* ------------------------------------------------------------ withdrawal */

    /** RECORD the withdrawal: the partner's help has left. */
    maaRecordWithdrawal(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const acceptance = acceptanceContext(check, input.acceptanceId);
      if (!acceptance.ok) return acceptance;
      if (!requestReach(check, acceptance.request)) {
        return fail(MAA_REFUSALS.noReach, 'acceptanceId', REFUSAL('not-your-line'));
      }
      if (withdrawals().some((row) => row.acceptanceId === acceptance.acceptance.id)) {
        return fail(MAA_REFUSALS.alreadyWithdrawn, 'acceptanceId', REFUSAL('already-withdrawn'));
      }

      const withdrawnOn = declaredDay(check, input.withdrawnOn, 'withdrawnOn');
      if (withdrawnOn.error) return withdrawnOn.error;

      if (withdrawals().length >= L.withdrawals) return fail('The withdrawal ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('maa-wdr');
      const row = {
        id,
        acceptanceId: acceptance.acceptance.id,
        withdrawnOn: withdrawnOn.day,
        note: text(input.note, L.textMax),
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidWithdrawals([...rows('mutualAidWithdrawals'), row], acceptances(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The withdrawal could not be stored as a row this register can read back. Nothing was saved.', 'withdrawnOn', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidWithdrawals = Array.isArray(draft.mutualAidWithdrawals) ? draft.mutualAidWithdrawals : [];
        draft.mutualAidWithdrawals.push(stored);
      }, {
        type: MAA_EVENTS.WITHDRAWAL_RECORDED,
        entity: 'workspace',
        entityId: id,
        summary: `Withdrawal recorded for the accepted promise on ${withdrawnOn.day}; the release that ends the commitment is owed (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, withdrawal: stored });
    },

    /* --------------------------------------------------------------- release */

    /** RECORD the release: the commitment ends, after the help has left. */
    maaRecordRelease(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const acceptance = acceptanceContext(check, input.acceptanceId);
      if (!acceptance.ok) return acceptance;
      if (!requestReach(check, acceptance.request)) {
        return fail(MAA_REFUSALS.noReach, 'acceptanceId', REFUSAL('not-your-line'));
      }
      const withdrawal = withdrawals().find((row) => row.acceptanceId === acceptance.acceptance.id) || null;
      if (!withdrawal) {
        return fail('That commitment has not been withdrawn. The help has not left, so there is nothing to release; record the withdrawal first.', 'acceptanceId', REFUSAL('no-withdrawal'));
      }
      if (releases().some((row) => row.acceptanceId === acceptance.acceptance.id)) {
        return fail(MAA_REFUSALS.alreadyReleased, 'acceptanceId', REFUSAL('already-released'));
      }

      const releasedOn = declaredDay(check, input.releasedOn, 'releasedOn');
      if (releasedOn.error) return releasedOn.error;
      if (daysBetween(withdrawal.withdrawnOn, releasedOn.day) < 0) {
        return fail(`The release cannot be dated before the withdrawal (${withdrawal.withdrawnOn}). A commitment ends when the help leaves, not before; recording it out of order would be the breach this register exists to refuse.`, 'releasedOn', REFUSAL('release-before-withdrawal'));
      }

      if (releases().length >= L.releases) return fail('The release ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('maa-rel');
      const row = {
        id,
        acceptanceId: acceptance.acceptance.id,
        releasedOn: releasedOn.day,
        note: text(input.note, L.textMax),
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidReleases([...rows('mutualAidReleases'), row], acceptances(), withdrawals(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The release could not be stored as a row this register can read back. Nothing was saved.', 'releasedOn', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidReleases = Array.isArray(draft.mutualAidReleases) ? draft.mutualAidReleases : [];
        draft.mutualAidReleases.push(stored);
      }, {
        type: MAA_EVENTS.RELEASE_RECORDED,
        entity: 'workspace',
        entityId: id,
        summary: `Release recorded for the commitment withdrawn on ${withdrawal.withdrawnOn}, released ${releasedOn.day} (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, release: stored });
    },

    /* ------------------------------------------------------------- cancel */

    /** CANCEL a request that was never accepted. */
    maaCancelRequest(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const request = requestContext(check, input.requestId);
      if (!request.ok) return request;
      if (!requestReach(check, request.request)) {
        return fail(MAA_REFUSALS.noReach, 'requestId', REFUSAL('not-your-line'));
      }
      if (request.request.cancelledOn) {
        return fail(MAA_REFUSALS.alreadyCancelled, 'requestId', REFUSAL('already-cancelled'));
      }
      if (acceptances().some((row) => row.requestId === request.request.id)) {
        return fail('That request has been accepted. A cancellation closes a request that was still awaiting an answer; the commitment now has to be managed through its arrival, withdrawal and release.', 'requestId', REFUSAL('accepted'));
      }

      const cancelledOn = declaredDay(check, input.cancelledOn, 'cancelledOn');
      if (cancelledOn.error) return cancelledOn.error;

      const target = rows('mutualAidRequests').find((row) => row && row.id === request.request.id);
      if (!target) return fail(MAA_REFUSALS.notFound, 'requestId', REFUSAL('request-not-found'));
      const updated = {
        ...target,
        cancelledOn: cancelledOn.day,
        cancelledById: check.actorId,
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeMutualAidRequests(
        rows('mutualAidRequests').map((row) => (row && row.id === request.request.id ? updated : row)),
        agreements(), [],
      ).find((row) => row.id === request.request.id) || null;
      if (!stored) return fail('The cancellation could not be stored as a row this register can read back. Nothing was saved.', 'cancelledOn', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.mutualAidRequests = rows('mutualAidRequests').map((row) => (row && row.id === request.request.id ? stored : row));
      }, {
        type: MAA_EVENTS.REQUEST_CANCELLED,
        entity: 'workspace',
        entityId: request.request.id,
        summary: `Request cancelled on ${cancelledOn.day} before any acceptance (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ request: stored });
    },

    /* ------------------------------------------------------------ conventions */

    maaSetConventions(input = {}) {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const current = normalizeMutualAidSettings(settings());
      const patch = input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch) ? input.patch : input;
      const known = new Set(Object.values(MAA_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === MAA_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = MAA_BOUNDS[key === MAA_SETTING_KEYS.privacyFloor ? 'privacyFloor' : 'releaseGraceDays'];
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: MAA_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: MAA_ROUTE,
        summary: `Mutual-aid conventions re-declared: the release grace, the privacy floor and whether the rule may file asks (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: normalizeMutualAidSettings(store.state.settings || {}) });
    },

    /* ---------------------------------------------------------------- reads */

    maaReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildMutualAid(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    maaAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: mutualAidAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * The candidates a dialog may name, narrowed to what this seat may actually
     * reach: the agreements it can see, the requests on those agreements, and
     * the hands it holds.
     */
    maaCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildMutualAid(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      const agreementRows = report.agreementRows.map((row) => ({
        id: row.agreement.id,
        partnerOrg: row.agreement.partnerOrg,
        agreementRef: row.agreement.agreementRef,
        agreedOn: row.agreement.agreedOn,
        expiresOn: row.agreement.expiresOn,
        termState: row.termState,
        requestsN: row.requestsN,
      }));
      const requestRows = report.rows.map((row) => ({
        id: row.request.id,
        agreementId: row.request.agreementId,
        partnerOrg: row.agreement?.partnerOrg || null,
        subject: row.request.subject,
        kind: row.request.kind,
        openedOn: row.request.openedOn,
        closesOn: row.closesOn,
        stateKey: row.state.key,
        hasAcceptance: Boolean(row.acceptance),
        hasArrival: Boolean(row.arrival),
        hasWithdrawal: Boolean(row.withdrawal),
        hasRelease: Boolean(row.release),
      }));
      const acceptanceRows = report.acceptances.map((row) => ({
        id: row.id,
        requestId: row.requestId,
        acceptedOn: row.acceptedOn,
        promisedArrivalOn: row.promisedArrivalOn,
        hasArrival: Boolean(report.arrivals.find((candidate) => candidate.acceptanceId === row.id)),
        hasWithdrawal: Boolean(report.withdrawals.find((candidate) => candidate.acceptanceId === row.id)),
        hasRelease: Boolean(report.releases.find((candidate) => candidate.acceptanceId === row.id)),
      }));
      const people = rows('people')
        .filter((row) => row && row.status !== 'archived' && row.id)
        .filter((row) => holdsHand(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { ok: true, agreements: agreementRows, requests: requestRows, acceptances: acceptanceRows, people };
    },

    /** The explicit scan. Pausable: a pause is a pause on every path. */
    maaScan() {
      const check = seatFor(MAA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.mutualAidMarkers = Array.isArray(draft.mutualAidMarkers) ? draft.mutualAidMarkers : [];
      }, {
        type: MAA_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: MAA_ROUTE,
        summary: `Mutual-aid register scanned; the rule re-reads every validity, promise, arrival day and release grace against its declared day (${MAA_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

export const MUTUAL_AID_CONTEXT = 'Read the mutual-aid activation and resource-commitment register (#/mutual-aid). It records the bilateral agreement a request is made under, the request and its declared validity, the partner’s acceptance with its written confirmation and promised resources, the arrival compared against the promise, and the withdrawal and release that close the commitment. It scores no partner, no external hand and no requesting line.';
