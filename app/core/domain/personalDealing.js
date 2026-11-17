/**
 * app/core/domain/personalDealing.js — the ONE reader of the Personal-Account
 * Dealing & Insider-List Register (ADR-0245, Schema v199, `#/personal-dealing`).
 *
 * Every window verdict, clearance state, dealing state, days-late figure,
 * days-inside figure and count this module prints is derived here, on read, from
 * stored declarations and the injected clock. Nothing derived is stored anywhere,
 * so the same workspace read twice gives the same answer and a hand-edited file
 * cannot carry a green tick that disagrees with the closed window beside it.
 *
 * THE TWO QUESTIONS THIS READER ANSWERS, SEPARATELY AND ALWAYS
 *   A. FOR A PERSON ON A DAY: is dealing closed, open, or undeterminable? A
 *      closed period applies to a person when the event's declared scope reaches
 *      one of the reporting lines holding them — or when the event declares no
 *      scope at all, which is the whole-market case. The answer is derived from
 *      the event's own declared arithmetic every time.
 *   B. FOR A CLEARANCE: was it decided, by an INDEPENDENT hand, within what
 *      validity, and was it used? A request is not an approval; silence past the
 *      declared turnaround is `pending-overdue`, not an approval; and a decision
 *      by the requester is a permanent printed breach.
 *
 * THEN, FOR EVERY EXECUTED DEALING: did it fall inside a closed window, did it
 * come after a refusal, did it sit outside the clearance's validity, or was it
 * dealt with no clearance at all? Each is a DIFFERENT state. The register never
 * folds them into a percentage and never repairs one.
 *
 * WHY A BAD TRADE IS STILL RECORDED. A register that refused to store a trade
 * made in a closed window would push the fact off the record entirely — the
 * opposite of a control. The trade is a FACT; the STATES above are what the
 * register is for. The door refuses to CREATE a self-approval; it never refuses to
 * record what a human being actually did.
 *
 * WHY NOBODY IS SCORED. There is no risk rating, no integrity index and no
 * league table of who traded most. A person's dealing record is a set of dated
 * acts. The moment a compliance register turns into a score on people, people
 * stop recording their trades honestly, and the control dies of its own metric.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A designated person may sit on a functional
 * line and a project line at once. `personLines` resolves EVERY active line
 * holding them and the reader counts the person ONCE. Independence is tested
 * through the ONE engine: `matrixJointApex` over the union of the requester's own
 * lines returns exactly the seats strictly above them across every line, so a
 * peer, a subordinate and an unrelated branch all fail the test and a manager two
 * steps up a different branch legitimately passes. Every rule ask is addressed to
 * the joint apex — NEVER to the designated person, whose own dealing is the thing
 * being measured.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildSeats } from './seat.js';
import {
  DWL_BASIS_BY_KEY,
  DWL_BREACH_STATE_KEYS,
  DWL_CLEARANCE_STATE_BY_KEY,
  DWL_CLEARANCE_STATE_KEYS,
  DWL_DETAIL_MAX_RANK,
  DWL_ENGINE_VERSION,
  DWL_EVENT_KIND_BY_KEY,
  DWL_SETTING_KEYS,
  DWL_STATE_BY_KEY,
  DWL_STATE_KEYS,
} from './personalDealingRegistry.js';
import {
  normalizeDwlClearances,
  normalizeDwlDealings,
  normalizeDwlDecisions,
  normalizeDwlDesignations,
  normalizeDwlEvents,
  normalizeDwlMarkers,
  normalizeDwlSettings,
} from './personalDealingSchema.js';
import {
  daysInside,
  daysLate,
  daysLeft,
  turnaroundDueOn,
  validThrough,
  withinWindow,
  windowSpan,
} from './personalDealingMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function dwlPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * THE DESIGNATION KERNEL. Is this person on the insider list on `day`, and if so
 * which designations cover them?
 *
 * A designation covers `[declaredOn, endsOn]` inclusive — the person is on the
 * list for the whole of the first day and the whole of the last day. A
 * designation with no `endsOn` is open-ended and covers every later day.
 */
export function designationsOn(designations, personId, day) {
  return list(designations).filter((row) => row && row.personId === personId
    && row.declaredOn && row.declaredOn <= day
    && (row.endsOn === null || row.endsOn === undefined || row.endsOn >= day));
}

/**
 * THE WINDOW KERNEL, pure over (event, personLines, day). Returns
 * `{ state, span, event, daysInsideWindow }`.
 *
 * SCOPE. An event with no declared `scopeLineIds` is a WHOLE-MARKET closed
 * period — the classic results window, which binds everybody designated. An event
 * with a declared scope binds a person only when one of the lines holding them is
 * in that scope; the reader prints which line reached them, so the answer is
 * never "the system says so".
 *
 * `undeterminable` is a first-class answer. When the event's declared arithmetic
 * cannot be resolved the register refuses to claim either open or closed, because
 * a reassuring default over a closed window is the single worst output this
 * register could produce.
 */
export function windowVerdictFor(event, personLineIds, day) {
  if (!event) return { state: 'open', span: null, event: null, daysInsideWindow: null, reachLineId: null };
  const span = windowSpan(event.disclosesOn, event.beforeDays, event.afterDays);
  if (!span) {
    return {
      state: 'undeterminable',
      span: null,
      event,
      daysInsideWindow: null,
      reachLineId: null,
      reason: 'This event’s declared before/after bounds cannot be resolved into a span, so the register refuses to say whether dealing was closed.',
    };
  }
  const scope = list(event.scopeLineIds);
  let reachLineId = null;
  if (scope.length) {
    reachLineId = list(personLineIds).find((lineId) => scope.includes(lineId)) || null;
    if (!reachLineId) {
      return { state: 'open', span, event, daysInsideWindow: null, reachLineId: null };
    }
  }
  if (!withinWindow(day, span)) {
    return { state: 'open', span, event, daysInsideWindow: null, reachLineId };
  }
  return {
    state: 'closed',
    span,
    event,
    daysInsideWindow: daysInside(day, span),
    reachLineId,
  };
}

/**
 * THE DEALING KERNEL. Pure over (dealing, designations, events, clearance,
 * decision, personLineIds, nowDay), exported so the suite can pin every branch
 * without a store and so the rule and the screen cannot disagree about a state.
 *
 * The order of the tests is the order of gravity, and `breaches` is ALWAYS
 * returned as a list even when `state` names only the gravest one: a trade that
 * fell inside a closed window AND cites an expired clearance must not hide the
 * second fact.
 */
export function deriveDwlDealing({
  dealing,
  designations = [],
  events = [],
  clearance = null,
  decision = null,
  personLineIds = [],
  nowDay,
}) {
  const day = dealing?.dealtOn || null;
  const breaches = [];
  const designationsCovering = day ? designationsOn(designations, dealing.personId, day) : [];

  // 1. Was the person designated at all on the dealing day?
  const designatedAtDeal = designationsCovering.length > 0;

  // 2. Which declared closed periods reached them on that day?
  let windowAnswer = { state: 'open', span: null, event: null, daysInsideWindow: null, reachLineId: null };
  if (day) {
    for (const event of events) {
      const verdict = windowVerdictFor(event, personLineIds, day);
      if (verdict.state === 'undeterminable') {
        windowAnswer = verdict;
        break;
      }
      if (verdict.state === 'closed') {
        windowAnswer = verdict;
        break;
      }
    }
  }

  // 3. The clearance tests. Each is its own fact.
  const clearedDecision = decision && decision.outcome === 'cleared' ? decision : null;
  const refusedDecision = decision && decision.outcome === 'refused' ? decision : null;
  const clearanceValidThrough = clearedDecision
    ? validThrough(clearedDecision.decidedOn, clearedDecision.validityDays)
    : null;

  const selfApproved = Boolean(decision?.selfApproval);

  // Dealt after a refusal: the refusal is dated on or before the dealing.
  const afterRefusal = Boolean(refusedDecision && day && daysBetween(refusedDecision.decidedOn, day) >= 0);
  // Dealt outside the clearance's validity: before the decision or after the last
  // valid day. Both offsets are printed.
  const beforeDecision = Boolean(clearedDecision && day && daysBetween(clearedDecision.decidedOn, day) < 0);
  const afterValidity = Boolean(clearedDecision && clearanceValidThrough && day && daysBetween(clearanceValidThrough, day) > 0);

  if (windowAnswer.state === 'closed') {
    breaches.push({
      key: 'dealt-in-closed-window',
      opensOn: windowAnswer.span.opensOn,
      closesOn: windowAnswer.span.closesOn,
      insideDays: windowAnswer.daysInsideWindow,
    });
  }
  if (afterRefusal) breaches.push({ key: 'dealt-after-refusal', refusedOn: refusedDecision.decidedOn });
  if (beforeDecision) breaches.push({ key: 'dealt-outside-clearance', missedByDays: daysBetween(day, clearedDecision.decidedOn), direction: 'before-decision' });
  if (afterValidity) breaches.push({ key: 'dealt-outside-clearance', missedByDays: daysBetween(clearanceValidThrough, day), direction: 'after-validity' });
  if (selfApproved) breaches.push({ key: 'cleared-by-requester' });

  const specified = {
    designatedAtDeal,
    designationsCovering,
    windowAnswer,
    clearance,
    decision,
    clearanceValidThrough,
    afterRefusal,
    beforeDecision,
    afterValidity,
    selfApproved,
    breaches,
  };
  const stateFor = (key) => ({ key, ...DWL_STATE_BY_KEY[key] });

  // The gravity order. A trade inside a closed window is the gravest fact on the
  // row, then a trade after a refusal, then outside the validity, then a
  // self-approval. Each stays in `breaches` regardless of which one prints.
  if (windowAnswer.state === 'closed') return { ...specified, state: stateFor('breach-dealt-in-closed-window') };
  if (selfApproved) return { ...specified, state: stateFor('breach-cleared-by-requester') };
  if (afterRefusal) return { ...specified, state: stateFor('breach-dealt-after-refusal') };
  if (beforeDecision || afterValidity) return { ...specified, state: stateFor('breach-dealt-outside-clearance') };

  // No breach. What did the record actually show?
  if (windowAnswer.state === 'undeterminable') return { ...specified, state: stateFor('dealt-window-undeterminable') };
  if (!designatedAtDeal) {
    // The person was designated, but not yet on the day of the trade, or the
    // designation had already ended. Those are different facts.
    const everDesignated = list(designations).some((row) => row && row.personId === dealing.personId);
    if (everDesignated) {
      const latestEnd = list(designations)
        .filter((row) => row && row.personId === dealing.personId && row.endsOn)
        .map((row) => row.endsOn)
        .sort()
        .pop();
      if (latestEnd && day && day > latestEnd) return { ...specified, state: stateFor('dealt-after-designation-ended') };
      return { ...specified, state: stateFor('dealt-before-designation') };
    }
    return { ...specified, state: stateFor('dealt-before-designation') };
  }
  if (clearedDecision && decision && !selfApproved) return { ...specified, state: stateFor('dealt-with-clearance') };
  return { ...specified, state: stateFor('dealt-without-clearance') };
}

/**
 * THE CLEARANCE KERNEL. Pure over (clearance, decision, dealings, turnaroundDays,
 * nowDay). The clearance's own state, never the dealing's.
 */
export function deriveDwlClearance({
  clearance,
  decision = null,
  dealings = [],
  turnaroundDays,
  nowDay,
}) {
  const dueOn = turnaroundDueOn(clearance.requestedOn, turnaroundDays);
  const overdue = !decision ? daysLate(nowDay, dueOn) : null;
  const dueIn = !decision && dueOn ? daysLeft(nowDay, dueOn) : null;
  const citing = list(dealings).filter((row) => row && row.clearanceId === clearance.id);
  const clearedThrough = decision?.outcome === 'cleared'
    ? validThrough(decision.decidedOn, decision.validityDays)
    : null;
  const expired = clearedThrough && nowDay ? daysBetween(clearedThrough, nowDay) > 0 : false;

  const base = {
    clearance,
    decision,
    dueOn,
    overdue,
    dueIn,
    dealings: citing,
    dealtN: citing.length,
    clearedThrough,
    expired,
  };
  const stateFor = (key) => ({ key, ...DWL_CLEARANCE_STATE_BY_KEY[key] });

  if (decision?.selfApproval) return { ...base, state: stateFor('breach-decided-by-requester') };
  if (decision && clearancesOrderBreached(clearance, decision)) {
    return { ...base, state: stateFor('breach-decided-before-request') };
  }
  if (!decision) {
    if (overdue > 0) return { ...base, state: stateFor('pending-overdue') };
    return { ...base, state: stateFor('pending') };
  }
  if (decision.outcome === 'refused') {
    const dealtAfter = citing.some((row) => row.dealtOn && daysBetween(decision.decidedOn, row.dealtOn) >= 0);
    return { ...base, state: stateFor(dealtAfter ? 'refused-and-dealt' : 'refused-not-dealt') };
  }
  // Cleared.
  const dealtInside = citing.some((row) => row.dealtOn && row.dealtOn >= decision.decidedOn
    && (!clearedThrough || row.dealtOn <= clearedThrough));
  if (dealtInside) return { ...base, state: stateFor('cleared-and-dealt') };
  if (citing.length) return { ...base, state: stateFor('cleared-and-dealt') };
  if (expired) return { ...base, state: stateFor('cleared-lapsed') };
  return { ...base, state: stateFor('cleared-not-dealt') };
}

/** A decision dated before the request it answers is an ordering breach. */
export function clearancesOrderBreached(clearance, decision) {
  if (!clearance?.requestedOn || !decision?.decidedOn) return false;
  return daysBetween(clearance.requestedOn, decision.decidedOn) < 0;
}

/**
 * Is `deciderId` strictly above `requesterId` across EVERY line the requester
 * holds? This is the independence test, and it is the control.
 *
 * It is proved through the ONE matrix engine rather than a role string:
 * `matrixJointApex` over the union of the requester's lines returns exactly the
 * minimal common ancestors, so a seat in that set is above them on every line,
 * while a peer, a subordinate and an unrelated branch can never be.
 */
export function dwlIndependentDecider(matrix, requesterId) {
  const node = matrix?.nodes?.get(requesterId);
  if (!node) return { ok: false, reason: 'The requester is not on the active reporting graph, so no seat can be proved independent of them.' };
  const lines = [requesterId, ...list(matrix?.linesByPerson?.get(requesterId)).map((row) => row.managerId)];
  const apex = matrixJointApex(matrix, [...new Set(lines)]);
  const apexIds = list(apex?.apexIds);
  if (!apexIds.length) {
    return { ok: false, reason: 'The reporting graph yields no seat above the requester on every line they hold, so no hand can be proved independent of them.' };
  }
  return { ok: true, apex, apexIds };
}

/** Could `deciderId` clear a trade for `requesterId`? */
export function dwlCanDecide(matrix, deciderId, requesterId) {
  if (!deciderId || !requesterId) return { ok: false, reason: 'Both the decider and the requester must be named.' };
  if (deciderId === requesterId) return { ok: false, reason: 'self', self: true };
  const independence = dwlIndependentDecider(matrix, requesterId);
  if (!independence.ok) return independence;
  if (!independence.apexIds.includes(deciderId)) return { ok: false, reason: 'not-above' };
  return { ok: true, apexIds: independence.apexIds };
}

/**
 * The whole register, read once. `seat` narrows the disclosure ladder; `now` is
 * injected; nothing is read from the ambient clock.
 */
export function buildPersonalDealing(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const asOf = dayKey(at);
  const cfg = normalizeDwlSettings(settings || state.settings || {});
  const turnaroundDays = cfg[DWL_SETTING_KEYS.clearanceTurnaroundDays];
  const warnings = [];

  const designations = normalizeDwlDesignations(state.dwlDesignations, warnings);
  const events = normalizeDwlEvents(state.dwlEvents, warnings);
  const clearances = normalizeDwlClearances(state.dwlClearances, designations, warnings);
  const decisions = normalizeDwlDecisions(state.dwlDecisions, clearances, warnings);
  const dealings = normalizeDwlDealings(state.dwlDealings, clearances, warnings);
  const markers = normalizeDwlMarkers(state.dwlMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...(state.settings || {}), activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read (${error?.message || 'unknown error'}), so no line holding a designated person and no independent decider can be resolved.`;
  }

  const graphIds = matrix?.nodes ? new Set(matrix.nodes.keys()) : new Set();
  const roster = new Set(list(state.people).filter((row) => row && row.id).map((row) => row.id));

  /**
   * WHICH PERSON CAN ACT AT ALL. An operating seat exists only for a leadership
   * node — somebody with a span, or a declared line holder with a leadership
   * altitude on the roster. A designated person who is a pure individual
   * contributor holds NO seat in this workspace, which means they cannot record
   * their own clearance or their own dealing: the gateway refuses every write from
   * an unresolved seat long before this register is reached.
   *
   * That is a real limitation and it is PRINTED, never papered over. The register
   * still works for that person — the hand that holds them requests the clearance
   * for them and records the dealing against the broker's note, and `requestedById`
   * keeps who asked beside `personId` for whom — but the screen says plainly that
   * the person could not have done it themselves, so nobody reads the record as
   * evidence that they did.
   */
  let seatIds = null;
  try {
    const built = buildSeats(state, { now: at, settings: { ...(state.settings || {}), activeSeatId: null } });
    seatIds = new Set(list(built?.seats).map((row) => row.id));
  } catch {
    seatIds = null;
  }
  const holdsSeat = (personId) => (seatIds ? seatIds.has(personId) : null);
  const knownPerson = (personId) => graphIds.has(personId) || personId === LEADER_ID || roster.has(personId);
  const resolveHand = (personId) => (knownPerson(personId) ? dwlPersonLabel(matrix, personId) : null);

  /** EVERY active line holding a person, through the one engine. */
  const personLines = (personId) => list(matrix?.linesByPerson?.get(personId))
    .map((row) => ({ id: row.id, managerId: row.managerId, kind: row.kind, active: row.active !== false }));

  const decisionByClearance = new Map(decisions.map((row) => [row.clearanceId, row]));
  const clearanceById = new Map(clearances.map((row) => [row.id, row]));
  const dealingsByClearance = new Map();
  for (const row of dealings) {
    if (!row.clearanceId) continue;
    if (!dealingsByClearance.has(row.clearanceId)) dealingsByClearance.set(row.clearanceId, []);
    dealingsByClearance.get(row.clearanceId).push(row);
  }

  /* ---------------------------------------------------------------- events */

  const eventRows = events.map((event) => {
    const span = windowSpan(event.disclosesOn, event.beforeDays, event.afterDays);
    const openOnAsOf = span ? withinWindow(asOf, span) : null;
    const daysUntilOpen = span && asOf ? daysLeft(asOf, span.opensOn) : null;
    const daysLeftInWindow = span && asOf && openOnAsOf ? daysLeft(asOf, span.closesOn) : null;
    return {
      event,
      span,
      resolvable: Boolean(span),
      openOnAsOf,
      daysUntilOpen,
      daysLeftInWindow,
      scopeN: list(event.scopeLineIds).length,
      scopeNames: list(event.scopeLineIds).map((lineId) => resolveHand(lineId) || lineId),
    };
  }).sort((a, b) => String(a.event.disclosesOn).localeCompare(String(b.event.disclosesOn)) || String(a.event.id).localeCompare(String(b.event.id)));

  /* ---------------------------------------------------------- designations */

  const designationRows = designations.map((row) => {
    const lines = personLines(row.personId);
    const live = row.declaredOn <= asOf && (row.endsOn === null || row.endsOn >= asOf);
    // The joint apex above every line holding the person — never the person.
    let apex = { apexIds: [], ambiguous: false };
    if (matrix) {
      try {
        const ids = [...new Set([row.personId, ...lines.map((line) => line.managerId)])].filter((lineId) => graphIds.has(lineId));
        apex = matrixJointApex(matrix, ids);
      } catch {
        apex = { apexIds: [], ambiguous: false, error: true };
      }
    }
    return {
      designation: row,
      personName: resolveHand(row.personId) || row.personId,
      personKnown: knownPerson(row.personId),
      basisLabel: DWL_BASIS_BY_KEY[row.basis]?.label || row.basis,
      lines,
      linesN: lines.length,
      live,
      daysCovered: row.endsOn ? daysBetween(row.declaredOn, row.endsOn) + 1 : null,
      daysRemaining: row.endsOn && asOf ? daysLeft(asOf, row.endsOn) : null,
      apex,
      apexNames: list(apex?.apexIds).map((apexId) => dwlPersonLabel(matrix, apexId)),
      ambiguousApex: Boolean(apex?.ambiguous),
    };
  });

  /**
   * THE DISCLOSURE LADDER, APPLIED PER ROW RATHER THAN PER PAGE.
   *
   * Personal-account dealing is INDIVIDUAL detail, so the obvious rule is "above
   * rank 2, counts only". That rule is wrong on its own, and the way it is wrong
   * matters: the hand that must DECIDE a clearance is by construction strictly
   * above the requester — usually a director or a VP — and a decider who cannot see
   * the security and the quantity is being asked to approve something they are
   * forbidden to look at. A disclosure rule that blinds the decider does not
   * protect the data, it disables the control.
   *
   * So the detail follows the DUTY, not the rank alone. A row is shown in detail
   * when the seat:
   *   - holds full (undeclared) access; or
   *   - sits at rank 2 or below, where individual detail legitimately lives; or
   *   - HOLDS the person through a span or a declared line; or
   *   - is a seat the graph proves strictly above that person, i.e. one the record
   *     could legitimately ask to decide.
   * Every other high-altitude seat is handed counts and published state keys, and
   * the page prints WHICH rows are withheld and why rather than quietly blanking
   * them. A row's withholding is a rendering contract, not an authentication
   * boundary: this workspace has no authentication, and implying otherwise would be
   * the lie that hurts people.
   */
  const ROLE_HOLDER = { rank: seat?.rank ?? null, fullAccess: Boolean(seat?.fullAccess), label: seat?.label || '' };
  const rankAllows = !seat || seat.fullAccess || !Number.isInteger(seat.rank) || seat.rank <= DWL_DETAIL_MAX_RANK;
  const seatNodeId = seat ? (seat.nodeId || seat.id || null) : null;
  const seenInDetail = (personId) => {
    if (!seat) return true;                       // no seat: the whole register
    if (seat.fullAccess) return true;             // undeclared operator view
    if (rankAllows) return true;                  // individual detail lives here
    if (!personId) return false;
    if (seatNodeId === personId) return true;     // your own record
    if (seat.scope?.has?.(personId)) return true; // your span
    if (seat.lineScope?.has?.(personId)) return true; // a declared line of yours
    // Proved above them through every line — the seat the record may ask to decide.
    const independence = matrix ? dwlIndependentDecider(matrix, personId) : null;
    if (independence?.ok && seatNodeId && independence.apexIds.includes(seatNodeId)) return true;
    return false;
  };

  const detailed = !seat || seat.fullAccess || rankAllows;
  const anyWithheld = !detailed;
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null, rankAllows }
    : {
      level: 'row-scoped',
      reason: 'Personal-account dealing is individual detail, so this seat is handed counts and published state keys for every person it does not hold, does not sit above, and whose record is not its own. Where it does, the row is shown in full — because a decider who cannot see the trade is being asked to approve something they are forbidden to look at, and that disables the control rather than protecting it.',
      rank: seat?.rank ?? null,
      rankAllows,
    };

  /* -------------------------------------------------------------- dealings */

  const dealingRows = dealings.map((dealing) => {
    const clearance = dealing.clearanceId ? clearanceById.get(dealing.clearanceId) || null : null;
    const decision = clearance ? decisionByClearance.get(clearance.id) || null : null;
    const lines = personLines(dealing.personId);
    const derived = deriveDwlDealing({
      dealing,
      designations,
      events,
      clearance,
      decision,
      personLineIds: lines.map((line) => line.id),
      nowDay: asOf,
    });
    // The joint apex over every line holding the person — the seat answerable for
    // any ask about this dealing, and never the person themselves.
    let apex = { apexIds: [], ambiguous: false };
    if (matrix) {
      try {
        const ids = [...new Set([dealing.personId, ...lines.map((line) => line.managerId)])].filter((lineId) => graphIds.has(lineId));
        apex = matrixJointApex(matrix, ids);
      } catch {
        apex = { apexIds: [], ambiguous: false, error: true };
      }
    }
    return {
      dealing,
      personName: resolveHand(dealing.personId) || dealing.personId,
      personKnown: knownPerson(dealing.personId),
      lines,
      linesN: lines.length,
      clearance,
      decision,
      ...derived,
      apex,
      apexNames: list(apex?.apexIds).map((apexId) => dwlPersonLabel(matrix, apexId)),
      ambiguousApex: Boolean(apex?.ambiguous),
      // Per-row disclosure: can THIS seat see THIS person's detail?
      inDetail: seenInDetail(dealing.personId),
    };
  }).sort((a, b) => String(b.dealing.dealtOn).localeCompare(String(a.dealing.dealtOn)) || String(a.dealing.id).localeCompare(String(b.dealing.id)));

  /* ------------------------------------------------------------ clearances */

  const clearanceRows = clearances.map((clearance) => {
    const decision = decisionByClearance.get(clearance.id) || null;
    const citing = dealingsByClearance.get(clearance.id) || [];
    const derived = deriveDwlClearance({
      clearance,
      decision,
      dealings: citing,
      turnaroundDays,
      nowDay: asOf,
    });
    const lines = personLines(clearance.personId);
    const independence = matrix ? dwlIndependentDecider(matrix, clearance.personId) : { ok: false, reason: matrixError || 'no graph' };
    let apex = { apexIds: [], ambiguous: false };
    if (matrix) {
      try {
        const ids = [...new Set([clearance.personId, ...lines.map((line) => line.managerId)])].filter((lineId) => graphIds.has(lineId));
        apex = matrixJointApex(matrix, ids);
      } catch {
        apex = { apexIds: [], ambiguous: false, error: true };
      }
    }
    return {
      clearance,
      personName: resolveHand(clearance.personId) || clearance.personId,
      personKnown: knownPerson(clearance.personId),
      lines,
      designation: designationsOn(designations, clearance.personId, clearance.requestedOn)[0] || null,
      ...derived,
      independence,
      apex,
      apexNames: list(apex?.apexIds).map((apexId) => dwlPersonLabel(matrix, apexId)),
      deciderName: decision ? (resolveHand(decision.decidedById) || decision.decidedById) : null,
      requesterName: resolveHand(clearance.requestedById) || clearance.requestedById,
      ambiguousApex: Boolean(apex?.ambiguous),
      // Per-row disclosure. A clearance is shown in full to the seat that HOLDS the
      // person or is proved above them — which is exactly the seat that could be
      // asked to decide it.
      inDetail: seenInDetail(clearance.personId),
    };
  }).sort((a, b) => String(b.clearance.requestedOn).localeCompare(String(a.clearance.requestedOn)) || String(a.clearance.id).localeCompare(String(b.clearance.id)));

  /* ----------------------------------------------------------------- states */

  const dealingStates = {};
  for (const key of DWL_STATE_KEYS) dealingStates[key] = 0;
  for (const row of dealingRows) dealingStates[row.state.key] = (dealingStates[row.state.key] || 0) + 1;

  const clearanceStates = {};
  for (const key of DWL_CLEARANCE_STATE_KEYS) clearanceStates[key] = 0;
  for (const row of clearanceRows) clearanceStates[row.state.key] = (clearanceStates[row.state.key] || 0) + 1;

  const dealingTotal = Object.values(dealingStates).reduce((sum, n) => sum + n, 0);
  const clearanceTotal = Object.values(clearanceStates).reduce((sum, n) => sum + n, 0);

  const balances = {
    dealingStatesReconcile: dealingTotal === dealings.length,
    clearanceStatesReconcile: clearanceTotal === clearances.length,
    decisionsReconcile: decisions.every((row) => clearances.some((clearance) => clearance.id === row.clearanceId)),
    dealingsReconcile: dealings.every((row) => !row.clearanceId || clearances.some((clearance) => clearance.id === row.clearanceId)),
    designationsReconcile: designations.every((row) => knownPerson(row.personId)),
  };

  const breaches = dealingRows.filter((row) => row.state.key.startsWith('breach-'));
  const clearanceBreaches = clearanceRows.filter((row) => row.state.key.startsWith('breach-'));

  // People held on the list, counted ONCE each, with every line they hold.
  const listedPeople = [];
  const listedIds = new Set(designations.filter((row) => row.declaredOn <= asOf && (row.endsOn === null || row.endsOn >= asOf)).map((row) => row.personId));
  for (const personId of listedIds) {
    const personDesignations = designations.filter((row) => row.personId === personId
      && row.declaredOn <= asOf && (row.endsOn === null || row.endsOn >= asOf));
    const lines = personLines(personId);
    listedPeople.push({
      personId,
      personName: resolveHand(personId) || personId,
      lines,
      linesN: lines.length,
      multiLine: lines.length > 1,
      bases: [...new Set(personDesignations.map((row) => DWL_BASIS_BY_KEY[row.basis]?.label || row.basis))],
      designationIds: personDesignations.map((row) => row.id),
      earliestStart: personDesignations.map((row) => row.declaredOn).sort()[0],
      latestEnd: personDesignations.every((row) => row.endsOn) ? personDesignations.map((row) => row.endsOn).sort().pop() : null,
      // Whether this person can record their own clearance in this workspace.
      holdsSeat: holdsSeat(personId),
      inDetail: seenInDetail(personId),
      seatReason: holdsSeat(personId) === true
        ? null
        : (holdsSeat(personId) === false
          ? 'This person holds no operating seat in this workspace (they report to somebody and hold no line of their own), so the gateway refuses every write from them. The hand that holds them records the clearance request and the dealing on their behalf, and the record keeps who asked beside who it was for.'
          : 'The operating-seat graph could not be read, so whether this person can act for themselves is unknown.'),
    });
  }
  listedPeople.sort((a, b) => String(a.personName).localeCompare(String(b.personName)) || String(a.personId).localeCompare(String(b.personId)));

  const openWindowsN = eventRows.filter((row) => row.openOnAsOf === true).length;

  const totals = {
    designations: designations.length,
    liveDesignations: designationRows.filter((row) => row.live).length,
    endedDesignations: designationRows.filter((row) => !row.live).length,
    listedPeople: listedPeople.length,
    multiLineListed: listedPeople.filter((row) => row.multiLine).length,
    listedWithoutSeatN: listedPeople.filter((row) => row.holdsSeat === false).length,
    events: events.length,
    openWindowsN,
    undeterminableEventsN: eventRows.filter((row) => !row.resolvable).length,
    clearances: clearances.length,
    pendingN: clearanceStates.pending || 0,
    pendingOverdueN: clearanceStates['pending-overdue'] || 0,
    clearedN: clearanceRows.filter((row) => row.decision?.outcome === 'cleared').length,
    refusedN: clearanceRows.filter((row) => row.decision?.outcome === 'refused').length,
    lapsedN: clearanceStates['cleared-lapsed'] || 0,
    dealings: dealings.length,
    dealtWithClearanceN: dealingStates['dealt-with-clearance'] || 0,
    dealtWithoutClearanceN: dealingStates['dealt-without-clearance'] || 0,
    dealtInClosedWindowN: dealingStates['breach-dealt-in-closed-window'] || 0,
    dealtAfterRefusalN: dealingStates['breach-dealt-after-refusal'] || 0,
    dealtOutsideClearanceN: dealingStates['breach-dealt-outside-clearance'] || 0,
    dealtUndeterminableN: dealingStates['dealt-window-undeterminable'] || 0,
    dealtBeforeDesignationN: dealingStates['dealt-before-designation'] || 0,
    dealtAfterDesignationEndedN: dealingStates['dealt-after-designation-ended'] || 0,
    breachesN: breaches.length + clearanceBreaches.length,
    dealingBreachesN: breaches.length,
    clearanceBreachesN: clearanceBreaches.length,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.dealingStatesReconcile) incompleteReasons.push('The printed dealing state counts do not re-add to the dealings on the record.');
  if (!balances.clearanceStatesReconcile) incompleteReasons.push('The printed clearance state counts do not re-add to the clearances on the record.');
  if (!balances.designationsReconcile) incompleteReasons.push('A designation names a person who is not on the active roster.');
  if (totals.undeterminableEventsN) incompleteReasons.push(`${totals.undeterminableEventsN} closed-period event(s) declare a window that cannot be resolved, so for those the register refuses to say whether dealing was closed.`);
  const unresolvedPeopleN = [...new Set([...designations.map((r) => r.personId)])].filter((personId) => !knownPerson(personId)).length;
  if (unresolvedPeopleN) incompleteReasons.push(`${unresolvedPeopleN} designated person(s) are not on the active reporting graph; their lines and their joint seat cannot be resolved.`);
  if (totals.listedWithoutSeatN) {
    incompleteReasons.push(`${totals.listedWithoutSeatN} listed person(s) hold no operating seat, so they cannot record their own clearance request or their own dealing in this workspace. Their line holder does it on their behalf and the record prints who asked; read a record with no self-request as that limitation, never as evidence the person acted.`);
  }

  /* ------------------------------------------------------------- the window */

  /** The window question, asked explicitly: is this person closed on this day? */
  function windowFor(personId, day) {
    const lines = personLines(personId).map((line) => line.id);
    const designationsCovering = designationsOn(designations, personId, day);
    const verdicts = events.map((event) => ({ event, ...windowVerdictFor(event, lines, day) }));
    const closed = verdicts.find((row) => row.state === 'closed');
    if (closed) return { ...closed, designationsCovering, onList: designationsCovering.length > 0 };
    const undeterminable = verdicts.find((row) => row.state === 'undeterminable');
    if (undeterminable) return { ...undeterminable, designationsCovering, onList: designationsCovering.length > 0 };
    return { state: 'open', span: null, event: null, daysInsideWindow: null, reachLineId: null, designationsCovering, onList: designationsCovering.length > 0 };
  }



  return {
    ok: true,
    engineVersion: DWL_ENGINE_VERSION,
    asOf,
    nowIso: at.toISOString(),
    matrix,
    matrixError,
    conventions: cfg,
    turnaroundDays,
    detailed: Boolean(detailed),
    anyWithheld,
    disclosure,
    seenInDetail,
    designations,
    events,
    clearances,
    decisions,
    dealings,
    markers,
    eventRows,
    designationRows,
    clearanceRows,
    dealingRows,
    listedPeople,
    seatIds,
    warnings,
    states: dealingStates,
    clearanceStates,
    stateTotal: dealingTotal,
    clearanceStateTotal: clearanceTotal,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    breaches,
    clearanceBreaches,
    totals,
    windowFor,
    stateRows: DWL_STATE_KEYS.map((key) => ({ key, label: DWL_STATE_BY_KEY[key].label, tone: DWL_STATE_BY_KEY[key].tone, count: dealingStates[key] || 0 })),
    clearanceStateRows: DWL_CLEARANCE_STATE_KEYS.map((key) => ({ key, label: DWL_CLEARANCE_STATE_BY_KEY[key].label, tone: DWL_CLEARANCE_STATE_BY_KEY[key].tone, count: clearanceStates[key] || 0 })),
    attention: {
      breachedN: breaches.length,
      clearanceBreachesN: clearanceBreaches.length,
      pendingOverdueN: totals.pendingOverdueN,
      openWindowsN,
      total: breaches.length + clearanceBreaches.length + totals.pendingOverdueN,
    },
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DUTY-SHAPED states — a dealing that breached
 * a window, a refusal or a validity, a clearance decided by its own requester, and
 * a decision owed past its declared turnaround — never every open request, so the
 * badge reads as "work owed now" rather than "things happening".
 */
export function personalDealingAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildPersonalDealing(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Four facts worth a control room's attention, each with the
 * printed evidence and a route — and none of them a score on a person.
 */
export function personalDealingSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildPersonalDealing(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Personal dealing', route: '#/personal-dealing', ...signal });

  if (report.totals.dealtInClosedWindowN) {
    add({
      ruleId: 'DWL-01',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.dealtInClosedWindowN} dealing(s) fell inside a declared closed period`,
      detail: 'A trade is on the record on a day a declared window was closed for that person. The window’s first and last closed day and the exact day the trade fell are printed beside it, and the state is never repaired or reframed as a permitted trade.',
      action: { label: 'Open the personal-dealing register', route: '#/personal-dealing?panel=dealings' },
      evidence: [`${report.totals.events} closed-period event(s) declared`, `${report.totals.openWindowsN} window(s) open today`],
    });
  }

  if (report.totals.clearanceBreachesN) {
    add({
      ruleId: 'DWL-02',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.clearanceBreachesN} clearance(s) were decided by the person who asked, or decided before they asked`,
      detail: 'Decision control must sit apart from decision management. The door cannot create either of these; they arrived in the record and the register keeps them rather than hiding them.',
      action: { label: 'See the clearances', route: '#/personal-dealing?panel=clearances' },
      evidence: [`${report.totals.clearances} clearance(s) on the record`],
    });
  }

  if (report.totals.dealtAfterRefusalN || report.totals.dealtOutsideClearanceN) {
    add({
      ruleId: 'DWL-03',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.dealtAfterRefusalN + report.totals.dealtOutsideClearanceN} dealing(s) came after a refusal or outside the clearance’s validity`,
      detail: 'A refusal is an answer and a clearance approves a trade for a declared period and no longer. Both figures print with the exact days, and neither is folded into a percentage.',
      action: { label: 'Open the dealings', route: '#/personal-dealing?panel=dealings' },
      evidence: [`${report.totals.refusedN} refusal(s) recorded`, `${report.totals.clearedN} clearance(s) granted`],
    });
  }

  if (report.totals.pendingOverdueN) {
    add({
      ruleId: 'DWL-04',
      severity: 4,
      confidence: 'high',
      title: `${report.totals.pendingOverdueN} clearance request(s) are past their declared turnaround with no decision`,
      detail: 'Silence is not an approval. The exact days late stay printed, and the request stays open until a hand strictly above the requester answers it — never a peer, never a subordinate, never the requester.',
      action: { label: 'Open the clearances', route: '#/personal-dealing?panel=clearances' },
      evidence: [`${report.totals.clearances} clearance(s) on the record`, `${report.totals.pendingN} still inside their turnaround`],
    });
  }

  if (report.totals.dealtWithoutClearanceN) {
    add({
      ruleId: 'DWL-05',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.dealtWithoutClearanceN} dealing(s) carry no clearance on the record`,
      detail: 'The trade is on the record and nothing approved it. The register does not know whether pre-clearance was required of this person — that is a matter for the written policy the designation cites — so it prints exactly what it knows.',
      action: { label: 'Open the dealings', route: '#/personal-dealing?panel=dealings' },
      evidence: [`${report.totals.dealings} dealing(s) on the record`],
    });
  }

  return signals;
}
