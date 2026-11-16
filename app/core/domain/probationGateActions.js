/**
 * app/core/domain/probationGateActions.js — the seat-checked commands of the
 * Probation Confirmation Gate Register (ADR-0233).
 *
 * FOUR human acts, one declaration, one window act and a scan, and nothing
 * else: DECLARE a gate on a joiner, ASK a declared line's holder for evidence,
 * SUBMIT dated evidence on a line, EXTEND the window under the declared
 * instrument, DECIDE confirm or end, and NOTIFY the joiner in writing. Every
 * state, flag, count and rate is re-derived on read by `probationGate.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Declaration is FIRST-PERSON and it is the HOME MANAGER'S act: the acting
 *    seat must BE the person the joiner reports to on the home line. The
 *    synthetic workspace leader never opens a gate, and neither does the
 *    undeclared operator view. No gate is inferred from a start date, a
 *    contract record or an onboard flow.
 *  - ONE OPEN GATE PER JOINER. A second overlapping window for the same joiner
 *    is refused — two open gates on one person would be two answers to one
 *    question, and the register does not split a person in two.
 *  - THE DECLARED TERMS MUST BE INTERNALLY CONSISTENT. A window that exceeds
 *    the legal cap the same declaration names is refused, never repaired: an
 *    out-of-cap probation is a defect in the terms, and recording it silently
 *    would endorse them.
 *  - ASK is the confirming manager's act, addressed to the holder of one of
 *    the joiner's declared matrix lines. One ask per line; a second is refused
 *    and the first stands. An ask that comes due after the window closed
 *    cannot inform the decision, so it is refused.
 *  - SUBMIT is the holder of the line the evidence is about: the confirming
 *    manager submits the home line's evidence, and a matrix line's evidence is
 *    that line's own holder's act. A peer cannot answer for somebody else's
 *    line.
 *  - EXTEND is refused unless the declared instrument allows it, refused if it
 *    does not move the window forward, refused past the window day, and
 *    refused if it would carry the total span past the declared cap — a cap is
 *    a refusal with a printed reason, never a warning.
 *  - DECIDE is the confirming manager's act, once: confirm or end. A
 *    confirmation is refused while any declared line of the joiner carries no
 *    evidence — and where an extension preceded the decision, the evidence
 *    must be dated inside the extended window, because evidence that predates
 *    the extension says nothing about it. An END needs no evidence, because
 *    ending is the urgent path and a process that forces evidence-gathering
 *    before it can stop a clearly-failing start would protect the process and
 *    not the people. A decision dated after the window closed is refused: the
 *    short-notice lever is gone with the window.
 *  - NOTIFY is the confirming manager's act, once, and never before the
 *    decision it answers.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildProbationGates } from './probationGate.js';
import { buildProbationReport, probationGateAttentionCount } from './probationGateReport.js';
import {
  pbgDay,
  pbgInstant,
  pbgText,
  normalizeProbationActs,
  normalizeProbationGates,
} from './probationGateSchema.js';
import {
  PBG_EVENTS,
  PBG_INSTRUMENT_KEYS,
  PBG_LIMITS as L,
  PBG_REFUSALS as R,
  PBG_RECOMMENDATION_KEYS,
  PBG_RIGHTS,
  PBG_ROUTE,
  PBG_RULE_ID,
} from './probationRegistry.js';

const REFUSAL = (key) => `probation-gate:${key}`;
const NOT_SEATED = 'No seat is resolved. Declare a valid seat before acting; the probation register is never changed from an unknown operating position.';
const DAY_MS = 86400000;
/** The day an ISO instant falls on. */
const dayOf = (iso) => String(iso || '').slice(0, 10);

const dayDiff = (fromDay, toDay) => (
  (Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / DAY_MS
);

export function createProbationGateActions(store, { now, idFactory }) {
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
      return fail('A probation gate is a first-person act of a named person. The undeclared operator view cannot speak for one — declare a seat on the Altitude Lens.', null, REFUSAL(R.noActor));
    }
    const person = rows('people').find((row) => row && row.id === actorId) || null;
    if (!person) return fail('This seat is not a person on the roster. A gate is opened by a named person, and nothing is opened in their place.', null, REFUSAL(R.noActor));
    return { ok: true, seat, at, cfg, actorId, person, today: dayKey(at), built };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg, built };
  }

  /** Reads re-prove the right inside the action; they are not free-form. */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(PBG_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  const rosterPerson = (id) => {
    const key = pbgText(id, 120);
    if (!key) return null;
    return rows('people').find((row) => row && row.id === key) || null;
  };
  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  const reach = (seat, id) => Boolean(seat.fullAccess
    || (seat.scope && seat.scope.has(id))
    || (seat.lineScope && seat.lineScope.has(id)));

  /** The loaded rows the kernel itself would read — the same gate, before writing. */
  const loadedGates = () => normalizeProbationGates(rows('probationGates'), []);
  const loadedActs = (gates) => normalizeProbationActs(rows('probationActs'), gates, []);

  function gateContext(check, gateId) {
    const key = pbgText(gateId, 120);
    if (!key) return fail('Name the gate.', 'gateId', REFUSAL(R.unknownGate));
    const gates = loadedGates();
    const gate = gates.find((row) => row.id === key) || null;
    if (!gate) return fail('That gate is not on this register.', 'gateId', REFUSAL(R.unknownGate));
    const report = buildProbationGates(store.state, { now: check.at });
    const row = report.rows.find((candidate) => candidate.id === gate.id) || null;
    if (!row) return fail('That gate cannot be read back from the record. Nothing was saved.', 'gateId', REFUSAL(R.unreadable));
    return { ok: true, gate, row, gates, report };
  }

  /**
   * The moment an act is dated: the declared value where one is given (this is
   * how a back-dated paper record is entered honestly, and how the test suite
   * pins a timeline), and the acting clock's own instant otherwise. A value
   * that is present but unreadable is refused — an unparseable timestamp is
   * never silently replaced by "now".
   */
  function actInstant(input, field, { notBefore = null } = {}) {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === '') return clock().toISOString();
    const at = pbgInstant(raw);
    if (!at) return fail(`Give a real calendar moment for the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`, field, REFUSAL(R.unreadable));
    if (Date.parse(at) > clock().getTime() + 5 * 60 * 1000) {
      return fail('An act cannot be dated after the moment it is recorded.', field, REFUSAL(R.futureDated));
    }
    if (notBefore && Date.parse(at) < Date.parse(notBefore)) {
      return fail('An act cannot predate the record it answers.', field, REFUSAL(R.beforeDeclared));
    }
    return at;
  }

  /**
   * The active declared matrix lines of one joiner, covering `day`, EXCLUDING
   * any line that runs to the confirming manager themselves: a reportingLine
   * row that restates the home line carries no additional duty — the manager
   * cannot ask themselves, and counting it would let one person's evidence
   * stand for two lines.
   */
  function joinerMatrixLines(joinerId, day, confirmingManagerId) {
    return rows('reportingLines')
      .filter((line) => line && line.status === 'active' && line.personId === joinerId
        && (!confirmingManagerId || !line.managerId || line.managerId !== confirmingManagerId)
        && (!line.fromISO || String(line.fromISO).slice(0, 10) <= day)
        && (!line.toISO || String(line.toISO).slice(0, 10) >= day));
  }

  return {
    /**
     * Declare a gate. First-person: the acting seat must BE the joiner's home
     * manager. The declared terms — window, instrument, cap, extension
     * permission — are never inferred and never edited afterwards.
     */
    probationGateDeclare(input = {}) {
      const check = seatFor(PBG_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const joiner = rosterPerson(input.joinerId);
      if (!joiner) return fail('Name the joiner this gate is about — a person on this roster. No gate is opened about a person the workspace cannot see.', 'joinerId', REFUSAL(R.joinerUnknown));
      if (!isActive(joiner)) return fail('The named joiner is archived on the roster. A probation window is a term of an active engagement.', 'joinerId', REFUSAL(R.joinerArchived));
      if (!joiner.managerId || joiner.managerId === LEADER_ID) {
        return fail('The joiner’s home line names no human manager. The gate is opened by the manager who will answer for the decision, and there is nobody to answer here.', 'joinerId', REFUSAL(R.joinerWithoutManager));
      }
      if (joiner.managerId !== check.actorId) {
        return fail('Only the joiner’s home manager opens the gate. This seat does not hold the joiner’s home line — the person the joiner reports to is the person who answers for the decision.', 'joinerId', REFUSAL(R.notHomeManager));
      }

      const startOn = pbgDay(input.startOn);
      if (!startOn) return fail('Give the real calendar day the probation window starts.', 'startOn', REFUSAL(R.unreadable));
      const endOn = pbgDay(input.endOn);
      if (!endOn) return fail('Give the real calendar day the probation window ends — the day the decision is owed by.', 'endOn', REFUSAL(R.unreadable));
      if (endOn <= startOn) return fail('The window must end after it starts.', 'endOn', REFUSAL(R.endBeforeStart));
      const spanDays = dayDiff(startOn, endOn);
      if (spanDays < L.spanMinDays || spanDays > L.spanMaxDays) {
        return fail(`The declared window must be between ${L.spanMinDays} and ${L.spanMaxDays} days.`, 'endOn', REFUSAL(R.spanOutOfRange));
      }
      let legalCapDays = null;
      if (input.legalCapDays !== undefined && input.legalCapDays !== null && input.legalCapDays !== '') {
        legalCapDays = Number(input.legalCapDays);
        if (!Number.isInteger(legalCapDays) || legalCapDays < L.capMinDays || legalCapDays > L.capMaxDays) {
          return fail(`The declared legal cap must be a whole number between ${L.capMinDays} and ${L.capMaxDays} days — or left out entirely.`, 'legalCapDays', REFUSAL(R.capOutOfRange));
        }
        if (spanDays > legalCapDays) {
          return fail(`The declared window (${spanDays} days) exceeds the legal cap this declaration itself names (${legalCapDays} days). An out-of-cap probation is a defect in the terms: fix the terms or the cap — the register will not record the pair as given.`, 'legalCapDays', REFUSAL(R.spanBeyondCap));
        }
      }
      let noticeDays = null;
      if (input.noticeDays !== undefined && input.noticeDays !== null && input.noticeDays !== '') {
        noticeDays = Number(input.noticeDays);
        if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) {
          return fail('The declared notice inside the window must be a whole number of days, or left out entirely.', 'noticeDays', REFUSAL(R.capOutOfRange));
        }
      }

      const instrument = PBG_INSTRUMENT_KEYS.includes(input.instrument) ? input.instrument : null;
      if (!instrument) return fail('Say which instrument sets this window — a closed list, because a statutory window and a contract term carry different ceilings and different consequences.', 'instrument', REFUSAL(R.unreadable));
      const instrumentRef = pbgText(input.instrumentRef, L.refMax + 20);
      if (instrumentRef.length < L.refMin) return fail(`Name the instrument — the contract clause, the agreement section, the appointment letter — in at least ${L.refMin} characters.`, 'instrumentRef', REFUSAL(R.unreadable));
      const expectations = pbgText(input.expectations, L.textMax);
      if (expectations.length < L.textMin) {
        return fail(`State what this window is for in at least ${L.textMin} characters — what the joiner must demonstrate, in the words every line\'s evidence will be read against.`, 'expectations', REFUSAL(R.unreadable));
      }
      const roleLabel = pbgText(input.roleLabel, L.refMax);
      const allowsExtension = input.allowsExtension === true;

      const existing = loadedGates();
      const openOverlap = existing.find((row) => row.joinerId === joiner.id);
      if (openOverlap) {
        return fail(`This joiner already carries a probation gate (${openOverlap.id}, window ${openOverlap.startOn} → ${openOverlap.endOn}). One open gate per joiner: two open windows would be two answers to one question.`, 'joinerId', REFUSAL(R.alreadyOpen));
      }
      if (existing.length >= L.gates) return fail('The gate register is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('pbg');
      const createdAt = check.at.toISOString();
      const candidate = {
        id,
        joinerId: joiner.id,
        roleLabel,
        startOn,
        endOn,
        expectations,
        instrument,
        instrumentRef: instrumentRef.slice(0, L.refMax),
        allowsExtension,
        legalCapDays,
        noticeDays,
        declaredById: check.actorId,
        createdAt,
      };
      const loaded = normalizeProbationGates([...existing, candidate], []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The gate could not be stored as a row this register can read back. Nothing was saved.', 'expectations', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.probationGates = Array.isArray(draft.probationGates) ? draft.probationGates : [];
        draft.probationGates.push(stored);
      }, {
        type: PBG_EVENTS.DECLARED,
        entity: 'probation-gate',
        entityId: id,
        summary: `Probation gate opened for a joiner: window ${stored.startOn} → ${stored.endOn} under the declared ${stored.instrument}. The decision is owed before ${stored.endOn}; evidence is owed from every declared line.`.slice(0, 300),
      });
      return saved({ gateId: id, joinerId: joiner.id });
    },

    /**
     * Ask — the confirming manager puts the evidence duty to the holder of one
     * of the joiner's declared matrix lines, by a day. One ask per line.
     */
    probationGateAsk(input = {}) {
      const check = seatFor(PBG_RIGHTS.ASK);
      if (!check.ok) return check;
      const ctx = gateContext(check, input.gateId);
      if (!ctx.ok) return ctx;
      if (ctx.row.closed) return fail('This gate already carries its decision. Nothing more is owed on it.', 'gateId', REFUSAL(R.alreadyDecided));
      if (ctx.row.declaredById !== check.actorId) {
        return fail('Only the confirming manager puts the evidence duty to a line. The gate is theirs, and so is the ask.', 'gateId', REFUSAL(R.notDeclarant));
      }
      const lineId = pbgText(input.lineId, 120);
      if (!lineId) return fail('Name the declared reporting line this ask is addressed to.', 'lineId', REFUSAL(R.lineUnresolved));
      const line = joinerMatrixLines(ctx.gate.joinerId, check.today, ctx.gate.declaredById).find((row) => row.id === lineId) || null;
      if (!line) return fail('That line is not an active declared reporting line of this joiner today (a line back to the confirming manager is the home line, not a duty). The evidence duty sits on the joiner’s other declared lines only.', 'lineId', REFUSAL(R.notJoinersLine));
      if (!line.managerId || line.managerId === LEADER_ID) {
        return fail('That line names no human manager to ask. Independence cannot be manufactured, so nothing was asked.', 'lineId', REFUSAL(R.lineUnresolved));
      }
      if (!isActive(rosterPerson(line.managerId))) {
        return fail('The holder of that line is archived on the roster. Nothing was asked.', 'lineId', REFUSAL(R.joinerArchived));
      }
      const asked = ctx.row.lines.find((entry) => entry.lineKind === 'matrix' && entry.lineId === lineId && entry.askCount);
      if (asked) {
        return fail('This line has already been asked. A second ask never overwrites the first — the duty stands.', 'lineId', REFUSAL(R.alreadyAsked));
      }
      const dueOn = pbgDay(input.dueOn);
      if (!dueOn) return fail('Give a real calendar day the evidence is owed by.', 'dueOn', REFUSAL(R.askDueOutOfRange));
      if (dueOn < check.today) return fail('The evidence cannot be owed on a day that has already passed.', 'dueOn', REFUSAL(R.askDueOutOfRange));
      if (dueOn > ctx.row.effectiveEndOn) {
        return fail(`An ask that comes due after the window closed (${ctx.row.effectiveEndOn}) cannot inform the decision. Ask for the evidence inside the window.`, 'dueOn', REFUSAL(R.askDueOutOfRange));
      }
      const note = pbgText(input.note, L.textMax);
      if (note.length < L.textMin) return fail(`Say what the line's evidence should cover, in at least ${L.textMin} characters — the ask is the brief, and the brief is what makes the evidence comparable across lines.`, 'note', REFUSAL(R.unreadable));
      const askedAt = actInstant(input, 'askedAt', { notBefore: ctx.gate.createdAt });
      if (typeof askedAt !== 'string') return askedAt;

      const existingActs = loadedActs(ctx.gates);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('pba');
      const act = {
        id, gateId: ctx.gate.id, actorId: check.actorId, kind: 'ask',
        lineKind: 'matrix', lineId, lineHolderId: line.managerId,
        dueOn, note, askedAt,
      };
      const loaded = normalizeProbationActs([...existingActs, act], ctx.gates, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The ask could not be stored as an act this register can read back. Nothing was saved.', 'note', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.probationActs = Array.isArray(draft.probationActs) ? draft.probationActs : [];
        draft.probationActs.push(stored);
      }, {
        type: PBG_EVENTS.ASKED,
        entity: 'probation-gate',
        entityId: ctx.gate.id,
        summary: `The evidence duty was put to the holder of a declared matrix line on a probation gate; evidence is owed by ${dueOn}. The holder answers with their own dated evidence, never with a form.`.slice(0, 300),
      });
      return saved({ actId: id, lineId, dueOn });
    },

    /**
     * Submit — the holder of the line the evidence is about records dated
     * evidence in words and a closed-vocabulary recommendation. The home
     * line's evidence is the confirming manager's own submission.
     */
    probationGateSubmit(input = {}) {
      const check = seatFor(PBG_RIGHTS.SUBMIT);
      if (!check.ok) return check;
      const ctx = gateContext(check, input.gateId);
      if (!ctx.ok) return ctx;
      if (ctx.row.closed) return fail('This gate already carries its decision. Its evidence record is closed.', 'gateId', REFUSAL(R.alreadyDecided));
      const lineKind = input.lineKind === 'home' || input.lineKind === 'matrix' ? input.lineKind : null;
      if (!lineKind) return fail('Say which line this evidence is about: the joiner’s home line, or one of their declared matrix lines.', 'lineKind', REFUSAL(R.unreadable));

      let lineRow = null;
      if (lineKind === 'home') {
        if (ctx.row.declaredById !== check.actorId) {
          return fail('The home line’s evidence is the confirming manager’s own act. Only the manager who opened this gate submits it.', 'lineKind', REFUSAL(R.notDeclarant));
        }
      } else {
        const lineId = pbgText(input.lineId, 120);
        if (!lineId) return fail('Name the declared reporting line this evidence is about.', 'lineId', REFUSAL(R.lineUnresolved));
        lineRow = joinerMatrixLines(ctx.gate.joinerId, check.today, ctx.gate.declaredById).find((row) => row.id === lineId) || null;
        if (!lineRow) return fail('That line is not an active declared reporting line of this joiner today. Evidence is recorded on the joiner’s own lines only.', 'lineId', REFUSAL(R.notJoinersLine));
        if (lineRow.managerId !== check.actorId) {
          return fail('Only the holder of that line submits its evidence. A peer cannot answer for somebody else’s line.', 'lineId', REFUSAL(R.notLineManager));
        }
      }

      const observedText = pbgText(input.observedText, L.textMax);
      if (observedText.length < L.textMin) return fail(`Record what you actually observed, in at least ${L.textMin} characters — dated work, named situations, what was seen. An impression is not evidence.`, 'observedText', REFUSAL(R.unreadable));
      const recommendation = PBG_RECOMMENDATION_KEYS.includes(input.recommendation) ? input.recommendation : null;
      if (!recommendation) return fail('Record one of the three words — support, concern, or cannot say. They are different facts, and the register never averages them.', 'recommendation', REFUSAL(R.unreadable));
      const submittedAt = actInstant(input, 'submittedAt', { notBefore: ctx.gate.createdAt });
      if (typeof submittedAt !== 'string') return submittedAt;

      const existingActs = loadedActs(ctx.gates);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('pba');
      const act = {
        id, gateId: ctx.gate.id, actorId: check.actorId, kind: 'submit',
        lineKind,
        lineId: lineKind === 'matrix' ? lineRow.id : null,
        lineHolderId: lineKind === 'matrix' ? lineRow.managerId : null,
        observedText,
        recommendation,
        submittedAt,
      };
      const loaded = normalizeProbationActs([...existingActs, act], ctx.gates, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The evidence could not be stored as an act this register can read back. Nothing was saved.', 'observedText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.probationActs = Array.isArray(draft.probationActs) ? draft.probationActs : [];
        draft.probationActs.push(stored);
      }, {
        type: PBG_EVENTS.SUBMITTED,
        entity: 'probation-gate',
        entityId: ctx.gate.id,
        summary: `Dated evidence was recorded on one line of a probation gate, reading “${recommendation}”. Submissions append; the latest is the line’s reading.`.slice(0, 300),
      });
      return saved({ actId: id, recommendation });
    },

    /**
     * Extend — move the window forward under the declared instrument. It
     * closes nothing: after an extension the evidence duty runs again against
     * the new window day, and the final decision is still owed.
     */
    probationGateExtend(input = {}) {
      const check = seatFor(PBG_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = gateContext(check, input.gateId);
      if (!ctx.ok) return ctx;
      if (ctx.row.closed) return fail('This gate already carries its final decision. An extension cannot follow a closure.', 'gateId', REFUSAL(R.alreadyDecided));
      if (ctx.row.declaredById !== check.actorId) {
        return fail('Only the confirming manager extends the window. The gate is theirs, and so is the extension.', 'gateId', REFUSAL(R.notDeclarant));
      }
      if (!ctx.gate.allowsExtension) {
        return fail('The declared instrument does not allow an extension. An extension the terms do not allow is not a decision the register can carry — the instrumentRef names the clause that governs.', 'gateId', REFUSAL(R.extensionRefusedByInstrument));
      }
      const newEndOn = pbgDay(input.newEndOn);
      if (!newEndOn) return fail('Give the real calendar day the extended window ends.', 'newEndOn', REFUSAL(R.extensionNotForward));
      if (newEndOn <= ctx.row.effectiveEndOn) {
        return fail(`An extension must move the window forward. The window in force ends on ${ctx.row.effectiveEndOn}; the extension would end on ${newEndOn}.`, 'newEndOn', REFUSAL(R.extensionNotForward));
      }
      if (ctx.gate.legalCapDays !== null) {
        const totalSpan = dayDiff(ctx.gate.startOn, newEndOn);
        if (totalSpan > ctx.gate.legalCapDays) {
          return fail(`The extension would carry the total probation span to ${totalSpan} days, past the declared legal cap of ${ctx.gate.legalCapDays}. A cap is a refusal with a reason, never a warning.`, 'newEndOn', REFUSAL(R.extensionBeyondCap));
        }
      }
      const reason = pbgText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail(`Say why the window is moving, in at least ${L.textMin} characters — what the extra time is for, and what will be different inside it. An extension without a reason is procrastination with a date.`, 'reason', REFUSAL(R.unreadable));
      const extendedAt = actInstant(input, 'extendedAt', { notBefore: ctx.gate.createdAt });
      if (typeof extendedAt !== 'string') return extendedAt;
      if (dayOf(extendedAt) > ctx.row.effectiveEndOn) {
        return fail(`The window closed on ${ctx.row.effectiveEndOn}. An extension after the window is a new contract term, not a probation decision — it is refused here rather than recorded as one.`, 'extendedAt', REFUSAL(R.windowClosed));
      }

      const existingActs = loadedActs(ctx.gates);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('pba');
      const act = {
        id, gateId: ctx.gate.id, actorId: check.actorId, kind: 'extend',
        lineKind: null, lineId: null, lineHolderId: null,
        reason, newEndOn, extendedAt,
      };
      const loaded = normalizeProbationActs([...existingActs, act], ctx.gates, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The extension could not be stored as an act this register can read back. Nothing was saved.', 'reason', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.probationActs = Array.isArray(draft.probationActs) ? draft.probationActs : [];
        draft.probationActs.push(stored);
      }, {
        type: PBG_EVENTS.DECIDED,
        entity: 'probation-gate',
        entityId: ctx.gate.id,
        summary: `A probation window was extended to ${newEndOn} under the declared instrument. It closes nothing: evidence is owed again inside the extended window, and the final decision is still owed.`.slice(0, 300),
      });
      return saved({ actId: id, effectiveEndOn: newEndOn });
    },

    /**
     * Decide — the one final decision: confirm or end. A confirmation is
     * refused while any declared line carries no evidence. An END is allowed
     * without evidence, because ending is the urgent path.
     */
    probationGateDecide(input = {}) {
      const check = seatFor(PBG_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = gateContext(check, input.gateId);
      if (!ctx.ok) return ctx;
      if (ctx.row.closed) return fail('This gate already carries its final decision. A second decision is refused — a changed decision is a new human act on the decision log, not an edit of this one.', 'gateId', REFUSAL(R.alreadyDecided));
      if (ctx.row.declaredById !== check.actorId) {
        return fail('Only the confirming manager decides this gate. The decision carries their name, and nobody else’s.', 'gateId', REFUSAL(R.notDeclarant));
      }
      const decision = input.decision === 'confirm' || input.decision === 'end' ? input.decision : null;
      if (!decision) return fail('Record “confirm” or “end” — a closed list, so the counts mean one thing. An extension is its own act, not a decision.', 'decision', REFUSAL(R.unreadable));
      const reason = pbgText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail(`Say what the decision rests on, in at least ${L.textMin} characters — the evidence read, the weight given to each line, and what was decided.`, 'reason', REFUSAL(R.unreadable));
      const decidedAt = actInstant(input, 'decidedAt', { notBefore: ctx.gate.createdAt });
      if (typeof decidedAt !== 'string') return decidedAt;
      const decidedDay = dayOf(decidedAt);
      if (decidedDay > ctx.row.effectiveEndOn) {
        return fail(`The window closed on ${ctx.row.effectiveEndOn}. A decision dated after it is refused: the short-notice lever the window carried is gone, and recording this here would print a right nobody had. Record what actually happens next in the ordinary employment flow.`, 'decidedAt', REFUSAL(R.windowClosed));
      }

      if (decision === 'confirm') {
        // The evidence rule is read against the lines that existed on the
        // DECISION day, because a line declared after the decision cannot
        // retroactively make it incomplete, and a line withdrawn after it
        // cannot retroactively excuse it.
        const decisionLines = [
          { kind: 'home', id: null },
          ...joinerMatrixLines(ctx.gate.joinerId, decidedDay, ctx.gate.declaredById).map((row) => ({ kind: 'matrix', id: row.id })),
        ];
        const submittedActs = loadedActs(ctx.gates).filter((act) => act.gateId === ctx.gate.id && act.kind === 'submit');
        const latestFor = (kind, id) => submittedActs
          .filter((act) => act.lineKind === kind && (kind === 'home' || act.lineId === id))
          .map((act) => dayOf(act.at))
          .sort()
          .pop() || null;
        const missing = decisionLines.filter((line) => {
          const latest = latestFor(line.kind, line.id);
          if (!latest) return true;
          if (latest < ctx.gate.startOn) return true;
          if (ctx.row.extendedOn && latest < ctx.row.extendedOn) return true;
          return latest > decidedDay;
        });
        if (missing.length) {
          const names = missing.map((line) => (line.kind === 'home' ? 'the home line' : `line ${line.id}`)).join(', ');
          return fail(`A confirmation must rest on evidence from every declared line of the joiner that existed on the decision day, dated inside the window in force. Missing or stale: ${names}. The register refuses the confirmation rather than recording one line’s word as the whole record.`, 'decision', REFUSAL(R.confirmEvidenceMissing));
        }
      }

      const existingActs = loadedActs(ctx.gates);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('pba');
      const act = {
        id, gateId: ctx.gate.id, actorId: check.actorId, kind: 'decide',
        lineKind: null, lineId: null, lineHolderId: null,
        decision, reason, decidedAt,
      };
      const loaded = normalizeProbationActs([...existingActs, act], ctx.gates, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The decision could not be stored as an act this register can read back. Nothing was saved.', 'reason', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.probationActs = Array.isArray(draft.probationActs) ? draft.probationActs : [];
        draft.probationActs.push(stored);
      }, {
        type: PBG_EVENTS.DECIDED,
        entity: 'probation-gate',
        entityId: ctx.gate.id,
        summary: decision === 'confirm'
          ? 'A joiner was CONFIRMED on evidence from every declared reporting line of the gate. The written notification is still owed until it is recorded.'
          : 'A probation gate was decided END within the window’s short notice. The written notification is still owed until it is recorded.'.slice(0, 300),
      });
      return saved({ actId: id, decision });
    },

    /**
     * Notify — record that the outcome was communicated to the joiner in
     * writing. Decided is not told; the duty closes only on this act.
     */
    probationGateNotify(input = {}) {
      const check = seatFor(PBG_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = gateContext(check, input.gateId);
      if (!ctx.ok) return ctx;
      if (!ctx.row.closed) return fail('There is no decision to notify. The joiner is told the outcome, and there is no outcome on the record yet.', 'gateId', REFUSAL(R.notifyBeforeDecision));
      if (ctx.row.declaredById !== check.actorId) {
        return fail('Only the confirming manager records the notification. The duty is theirs, and so is this act.', 'gateId', REFUSAL(R.notDeclarant));
      }
      if (ctx.row.notifiedOn) {
        return fail('The notification is already on the record. A second notification act is not a stronger duty.', 'gateId', REFUSAL(R.alreadyNotified));
      }
      const instrumentRef = pbgText(input.instrumentRef, L.refMax + 20);
      if (instrumentRef.length < L.refMin) return fail(`Name the written instrument — the letter, the email, the documented conversation — in at least ${L.refMin} characters.`, 'instrumentRef', REFUSAL(R.unreadable));
      const notifiedAt = actInstant(input, 'notifiedAt', { notBefore: `${ctx.row.decidedOn}T00:00:00.000Z` });
      if (typeof notifiedAt !== 'string') return notifiedAt;

      const existingActs = loadedActs(ctx.gates);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('pba');
      const act = {
        id, gateId: ctx.gate.id, actorId: check.actorId, kind: 'notify',
        lineKind: null, lineId: null, lineHolderId: null,
        instrumentRef: instrumentRef.slice(0, L.refMax), notifiedAt,
      };
      const loaded = normalizeProbationActs([...existingActs, act], ctx.gates, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The notification could not be stored as an act this register can read back. Nothing was saved.', 'instrumentRef', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.probationActs = Array.isArray(draft.probationActs) ? draft.probationActs : [];
        draft.probationActs.push(stored);
      }, {
        type: PBG_EVENTS.NOTIFIED,
        entity: 'probation-gate',
        entityId: ctx.gate.id,
        summary: 'The outcome of a probation gate was recorded as communicated to the joiner in writing. Decided is now told.'.slice(0, 300),
      });
      return saved({ actId: id, notifiedOn: dayOf(notifiedAt) });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    probationGateScan() {
      const check = seatFor(PBG_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: PBG_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${PBG_ROUTE}#${PBG_RULE_ID}`,
        summary: `Probation gate register scan requested (${PBG_RULE_ID}): overdue evidence asks, windows closing and lapsed gates re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    probationGateReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildProbationReport(store.state, { now: check.at, seat: check.seat });
    },

    probationGateAttentionCount() {
      const { seat, at } = readSeat();
      return probationGateAttentionCount(store.state, { now: at, seat });
    },

    /**
     * Dialog support: the active joiners this seat may open a gate for (their
     * direct reports without an open gate), the declared matrix lines a gate's
     * ask may address, and the reason vocabulary — so no dialog guesses a line.
     */
    probationGateCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const today = dayKey(check.at);
      const self = check.seat.nodeId || check.seat.id || null;
      const gates = loadedGates();
      const openByJoiner = new Set(gates.map((row) => row.joinerId));
      const personName = (id) => {
        const person = rosterPerson(id);
        return person ? (person.name || id) : id;
      };
      const joiners = rows('people')
        .filter((row) => row && row.id && isActive(row) && row.managerId === self && !openByJoiner.has(row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || row.level || '', startDate: row.startDate || null }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const joinerIds = new Set(joiners.map((row) => row.id));
      const lines = rows('reportingLines')
        .filter((line) => line && line.status === 'active'
          && (!line.fromISO || String(line.fromISO).slice(0, 10) <= today)
          && (!line.toISO || String(line.toISO).slice(0, 10) >= today)
          && joinerIds.has(line.personId))
        .map((line) => ({
          id: line.id,
          personId: line.personId,
          personName: personName(line.personId),
          managerId: line.managerId,
          managerName: personName(line.managerId),
          kind: line.kind || 'line',
        }))
        .sort((a, b) => String(a.personName).localeCompare(String(b.personName)) || String(a.id).localeCompare(String(b.id)));
      return { ok: true, joiners, lines, recommendations: PBG_RECOMMENDATION_KEYS };
    },
  };
}

export default createProbationGateActions;
