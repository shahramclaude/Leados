/**
 * app/core/domain/seat.js — the Operating Seat: an enforced, hierarchy-aware
 * access-control and vertical roll-up engine (ADR-0076, Session 116).
 *
 * §0.3 of the standing brief asks for real role-based permissions AND
 * hierarchy-aware data roll-up that "integrates with, not duplicates, the
 * cross-module propagation engine". ADR-0075 delivered the hierarchy MODEL
 * (person.managerId read as a tree, Jaques altitudes, lowest-common-ancestor
 * ownership) and a *rendering* disclosure ladder, then explicitly refused to
 * assert access control. This module is the missing half.
 *
 * It reuses, rather than re-implements:
 *   buildChain()       the reporting tree, its altitudes and subtreeIds,
 *   harvestWork()      the generalized SIGNAL_SOURCES registry — one entry per
 *                      module, no per-module glue — for every open work item,
 *   discloseItems()    the altitude disclosure ladder, now ENFORCED,
 *   responsibleNodeId()/LCA  for whom a cross-unit item belongs to.
 *
 * Everything here is a PURE read model. No collection is added, no number is
 * copied into a snapshot: the figure the chief sees is the record itself, read
 * through a scope, with the composition of its subgroups printed beside it.
 * Pure module: no storage, no clock injection beyond `now`, no DOM.
 */

import { buildChain, discloseItems, harvestWork, LEADER_ID } from './chain.js';
import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';
import { dayKey, toDate, weekKey } from '../time.js';
import { seatConventions, normalizeSeatId } from './seatSchema.js';
import {
  ACTION_RIGHTS, GOVERNED_COLLECTIONS, RECORD_CLASSES,
  SEAT_ENGINE_VERSION, SEAT_LIMITS, UNDECLARED_SEAT,
  actionVerdict, recordPolicy, routeVerdict,
} from './seatRegistry.js';

const PEOPLE_KEYS = Object.freeze([
  'personId', 'ownerId', 'involvedPersonIds', 'partyIds', 'partyA', 'partyB',
  'memberIds', 'peopleIds', 'subjectIds', 'candidateId', 'stewardId',
  'managerId', 'interviewers', 'holderId', 'leaderId',
]);

/** Every person id a record names, from a declared key set. Unknown keys are ignored. */
export function recordPeople(record) {
  if (!record || typeof record !== 'object') return [];
  const out = new Set();
  for (const key of PEOPLE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) out.add(value.trim());
    else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) out.add(entry.trim());
        else if (entry && typeof entry === 'object' && typeof entry.personId === 'string') out.add(entry.personId.trim());
      }
    }
  }
  return [...out];
}

function seatFromNode(node, built) {
  const altitude = altitudeByKey(node.altitude) || null;
  const scopeIds = (node.subtreeIds || []).filter((id) => id !== LEADER_ID);
  const childSeatIds = built.seats
    .filter((s) => s.parentId === node.id && s.id !== node.id)
    .map((s) => s.id);
  return {
    id: node.id,
    nodeId: node.id,
    isLeader: node.id === LEADER_ID,
    name: node.name,
    label: altitude ? altitude.label : 'Unassigned',
    shortLabel: altitude ? altitude.shortLabel : '—',
    altitudeKey: node.altitude || null,
    rank: altitudeRank(node.altitude),
    horizonDays: altitude ? altitude.horizonDays : null,
    unitLabel: altitude ? altitude.unitLabel : '',
    stance: altitude ? altitude.stance : '',
    decisionForm: altitude ? altitude.decisionForm : '',
    decisionQuestion: altitude ? altitude.decisionQuestion : '',
    duties: altitude ? altitude.duties : [],
    forbidden: altitude ? altitude.forbidden : [],
    handUp: altitude ? altitude.handUp : [],
    disclosure: altitude ? altitude.disclosure : { names: 'none', itemDetail: false, floorN: 8 },
    scope: new Set(scopeIds),
    scopeIds,
    scopeN: scopeIds.length,
    parentId: node.parentId,
    childIds: [...(node.childIds || [])],
    childSeatIds,
    descendantSeatIds: (node.subtreeIds || []).filter((id) => id !== LEADER_ID && id !== node.id && built.nodeIndex.has(id)),
    depth: node.depth,
    span: node.span,
    altitudeReason: node.altitudeReason || '',
    reachable: node.reachable !== false,
    fullAccess: false,
  };
}

/**
 * Derive the seats from the roster. A seat is a leadership node (a node with a
 * span) or the workspace leader; an IC with no reports is NOT a seat — ADR-0075
 * refuses to invent a courtesy rung, and so do we. The undeclared operator
 * view is a separate, explicitly unenforced seat at enterprise rank.
 */
export function buildSeats(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || null;
  const chain = buildChain(state, { now, settings: effective });
  const conventions = seatConventions(effective);
  const nodeIndex = new Set();
  for (const node of chain.nodes.values()) {
    if (node.id !== LEADER_ID && node.span > 0 && node.altitude) nodeIndex.add(node.id);
  }
  const built = {
    engineVersion: SEAT_ENGINE_VERSION,
    chain,
    conventions,
    seats: [],
    byId: new Map(),
    nodeIndex,
    rootSeatId: LEADER_ID,
    now,
    warnings: [],
  };
  for (const node of chain.nodes.values()) {
    if (node.reachable === false) continue;
    const isLeader = node.id === LEADER_ID;
    if (!isLeader && !(node.span > 0 && node.altitude)) continue;
    const seat = seatFromNode(node, built);
    built.seats.push(seat);
    built.byId.set(seat.id, seat);
  }
  // Child-seat links were computed against an empty array above; resolve them
  // now that every seat exists. A seat's direct children are the leadership
  // nodes whose nearest leadership ancestor is this seat.
  for (const seat of built.seats) {
    seat.childSeatIds = built.seats
      .filter((s) => !s.isLeader && s.id !== seat.id && nearestLeadershipAncestor(built, s.id) === seat.id)
      .map((s) => s.id);
    seat.descendantSeatIds = built.seats
      .filter((s) => !s.isLeader && s.id !== seat.id && seat.scope.has(s.id))
      .map((s) => s.id);
  }
  built.seats.sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.name.localeCompare(b.name));

  const allIds = [...chain.byId.keys()];
  built.operatorSeat = {
    id: UNDECLARED_SEAT,
    nodeId: LEADER_ID,
    isLeader: true,
    name: 'Workspace operator',
    label: 'Undeclared operator view',
    shortLabel: 'Operator',
    altitudeKey: 'chief',
    rank: 5,
    horizonDays: 365,
    unitLabel: 'the enterprise and the year',
    stance: 'One operator, one keyboard: the whole workspace, with no seat declared.',
    decisionForm: 'any',
    decisionQuestion: '',
    duties: [],
    forbidden: [],
    handUp: [],
    disclosure: { names: 'visible', itemDetail: true, floorN: 0 },
    scope: new Set(allIds),
    scopeIds: allIds,
    scopeN: allIds.length,
    parentId: null,
    childIds: [],
    childSeatIds: [],
    descendantSeatIds: [],
    depth: 0,
    span: 0,
    altitudeReason: 'No seat declared — the pre-ADR-0076 single-operator view is preserved.',
    reachable: true,
    fullAccess: true,
  };
  return built;
}

function nearestLeadershipAncestor(built, nodeId) {
  let cursor = built.chain.nodes.get(nodeId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (built.byId.has(cursor)) return cursor;
    if (cursor === LEADER_ID) return LEADER_ID;
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return LEADER_ID;
}

/**
 * Resolve a seat id, fail-closed. An unresolvable id returns the operator view
 * with an explicit warning rather than silently widening someone's access.
 */
export function resolveSeat(built, seatId) {
  const id = normalizeSeatId(seatId);
  if (id === null || id === UNDECLARED_SEAT) return built.operatorSeat;
  const seat = built.byId.get(id) || null;
  if (seat) return seat;
  // A stale, hand-edited or deleted seat id must NOT become a courtesy
  // invitation to the whole workspace. Fail closed to a genuinely READ-ONLY
  // aggregate view: counts survive, no record body is readable, and no action
  // except declaring a valid seat is permitted. The user can recover via #/seat.
  const warned = {
    ...built.operatorSeat,
    fullAccess: false, readOnly: true, unresolvedSeatId: id,
    label: 'Unresolved seat (read-only)', shortLabel: 'Read-only',
    altitudeReason: 'The declared seat no longer exists in this roster; nothing is invented in its place.',
  };
  built.warnings.push(`The declared seat “${id}” is not a leadership node in this roster. The workspace opened on a READ-ONLY aggregate view rather than inventing a seat. Declare a valid seat on the Altitude Lens to restore access.`);
  return warned;
}

/** The seat the workspace is currently operated from. */
export function activeSeat(built) {
  return resolveSeat(built, built.conventions.activeSeatId);
}

/* ------------------------------------------------------- access decisions */

/**
 * The single access decision. Returns one of:
 *   full       the record may be read in full;
 *   aggregate  only the count may be surfaced (detail withheld upward);
 *   denied     neither (sideways scope or below the class floor).
 * Every non-full outcome carries a printed reason — an access control that
 * cannot explain its own refusal is a broken one (§0.3, SEAT_PREMISE).
 */
export function canSee(record, collection, seat, built) {
  const policy = recordPolicy(collection);
  const base = { collection, classKey: policy.classKey, classLabel: policy.classLabel, policyLabel: policy.label, route: policy.route };
  if (!seat) return { ...base, allow: 'denied', reason: 'No seat resolved.' };
  if (seat.fullAccess) return { ...base, allow: 'full', reason: 'Undeclared operator view — the whole workspace, as before.' };
  if (seat.readOnly) {
    return { ...base, allow: 'aggregate',
      reason: `The declared seat “${seat.unresolvedSeatId}” no longer exists in this roster. Only counts are visible until a valid seat is declared — no record body is readable and no action is permitted.` };
  }
  // A person's managerId is an upward reporting edge, not a second subject of
  // the record. Including it denied a frontline lead access to their own profile
  // (their manager is outside their downward span). Scope the person by id;
  // all other records retain their full named-person boundary.
  const people = collection === 'people' ? [record.id].filter(Boolean) : recordPeople(record);
  const inScope = people.length === 0 ? true : people.every((pid) => seat.scope.has(pid));
  if (!inScope) {
    return { ...base, allow: 'denied', reason: `This ${policy.label} names people outside ${seat.label}’s span. The reporting tree does not put it under this seat (no sideways disclosure).` };
  }
  if (seat.rank < policy.minRank) {
    return { ...base, allow: 'denied', reason: `${policy.classLabel} is not handed below rank ${policy.minRank}; ${seat.label} is rank ${seat.rank}. ${policy.reason}` };
  }
  if (seat.rank > policy.maxRank) {
    return { ...base, allow: 'aggregate', reason: `${policy.classLabel} is disclosed above rank ${policy.maxRank} as a COUNT ONLY. ${policy.reason}` };
  }
  if (seat.rank > policy.detailCeiling) {
    return { ...base, allow: 'aggregate', reason: `${policy.classLabel} is disclosed above rank ${policy.detailCeiling} as counts and rates, not item detail. ${RECORD_CLASSES[policy.classKey].reason}` };
  }
  return { ...base, allow: 'full', reason: '' };
}

/** Action decision: rank window first, then scope when a record is named. */
export function canAct(action, seat, { record = null, collection = null, built = null } = {}) {
  if (seat?.readOnly && action !== 'declare-seat') {
    return { allow: false, reason: 'Read-only unresolved seat. Declare a valid seat before acting; no record may be changed while the operating position is unknown.' };
  }
  const verdict = actionVerdict(action, seat);
  if (!verdict.allow) return verdict;
  if (record && seat && !seat.fullAccess) {
    const seen = canSee(record, collection || '', seat, built);
    if (seen.allow !== 'full') return { allow: false, reason: `The record is not fully visible: ${seen.reason}` };
  }
  return verdict;
}

/**
 * A local UI projection (not an authentication boundary): a scoped projection of the whole governed
 * state. Only `full` records survive into `visible`. Everything else lands in
 * an append-only-style ledger with the reason, so the app can PRINT what it
 * withheld instead of hiding it. The operator view is the identity projection.
 */
export function projectForSeat(state, seat, built, { cap = SEAT_LIMITS.ledgerCap } = {}) {
  const visible = {};
  const ledger = [];
  const counts = { full: 0, aggregate: 0, denied: 0, byClass: {}, byReason: {} };
  for (const collection of GOVERNED_COLLECTIONS) {
    const rows = Array.isArray(state?.[collection]) ? state[collection] : [];
    visible[collection] = [];
    for (const record of rows) {
      if (!record || !record.id) continue;
      const verdict = canSee(record, collection, seat, built);
      counts[verdict.allow] += 1;
      counts.byClass[verdict.classKey] = (counts.byClass[verdict.classKey] || 0) + 1;
      if (verdict.allow === 'full') {
        visible[collection].push(record);
      } else {
        if (ledger.length < cap) {
          ledger.push({
            collection, id: record.id, classKey: verdict.classKey, classLabel: verdict.classLabel,
            policyLabel: verdict.policyLabel, allow: verdict.allow, reason: verdict.reason,
            route: verdict.route,
          });
        }
        counts.byReason[verdict.classKey] = (counts.byReason[verdict.classKey] || 0) + 1;
      }
    }
  }
  return {
    visible, ledger, counts,
    ledgerTruncated: Math.max(0, (counts.aggregate + counts.denied) - ledger.length),
    seatId: seat?.id || null,
    enforced: !seat?.fullAccess,
  };
}

/* -------------------------------------------------------------- roll-up */

function rateFor(num, den, floorN) {
  if (!den || den < floorN) {
    return { num, den, pct: null, refused: `Only ${den} observation(s) against an evidence floor of ${floorN}; a proportion of one identifies a person, so the rate is withheld rather than printed.` };
  }
  return { num, den, pct: Math.round((num / den) * 1000) / 10, refused: null };
}

/**
 * The vertical roll-up. One digest per seat, derived live from the generalized
 * work harvester:
 *   - exact counts (each open item has exactly one owning node);
 *   - a composition-safe horizon-debt rate: POOLED across child seats beside
 *     the MEAN OF UNIT RATES, a directly standardised rate when they disagree
 *     materially (Simpson's paradox defence, epidemiological age-
 *     standardisation), and a refusal below the declared evidence floor;
 *   - a risk heat over child spans (severity load × age) for the VP/CEO;
 *   - an arrival trend with an anomaly verdict refused below four weeks;
 *   - the altitude's own duties, filtered by the route permission verdict, so
 *     each level gets the questions and the one-click routes it actually owes.
 */
export function seatDigest(state, seat, built, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || null;
  const conv = seatConventions(effective);
  const floorN = Math.max(conv.seatFloorN, seat.disclosure?.floorN || 0);
  const nowDay = dayKey(now);
  const items = harvestWork(state, built.chain, { now, settings: effective });
  const inScope = items.filter((item) => seat.scope.has(item.ownerNodeId)
    || item.people.some((pid) => seat.scope.has(pid)));

  const byType = new Map();
  const byClassCount = { individual: 0, unit: 0, portfolio: 0, enterprise: 0 };
  let overdueN = 0;
  let debtN = 0;
  let severityLoad = 0;
  let oldestAgeDays = null;
  let sensitiveN = 0;
  for (const item of inScope) {
    byType.set(item.type, (byType.get(item.type) || 0) + 1);
    if (item.overdueDays > 0) overdueN += 1;
    if (item.requiredRank > item.ownerRank) debtN += 1;
    severityLoad += item.severity || 1;
    if (oldestAgeDays === null || item.ageDays > oldestAgeDays) oldestAgeDays = item.ageDays;
    if (item.sensitive) sensitiveN += 1;
    const cls = sourceClass(item.type);
    byClassCount[cls] += 1;
  }

  // Composition-safe rate over the seat's direct child spans. A pooled rate
  // (Σnum/Σden) is printed beside the mean of the unit rates; when they differ
  // by more than the declared materiality bar the reading is marked and a
  // directly standardised rate (the parent's own type mix as the standard) is
  // printed too. A roll-up that silently averages averages is Simpson's
  // paradox wearing a dashboard (2026 quality-management literature).
  const units = seat.childSeatIds.map((id) => built.byId.get(id)).filter(Boolean);
  const unitStats = units.map((child) => {
    const rows = inScope.filter((item) => child.scope.has(item.ownerNodeId) || item.people.some((pid) => child.scope.has(pid)));
    const num = rows.filter((i) => i.requiredRank > i.ownerRank).length;
    const den = rows.length;
    // A unit rate of one record identifies a span of one, so it is withheld at
    // the same floor as the pooled rate. The pooled rate may still count that
    // row (a pooled denominator does not disclose an individual); the unit
    // cell may not print it.
    return { seatId: child.id, label: child.name, rank: child.rank, num, den,
      pct: den >= floorN ? Math.round((num / den) * 1000) / 10 : null,
      refused: den < floorN ? `Only ${den} observation(s) against a floor of ${floorN}; the unit rate is withheld.` : null };
  });
  const pooled = rateFor(unitStats.reduce((a, u) => a + u.num, 0), unitStats.reduce((a, u) => a + u.den, 0), floorN);
  const priced = unitStats.filter((u) => u.pct !== null);
  const unitMeanPct = priced.length ? Math.round((priced.reduce((a, u) => a + u.pct, 0) / priced.length) * 10) / 10 : null;
  const spreadPp = pooled.pct !== null && unitMeanPct !== null ? Math.round(Math.abs(pooled.pct - unitMeanPct) * 10) / 10 : null;
  const compositionSensitive = spreadPp !== null && spreadPp > conv.seatMaterialityPp;
  // Direct standardisation: reweight each child's own rate by the parent's
  // share of items in that child's class (the enterprise mix), so a change in
  // which span is busy cannot masquerade as a change in the rate.
  const totalDen = pooled.den || 0;
  const standardisedPct = compositionSensitive && totalDen > 0
    ? Math.round(unitStats.reduce((a, u) => a + (u.pct === null ? 0 : u.pct * (u.den / totalDen)), 0) * 10) / 10
    : null;
  const horizonDebt = {
    key: 'horizon-debt', label: 'Open work past its owner’s time span',
    num: pooled.num, den: pooled.den, pooledPct: pooled.pct,
    unitMeanPct, standardisedPct, spreadPp, compositionSensitive,
    materialityPp: conv.seatMaterialityPp, floorN, refused: pooled.refused,
    units: unitStats,
  };

  // Risk heat over child spans: severity load and age, never a person score.
  const riskHeat = units.map((child) => {
    const rows = inScope.filter((item) => child.scope.has(item.ownerNodeId) || item.people.some((pid) => child.scope.has(pid)));
    const load = rows.reduce((a, i) => a + (i.severity || 1), 0);
    const overdue = rows.filter((i) => i.overdueDays > 0).length;
    const oldest = rows.reduce((a, i) => Math.max(a, i.ageDays), 0);
    return { seatId: child.id, label: child.name, rank: child.rank, openN: rows.length,
      severityLoad: load, overdueN: overdue, oldestAgeDays: oldest,
      band: load >= 12 || overdue >= 4 ? 'critical' : load >= 6 || overdue >= 2 ? 'elevated' : rows.length ? 'watch' : 'quiet' };
  }).sort((a, b) => b.severityLoad - a.severityLoad);

  // Arrival trend, bucketed by ISO week. Refused below four observed weeks.
  const weeks = new Map();
  for (const item of inScope) {
    const key = weekKey(toDate(item.openedOn)) || item.openedOn;
    weeks.set(key, (weeks.get(key) || 0) + 1);
  }
  const trend = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, opened]) => ({ week, opened }));
  let trendVerdict = { verdict: 'unmeasured', reason: `Fewer than four observed weeks (${trend.length}); no anomaly is claimed from a trend that has not been measured.`, lastWeek: null, baselineMean: null, changePct: null };
  if (trend.length >= 4) {
    const prior = trend.slice(0, -1).map((t) => t.opened);
    const baseline = prior.reduce((a, b) => a + b, 0) / prior.length;
    const last = trend.at(-1).opened;
    const changePct = baseline > 0 ? Math.round(((last - baseline) / baseline) * 1000) / 10 : null;
    const anomalous = changePct !== null && Math.abs(changePct) >= 50;
    trendVerdict = {
      verdict: anomalous ? (changePct > 0 ? 'surge' : 'collapse') : 'stable',
      reason: anomalous
        ? `Last week’s ${last} new item(s) are ${Math.abs(changePct)}% ${changePct > 0 ? 'above' : 'below'} the ${baseline.toFixed(1)}-per-week baseline of the prior ${prior.length} weeks. This is a signal about workload, not about any person.`
        : `Last week’s ${last} new item(s) sit within 50% of the ${baseline.toFixed(1)}-per-week baseline of the prior ${prior.length} weeks.`,
      lastWeek: last, baselineMean: Math.round(baseline * 10) / 10, changePct,
    };
  }

  // Altitude-appropriate duties, with each route's permission verdict carried
  // so the view cannot offer a link that the boundary will refuse.
  const duties = (seat.duties || []).map((duty) => ({
    key: duty.key, label: duty.label, question: duty.question,
    routes: (duty.routes || []).map((route) => {
      const key = String(route).replace(/^#\//, '').split('?')[0];
      const verdict = routeVerdict(key, seat);
      return { route, label: key, allowed: verdict.allow, reason: verdict.reason };
    }),
  }));
  const openDuties = duties.filter((d) => d.routes.some((r) => r.allowed));

  const disclosure = discloseItems(inScope, seat.altitudeKey || 'chief', built.chain, { cap: 12 });
  const withheld = [];
  if (seat.rank > RECORD_CLASSES.individual.maxRank) {
    withheld.push({ reason: `Individual coaching notes, 1:1 content, feedback and pay records in this span (${byClassCount.individual} open individual-level item(s) counted). Detail is withheld above rank ${RECORD_CLASSES.individual.maxRank}.`, n: byClassCount.individual });
  }
  if (seat.rank > RECORD_CLASSES.unit.detailCeiling) {
    withheld.push({ reason: `Unit-level item titles and names are withheld above rank ${RECORD_CLASSES.unit.detailCeiling}; the reading is counts by source and span.`, n: byClassCount.unit });
  }
  if (pooled.refused) withheld.push({ reason: pooled.refused, n: pooled.den });

  const boardLine = seat.rank >= 5 ? buildBoardLine(seat, inScope, horizonDebt, riskHeat, withheld, oldestAgeDays) : null;

  return {
    seatId: seat.id, nodeId: seat.nodeId, label: seat.label, shortLabel: seat.shortLabel,
    altitudeKey: seat.altitudeKey, rank: seat.rank, horizonDays: seat.horizonDays,
    isLeader: seat.isLeader, fullAccess: Boolean(seat.fullAccess), enforced: !seat.fullAccess,
    scopeN: seat.scopeN, spanN: units.length, floorN, windowDays: conv.seatWindowDays,
    nowDay,
    counts: {
      openN: inScope.length, overdueN, debtN, severityLoad, oldestAgeDays,
      sensitiveN, withheldDetailN: withheld.reduce((a, w) => a + w.n, 0),
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, label: sourceLabel(key), count })),
      byClass: byClassCount,
    },
    horizonDebt, riskHeat, trend, trendVerdict,
    duties, openDuties, forbidden: [...(seat.forbidden || [])], handUp: [...(seat.handUp || [])],
    disclosure, withheld, boardLine,
    stance: seat.stance, decisionForm: seat.decisionForm, decisionQuestion: seat.decisionQuestion,
  };
}

const SOURCE_CLASS = Object.freeze({
  case: 'unit', decision: 'unit', delegation: 'unit', goal: 'unit', requisition: 'unit',
  oneonone: 'individual', 'feedback-followup': 'individual', perfconcern: 'individual',
  premise: 'portfolio',
});
function sourceClass(type) {
  return SOURCE_CLASS[type] || 'unit';
}
function sourceLabel(type) {
  const map = {
    case: 'Operational cases', decision: 'Undecided calls', delegation: 'Open delegations',
    goal: 'Open goals', oneonone: '1:1 cadence', 'feedback-followup': 'Feedback follow-ups owed',
    perfconcern: 'Performance concerns', premise: 'Unsettled assumptions', requisition: 'Open requisitions',
  };
  return map[type] || type;
}

/** An investor-ready line with every unverified figure marked, not rounded up. */
function buildBoardLine(seat, items, rate, riskHeat, withheld, oldestAgeDays) {
  const critical = riskHeat.filter((r) => r.band === 'critical').length;
  const unverified = [];
  if (rate.refused) unverified.push('horizon-debt rate (evidence floor not met)');
  if (withheld.length) unverified.push(`${withheld.length} disclosure class(es) withheld`);
  const rateText = rate.pooledPct === null
    ? 'the horizon-debt rate is UNVERIFIED (evidence floor not met)'
    : `the pooled horizon-debt rate is ${rate.pooledPct}%${rate.compositionSensitive ? `, composition-sensitive against a ${rate.unitMeanPct}% mean of unit rates` : ''}`;
  return `Enterprise: ${items.length} open item(s) across ${riskHeat.length} span(s); ${critical} span(s) at critical load; oldest item ${oldestAgeDays === null ? 'undated' : `${oldestAgeDays}d`}. ${rateText}. ${unverified.length ? `Figures to mark unverified in any board pack: ${unverified.join('; ')}.` : 'No figure on this line is withheld.'} No person is named, rated or ranked.`;
}

/** Drill UP: this seat, then every leadership ancestor to the root. */
export function rollUpPath(state, built, seatId, opts = {}) {
  const seat = resolveSeat(built, seatId);
  const path = [];
  let cursor = seat;
  let guard = 0;
  while (cursor && guard < 16) {
    path.push({ seat: cursor, digest: seatDigest(state, cursor, built, opts) });
    if (cursor.isLeader || cursor.fullAccess || !cursor.parentId) break;
    const parentId = nearestLeadershipAncestor(built, cursor.id);
    const parent = parentId === cursor.id ? null : built.byId.get(parentId);
    if (!parent) break;
    cursor = parent;
    guard += 1;
  }
  return path;
}

/** Drill DOWN: the direct child spans of this seat, each with its own digest. */
export function drillDown(state, built, seatId, opts = {}) {
  const seat = resolveSeat(built, seatId);
  return (seat.childSeatIds || []).map((id) => {
    const child = built.byId.get(id);
    return child ? { seat: child, digest: seatDigest(state, child, built, opts) } : null;
  }).filter(Boolean);
}

/** Whole-workspace report for the Altitude Lens surface. */
export function seatReport(state = {}, { now = new Date(), settings = null } = {}) {
  const built = buildSeats(state, { now, settings });
  const seat = activeSeat(built);
  const digest = seatDigest(state, seat, built, { now, settings: settings || state?.settings || null });
  const projection = projectForSeat(state, seat, built);
  const rollUp = rollUpPath(state, built, seat.id, { now, settings: settings || state?.settings || null });
  const children = drillDown(state, built, seat.id, { now, settings: settings || state?.settings || null });
  const allSeats = built.seats.map((s) => ({ id: s.id, name: s.name, label: s.label, shortLabel: s.shortLabel,
    rank: s.rank, altitudeKey: s.altitudeKey, scopeN: s.scopeN, parentId: s.parentId,
    depth: s.depth, span: s.span, isLeader: s.isLeader, horizonDays: s.horizonDays }));
  return {
    engineVersion: SEAT_ENGINE_VERSION,
    built, seat, digest, projection, rollUp, children, allSeats,
    operatorSeat: built.operatorSeat,
    warnings: built.warnings,
    conventions: built.conventions,
    seatsByAltitude: ALTITUDES.map((a) => ({
      key: a.key, label: a.label, rank: a.rank, horizonDays: a.horizonDays,
      held: allSeats.filter((s) => s.altitudeKey === a.key).length,
    })),
    now: dayKey(now),
  };
}

/** Which routes this seat may open (for the nav filter in main.js). */
export function allowedRoutes(seat, routes) {
  return routes.filter((route) => routeVerdict(route, seat).allow);
}

export { routeVerdict, actionVerdict, recordPolicy, ACTION_RIGHTS, RECORD_CLASSES, UNDECLARED_SEAT };
