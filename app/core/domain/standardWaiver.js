/**
 * app/core/domain/standardWaiver.js — the pure read model for the Temporary
 * Standard Waiver Register (ADR-0212, Schema v166, CSV #154,
 * `#/standard-work?panel=waivers`).
 *
 * ONE reader. The panel, the brief, the CSV, the navigation counter and
 * `RULE-TSW-01` all read `buildStandardWaivers`; none of them computes a state,
 * a chain length or a coverage share of its own. Nothing here writes.
 *
 * WHAT IT DERIVES
 *  - one state per request, from a closed list in precedence order, over the
 *    request, its answer, its closing decision and the routine it names;
 *  - the AUTHORITY for each routine: the holder of the very line the routine is
 *    owed under, resolved once from the matrix engine — or a printed reason
 *    nobody can authorise it (the line ended, the owner is the workspace
 *    leader, the owner is not on the roster);
 *  - coverage: how many CLOSED owed calendar slots of each routine fell wholly
 *    inside a live grant, and the share, withheld below the declared floor;
 *  - renewal chains, counted only across contiguous links, because a chain is
 *    the one thing that separates five temporary departures from one permanent
 *    one;
 *  - the integrity counts that never get a reassuring word for an answer:
 *    self-authorised grants, authorities that have since moved, renewal links
 *    that do not resolve, decisions recorded before the departure began.
 *
 * WHAT IT REFUSES
 *  - a state the row cannot prove: a granted window that ended with no
 *    decision is `expired-unrestored`, never quietly `clear`;
 *  - a coverage percentage on fewer closed slots than the declared floor;
 *  - a substituted authority: where the line has ended or the owner is at the
 *    top, the register says no authority exists and names why;
 *  - summing a person's routines into a workspace figure that counts a routine
 *    twice — the workspace totals count DISTINCT routines, and a scoped seat's
 *    totals are labelled incomplete rather than silently narrower.
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import {
  STANDARD_WAIVER_DECISION_BY_KEY,
  STANDARD_WAIVER_DETAIL_REASONS,
  STANDARD_WAIVER_ENGINE_VERSION,
  STANDARD_WAIVER_KINDS,
  STANDARD_WAIVER_KIND_BY_KEY,
  STANDARD_WAIVER_ROUTINE_STATE_BY_KEY,
  STANDARD_WAIVER_SETTING_KEYS,
  STANDARD_WAIVER_STATES,
  STANDARD_WAIVER_STATE_BY_KEY,
} from './standardWaiverRegistry.js';
import {
  closingDecision,
  firstAnswer,
  normalizeStandardWaiverSettings,
  standardWaiverDay,
  standardWaiverDaysBetween,
  standardWaiverWindowDays,
} from './standardWaiverSchema.js';
import {
  standardWorkSlotKeyFor,
  standardWorkSlotRange,
  standardWorkOwesSlot,
} from './standardWorkSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);
const round1 = (n) => Math.round(n * 10) / 10;
const blank = (value) => (value === null || value === undefined ? '' : value);

/** Days from `from` (inclusive) to `to` (inclusive), or an empty list when reversed. */
function daySpan(from, to) {
  const days = [];
  if (!from || !to || to < from) return days;
  let cursor = from;
  for (let guard = 0; guard <= 400 && cursor && cursor <= to; guard += 1) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * The one line a routine is owed under, and who holds it. Resolved from the
 * matrix engine ONCE — never by walking `person.managerId` here, because a
 * routine may be declared under a declared line and the two would drift.
 *
 * `state`:
 *   `seat`            a roster person holds the line and may authorise;
 *   `leader-holder`   the workspace leader holds it (the operator view acts as
 *                     the leader and as nobody else);
 *   `line-ended`      the declared line this routine names is no longer active;
 *   `line-unknown`    the routine names a line that does not exist at all;
 *   `owner-off-roster` the owner is not on the active roster;
 *   `no-authority`    the owner is the workspace leader, or is their own line
 *                     holder — nobody above them exists to authorise.
 */
export function standardWaiverAuthority(matrix, routine) {
  const ownerId = routine?.ownerId || '';
  if (!routine) return { state: 'line-unknown', managerId: null, lineId: null, lineLabel: '', says: 'The routine is not on the record.' };
  if (ownerId === LEADER_ID) {
    return {
      state: 'no-authority', managerId: null, lineId: null, lineLabel: 'top of the workspace',
      says: 'The routine belongs to the workspace leader. Nobody holds a line above the top of the workspace, so no departure from this routine can be authorised here — and the register will not authorise it on the leader’s behalf.',
    };
  }
  if (!matrix || !matrix.roster || !matrix.roster.has(ownerId)) {
    return {
      state: 'owner-off-roster', managerId: null, lineId: null, lineLabel: '',
      says: 'The routine’s owner is not on the active roster, so the line it is owed under cannot be named.',
    };
  }
  const lines = matrix.linesByPerson.get(ownerId) || [];
  const wanted = routine.lineKey === 'home' ? null : routine.lineKey;
  const line = wanted ? lines.find((row) => row.id === wanted) : lines.find((row) => row.role === 'primary');
  if (!line) {
    const ended = wanted ? (matrix.inactiveLines || []).find((row) => row.id === wanted) : null;
    return {
      state: ended ? 'line-ended' : 'line-unknown',
      managerId: null,
      lineId: wanted,
      lineLabel: wanted ? `declared line ${wanted}` : 'home line',
      says: ended
        ? 'The declared reporting line this routine is owed under has ended. Nobody holds that line today, so nobody can authorise a departure from it — the register names that gap instead of substituting a manager who no longer holds it.'
        : 'The routine names a reporting line that is not on the record, so no line holder can be resolved.',
    };
  }
  const managerId = line.managerId || null;
  if (managerId === ownerId) {
    return {
      state: 'no-authority', managerId: null, lineId: line.id, lineLabel: line.role === 'primary' ? 'home line' : `declared line ${line.id}`,
      says: 'The roster records this person as their own line holder. A person cannot authorise their own departure.',
    };
  }
  return {
    state: managerId === LEADER_ID ? 'leader-holder' : 'seat',
    managerId,
    lineId: line.id,
    lineKind: line.kind,
    lineLabel: line.role === 'primary' ? 'home line' : `declared ${line.kind || 'additional'} line`,
    says: managerId === LEADER_ID
      ? 'The workspace leader holds this line. The operator view acts as the leader for it, and as nobody else.'
      : '',
  };
}

/** The name of a person id, including the workspace leader. */
export function standardWaiverNameOf(state, matrix, personId) {
  if (!personId) return '—';
  if (personId === LEADER_ID) return matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace leader';
  const person = list(state?.people).find((p) => p && p.id === personId);
  return person?.name || 'Someone no longer on the roster';
}

/**
 * What one seat holds and reaches. ONE definition, read by the register, the
 * door and the navigation counter.
 */
export function standardWaiverSeatProjection(seat) {
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id || null);
  const reachOf = (personId) => {
    if (operator) return 'operator';
    if (!personId) return null;
    if (personId === actorId) return 'self';
    if (seat.scope instanceof Set && seat.scope.has(personId)) return 'tree';
    if (seat.lineScope instanceof Set && seat.lineScope.has(personId)) return 'line';
    return null;
  };
  return { operator, actorId, reachOf, rank: operator ? 5 : (Number.isInteger(seat?.rank) ? seat.rank : 0) };
}

/** A granted waiver covers `day` when its window contains it and it is not revoked. */
function coversDay(grant, day) {
  return Boolean(grant && grant.decision === 'granted' && !grant.revoked && grant.from <= day && day <= grant.to);
}

/**
 * How a granted waiver's coverage ENDS: its own last day, an earlier revocation
 * day, or an earlier restoration day. A restored standard is in force from the
 * decision day, so the register must not count that day as waived.
 */
function coverageEnd(grant, decision, today) {
  let end = grant.to;
  if (grant.revoked && grant.revokedOn) end = grant.revokedOn < end ? addDays(grant.revokedOn, -1) : end;
  if (decision && decision.kind === 'restored' && decision.decidedOn) end = decision.decidedOn < end ? addDays(decision.decidedOn, -1) : end;
  return end && end > today ? today : end;
}

/* --------------------------------------------------------------- per request */

function requestState({ request, answer, grant, decision, successor, today }) {
  if (answer && answer.decision === 'refused') return 'refused';
  // A request nobody answered is a LAPSED request once its own window has
  // passed. It never becomes a departure: no authority was ever granted.
  if (!answer) return request.to < today ? 'lapsed-request' : 'requested';
  if (!grant) return 'refused';
  if (grant.revoked) return 'revoked';
  if (decision) return decision.kind === 'restored' ? 'restored' : 'ended-with-routine';
  if (successor) return 'renewed';
  if (today < grant.from) return 'pending-start';
  if (today <= grant.to) return 'in-force';
  // The window has ended with no decision and no continuation. This is the
  // state the whole register exists to make visible.
  return 'expired-unrestored';
}

/**
 * The contiguous renewal chain ending at one granted request. `length` counts
 * links that are adjacent (predecessor's last day, or the day before it) and
 * that continue the SAME routine owed by the SAME person. A link that fails
 * either test breaks the chain there; the break is counted, never smoothed.
 */
function chainFor(grant, ctx, seen = new Set()) {
  if (!grant || grant.decision !== 'granted') return { length: 0, start: null, end: null, broken: 0, contiguous: true, links: [] };
  if (seen.has(grant.id)) return { length: 1, start: grant.from, end: grant.to, broken: 1, contiguous: false, links: [grant.id] };
  const nextSeen = new Set(seen);
  nextSeen.add(grant.id);
  if (!grant.renewedFrom) return { length: 1, start: grant.from, end: grant.to, broken: 0, contiguous: true, links: [grant.id] };
  const predecessorRequest = ctx.requestById.get(grant.renewedFrom) || null;
  const predecessorGrant = predecessorRequest ? ctx.grantByRequest.get(predecessorRequest.id) : null;
  if (!predecessorRequest || !predecessorGrant || predecessorGrant.decision !== 'granted') {
    return { length: 1, start: grant.from, end: grant.to, broken: 1, contiguous: false, links: [grant.id] };
  }
  if (predecessorRequest.routineId !== ctx.routineId || predecessorRequest.ownerId !== ctx.ownerId) {
    return { length: 1, start: grant.from, end: grant.to, broken: 1, contiguous: false, links: [grant.id] };
  }
  const gap = standardWaiverDaysBetween(predecessorGrant.to, grant.from);
  if (gap === null || gap > 1 || gap < 0) {
    return { length: 1, start: grant.from, end: grant.to, broken: 1, contiguous: false, links: [grant.id] };
  }
  const previous = chainFor(predecessorGrant, { ...ctx, routineId: ctx.routineId, ownerId: ctx.ownerId }, nextSeen);
  return {
    length: previous.length + 1,
    start: previous.start,
    end: grant.to,
    broken: previous.broken,
    contiguous: previous.contiguous,
    links: [...previous.links, grant.id],
  };
}

/* ------------------------------------------------------------------- coverage */

/**
 * Coverage of ONE routine's own calendar: every CLOSED slot it owed inside the
 * reading horizon, and how many of those slots fell wholly inside a live grant.
 * A weekly slot with one waived day is still owed — a share is not a week.
 */
export function standardWaiverCoverage({ routine, grants, decisions, requestById, horizonFrom, today }) {
  const covered = new Set();
  for (const grant of grants) {
    if (!grant || grant.decision !== 'granted' || grant.revoked) continue;
    const request = requestById.get(grant.requestId);
    if (!request || request.routineId !== routine.id) continue;
    const decision = closingDecision(decisions, request.id);
    const end = coverageEnd(grant, decision, today);
    const start = grant.from > horizonFrom ? grant.from : horizonFrom;
    for (const day of daySpan(start, end)) covered.add(day);
  }
  const owed = [];
  const seenSlots = new Set();
  for (const day of daySpan(horizonFrom, today)) {
    const slotKey = standardWorkSlotKeyFor(routine.cadence, day);
    if (!slotKey || seenSlots.has(slotKey)) continue;
    seenSlots.add(slotKey);
    if (!standardWorkOwesSlot(routine, slotKey)) continue;
    const range = standardWorkSlotRange(routine.cadence, slotKey);
    if (!range || range.end > today) continue; // an open slot is not owed yet
    owed.push({ slotKey, ...range });
  }
  const waived = owed.filter((slot) => daySpan(slot.start, slot.end).every((day) => covered.has(day)));
  return {
    coverageDaysN: covered.size,
    todayCovered: covered.has(today),
    owedSlotsN: owed.length,
    waivedSlotsN: waived.length,
    waivedSlotKeys: waived.map((slot) => slot.slotKey),
    owedSlotKeys: owed.map((slot) => slot.slotKey),
  };
}

/* --------------------------------------------------------------------- reader */

export function buildStandardWaivers(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const cfg = settings || state?.settings || {};
  const conv = normalizeStandardWaiverSettings(cfg);
  const horizonFrom = addDays(today, -(conv[STANDARD_WAIVER_SETTING_KEYS.horizonDays] - 1));
  const { operator, actorId, reachOf } = standardWaiverSeatProjection(seat);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrix = null;
    matrixError = String(error?.message || error || 'unreadable');
  }

  const nameOf = (personId) => standardWaiverNameOf(state, matrix, personId);
  const routines = list(state?.standardWorkRoutines).filter((row) => row && row.id);
  const routineById = new Map(routines.map((row) => [row.id, row]));
  const requests = list(state?.standardWaiverRequests);
  const grants = list(state?.standardWaiverGrants);
  const decisions = list(state?.standardWaiverDecisions);

  const requestById = new Map(requests.map((row) => [row.id, row]));
  const grantByRequest = new Map();
  const allGrantsByRequest = new Map();
  for (const grant of grants) {
    if (!grant || !grant.requestId) continue;
    if (!allGrantsByRequest.has(grant.requestId)) allGrantsByRequest.set(grant.requestId, []);
    allGrantsByRequest.get(grant.requestId).push(grant);
    const answer = firstAnswer(grants, grant.requestId);
    if (answer) grantByRequest.set(grant.requestId, answer);
  }
  // A successful renewal: a GRANTED answer that names this request and starts
  // no later than the day after it ends. Only a granted, adjacent continuation
  // turns a lapse into a continuation; a refused one does not.
  const successorByRequest = new Map();
  for (const grant of grants) {
    if (!grant || grant.decision !== 'granted' || !grant.renewedFrom) continue;
    const predecessor = requestById.get(grant.renewedFrom);
    const predecessorGrant = predecessor ? grantByRequest.get(predecessor.id) : null;
    if (!predecessor || !predecessorGrant || predecessorGrant.decision !== 'granted') continue;
    const gap = standardWaiverDaysBetween(predecessorGrant.to, grant.from);
    if (gap === null || gap < 0 || gap > 1) continue;
    const existing = successorByRequest.get(predecessor.id);
    if (!existing || String(grant.at) < String(existing.at)) successorByRequest.set(predecessor.id, grant);
  }

  const refusals = [];
  if (matrixError) {
    refusals.push(`The reporting graph could not be read (${matrixError}), so no line holder can be resolved. Every stored row is printed, and no departure can be authorised until the graph reads again.`);
  }

  /* 1. One derived reading per request, for the routines in this seat's reach. */
  const rows = [];
  let outsideRequests = 0;
  for (const request of requests) {
    const routine = routineById.get(request.routineId) || null;
    if (!routine) continue; // the loader drops these; a defensive skip here changes no figure
    const reach = reachOf(routine.ownerId);
    if (!reach) { outsideRequests += 1; continue; }
    const answer = grantByRequest.get(request.id) || null;
    const grant = answer && answer.decision === 'granted' ? answer : null;
    const decision = closingDecision(decisions, request.id);
    const successor = successorByRequest.get(request.id) || null;
    const stateKey = requestState({ request, answer, grant, decision, successor, today });
    const authority = standardWaiverAuthority(matrix, routine);
    const chain = grant
      ? chainFor(grant, { requestById, grantByRequest, routineId: routine.id, ownerId: request.ownerId })
      : { length: 0, start: null, end: null, broken: 0, contiguous: true, links: [] };
    const answerCount = (allGrantsByRequest.get(request.id) || []).length;
    const authoriserId = grant ? grant.authoriserId : (answer ? answer.authoriserId : null);
    rows.push({
      id: request.id,
      routineId: routine.id,
      routineTitle: routine.title,
      routineCadence: routine.cadence,
      ownerId: request.ownerId,
      ownerName: nameOf(request.ownerId),
      lineKey: routine.lineKey,
      lineLabel: authority.lineLabel,
      authorityState: authority.state,
      authoritySays: authority.says,
      managerId: authority.managerId,
      managerName: authority.managerId ? nameOf(authority.managerId) : '—',
      kind: request.kind,
      kindLabel: STANDARD_WAIVER_KIND_BY_KEY[request.kind]?.label || request.kind,
      reason: request.reason,
      safeguard: request.safeguard,
      requestedFrom: request.from,
      requestedTo: request.to,
      requestedOn: standardWaiverDay(request.at),
      stateKey,
      stateLabel: STANDARD_WAIVER_STATE_BY_KEY[stateKey]?.label || stateKey,
      stateTone: STANDARD_WAIVER_STATE_BY_KEY[stateKey]?.tone || 'neutral',
      stateSays: STANDARD_WAIVER_STATE_BY_KEY[stateKey]?.says || '',
      answered: Boolean(answer),
      authoriserId,
      authoriserName: authoriserId ? nameOf(authoriserId) : '—',
      grantFrom: grant ? grant.from : null,
      grantTo: grant ? grant.to : null,
      basis: answer ? answer.basis : '',
      revokedOn: grant && grant.revoked ? grant.revokedOn : null,
      revokedReason: grant && grant.revoked ? grant.revokedReason : null,
      decisionKind: decision ? decision.kind : null,
      decisionLabel: decision ? (STANDARD_WAIVER_DECISION_BY_KEY[decision.kind]?.label || decision.kind) : '',
      decidedOn: decision ? decision.decidedOn : null,
      decidedByName: decision ? nameOf(decision.decidedById) : '—',
      decisionBasis: decision ? decision.basis : '',
      renewedFrom: grant ? grant.renewedFrom : null,
      successorId: successor ? successor.requestId : null,
      chainLength: chain.length,
      chainStart: chain.start,
      chainEnd: chain.end,
      chainBroken: chain.broken > 0,
      chainLinks: chain.links,
      daysGranted: grant ? standardWaiverWindowDays(grant.from, grant.to) : null,
      daysLeft: grant && stateKey === 'in-force' ? standardWaiverDaysBetween(today, grant.to) : null,
      answerCount,
      selfAuthorised: Boolean(grant && request.ownerId === grant.authoriserId),
      authorityMoved: Boolean(grant && grant.decision === 'granted' && authority.managerId && grant.authoriserId !== authority.managerId && authority.state === 'seat'),
    });
  }

  /* 2. One row per routine in reach, with its coverage and its chains. */
  const routinesInReach = routines.filter((routine) => reachOf(routine.ownerId));
  // A routine this seat cannot reach is a figure the reading does NOT contain,
  // whether or not anyone ever asked to depart from it. Counting only dropped
  // REQUESTS would let a scoped seat print "whole record" while routines were
  // silently missing from its own board.
  const outsideReach = routines.length - routinesInReach.length;
  const routineRows = [];
  for (const routine of routinesInReach) {
    const answer = standardWaiverAuthority(matrix, routine);
    const own = rows.filter((row) => row.routineId === routine.id);
    const ownGrants = grants.filter((grant) => {
      const request = requestById.get(grant.requestId);
      return request && request.routineId === routine.id && grant.decision === 'granted';
    });
    const coverage = standardWaiverCoverage({ routine, grants: ownGrants, decisions, requestById, horizonFrom, today });
    // "Waived today" is a COVERAGE fact, not a state label: a grant that was
    // later renewed still covers the days inside its own window, and reading
    // the label instead would print a routine as unwaived while its days are
    // visibly covered.
    const live = own.find((row) => ['in-force', 'renewed'].includes(row.stateKey)
      && row.grantFrom && row.grantTo && row.grantFrom <= today && today <= row.grantTo
      && !row.revokedOn && !row.decidedOn) || null;
    const lapsed = own.filter((row) => row.stateKey === 'expired-unrestored');
    const longest = ownGrants.length
      ? Math.max(...ownGrants.map((grant) => chainFor(grant, { requestById, grantByRequest, routineId: routine.id, ownerId: routine.ownerId }).length))
      : 0;
    const openChains = ownGrants
      .filter((grant) => !grant.revoked && !closingDecision(decisions, grant.requestId))
      .map((grant) => chainFor(grant, { requestById, grantByRequest, routineId: routine.id, ownerId: routine.ownerId }))
      .sort((a, b) => b.length - a.length || String(b.end).localeCompare(String(a.end)));
    const longestOpen = openChains[0] || null;
    const chainReviewDue = Boolean(longestOpen && longestOpen.length >= conv[STANDARD_WAIVER_SETTING_KEYS.renewalReviewAfter]);
    const withheld = coverage.owedSlotsN < conv[STANDARD_WAIVER_SETTING_KEYS.minOwedSlots];
    // What is happening TODAY wins over an older unresolved lapse: a routine
    // under a live authority is not "suspended by silence", and the lapse is
    // still printed and still counted below.
    const stateKey = coverage.todayCovered ? 'waived' : lapsed.length ? 'lapsed' : own.length ? 'clear' : 'never-waived';
    routineRows.push({
      routineId: routine.id,
      title: routine.title,
      cadence: routine.cadence,
      kind: routine.kind,
      standard: routine.standard,
      ownerId: routine.ownerId,
      ownerName: nameOf(routine.ownerId),
      retiredOn: routine.retiredOn,
      lineKey: routine.lineKey,
      lineLabel: answer.lineLabel,
      authorityState: answer.state,
      authoritySays: answer.says,
      managerId: answer.managerId,
      managerName: answer.managerId ? nameOf(answer.managerId) : '—',
      stateKey,
      stateLabel: STANDARD_WAIVER_ROUTINE_STATE_BY_KEY[stateKey]?.label || stateKey,
      stateTone: STANDARD_WAIVER_ROUTINE_STATE_BY_KEY[stateKey]?.tone || 'neutral',
      stateSays: STANDARD_WAIVER_ROUTINE_STATE_BY_KEY[stateKey]?.says || '',
      liveRequestId: live ? live.id : null,
      liveUntil: live ? live.grantTo : null,
      todayCovered: coverage.todayCovered,
      requestsN: own.length,
      lapsedN: lapsed.length,
      coverageDaysN: coverage.coverageDaysN,
      owedSlotsN: coverage.owedSlotsN,
      waivedSlotsN: coverage.waivedSlotsN,
      waivedSlotKeys: coverage.waivedSlotKeys,
      waivedSharePct: withheld || !coverage.owedSlotsN ? null : round1((coverage.waivedSlotsN / coverage.owedSlotsN) * 100),
      waivedShareWithheld: withheld || !coverage.owedSlotsN,
      waivedShareReason: !coverage.owedSlotsN
        ? 'No closed slot was owed inside the reading horizon, so no share can be printed.'
        : withheld
          ? `${coverage.owedSlotsN} closed owed slot(s) is fewer than the declared floor of ${conv[STANDARD_WAIVER_SETTING_KEYS.minOwedSlots]}; the counts are printed and the share is withheld.`
          : '',
      chainsN: ownGrants.filter((grant) => !grant.renewedFrom).length,
      longestChainN: longest,
      chainReviewDue,
      chainReviewAfter: conv[STANDARD_WAIVER_SETTING_KEYS.renewalReviewAfter],
      chainStart: longestOpen ? longestOpen.start : null,
      chainEnd: longestOpen ? longestOpen.end : null,
      chainBroken: own.some((row) => row.chainBroken),
      requests: own,
    });
  }

  /* 3. Totals. A state is counted once per request; a routine once per routine. */
  const stateCounts = Object.fromEntries(STANDARD_WAIVER_STATES.map((key) => [key, 0]));
  for (const row of rows) stateCounts[row.stateKey] = (stateCounts[row.stateKey] || 0) + 1;
  const statesSum = Object.values(stateCounts).reduce((sum, n) => sum + n, 0);
  const grantedStates = ['revoked', 'restored', 'ended-with-routine', 'renewed', 'in-force', 'pending-start', 'expired-unrestored'];
  const grantedN = grantedStates.reduce((sum, key) => sum + stateCounts[key], 0);
  const selfAuthorisedN = rows.filter((row) => row.selfAuthorised).length;
  const authorityMovedN = rows.filter((row) => row.authorityMoved && ['in-force', 'pending-start', 'renewed'].includes(row.stateKey)).length;
  const orphanRenewalsN = grants.filter((grant) => {
    if (!grant.renewedFrom) return false;
    const predecessor = requestById.get(grant.renewedFrom);
    return !predecessor || !grantByRequest.get(predecessor.id) || grantByRequest.get(predecessor.id).decision !== 'granted';
  }).length;
  const duplicateDecisionsN = requests.filter((request) => list(state?.standardWaiverDecisions).filter((d) => d.requestId === request.id).length > 1).length;
  const decisionsBeforeStartN = list(state?.standardWaiverDecisions).filter((decision) => {
    const grant = grantByRequest.get(decision.requestId);
    return grant && grant.decision === 'granted' && decision.decidedOn < grant.from;
  }).length;
  const answeredTwiceN = [...allGrantsByRequest.values()].filter((answers) => answers.length > 1).length;
  const coverageWithheldN = routineRows.filter((row) => row.waivedShareWithheld).length;
  const figuresComplete = operator || (outsideReach === 0 && outsideRequests === 0);
  const totals = {
    routinesN: routineRows.length,
    routinesNeverWaivedN: routineRows.filter((row) => row.stateKey === 'never-waived').length,
    routinesClearN: routineRows.filter((row) => row.stateKey === 'clear').length,
    routinesWaivedN: routineRows.filter((row) => row.stateKey === 'waived').length,
    routinesLapsedN: routineRows.filter((row) => row.stateKey === 'lapsed').length,
    routinesWithoutAuthorityN: routineRows.filter((row) => ['no-authority', 'line-ended', 'line-unknown', 'owner-off-roster'].includes(row.authorityState)).length,
    requestsN: rows.length,
    requestedN: stateCounts.requested || 0,
    refusedN: stateCounts.refused || 0,
    lapsedRequestsN: stateCounts['lapsed-request'] || 0,
    grantedN,
    liveN: stateCounts['in-force'] || 0,
    pendingStartN: stateCounts['pending-start'] || 0,
    renewedN: stateCounts.renewed || 0,
    restoredN: stateCounts.restored || 0,
    endedWithRoutineN: stateCounts['ended-with-routine'] || 0,
    revokedN: stateCounts.revoked || 0,
    expiredUnrestoredN: stateCounts['expired-unrestored'] || 0,
    stateCounts,
    statesSum,
    requestsReconcile: statesSum === rows.length,
    balances: statesSum === rows.length && grantedN === (rows.length - (stateCounts.requested || 0) - (stateCounts.refused || 0) - (stateCounts['lapsed-request'] || 0)),
    auditClean: selfAuthorisedN === 0 && authorityMovedN === 0 && orphanRenewalsN === 0 && duplicateDecisionsN === 0 && decisionsBeforeStartN === 0 && answeredTwiceN === 0,
    selfAuthorisedN,
    authorityMovedN,
    orphanRenewalsN,
    duplicateDecisionsN,
    decisionsBeforeStartN,
    answeredTwiceN,
    coverageDaysN: routineRows.reduce((sum, row) => sum + row.coverageDaysN, 0),
    owedSlotsN: routineRows.reduce((sum, row) => sum + row.owedSlotsN, 0),
    waivedSlotsN: routineRows.reduce((sum, row) => sum + row.waivedSlotsN, 0),
    coverageWithheldN,
    chainsN: routineRows.reduce((sum, row) => sum + row.chainsN, 0),
    longestChainN: routineRows.reduce((max, row) => Math.max(max, row.longestChainN), 0),
    chainReviewDueN: routineRows.filter((row) => row.chainReviewDue).length,
    outsideReachN: outsideReach,
    outsideRequestsN: outsideRequests,
    figuresComplete,
  };
  totals.waivedSharePct = totals.owedSlotsN && !coverageWithheldN ? round1((totals.waivedSlotsN / totals.owedSlotsN) * 100) : null;

  const attention = [
    ...rows.filter((row) => row.stateKey === 'expired-unrestored').map((row) => ({
      kind: 'waiver-lapsed', requestId: row.id, routineId: row.routineId, ownerName: row.ownerName,
      title: `${row.routineTitle} — suspended by silence`,
      says: `The last day was ${row.grantTo} and no decision records the standard back in force. The departure now outlives the authority for it.`,
    })),
    ...routineRows.filter((row) => row.chainReviewDue).map((row) => ({
      kind: 'chain-review', requestId: row.liveRequestId, routineId: row.routineId, ownerName: row.ownerName,
      title: `${row.title} — renewed ${row.longestChainN} times without a break`,
      says: `A departure renewed ${row.longestChainN} times in an unbroken run is no longer temporary. Either the standard or the practice has to change, and that decision sits above the person who kept authorising it.`,
    })),
  ];

  return {
    today,
    at: at.toISOString(),
    engineVersion: STANDARD_WAIVER_ENGINE_VERSION,
    scope: operator ? 'workspace' : 'seat',
    actorId,
    actorName: nameOf(actorId),
    detailLevel: 'visible',
    detailReason: STANDARD_WAIVER_DETAIL_REASONS.visible,
    periods: { today, horizonFrom, horizonTo: today },
    conventions: {
      defaultDays: conv[STANDARD_WAIVER_SETTING_KEYS.defaultDays],
      maxDays: conv[STANDARD_WAIVER_SETTING_KEYS.maxDays],
      renewalReviewAfter: conv[STANDARD_WAIVER_SETTING_KEYS.renewalReviewAfter],
      askDueDays: conv[STANDARD_WAIVER_SETTING_KEYS.askDueDays],
      horizonDays: conv[STANDARD_WAIVER_SETTING_KEYS.horizonDays],
      minOwedSlots: conv[STANDARD_WAIVER_SETTING_KEYS.minOwedSlots],
      autoPropagate: conv[STANDARD_WAIVER_SETTING_KEYS.autoPropagate],
    },
    kinds: STANDARD_WAIVER_KINDS,
    routines: routineRows,
    requests: rows,
    totals,
    attention,
    refusals,
    internal: { matrix, requestById, grantByRequest, decisions, routines, matrixError },
  };
}

/** The tab badge, and what the navigation counts. Cheap: one read, no writes. */
export function standardWaiverAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  if (!list(state?.standardWaiverRequests).length) return 0;
  try {
    return buildStandardWaivers(state, { now, settings, seat }).attention.length;
  } catch {
    return 0;
  }
}

/** A plain-language brief over the same reader. One figure, one sentence. */
export function standardWaiverBriefText(report) {
  if (!report) return '';
  const t = report.totals;
  const lines = [
    `Temporary standard waivers — ${report.today}`,
    `${t.routinesN} routine(s) in view; ${t.routinesNeverWaivedN} never waived, ${t.routinesClearN} with the standard in force, ${t.routinesWaivedN} waived today, ${t.routinesLapsedN} suspended by silence.`,
    `${t.requestsN} request(s): ${t.requestedN} awaiting the line holder, ${t.refusedN} refused, ${t.lapsedRequestsN} lapsed unanswered. ${t.grantedN} authority(ies) were granted — ${t.liveN} live today, ${t.pendingStartN} starting later, ${t.renewedN} continued by a renewal, ${t.restoredN} closed with the standard restored, ${t.endedWithRoutineN} ended with a retired routine, ${t.revokedN} revoked, ${t.expiredUnrestoredN} expired with no decision.`,
    t.owedSlotsN
      ? `${t.waivedSlotsN} of ${t.owedSlotsN} closed owed slot(s) in the last ${report.conventions.horizonDays} days fell wholly inside an authorised departure${t.waivedSharePct === null ? ' (the share is withheld: too few closed slots in the declared floor, or a routine in view has too few)' : ` — ${t.waivedSharePct}%`}.`
      : 'No closed owed slot has fallen inside the reading horizon yet.',
    t.chainReviewDueN
      ? `${t.chainReviewDueN} routine(s) carry a renewal chain at or beyond ${report.conventions.renewalReviewAfter} unbroken links: a temporary departure that has stopped being temporary, and a decision that belongs above the person who kept authorising it.`
      : 'No renewal chain has reached the review threshold.',
    `Integrity: ${t.selfAuthorisedN} self-authorised grant(s), ${t.authorityMovedN} live authority(ies) whose line holder has since changed, ${t.orphanRenewalsN} renewal link(s) that do not resolve. ${t.auditClean ? 'The register reconciles cleanly.' : 'The register does not reconcile cleanly; see the counts above.'}`,
    'No person is rated here. A waiver records authority over a departure and the day it ended — never whether the departure was wise.',
  ];
  return lines.join('\n');
}

/**
 * CSV scope #154. One workspace row, one row per derived state, one row per
 * routine under an opaque positional code `R01`, `R02`… NO person, NO manager,
 * NO routine id, NO title, NO reason, NO safeguard and NO basis text. A figure
 * that cannot be claimed exports BLANK with its reason, never zero.
 */
export function standardWaiverCsvRows(report) {
  if (!report) return [];
  const t = report.totals;
  const common = {
    generated_on: report.today,
    scope: report.scope,
    detail_level: report.detailLevel,
    engine_version: report.engineVersion,
    figures_complete: t.figuresComplete ? 'YES' : 'NO',
    claim_reason: t.figuresComplete ? '' : `${t.outsideReachN} routine(s) and ${t.outsideRequestsN} request(s) outside this seat’s reach are not counted in these rows`,
    max_days: report.conventions.maxDays,
    renewal_review_after: report.conventions.renewalReviewAfter,
    horizon_days: report.conventions.horizonDays,
    ask_due_days: report.conventions.askDueDays,
  };
  const rows = [{
    row_type: 'workspace',
    state_key: '',
    state_n: '',
    routine_code: '',
    routine_state: '',
    ...common,
    routines_n: t.routinesN,
    routines_never_waived_n: t.routinesNeverWaivedN,
    routines_clear_n: t.routinesClearN,
    routines_waived_n: t.routinesWaivedN,
    routines_lapsed_n: t.routinesLapsedN,
    requests_n: t.requestsN,
    requests_requested_n: t.requestedN,
    requests_refused_n: t.refusedN,
    requests_lapsed_n: t.lapsedRequestsN,
    waivers_granted_n: t.grantedN,
    waivers_live_n: t.liveN,
    waivers_pending_start_n: t.pendingStartN,
    waivers_renewed_n: t.renewedN,
    waivers_restored_n: t.restoredN,
    waivers_ended_with_routine_n: t.endedWithRoutineN,
    waivers_revoked_n: t.revokedN,
    waivers_expired_unrestored_n: t.expiredUnrestoredN,
    states_sum_n: t.statesSum,
    requests_reconcile: t.requestsReconcile ? 'YES' : 'NO',
    balances: t.balances ? 'YES' : 'NO',
    audit_clean: t.auditClean ? 'YES' : 'NO',
    coverage_days_n: t.coverageDaysN,
    closed_owed_slots_n: t.owedSlotsN,
    waived_slots_n: t.waivedSlotsN,
    waived_share_pct: blank(t.waivedSharePct),
    waived_share_withheld_reason: t.waivedSharePct === null && t.owedSlotsN ? `${t.coverageWithheldN} routine(s) in view fall below the closed-slot floor` : '',
    chains_n: t.chainsN,
    longest_chain_n: t.longestChainN,
    chains_review_due_n: t.chainReviewDueN,
    renewals_broken_n: t.orphanRenewalsN,
    self_authorised_n: t.selfAuthorisedN,
    authority_moved_n: t.authorityMovedN,
    decisions_before_start_n: t.decisionsBeforeStartN,
    duplicate_decisions_n: t.duplicateDecisionsN,
    coverage_withheld_n: t.coverageWithheldN,
  }];
  for (const state of STANDARD_WAIVER_STATES) {
    rows.push({
      row_type: 'state',
      state_key: state,
      state_n: t.stateCounts[state] || 0,
      routine_code: '',
      routine_state: '',
      ...common,
      states_sum_n: t.statesSum,
      requests_n: t.requestsN,
      requests_reconcile: t.requestsReconcile ? 'YES' : 'NO',
    });
  }
  report.routines.forEach((routine, index) => {
    rows.push({
      row_type: 'routine',
      state_key: '',
      state_n: '',
      routine_code: `R${String(index + 1).padStart(2, '0')}`,
      routine_state: routine.stateKey,
      ...common,
      routines_n: 1,
      requests_n: routine.requestsN,
      coverage_days_n: routine.coverageDaysN,
      closed_owed_slots_n: routine.owedSlotsN,
      waived_slots_n: routine.waivedSlotsN,
      waived_share_pct: blank(routine.waivedSharePct),
      waived_share_withheld_reason: routine.waivedShareWithheld ? routine.waivedShareReason : '',
      chains_n: routine.chainsN,
      longest_chain_n: routine.longestChainN,
      chains_review_due_n: routine.chainReviewDue ? 1 : 0,
      renewals_broken_n: routine.chainBroken ? 1 : 0,
    });
  });
  return rows;
}
