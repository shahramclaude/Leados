/**
 * app/core/domain/authorityContinuity.js — the Matrix Authority Continuity
 * Register's pure read model (ADR-0156, Schema v128 unchanged, `#/matrix?panel=continuity`,
 * CSV scope #117).
 *
 * THE QUESTION, ASKED OF THE PORTFOLIO
 * ------------------------------------
 * A chief does not hold one kind of frozen decision. They hold a PORTFOLIO: a
 * finalised pay cycle, a decided decision record, a frozen board memo. Each is
 * a frozen decision record. Each names an authority — a home line frozen
 * beside the money, or an approver's name.
 *
 * The board asks the portfolio question, not the per-record question:
 *
 *   "Are our frozen decisions still attributable to the authority that made
 *    them — and which ones are not?"
 *
 * ADR-0155 gave ONE type (a finalised merit cycle) the ability to prove its
 * own structure. This register asks the portfolio question over every frozen
 * decision record the workspace stores, and it REFUSES the portfolio claim
 * whenever any part of the population cannot be compared.
 *
 * THE THREE FACTS THIS MODULE KEEPS APART
 * ----------------------------------------
 *   1. WHAT THE RECORD CLAIMS. The authority the record itself names, in the
 *      record's own words. Never re-derived, never inferred.
 *   2. WHAT WAS IN FORCE. The authority the shared engines say held the
 *      relevant right on the record's OWN date — read through the SAME as-of
 *      structure engine (ADR-0155) and the SAME matrix engine (ADR-0140) the
 *      rest of the workspace uses, never today's chart.
 *   3. WHAT MAY THEREFORE BE CLAIMED. The verdict, and — separately — whether
 *      a POPULATION claim may be made at all.
 *
 * TWO CLAIMS, NEVER COLLAPSED
 * ----------------------------
 *   "the covered records agree" and "the whole portfolio agrees" are two
 *   different facts. The second is refused whenever the covered population is
 *   below the declared floor OR any covered record did not agree OR any
 *   record could not be read. An absence is the one thing a continuity claim
 *   must never absorb — the population-completeness principle (AICPA AU-C 500)
 *   applied to an audit population.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never rewrites a record. A drifted record is NAMED. The remedy is a
 *    human re-affirming the record, recorded as a separate dated act.
 *  - It never scores a person. Every verdict is about a PAIR — a record and
 *    the authority it names.
 *  - It never assigns a manager to a record that names none. `unattributed` is
 *    counted, not filled in.
 *  - It never drops a record it could not read. `unreadable` is counted and
 *    printed with its reason.
 *  - It never guesses a subject. A decision whose subject cannot be resolved
 *    through a typed edge is compared against the approver's OWN span, and
 *    that fallback is printed as such — it is a weaker reading, not the same
 *    reading.
 *  - It never writes. Every figure is derived on read from records the
 *    workspace already stores; nothing is persisted, so a printed finding
 *    cannot drift from the rows it describes.
 *
 * Pure module: no DOM, no storage, no implicit clock beyond the injected
 * `now` and each record's own date.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { linksForEntity } from './cases.js';
import { buildMeritStructure, compareFrozenStructure } from './meritStructure.js';
import {
  AUTHORITY_CONTINUITY_CONVENTIONS,
  AUTHORITY_CONTINUITY_CSV_COLUMNS,
  AUTHORITY_CONTINUITY_ENGINE_VERSION,
  AUTHORITY_CONTINUITY_LIMITS,
  AUTHORITY_CONTINUITY_METHOD,
  AUTHORITY_CONTINUITY_RIGHTS,
  AUTHORITY_CONTINUITY_TYPE_KEYS,
  AUTHORITY_CONTINUITY_TYPES,
  AUTHORITY_CONTINUITY_VERDICTS,
} from './authorityContinuityRegistry.js';

const VERDICT_META = new Map(AUTHORITY_CONTINUITY_VERDICTS.map((v) => [v.key, v]));
const TYPE_META = new Map(AUTHORITY_CONTINUITY_TYPES.map((t) => [t.key, t]));

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));
const dayOf = (v) => (isDay(v) ? String(v).trim().slice(0, 10) : null);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

/* ------------------------------------------------------------- name lookup */

/**
 * Roster name → person ids, exact and case-insensitive — the same resolution
 * `rightsConcordance` uses, so a name that resolves in one module resolves in
 * the other and a name that does not resolves in neither.
 *
 * The workspace leader holds no roster record: their name comes from the
 * settings and maps to `LEADER_ID`, so a record approved by the leader still
 * resolves.
 */
function buildNameIndex(state) {
  const index = new Map();
  const add = (name, personId) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    if (!index.get(key).includes(personId)) index.get(key).push(personId);
  };
  for (const person of Array.isArray(state?.people) ? state.people : []) {
    if (!person || person.status === 'archived') continue;
    add(person.name, person.id);
  }
  add(state?.settings?.leaderName || 'You', LEADER_ID);
  return index;
}

/**
 * Resolve one free-text participant name to a roster person.
 * `{ resolved: true, personId }` or `{ resolved: false, reason }` where the
 * reason is `not-on-roster` or `ambiguous` — the two honest failure modes.
 */
function resolveParticipant(nameIndex, rawName) {
  const key = String(rawName || '').trim().toLowerCase();
  if (!key) return { resolved: false, reason: 'not-on-roster' };
  const ids = nameIndex.get(key);
  if (!ids || !ids.length) return { resolved: false, reason: 'not-on-roster' };
  if (ids.length > 1) return { resolved: false, reason: 'ambiguous' };
  return { resolved: true, personId: ids[0] };
}

/**
 * The person(s) a decision concerned, resolved ONLY through typed graph edges —
 * a link to a `person`, or a link to a `case` whose recorded `ownerId` is the
 * person whose work the case is about. Never guessed from the approver's own
 * span; a decision with no usable subject is a LIMIT of the comparison and is
 * printed as one.
 */
function resolveSubjects(state, recordId, rosterIds) {
  const subjects = [];
  const seen = new Set();
  if (!recordId) return subjects;
  for (const item of linksForEntity(state, 'decision', recordId)) {
    const peer = item.peer;
    if (!peer) continue;
    let personId = null;
    if (peer.type === 'person') {
      personId = peer.id;
    } else if (peer.type === 'case') {
      personId = peer.raw?.ownerId || null;
    }
    if (!personId || !rosterIds.has(personId)) continue;
    if (seen.has(personId)) continue;
    seen.add(personId);
    subjects.push(personId);
  }
  return subjects;
}

/* --------------------------------------------------- the as-of structure */

/**
 * The structure as it stood on one day, read through the SAME engine ADR-0155
 * built.
 *
 * `buildMeritStructure` already does the hard part: it substitutes each
 * person's home pointer with the pointer the RECORD says they had on the day,
 * and then runs the shared `buildMatrix` engine over that substituted state.
 * The `asOfMatrix` it returns therefore has the home line the record says, and
 * the declared additional lines filtered by their own windows at that day.
 *
 * Reusing it is the whole point: there is ONE hierarchy engine in this
 * workspace, and a second window implementation would be how the two could
 * disagree.
 */
function asOfStructure(state, asOf, { now, settings }, cache) {
  const key = String(asOf);
  if (!cache.has(key)) {
    const structure = buildMeritStructure(state, { asOf, now, settings });
    cache.set(key, {
      structure,
      matrix: structure.asOfMatrix,
      perPerson: structure.perPerson,
    });
  }
  return cache.get(key);
}

/**
 * Who held a right over a person on a date, and whether the right was
 * CONTESTED (held by more than one manager) or UNOWNED (held by nobody).
 *
 * A contested right is the matrix condition ADR-0140 exists to surface: the
 * structure duplicated the authority. A record that names one of two holders
 * reproduces an authority the structure had duplicated, and the register says
 * so rather than picking one.
 */
function rightHoldersAtDate(matrixAtDate, personId, rightKey) {
  const lines = matrixAtDate?.linesByPerson?.get(personId) || [];
  const holders = [];
  for (const line of lines) {
    const held = new Set([...(line.rights || []), ...(line.presumedRights || [])]);
    if (held.has(rightKey) && !holders.includes(line.managerId)) holders.push(line.managerId);
  }
  return {
    holders,
    state: holders.length > 1 ? 'contested' : holders.length === 1 ? 'held' : 'unowned',
  };
}

/* ------------------------------------------------------------ record reading */

/**
 * Read every finalised merit cycle — the one frozen decision type that can
 * prove its own structure (ADR-0155).
 *
 * The comparison is the SAME `compareFrozenStructure` contract the merit-parity
 * reader uses, so the two modules can never disagree about whether a cycle
 * drifted.
 */
function readMeritCycles(state, { now, settings }, cache) {
  const rows = [];
  const cycles = Array.isArray(state?.meritCycles) ? state.meritCycles : [];
  for (const cycle of cycles) {
    if (!cycle || cycle.status !== 'finalized') continue;
    const asOf = dayOf(cycle.effectiveOn);
    const structure = asOf ? asOfStructure(state, asOf, { now, settings }, cache) : null;
    const frozen = cycle.audit?.structure || null;
    const comparison = compareFrozenStructure(frozen, structure?.structure || null);
    const verdict = comparison.key === 'identical'
      ? 'attributable'
      : comparison.key === 'drifted'
        ? 'drifted'
        : comparison.key === 'not-frozen'
          ? 'unattributed'
          : 'unreadable';
    rows.push({
      recordId: cycle.id || null,
      type: 'merit-cycle',
      asOf,
      label: text(cycle.label) || 'Merit cycle',
      frozenAuthority: frozen ? `frozen home line for ${frozen.rowN} pay recipient(s)` : null,
      authorityName: null,
      authorityPersonId: null,
      authorityWithheld: false,
      authorityWithheldReason: null,
      verdict,
      differenceN: comparison.differenceN || 0,
      differences: (comparison.differences || []).slice(0, AUTHORITY_CONTINUITY_LIMITS.differencesPerRecord),
      reason: comparison.key === 'not-frozen'
        ? 'This cycle froze no structure block, so the record cannot name the home line that held the pay right when the money landed.'
        : comparison.key === 'unreadable'
          ? 'The frozen structure block could not be read, so nothing about this cycle\'s authority can be compared.'
          : comparison.key === 'drifted'
            ? `${comparison.differenceN} difference(s) between the frozen structure and the authority in force on ${asOf}.`
            : null,
      subjectN: frozen?.rowN ?? 0,
      rightKey: AUTHORITY_CONTINUITY_RIGHTS['merit-cycle'].key,
      rightLabel: AUTHORITY_CONTINUITY_RIGHTS['merit-cycle'].label,
      route: 'frozen-structure',
    });
  }
  return rows;
}

/**
 * Read the decided decision records.
 *
 * The authority a decision record names is its DACI APPROVER. The authority in
 * force on the decision's own date is read against the SUBJECT's lines when the
 * subject can be resolved through a typed edge, and against the APPROVER'S OWN
 * SPAN when it cannot — the weaker reading, and printed as such.
 */
function readDecisions(state, { now, settings, nameIndex, rosterIds }, cache) {
  const rows = [];
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  for (const decision of decisions) {
    if (!decision || !decision.chosen) continue;
    const asOf = dayOf(decision.decidedOn) || dayOf(decision.date);
    if (!asOf) continue;
    const approverName = text(decision.approver);
    const resolved = resolveParticipant(nameIndex, approverName);

    if (!approverName) {
      rows.push({
        recordId: decision.id || null,
        type: 'decision',
        asOf,
        label: text(decision.title) || 'Decision',
        frozenAuthority: null,
        authorityName: null,
        authorityPersonId: null,
        authorityWithheld: false,
        authorityWithheldReason: null,
        verdict: 'unattributed',
        differenceN: 0,
        differences: [],
        reason: 'This decision names no approver, so there is no authority to compare and it cannot be attributed to anyone.',
        subjectN: 0,
        rightKey: AUTHORITY_CONTINUITY_RIGHTS.decision.key,
        rightLabel: AUTHORITY_CONTINUITY_RIGHTS.decision.label,
        route: 'none',
      });
      continue;
    }
    if (!resolved.resolved) {
      rows.push({
        recordId: decision.id || null,
        type: 'decision',
        asOf,
        label: text(decision.title) || 'Decision',
        frozenAuthority: approverName,
        authorityName: null,
        authorityPersonId: null,
        authorityWithheld: false,
        authorityWithheldReason: null,
        verdict: 'unreadable',
        differenceN: 0,
        differences: [],
        reason: resolved.reason === 'ambiguous'
          ? `The approver name "${approverName}" matches more than one roster person, so the authority cannot be resolved and no comparison is made.`
          : `The approver "${approverName}" is not on this workspace's roster, so the authority cannot be resolved and no comparison is made.`,
        subjectN: 0,
        rightKey: AUTHORITY_CONTINUITY_RIGHTS.decision.key,
        rightLabel: AUTHORITY_CONTINUITY_RIGHTS.decision.label,
        route: 'none',
      });
      continue;
    }

    const subjects = resolveSubjects(state, decision.id, rosterIds);
    const asOfState = asOfStructure(state, asOf, { now, settings }, cache);
    const comparison = compareApproverAuthority({
      matrixAtDate: asOfState.matrix,
      approverId: resolved.personId,
      approverName,
      subjects,
      rightKey: AUTHORITY_CONTINUITY_RIGHTS.decision.key,
    });
    rows.push({
      recordId: decision.id || null,
      type: 'decision',
      asOf,
      label: text(decision.title) || 'Decision',
      frozenAuthority: approverName,
      authorityName: approverName,
      authorityPersonId: resolved.personId,
      authorityWithheld: false,
      authorityWithheldReason: null,
      verdict: comparison.verdict,
      differenceN: comparison.differences.length,
      differences: comparison.differences.slice(0, AUTHORITY_CONTINUITY_LIMITS.differencesPerRecord),
      reason: comparison.reason,
      subjectN: subjects.length,
      rightKey: AUTHORITY_CONTINUITY_RIGHTS.decision.key,
      rightLabel: AUTHORITY_CONTINUITY_RIGHTS.decision.label,
      route: comparison.route,
    });
  }
  return rows;
}

/**
 * Read the board memos that were FROZEN, COMMITTED or SUPERSEDED — the ones
 * the board was actually shown. A draft memo is not a frozen decision and is
 * not in the population.
 *
 * A board memo carries NO approver field: the authority it names is its
 * `ownerNodeId` (a roster node) or, failing that, its `ownerSeatId`. A memo
 * with neither names no authority and reads `unattributed` — it is not
 * assigned one.
 */
function readBoardMemos(state, { now, settings, rosterIds }, cache) {
  const rows = [];
  const memos = Array.isArray(state?.boardMemos) ? state.boardMemos : [];
  for (const memo of memos) {
    if (!memo) continue;
    if (!['frozen', 'committed', 'superseded'].includes(memo.status)) continue;
    const asOf = dayOf(memo.committedAt) || dayOf(memo.frozenAt);
    if (!asOf) continue;

    const ownerNodeId = text(memo.ownerNodeId);
    const ownerSeatId = text(memo.ownerSeatId);
    const resolvedNode = ownerNodeId && rosterIds.has(ownerNodeId)
      ? { resolved: true, personId: ownerNodeId }
      : ownerNodeId
        ? { resolved: false, reason: 'not-on-roster' }
        : ownerSeatId
          ? { resolved: false, reason: 'seat-not-resolvable' }
          : { resolved: false, reason: 'none-named' };

    if (!ownerNodeId && !ownerSeatId) {
      rows.push({
        recordId: memo.id || null,
        type: 'board-memo',
        asOf,
        label: text(memo.title) || 'Board memo',
        frozenAuthority: null,
        authorityName: null,
        authorityPersonId: null,
        authorityWithheld: false,
        authorityWithheldReason: null,
        verdict: 'unattributed',
        differenceN: 0,
        differences: [],
        reason: 'This memo names no owner, so there is no authority to compare and it cannot be attributed to anyone.',
        subjectN: 0,
        rightKey: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].key,
        rightLabel: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].label,
        route: 'none',
      });
      continue;
    }
    if (!resolvedNode.resolved) {
      rows.push({
        recordId: memo.id || null,
        type: 'board-memo',
        asOf,
        label: text(memo.title) || 'Board memo',
        frozenAuthority: ownerNodeId || ownerSeatId,
        authorityName: null,
        authorityPersonId: null,
        authorityWithheld: false,
        authorityWithheldReason: null,
        verdict: 'unreadable',
        differenceN: 0,
        differences: [],
        reason: resolvedNode.reason === 'seat-not-resolvable'
          ? 'This memo names an owning seat rather than a roster person, and the seat cannot be resolved to a person from the record, so no comparison is made.'
          : `This memo names "${ownerNodeId}" as its owner, but that person is not on this workspace's roster, so no comparison is made.`,
        subjectN: 0,
        rightKey: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].key,
        rightLabel: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].label,
        route: 'none',
      });
      continue;
    }
    // A board memo has no typed subject: it concerns the WORKSPACE. The
    // approver's own span is therefore the only honest reading, and the
    // fallback is stated on the row.
    const asOfState = asOfStructure(state, asOf, { now, settings }, cache);
    const ownerName = ownerNameOf(state, resolvedNode.personId);
    const comparison = compareApproverAuthority({
      matrixAtDate: asOfState.matrix,
      approverId: resolvedNode.personId,
      approverName: ownerName,
      subjects: [],
      rightKey: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].key,
    });
    rows.push({
      recordId: memo.id || null,
      type: 'board-memo',
      asOf,
      label: text(memo.title) || 'Board memo',
      frozenAuthority: ownerName,
      authorityName: ownerName,
      authorityPersonId: resolvedNode.personId,
      authorityWithheld: false,
      authorityWithheldReason: null,
      verdict: comparison.verdict,
      differenceN: comparison.differences.length,
      differences: comparison.differences.slice(0, AUTHORITY_CONTINUITY_LIMITS.differencesPerRecord),
      reason: comparison.reason,
      subjectN: 0,
      rightKey: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].key,
      rightLabel: AUTHORITY_CONTINUITY_RIGHTS['board-memo'].label,
      route: comparison.route,
    });
  }
  return rows;
}

/** The display name of a roster person, or their id when they hold no record. */
function ownerNameOf(state, personId) {
  if (personId === LEADER_ID) return state?.settings?.leaderName || 'You';
  const person = (Array.isArray(state?.people) ? state.people : [])
    .find((p) => p && p.id === personId);
  return text(person?.name) || personId;
}

/**
 * Compare an approver against the authority in force on a date.
 *
 * Two routes, and the route used is PRINTED:
 *
 *  - SUBJECT ROUTE. The record's subject resolved through a typed edge. The
 *    approver must have held a right over that subject's lines on the date.
 *  - SPAN ROUTE. No resolvable subject. The approver must have been a
 *    MANAGER with reports on that date — the only authority a person can hold
 *    over their own span. This is a weaker reading and says so.
 */
function compareApproverAuthority({ matrixAtDate, approverId, approverName, subjects, rightKey }) {
  const differences = [];

  if (subjects.length) {
    let heldOnSomeSubject = false;
    let contestedOnSomeSubject = false;
    let unownedOnSomeSubject = false;
    const otherHolders = new Set();
    for (const subjectId of subjects) {
      const { holders, state } = rightHoldersAtDate(matrixAtDate, subjectId, rightKey);
      if (state === 'unowned') unownedOnSomeSubject = true;
      if (state === 'contested') contestedOnSomeSubject = true;
      if (holders.includes(approverId)) {
        heldOnSomeSubject = true;
      } else {
        for (const holder of holders) otherHolders.add(holder);
      }
    }
    if (heldOnSomeSubject) {
      const reason = contestedOnSomeSubject
        ? `The approver held the ${rightKey} right over the subject on the record's own date, but the right was CONTESTED — more than one manager held it — so the record reproduces an authority the structure duplicated.`
        : `The approver held the ${rightKey} right over the subject's lines on the record's own date.`;
      return { verdict: 'attributable', differences, reason, route: 'subject' };
    }
    if (unownedOnSomeSubject && !otherHolders.size) {
      return {
        verdict: 'drifted',
        differences: [{
          kind: 'right-unowned',
          detail: 'No manager held the relevant right over the subject on the record\'s own date, so the record names an authority the structure did not attribute to anyone.',
        }],
        reason: 'No manager held the relevant right over the subject on the record\'s own date, so the record names an authority the structure did not attribute to anyone.',
        route: 'subject',
      };
    }
    for (const holder of otherHolders) {
      differences.push({
        kind: 'authority-moved',
        approverId,
        holderId: holder,
        detail: `The record names ${approverName}; on the record's own date the relevant right over the subject was held by a different manager.`,
      });
    }
    return {
      verdict: 'drifted',
      differences,
      reason: `The record names ${approverName}, but on the record's own date a different manager held the relevant right over the subject.`,
      route: 'subject',
    };
  }

  /* ---- SPAN ROUTE: no resolvable subject ---- */
  if (approverId === LEADER_ID) {
    // The workspace leader holds the home line's rights over their direct
    // reports by definition; they are the apex of the graph.
    return {
      verdict: 'attributable',
      differences,
      reason: 'The approver is the workspace leader, who holds the home line\'s rights over their direct reports.',
      route: 'span',
    };
  }
  // The direct-report count lives on the CHAIN node, not on the matrix node:
  // the matrix node carries the DAG wiring, the chain node carries the span.
  const chainNode = matrixAtDate?.chain?.nodes?.get(approverId) || null;
  const spanN = Number(chainNode?.span) || 0;
  if (spanN > 0) {
    return {
      verdict: 'attributable',
      differences,
      reason: `The record has no typed subject, so the comparison is made against the approver's own span: on the record's own date ${approverName} managed ${spanN} person(s) and therefore held authority over their work. This is a WEAKER reading than a subject comparison and is printed as such.`,
      route: 'span',
    };
  }
  return {
    verdict: 'drifted',
    differences: [{
      kind: 'no-span',
      approverId,
      detail: `On the record's own date ${approverName} managed nobody, so held no authority over any work, and the record names them as its approver.`,
    }],
    reason: `On the record's own date ${approverName} managed nobody, so they held no authority over any work, and the record names them as its approver.`,
    route: 'span',
  };
}

/* ------------------------------------------------------------------ the read */

/**
 * THE READ. Everything is derived from the record; nothing is stored.
 *
 * @param {object} state   the workspace state (people, decisions, cases, links,
 *                         reportingLines, meritCycles, boardMemos, settings)
 * @param {object} opts    { now, settings, seat, scope }
 */
export function buildAuthorityContinuity(state, {
  now = new Date(),
  settings = null,
  seat = null,
  scope = undefined,
} = {}) {
  const effectiveSettings = settings || state?.settings || null;
  const today = dayKey(now);

  /* The seat and its scope, computed the same way the matrix report computes
     them — so a line manager's register is scoped, and a full-access seat sees
     the workspace. */
  let seatRow = seat;
  let scopeSet = scope;
  if (scopeSet === undefined) {
    if (!seatRow) {
      const lineScope = matrixLineScopeFor(state, { now, settings: effectiveSettings });
      const built = buildSeats(state, { now, settings: effectiveSettings, lineScope });
      seatRow = activeSeat(built);
    }
    scopeSet = seatRow?.fullAccess ? null : new Set([
      ...(seatRow?.scope || []),
      ...(seatRow?.lineScope || []),
    ]);
  }
  const inScope = (personId) => !scopeSet || scopeSet.has(personId);

  const rosterIds = new Set(
    (Array.isArray(state?.people) ? state.people : [])
      .filter((p) => p && p.status !== 'archived')
      .map((p) => p.id),
  );
  rosterIds.add(LEADER_ID);
  const nameIndex = buildNameIndex(state);
  const cache = new Map();

  const allRows = [
    ...readMeritCycles(state, { now, settings: effectiveSettings }, cache),
    ...readDecisions(state, { now, settings: effectiveSettings, nameIndex, rosterIds }, cache),
    ...readBoardMemos(state, { now, settings: effectiveSettings, rosterIds }, cache),
  ];

  /* ---- seat scoping ---------------------------------------------------- */
  //
  // A seat without full access sees only the records it can already see. A
  // merit cycle is scoped by its pay recipients (the people the cycle touches);
  // a decision or a memo is scoped by the people it concerns, or — where the
  // record has no resolvable subject — by the approver's own span.
  const scoped = [];
  const outOfScopeN = { 'merit-cycle': 0, decision: 0, 'board-memo': 0 };
  for (const row of allRows) {
    if (!scopeSet) { scoped.push(row); continue; }
    let visible = false;
    if (row.type === 'merit-cycle') {
      const asOfState = asOfStructure(state, row.asOf, { now, settings: effectiveSettings }, cache);
      visible = [...asOfState.perPerson.keys()].some((id) => inScope(id));
    } else {
      const subjects = row.type === 'decision'
        ? resolveSubjects(state, row.recordId, rosterIds)
        : [];
      if (subjects.length) {
        visible = subjects.some((id) => inScope(id));
      } else {
        const resolved = resolveParticipant(nameIndex, row.frozenAuthority || '');
        visible = resolved.resolved ? inScope(resolved.personId) : false;
      }
    }
    if (visible) {
      /* ---- the authority NAME is scoped, not just the record ----------- */
      //
      // A record can be in scope because it CONCERNS someone in the seat's
      // span while the authority it names sits outside it. The concordance
      // module withholds exactly that name; this register does the same, so a
      // line manager cannot learn who approved a decision about their person
      // by reading a panel they are entitled to open. The VERDICT and the
      // counts always survive — only the name is withheld.
      if (row.authorityPersonId && !inScope(row.authorityPersonId)) {
        scoped.push({
          ...row,
          authorityName: null,
          authorityWithheld: true,
          authorityWithheldReason: 'The authority this record names sits outside this seat’s span, so the name is withheld. The verdict and the counts are unaffected.',
        });
        continue;
      }
      scoped.push(row);
    } else outOfScopeN[row.type] += 1;
  }

  /* ---- the population -------------------------------------------------- */
  //
  // COVERED: a record this register CAN compare — the frozen authority was
  // read and the authority in force was read.
  // UNCOVERED: a record it cannot compare, for any reason.
  //
  // The uncovered population is NEVER dropped: it is counted, and it is the
  // thing that decides whether a population claim may be made at all.
  const covered = scoped.filter((row) => row.verdict !== 'unreadable');
  const uncovered = scoped.filter((row) => row.verdict === 'unreadable');

  const byVerdict = new Map(AUTHORITY_CONTINUITY_VERDICTS.map((v) => [v.key, 0]));
  for (const row of scoped) byVerdict.set(row.verdict, (byVerdict.get(row.verdict) || 0) + 1);

  const byType = new Map();
  for (const type of AUTHORITY_CONTINUITY_TYPE_KEYS) {
    const rows = scoped.filter((row) => row.type === type);
    const coveredRows = rows.filter((row) => row.verdict !== 'unreadable');
    const uncoveredRows = rows.filter((row) => row.verdict === 'unreadable');
    byType.set(type, {
      key: type,
      label: TYPE_META.get(type)?.label || type,
      detail: TYPE_META.get(type)?.detail || '',
      totalN: rows.length,
      coveredN: coveredRows.length,
      uncoveredN: uncoveredRows.length,
      driftedN: rows.filter((row) => row.verdict === 'drifted').length,
      unattributedN: rows.filter((row) => row.verdict === 'unattributed').length,
      unreadableN: uncoveredRows.length,
      attributableN: rows.filter((row) => row.verdict === 'attributable').length,
      differenceN: rows.reduce((sum, row) => sum + (row.differenceN || 0), 0),
      rows,
    });
  }

  /* ---- THE POPULATION CLAIM ------------------------------------------- */
  //
  // Two facts, never collapsed:
  //   (a) do the covered records agree?  → `coveredAgree`
  //   (b) may the claim be made about the whole portfolio? → `populationClaim`
  //
  // (b) is REFUSED when the covered population is below the declared floor, or
  // when ANY covered record did not agree, or when any record could not be
  // read. An absence is never absorbed.
  const coveredN = covered.length;
  const driftedN = byVerdict.get('drifted') || 0;
  const unattributedN = byVerdict.get('unattributed') || 0;
  const attributableN = byVerdict.get('attributable') || 0;
  const coveredAgree = coveredN > 0 && driftedN === 0 && unattributedN === 0;

  const reasons = [];
  if (coveredN < AUTHORITY_CONTINUITY_CONVENTIONS.populationFloor) {
    reasons.push(`Only ${coveredN} frozen decision record(s) could be compared, below the declared floor of ${AUTHORITY_CONTINUITY_CONVENTIONS.populationFloor}. Counts print; the portfolio claim is refused.`);
  }
  if (uncovered.length) {
    reasons.push(`${uncovered.length} frozen decision record(s) could not be read and are excluded from the comparison. An absence is never absorbed into a continuity claim.`);
  }
  if (driftedN) {
    reasons.push(`${driftedN} covered record(s) name an authority that is no longer the one in force on their own date.`);
  }
  if (unattributedN) {
    reasons.push(`${unattributedN} covered record(s) name no authority at all and cannot be attributed to anyone.`);
  }

  const populationClaim = reasons.length === 0;
  const populationClaimReason = populationClaim
    ? `All ${coveredN} comparable frozen decision record(s) still name the authority that was in force on their own date, and the population is complete.`
    : reasons.join(' ');

  /* ---- the bounded table ----------------------------------------------- */
  const rank = (key) => VERDICT_META.get(key)?.rank ?? 99;
  const ordered = [...scoped].sort((a, b) => rank(a.verdict) - rank(b.verdict)
    || String(a.asOf).localeCompare(String(b.asOf))
    || String(a.type).localeCompare(String(b.type)));
  const cap = AUTHORITY_CONTINUITY_CONVENTIONS.recordCap;
  const shown = ordered.slice(0, cap);
  const remainderN = ordered.length - shown.length;

  const refusals = [];
  if (uncovered.length) {
    refusals.push({
      kind: 'unreadable-records',
      detail: `${uncovered.length} frozen decision record(s) could not be read. They are counted in every total and their reason is printed on the row; none is dropped and none is quietly excluded so the headline looks better.`,
    });
  }
  if (remainderN) {
    refusals.push({
      kind: 'record-cap',
      detail: `${remainderN} further record(s) are past the bounded table of ${cap}. They are counted in every total above and merely not rendered here.`,
    });
  }
  const outOfScopeTotal = Object.values(outOfScopeN).reduce((a, b) => a + b, 0);
  if (outOfScopeTotal && scopeSet) {
    refusals.push({
      kind: 'seat-scope',
      detail: `${outOfScopeTotal} frozen decision record(s) sit outside this seat's scope and are not counted in any figure on this page.`,
    });
  }

  return {
    engineVersion: AUTHORITY_CONTINUITY_ENGINE_VERSION,
    today,
    hasMatrix: hasDeclaredMatrix(state),
    rows: shown,
    rowN: ordered.length,
    remainderN,
    totalN: scoped.length,
    coveredN,
    uncoveredN: uncovered.length,
    driftedN,
    unattributedN,
    attributableN,
    uncovered,
    byType,
    byVerdict: Object.fromEntries(byVerdict),
    coveredAgree,
    populationClaim,
    populationClaimReason,
    populationFloor: AUTHORITY_CONTINUITY_CONVENTIONS.populationFloor,
    refusals,
    outOfScopeN,
    methods: AUTHORITY_CONTINUITY_METHOD,
    conventions: AUTHORITY_CONTINUITY_CONVENTIONS,
    limits: AUTHORITY_CONTINUITY_LIMITS,
    types: AUTHORITY_CONTINUITY_TYPES,
    rights: AUTHORITY_CONTINUITY_RIGHTS,
    seat: seatRow,
    scope: scopeSet,
  };
}

function hasDeclaredMatrix(state) {
  const lines = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  return lines.length > 0;
}

/* ------------------------------------------------------------------- brief */

/**
 * The identity-free brief. It names no record, no title and no person — a chief
 * reads it and knows what to do, and nobody in it can be identified from it.
 */
export function authorityContinuityBriefLines(report) {
  if (!report) return [];
  const lines = [];
  lines.push(`Matrix authority continuity — ${report.totalN} frozen decision record(s) in scope, ${report.coveredN} comparable.`);
  lines.push(report.populationClaimReason);
  lines.push(`Attributable ${report.attributableN}; drifted ${report.driftedN}; no authority named ${report.unattributedN}; unreadable ${report.uncoveredN}.`);
  for (const [, bucket] of report.byType) {
    if (!bucket.totalN) continue;
    lines.push(`${bucket.label}: ${bucket.totalN} record(s) — attributable ${bucket.attributableN}, drifted ${bucket.driftedN}, unattributed ${bucket.unattributedN}, unreadable ${bucket.uncoveredN}.`);
  }
  for (const refusal of report.refusals) lines.push(refusal.detail);
  return lines;
}

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #117 — aggregate only. One summary row plus one row per frozen
 * decision TYPE. No record id, no title, no person id, no manager id, no name,
 * no date of any individual decision.
 */
export function authorityContinuityCsvRows(report) {
  if (!report) return [];
  const base = {
    row_kind: 'summary',
    type: 'all',
    verdict: '',
    covered_n: report.coveredN,
    uncovered_n: report.uncoveredN,
    drifted_n: report.driftedN,
    unattributed_n: report.unattributedN,
    unreadable_n: report.uncoveredN,
    attributable_n: report.attributableN,
    difference_n: report.driftedN,
    population_claim: report.populationClaim ? 'granted' : 'refused',
    population_claim_reason: report.populationClaimReason,
    reconciles: report.coveredN + report.uncoveredN === report.totalN ? 'yes' : 'no',
  };
  const rows = [base];
  for (const [, bucket] of report.byType) {
    if (!bucket.totalN) continue;
    rows.push({
      row_kind: 'type',
      type: bucket.key,
      verdict: '',
      covered_n: bucket.coveredN,
      uncovered_n: bucket.uncoveredN,
      drifted_n: bucket.driftedN,
      unattributed_n: bucket.unattributedN,
      unreadable_n: bucket.unreadableN,
      attributable_n: bucket.attributableN,
      difference_n: bucket.differenceN,
      population_claim: '',
      population_claim_reason: '',
      reconciles: bucket.coveredN + bucket.uncoveredN === bucket.totalN ? 'yes' : 'no',
    });
  }
  return rows.map((row) => ({
    ...row,
    ...Object.fromEntries(AUTHORITY_CONTINUITY_CSV_COLUMNS.map((key) => [
      key,
      row[key] === undefined || row[key] === null ? '' : row[key],
    ])),
  }));
}
