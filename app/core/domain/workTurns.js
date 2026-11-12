/**
 * app/core/domain/workTurns.js — the Non-Promotable Work Turn Ledger's pure read
 * model (ADR-0181, Schema v144, `#/matrix?panel=turns`, CSV scope #135).
 *
 * THE QUESTION. "Who do I keep handing the work that gets nobody promoted — and
 * is somebody carrying two teams' worth of it because each of us asked once?"
 *
 * WHAT IT READS
 *   delegations           the asks themselves (handed-over day, owner, status);
 *   workTurnActs          what a manager declared each ask to be (this module);
 *   delegationLineActs    which reporting line each ask came down (ADR-0178);
 *   the live matrix graph who holds whom, on which line, at what declared share.
 *
 * WHAT IT REFUSES
 *   - A kind for an ask nobody classified. It reads `unclassified`.
 *   - A pool for a non-promotable ask on a person with two or more lines and no
 *     recorded line. It is charged to NO pool.
 *   - A fair turn when any share in the pool is missing. Nothing is split evenly.
 *   - A turn over part of a pool. A pool partly outside the reading seat makes
 *     no claim, because a partial total could flatter or accuse.
 *   - A pattern from too few asks. Below the declared floor no pool is tested.
 *   - "Within" for a person whose pools could not all be read. They read `unread`.
 *
 * Every comparison is an integer comparison. The only decimals printed are
 * truncated renderings of an exact fraction that is printed beside them.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`. Nothing
 * derived here is stored.
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixLineScope, personAllocation } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { effectiveDelegationLineActs } from './delegationLineSchema.js';
import { effectiveWorkTurnActs, normalizeWorkTurnSettings } from './workTurnSchema.js';
import { rankWorkTurnBounds } from './workTurnBounds.js';
import {
  WORK_TURN_CLASSES,
  WORK_TURN_CSV_COLUMNS,
  WORK_TURN_DETAIL_LEVELS,
  WORK_TURN_DETAIL_REASONS,
  WORK_TURN_FINDING_KINDS,
  WORK_TURN_KINDS,
  WORK_TURN_LIMITS,
  WORK_TURN_METHOD,
  WORK_TURN_OWNER_STATES,
  WORK_TURN_PLACEMENTS,
  WORK_TURN_POOL_STATES,
  WORK_TURN_RANK_REASONS,
  WORK_TURN_RANK_STATES,
  WORK_TURN_RIGHTS,
  WORK_TURN_SETTING_KEYS,
  WORK_TURN_VERDICTS,
} from './workTurnRegistry.js';

const counts = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const byText = (a, b) => String(a).localeCompare(String(b));

/** Pool states in which the over-turn question has a definite answer for every member. */
const DECIDED_POOL_STATES = new Set(['below-floor', 'concentrated', 'even']);

function seatFor(view, at, graph) {
  const scope = matrixLineScope(graph);
  return activeSeat(buildSeats(view, { now: at, settings: view.settings || {}, lineScope: scope.byManager }));
}

/** `numer ÷ denom`, truncated (never rounded up) to two decimals. Integer arithmetic only. */
export function workTurnApprox(numer, denom) {
  if (!Number.isInteger(numer) || !Number.isInteger(denom) || denom <= 0 || numer < 0) return null;
  const hundredths = Math.floor((numer * 100) / denom);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}

/** FNV-1a (32-bit) of a string, as 8 hex digits. A short, stable signature for a set of ids. */
export function workTurnSignature(ids) {
  const text = [...ids].map(String).sort().join(',');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${ids.length}:${hash.toString(16).padStart(8, '0')}`;
}

/** A rule identifier as the spine's rules stamp it into the support note of an ask they issue. */
const RULE_STAMP_RE = /\bRULE-[A-Z0-9]{2,6}-\d{1,3}\b/;
const RULE_TITLE_STAMP_RE = /\[RULE-[A-Z0-9]{2,6}-\d{1,3}[:\]]/;

/**
 * Ids of the asks an automation rule issued. Such an ask is not a manager's
 * choice of person, so it is counted apart and takes no kind. Recognised two
 * ways, because the spine's rules mark their asks two ways: an
 * `issues-obligation` link carrying a rule id, or a rule id stamped into the
 * ask's support note (or bracketed at the head of its title). One function, so
 * the reader and the classify action can never disagree about it.
 */
export function workTurnRuleIssuedIds(state) {
  const ids = new Set();
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (link?.relation === 'issues-obligation' && link.targetType === 'delegation'
      && typeof link.ruleId === 'string' && link.ruleId.startsWith('RULE-')) ids.add(link.targetId);
  }
  for (const ask of Array.isArray(state?.delegations) ? state.delegations : []) {
    if (!ask) continue;
    if (RULE_STAMP_RE.test(String(ask.support || '')) || RULE_TITLE_STAMP_RE.test(String(ask.title || ''))) ids.add(ask.id);
  }
  return ids;
}

/**
 * The over-turn test, stated once so the reader, the rule and the suite share it.
 * `carried` asks out of a pool total `total`, for a member holding `shareH`
 * hundredths of a pool whose shares add to `shareSum`.
 */
export function workTurnIsOver({ carried, total, shareH, shareSum, factorPct }) {
  return carried >= 2 && carried * shareSum * 100 >= factorPct * total * shareH;
}

export function buildWorkTurns(state, { now = new Date(), settings = null, matrix = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const effectiveSettings = settings || state?.settings || {};
  const view = { ...state, settings: effectiveSettings };
  const graph = matrix || buildMatrix(view, { now: at, settings: effectiveSettings });
  const seat = seatFor(view, at, graph);
  const conv = normalizeWorkTurnSettings(effectiveSettings);
  const K = WORK_TURN_SETTING_KEYS;
  const windowDays = conv[K.windowDays];
  const minAsks = conv[K.minAsks];
  const factorPct = conv[K.factorPct];
  const today = dayKey(at);
  const from = addDays(today, -(windowDays - 1));

  const full = Boolean(seat.fullAccess);
  const readOnly = Boolean(seat.readOnly);
  const inSpan = (id) => Boolean(seat.scope?.has(id)) || Boolean(seat.lineScope?.has(id));
  const visiblePerson = (id) => full || id === seat.id || inSpan(id);
  const nameOf = (id) => graph.nodes.get(id)?.name || id;
  const allocCache = new Map();
  const allocOf = (id) => {
    if (!allocCache.has(id)) allocCache.set(id, personAllocation(graph, id));
    return allocCache.get(id);
  };

  const board = {
    asksInWindowN: 0, asksNotReadN: 0, asksReturnedN: 0, asksRuleIssuedN: 0, asksReadN: 0,
    classes: counts(WORK_TURN_CLASSES), placements: counts(WORK_TURN_PLACEMENTS),
    peopleReadN: 0, carriersN: 0, verdicts: counts(WORK_TURN_VERDICTS),
    poolsReadN: 0, pools: counts(WORK_TURN_POOL_STATES), turnRanks: counts(WORK_TURN_RANK_STATES),
    findingsN: 0, findingKinds: counts(WORK_TURN_FINDING_KINDS), owners: counts(WORK_TURN_OWNER_STATES),
    openRotationAsksN: 0,
    populationReconciles: false, classesReconcile: false, placementsReconcile: false,
    verdictsReconcile: false, poolsReconcile: false, ownersReconcile: false, turnRanksReconcile: false,
  };

  /* ------------------------------------------------------------- 1. the asks */
  const ruleIssued = workTurnRuleIssuedIds(state);
  const delegations = Array.isArray(state?.delegations) ? state.delegations : [];
  const kinds = effectiveWorkTurnActs(state?.workTurnActs || []);
  const lineActs = effectiveDelegationLineActs(state?.delegationLineActs || []);

  // Duplicate or missing ask ids make classifications and line acts ambiguous.
  // Examine the whole window, including returned and rule-issued asks: an id
  // collision with one of those must not make another ask disappear silently.
  const idsInWindow = new Map();
  const invalidAskPeople = new Set();
  for (const ask of delegations) {
    if (!ask || typeof ask.delegatedOn !== 'string' || ask.delegatedOn < from || ask.delegatedOn > today) continue;
    if (typeof ask.id !== 'string' || !ask.id.trim()) { invalidAskPeople.add(ask.personId); continue; }
    const people = idsInWindow.get(ask.id) || [];
    people.push(ask.personId);
    idsInWindow.set(ask.id, people);
  }
  for (const people of idsInWindow.values()) {
    if (people.length > 1) for (const personId of people) invalidAskPeople.add(personId);
  }

  // Each entry is one unresolved ask, not a guessed classification. A valid
  // recorded line restricts an unclassified ask to that line; no/stale line
  // makes it possible on each current line, never actually charged to one.
  const uncertainByPerson = new Map();
  const addUncertain = (personId, knownLine) => {
    if (!uncertainByPerson.has(personId)) uncertainByPerson.set(personId, []);
    uncertainByPerson.get(personId).push(knownLine ? { lineId: knownLine.lineId, managerId: knownLine.managerId } : null);
  };

  /** personId → { nptN, unreadableN, byLine: Map<lineId, askId[]> } */
  const carry = new Map();
  /** managerId → Map<personId, askId[]> */
  const poolLoad = new Map();
  const askRows = [];

  for (const ask of delegations) {
    if (!ask || typeof ask.delegatedOn !== 'string' || ask.delegatedOn < from || ask.delegatedOn > today) continue;
    board.asksInWindowN += 1;
    if (!visiblePerson(ask.personId)) { board.asksNotReadN += 1; continue; }
    if (ask.status === 'returned') { board.asksReturnedN += 1; continue; }
    if (ruleIssued.has(ask.id)) { board.asksRuleIssuedN += 1; continue; }
    board.asksReadN += 1;

    const entry = kinds.get(ask.id);
    const declared = entry && entry.act.personId === ask.personId && WORK_TURN_KINDS.includes(entry.act.kind);
    const classKey = declared ? entry.act.kind : 'unclassified';
    board.classes[classKey] += 1;

    let placement = null;
    let line = null;
    if (classKey === 'non-promotable') {
      const alloc = allocOf(ask.personId);
      const attribution = lineActs.get(ask.id);
      if (attribution) {
        line = alloc.lines.find((l) => l.lineId === attribution.act.lineId && l.managerId === attribution.act.managerId) || null;
        placement = line ? 'attributed' : 'stale';
      } else if (alloc.lineN === 1) {
        line = alloc.lines[0];
        placement = 'sole-line';
      } else {
        placement = 'unplaced';
      }
      board.placements[placement] += 1;
      if (!carry.has(ask.personId)) carry.set(ask.personId, { nptN: 0, unreadableN: 0, askIds: [], byLine: new Map() });
      const c = carry.get(ask.personId);
      c.nptN += 1;
      c.askIds.push(ask.id);
      if (line) {
        if (!c.byLine.has(line.lineId)) c.byLine.set(line.lineId, []);
        c.byLine.get(line.lineId).push(ask.id);
        if (!poolLoad.has(line.managerId)) poolLoad.set(line.managerId, new Map());
        const load = poolLoad.get(line.managerId);
        if (!load.has(ask.personId)) load.set(ask.personId, []);
        load.get(ask.personId).push(ask.id);
      } else {
        c.unreadableN += 1;
        addUncertain(ask.personId, null);
      }
    } else if (classKey === 'unclassified') {
      const alloc = allocOf(ask.personId);
      const attribution = lineActs.get(ask.id);
      const recorded = attribution && attribution.act.personId === ask.personId
        ? alloc.lines.find((l) => l.lineId === attribution.act.lineId && l.managerId === attribution.act.managerId)
        : null;
      addUncertain(ask.personId, recorded || null);
    }

    askRows.push({
      delegationId: ask.id,
      title: ask.title || '',
      personId: ask.personId,
      personName: nameOf(ask.personId),
      delegatedOn: ask.delegatedOn,
      status: ask.status,
      classKey,
      placement,
      lineId: line ? line.lineId : null,
      managerId: line ? line.managerId : null,
      managerName: line ? nameOf(line.managerId) : null,
      reclassified: Boolean(entry && entry.actN > 1),
      // The person is never asked to classify their own ask; a peer cannot either.
      canClassify: !readOnly && ask.personId !== seat.id && (full || inSpan(ask.personId)),
    });
  }
  const nptN = board.classes['non-promotable'];

  /* ------------------------------------------------------------ 2. the pools */
  const poolMembers = new Map();
  for (const line of graph.lines) {
    if (line.active === false || !graph.roster.has(line.personId)) continue;
    if (!poolMembers.has(line.managerId)) poolMembers.set(line.managerId, []);
    poolMembers.get(line.managerId).push({ personId: line.personId, lineId: line.id, kind: line.kind });
  }
  const poolReadable = (managerId) => full || managerId === seat.id || Boolean(seat.scope?.has(managerId));
  // A refused line could hide a member or a competing line; do not rank that
  // pool from the surviving graph. This is deliberately conservative, including
  // defects the matrix engine reports from historical declarations.
  const defectPeople = new Set((graph.defects || []).map((d) => d.personId));
  const defectManagers = new Set((graph.defects || []).map((d) => d.managerId));

  const pools = [];
  const poolByManager = new Map();
  for (const managerId of [...poolMembers.keys()].sort(byText)) {
    if (!poolReadable(managerId)) continue;
    const all = poolMembers.get(managerId).slice().sort((a, b) => byText(a.personId, b.personId));
    const hiddenN = all.filter((m) => !visiblePerson(m.personId)).length;
    const load = poolLoad.get(managerId) || new Map();
    const members = all.filter((m) => visiblePerson(m.personId)).map((m) => {
      const allocLine = allocOf(m.personId).lines.find((l) => l.lineId === m.lineId) || null;
      const askIds = load.get(m.personId) || [];
      const unresolvedN = (uncertainByPerson.get(m.personId) || [])
        .filter((line) => !line || (line.lineId === m.lineId && line.managerId === managerId)).length;
      return {
        personId: m.personId,
        name: nameOf(m.personId),
        lineId: m.lineId,
        kind: m.kind,
        shareH: allocLine && Number.isInteger(allocLine.shareH) ? allocLine.shareH : null,
        carriedN: askIds.length,
        unresolvedN,
        upperN: askIds.length + unresolvedN,
        askIds: [...askIds].sort(byText),
        turnNumer: null,
        turnDenom: null,
        turnText: null,
        turnApprox: null,
        over: false,
      };
    });
    const totalN = members.reduce((acc, m) => acc + m.carriedN, 0);
    const sharesKnown = members.every((m) => m.shareH !== null);
    const shareSum = sharesKnown ? members.reduce((acc, m) => acc + m.shareH, 0) : null;

    let stateKey;
    if (hiddenN > 0) stateKey = 'partial';
    else if (members.length < 2 || totalN < minAsks) stateKey = 'below-floor';
    else if (!sharesKnown) stateKey = 'share-undeclared';
    else if (shareSum <= 0) stateKey = 'share-zero';
    else stateKey = 'even';

    // The fair turn is printed wherever it can be computed exactly, including
    // below the floor; the over-turn CLAIM is made only in a tested pool.
    if (hiddenN === 0 && sharesKnown && shareSum > 0) {
      for (const m of members) {
        m.turnNumer = totalN * m.shareH;
        m.turnDenom = shareSum;
        m.turnText = `${totalN} × ${m.shareH} ÷ ${shareSum}`;
        m.turnApprox = workTurnApprox(m.turnNumer, m.turnDenom);
        if (stateKey === 'even') {
          m.over = workTurnIsOver({ carried: m.carriedN, total: totalN, shareH: m.shareH, shareSum, factorPct });
        }
      }
      if (stateKey === 'even' && members.some((m) => m.over)) stateKey = 'concentrated';
    }

    // A lowest ratio over the classified/placed subset alone can name the wrong
    // person. Bound each member's count over all resolutions of the unclassified
    // or unplaced asks, and name a turn only if its complete set is invariant.
    const matrixDefect = defectManagers.has(managerId) || all.some((m) => defectPeople.has(m.personId));
    const eligible = members.filter((m) => Number.isInteger(m.shareH) && m.shareH > 0);
    let rankState;
    let bounds = null;
    if (hiddenN) rankState = 'partial';
    else if (matrixDefect) rankState = 'matrix-defect';
    else if (!sharesKnown) rankState = 'missing-share';
    else if (members.some((m) => m.shareH < 0 || m.shareH > 100)) rankState = 'unreadable-asks';
    else if (eligible.length < 2) rankState = 'too-few';
    else if (members.some((m) => invalidAskPeople.has(m.personId))) rankState = 'unreadable-asks';
    else if (!eligible.some((m) => m.upperN > 0)) rankState = 'no-evidence';
    else {
      bounds = rankWorkTurnBounds(eligible.map((m) => ({
        personId: m.personId, shareH: m.shareH, lowerN: m.carriedN, upperN: m.upperN,
      })));
      rankState = !bounds ? 'unreadable-asks' : bounds.stable ? 'stable' : 'uncertain';
    }
    const names = new Map(members.map((m) => [m.personId, m.name]));
    const possiblePersonIds = bounds?.possible || [];
    const certainPersonIds = bounds?.certain || [];
    const possibleNames = possiblePersonIds.map((id) => names.get(id));
    const certainNames = certainPersonIds.map((id) => names.get(id));
    const nextTurn = rankState === 'stable'
      ? { personIds: possiblePersonIds, names: possibleNames, tied: possiblePersonIds.length > 1 }
      : null;
    const rankText = nextTurn ? `${nextTurn.names.join(', ')}${nextTurn.tied ? ' (tied)' : ''}`
      : rankState === 'uncertain' ? `Uncertain — possible: ${possibleNames.join(', ')}. Classify or attribute unresolved asks.`
        : `Refused — ${WORK_TURN_RANK_REASONS[rankState]}`;
    const turnRank = {
      state: rankState,
      reason: WORK_TURN_RANK_REASONS[rankState],
      text: rankText,
      // A partial or defective graph does not prove the pool's unresolved total.
      unresolvedN: hiddenN || matrixDefect ? null : members.reduce((acc, m) => acc + m.unresolvedN, 0),
      possiblePersonIds, possibleNames, certainPersonIds, certainNames,
    };

    const pool = {
      managerId,
      managerName: nameOf(managerId),
      isLeader: managerId === LEADER_ID,
      stateKey,
      memberN: all.length,
      hiddenN,
      totalN,
      shareSum,
      members,
      nextTurn,
      turnRank,
    };
    pools.push(pool);
    poolByManager.set(managerId, pool);
    board.pools[stateKey] += 1;
    board.turnRanks[rankState] += 1;
  }
  board.poolsReadN = pools.length;

  /* ----------------------------------------------------------- 3. the people */
  const peopleRead = [...graph.roster.keys()].filter(visiblePerson).sort(byText);
  board.peopleReadN = peopleRead.length;
  let sharedN = 0;
  const people = [];
  for (const personId of peopleRead) {
    const alloc = allocOf(personId);
    if (alloc.lineN > 1) sharedN += 1;
    const c = carry.get(personId);
    if (!c) { board.verdicts.within += 1; continue; }
    board.carriersN += 1;
    const lines = alloc.lines.map((l) => {
      const pool = poolByManager.get(l.managerId) || null;
      const member = pool ? pool.members.find((m) => m.personId === personId && m.lineId === l.lineId) || null : null;
      return {
        lineId: l.lineId,
        managerId: l.managerId,
        managerName: nameOf(l.managerId),
        kind: l.kind,
        shareH: Number.isInteger(l.shareH) ? l.shareH : null,
        carriedN: (c.byLine.get(l.lineId) || []).length,
        poolState: pool ? pool.stateKey : null,
        over: Boolean(member && member.over),
      };
    });
    const everyPoolDecided = lines.length > 0 && lines.every((l) => DECIDED_POOL_STATES.has(l.poolState));
    const linesCarryingN = lines.filter((l) => l.carriedN > 0).length;
    let verdict;
    if (c.unreadableN > 0) verdict = 'unplaced';
    else if (lines.some((l) => l.over)) verdict = 'over-turn';
    // One ask can meet neither test (both need two), so `within` is exact for
    // it whatever the pools read. From two asks on, an unread pool is a refusal.
    else if (c.nptN >= 2 && !everyPoolDecided) verdict = 'unread';
    else if (alloc.lineN >= 2 && linesCarryingN >= 2 && c.nptN >= 2 && nptN >= minAsks
      && c.nptN * board.peopleReadN * 100 >= factorPct * nptN) verdict = 'stacked';
    else verdict = 'within';
    board.verdicts[verdict] += 1;
    people.push({
      personId,
      name: nameOf(personId),
      lineN: alloc.lineN,
      nptN: c.nptN,
      unreadableN: c.unreadableN,
      askIds: [...c.askIds].sort(byText),
      verdict,
      lines,
    });
  }

  /* --------------------------------------------------------- 4. the findings */
  const findings = [];
  for (const pool of pools) {
    if (pool.stateKey !== 'concentrated') continue;
    const over = pool.members.filter((m) => m.over);
    const ownerState = pool.isLeader ? 'leader-held' : graph.roster.has(pool.managerId) ? 'unique' : 'off-roster';
    findings.push({
      kind: 'pool',
      subject: `pool|${pool.managerId}`,
      signature: workTurnSignature(over.flatMap((m) => m.askIds)),
      ownerState,
      ownerId: ownerState === 'unique' ? pool.managerId : null,
      ownerName: ownerState === 'unique' ? pool.managerName : null,
      managerId: pool.managerId,
      managerName: pool.managerName,
      peopleN: over.length,
      personIds: over.map((m) => m.personId),
      personNames: over.map((m) => m.name),
      carriedN: over.reduce((acc, m) => acc + m.carriedN, 0),
      totalN: pool.totalN,
    });
  }
  for (const person of people) {
    if (person.verdict !== 'stacked') continue;
    const apex = matrixJointApex(graph, person.lines.map((l) => l.managerId));
    const ownerState = apex.isLeaderOnly ? 'leader-held'
      : apex.unique ? (graph.roster.has(apex.apexId) ? 'unique' : 'off-roster')
        : 'ambiguous';
    findings.push({
      kind: 'stack',
      subject: `stack|${person.personId}`,
      signature: workTurnSignature(person.askIds),
      ownerState,
      ownerId: ownerState === 'unique' ? apex.apexId : null,
      ownerName: ownerState === 'unique' ? nameOf(apex.apexId) : null,
      managerId: null,
      managerName: null,
      peopleN: 1,
      personIds: [person.personId],
      personNames: [person.name],
      carriedN: person.nptN,
      totalN: nptN,
    });
  }
  for (const finding of findings) {
    board.findingKinds[finding.kind] += 1;
    board.owners[finding.ownerState] += 1;
  }
  board.findingsN = findings.length;

  const markers = Array.isArray(state?.workTurnMarkers) ? state.workTurnMarkers : [];
  const markerTasks = new Set(markers.filter((m) => m?.kind === 'ask' && m.taskId).map((m) => m.taskId));
  board.openRotationAsksN = delegations
    .filter((d) => d?.status === 'active' && markerTasks.has(d.id) && visiblePerson(d.personId)).length;

  board.populationReconciles = board.asksNotReadN + board.asksReturnedN + board.asksRuleIssuedN + board.asksReadN === board.asksInWindowN;
  board.classesReconcile = sum(board.classes) === board.asksReadN;
  board.placementsReconcile = sum(board.placements) === nptN;
  board.verdictsReconcile = sum(board.verdicts) === board.peopleReadN;
  board.poolsReconcile = sum(board.pools) === board.poolsReadN;
  board.turnRanksReconcile = sum(board.turnRanks) === board.poolsReadN;
  board.ownersReconcile = sum(board.owners) === board.findingsN && sum(board.findingKinds) === board.findingsN;

  /* ------------------------------------------- 5. what this seat is shown */
  askRows.sort((a, b) => byText(b.delegatedOn, a.delegatedOn) || byText(a.delegationId, b.delegationId));
  const declaredLevel = seat.disclosure?.names;
  const level = full ? 'visible'
    : readOnly ? 'none'
      : WORK_TURN_DETAIL_LEVELS.includes(declaredLevel) ? declaredLevel : 'none';

  let shownPools = pools;
  let shownPeople = people;
  let shownAsks = askRows.slice(0, WORK_TURN_LIMITS.askRows);
  let shownFindings = findings;
  if (level === 'leaders') {
    // Leaders by name, people as counts: a row is shown only where EVERYONE it
    // names leads a line of their own. A director therefore still reads — and
    // classifies — the asks handed to the managers below them.
    const leads = (id) => poolMembers.has(id);
    shownPools = pools.map((pool) => (pool.members.every((m) => leads(m.personId))
      ? pool
      : {
        ...pool, members: [], nextTurn: null,
        turnRank: {
          state: 'withheld', reason: WORK_TURN_DETAIL_REASONS.leaders, text: 'Withheld at this altitude',
          unresolvedN: null, possiblePersonIds: [], possibleNames: [], certainPersonIds: [], certainNames: [],
        },
      }));
    shownPeople = people.filter((p) => leads(p.personId));
    shownAsks = askRows.filter((a) => leads(a.personId)).slice(0, WORK_TURN_LIMITS.askRows);
    shownFindings = findings.map((f) => (f.personIds.every(leads)
      ? f
      : { ...f, signature: null, personIds: [], personNames: [] }));
  } else if (level === 'none') {
    shownPools = [];
    shownPeople = [];
    shownAsks = [];
    shownFindings = [];
  }

  const structure = sharedN > 0 ? 'matrix' : 'single-chain';
  return {
    generatedAt: at.toISOString(),
    generatedOn: today,
    seat,
    conventions: conv,
    window: { from, to: today, days: windowDays },
    minAsks,
    factorPct,
    board,
    pools: shownPools,
    people: shownPeople,
    asks: shownAsks,
    asksListedN: shownAsks.length,
    asksUnlistedN: askRows.length - shownAsks.length,
    findings: shownFindings,
    detail: { level, withheld: level !== 'visible', reason: WORK_TURN_DETAIL_REASONS[level] },
    actor: {
      canClassify: !readOnly,
      canGovern: !readOnly && (full || Boolean(canAct(WORK_TURN_RIGHTS.GOVERN, seat).allow)),
    },
    method: WORK_TURN_METHOD,
    structure,
    sharedPeopleN: sharedN,
    inertNote: nptN ? '' : 'No ask handed over inside the window has been declared non-promotable, so there is no turn to read yet. Classify the asks below.',
  };
}

const yn = (v) => (v ? 'yes' : 'NO');

export function workTurnBriefText(report) {
  const b = report.board;
  const w = report.window;
  return [
    `Non-promotable work turns — ${report.generatedOn} (window ${w.from} → ${w.to}, ${w.days} days)`,
    `Asks in window: ${b.asksInWindowN}; read: ${b.asksReadN}; handed back: ${b.asksReturnedN}; issued by automation: ${b.asksRuleIssuedN}; outside this seat: ${b.asksNotReadN}; population reconciles: ${yn(b.populationReconciles)}`,
    `Non-promotable: ${b.classes['non-promotable']}; promotable: ${b.classes.promotable}; not classified: ${b.classes.unclassified}; classes reconcile: ${yn(b.classesReconcile)}`,
    `Placed on a named line: ${b.placements.attributed}; single line: ${b.placements['sole-line']}; no line: ${b.placements.unplaced}; line no longer held: ${b.placements.stale}; placements reconcile: ${yn(b.placementsReconcile)}`,
    `People read: ${b.peopleReadN}; carrying non-promotable work: ${b.carriersN}; over a fair turn: ${b.verdicts['over-turn']}; stacked across lines: ${b.verdicts.stacked}; on no line: ${b.verdicts.unplaced}; pool not read: ${b.verdicts.unread}; within: ${b.verdicts.within}; verdicts reconcile: ${yn(b.verdictsReconcile)}`,
    `Pools read: ${b.poolsReadN}; concentrated: ${b.pools.concentrated}; spread: ${b.pools.even}; too few asks: ${b.pools['below-floor']}; share missing: ${b.pools['share-undeclared']}; total share zero: ${b.pools['share-zero']}; partly outside this seat: ${b.pools.partial}; pools reconcile: ${yn(b.poolsReconcile)}`,
    `Next-turn evidence: ${b.turnRanks.stable} stable; ${b.turnRanks.uncertain} uncertain; ${b.turnRanks.partial} partial; ${b.turnRanks['matrix-defect']} refused lines; ${b.turnRanks['missing-share']} missing share; ${b.turnRanks['too-few']} fewer than two eligible; ${b.turnRanks['no-evidence']} no evidence; ${b.turnRanks['unreadable-asks']} unreadable asks; ranks reconcile: ${yn(b.turnRanksReconcile)}. Count-based only; not capacity or consent.`,
    `Findings: ${b.findingsN} (pool ${b.findingKinds.pool}, stacked ${b.findingKinds.stack}); owners reconcile: ${yn(b.ownersReconcile)}; open rotation asks: ${b.openRotationAsksN}`,
    `Conventions: floor ${report.minAsks} asks; over-turn at ${report.factorPct}% of a fair turn.`,
  ].join('\n');
}

export function workTurnCsvRows(report) {
  const b = report.board;
  const K = WORK_TURN_SETTING_KEYS;
  const row = Object.fromEntries(WORK_TURN_CSV_COLUMNS.map((key) => [key, '']));
  // An unresolved seat is refused in the export exactly as it is on screen:
  // one dated row that says so, with every count left blank.
  if (report.seat?.readOnly) return [{ ...row, row_type: 'refused', generated_on: report.generatedOn }];
  Object.assign(row, {
    row_type: 'summary',
    generated_on: report.generatedOn,
    scope: report.structure,
    detail_level: report.detail.level,
    window_from: report.window.from,
    window_to: report.window.to,
    window_days: report.window.days,
    min_asks: report.minAsks,
    factor_pct: report.factorPct,
    asks_in_window: b.asksInWindowN,
    asks_not_read: b.asksNotReadN,
    asks_returned: b.asksReturnedN,
    asks_rule_issued: b.asksRuleIssuedN,
    asks_read: b.asksReadN,
    population_reconciles: b.populationReconciles,
    asks_non_promotable: b.classes['non-promotable'],
    asks_promotable: b.classes.promotable,
    asks_unclassified: b.classes.unclassified,
    classes_reconcile: b.classesReconcile,
    npt_attributed: b.placements.attributed,
    npt_sole_line: b.placements['sole-line'],
    npt_unplaced: b.placements.unplaced,
    npt_stale: b.placements.stale,
    placements_reconcile: b.placementsReconcile,
    people_read: b.peopleReadN,
    carriers: b.carriersN,
    verdict_unplaced: b.verdicts.unplaced,
    verdict_over_turn: b.verdicts['over-turn'],
    verdict_unread: b.verdicts.unread,
    verdict_stacked: b.verdicts.stacked,
    verdict_within: b.verdicts.within,
    verdicts_reconcile: b.verdictsReconcile,
    pools_read: b.poolsReadN,
    pool_partial: b.pools.partial,
    pool_below_floor: b.pools['below-floor'],
    pool_share_undeclared: b.pools['share-undeclared'],
    pool_concentrated: b.pools.concentrated,
    pool_even: b.pools.even,
    pools_reconcile: b.poolsReconcile,
    findings: b.findingsN,
    findings_pool: b.findingKinds.pool,
    findings_stack: b.findingKinds.stack,
    owner_unique: b.owners.unique,
    owner_leader_held: b.owners['leader-held'],
    owner_ambiguous: b.owners.ambiguous,
    owner_off_roster: b.owners['off-roster'],
    owners_reconcile: b.ownersReconcile,
    open_rotation_asks: b.openRotationAsksN,
    ask_due_days: report.conventions[K.askDueDays],
    turn_rank_stable: b.turnRanks.stable,
    turn_rank_uncertain: b.turnRanks.uncertain,
    turn_rank_partial: b.turnRanks.partial,
    turn_rank_matrix_defect: b.turnRanks['matrix-defect'],
    turn_rank_missing_share: b.turnRanks['missing-share'],
    turn_rank_too_few: b.turnRanks['too-few'],
    turn_rank_no_evidence: b.turnRanks['no-evidence'],
    turn_rank_unreadable_asks: b.turnRanks['unreadable-asks'],
    turn_ranks_reconcile: b.turnRanksReconcile,
    pool_share_zero: b.pools['share-zero'],
  });
  return [row];
}
