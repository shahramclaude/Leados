/**
 * app/core/domain/rqActions.js — the seat-checked commands of the Regulator
 * Information-Request & Examination Response Register (ADR-0235/0236, Schema v191).
 *
 * ONE recording, six human acts and a scan, and nothing else: RECORD an inbound
 * demand from an authority, ASSIGN a producer to a line, PRODUCE on a line you
 * hold, REVIEW a production from outside the parties, RELEASE it to the
 * requester, RECORD the requester's answer, restate the clock from the
 * requester's own letter, and EXTEND the reply day. Every state, flag, count and
 * rate is re-derived on read by `rqProduction.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Recording is FIRST-PERSON and it is a MANAGER act (rank 3+). The synthetic
 *    workspace leader never records, and neither does the undeclared operator
 *    view. No request is inferred from a case, a finding, a risk or a calendar.
 *  - THE RECORDED IDENTITY IS IMMUTABLE. Requester, kind, instrument, scope,
 *    receipt day and reply clock are read from the record for its whole life. A
 *    correction is a new record, never an edit that would let a demand quietly
 *    become a different demand.
 *  - FOLLOW-UP IS A SEPARATE DEMAND WITH A DECLARED PARENT. It is accepted only
  *    against a readable prior request with an already-recorded insufficient
  *    verdict, a child record time on or after its instant and a receipt day on
  *    or after its date. The original is never reopened, and no relationship is
  *    inferred from text, date, requester or instrument.
 *  - THE CLOCK IS NEVER GUESSED. `replyClockDays` must be typed from the
 *    instrument. There is no default, no jurisdiction table and no "usual"
 *    window in this workspace, so a missing clock is a refusal, not a 30.
 *  - ASSIGN names a real, active person on a line still short of a producer. A
 *    producer is NEVER inferred from org position.
 *  - PRODUCE is the producer's own act: only the person the line names asserts
 *    its production, and one assertion stands until it is reviewed. The
 *    completeness statement and the privilege claim are separate, required
 *    fields — a line that withholds must state how many items and on what basis,
 *    or the act is refused.
 *  - REVIEW is the INDEPENDENT key, and the independence is a CONFLICT test: the
 *    seat must not be a party to the request at all. The producer cannot clear
 *    their own withholding. The badge, the panel and this action call ONE
 *    predicate (`rqSeatMayReview`), so the register can never offer a review it
 *    then refuses, or refuse one it promised.
 *  - RELEASE is the receiving seat's act and is REFUSED until EVERY line has been
 *    reviewed. Releasing a production while one line is unreviewed is the exact
 *    substitution this register exists to prevent. A release may not predate the
 *    last review, must name the transmission, and may not exceed the count the
 *    certified productions add up to.
 *  - EXTEND is refused outright on a compelled instrument, refused without the
 *    requester's own recorded agreement on any other, refused if it does not move
 *    the day forward, refused past the declared horizon, and refused after the
 *    reply day has passed — a lapsed request is not un-lapsed by moving the date.
 *  - A requester's restated clock is recorded only with their own dated
 *    reference, and the day must follow from their own two figures. Nothing here
 *    turns silence into an extension.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildInformationRequests } from './rqProduction.js';
import {
  buildInformationRequestReport,
  informationRequestAttentionCount,
  rqSeatMayReview,
} from './rqReport.js';
import {
  rqrDay,
  rqrInstant,
  rqrText,
  normalizeRequestActs,
  normalizeRequests,
} from './rqSchema.js';
import { rqReplyDay, rqrDayDiff } from './rqMath.js';
import {
  RQR_INSTRUMENTS,
  RQR_PRIVILEGE_OUTCOMES,
  RQR_REQUESTER_KINDS,
  RQR_RESPONSE_KEYS,
  RQR_EVENTS,
  RQR_ENTITY,
  RQR_LIMITS as L,
  RQR_REFUSALS as R,
  RQR_RIGHTS,
  RQR_ROUTE,
  RQR_RULE_ID,
  RQR_REVIEW_VERDICTS,
  rqrInstrumentIsCompelled,
} from './rqRegistry.js';

const REFUSAL = (key) => `informationrequest:${key}`;
const NOT_SEATED = 'No seat is resolved. Declare a valid seat before acting; the information-request register is never changed from an unknown operating position.';
const dayOfIso = (iso) => String(iso || '').slice(0, 10);

export function createInformationRequestActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? null : (seat.nodeId || seat.id || null);
    if (!actorId || actorId === LEADER_ID) {
      return fail('Answering an authority is a first-person act of a named person. The undeclared operator view cannot speak for one — declare a seat on the Altitude Lens.', null, REFUSAL(R.noActor));
    }
    const person = rows('people').find((row) => row && row.id === actorId) || null;
    if (!person) return fail('This seat is not a person on the roster. A demand is recorded by a named person, and nothing is recorded in their place.', null, REFUSAL(R.noActor));
    return { ok: true, seat, at, cfg, actorId, person, today: dayKey(at), built };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg, built };
  }

  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(RQR_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  const rosterPerson = (id) => {
    const key = rqrText(id, 120);
    if (!key) return null;
    return rows('people').find((row) => row && row.id === key) || null;
  };
  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  const loadedRequests = () => normalizeRequests(rows('informationRequests'), []);
  const loadedActs = (requests) => normalizeRequestActs(rows('informationRequestActs'), requests, []);

  const matrix = (at, cfg) => buildMatrix(store.state, { now: at, settings: { ...(cfg || {}), activeSeatId: null } });

  function requestContext(check, requestId) {
    const key = rqrText(requestId, 120);
    if (!key) return fail('Name the information request.', 'requestId', REFUSAL(R.unknownRequest));
    const requests = loadedRequests();
    const request = requests.find((row) => row.id === key) || null;
    if (!request) return fail('That information request is not on this register.', 'requestId', REFUSAL(R.unknownRequest));
    const report = buildInformationRequests(store.state, { now: check.at });
    const row = report.rows.find((candidate) => candidate.id === request.id) || null;
    if (!row) return fail('That request cannot be read back from the record. Nothing was saved.', 'requestId', REFUSAL(R.unreadable));
    return { ok: true, request, row, requests, report };
  }

  function lineContext(ctx, input) {
    const lineId = rqrText(input.lineId, 120);
    if (!lineId) return fail('Name the production line this act is about.', 'lineId', REFUSAL(R.declaredLineUnresolved));
    const line = ctx.row.lines.find((entry) => entry.lineId === lineId) || null;
    if (!line) return fail('That production line is not on this request.', 'lineId', REFUSAL(R.declaredLineUnresolved));
    return { ok: true, line };
  }

  /**
   * The moment an act is dated: the declared value where one is given (this is
   * how a back-dated paper record is entered honestly, and how the suite pins a
   * timeline), and the acting clock's own instant otherwise. A value that is
   * present but unreadable is refused — an unparseable timestamp is never
   * silently replaced by "now".
   */
  function actInstant(input, field, { notBefore = null } = {}) {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === '') return clock().toISOString();
    const at = rqrInstant(raw);
    if (!at) return fail(`Give a real calendar moment for the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`, field, REFUSAL(R.unreadable));
    if (Date.parse(at) > clock().getTime() + 5 * 60 * 1000) {
      return fail('An act cannot be dated after the moment it is recorded.', field, REFUSAL(R.futureDated));
    }
    if (notBefore && Date.parse(at) < Date.parse(notBefore)) {
      return fail('An act cannot predate the record it answers.', field, REFUSAL(R.beforeDeclared));
    }
    return at;
  }

  /** A declared, whole, non-negative count. `0` is a real answer; a float is not. */
  function declaredCount(value, field, label) {
    const raw = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 1e9) {
      return fail(`Give ${label} as a whole number of items, zero included. The register will not carry an unreadable count and will not turn a blank into a zero.`, field, REFUSAL(R.unreadable));
    }
    return { ok: true, value: raw };
  }

  /** The declared production lines of a fresh record. */
  function declaredLines(input) {
    const raw = Array.isArray(input.lines) ? input.lines : [];
    if (!raw.length) return fail('Declare at least one production line — a demand for records names what has to be searched, and by whom.', 'lines', REFUSAL(R.lineOutOfRange));
    if (raw.length > L.linesMax) return fail(`An information request carries at most ${L.linesMax} production lines. Beyond that it is an examination programme, and a programme is not a demand with one reply day.`, 'lines', REFUSAL(R.lineOutOfRange));
    const lines = [];
    const seen = new Set();
    for (const [index, entry] of raw.entries()) {
      if (!entry || typeof entry !== 'object') return fail(`Production line ${index + 1} is unreadable.`, 'lines', REFUSAL(R.unreadable));
      const roleLabel = rqrText(entry.roleLabel, L.refMax);
      const subject = rqrText(entry.subject, L.textMax);
      const dueOn = rqrDay(entry.dueOn);
      if (subject.length < L.textMin) {
        return fail(`Production line ${index + 1}: say what this line has to search and produce, in at least ${L.textMin} characters. A line is not a heading.`, 'lines', REFUSAL(R.unreadable));
      }
      if (!dueOn) return fail(`Production line ${index + 1}: give the real calendar day this line's production is owed by.`, 'lines', REFUSAL(R.unreadable));
      const producerId = entry.producerId === undefined || entry.producerId === null || entry.producerId === ''
        ? null
        : rqrText(entry.producerId, 120);
      if (entry.producerId !== undefined && entry.producerId !== null && entry.producerId !== '' && !producerId) {
        return fail(`Production line ${index + 1}: that producer is unreadable. Name a person on this roster, or leave the line unfilled.`, 'lines', REFUSAL(R.unreadable));
      }
      if (producerId) {
        const producer = rosterPerson(producerId);
        if (!producer) return fail(`Production line ${index + 1}: the named producer is not on this roster. A producer is named, never inferred.`, 'lines', REFUSAL(R.producerInactive));
        if (!isActive(producer)) return fail(`Production line ${index + 1}: the named producer is archived on the roster.`, 'lines', REFUSAL(R.producerInactive));
      }
      const lineKey = rqrText(entry.lineId, 120) || `ln-${index + 1}`;
      if (seen.has(lineKey)) return fail(`Production line ${index + 1}: that line id is declared twice.`, 'lines', REFUSAL(R.duplicateLine));
      seen.add(lineKey);
      lines.push({ lineId: lineKey, producerId, roleLabel, subject, dueOn });
    }
    return { ok: true, lines };
  }

  return {
    /**
     * Record — a director seat records that an authority has demanded something
     * from the entity. The recorded identity is immutable; every line names its
     * own subject and day, and its producer where one is already known.
     */
    informationRequestReceive(input = {}) {
      const check = seatFor(RQR_RIGHTS.RECEIVE);
      if (!check.ok) return check;
      if (!check.seat.fullAccess && !(Number(check.seat.rank) >= L.receiveMinRank)) {
        return fail(`Recording a demand from an authority is a director act (rank ${L.receiveMinRank} or above), because it commits the enterprise's time to an outside party. This seat does not carry that altitude.`, null, REFUSAL(R.notCapableSeat));
      }
      const requester = rqrText(input.requester, L.requesterMax);
      if (requester.length < L.requesterMin) {
        return fail(`Name the authority that asked, in at least ${L.requesterMin} characters — the supervisor, the auditor, the inspectorate, the court.`, 'requester', REFUSAL(R.requesterUnreadable));
      }
      const requesterKind = RQR_REQUESTER_KINDS.some((row) => row.key === input.requesterKind) ? input.requesterKind : null;
      if (!requesterKind) return fail('Say what kind of body asked, from the closed list. Who asked decides what a missed day costs, and the register must be able to print that.', 'requesterKind', REFUSAL(R.requesterUnreadable));
      const instrument = RQR_INSTRUMENTS.some((row) => row.key === input.instrument) ? input.instrument : null;
      if (!instrument) return fail('Say which instrument the demand arrived under, from the closed list. A subpoena’s date is not the entity’s to move; a supervisor’s information request may be varied by agreement.', 'instrument', REFUSAL(R.instrumentUnreadable));
      const instrumentRef = rqrText(input.instrumentRef, L.refMax + 20);
      if (instrumentRef.length < L.refMin) return fail(`Name the instrument — the request number, the notice, the letter a reviewer could go and read — in at least ${L.refMin} characters.`, 'instrumentRef', REFUSAL(R.unreadable));
      const scope = rqrText(input.scope, L.textMax);
      if (scope.length < L.textMin) {
        return fail(`Declare what was asked for, in at least ${L.textMin} characters — the material, the period and the units it covers. A production built on an undeclared scope is a production nobody can certify complete.`, 'scope', REFUSAL(R.scopeUnreadable));
      }
      const receivedOn = rqrDay(input.receivedOn);
      if (!receivedOn) return fail('Give the real calendar day the demand arrived. The reply clock runs from it, so it cannot be left blank or assumed.', 'receivedOn', REFUSAL(R.unreadable));
      const clockRaw = input.replyClockDays;
      if (clockRaw === undefined || clockRaw === null || clockRaw === '') {
        return fail('Give the reply clock IN DAYS, read off the instrument. This workspace knows no jurisdiction and has no default window: an inferred deadline would be an invented fact, and the register would then print a lapse nobody set.', 'replyClockDays', REFUSAL(R.clockUnreadable));
      }
      const replyClockDays = Number(typeof clockRaw === 'string' ? clockRaw.trim() : clockRaw);
      if (!Number.isInteger(replyClockDays)) return fail('The reply clock must be a whole number of days, exactly as the instrument states it.', 'replyClockDays', REFUSAL(R.clockUnreadable));
      if (replyClockDays < L.clockMinDays || replyClockDays > L.clockMaxDays) {
        return fail(`A reply clock must be between ${L.clockMinDays} and ${L.clockMaxDays} whole days. If the instrument really says otherwise, record what it says on a line — the register will not widen its own bounds to fit.`, 'replyClockDays', REFUSAL(R.clockOutOfRange));
      }
      const lineResult = declaredLines(input);
      if (!lineResult.ok) return lineResult;

      const existing = loadedRequests();
      const followsUpRaw = input.followsUpOn;
      const followsUpOn = followsUpRaw === undefined || followsUpRaw === null || followsUpRaw === ''
        ? null
        : rqrText(followsUpRaw, 120);
      if (followsUpRaw !== undefined && followsUpRaw !== null && followsUpRaw !== '' && !followsUpOn) {
        return fail('Choose a readable earlier request, or leave the follow-up link blank. Nothing was inferred from the scope or requester name.', 'followsUpOn', REFUSAL(R.followUpParentUnknown));
      }
      if (followsUpOn) {
        const readable = buildInformationRequestReport(store.state, { now: check.at, seat: check.seat });
        const parent = readable.rows.find((row) => row.id === followsUpOn) || null;
        if (!parent) {
          return fail('That prior request is not readable from this seat. A lineage link never widens access to another request.', 'followsUpOn', REFUSAL(R.followUpParentUnknown));
        }
        if (parent.response !== 'insufficient' || !parent.respondedOn) {
          return fail('A follow-up link is allowed only when the earlier request has a recorded requester verdict of insufficient. Similar scope, requester or date is not enough.', 'followsUpOn', REFUSAL(R.followUpRequiresInsufficient));
        }
        const verdict = loadedActs(existing)
          .filter((act) => act.requestId === parent.id && act.kind === 'respond')
          .sort((a, b) => String(a.at).localeCompare(String(b.at)))[0] || null;
        if (!verdict || verdict.response !== 'insufficient' || check.at.getTime() < Date.parse(verdict.at)) {
          return fail('The prior insufficient verdict must already be on the record before this follow-up demand is recorded. A same-day receipt is allowed only when the verdict came first.', 'followsUpOn', REFUSAL(R.followUpRecordedBeforeVerdict));
        }
        const verdictDay = dayOfIso(verdict.at);
        if (receivedOn < verdictDay) {
          return fail(`The follow-up receipt day (${receivedOn}) predates the earlier insufficient verdict (${verdictDay}). Record the day this demand actually arrived.`, 'followsUpOn', REFUSAL(R.followUpBeforeVerdict));
        }
      }
      if (existing.length >= L.requests) return fail('The information-request register is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rq');
      const createdAt = check.at.toISOString();
      const candidate = {
        id,
        requester,
        requesterKind,
        instrument,
        instrumentRef: instrumentRef.slice(0, L.refMax),
        scope,
        receivedOn,
        replyClockDays,
        receivedById: check.actorId,
        createdAt,
        followsUpOn,
        lines: lineResult.lines,
      };
      const loaded = normalizeRequests([...existing, candidate], []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The request could not be stored as a row this register can read back. Nothing was saved.', 'scope', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequests = Array.isArray(draft.informationRequests) ? draft.informationRequests : [];
        draft.informationRequests.push(stored);
      }, {
        type: RQR_EVENTS.RECEIVED,
        entity: RQR_ENTITY,
        entityId: id,
        summary: `A demand for records from an authority was recorded, reply due ${stored.replyDay} on the requester's own ${stored.replyClockDays}-day clock, across ${stored.lines.length} production line(s). It closes only when every line is independently reviewed and the production is released.`.slice(0, 300),
      });
      return saved({ requestId: id, lineCount: stored.lines.length, replyDay: stored.replyDay });
    },

    /**
     * Assign — name a producer, a subject and a day on a line that carries none.
     * The receiving seat's act; the producer is NAMED.
     */
    informationRequestAssign(input = {}) {
      const check = seatFor(RQR_RIGHTS.ASSIGN);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      if (ctx.row.receivedById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the seat that recorded this demand names a producer on its lines. The duty is theirs to place.', 'requestId', REFUSAL(R.notReceiver));
      }
      if (ctx.row.state === 'released-answered') return fail('This request is answered. Nothing more is owed on it.', 'requestId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      if (line.line.producerId) {
        return fail('That line already carries a producer. Re-assignment is a new human decision recorded on the decision log — the line does not silently change hands here.', 'lineId', REFUSAL(R.lineAlreadyAssigned));
      }
      const producer = rosterPerson(input.producerId);
      if (!producer) return fail('Name the person who will produce this line — a person on this roster. A producer is named, never inferred from the org chart.', 'producerId', REFUSAL(R.producerInactive));
      if (!isActive(producer)) return fail('The named producer is archived on the roster. Nothing was saved.', 'producerId', REFUSAL(R.producerInactive));
      const subject = rqrText(input.subject, L.textMax);
      if (subject.length < L.textMin) return fail(`Say what this line has to search and produce, in at least ${L.textMin} characters.`, 'subject', REFUSAL(R.unreadable));
      const dueOn = rqrDay(input.dueOn);
      if (!dueOn) return fail('Give the real calendar day this line’s production is owed by.', 'dueOn', REFUSAL(R.unreadable));
      if (dueOn > ctx.row.effectiveReplyDay) {
        return fail(`A line day (${dueOn}) after the request's own reply day (${ctx.row.effectiveReplyDay}) would make the line unproducible before the answer is owed. Ask for the line inside the reply day.`, 'dueOn', REFUSAL(R.unreadable));
      }
      const assignedAt = actInstant(input, 'assignedAt', { notBefore: ctx.request.createdAt });
      if (typeof assignedAt !== 'string') return assignedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'assign',
        lineId: line.line.lineId, producerId: producer.id, subject, dueOn, assignedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The assignment could not be stored as an act this register can read back. Nothing was saved.', 'subject', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.ASSIGNED,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: `A producer was named on one production line of an information request; the line is owed by ${dueOn}. The producer answers with their own dated assertion, never with a form.`.slice(0, 300),
      });
      return saved({ actId: id, lineId: line.line.lineId });
    },

    /**
     * Produce — the line's producer asserts what they searched, found and
     * withheld, in their own name. One assertion stands until it is reviewed.
     */
    informationRequestProduce(input = {}) {
      const check = seatFor(RQR_RIGHTS.PRODUCE);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      if (ctx.row.state === 'released-answered') return fail('This request is answered. Its production record is closed.', 'requestId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      if (!line.line.producerId) return fail('That line has no named producer, so nobody can assert its production. Name a producer first.', 'lineId', REFUSAL(R.lineUnassigned));
      if (line.line.producerId !== check.actorId) {
        return fail('Only the producer of this line asserts its production, in their own name. A manager cannot produce on somebody else’s line — and must not, because their review of it would then be worthless.', 'lineId', REFUSAL(R.notLineProducer));
      }
      if (line.line.lineState === 'produced' || line.line.lineState === 'cleared') {
        return fail('This line’s production is already asserted and awaits an independent review. A second assertion is not a stronger search.', 'lineId', REFUSAL(R.alreadyProduced));
      }
      const methodText = rqrText(input.methodText, L.textMax);
      if (methodText.length < L.textMin) return fail(`Say what you searched and how, in at least ${L.textMin} characters. An impression is not a production; the reviewer reads this and then goes and looks.`, 'methodText', REFUSAL(R.unreadable));
      const searchWindow = rqrText(input.searchWindow, L.refMax);
      if (searchWindow.length < L.refMin) return fail(`State the period and systems the search covered, in at least ${L.refMin} characters — without it, completeness cannot be questioned, let alone answered.`, 'searchWindow', REFUSAL(R.unreadable));
      const countResult = declaredCount(input.itemCount, 'itemCount', 'the number of items produced from this line');
      if (!countResult.ok) return countResult;
      const complete = input.complete === true || input.complete === false ? input.complete : null;
      if (complete === null) {
        return fail('Say whether this line has produced EVERYTHING within the scope of the request, yes or no. A production nobody certified complete is not a complete production, and "we think so" is not a fact this register can hold anyone to.', 'complete', REFUSAL(R.unreadable));
      }
      // THE PRIVILEGE CLAIM. Absent means "this line withholds nothing", which is
      // a complete answer. Present means it must carry its own count and basis:
      // the word "privileged" alone is not something a reviewer can test.
      const privilegeRaw = input.privilege;
      let privilege = { claimed: false, withheldCount: 0, basis: '' };
      if (privilegeRaw && typeof privilegeRaw === 'object' && privilegeRaw.claimed === true) {
        const withheldResult = declaredCount(privilegeRaw.withheldCount, 'privilege.withheldCount', 'the number of items withheld under the claim');
        if (!withheldResult.ok) return withheldResult;
        if (withheldResult.value <= 0) {
          return fail('A privilege claim that withholds nothing is not a claim. Set the count above zero or withdraw the claim.', 'privilege.withheldCount', REFUSAL(R.unreadable));
        }
        const basis = rqrText(privilegeRaw.basis, L.textMax);
        if (basis.length < L.textMin) return fail(`Say on what basis the material is withheld, in at least ${L.textMin} characters — the privilege asserted and why it covers these items. An independent seat must be able to test the claim against that sentence.`, 'privilege.basis', REFUSAL(R.unreadable));
        privilege = { claimed: true, withheldCount: withheldResult.value, basis };
      } else if (privilegeRaw !== undefined && privilegeRaw !== null && (typeof privilegeRaw !== 'object' || privilegeRaw.claimed !== false)) {
        return fail('The privilege position must be either "no claim" or a claim with a count and a basis. Nothing is saved on a half-stated claim.', 'privilege', REFUSAL(R.unreadable));
      }
      const producedAt = actInstant(input, 'producedAt', { notBefore: ctx.request.createdAt });
      if (typeof producedAt !== 'string') return producedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'produce',
        lineId: line.line.lineId, methodText, searchWindow,
        itemCount: countResult.value, complete, privilege, producedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The production could not be stored as an act this register can read back. Nothing was saved.', 'methodText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.PRODUCED,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: (privilege.claimed
          ? `A line certified its production of ${countResult.value} item(s) AND claimed privilege over ${privilege.withheldCount} more. It closes nothing: an independent review of both the list and the claim is now owed.`
          : `A line certified its production of ${countResult.value} item(s). It closes nothing: an independent completeness review is now owed.`).slice(0, 300),
      });
      return saved({ actId: id, lineId: line.line.lineId, itemCount: countResult.value, privilegeClaimed: privilege.claimed });
    },

    /**
     * Review — the independent key. A seat OUTSIDE the parties, connected to the
     * producers on the graph and with standing over at least one of them. A
     * refusal returns the line to working.
     */
    informationRequestReview(input = {}) {
      const check = seatFor(RQR_RIGHTS.REVIEW);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      if (line.line.lineState !== 'produced') {
        return fail(line.line.lineState === 'cleared'
          ? 'This line’s production is already independently reviewed. A second clearance of the same assertion is not independence.'
          : (line.line.lineState === 'refused'
            ? 'This line’s production was already refused in review; a fresh assertion from the producer is owed before it can be reviewed again.'
            : 'Nothing has been produced on this line yet, so there is nothing to review.'), 'lineId', REFUSAL(R.nothingToReview));
      }
      const verdict = RQR_REVIEW_VERDICTS.includes(input.verdict) ? input.verdict : null;
      if (!verdict) return fail('Record “clear” or “refuse” — a closed list, so the counts mean one thing.', 'verdict', REFUSAL(R.unreadable));
      // INDEPENDENCE. The SAME predicate the badge and the panel use, so the
      // register never offers a seat a review the action then refuses.
      const graph = matrix(check.at, check.cfg);
      if (!rqSeatMayReview(graph, check.seat, ctx.row)) {
        const parties = ctx.row.partyIds || [];
        const isParty = parties.includes(check.actorId);
        return fail(isParty
          ? 'You are a party to this request — you recorded it, you produce a line of it, or you hold an act on its ledger. A production certified by the hands that assembled it is not assurance, and a privilege claim cleared by the seat that withheld the material is not a privilege log. Nothing was saved.'
          : 'A completeness review needs a seat outside the parties that sits in the producers’ reporting graph and holds standing over at least one of them. This seat does not, so the register prints `no-independent-reviewer` rather than waive the test.', 'lineId', REFUSAL(isParty ? R.isParty : R.noEligibleReviewer));
      }
      const methodText = rqrText(input.methodText, L.textMax);
      if (methodText.length < L.textMin) return fail(`Say how you tested the completeness of this line, in at least ${L.textMin} characters — what you asked for, and what you saw.`, 'methodText', REFUSAL(R.unreadable));
      // The privilege verdict is REQUIRED where a claim stands, and REFUSED
      // where there is none — so a reviewer cannot quietly decline the hardest
      // question on the request, and cannot rule on a claim nobody made.
      let privilegeVerdict = null;
      if (line.line.privilegeClaimed) {
        privilegeVerdict = RQR_PRIVILEGE_OUTCOMES.includes(input.privilegeVerdict) ? input.privilegeVerdict : null;
        if (!privilegeVerdict) return fail(`This line claims privilege over ${line.line.privilegeWithheldCount} item(s). Rule on the claim: sustain it or refuse it. A review that leaves the claim untested has not reviewed the line.`, 'privilegeVerdict', REFUSAL(R.privilegeVerdictRequired));
      } else if (input.privilegeVerdict !== undefined && input.privilegeVerdict !== null && input.privilegeVerdict !== '') {
        return fail('This line claims no privilege, so there is nothing to rule on. Leave the privilege verdict blank.', 'privilegeVerdict', REFUSAL(R.privilegeVerdictUnwanted));
      }
      const reviewedAt = actInstant(input, 'reviewedAt', { notBefore: line.line.producedOn ? `${line.line.producedOn}T00:00:00.000Z` : ctx.request.createdAt });
      if (typeof reviewedAt !== 'string') return reviewedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'review',
        lineId: line.line.lineId, verdict, privilegeVerdict, methodText, reviewedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The review could not be stored as an act this register can read back. Nothing was saved.', 'methodText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.REVIEWED,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: (verdict === 'clear'
          ? (privilegeVerdict === 'sustain'
            ? 'A seat outside the parties cleared one line’s production and sustained its privilege claim. The release to the requester becomes owed once every line is cleared.'
            : 'A seat outside the parties cleared one line’s production as complete. The release to the requester becomes owed once every line is cleared.')
          : (privilegeVerdict === 'refuse'
            ? 'A seat outside the parties STRUCK OUT one line’s privilege claim; its withheld material is now unaccounted for and the line is owed again.'
            : 'A seat outside the parties REFUSED one line’s production as incomplete; the line is owed again.')).slice(0, 300),
      });
      return saved({ actId: id, verdict, privilegeVerdict });
    },

    /**
     * Release — the receiving seat records that the production went to the
     * requester, in writing. REFUSED until every line is reviewed.
     */
    informationRequestRelease(input = {}) {
      const check = seatFor(RQR_RIGHTS.RELEASE);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      if (ctx.row.receivedById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the seat that recorded this demand releases the production to the requester. The covering letter carries their name.', 'requestId', REFUSAL(R.notReceiver));
      }
      if (ctx.row.released) return fail('A production is already released for this request. It is recorded once.', 'requestId', REFUSAL(R.alreadyReleased));
      if (!ctx.row.allReviewed) {
        const remaining = ctx.row.lines.filter((line) => line.lineState !== 'cleared').length;
        return fail(`A production goes to the requester only when EVERY line has been reviewed by a seat outside the parties. ${remaining} line(s) have not. The register refuses to release an unreviewed line as a complete answer.`, 'requestId', REFUSAL(R.releasesNothing));
      }
      const transmissionRef = rqrText(input.transmissionRef, L.refMax + 20);
      if (transmissionRef.length < L.refMin) return fail(`Name the transmission by which the requester was sent the production — the secure portal reference, the covering letter, the filing — in at least ${L.refMin} characters.`, 'transmissionRef', REFUSAL(R.transmissionUnreadable));
      const releaseText = rqrText(input.releaseText, L.textMax);
      if (releaseText.length < L.textMin) return fail(`Say what was sent, in at least ${L.textMin} characters.`, 'releaseText', REFUSAL(R.unreadable));
      const countResult = declaredCount(input.itemCount, 'itemCount', 'the number of items released');
      if (!countResult.ok) return countResult;
      if (countResult.value > ctx.row.producedItemCount) {
        return fail(`You released ${countResult.value} item(s) but the certified productions of these lines total ${ctx.row.producedItemCount}. Release the count the record supports, or correct the line assertions first — the register will not print a release larger than the work certified behind it.`, 'itemCount', REFUSAL(R.unreadable));
      }
      const releasedAt = actInstant(input, 'releasedAt', {
        notBefore: ctx.row.lastReviewedOn ? `${ctx.row.lastReviewedOn}T00:00:00.000Z` : ctx.request.createdAt,
      });
      if (typeof releasedAt !== 'string') return releasedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'release',
        transmissionRef: transmissionRef.slice(0, L.refMax), releaseText, itemCount: countResult.value, releasedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The release could not be stored as an act this register can read back. Nothing was saved.', 'releaseText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.RELEASED,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: `A production of ${countResult.value} item(s) was released to the requester under a named transmission. Every line had been reviewed by a seat outside the parties first.`.slice(0, 300),
      });
      return saved({ actId: id, releasedOn: dayOfIso(releasedAt), itemCount: countResult.value });
    },

    /**
     * Respond — record the requester's own verdict on the production, once,
     * after a release.
     */
    informationRequestRespond(input = {}) {
      const check = seatFor(RQR_RIGHTS.RELEASE);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      if (ctx.row.receivedById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the seat that recorded this demand records the requester’s answer.', 'requestId', REFUSAL(R.notReceiver));
      }
      if (!ctx.row.released) return fail('There is no release to answer. The requester’s verdict is recorded on a production that went out, and none has.', 'requestId', REFUSAL(R.respondBeforeRelease));
      if (ctx.row.respondedOn) return fail('The requester’s answer is already on the record. A second one is not a stronger duty.', 'requestId', REFUSAL(R.alreadyResponded));
      const response = RQR_RESPONSE_KEYS.includes(input.response) ? input.response : null;
      if (!response) return fail('Record what came back, from the closed list: received and complete, no response yet, or insufficient.', 'response', REFUSAL(R.unreadable));
      const responseRef = rqrText(input.responseRef, L.refMax + 20);
      if (responseRef.length < L.refMin) return fail(`Name the written record of the requester’s reply — or of its absence — in at least ${L.refMin} characters.`, 'responseRef', REFUSAL(R.unreadable));
      const responseText = rqrText(input.responseText, L.textMax);
      if (responseText.length < L.textMin) return fail(`Say what they said about the production, in at least ${L.textMin} characters.`, 'responseText', REFUSAL(R.unreadable));
      const respondedAt = actInstant(input, 'respondedAt', { notBefore: `${ctx.row.releasedOn}T00:00:00.000Z` });
      if (typeof respondedAt !== 'string') return respondedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'respond',
        response, responseRef: responseRef.slice(0, L.refMax), responseText, respondedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The response could not be stored as an act this register can read back. Nothing was saved.', 'responseText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.RESPONDED,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: response === 'insufficient'
          ? 'The requester found the production INSUFFICIENT. The request reads as insufficient, never as answered, until the record says otherwise.'
          : 'The requester’s answer to a production release was recorded.'.slice(0, 300),
      });
      return saved({ actId: id, response });
    },

    /**
     * Restate the clock — the requester's OWN moved day, with their dated
     * reference. This is the only path on which a deadline moves that the entity
     * did not ask for, and it is refused without a citation.
     */
    informationRequestRestateClock(input = {}) {
      const check = seatFor(RQR_RIGHTS.RELEASE);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      if (ctx.row.receivedById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the seat that recorded this demand may restate its reply clock, because it is the seat the requester writes to.', 'requestId', REFUSAL(R.notReceiver));
      }
      if (ctx.row.released && ctx.row.respondedOn) return fail('This request is answered. Its clock is history.', 'requestId', REFUSAL(R.alreadyClosed));
      const requesterReference = rqrText(input.requesterReference, L.refMax + 20);
      if (requesterReference.length < L.refMin) {
        return fail('Name the requester’s own dated letter, email or minute in which the day moved. A moved deadline with nothing behind it is an extension the entity granted itself.', 'requesterReference', REFUSAL(R.clockRefusedNoReference));
      }
      const restatedReplyDay = rqrDay(input.restatedReplyDay);
      if (!restatedReplyDay) return fail('Give the real calendar day the requester moved the reply to.', 'restatedReplyDay', REFUSAL(R.replyDayUnreadable));
      const newClockDays = Number(input.newClockDays === undefined || input.newClockDays === null || input.newClockDays === '' ? NaN : input.newClockDays);
      if (!Number.isInteger(newClockDays) || newClockDays < L.clockMinDays || newClockDays > L.clockMaxDays) {
        return fail(`Give the requester’s restated clock in whole days between ${L.clockMinDays} and ${L.clockMaxDays}, read off their letter. The register will not recompute it from anything else.`, 'newClockDays', REFUSAL(R.clockUnreadable));
      }
      const expected = rqReplyDay(ctx.request.receivedOn, newClockDays);
      if (expected && expected !== restatedReplyDay) {
        return fail(`The restated day (${restatedReplyDay}) does not follow from the receipt day plus the restated clock (${expected}). The register derives the day from the requester's own two figures rather than accept a number that matches neither.`, 'restatedReplyDay', REFUSAL(R.clockNotRestated));
      }
      const clockRestatedAt = actInstant(input, 'clockRestatedAt', { notBefore: ctx.request.createdAt });
      if (typeof clockRestatedAt !== 'string') return clockRestatedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'clock',
        newClockDays, restatedReplyDay, requesterReference: requesterReference.slice(0, L.refMax), clockRestatedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The restated clock could not be stored as an act this register can read back. Nothing was saved.', 'requesterReference', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.Clocked,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: `The requester restated the reply day to ${restatedReplyDay} in their own dated correspondence. The register recorded their figure, cited to their letter; it did not compute one.`.slice(0, 300),
      });
      return saved({ actId: id, restatedReplyDay });
    },

    /**
     * Extend — move the reply day. A cap is a refusal with a printed reason,
     * never a warning; a compelled instrument is not the entity's to move at all.
     */
    informationRequestExtend(input = {}) {
      const check = seatFor(RQR_RIGHTS.RELEASE);
      if (!check.ok) return check;
      const ctx = requestContext(check, input.requestId);
      if (!ctx.ok) return ctx;
      if (ctx.row.receivedById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the seat that recorded this demand moves its reply day.', 'requestId', REFUSAL(R.notReceiver));
      }
      if (ctx.row.released) return fail('This production is already released. Its reply day is history.', 'requestId', REFUSAL(R.alreadyClosed));
      if (ctx.row.daysRemaining !== null && ctx.row.daysRemaining < 0) {
        return fail(`The reply day (${ctx.row.effectiveReplyDay}) has passed. A lapsed request is not un-lapsed by moving the date — the requester already knows it was late. Record what is actually true.`, 'newReplyDay', REFUSAL(R.extensionAfterDue));
      }
      const newReplyDay = rqrDay(input.newReplyDay);
      if (!newReplyDay) return fail('Give the real calendar day the reply moves to.', 'newReplyDay', REFUSAL(R.replyDayUnreadable));
      if (newReplyDay <= ctx.row.effectiveReplyDay) {
        return fail(`An extension must move the reply day forward from ${ctx.row.effectiveReplyDay}.`, 'newReplyDay', REFUSAL(R.extensionNotForward));
      }
      const horizon = rqrDayDiff(check.today, newReplyDay);
      if (horizon !== null && horizon > L.horizonMaxDays) {
        return fail(`An extension more than ${L.horizonMaxDays} days out is not a dated obligation.`, 'newReplyDay', REFUSAL(R.extensionBeyondHorizon));
      }
      if (rqrInstrumentIsCompelled(ctx.request.instrument)) {
        return fail('This demand arrived under a compelled instrument — an order, a notice, a subpoena. Its date is not the entity’s to move: an extension is refused here, and a moved day must be recorded as the requester’s own restated clock.', 'requestId', REFUSAL(R.extensionRefusedCompelled));
      }
      const agreementRaw = input.requesterAgreementRef;
      const requesterAgreementRef = agreementRaw === undefined || agreementRaw === null || agreementRaw === ''
        ? null
        : rqrText(agreementRaw, L.refMax + 20);
      if (agreementRaw !== undefined && agreementRaw !== null && agreementRaw !== '' && requesterAgreementRef.length < L.refMin) {
        return fail(`Name the requester’s written agreement in at least ${L.refMin} characters, or leave it blank.`, 'requesterAgreementRef', REFUSAL(R.unreadable));
      }
      if (!requesterAgreementRef) {
        return fail('The reply day belongs to the requester. An extension is refused without their own recorded written agreement — the register will not record a unilateral postponement of a deadline an authority set.', 'requesterAgreementRef', REFUSAL(R.extensionRefusedNoAgreement));
      }
      const reason = rqrText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail(`Say why the day is moving, in at least ${L.textMin} characters.`, 'reason', REFUSAL(R.unreadable));
      const extendedAt = actInstant(input, 'extendedAt', { notBefore: ctx.request.createdAt });
      if (typeof extendedAt !== 'string') return extendedAt;

      const existingActs = loadedActs(ctx.requests);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('rqa');
      const act = {
        id, requestId: ctx.request.id, actorId: check.actorId, kind: 'extend',
        previousReplyDay: ctx.row.effectiveReplyDay, newReplyDay, reason,
        requesterAgreementRef: requesterAgreementRef ? requesterAgreementRef.slice(0, L.refMax) : null,
        extendedAt,
      };
      const loaded = normalizeRequestActs([...existingActs, act], ctx.requests, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The extension could not be stored as an act this register can read back. Nothing was saved.', 'reason', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.informationRequestActs = Array.isArray(draft.informationRequestActs) ? draft.informationRequestActs : [];
        draft.informationRequestActs.push(stored);
      }, {
        type: RQR_EVENTS.EXTENDED,
        entity: RQR_ENTITY,
        entityId: ctx.request.id,
        summary: `The reply day on an information request moved from ${ctx.row.effectiveReplyDay} to ${newReplyDay} with the requester’s written agreement on the record.`.slice(0, 300),
      });
      return saved({ actId: id, newReplyDay });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    informationRequestScan() {
      const check = seatFor(RQR_RIGHTS.RECEIVE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: RQR_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${RQR_ROUTE}#${RQR_RULE_ID}`,
        summary: `Information-request register scan requested (${RQR_RULE_ID}): unreviewed productions, untested privilege claims, unreleased reviews and lapsed reply days re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    informationRequestReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildInformationRequestReport(store.state, { now: check.at, seat: check.seat });
    },

    informationRequestAttentionCount() {
      const { seat, at } = readSeat();
      return informationRequestAttentionCount(store.state, { now: at, seat });
    },

    /**
     * Dialog support: the people a receiving seat may name as producers, the
     * closed vocabularies the dialogs must not guess, and — computed with the ONE
     * review predicate — the requests this seat may review. No dialog invents a
     * producer, a clock or a reviewer.
     */
    informationRequestCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const people = rows('people')
        .filter((row) => row && row.id && isActive(row))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || row.level || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const graph = matrix(check.at, check.cfg);
      const report = buildInformationRequestReport(store.state, { now: check.at, seat: check.seat });
      const seat = check.seat;
      return {
        ok: true,
        people,
        requesterKinds: [...RQR_REQUESTER_KINDS],
        instruments: [...RQR_INSTRUMENTS],
        reviewVerdicts: [...RQR_REVIEW_VERDICTS],
        privilegeOutcomes: [...RQR_PRIVILEGE_OUTCOMES],
        responses: [...RQR_RESPONSE_KEYS],
        limits: { clockMinDays: L.clockMinDays, clockMaxDays: L.clockMaxDays, linesMax: L.linesMax },
        followUpParents: report.rows
          .filter((row) => row.response === 'insufficient' && row.respondedOn)
          .map((row) => ({
            id: row.id,
            requester: row.requester,
            requesterKind: row.requesterKind,
            instrumentRef: row.instrumentRef,
            scope: row.scope,
            receivedOn: row.receivedOn,
            respondedOn: row.respondedOn,
          }))
          .sort((a, b) => String(b.respondedOn).localeCompare(String(a.respondedOn)) || String(a.id).localeCompare(String(b.id))),
        reviewable: report.rows
          .filter((row) => row.lines.some((line) => line.lineState === 'produced'))
          .map((row) => ({
            id: row.id,
            mayReview: rqSeatMayReview(graph, seat, row),
            lines: row.lines.filter((line) => line.lineState === 'produced').map((line) => line.lineId),
          })),
      };
    },
  };
}

export default createInformationRequestActions;
