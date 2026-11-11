/**
 * app/core/domain/sodRegister.js — the Cross-Line Segregation-of-Duties Register
 * (ADR-0170, Schema v135 unchanged, `#/matrix?panel=sod`, CSV scope #125).
 *
 * THE DUTY, IN A CHIEF'S WORDS
 * ----------------------------
 * *"Show me every call we made where one hand both proposed it and signed it
 * off — and every call where the person who signed it off reports to the person
 * who proposed it. On the chart I can see the second kind. Through a project
 * line I cannot."* The decision log has named a Driver and an Approver on every
 * decision since it was built, and the matrix ledger has stored every declared
 * line with its dates and its rights. Nothing had ever read the two against each
 * other.
 *
 * WHAT IS READ
 * ------------
 *   same hand        the Driver and the Approver are one roster person
 *   dependent hand   on the decision day the Approver reported to the Driver —
 *                    over the home chain, or ONLY through a declared second line
 *   custody          the Approver owns a case the decision is typed-linked to
 *
 * and, for every conflict, the seat(s) that sat directly above the senior hand
 * that day: one, several (a tie the matrix created), or none.
 *
 * WHAT IT REFUSES, AND WHY THAT IS THE PRODUCT
 * --------------------------------------------
 *  - A role holding a title, a team, a body or an unknown name is REFUSED. A
 *    conflict is never inferred from a title.
 *  - A role naming several people is REFUSED, not split.
 *  - A past decision is read against the structure of ITS OWN DAY. Declared
 *    lines by their dated windows through the shared matrix engine; home lines
 *    from the structure-history ledger (ADR-0149). Where a home line above the
 *    hand has history that does not cover the day, the dependence question is
 *    REFUSED — neither a finding nor a pass. Where no history exists at all,
 *    today's pointer is used and PRINTED as a presumption.
 *  - A rate over fewer tested decisions than the declared floor, or over a set
 *    that contains an unreadable decision, is BLANK with its reason.
 *  - Outside the acting seat's span a decision is counted as withheld and folded
 *    into no other figure.
 *
 * NOTHING IS STORED and nothing is blocked. This module writes no collection,
 * revokes no right, reopens no decision and rates no person.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixLineScope } from './matrix.js';
import { MATRIX_RIGHTS, MATRIX_STEWARDSHIP_RIGHTS, matrixLineKind } from './matrixRegistry.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildStructureLedger, homeLineOn, rosterStatusOn } from './structureHistory.js';
import { STRUCTURE_OBSERVATION_STATES } from './structureHistoryRegistry.js';
import { buildNameIndex, resolveParticipant, splitParticipants } from './rightsConcordance.js';
import {
  SOD_BOUNDS,
  SOD_CLASSES,
  SOD_CONVENTIONS,
  SOD_DECISION_STATES,
  SOD_DUTIES,
  SOD_ENGINE_VERSION,
  SOD_LIMITS_TEXT,
  SOD_METHOD,
  SOD_RECORD_REFUSALS,
  SOD_ROUTES,
  SOD_BASES,
  SOD_SEAT_STATES,
  SOD_STRUCTURE_REFUSALS,
  SOD_TIERS,
  sodBasis,
  sodClass,
  sodRoute,
  sodSeatState,
  sodStructureRefusal,
  sodTier,
  sodTierFor,
} from './sodRegisterRegistry.js';

const RIGHT_ORDER = new Map(MATRIX_RIGHTS.map((right, index) => [right.key, index]));

const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Exact integer per-mille of `part` in `whole`, or null when there is no
 * denominator — an absence, never a zero dressed as a rate.
 */
export function sodPermille(part, whole) {
  if (!Number.isInteger(part) || !Number.isInteger(whole) || whole <= 0) return null;
  return Math.round((part * 1000) / whole);
}

/* ------------------------------------------------------------- the two hands */

/**
 * Read ONE role field of a decision.
 *
 *   missing     the field is empty
 *   resolved    the whole field is exactly one active roster name
 *   several     the field lists more than one name (the DACI list grammar)
 *   unresolved  one name, and it is not on the roster or two people share it
 *
 * The whole field is tried first, so a roster name that itself contains a comma
 * or an ampersand still resolves instead of being split into strangers.
 */
export function readHand(nameIndex, rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) return { state: 'missing', personId: null, reason: null };
  const whole = resolveParticipant(nameIndex, text);
  if (whole.resolved) return { state: 'resolved', personId: whole.personId, reason: null };
  if (splitParticipants(text).length > 1) return { state: 'several', personId: null, reason: null };
  return { state: 'unresolved', personId: null, reason: whole.reason };
}

/* ------------------------------------------------ the structure of one day */

/**
 * The reporting graph as it stood on one calendar day, with the basis of every
 * home line stated.
 *
 * Declared lines are filtered by their own dated windows by the shared matrix
 * engine, re-run AT that day — never a second window implementation. Home lines
 * come from the structure-history ledger (ADR-0149):
 *
 *   recorded    a recorded period covers the day — the manager is a fact
 *   presumed    the person has NO recorded history at all, so nothing says the
 *               line ever changed; today's pointer is used and printed as a
 *               presumption
 *   unrecorded  the person HAS recorded history and none of it covers the day —
 *               who they reported to that day was never recorded
 *   not-placed  by the roster's own dates the person was not on the roster that
 *               day, or the engine refused their home line on that day
 *
 * Only `recorded` and `presumed` home lines are ever walked.
 */
function createStructureReader(state, settings) {
  const ledger = buildStructureLedger(state);
  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const cache = new Map();

  const structureOn = (day) => {
    if (cache.has(day)) return cache.get(day);
    const homeState = new Map();
    const substitutions = new Map();
    for (const person of people) {
      if (person.status === 'archived') continue;
      if (rosterStatusOn(person, day)) {
        homeState.set(person.id, 'not-placed');
        continue;
      }
      const line = homeLineOn(ledger, person.id, day);
      if (line.state === STRUCTURE_OBSERVATION_STATES.observed) {
        homeState.set(person.id, 'recorded');
        const recorded = line.managerId === LEADER_ID ? null : line.managerId;
        if (recorded !== (person.managerId || null)) substitutions.set(person.id, recorded);
      } else {
        homeState.set(person.id, ledger.byPerson.has(person.id) ? 'unrecorded' : 'presumed');
      }
    }
    const asOfState = substitutions.size
      ? {
        ...state,
        people: state.people.map((p) => (p && substitutions.has(p.id)
          ? { ...p, managerId: substitutions.get(p.id) }
          : p)),
      }
      : state;
    const matrix = buildMatrix(asOfState, { now: new Date(`${day}T12:00:00.000Z`), settings });
    // The engine can refuse a home line the substitution produced (a recorded
    // manager who is no longer on the roster, a loop a later re-organisation
    // undid). A refused line is an OPEN chain, never a silent root.
    for (const [personId, basis] of homeState) {
      if (basis !== 'recorded' && basis !== 'presumed') continue;
      const hasHome = (matrix.linesByPerson.get(personId) || []).some((line) => line.role === 'primary');
      if (!hasHome) homeState.set(personId, 'not-placed');
    }
    const structure = { day, matrix, homeState };
    cache.set(day, structure);
    return structure;
  };

  return { ledger, structureOn, daysRead: () => cache.size };
}

const homeReadable = (basis) => basis === 'recorded' || basis === 'presumed';

/**
 * Breadth-first climb from one person toward a target over the lines `allow`
 * admits. Returns the shortest admitted path, and — whatever `allow` says — the
 * reasons the chain above the start is OPEN (a home line that cannot be walked).
 */
function climb(structure, fromId, targetId, allow) {
  const parent = new Map();
  const seen = new Set([fromId]);
  const open = new Set();
  let frontier = [fromId];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      if (id === LEADER_ID) continue;
      const basis = structure.homeState.get(id) || 'not-placed';
      if (basis === 'unrecorded') open.add('home-line-unrecorded');
      else if (basis === 'not-placed') open.add('not-placed');
      for (const line of structure.matrix.linesByPerson.get(id) || []) {
        if (!allow(line, basis)) continue;
        if (seen.has(line.managerId)) continue;
        seen.add(line.managerId);
        parent.set(line.managerId, { from: id, line, basis });
        if (line.managerId === targetId) {
          const path = [];
          let cursor = targetId;
          while (cursor !== fromId) {
            const step = parent.get(cursor);
            path.unshift(step);
            cursor = step.from;
          }
          return { found: true, path, open };
        }
        next.push(line.managerId);
      }
    }
    frontier = next;
  }
  return { found: false, path: [], open };
}

/**
 * Was the authorizing hand accountable to the initiating hand on that day?
 *
 *   dependent    a path over walkable lines exists; `route`, `basis`, the hop
 *                count, the kinds of second line on the path and — where the
 *                Driver holds a direct line over the Approver — the rights that
 *                line declares
 *   independent  no path exists and the chain above the Approver is closed
 *   unreadable   no path was found, but the chain above the Approver is OPEN, so
 *                dependence is neither established nor excluded
 */
export function readDependence(structure, approverId, driverId) {
  const walkable = (line, basis) => line.role !== 'primary' || homeReadable(basis);
  const all = climb(structure, approverId, driverId, walkable);
  if (!all.found) {
    if (all.open.size) {
      return {
        state: 'unreadable',
        reason: all.open.has('home-line-unrecorded') ? 'home-line-unrecorded' : 'not-placed',
      };
    }
    return { state: 'independent' };
  }
  const home = climb(structure, approverId, driverId, (line, basis) => line.role === 'primary' && homeReadable(basis));
  const route = home.found ? 'home-chain' : 'second-line';
  const strict = route === 'home-chain'
    ? climb(structure, approverId, driverId, (line, basis) => line.role === 'primary' && basis === 'recorded')
    : climb(structure, approverId, driverId, (line, basis) => line.role !== 'primary' || basis === 'recorded');
  const path = route === 'home-chain' ? home.path : all.path;
  const viaKinds = [...new Set(path.filter((step) => step.line.role !== 'primary').map((step) => step.line.kind).filter(Boolean))].sort();
  const direct = path.length === 1 ? path[0].line : null;
  const rights = direct
    ? [...new Set(direct.rights || [])].sort((a, b) => (RIGHT_ORDER.get(a) ?? 99) - (RIGHT_ORDER.get(b) ?? 99))
    : [];
  return {
    state: 'dependent',
    route,
    basis: strict.found ? 'recorded' : 'presumed',
    hops: path.length,
    direct: Boolean(direct),
    viaKinds,
    rights,
    presumedRights: direct ? [...(direct.presumedRights || [])] : [],
    stewardship: rights.some((right) => MATRIX_STEWARDSHIP_RIGHTS.includes(right)),
  };
}

/**
 * The seat(s) directly above one hand on that day — who could supply an
 * independent second hand.
 */
export function readSeatAbove(structure, handId) {
  if (handId === LEADER_ID) {
    return { state: 'none', seatIds: [], apexId: null, apexAmbiguous: false, presumed: false, reason: null };
  }
  if (!structure) {
    return { state: 'unreadable', seatIds: [], apexId: null, apexAmbiguous: false, presumed: false, reason: 'no-decision-day' };
  }
  const basis = structure.homeState.get(handId) || 'not-placed';
  if (!homeReadable(basis)) {
    return {
      state: 'unreadable',
      seatIds: [],
      apexId: null,
      apexAmbiguous: false,
      presumed: false,
      reason: basis === 'unrecorded' ? 'home-line-unrecorded' : 'not-placed',
    };
  }
  const seatIds = [...new Set((structure.matrix.linesByPerson.get(handId) || []).map((line) => line.managerId))];
  if (!seatIds.length) {
    return { state: 'unreadable', seatIds: [], apexId: null, apexAmbiguous: false, presumed: false, reason: 'not-placed' };
  }
  if (seatIds.length === 1) {
    return { state: 'unique', seatIds, apexId: seatIds[0], apexAmbiguous: false, presumed: basis === 'presumed', reason: null };
  }
  const apex = matrixJointApex(structure.matrix, seatIds);
  return {
    state: 'tie',
    seatIds: seatIds.slice().sort(),
    apexId: apex.unique ? apex.apexId : null,
    apexAmbiguous: !apex.unique,
    presumed: basis === 'presumed',
    reason: null,
  };
}

/* ------------------------------------------------------------------ custody */

/**
 * For every decision, the owners of the cases it is typed-linked to. Only a
 * typed decision↔case edge counts, and only an owner who is on the roster: a
 * custody claim is never read from a title or a free-text field.
 */
function indexCaseOwners(state, rosterIds) {
  const cases = new Map();
  for (const record of Array.isArray(state?.cases) ? state.cases : []) {
    if (record && record.id) cases.set(record.id, record);
  }
  const byDecision = new Map();
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link) continue;
    let decisionId = null;
    let caseId = null;
    if (link.sourceType === 'decision' && link.targetType === 'case') {
      decisionId = link.sourceId;
      caseId = link.targetId;
    } else if (link.sourceType === 'case' && link.targetType === 'decision') {
      decisionId = link.targetId;
      caseId = link.sourceId;
    } else {
      continue;
    }
    const ownerId = cases.get(caseId)?.ownerId || null;
    if (!ownerId || !rosterIds.has(ownerId)) continue;
    if (!byDecision.has(decisionId)) byDecision.set(decisionId, new Map());
    byDecision.get(decisionId).set(caseId, ownerId);
  }
  return byDecision;
}

/* --------------------------------------------------------------- seat scope */

/** The seat's visibility, stated once so the screen, the brief and the export agree. */
function seatScope(state, matrix, now, settings) {
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now, settings, lineScope: lineScope.byManager });
  const seat = activeSeat(built);
  if (!seat || seat.fullAccess) {
    return { seat, visible: () => true, scopeLabel: 'the whole workspace', fullAccess: true };
  }
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
    fullAccess: false,
  };
}

/* ------------------------------------------------------------ the read model */

function emptyTierCounts() {
  const out = {};
  for (const tier of SOD_TIERS) out[tier.key] = 0;
  return out;
}

/**
 * THE READ. Everything is derived from the record; nothing is stored.
 *
 * @param {object} state  the workspace state (decisions, people, reportingLines,
 *                        structureHistory, links, cases, settings)
 * @param {object} opts   { now, settings }
 */
export function buildSodRegister(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state?.settings || {};
  const matrixToday = buildMatrix(state, { now: at, settings: cfg });
  const { seat, visible, scopeLabel, fullAccess } = seatScope(state, matrixToday, at, cfg);
  const reader = createStructureReader(state, cfg);
  const nameIndex = buildNameIndex(state);
  const rosterIds = new Set(matrixToday.nodes.keys());
  const caseOwners = indexCaseOwners(state, rosterIds);
  const nameOf = (personId) => matrixToday.nodes.get(personId)?.name || personId;
  const shownName = (personId) => (visible(personId) ? nameOf(personId) : null);

  /* ------------------------------------------------------------ population */
  const decisionsAll = Array.isArray(state?.decisions) ? state.decisions : [];
  const decided = decisionsAll.filter((d) => d && d.id && String(d.chosen || '').trim());
  const dayOfDecision = (decision) => (isDay(decision.decidedOn) ? decision.decidedOn : null);
  const ordered = decided.slice().sort((a, b) => {
    const da = dayOfDecision(a) || '';
    const db = dayOfDecision(b) || '';
    if (da !== db) return da < db ? 1 : -1;
    return String(a.id).localeCompare(String(b.id));
  });
  const read = ordered.slice(0, SOD_BOUNDS.decisions);
  const omittedN = ordered.length - read.length;

  /* ---------------------------------------------------------- accumulators */
  let outsideSeatN = 0;
  let inSeatN = 0;
  let testedN = 0;
  let ambiguousNameN = 0;
  const tested = emptyTierCounts();
  const stateCounts = { conflict: 0, unreadable: 0, clear: 0 };
  const stateTier = { conflict: emptyTierCounts(), unreadable: emptyTierCounts(), clear: emptyTierCounts() };
  const recordRefusals = new Map(SOD_RECORD_REFUSALS.map((r) => [r.key, 0]));
  const structureRefusals = new Map(SOD_STRUCTURE_REFUSALS.map((r) => [r.key, 0]));
  const seatCounts = new Map(SOD_SEAT_STATES.map((s) => [s.key, 0]));
  const classCounts = new Map(SOD_CLASSES.map((c) => [c.key, {
    n: 0, tiers: emptyTierCounts(), presumedN: 0, homeChainN: 0, secondLineN: 0, stewardshipN: 0,
  }]));
  const conflictRows = [];
  const unreadableRows = [];
  let custodyTestedN = 0;

  for (const decision of read) {
    const driver = readHand(nameIndex, decision.driver);
    const approver = readHand(nameIndex, decision.approver);
    const placeable = fullAccess
      || [driver.personId, approver.personId].some((personId) => personId && visible(personId));
    if (!placeable) {
      // Outside the acting seat: counted, and folded into no other figure.
      outsideSeatN += 1;
      continue;
    }
    inSeatN += 1;

    const refusal = approver.state === 'missing' ? 'no-approver'
      : driver.state === 'missing' ? 'no-driver'
        : (driver.state === 'several' || approver.state === 'several') ? 'several-named'
          : (driver.state === 'unresolved' || approver.state === 'unresolved') ? 'unresolved-hand'
            : null;
    if (refusal) {
      recordRefusals.set(refusal, recordRefusals.get(refusal) + 1);
      if (refusal === 'unresolved-hand' && [driver, approver].some((hand) => hand.reason === 'ambiguous')) {
        ambiguousNameN += 1;
      }
      continue;
    }

    const driverId = driver.personId;
    const approverId = approver.personId;
    const tier = sodTierFor(decision.reversibility);
    const day = dayOfDecision(decision);
    const structure = day ? reader.structureOn(day) : null;
    testedN += 1;
    tested[tier] += 1;

    /* 1. One hand, or two? And if two, is the second one independent? */
    const classes = [];
    let dependence = { state: 'not-applicable' };
    if (driverId === approverId) {
      classes.push({ key: 'same-hand', basis: 'recorded' });
    } else if (!structure) {
      dependence = { state: 'unreadable', reason: 'no-decision-day' };
    } else {
      dependence = readDependence(structure, approverId, driverId);
      if (dependence.state === 'dependent') {
        classes.push({
          key: 'dependent-hand',
          basis: dependence.basis,
          route: dependence.route,
          hops: dependence.hops,
          direct: dependence.direct,
          viaKinds: dependence.viaKinds,
          rights: dependence.rights,
          presumedRights: dependence.presumedRights,
          stewardship: dependence.stewardship,
        });
      }
    }

    /* 2. Does the authorizing hand also hold the object? */
    const owners = caseOwners.get(decision.id) || null;
    let custodyCasesN = 0;
    if (owners && owners.size) {
      custodyTestedN += 1;
      for (const ownerId of owners.values()) if (ownerId === approverId) custodyCasesN += 1;
      if (custodyCasesN) classes.push({ key: 'custody-and-approval', basis: 'presumed', casesN: custodyCasesN });
    }

    const stateKey = classes.length ? 'conflict' : dependence.state === 'unreadable' ? 'unreadable' : 'clear';
    stateCounts[stateKey] += 1;
    stateTier[stateKey][tier] += 1;

    const title = String(decision.title || 'Untitled decision').slice(0, SOD_BOUNDS.titleChars);
    const hands = {
      driverId,
      approverId,
      driverName: shownName(driverId),
      approverName: shownName(approverId),
      driverWithheld: !visible(driverId),
      approverWithheld: !visible(approverId),
    };

    if (stateKey === 'unreadable') {
      structureRefusals.set(dependence.reason, structureRefusals.get(dependence.reason) + 1);
      unreadableRows.push({
        decisionId: decision.id,
        title,
        decidedOn: day,
        tier,
        tierLabel: sodTier(tier).label,
        ...hands,
        reason: dependence.reason,
        reasonLabel: sodStructureRefusal(dependence.reason).label,
        reasonDetail: sodStructureRefusal(dependence.reason).detail,
      });
      continue;
    }
    if (stateKey === 'clear') continue;

    /* 3. A conflict: count every class, and read the seat above the senior hand. */
    for (const entry of classes) {
      const bucket = classCounts.get(entry.key);
      bucket.n += 1;
      bucket.tiers[tier] += 1;
      if (entry.basis === 'presumed') bucket.presumedN += 1;
      if (entry.route === 'home-chain') bucket.homeChainN += 1;
      if (entry.route === 'second-line') bucket.secondLineN += 1;
      if (entry.stewardship) bucket.stewardshipN += 1;
    }
    // Where the Approver sits below the Driver, the Driver is the senior hand:
    // only a seat above the DRIVER is above both of them.
    const seniorHandId = classes.some((c) => c.key === 'dependent-hand') ? driverId : approverId;
    const seatAbove = readSeatAbove(structure, seniorHandId);
    seatCounts.set(seatAbove.state, seatCounts.get(seatAbove.state) + 1);

    conflictRows.push({
      decisionId: decision.id,
      title,
      decidedOn: day,
      tier,
      tierLabel: sodTier(tier).label,
      tierTone: sodTier(tier).tone,
      ...hands,
      seniorHandId,
      classKeys: classes.map((c) => c.key),
      classes: classes.map((entry) => ({
        ...entry,
        label: sodClass(entry.key).label,
        short: sodClass(entry.key).short,
        tone: sodClass(entry.key).tone,
        basisLabel: sodBasis(entry.basis).label,
        routeLabel: entry.route ? sodRoute(entry.route).label : null,
      })),
      // A custody conflict can stand on a decision whose dependence question
      // the structure could not answer. That refusal is carried on the row.
      dependenceUnreadable: dependence.state === 'unreadable' ? dependence.reason : null,
      seat: {
        state: seatAbove.state,
        label: sodSeatState(seatAbove.state).label,
        tone: sodSeatState(seatAbove.state).tone,
        seatN: seatAbove.seatIds.length,
        seatNames: seatAbove.seatIds.filter((id) => visible(id)).map((id) => nameOf(id)).sort(),
        seatWithheldN: seatAbove.seatIds.filter((id) => !visible(id)).length,
        apexName: seatAbove.apexId && visible(seatAbove.apexId) ? nameOf(seatAbove.apexId) : null,
        apexWithheld: Boolean(seatAbove.apexId) && !visible(seatAbove.apexId),
        apexAmbiguous: seatAbove.apexAmbiguous,
        presumed: seatAbove.presumed,
        reason: seatAbove.reason,
        reasonLabel: seatAbove.reason ? sodStructureRefusal(seatAbove.reason).label : null,
      },
    });
  }

  /* ----------------------------------------------------------------- rows */
  const rank = (row) => Math.min(...row.classes.map((c) => (
    c.key === 'dependent-hand' ? (c.route === 'second-line' ? 1 : 2) : sodClass(c.key).rank === 0 ? 0 : 3
  )));
  const byDayDesc = (a, b) => {
    const da = a.decidedOn || '';
    const db = b.decidedOn || '';
    if (da !== db) return da < db ? 1 : -1;
    return String(a.decisionId).localeCompare(String(b.decisionId));
  };
  conflictRows.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'one-way' ? -1 : 1)
    || rank(a) - rank(b)
    || byDayDesc(a, b));
  unreadableRows.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'one-way' ? -1 : 1) || byDayDesc(a, b));
  const rows = conflictRows.slice(0, SOD_BOUNDS.rows);
  const rowsOmittedN = conflictRows.length - rows.length;
  const unreadableShown = unreadableRows.slice(0, SOD_BOUNDS.unreadableRows);
  const unreadableOmittedN = unreadableRows.length - unreadableShown.length;

  /* ------------------------------------------------------------ the pairs */
  // The same two hands, counted once per pair rather than once per decision: a
  // hundred calls signed by one hand are one fact about a control, not a hundred
  // rows. A count of recorded roles — never a rating of either person.
  const pairMap = new Map();
  for (const row of conflictRows) {
    const key = `${row.driverId}|${row.approverId}`;
    if (!pairMap.has(key)) {
      pairMap.set(key, {
        driverId: row.driverId,
        approverId: row.approverId,
        driverName: row.driverName,
        approverName: row.approverName,
        driverWithheld: row.driverWithheld,
        approverWithheld: row.approverWithheld,
        sameHand: row.driverId === row.approverId,
        decisionsN: 0,
        oneWayN: 0,
        twoWayN: 0,
        sameHandN: 0,
        dependentHandN: 0,
        secondLineN: 0,
        custodyN: 0,
        lastOn: null,
      });
    }
    const pair = pairMap.get(key);
    pair.decisionsN += 1;
    if (row.tier === 'one-way') pair.oneWayN += 1; else pair.twoWayN += 1;
    for (const entry of row.classes) {
      if (entry.key === 'same-hand') pair.sameHandN += 1;
      else if (entry.key === 'dependent-hand') {
        pair.dependentHandN += 1;
        if (entry.route === 'second-line') pair.secondLineN += 1;
      } else pair.custodyN += 1;
    }
    if (row.decidedOn && (!pair.lastOn || row.decidedOn > pair.lastOn)) pair.lastOn = row.decidedOn;
  }
  const pairRows = [...pairMap.values()].sort((a, b) => b.oneWayN - a.oneWayN
    || b.decisionsN - a.decisionsN
    || String(a.driverName || '').localeCompare(String(b.driverName || ''))
    || String(a.approverName || '').localeCompare(String(b.approverName || ''))
    || String(a.driverId).localeCompare(String(b.driverId))
    || String(a.approverId).localeCompare(String(b.approverId)));
  const pairs = pairRows.slice(0, SOD_BOUNDS.pairs);
  const pairsOmittedN = pairRows.length - pairs.length;

  /* --------------------------------------------- hierarchy / matrix roll-up */
  // Every conflict rolls up to every leadership span that holds its senior hand
  // TODAY, through the home line and through every declared second line. A hand
  // on two lines therefore appears in two branches: the rows are not additive,
  // and the distinct total is printed beside them.
  const spanMap = new Map();
  const spanOf = (spanId) => {
    if (!spanMap.has(spanId)) {
      spanMap.set(spanId, { spanId, ownN: 0, belowN: 0, oneWayN: 0, secondLineN: 0, noSeatN: 0 });
    }
    return spanMap.get(spanId);
  };
  let sharedN = 0;
  for (const row of conflictRows) {
    const node = matrixToday.nodes.get(row.seniorHandId) || null;
    if (!node) continue;
    const hasSecondLine = row.classes.some((c) => c.route === 'second-line');
    const touch = (spanId, own) => {
      const span = spanOf(spanId);
      if (own) span.ownN += 1; else span.belowN += 1;
      if (row.tier === 'one-way') span.oneWayN += 1;
      if (hasSecondLine) span.secondLineN += 1;
      if (row.seat.state === 'none') span.noSeatN += 1;
    };
    if (row.seniorHandId === LEADER_ID || node.descendants.size > 0) touch(row.seniorHandId, true);
    for (const ancestorId of node.ancestors) touch(ancestorId, false);
    if ((matrixToday.linesByPerson.get(row.seniorHandId) || []).length >= 2) sharedN += 1;
  }
  const spanRows = [...spanMap.values()]
    .filter((span) => visible(span.spanId))
    .map((span) => {
      const node = matrixToday.nodes.get(span.spanId) || null;
      return {
        ...span,
        spanName: nameOf(span.spanId),
        depth: node?.depth ?? null,
        isLeader: span.spanId === LEADER_ID,
        totalN: span.ownN + span.belowN,
      };
    })
    .sort((a, b) => ((a.depth ?? 99) - (b.depth ?? 99))
      || b.totalN - a.totalN
      || String(a.spanName).localeCompare(String(b.spanName)));
  const spans = spanRows.slice(0, SOD_BOUNDS.spans);
  const spansOmittedN = spanRows.length - spans.length;

  /* ---------------------------------------------------------------- board */
  const conflictN = stateCounts.conflict;
  const unreadableN = stateCounts.unreadable;
  const clearN = stateCounts.clear;
  const refusedN = [...recordRefusals.values()].reduce((acc, n) => acc + n, 0);
  const findingsN = [...classCounts.values()].reduce((acc, c) => acc + c.n, 0);
  const findingsTier = emptyTierCounts();
  for (const c of classCounts.values()) for (const tier of SOD_TIERS) findingsTier[tier.key] += c.tiers[tier.key];
  const dependent = classCounts.get('dependent-hand');
  const presumedBasisN = [...classCounts.values()].reduce((acc, c) => acc + c.presumedN, 0);

  const rate = (conflicts, base, unreadable) => {
    if (base < SOD_BOUNDS.rateFloor) {
      return {
        permille: null,
        reason: `Only ${base} tested decision(s); the declared floor for a share is ${SOD_BOUNDS.rateFloor}.`,
      };
    }
    if (unreadable > 0) {
      return {
        permille: null,
        reason: `${unreadable} tested decision(s) cannot be read for independence, so a share of the tested decisions would understate the conflicts. The refusal is printed rather than the ratio.`,
      };
    }
    return { permille: sodPermille(conflicts, base), reason: null };
  };
  const overallRate = rate(conflictN, testedN, unreadableN);
  const oneWayRate = rate(stateTier.conflict['one-way'], tested['one-way'], stateTier.unreadable['one-way']);

  const identities = {
    read: decided.length === read.length + omittedN,
    seat: read.length === inSeatN + outsideSeatN,
    tested: inSeatN === testedN + refusedN,
    states: testedN === conflictN + unreadableN + clearN,
    tiers: SOD_TIERS.every((tier) => tested[tier.key] === stateTier.conflict[tier.key] + stateTier.unreadable[tier.key] + stateTier.clear[tier.key])
      && testedN === SOD_TIERS.reduce((acc, tier) => acc + tested[tier.key], 0),
    seats: conflictN === [...seatCounts.values()].reduce((acc, n) => acc + n, 0),
    structure: unreadableN === [...structureRefusals.values()].reduce((acc, n) => acc + n, 0),
    findings: [...classCounts.values()].every((c) => c.n === SOD_TIERS.reduce((acc, tier) => acc + c.tiers[tier.key], 0))
      && findingsN >= conflictN,
    routes: dependent.n === dependent.homeChainN + dependent.secondLineN,
    rows: rows.length + rowsOmittedN === conflictN
      && unreadableShown.length + unreadableOmittedN === unreadableN,
    pairs: pairRows.reduce((acc, pair) => acc + pair.decisionsN, 0) === conflictN
      && pairRows.every((pair) => pair.decisionsN === pair.oneWayN + pair.twoWayN),
  };
  const countsReconcile = Object.values(identities).every(Boolean);

  const board = {
    decidedN: decided.length,
    openN: decisionsAll.filter((d) => d && d.id).length - decided.length,
    readN: read.length,
    omittedN,
    outsideSeatN,
    inSeatN,
    testedN,
    testedOneWayN: tested['one-way'],
    testedTwoWayN: tested['two-way'],
    refusedN,
    ambiguousNameN,
    conflictN,
    conflictOneWayN: stateTier.conflict['one-way'],
    conflictTwoWayN: stateTier.conflict['two-way'],
    unreadableN,
    unreadableOneWayN: stateTier.unreadable['one-way'],
    clearN,
    findingsN,
    findingsOneWayN: findingsTier['one-way'],
    findingsTwoWayN: findingsTier['two-way'],
    sameHandN: classCounts.get('same-hand').n,
    dependentHandN: dependent.n,
    homeChainN: dependent.homeChainN,
    secondLineN: dependent.secondLineN,
    stewardshipN: dependent.stewardshipN,
    custodyN: classCounts.get('custody-and-approval').n,
    custodyTestedN,
    presumedBasisN,
    seatUniqueN: seatCounts.get('unique'),
    seatTieN: seatCounts.get('tie'),
    seatNoneN: seatCounts.get('none'),
    seatUnreadableN: seatCounts.get('unreadable'),
    conflictPermille: overallRate.permille,
    conflictPermilleRefusedReason: overallRate.reason,
    oneWayConflictPermille: oneWayRate.permille,
    oneWayPermilleRefusedReason: oneWayRate.reason,
    rateFloor: SOD_BOUNDS.rateFloor,
    structureDaysN: reader.daysRead(),
    rowsOmittedN,
    unreadableOmittedN,
    pairsN: pairRows.length,
    pairsOmittedN,
    spansOmittedN,
    distinctConflictN: conflictN,
    sharedN,
    identities,
    countsReconcile,
  };

  // An id is an identifier too. A hand outside the acting seat leaves the read
  // model with neither its name nor its id — every count above was taken first,
  // so withholding here changes no figure.
  const withholdHands = (row) => ({
    ...row,
    driverId: row.driverWithheld ? null : row.driverId,
    approverId: row.approverWithheld ? null : row.approverId,
    ...(Object.prototype.hasOwnProperty.call(row, 'seniorHandId')
      ? { seniorHandId: visible(row.seniorHandId) ? row.seniorHandId : null }
      : {}),
  });

  const hasLines = matrixToday.lines.some((line) => line.role !== 'primary' && line.active !== false);
  const seatView = seat
    ? { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
    : { id: null, label: 'No operating seat', rank: null, fullAccess: false };

  return {
    engineVersion: SOD_ENGINE_VERSION,
    generatedOn: today,
    seat: seatView,
    scopeLabel,
    fullAccess,
    isMatrix: hasLines,
    hasLedger: Boolean(reader.ledger.firstRecordedDay),
    ledgerCoverageStart: reader.ledger.firstRecordedDay || null,
    board,
    classes: SOD_CLASSES.map((descriptor) => {
      const c = classCounts.get(descriptor.key);
      return {
        ...descriptor,
        n: c.n,
        oneWayN: c.tiers['one-way'],
        twoWayN: c.tiers['two-way'],
        presumedN: c.presumedN,
        homeChainN: c.homeChainN,
        secondLineN: c.secondLineN,
        stewardshipN: c.stewardshipN,
      };
    }),
    recordRefusals: SOD_RECORD_REFUSALS.map((descriptor) => ({ ...descriptor, n: recordRefusals.get(descriptor.key) })),
    structureRefusals: SOD_STRUCTURE_REFUSALS.map((descriptor) => ({ ...descriptor, n: structureRefusals.get(descriptor.key) })),
    seatStates: SOD_SEAT_STATES.map((descriptor) => ({ ...descriptor, n: seatCounts.get(descriptor.key) })),
    rows: rows.map(withholdHands),
    pairs: pairs.map(withholdHands),
    unreadableRows: unreadableShown.map(withholdHands),
    spans,
    duties: SOD_DUTIES,
    tiers: SOD_TIERS,
    routes: SOD_ROUTES,
    bases: SOD_BASES,
    decisionStates: SOD_DECISION_STATES,
    conventions: SOD_CONVENTIONS,
    method: SOD_METHOD,
    limitsText: SOD_LIMITS_TEXT,
    bounds: SOD_BOUNDS,
    singleChainNote: hasLines
      ? null
      : 'No second reporting line is in force today, so every dependence this register can find runs through the home chain. Same-hand and custody conflicts need no line at all and are read exactly the same way.',
    emptyNote: decided.length
      ? null
      : 'No decided decision is on the record. Log a decision on #/decisions with its Driver and its Approver and record what was chosen — this register reads those two names against the reporting graph of the day the call was made.',
  };
}

/* ---------------------------------------------------------------- sentences */

/**
 * The sentence a conflict class prints on a row. Built here, once, so the panel
 * prints the reader's words and a test can hold the two to each other.
 */
export function sodFindingText(row, entry) {
  const driver = row.driverName || 'a person outside this seat';
  const approver = row.approverName || 'a person outside this seat';
  if (entry.key === 'same-hand') {
    return `${approver} is recorded as both Driver and Approver.`;
  }
  if (entry.key === 'dependent-hand') {
    const how = entry.hops === 1 ? 'directly' : `through ${entry.hops} lines`;
    const via = entry.route === 'second-line'
      ? ` — only through a declared second line${entry.viaKinds.length ? ` (${entry.viaKinds.map((kind) => matrixLineKind(kind)?.label || kind).join(', ').toLowerCase()})` : ''}; the home chain of that day does not show it`
      : ' — through the home chain';
    const basis = entry.basis === 'presumed'
      ? ' Presumed: a home line on this path has no recorded history, so today’s pointer is used.'
      : '';
    const rights = entry.direct && entry.rights.length
      ? ` ${driver}’s line over ${approver} declares: ${entry.rights.join(', ')}${entry.presumedRights.length ? ` (${entry.presumedRights.join(', ')} by the home-line presumption)` : ''}.`
      : '';
    return `On ${row.decidedOn} ${approver} (Approver) reported to ${driver} (Driver) ${how}${via}.${basis}${rights}`;
  }
  return `${approver} (Approver) owns ${entry.casesN} case(s) this decision is typed-linked to. Presumed: ownership is read as the case stands today.`;
}

/** The sentence that says who could supply the second hand. */
export function sodSeatText(row) {
  const s = row.seat;
  const presumed = s.presumed ? ' Presumed: the hand’s home line has no recorded history, so today’s pointer is used.' : '';
  if (s.state === 'none') {
    return 'No seat above the hand: it is the workspace leader. A second hand can only come from outside the reporting structure.';
  }
  if (s.state === 'unreadable') {
    return `Seat not readable: ${String(s.reasonLabel || 'the structure of that day is not recorded').toLowerCase()}.`;
  }
  const names = [
    ...s.seatNames,
    ...(s.seatWithheldN ? [`${s.seatWithheldN} outside this seat`] : []),
  ].join(', ');
  if (s.state === 'unique') return `One seat above the hand: ${names}.${presumed}`;
  const apex = s.apexAmbiguous
    ? 'no single seat sits above all of them'
    : `the lowest seat above all of them is ${s.apexName || 'outside this seat'}`;
  return `${s.seatN} seats above the hand (${names}); the structure does not say which supplies the second hand — ${apex}.${presumed}`;
}

/* ------------------------------------------------------------------ brief */

/** The identity-free brief. Counts and claims only: no person, no decision, no line. */
export function sodRegisterBriefText(report) {
  if (!report || !report.board) return '';
  const b = report.board;
  const lines = [];
  lines.push(`Segregation of duties — read from ${report.scopeLabel} on ${report.generatedOn}.`);
  if (!b.decidedN) {
    lines.push(report.emptyNote || 'No decided decision is on the record.');
    return lines.join(' ');
  }
  lines.push(`${b.decidedN} decided decision(s) on the record; ${b.readN} read${b.omittedN ? ` (${b.omittedN} older ones are beyond the declared read cap and are counted nowhere else)` : ''}; ${b.inSeatN} inside this seat${b.outsideSeatN ? `, ${b.outsideSeatN} outside it and folded into no figure` : ''}.`);
  const refusedParts = report.recordRefusals.filter((r) => r.n > 0).map((r) => `${r.n} ${r.label.toLowerCase()}`);
  lines.push(`${b.testedN} name one initiating and one authorizing hand that both resolve to a roster person${b.refusedN ? `; ${b.refusedN} could not be tested (${refusedParts.join(', ')})` : ''}.`);
  lines.push(`Of the ${b.testedN} tested: ${b.conflictN} carry a conflict, ${b.unreadableN} cannot be read for independence, ${b.clearN} show two independent hands.`);
  lines.push(`Conflict classes: ${b.sameHandN} one hand initiating and authorizing; ${b.dependentHandN} authorizing hand accountable to the initiating hand (${b.homeChainN} through the home chain, ${b.secondLineN} only through a declared second line); ${b.custodyN} custodian authorizing. ${b.presumedBasisN} finding(s) rest on a printed presumption.`);
  lines.push(`${b.conflictOneWayN} of the ${b.conflictN} conflicted decision(s) are irreversible — control gaps; ${b.conflictTwoWayN} are reversible and are recorded, not escalated.`);
  if (b.conflictN) {
    lines.push(`Seat above the senior hand on the decision day: ${b.seatUniqueN} one seat, ${b.seatTieN} two or more, ${b.seatNoneN} none (the workspace leader), ${b.seatUnreadableN} not readable.`);
  }
  if (b.oneWayConflictPermille === null) {
    lines.push(`The share of irreversible decisions carrying a conflict is REFUSED: ${b.oneWayPermilleRefusedReason}`);
  } else {
    lines.push(`${b.oneWayConflictPermille} per-mille of tested irreversible decisions carry a conflict — ${b.conflictOneWayN} of ${b.testedOneWayN}.`);
  }
  lines.push(`Counts reconcile: ${b.countsReconcile ? 'verified' : 'NOT verified — treat every figure here as unverified and report it'}.`);
  lines.push('This is a reading of recorded roles against declared lines, not a judgement of any person: nothing was blocked, no right was revoked and nothing in the workspace was changed by reading it.');
  return lines.join(' ');
}

/* -------------------------------------------------------------------- CSV */

/**
 * CSV scope #125 (ADR-0170). Aggregate-only and identity-free: one workspace
 * row plus one row per conflict class. NO person, NO name, NO decision id, NO
 * title, NO decision date and NO free text. A refused rate exports BLANK with
 * its own withheld flag, never a zero.
 */
export function sodRegisterCsvRows(report) {
  if (!report || !report.board) return [];
  const b = report.board;
  const refusal = (key) => report.recordRefusals.find((r) => r.key === key)?.n ?? 0;
  const base = {
    read_on: report.generatedOn,
    seat_scope: report.fullAccess ? 'workspace' : 'seat',
  };
  const rows = [{
    row_kind: 'workspace',
    class: 'all',
    ...base,
    decided_n: b.decidedN,
    read_n: b.readN,
    omitted_n: b.omittedN,
    outside_seat_n: b.outsideSeatN,
    in_seat_n: b.inSeatN,
    tested_n: b.testedN,
    refused_n: b.refusedN,
    refused_no_approver_n: refusal('no-approver'),
    refused_no_driver_n: refusal('no-driver'),
    refused_several_named_n: refusal('several-named'),
    refused_unresolved_hand_n: refusal('unresolved-hand'),
    conflict_decisions_n: b.conflictN,
    conflict_one_way_n: b.conflictOneWayN,
    conflict_two_way_n: b.conflictTwoWayN,
    unreadable_decisions_n: b.unreadableN,
    clear_decisions_n: b.clearN,
    findings_n: b.findingsN,
    findings_one_way_n: b.findingsOneWayN,
    findings_two_way_n: b.findingsTwoWayN,
    home_chain_n: b.homeChainN,
    second_line_n: b.secondLineN,
    presumed_basis_n: b.presumedBasisN,
    stewardship_n: b.stewardshipN,
    seat_unique_n: b.seatUniqueN,
    seat_tie_n: b.seatTieN,
    seat_none_n: b.seatNoneN,
    seat_unreadable_n: b.seatUnreadableN,
    conflict_permille: b.conflictPermille === null ? '' : b.conflictPermille,
    conflict_permille_withheld: b.conflictPermille === null,
    one_way_conflict_permille: b.oneWayConflictPermille === null ? '' : b.oneWayConflictPermille,
    one_way_permille_withheld: b.oneWayConflictPermille === null,
    counts_reconcile: b.countsReconcile,
  }];
  for (const entry of report.classes) {
    const structural = entry.key === 'dependent-hand';
    rows.push({
      row_kind: 'class',
      class: entry.key,
      ...base,
      decided_n: '',
      read_n: '',
      omitted_n: '',
      outside_seat_n: '',
      in_seat_n: '',
      tested_n: '',
      refused_n: '',
      refused_no_approver_n: '',
      refused_no_driver_n: '',
      refused_several_named_n: '',
      refused_unresolved_hand_n: '',
      conflict_decisions_n: '',
      conflict_one_way_n: '',
      conflict_two_way_n: '',
      unreadable_decisions_n: '',
      clear_decisions_n: '',
      findings_n: entry.n,
      findings_one_way_n: entry.oneWayN,
      findings_two_way_n: entry.twoWayN,
      home_chain_n: structural ? entry.homeChainN : '',
      second_line_n: structural ? entry.secondLineN : '',
      presumed_basis_n: entry.presumedN,
      stewardship_n: structural ? entry.stewardshipN : '',
      seat_unique_n: '',
      seat_tie_n: '',
      seat_none_n: '',
      seat_unreadable_n: '',
      conflict_permille: '',
      conflict_permille_withheld: '',
      one_way_conflict_permille: '',
      one_way_permille_withheld: '',
      counts_reconcile: '',
    });
  }
  return rows;
}
