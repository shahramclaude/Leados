/**
 * app/core/domain/undertakingActions.js — the seat-checked commands of the
 * Regulatory Undertaking & Outward-Commitment Closure Register (ADR-0234).
 *
 * ONE declaration, five human acts and a scan, and nothing else: DECLARE a
 * promise the entity has given to an outside party, ASSIGN a holder and a
 * deliverable to a line, DELIVER on a line you hold, VERIFY from strictly above
 * the holder, REPORT the closure to the counterparty, NOTIFY their
 * acknowledgement, and EXTEND the due day. Every state, flag, count and rate is
 * re-derived on read by `undertakingClosure.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Declaration is FIRST-PERSON and it is an EXECUTIVE act (rank 4+). The
 *    synthetic workspace leader never declares, and neither does the undeclared
 *    operator view. No undertaking is inferred from an assurance finding, a
 *    risk statement, a board memo or a contract record.
 *  - THE DECLARED IDENTITY IS IMMUTABLE. Counterparty, kind, instrument, scope
 *    and due day are read from the declaration for the life of the record. A
 *    correction is a new undertaking, never an edit that would let the record
 *    quietly become a different promise.
 *  - ASSIGN names a real, active person on a line that is still short of a
 *    holder. A holder is NEVER inferred from org position.
 *  - DELIVER is the holder's own act: only the person the line names asserts
 *    its deliverable, and one assertion stands until it is tested.
 *  - VERIFY is the INDEPENDENT key: a seat strictly above the holder on the
 *    reporting graph, never the holder, never below them, never an unrelated
 *    branch. The badge and this action share ONE predicate.
 *  - REPORT is the accountable executive's act and is REFUSED until EVERY line
 *    is confirmed. Reporting a promise as met while one line is untested is
 *    exactly the substitution this register exists to prevent. A report may not
 *    predate the last confirmation, and must name the written instrument by
 *    which the counterparty was told.
 *  - EXTEND is refused on an instrument whose date is not the entity's alone to
 *    move unless the counterparty's own agreement is recorded; refused if it
 *    does not move the day forward; refused past the declared horizon; and
 *    refused after the due day has passed — a lapsed promise is not un-lapsed
 *    by moving the date.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildUndertakings } from './undertakingClosure.js';
import { buildUndertakingReport, undertakingAttentionCount, undertakingVerifierReach } from './undertakingReport.js';
import {
  udtDay,
  udtInstant,
  udtText,
  normalizeUndertakingActs,
  normalizeUndertakings,
} from './undertakingSchema.js';
import {
  UDT_ACKNOWLEDGEMENT_KEYS,
  UDT_COUNTERPARTY_KINDS,
  UDT_EVENTS,
  UDT_INSTRUMENTS,
  UDT_LIMITS as L,
  UDT_REFUSALS as R,
  UDT_RIGHTS,
  UDT_ROUTE,
  UDT_RULE_ID,
  UDT_VERDICT_KEYS,
  udtInstrumentIsExternal,
} from './undertakingRegistry.js';

const REFUSAL = (key) => `undertaking:${key}`;
const NOT_SEATED = 'No seat is resolved. Declare a valid seat before acting; the undertaking register is never changed from an unknown operating position.';
const DAY_MS = 86400000;
const dayOf = (iso) => String(iso || '').slice(0, 10);

const dayDiff = (fromDay, toDay) => (
  (Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / DAY_MS
);

export function createUndertakingActions(store, { now, idFactory }) {
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
      return fail('An undertaking is a first-person act of a named person. The undeclared operator view cannot speak for one — declare a seat on the Altitude Lens.', null, REFUSAL(R.noActor));
    }
    const person = rows('people').find((row) => row && row.id === actorId) || null;
    if (!person) return fail('This seat is not a person on the roster. A promise is recorded by a named person, and nothing is recorded in their place.', null, REFUSAL(R.noActor));
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
    const verdict = canAct(UDT_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  const rosterPerson = (id) => {
    const key = udtText(id, 120);
    if (!key) return null;
    return rows('people').find((row) => row && row.id === key) || null;
  };
  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  const loadedUndertakings = () => normalizeUndertakings(rows('undertakings'), []);
  const loadedActs = (undertakings) => normalizeUndertakingActs(rows('undertakingActs'), undertakings, []);

  const matrix = (at, cfg) => buildMatrix(store.state, { now: at, settings: { ...(cfg || {}), activeSeatId: null } });

  function undertakingContext(check, undertakingId) {
    const key = udtText(undertakingId, 120);
    if (!key) return fail('Name the undertaking.', 'undertakingId', REFUSAL(R.unknownUndertaking));
    const undertakings = loadedUndertakings();
    const undertaking = undertakings.find((row) => row.id === key) || null;
    if (!undertaking) return fail('That undertaking is not on this register.', 'undertakingId', REFUSAL(R.unknownUndertaking));
    const report = buildUndertakings(store.state, { now: check.at });
    const row = report.rows.find((candidate) => candidate.id === undertaking.id) || null;
    if (!row) return fail('That undertaking cannot be read back from the record. Nothing was saved.', 'undertakingId', REFUSAL(R.unreadable));
    return { ok: true, undertaking, row, undertakings, report };
  }

  function lineContext(ctx, input) {
    const lineId = udtText(input.lineId, 120);
    if (!lineId) return fail('Name the obligation line this act is about.', 'lineId', REFUSAL(R.declaredLineUnresolved));
    const line = ctx.row.lines.find((entry) => entry.lineId === lineId) || null;
    if (!line) return fail('That obligation line is not on this undertaking.', 'lineId', REFUSAL(R.declaredLineUnresolved));
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
    const at = udtInstant(raw);
    if (!at) return fail(`Give a real calendar moment for the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`, field, REFUSAL(R.unreadable));
    if (Date.parse(at) > clock().getTime() + 5 * 60 * 1000) {
      return fail('An act cannot be dated after the moment it is recorded.', field, REFUSAL(R.futureDated));
    }
    if (notBefore && Date.parse(at) < Date.parse(notBefore)) {
      return fail('An act cannot predate the record it answers.', field, REFUSAL(R.beforeDeclared));
    }
    return at;
  }

  /** The declared obligation lines of a fresh declaration, each with its own required deliverable and day. */
  function declaredLines(input) {
    const raw = Array.isArray(input.lines) ? input.lines : [];
    if (!raw.length) return fail('Declare at least one obligation line — a promise to an outside party is a promise about something in particular, held by somebody.', 'lines', REFUSAL(R.lineOutOfRange));
    if (raw.length > L.linesMax) return fail(`An undertaking carries at most ${L.linesMax} obligation lines. Beyond that it is a programme, and a programme is not a promise with one date.`, 'lines', REFUSAL(R.lineOutOfRange));
    const lines = [];
    const seen = new Set();
    for (const [index, entry] of raw.entries()) {
      if (!entry || typeof entry !== 'object') return fail(`Obligation line ${index + 1} is unreadable.`, 'lines', REFUSAL(R.unreadable));
      const roleLabel = udtText(entry.roleLabel, L.refMax);
      const deliverable = udtText(entry.deliverable, L.textMax);
      const dueOn = udtDay(entry.dueOn);
      if (deliverable.length < L.textMin) {
        return fail(`Obligation line ${index + 1}: say what is owed, in at least ${L.textMin} characters. A promise is not a heading.`, 'lines', REFUSAL(R.unreadable));
      }
      if (!dueOn) return fail(`Obligation line ${index + 1}: give the real calendar day its deliverable is owed by.`, 'lines', REFUSAL(R.unreadable));
      const holderId = entry.holderId === undefined || entry.holderId === null || entry.holderId === ''
        ? null
        : udtText(entry.holderId, 120);
      if (entry.holderId !== undefined && entry.holderId !== null && entry.holderId !== '' && !holderId) {
        return fail(`Obligation line ${index + 1}: that holder is unreadable. Name a person on this roster, or leave the line unassigned.`, 'lines', REFUSAL(R.unreadable));
      }
      if (holderId) {
        const holder = rosterPerson(holderId);
        if (!holder) return fail(`Obligation line ${index + 1}: the named holder is not on this roster. A holder is named, never inferred.`, 'lines', REFUSAL(R.holderInactive));
        if (!isActive(holder)) return fail(`Obligation line ${index + 1}: the named holder is archived on the roster.`, 'lines', REFUSAL(R.holderInactive));
      }
      const lineKey = udtText(entry.lineId, 120) || `ln-${index + 1}`;
      if (seen.has(lineKey)) return fail(`Obligation line ${index + 1}: that line id is declared twice.`, 'lines', REFUSAL(R.duplicateLine));
      seen.add(lineKey);
      lines.push({ lineId: lineKey, holderId, roleLabel, deliverable, dueOn });
    }
    return { ok: true, lines };
  }

  return {
    /**
     * Declare — an executive records a promise the entity has given to an
     * outside party. The declared identity is immutable; every line names its
     * own deliverable and day, and its holder where one is already known.
     */
    undertakingDeclare(input = {}) {
      const check = seatFor(UDT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (!check.seat.fullAccess && !(Number(check.seat.rank) >= L.declareMinRank)) {
        return fail(`Recording a promise to an outside party is an executive act (rank ${L.declareMinRank} or above). This seat does not carry that altitude.`, null, REFUSAL(R.notAExecutive));
      }
      const counterparty = udtText(input.counterparty, L.counterpartyMax);
      if (counterparty.length < L.counterpartyMin) {
        return fail(`Name the counterparty the promise was given to, in at least ${L.counterpartyMin} characters — a supervisor by name, a customer, a board committee.`, 'counterparty', REFUSAL(R.counterpartyUnreadable));
      }
      const counterpartyKind = UDT_COUNTERPARTY_KINDS.some((row) => row.key === input.counterpartyKind) ? input.counterpartyKind : null;
      if (!counterpartyKind) return fail('Say who was promised, from the closed list: a regulator, the board, a customer, a lender, a certifier or another public authority.', 'counterpartyKind', REFUSAL(R.counterpartyUnreadable));
      const instrument = UDT_INSTRUMENTS.some((row) => row.key === input.instrument) ? input.instrument : null;
      if (!instrument) return fail('Say which instrument the promise was given under, from the closed list. A licence condition and a board commitment carry different rules for moving a date.', 'instrument', REFUSAL(R.instrumentUnreadable));
      const instrumentRef = udtText(input.instrumentRef, L.refMax + 20);
      if (instrumentRef.length < L.refMin) return fail(`Name the instrument — the undertaking reference, the licence condition number, the resolution — in at least ${L.refMin} characters.`, 'instrumentRef', REFUSAL(R.instrumentUnreadable));
      const scope = udtText(input.scope, L.textMax);
      if (scope.length < L.textMin) {
        return fail(`Declare the scope the promise covers, in at least ${L.textMin} characters — what it applies to, and what it does not. A representation given over an undeclared scope is not a representation.`, 'scope', REFUSAL(R.scopeUnreadable));
      }
      const dueOn = udtDay(input.dueOn);
      if (!dueOn) return fail('Give the real calendar day the promise is due — the day the counterparty expects to hear.', 'dueOn', REFUSAL(R.dueOutOfRange));
      const horizon = dayDiff(check.today, dueOn);
      if (horizon < 0) return fail('A promise is not due in the past. Record what is actually owed.', 'dueOn', REFUSAL(R.dueInPast));
      if (horizon > L.horizonMaxDays) {
        return fail(`A due day more than ${L.horizonMaxDays} days out is not a dated commitment. Declare the nearer obligation, or split the programme.`, 'dueOn', REFUSAL(R.dueOutOfRange));
      }
      const lineResult = declaredLines(input);
      if (!lineResult.ok) return lineResult;

      const existing = loadedUndertakings();
      if (existing.length >= L.undertakings) return fail('The undertaking register is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('udt');
      const createdAt = check.at.toISOString();
      const candidate = {
        id,
        counterparty,
        counterpartyKind,
        instrument,
        instrumentRef: instrumentRef.slice(0, L.refMax),
        scope,
        dueOn,
        declaredById: check.actorId,
        createdAt,
        lines: lineResult.lines,
      };
      const loaded = normalizeUndertakings([...existing, candidate], []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The undertaking could not be stored as a row this register can read back. Nothing was saved.', 'scope', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakings = Array.isArray(draft.undertakings) ? draft.undertakings : [];
        draft.undertakings.push(stored);
      }, {
        type: UDT_EVENTS.DECLARED,
        entity: 'undertaking',
        entityId: id,
        summary: `A promise to an outside party was recorded under a declared instrument, due ${stored.dueOn}, across ${stored.lines.length} obligation line(s). It closes only when every line is independently confirmed and the counterparty is told in writing.`.slice(0, 300),
      });
      return saved({ undertakingId: id, lineCount: stored.lines.length });
    },

    /**
     * Assign — name a holder, a deliverable and a day on a line that carries
     * none. The accountable executive's act; the holder is NAMED.
     */
    undertakingAssign(input = {}) {
      const check = seatFor(UDT_RIGHTS.ASSIGN);
      if (!check.ok) return check;
      const ctx = undertakingContext(check, input.undertakingId);
      if (!ctx.ok) return ctx;
      if (ctx.row.declaredById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the executive who declared this undertaking names a holder on its lines. The duty is theirs to place.', 'undertakingId', REFUSAL(R.notDeclarant));
      }
      if (ctx.row.state === 'reported-met') return fail('This undertaking is closed and reported. Nothing more is owed on it.', 'undertakingId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      if (line.line.holderId) {
        return fail('That line already carries a holder. Re-assignment is a new human decision recorded on the decision log — the line does not silently change hands here.', 'lineId', REFUSAL(R.lineAlreadyAssigned));
      }
      const holder = rosterPerson(input.holderId);
      if (!holder) return fail('Name the person who will hold this line — a person on this roster. A holder is named, never inferred from the org chart.', 'holderId', REFUSAL(R.holderInactive));
      if (!isActive(holder)) return fail('The named holder is archived on the roster. Nothing was saved.', 'holderId', REFUSAL(R.holderInactive));
      const deliverable = udtText(input.deliverable, L.textMax);
      if (deliverable.length < L.textMin) return fail(`Say what this line owes, in at least ${L.textMin} characters.`, 'deliverable', REFUSAL(R.unreadable));
      const dueOn = udtDay(input.dueOn);
      if (!dueOn) return fail('Give the real calendar day this line’s deliverable is owed by.', 'dueOn', REFUSAL(R.dueOutOfRange));
      if (dueOn > ctx.row.effectiveDueOn) {
        return fail(`A line day (${dueOn}) inside a promise due ${ctx.row.effectiveDueOn} would make the line undeliverable before the promise is owed. Ask for the line inside the promise.`, 'dueOn', REFUSAL(R.dueOutOfRange));
      }
      const assignedAt = actInstant(input, 'assignedAt', { notBefore: ctx.undertaking.createdAt });
      if (typeof assignedAt !== 'string') return assignedAt;

      const existingActs = loadedActs(ctx.undertakings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('uda');
      const act = {
        id, undertakingId: ctx.undertaking.id, actorId: check.actorId, kind: 'assign',
        lineId: line.line.lineId, holderId: holder.id, deliverable, dueOn, assignedAt,
      };
      const loaded = normalizeUndertakingActs([...existingActs, act], ctx.undertakings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The assignment could not be stored as an act this register can read back. Nothing was saved.', 'deliverable', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakingActs = Array.isArray(draft.undertakingActs) ? draft.undertakingActs : [];
        draft.undertakingActs.push(stored);
      }, {
        type: UDT_EVENTS.ASSIGNED,
        entity: 'undertaking',
        entityId: ctx.undertaking.id,
        summary: `A holder was named on one obligation line of an undertaking; the line is owed by ${dueOn}. The holder answers with their own dated assertion, never with a form.`.slice(0, 300),
      });
      return saved({ actId: id, lineId: line.line.lineId });
    },

    /**
     * Deliver — the holder of the line asserts its deliverable exists, in their
     * own name, with dated evidence. One assertion stands until it is tested.
     */
    undertakingDeliver(input = {}) {
      const check = seatFor(UDT_RIGHTS.DELIVER);
      if (!check.ok) return check;
      const ctx = undertakingContext(check, input.undertakingId);
      if (!ctx.ok) return ctx;
      if (ctx.row.state === 'reported-met') return fail('This undertaking is closed and reported. Its delivery record is closed.', 'undertakingId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      if (!line.line.holderId) return fail('That line has no named holder, so nobody can assert its deliverable. Name a holder first.', 'lineId', REFUSAL(R.lineUnassigned));
      if (line.line.holderId !== check.actorId) {
        return fail('Only the holder of this line asserts its deliverable, in their own name. A manager cannot deliver on somebody else’s line.', 'lineId', REFUSAL(R.notLineHolder));
      }
      if (line.line.lineState === 'delivered' || line.line.lineState === 'confirmed') {
        return fail('This line’s deliverable is already asserted and awaits an independent test. A second assertion is not a stronger delivery.', 'lineId', REFUSAL(R.alreadyDelivered));
      }
      const evidenceText = udtText(input.evidenceText, L.textMax);
      if (evidenceText.length < L.textMin) return fail(`Say what you delivered and what can be seen of it, in at least ${L.textMin} characters.`, 'evidenceText', REFUSAL(R.unreadable));
      const referenceRef = udtText(input.referenceRef, L.refMax + 20);
      if (referenceRef.length < L.refMin) return fail(`Name where it can be found — a system, a document, a register reference — in at least ${L.refMin} characters.`, 'referenceRef', REFUSAL(R.unreadable));
      const deliveredAt = actInstant(input, 'deliveredAt', { notBefore: ctx.undertaking.createdAt });
      if (typeof deliveredAt !== 'string') return deliveredAt;

      const existingActs = loadedActs(ctx.undertakings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('uda');
      const act = {
        id, undertakingId: ctx.undertaking.id, actorId: check.actorId, kind: 'deliver',
        lineId: line.line.lineId, evidenceText, referenceRef: referenceRef.slice(0, L.refMax), deliveredAt,
      };
      const loaded = normalizeUndertakingActs([...existingActs, act], ctx.undertakings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The delivery could not be stored as an act this register can read back. Nothing was saved.', 'evidenceText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakingActs = Array.isArray(draft.undertakingActs) ? draft.undertakingActs : [];
        draft.undertakingActs.push(stored);
      }, {
        type: UDT_EVENTS.DELIVERED,
        entity: 'undertaking',
        entityId: ctx.undertaking.id,
        summary: 'A line holder asserted their deliverable on an undertaking. It closes nothing: an independent test from above the holder is now owed.'.slice(0, 300),
      });
      return saved({ actId: id, lineId: line.line.lineId });
    },

    /**
     * Verify — the independent key. Strictly above the holder on the reporting
     * graph, never the holder, never a subordinate, never an unrelated branch.
     * A rejection returns the line to working.
     */
    undertakingVerify(input = {}) {
      const check = seatFor(UDT_RIGHTS.VERIFY);
      if (!check.ok) return check;
      const ctx = undertakingContext(check, input.undertakingId);
      if (!ctx.ok) return ctx;
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      if (!line.line.holderId) return fail('That line has no named holder, so there is nothing to test.', 'lineId', REFUSAL(R.nothingToVerify));
      if (line.line.lineState !== 'delivered') {
        return fail(line.line.lineState === 'confirmed'
          ? 'This line’s deliverable is already independently confirmed. A second confirmation of the same assertion is not independence.'
          : (line.line.lineState === 'rejected'
            ? 'This line’s deliverable was already rejected; a fresh assertion from the holder is owed before it can be tested again.'
            : 'Nothing has been asserted on this line yet, so there is nothing to test.'), 'lineId', REFUSAL(R.nothingToVerify));
      }
      const verdict = UDT_VERDICT_KEYS.includes(input.verdict) ? input.verdict : null;
      if (!verdict) return fail('Record “confirm” or “reject” — a closed list, so the counts mean one thing.', 'verdict', REFUSAL(R.unreadable));
      // INDEPENDENCE. The same predicate the badge uses, so the register never
      // offers a seat a test the action then refuses.
      const graph = matrix(check.at, check.cfg);
      if (!undertakingVerifierReach(graph, check.seat, line.line.holderId)) {
        return fail(verdict === 'reject'
          ? 'Rejection is also an independent act: you must sit strictly above the line’s holder on the reporting graph — never the holder, never below them, never on an unrelated branch. Nothing was saved.'
          : 'Verification is an independent key: you must sit strictly above the line’s holder on the reporting graph — never the holder, never below them, never on an unrelated branch. The person who delivers does not grade.', 'lineId', REFUSAL(R.notIndependent));
      }
      const methodText = udtText(input.methodText, L.textMax);
      if (methodText.length < L.textMin) return fail(`Say how you tested it, in at least ${L.textMin} characters — what you looked at, and what you saw.`, 'methodText', REFUSAL(R.unreadable));
      const verifiedAt = actInstant(input, 'verifiedAt', { notBefore: line.line.deliveredOn ? `${line.line.deliveredOn}T00:00:00.000Z` : ctx.undertaking.createdAt });
      if (typeof verifiedAt !== 'string') return verifiedAt;

      const existingActs = loadedActs(ctx.undertakings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('uda');
      const act = {
        id, undertakingId: ctx.undertaking.id, actorId: check.actorId, kind: 'verify',
        lineId: line.line.lineId, verdict, methodText, verifiedAt,
      };
      const loaded = normalizeUndertakingActs([...existingActs, act], ctx.undertakings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The verification could not be stored as an act this register can read back. Nothing was saved.', 'methodText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakingActs = Array.isArray(draft.undertakingActs) ? draft.undertakingActs : [];
        draft.undertakingActs.push(stored);
      }, {
        type: UDT_EVENTS.VERIFIED,
        entity: 'undertaking',
        entityId: ctx.undertaking.id,
        summary: verdict === 'confirm'
          ? 'An independent seat confirmed one line’s deliverable on an undertaking. The counterparty report becomes owed once every line is confirmed.'
          : 'An independent seat REJECTED one line’s deliverable on an undertaking; the line is owed again.'.slice(0, 300),
      });
      return saved({ actId: id, verdict });
    },

    /**
     * Report — the accountable executive records that the counterparty was
     * told in writing. REFUSED until every line is confirmed.
     */
    undertakingReportClosure(input = {}) {
      const check = seatFor(UDT_RIGHTS.REPORT);
      if (!check.ok) return check;
      const ctx = undertakingContext(check, input.undertakingId);
      if (!ctx.ok) return ctx;
      if (ctx.row.declaredById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the executive who declared this undertaking reports its closure to the counterparty. The signature is theirs.', 'undertakingId', REFUSAL(R.notDeclarant));
      }
      if (ctx.row.reported) return fail('A report is already on the record for this undertaking. It is recorded once.', 'undertakingId', REFUSAL(R.alreadyReported));
      if (!ctx.row.allConfirmed) {
        const remaining = ctx.row.lines.filter((line) => line.lineState !== 'confirmed').length;
        return fail(`A promise is reported to the counterparty only when EVERY line is independently confirmed. ${remaining} line(s) are not. The register refuses to report one line’s word as the whole promise.`, 'undertakingId', REFUSAL(R.deliversNothing));
      }
      const reportRef = udtText(input.reportRef, L.refMax + 20);
      if (reportRef.length < L.refMin) return fail(`Name the written instrument by which the counterparty was told — the letter, the filing, the email — in at least ${L.refMin} characters.`, 'reportRef', REFUSAL(R.unreadable));
      const reportText = udtText(input.reportText, L.textMax);
      if (reportText.length < L.textMin) return fail(`Say what the counterparty was told, in at least ${L.textMin} characters.`, 'reportText', REFUSAL(R.unreadable));
      const reportedAt = actInstant(input, 'reportedAt', {
        notBefore: ctx.row.lastConfirmedOn ? `${ctx.row.lastConfirmedOn}T00:00:00.000Z` : ctx.undertaking.createdAt,
      });
      if (typeof reportedAt !== 'string') return reportedAt;

      const existingActs = loadedActs(ctx.undertakings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('uda');
      const act = {
        id, undertakingId: ctx.undertaking.id, actorId: check.actorId, kind: 'report',
        reportRef: reportRef.slice(0, L.refMax), reportText, reportedAt,
      };
      const loaded = normalizeUndertakingActs([...existingActs, act], ctx.undertakings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The report could not be stored as an act this register can read back. Nothing was saved.', 'reportText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakingActs = Array.isArray(draft.undertakingActs) ? draft.undertakingActs : [];
        draft.undertakingActs.push(stored);
      }, {
        type: UDT_EVENTS.REPORTED,
        entity: 'undertaking',
        entityId: ctx.undertaking.id,
        summary: 'The counterparty was recorded as told, in writing, that the promise is met. Every line was independently confirmed before the report was accepted.'.slice(0, 300),
      });
      return saved({ actId: id, reportedOn: dayOf(reportedAt) });
    },

    /**
     * Notify — record the counterparty's acknowledgement, once, after a report.
     */
    undertakingNotify(input = {}) {
      const check = seatFor(UDT_RIGHTS.REPORT);
      if (!check.ok) return check;
      const ctx = undertakingContext(check, input.undertakingId);
      if (!ctx.ok) return ctx;
      if (ctx.row.declaredById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the executive who declared this undertaking records the counterparty’s acknowledgement.', 'undertakingId', REFUSAL(R.notDeclarant));
      }
      if (!ctx.row.reported) return fail('There is no report to acknowledge. The counterparty is asked to acknowledge a report, and there is none on the record yet.', 'undertakingId', REFUSAL(R.notifyBeforeReport));
      if (ctx.row.acknowledgedOn) return fail('The acknowledgement is already on the record. A second one is not a stronger duty.', 'undertakingId', REFUSAL(R.alreadyNotified));
      const acknowledgement = UDT_ACKNOWLEDGEMENT_KEYS.includes(input.acknowledgement) ? input.acknowledgement : null;
      if (!acknowledgement) return fail('Record what came back, from the closed list: acknowledged, no response yet, or disputed.', 'acknowledgement', REFUSAL(R.unreadable));
      const acknowledgementRef = udtText(input.acknowledgementRef, L.refMax + 20);
      if (acknowledgementRef.length < L.refMin) return fail(`Name the written record of the reply — or of its absence — in at least ${L.refMin} characters.`, 'acknowledgementRef', REFUSAL(R.unreadable));
      const notifiedAt = actInstant(input, 'notifiedAt', { notBefore: `${ctx.row.reportedOn}T00:00:00.000Z` });
      if (typeof notifiedAt !== 'string') return notifiedAt;

      const existingActs = loadedActs(ctx.undertakings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('uda');
      const act = {
        id, undertakingId: ctx.undertaking.id, actorId: check.actorId, kind: 'notify',
        acknowledgement, acknowledgementRef: acknowledgementRef.slice(0, L.refMax), notifiedAt,
      };
      const loaded = normalizeUndertakingActs([...existingActs, act], ctx.undertakings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The acknowledgement could not be stored as an act this register can read back. Nothing was saved.', 'acknowledgementRef', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakingActs = Array.isArray(draft.undertakingActs) ? draft.undertakingActs : [];
        draft.undertakingActs.push(stored);
      }, {
        type: UDT_EVENTS.NOTIFIED,
        entity: 'undertaking',
        entityId: ctx.undertaking.id,
        summary: acknowledgement === 'disputed'
          ? 'The counterparty DISPUTED the closure report. The promise reads as disputed, never as met, until the record says otherwise.'
          : 'The counterparty’s reply to a closure report was recorded.'.slice(0, 300),
      });
      return saved({ actId: id, acknowledgement });
    },

    /**
     * Extend — move the due day. A cap is a refusal with a printed reason,
     * never a warning; an external instrument is not the entity's alone to move.
     */
    undertakingExtend(input = {}) {
      const check = seatFor(UDT_RIGHTS.REPORT);
      if (!check.ok) return check;
      const ctx = undertakingContext(check, input.undertakingId);
      if (!ctx.ok) return ctx;
      if (ctx.row.declaredById !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the executive who declared this undertaking moves its due day.', 'undertakingId', REFUSAL(R.notDeclarant));
      }
      if (ctx.row.reported) return fail('This undertaking is already reported. Its due day is history.', 'undertakingId', REFUSAL(R.alreadyClosed));
      if (ctx.row.daysRemaining < 0) {
        return fail(`The due day (${ctx.row.effectiveDueOn}) has passed. A lapsed promise is not un-lapsed by moving the date — the counterparty already knows it was late. Record the report, or record the failure honestly.`, 'newDueOn', REFUSAL(R.extensionAfterDue));
      }
      const newDueOn = udtDay(input.newDueOn);
      if (!newDueOn) return fail('Give the real calendar day the promise moves to.', 'newDueOn', REFUSAL(R.dueOutOfRange));
      if (newDueOn <= ctx.row.effectiveDueOn) {
        return fail(`An extension must move the due day forward from ${ctx.row.effectiveDueOn}.`, 'newDueOn', REFUSAL(R.extensionNotForward));
      }
      const horizon = dayDiff(check.today, newDueOn);
      if (horizon > L.horizonMaxDays) {
        return fail(`An extension more than ${L.horizonMaxDays} days out is not a dated commitment.`, 'newDueOn', REFUSAL(R.extensionBeyondHorizon));
      }
      const counterpartyAgreementRef = input.counterpartyAgreementRef === undefined || input.counterpartyAgreementRef === null || input.counterpartyAgreementRef === ''
        ? null
        : udtText(input.counterpartyAgreementRef, L.refMax + 20);
      if (input.counterpartyAgreementRef !== undefined && input.counterpartyAgreementRef !== null && input.counterpartyAgreementRef !== '' && String(counterpartyAgreementRef).length < L.refMin) {
        return fail(`Name the counterparty’s written agreement in at least ${L.refMin} characters, or leave it blank.`, 'counterpartyAgreementRef', REFUSAL(R.unreadable));
      }
      if (udtInstrumentIsExternal(ctx.undertaking.instrument) && !counterpartyAgreementRef) {
        return fail('This instrument’s date is not the entity’s alone to move. An extension on a licence condition, an undertaking or a covenant is refused without the counterparty’s own recorded agreement — the register will not record a unilateral postponement of a promise to a supervisor.', 'counterpartyAgreementRef', REFUSAL(R.extensionRefusedExternal));
      }
      const reason = udtText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail(`Say why the date is moving, in at least ${L.textMin} characters.`, 'reason', REFUSAL(R.unreadable));
      const extendedAt = actInstant(input, 'extendedAt', { notBefore: ctx.undertaking.createdAt });
      if (typeof extendedAt !== 'string') return extendedAt;

      const existingActs = loadedActs(ctx.undertakings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('uda');
      const act = {
        id, undertakingId: ctx.undertaking.id, actorId: check.actorId, kind: 'extend',
        previousDueOn: ctx.row.effectiveDueOn, newDueOn, reason,
        counterpartyAgreementRef: counterpartyAgreementRef ? counterpartyAgreementRef.slice(0, L.refMax) : null,
        extendedAt,
      };
      const loaded = normalizeUndertakingActs([...existingActs, act], ctx.undertakings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The extension could not be stored as an act this register can read back. Nothing was saved.', 'reason', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.undertakingActs = Array.isArray(draft.undertakingActs) ? draft.undertakingActs : [];
        draft.undertakingActs.push(stored);
      }, {
        type: UDT_EVENTS.EXTENDED,
        entity: 'undertaking',
        entityId: ctx.undertaking.id,
        summary: `The due day on an undertaking moved from ${ctx.row.effectiveDueOn} to ${newDueOn}${counterpartyAgreementRef ? ' with the counterparty’s recorded agreement' : ' under an instrument the entity may move internally'}.`.slice(0, 300),
      });
      return saved({ actId: id, newDueOn });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    undertakingScan() {
      const check = seatFor(UDT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: UDT_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${UDT_ROUTE}#${UDT_RULE_ID}`,
        summary: `Undertaking register scan requested (${UDT_RULE_ID}): untested deliverables, confirmed-but-unreported promises and lapsed due days re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    undertakingReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildUndertakingReport(store.state, { now: check.at, seat: check.seat });
    },

    undertakingAttentionCount() {
      const { seat, at } = readSeat();
      return undertakingAttentionCount(store.state, { now: at, seat });
    },

    /**
     * Dialog support: the people a declarer may name as line holders, the
     * closed vocabularies the dialogs must not guess, and the lines still short
     * of a holder — so no dialog invents a holder or a word.
     */
    undertakingCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const people = rows('people')
        .filter((row) => row && row.id && isActive(row))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || row.level || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return {
        ok: true,
        people,
        counterpartyKinds: [...UDT_COUNTERPARTY_KINDS],
        instruments: [...UDT_INSTRUMENTS],
        verdicts: [...UDT_VERDICT_KEYS],
        acknowledgements: [...UDT_ACKNOWLEDGEMENT_KEYS],
      };
    },
  };
}

export default createUndertakingActions;
