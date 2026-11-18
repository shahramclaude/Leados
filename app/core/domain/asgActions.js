/**
 * app/core/domain/asgActions.js — the seat-checked commands of the Secondment
 * / Assignment Return & Handover Register (ADR-0262).
 *
 * FIVE human acts and a scan: DECLARE an assignment (person, two named sides,
 * start, declared return, terms instrument), DECLARE a duty cover (one duty,
 * one kind, named never inferred), RECORD a return decision (extend / return /
 * convert, with written rationale), RECORD the home line's consent to a
 * conversion, RECORD a handback on one side (with its evidence reference) —
 * plus re-declaring the conventions and the explicit scan. Every state,
 * timeliness verdict and coverage gap is re-derived on read by `asg.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - An ASSIGNMENT whose return day is not after its start day is refused —
 *    that is not a window. A record whose person is one of its own sides, or
 *    whose sides are one hand, is refused as a nonsense record.
 *  - A RETURN DECISION needs a written rationale. A decision before the
 *    assignment began is refused (`assignment-not-started`) — a pre-start
 *    cancellation is an amendment to the declaration, not a return decision,
 *    and is outside this register's contract. Once the question is answered by
 *    a `return` or `convert`, a second answer is refused (`question-answered`).
 *  - An EXTEND must move the return day in force FORWARD, past both the day in
 *    force and the decided day (`no-forward-motion`). A `return` or `convert`
 *    carrying a new return day is refused.
 *  - A HOME CONSENT is only meaningful after a `convert` decision on the chain
 *    (`consent-without-convert`), and the consenting hand must BE the home
 *    manager or a hand proved STRICTLY ABOVE them on the live graph
 *    (`consent-hand`). The conversion never completes on another hand's word.
 *  - A HANDBACK needs its evidence reference (`missing-evidence`) and a return
 *    or convert decision before it (`handback-without-decision`); the receiving
 *    hand must be the named side's manager or a hand proved strictly above
 *    them (`handback-hand`). One side's word is not a handback.
 *  - Every write is narrowed to a seat that HOLDS at least one named side of
 *    the assignment (`side-not-held`), and every act on a side is narrowed to
 *    a seat that holds THAT side. Every write is run through the loader and
 *    the stored row is the row the loader returns — a write the loader would
 *    refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, ends an
 * assignment, moves `person.managerId`, infers coverage from an org chart,
 * re-dates a decision, or scores a person. The roster change a completed
 * transfer implies is a separate human act in the matrix module.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildAssignmentReport, asgAttentionCount } from './asg.js';
import {
  ASG_COVER_BY_KEY,
  ASG_DECISION_BY_KEY,
  ASG_EVENTS,
  ASG_LIMITS as L,
  ASG_REFUSALS,
  ASG_RIGHTS,
  ASG_SIDE_BY_KEY,
  ASG_SETTING_KEYS,
} from './asgRegistry.js';
import {
  asgDayKey,
  asgDutyLabel,
  asgInstant,
  asgRationale,
  asgShort,
  normalizeAsgActs,
  normalizeAsgAssignments,
  normalizeAsgCovers,
  normalizeAsgSettings,
} from './asgSchema.js';
import { returnDayLedger } from './asgMath.js';

const REFUSAL = (key) => `secondment:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createAsgActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /** A write result. The caller's own warning is MERGED with the persist error. */
  const saved = (extra = {}) => {
    const { warning: ownWarning, ...rest } = extra;
    const persistError = store.persistError || null;
    const warning = ownWarning && persistError ? `${ownWarning} ${persistError}` : (ownWarning || persistError);
    return { ...rest, saved: !persistError, warning, propagations: store.lastPropagations || [], ok: true };
  };

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('That seat is unresolved. Declare a valid seat before acting.', 'seat', REFUSAL('outside-seat'));
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason, 'seat', REFUSAL('no-right'));
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  function readCheck() {
    return seatFor(ASG_RIGHTS.READ);
  }

  /** The acting seat holds this named side: it IS the hand, or the hand is in its span. */
  function holdsSide(check, sideManagerId) {
    if (!sideManagerId) return false;
    if (check.seat.fullAccess) return true;
    if (check.actorId === sideManagerId) return true;
    if (check.seat.scope && check.seat.scope.has(sideManagerId)) return true;
    if (check.seat.lineScope && check.seat.lineScope.has(sideManagerId)) return true;
    return false;
  }

  /** Is `handId` the named manager themselves, or proved STRICTLY ABOVE them? */
  function isManagerOrAbove(handId, managerId) {
    if (!handId || !managerId) return false;
    if (handId === managerId) return true;
    try {
      const matrix = buildMatrix(store.state, { now: clock(), settings: settings() });
      const node = matrix?.chain?.nodes?.get(handId);
      if (!node) return false;
      const subtree = node.subtreeIds || [];
      return subtree.includes(managerId) && handId !== managerId;
    } catch {
      return false;
    }
  }

  function liveAssignment(assignmentId) {
    const assignments = normalizeAsgAssignments(rows('asgAssignments'), []);
    return assignments.find((a) => a.assignmentId === assignmentId) || null;
  }

  function chainFor(assignment) {
    const assignments = normalizeAsgAssignments(rows('asgAssignments'), []);
    const acts = normalizeAsgActs(rows('asgActs'), assignments, []);
    const mine = acts.filter((a) => a.assignmentId === assignment.assignmentId);
    const decisions = mine.filter((a) => a.kind === 'return-decision');
    return {
      acts: mine,
      ledger: returnDayLedger(assignment, decisions),
      finalDecision: decisions.find((d) => d.decisionKind !== 'extend') || null,
    };
  }

  /* ------------------------------------------------------------- assignment */

  function asgDeclareAssignment(input = {}) {
    const check = seatFor(ASG_RIGHTS.MANAGE);
    if (!check.ok) return check;
    const assignmentId = text(input.assignmentId || input.id, L.idMax) || idFactory();
    const personId = text(input.personId, L.idMax);
    const homeManagerId = text(input.homeManagerId, L.idMax);
    const hostManagerId = text(input.hostManagerId, L.idMax);
    const startDay = asgDayKey(input.startDay);
    const declaredReturnDay = asgDayKey(input.declaredReturnDay);
    const termsRef = asgShort(input.termsRef, L.termsMax);
    const note = text(input.note, L.noteMax);
    const recordedById = text(input.recordedById, L.idMax) || check.actorId;
    const recordedDay = check.today;
    const recordedAt = clock().toISOString();
    if (!personId || !homeManagerId || !hostManagerId || !startDay || !declaredReturnDay || !termsRef) {
      return fail('An assignment needs a person, both named sides, a start day, a declared return day and the written terms instrument.', 'assignment', REFUSAL('bad-assignment'));
    }
    if (declaredReturnDay <= startDay) {
      return fail('The declared return day must be strictly after the start day. That is not a window.', 'declaredReturnDay', REFUSAL('bad-window'));
    }
    if (homeManagerId === hostManagerId) {
      return fail('The two sides are the same hand. A secondment is a move between two lines.', 'hostManagerId', REFUSAL('sides-identical'));
    }
    if (personId === homeManagerId || personId === hostManagerId) {
      return fail('The person cannot be one of their own two sides.', 'personId', REFUSAL('person-is-side'));
    }
    if (!holdsSide(check, homeManagerId) && !holdsSide(check, hostManagerId)) {
      return fail('That seat holds neither named side of this assignment. A move between two lines is declared by a hand that holds one of them.', 'seat', REFUSAL('side-not-held'));
    }
    const existing = normalizeAsgAssignments(rows('asgAssignments'), []);
    if (existing.some((a) => a.assignmentId === assignmentId)) {
      return fail('An assignment with that reference already exists.', 'assignmentId', REFUSAL('duplicate-assignment'));
    }
    const candidate = { assignmentId, personId, homeManagerId, hostManagerId, startDay, declaredReturnDay, termsRef, note, recordedById, recordedDay, recordedAt };
    const warnings = [];
    const loaded = normalizeAsgAssignments([...existing, candidate], warnings);
    const stored = loaded.find((a) => a.assignmentId === assignmentId);
    if (!stored) return fail('That assignment could not be recorded as written.', 'assignment', REFUSAL('bad-assignment'));
    store.state.asgAssignments = loaded;
    store.state.settings = { ...settings(), ...normalizeAsgSettings(settings()) };
    store.commit?.(ASG_EVENTS.ASSIGNMENT_DECLARED, { assignmentId });
    return saved({ assignment: stored });
  }

  /* --------------------------------------------------------------- covers */

  function asgDeclareDutyCover(input = {}) {
    const check = seatFor(ASG_RIGHTS.MANAGE);
    if (!check.ok) return check;
    const assignmentId = text(input.assignmentId, L.idMax);
    const assignment = liveAssignment(assignmentId);
    if (!assignment) return fail('That assignment is not on the register.', 'assignmentId', REFUSAL('unknown-assignment'));
    if (!holdsSide(check, assignment.homeManagerId)) {
      return fail('Duty coverage is named by the HOME side. That seat does not hold the home line of this assignment.', 'seat', REFUSAL('side-not-held'));
    }
    const coverId = text(input.coverId || input.id, L.idMax) || idFactory();
    const dutyLabel = asgDutyLabel(input.dutyLabel);
    const coverKind = text(input.coverKind);
    const coverHandId = input.coverHandId === null || input.coverHandId === undefined || input.coverHandId === '' ? null : text(input.coverHandId, L.idMax);
    const note = text(input.note, L.noteMax);
    const declaredById = text(input.declaredById, L.idMax) || check.actorId;
    const declaredDay = asgDayKey(input.declaredDay) || check.today;
    const declaredAt = clock().toISOString();
    if (!dutyLabel || !ASG_COVER_BY_KEY[coverKind]) {
      return fail('A duty cover names one duty and one of: named cover, retained by home, or uncovered.', 'cover', REFUSAL('bad-cover'));
    }
    if (coverKind === 'named-cover' && !coverHandId) {
      return fail('A named cover names the hand that carries the duty. Coverage is never inferred from the org chart.', 'coverHandId', REFUSAL('bad-cover'));
    }
    if (coverKind !== 'named-cover' && coverHandId) {
      return fail('Only a named cover carries a cover hand.', 'coverHandId', REFUSAL('bad-cover'));
    }
    if (declaredDay > check.today) return fail('The declared day cannot be in the future.', 'declaredDay', REFUSAL('future-day'));
    const existing = normalizeAsgCovers(rows('asgCovers'), normalizeAsgAssignments(rows('asgAssignments'), []), []);
    if (existing.some((c) => c.coverId === coverId)) return fail('A cover with that reference already exists.', 'coverId', REFUSAL('bad-cover'));
    const candidate = { coverId, assignmentId, dutyLabel, coverKind, coverHandId, declaredById, declaredDay, declaredAt, note };
    const warnings = [];
    const loaded = normalizeAsgCovers([...existing, candidate], normalizeAsgAssignments(rows('asgAssignments'), []), warnings);
    const stored = loaded.find((c) => c.coverId === coverId);
    if (!stored) return fail('That cover could not be recorded as written.', 'cover', REFUSAL('bad-cover'));
    store.state.asgCovers = loaded;
    store.commit?.(ASG_EVENTS.COVER_DECLARED, { coverId, assignmentId });
    return saved({ cover: stored });
  }

  /* ------------------------------------------------------------- decisions */

  function asgRecordReturnDecision(input = {}) {
    const check = seatFor(ASG_RIGHTS.MANAGE);
    if (!check.ok) return check;
    const assignmentId = text(input.assignmentId, L.idMax);
    const assignment = liveAssignment(assignmentId);
    if (!assignment) return fail('That assignment is not on the register.', 'assignmentId', REFUSAL('unknown-assignment'));
    if (!holdsSide(check, assignment.homeManagerId) && !holdsSide(check, assignment.hostManagerId)) {
      return fail('That seat holds neither named side of this assignment.', 'seat', REFUSAL('side-not-held'));
    }
    const actId = text(input.actId || input.id, L.idMax) || idFactory();
    const decisionKind = text(input.decisionKind);
    const rationale = asgRationale(input.rationale);
    const newDeclaredReturnDay = input.newDeclaredReturnDay === null || input.newDeclaredReturnDay === undefined || input.newDeclaredReturnDay === '' ? null : asgDayKey(input.newDeclaredReturnDay);
    const note = text(input.note, L.noteMax);
    const recordedById = text(input.recordedById, L.idMax) || check.actorId;
    const day = asgDayKey(input.day) || check.today;
    const at = clock().toISOString();
    if (!ASG_DECISION_BY_KEY[decisionKind]) {
      return fail('A return decision is extend, return or convert. The kind is the verdict.', 'decisionKind', REFUSAL('bad-act'));
    }
    if (!rationale) {
      return fail('A return decision needs a written rationale. A decision nobody justified is an overwrite, not a decision.', 'rationale', REFUSAL('missing-rationale'));
    }
    if (day > check.today) return fail('The decided day cannot be in the future.', 'day', REFUSAL('future-day'));
    if (day < assignment.startDay) {
      return fail('The assignment has not begun. A pre-start cancellation is an amendment to the declaration, not a return decision.', 'day', REFUSAL('assignment-not-started'));
    }
    const chain = chainFor(assignment);
    if (chain.finalDecision) {
      return fail('The return question is already answered on this assignment. A second answer is refused.', 'decisionKind', REFUSAL('question-answered'));
    }
    if (decisionKind === 'extend') {
      if (!newDeclaredReturnDay) {
        return fail('An extend names the new declared return day.', 'newDeclaredReturnDay', REFUSAL('no-forward-motion'));
      }
      if (newDeclaredReturnDay <= chain.ledger.returnDayInForce || newDeclaredReturnDay <= day) {
        return fail('An extend must move the declared return day forward — past the day in force and past the decided day.', 'newDeclaredReturnDay', REFUSAL('no-forward-motion'));
      }
    } else if (newDeclaredReturnDay) {
      return fail('Only an extend carries a new declared return day.', 'newDeclaredReturnDay', REFUSAL('bad-act'));
    }
    const existing = normalizeAsgActs(rows('asgActs'), normalizeAsgAssignments(rows('asgAssignments'), []), []);
    if (existing.some((a) => a.actId === actId)) return fail('An act with that reference already exists.', 'actId', REFUSAL('bad-act'));
    const candidate = {
      actId, assignmentId, kind: 'return-decision', decisionKind, rationale,
      newDeclaredReturnDay: decisionKind === 'extend' ? newDeclaredReturnDay : null,
      recordedById, day, at, note,
    };
    const warnings = [];
    const loaded = normalizeAsgActs([...existing, candidate], normalizeAsgAssignments(rows('asgAssignments'), []), warnings);
    const stored = loaded.find((a) => a.actId === actId);
    if (!stored) return fail('That decision could not be recorded as written.', 'decision', REFUSAL('bad-act'));
    store.state.asgActs = loaded;
    store.commit?.(ASG_EVENTS.DECISION_RECORDED, { actId, assignmentId, decisionKind });
    return saved({ act: stored });
  }

  /* --------------------------------------------------------------- consent */

  function asgRecordHomeConsent(input = {}) {
    const check = seatFor(ASG_RIGHTS.MANAGE);
    if (!check.ok) return check;
    const assignmentId = text(input.assignmentId, L.idMax);
    const assignment = liveAssignment(assignmentId);
    if (!assignment) return fail('That assignment is not on the register.', 'assignmentId', REFUSAL('unknown-assignment'));
    if (!holdsSide(check, assignment.homeManagerId)) {
      return fail('The home line’s consent is recorded by a hand that holds the home side.', 'seat', REFUSAL('side-not-held'));
    }
    const actId = text(input.actId || input.id, L.idMax) || idFactory();
    const basis = asgRationale(input.basis);
    const consentById = text(input.consentById, L.idMax) || check.actorId;
    const note = text(input.note, L.noteMax);
    const recordedById = text(input.recordedById, L.idMax) || check.actorId;
    const day = asgDayKey(input.day) || check.today;
    const at = clock().toISOString();
    if (!basis) return fail('A home-line consent carries its written basis.', 'basis', REFUSAL('missing-basis'));
    if (day > check.today) return fail('The consent day cannot be in the future.', 'day', REFUSAL('future-day'));
    const chain = chainFor(assignment);
    const convert = chain.finalDecision && chain.finalDecision.decisionKind === 'convert' ? chain.finalDecision : null;
    if (!convert) {
      return fail('A home-line consent is only meaningful once a convert decision is on the chain. Nobody is transferred by a consent to nothing.', 'assignmentId', REFUSAL('consent-without-convert'));
    }
    if (day < convert.day) {
      return fail('The consent is dated before the conversion decision it answers.', 'day', REFUSAL('consent-without-convert'));
    }
    if (!isManagerOrAbove(consentById, assignment.homeManagerId)) {
      return fail('The consenting hand must be the home manager themselves or a hand proved strictly above them on the reporting graph.', 'consentById', REFUSAL('consent-hand'));
    }
    const existing = normalizeAsgActs(rows('asgActs'), normalizeAsgAssignments(rows('asgAssignments'), []), []);
    if (existing.some((a) => a.actId === actId)) return fail('An act with that reference already exists.', 'actId', REFUSAL('bad-act'));
    const candidate = { actId, assignmentId, kind: 'home-consent', basis, consentById, recordedById, day, at, note };
    const warnings = [];
    const loaded = normalizeAsgActs([...existing, candidate], normalizeAsgAssignments(rows('asgAssignments'), []), warnings);
    const stored = loaded.find((a) => a.actId === actId);
    if (!stored) return fail('That consent could not be recorded as written.', 'consent', REFUSAL('bad-act'));
    store.state.asgActs = loaded;
    store.commit?.(ASG_EVENTS.CONSENT_RECORDED, { actId, assignmentId });
    return saved({ act: stored });
  }

  /* -------------------------------------------------------------- handback */

  function asgRecordHandback(input = {}) {
    const check = seatFor(ASG_RIGHTS.MANAGE);
    if (!check.ok) return check;
    const assignmentId = text(input.assignmentId, L.idMax);
    const assignment = liveAssignment(assignmentId);
    if (!assignment) return fail('That assignment is not on the register.', 'assignmentId', REFUSAL('unknown-assignment'));
    const side = text(input.side);
    if (!ASG_SIDE_BY_KEY[side]) {
      return fail('A handback is recorded on one side: home or host.', 'side', REFUSAL('bad-side'));
    }
    const sideManagerId = side === 'home' ? assignment.homeManagerId : assignment.hostManagerId;
    if (!holdsSide(check, sideManagerId)) {
      return fail(`That seat does not hold the ${side} side of this assignment. Each line evidences its own handback.`, 'seat', REFUSAL('side-not-held'));
    }
    const actId = text(input.actId || input.id, L.idMax) || idFactory();
    const evidenceRef = asgShort(input.evidenceRef, L.termsMax);
    const receivedById = text(input.receivedById, L.idMax) || check.actorId;
    const note = text(input.note, L.noteMax);
    const recordedById = text(input.recordedById, L.idMax) || check.actorId;
    const day = asgDayKey(input.day) || check.today;
    const at = clock().toISOString();
    if (!evidenceRef) {
      return fail('A handback carries its evidence reference. A handback nobody can evidence is not a handback.', 'evidenceRef', REFUSAL('missing-evidence'));
    }
    if (day > check.today) return fail('The handback day cannot be in the future.', 'day', REFUSAL('future-day'));
    const chain = chainFor(assignment);
    const decision = chain.finalDecision;
    if (!decision) {
      return fail('A handback is recorded after a return or convert decision. This assignment’s question is still open.', 'assignmentId', REFUSAL('handback-without-decision'));
    }
    if (day < decision.day) {
      return fail('The handback is dated before the decision it follows.', 'day', REFUSAL('handback-without-decision'));
    }
    if (!isManagerOrAbove(receivedById, sideManagerId)) {
      return fail(`The receiving hand must be the ${side} manager themselves or a hand proved strictly above them on the reporting graph.`, 'receivedById', REFUSAL('handback-hand'));
    }
    const existing = normalizeAsgActs(rows('asgActs'), normalizeAsgAssignments(rows('asgAssignments'), []), []);
    if (existing.some((a) => a.actId === actId)) return fail('An act with that reference already exists.', 'actId', REFUSAL('bad-act'));
    const candidate = { actId, assignmentId, kind: 'handback', side, receivedById, evidenceRef, recordedById, day, at, note };
    const warnings = [];
    const loaded = normalizeAsgActs([...existing, candidate], normalizeAsgAssignments(rows('asgAssignments'), []), warnings);
    const stored = loaded.find((a) => a.actId === actId);
    if (!stored) return fail('That handback could not be recorded as written.', 'handback', REFUSAL('bad-act'));
    store.state.asgActs = loaded;
    store.commit?.(ASG_EVENTS.HANDBACK_RECORDED, { actId, assignmentId, side });
    return saved({ act: stored });
  }

  /* ------------------------------------------------------------ conventions */

  function asgSetConventions(input = {}) {
    const check = seatFor(ASG_RIGHTS.MANAGE);
    if (!check.ok) return check;
    const next = { ...settings() };
    if (input.autoPropagate !== undefined) next[ASG_SETTING_KEYS.autoPropagate] = Boolean(input.autoPropagate);
    if (input.privacyFloor !== undefined) next[ASG_SETTING_KEYS.privacyFloor] = input.privacyFloor;
    if (input.warnHorizonDays !== undefined) next[ASG_SETTING_KEYS.warnHorizonDays] = input.warnHorizonDays;
    if (input.handbackHorizonDays !== undefined) next[ASG_SETTING_KEYS.handbackHorizonDays] = input.handbackHorizonDays;
    store.state.settings = { ...next, ...normalizeAsgSettings(next) };
    store.commit?.(ASG_EVENTS.CONVENTIONS_SET, {});
    return saved({ settings: normalizeAsgSettings(store.state.settings) });
  }

  function asgScanAssignments() {
    const check = readCheck();
    if (!check.ok) return check;
    const report = buildAssignmentReport(store.state, { now: clock(), settings: settings() });
    store.commit?.(ASG_EVENTS.SCANNED, { assignments: report.rows.length });
    return saved({ report });
  }

  return {
    asgDeclareAssignment,
    asgDeclareDutyCover,
    asgRecordReturnDecision,
    asgRecordHomeConsent,
    asgRecordHandback,
    asgSetConventions,
    asgScanAssignments,
    asgAttentionCount: () => asgAttentionCount(store.state, { now: clock(), settings: settings() }),
  };
}
