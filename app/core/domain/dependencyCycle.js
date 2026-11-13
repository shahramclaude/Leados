/**
 * app/core/domain/dependencyCycle.js — Cross-Boundary Dependency Feedback-Cycle
 * Register & Counterfactual Tear-Sensitivity Reader (ADR-0183 / ADR-0187,
 * Schema v148 unchanged, `#/matrix?panel=cycles`, CSV scope #137).
 *
 * Pure read model. It answers TWO structural questions a linear plan cannot:
 *
 *   1. Which work records are mutually dependent in a closed loop, and does that
 *      loop cross reporting lines that no single manager can settle?
 *   2. Which single declared precedence pairs inside each coupled block, if
 *      re-sequenced or split into an explicit premise, would uncouple the block
 *      into sequential steps or shrink its coupled core — without ever picking
 *      which business commitment ought to give way?
 *
 * The input is the shared typed-link spine written by the post-commit
 * cross-module automation engine; the reporting-line reach is read from the ONE
 * canonical matrix engine (`buildMatrix`, `matrixJointApex`); rule-issued asks
 * are read back from `delegations` + `links` (`RULE-CYC-01`). Nothing derived is
 * stored, no clock is read except the injected `now`, and no input object is
 * mutated — so a printed figure is the computed figure by construction.
 */

import { dayKey } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_COLLECTIONS,
  LINK_RELATIONS,
} from './cases.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  DEPENDENCY_CYCLE_ADR,
  DEPENDENCY_CYCLE_ASK_STATES,
  DEPENDENCY_CYCLE_BLOCK_STATES,
  DEPENDENCY_CYCLE_CONVENTIONS,
  DEPENDENCY_CYCLE_CSV_COLUMNS,
  DEPENDENCY_CYCLE_ENGINE_VERSION,
  DEPENDENCY_CYCLE_ESCALATION_ADR,
  DEPENDENCY_CYCLE_ESCALATION_STATES,
  DEPENDENCY_CYCLE_EXCLUDED_RELATIONS,
  DEPENDENCY_CYCLE_FRAMEWORKS,
  DEPENDENCY_CYCLE_LIMITS,
  DEPENDENCY_CYCLE_METHOD,
  DEPENDENCY_CYCLE_NODE_TYPES,
  DEPENDENCY_CYCLE_OWNER_STATES,
  DEPENDENCY_CYCLE_PEOPLE_RELATIONS,
  DEPENDENCY_CYCLE_REFUSALS,
  DEPENDENCY_CYCLE_RELATIONS,
  DEPENDENCY_CYCLE_RULE_ID,
  DEPENDENCY_CYCLE_TEAR_OUTCOMES,
  DEPENDENCY_CYCLE_TEAR_STATES,
  dependencyCycleVerdict,
} from './dependencyCycleRegistry.js';
import {
  DEPENDENCY_CYCLE_CLOSED_PREFIX,
  dependencyCycleSignature,
  normalizeDependencyCycleSettings,
  parseDependencyCycleAskSummary,
} from './dependencyCycleSchema.js';

const NODE_TYPES = new Set(DEPENDENCY_CYCLE_NODE_TYPES);
const RELATIONS = new Map(DEPENDENCY_CYCLE_RELATIONS.map((row) => [row.relation, row]));
const PEOPLE_RELATIONS = new Set(DEPENDENCY_CYCLE_PEOPLE_RELATIONS);
const REFUSAL_LABELS = new Map(DEPENDENCY_CYCLE_REFUSALS.map((row) => [row.key, row.label]));
const EXCLUDED = new Map(DEPENDENCY_CYCLE_EXCLUDED_RELATIONS.map((row) => [row.relation, row.reason]));

const str = (value) => (typeof value === 'string' ? value.trim() : '');
const sorted = (values) => [...values].sort((a, b) => String(a).localeCompare(String(b)));
const nodeKey = (type, id) => `${str(type)}:${str(id)}`;

/**
 * Exact strongly connected components, computed ITERATIVELY (Kosaraju's
 * two-pass partition). No recursion: a 4,000-node workspace cannot overflow
 * the JS stack. Exported so the test suite can compare it against a
 * brute-force mutual-reachability partition on exhaustively enumerated small
 * graphs — a claim of exactness has to be checkable, not merely asserted.
 *
 * `arcs` is an array of `{ from, to }` with both endpoints in `nodeIds`.
 * Returns an array of sorted components, sorted by their first node key.
 */
export function dependencyCycleComponents(nodeIds, arcs) {
  const ids = sorted(new Set(nodeIds));
  const present = new Set(ids);
  const forward = new Map(ids.map((id) => [id, []]));
  const reverse = new Map(ids.map((id) => [id, []]));
  for (const arc of arcs) {
    const from = arc?.from;
    const to = arc?.to;
    if (!present.has(from) || !present.has(to)) continue;
    forward.get(from).push(to);
    reverse.get(to).push(from);
  }
  for (const list of forward.values()) list.sort((a, b) => a.localeCompare(b));
  for (const list of reverse.values()) list.sort((a, b) => a.localeCompare(b));

  // Pass 1: DFS finishing order on the forward graph.
  const visited = new Set();
  const finished = [];
  for (const start of ids) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack = [[start, 0]];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbours = forward.get(frame[0]) || [];
      if (frame[1] < neighbours.length) {
        const next = neighbours[frame[1]];
        frame[1] += 1;
        if (!visited.has(next)) {
          visited.add(next);
          stack.push([next, 0]);
        }
      } else {
        finished.push(frame[0]);
        stack.pop();
      }
    }
  }

  // Pass 2: DFS on the reversed graph in decreasing finishing order.
  const assigned = new Set();
  const components = [];
  for (let i = finished.length - 1; i >= 0; i -= 1) {
    const start = finished[i];
    if (assigned.has(start)) continue;
    assigned.add(start);
    const component = [];
    const stack = [start];
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const previous of reverse.get(current) || []) {
        if (assigned.has(previous)) continue;
        assigned.add(previous);
        stack.push(previous);
      }
    }
    components.push(component.sort((a, b) => a.localeCompare(b)));
  }
  components.sort((a, b) => a[0].localeCompare(b[0]));
  return components;
}

/**
 * Exact counterfactual single-arc tear sensitivity for one coupled feedback
 * block (ADR-0187).
 *
 * Multiple typed links asserting the SAME directed pair `from → to` are grouped
 * into one precedence pair, because removing only one link while another still
 * asserts `from → to` leaves the precedence intact. Each distinct internal pair
 * is removed in turn and exact `dependencyCycleComponents` is run on the
 * remaining subgraph. No edge is recommended and no tie is broken.
 */
export function dependencyCycleTearSensitivity(
  memberKeys,
  internalArcs,
  {
    maxTearArcsPerBlock = DEPENDENCY_CYCLE_LIMITS.maxTearArcsPerBlock,
    lineReach = null,
    nodeLabels = null,
  } = {},
) {
  const members = sorted(new Set(memberKeys));
  const memberSet = new Set(members);
  const grouped = new Map();
  for (const arc of Array.isArray(internalArcs) ? internalArcs : []) {
    const from = str(arc?.from);
    const to = str(arc?.to);
    if (!memberSet.has(from) || !memberSet.has(to)) continue;
    const pairKey = `${from}>${to}`;
    if (!grouped.has(pairKey)) {
      grouped.set(pairKey, {
        pairKey,
        from,
        to,
        self: from === to,
        relations: new Set(),
        linkIds: new Set(),
        arcsN: 0,
      });
    }
    const entry = grouped.get(pairKey);
    entry.arcsN += 1;
    if (arc.relation) entry.relations.add(str(arc.relation));
    if (arc.linkId) entry.linkIds.add(str(arc.linkId));
  }
  const pairs = [...grouped.values()].sort((a, b) => a.pairKey.localeCompare(b.pairKey));

  if (pairs.length > maxTearArcsPerBlock) {
    return {
      tearState: 'tear-bound-exceeded',
      evaluated: false,
      internalPairsN: pairs.length,
      singleArcBreakN: null,
      partialTearN: null,
      persistentArcN: null,
      candidates: [],
      reconciles: true,
      reason: `Block holds ${pairs.length} distinct internal directed pairs, exceeding the ${maxTearArcsPerBlock}-pair counterfactual bound; tear sensitivity is refused rather than heuristically sampled.`,
    };
  }

  const candidates = pairs.map((pair) => {
    const remainingPairs = pairs.filter((other) => other.pairKey !== pair.pairKey);
    const remainingSelfNodes = new Set(remainingPairs.filter((p) => p.self).map((p) => p.from));
    const subComps = dependencyCycleComponents(members, remainingPairs);
    const feedbackSub = subComps.filter((comp) => comp.length > 1 || remainingSelfNodes.has(comp[0]));
    const remainingFeedbackBlocksN = feedbackSub.length;
    const coupledLeftN = feedbackSub.reduce((sum, comp) => sum + comp.length, 0);
    const freedNodesN = members.length - coupledLeftN;
    const breaksCycleCompletely = remainingFeedbackBlocksN === 0;
    const largestRemainingBlockSize = feedbackSub.reduce((max, comp) => Math.max(max, comp.length), 0);
    const outcome = breaksCycleCompletely
      ? 'acyclic'
      : (freedNodesN > 0 ? 'reduces-core' : 'core-persists');

    let arcSpanState = 'unattributed-endpoint';
    if (lineReach instanceof Map) {
      const fromReach = lineReach.get(pair.from);
      const toReach = lineReach.get(pair.to);
      if (fromReach?.state === 'known' && toReach?.state === 'known') {
        arcSpanState = (
          fromReach.managerIds.length === 1
          && toReach.managerIds.length === 1
          && fromReach.managerIds[0] === toReach.managerIds[0]
        ) ? 'same-holder' : 'cross-holder';
      }
    }

    const fromMeta = nodeLabels instanceof Map ? nodeLabels.get(pair.from) : null;
    const toMeta = nodeLabels instanceof Map ? nodeLabels.get(pair.to) : null;

    return {
      pairKey: fromMeta?.withheld || toMeta?.withheld ? 'withheld' : pair.pairKey,
      from: fromMeta?.withheld ? 'withheld' : pair.from,
      to: toMeta?.withheld ? 'withheld' : pair.to,
      fromLabel: fromMeta ? fromMeta.label : pair.from,
      toLabel: toMeta ? toMeta.label : pair.to,
      self: pair.self,
      relations: sorted(pair.relations),
      arcsN: pair.arcsN,
      linkIds: fromMeta?.withheld || toMeta?.withheld ? [] : sorted(pair.linkIds),
      outcome,
      breaksCycleCompletely,
      remainingFeedbackBlocksN,
      largestRemainingBlockSize,
      coupledLeftN,
      freedNodesN,
      arcSpanState,
    };
  });

  const singleArcBreakN = candidates.filter((c) => c.outcome === 'acyclic').length;
  const partialTearN = candidates.filter((c) => c.outcome === 'reduces-core').length;
  const persistentArcN = candidates.filter((c) => c.outcome === 'core-persists').length;
  const reconciles = (singleArcBreakN + partialTearN + persistentArcN === pairs.length)
    && candidates.every((c) => c.freedNodesN + c.coupledLeftN === members.length);

  let tearState = 'multi-arc-only';
  if (singleArcBreakN > 0) tearState = 'single-arc-tearable';
  else if (partialTearN > 0) tearState = 'partial-single-tear';

  return {
    tearState,
    evaluated: true,
    internalPairsN: pairs.length,
    singleArcBreakN,
    partialTearN,
    persistentArcN,
    candidates,
    reconciles,
    reason: null,
  };
}

/** Resolve a work node against the record the workspace actually holds. */
function resolveNode(state, type, id) {
  if (!NODE_TYPES.has(type) || FORBIDDEN_LINK_TYPES.includes(type)) return null;
  const collection = LINK_ENTITY_COLLECTIONS[type];
  if (typeof collection !== 'string') return null;
  const rows = state[collection];
  if (!Array.isArray(rows)) return null;
  const target = str(id);
  const record = rows.find((row) => row && str(row.id) === target);
  if (!record) return null;
  const title = str(record.title || record.name || record.label || type).slice(0, 80) || type;
  return { type, id: target, key: nodeKey(type, target), title };
}

function linkSortKey(link) {
  return [
    str(link?.sourceType), str(link?.sourceId), str(link?.relation),
    str(link?.targetType), str(link?.targetId), str(link?.id),
  ].join('|');
}

function emptyBoard(reason) {
  return {
    verdict: 'no-arcs', verdictLabel: dependencyCycleVerdict('no-arcs').label, tone: 'neutral',
    nodesN: 0, arcsN: 0, pairsN: 0, internalArcsN: 0, externalArcsN: 0,
    blocksN: 0, sequentialN: 0, feedbackN: 0,
    crossLineFeedbackN: 0, singleLineFeedbackN: 0, unattributedFeedbackN: 0,
    jointApexN: 0, ambiguousApexN: 0, distinctLineN: 0, distinctLinePairN: 0,
    excludedRelationsN: 0, refusalsN: 0, duplicateArcsN: 0, selfArcsN: 0,
    lineReachComplete: false, countsReconcile: false, figuresComplete: false,
    condensationAcyclic: true, crossLineClaim: false,
    reason: reason || 'No declared precedence arc could be read.',
  };
}

function emptyTearing() {
  return {
    feedbackBlocksN: 0,
    evaluatedBlocksN: 0,
    singleArcTearableN: 0,
    partialSingleTearN: 0,
    multiArcOnlyN: 0,
    tearRefusedN: 0,
    internalPairsEvaluatedN: 0,
    singleArcBreakPairsN: 0,
    reconciles: true,
  };
}

function emptyAsks(conventions) {
  return {
    ruleId: DEPENDENCY_CYCLE_RULE_ID,
    autoPropagate: conventions.dependencyCycleAutoPropagate,
    askDueDays: conventions.dependencyCycleAskDueDays,
    feedbackBlocksN: 0,
    escalationStates: Object.fromEntries(DEPENDENCY_CYCLE_ESCALATION_STATES.map((s) => [s.key, 0])),
    askStates: Object.fromEntries(DEPENDENCY_CYCLE_ASK_STATES.map((k) => [k, 0])),
    openN: 0,
    answeredN: 0,
    notIssuedN: 0,
    notApplicableN: 0,
    observationsN: 0,
    reconciles: true,
  };
}

/** Index rule-issued asks from `links` + `delegations` so reader and rule agree. */
export function indexDependencyCycleAsks(state) {
  const rawLinks = Array.isArray(state?.links) ? state.links : [];
  const delegations = Array.isArray(state?.delegations) ? state.delegations : [];
  const taskById = new Map();
  for (const task of delegations) {
    if (task && typeof task.id === 'string') taskById.set(task.id, task);
  }
  const asks = [];
  for (const link of rawLinks) {
    if (!link || link.ruleId !== DEPENDENCY_CYCLE_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseDependencyCycleAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({
      signature: parsed.signature,
      seatId: str(link.sourceId),
      taskId: str(link.targetId),
      task: taskById.get(str(link.targetId)) || null,
    });
  }
  return asks;
}

/**
 * Build the register. Options:
 *   `now`               injected clock (only for the read date and matrix windows)
 *   `settings`          canonical settings override
 *   `visiblePersonIds`  Set of person ids a scoped seat may read; null = all
 */
export function buildDependencyCycles(state, { now = new Date(), settings = null, visiblePersonIds = null } = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const generatedOn = dayKey(now);
  const resolvedSettings = normalizeDependencyCycleSettings(settings || source.settings || {});
  const rawLinks = Array.isArray(source.links) ? source.links : [];

  let matrix;
  try {
    matrix = buildMatrix(source, { now, settings: settings || source.settings || null });
  } catch (error) {
    const refused = emptyBoard(`The canonical matrix engine could not be built: ${String(error?.message || error)}`);
    refused.condensationAcyclic = false;
    return {
      engineVersion: DEPENDENCY_CYCLE_ENGINE_VERSION, adr: DEPENDENCY_CYCLE_ADR,
      escalationAdr: DEPENDENCY_CYCLE_ESCALATION_ADR, generatedOn,
      settings: resolvedSettings,
      board: refused, tearing: emptyTearing(), asks: emptyAsks(resolvedSettings),
      blocks: [], rollUps: [], interfaces: [], refusals: [], excluded: [],
      matrix: { hasMatrix: false, declaredLinesN: 0, activeLinesN: 0, defectsN: 0 },
      method: [...DEPENDENCY_CYCLE_METHOD], conventions: DEPENDENCY_CYCLE_CONVENTIONS,
      frameworks: DEPENDENCY_CYCLE_FRAMEWORKS, relations: DEPENDENCY_CYCLE_RELATIONS,
      ownerStates: DEPENDENCY_CYCLE_OWNER_STATES, blockStates: DEPENDENCY_CYCLE_BLOCK_STATES,
      tearStates: DEPENDENCY_CYCLE_TEAR_STATES, tearOutcomes: DEPENDENCY_CYCLE_TEAR_OUTCOMES,
      escalationStates: DEPENDENCY_CYCLE_ESCALATION_STATES,
    };
  }

  const refusalCounts = new Map();
  const refusalReasons = new Map();
  const noteRefusal = (key, detail = null) => {
    refusalCounts.set(key, (refusalCounts.get(key) || 0) + 1);
    if (detail) {
      if (!refusalReasons.has(key)) refusalReasons.set(key, new Set());
      refusalReasons.get(key).add(String(detail).slice(0, 160));
    }
  };

  const links = [...rawLinks].sort((a, b) => linkSortKey(a).localeCompare(linkSortKey(b)));
  let boundsExceeded = false;
  if (links.length > DEPENDENCY_CYCLE_LIMITS.maxLinks) {
    boundsExceeded = true;
    noteRefusal('limit-exceeded', `${links.length - DEPENDENCY_CYCLE_LIMITS.maxLinks} link(s) beyond the ${DEPENDENCY_CYCLE_LIMITS.maxLinks}-link bound were not read.`);
  }
  const scan = links.slice(0, DEPENDENCY_CYCLE_LIMITS.maxLinks);

  /* -------------------------------------------- 1. people attribution edges */
  const peopleByNode = new Map();
  for (const link of scan) {
    if (!link || typeof link !== 'object') continue;
    const relation = str(link.relation);
    if (!PEOPLE_RELATIONS.has(relation)) continue;
    const st = str(link.sourceType);
    const tt = str(link.targetType);
    if (FORBIDDEN_LINK_TYPES.includes(st) || FORBIDDEN_LINK_TYPES.includes(tt)) continue;
    let workType = null;
    let workId = null;
    let personId = null;
    if (st === 'person' && tt !== 'person') {
      workType = tt; workId = str(link.targetId); personId = str(link.sourceId);
    } else if (tt === 'person' && st !== 'person') {
      workType = st; workId = str(link.sourceId); personId = str(link.targetId);
    } else {
      continue;
    }
    const key = nodeKey(workType, workId);
    if (!peopleByNode.has(key)) peopleByNode.set(key, new Set());
    peopleByNode.get(key).add(personId);
  }

  /* ----------------------------------------------- 2. declared precedence arcs */
  const nodes = new Map();
  const arcs = [];
  const arcKeys = new Set();
  const pairs = new Set();
  const excludedCounts = new Map();
  const selfArcKeys = new Set();
  let duplicateArcsN = 0;
  let selfArcsN = 0;
  for (const link of scan) {
    if (!link || typeof link !== 'object') continue;
    const relation = str(link.relation);
    const declared = RELATIONS.get(relation);
    if (!declared) {
      if (relation) {
        excludedCounts.set(relation, (excludedCounts.get(relation) || 0) + 1);
        // A relation the workspace legitimately declares is not a failure: it
        // is simply not a precedence claim. Only a relation the registry does
        // not know at all is a refused, hand-edited edge.
        if (!LINK_RELATIONS.includes(relation)) {
          noteRefusal('unknown-relation', `“${relation}” is not a declared relation on the typed graph`);
        }
      }
      continue;
    }
    const st = str(link.sourceType);
    const tt = str(link.targetType);
    const sid = str(link.sourceId);
    const tid = str(link.targetId);
    if (FORBIDDEN_LINK_TYPES.includes(st) || FORBIDDEN_LINK_TYPES.includes(tt)) {
      noteRefusal('forbidden-type', `${st} → ${tt}`);
      continue;
    }
    if (st === 'person' || tt === 'person') {
      noteRefusal('person-node', `${st} → ${tt}`);
      continue;
    }
    if (!NODE_TYPES.has(st) || !NODE_TYPES.has(tt)) {
      noteRefusal('outside-node-vocabulary', `${st} → ${tt}`);
      continue;
    }
    const sourceNode = resolveNode(source, st, sid);
    const targetNode = resolveNode(source, tt, tid);
    if (!sourceNode || !targetNode) {
      noteRefusal('unresolved-endpoint', `${st}:${sid} → ${tt}:${tid}`);
      continue;
    }
    nodes.set(sourceNode.key, sourceNode);
    nodes.set(targetNode.key, targetNode);
    const from = declared.direction === 'source-first' ? sourceNode.key : targetNode.key;
    const to = declared.direction === 'source-first' ? targetNode.key : sourceNode.key;
    const arcKey = `${from}>${to}|${relation}`;
    if (arcKeys.has(arcKey)) { duplicateArcsN += 1; continue; }
    arcKeys.add(arcKey);
    const self = from === to;
    if (self) {
      selfArcsN += 1;
      selfArcKeys.add(from);
      noteRefusal('self-arc', `${from} (${relation})`);
    }
    arcs.push({ from, to, relation, self, linkId: str(link.id) });
    pairs.add(`${from}>${to}`);
  }

  if (nodes.size > DEPENDENCY_CYCLE_LIMITS.maxNodes || arcs.length > DEPENDENCY_CYCLE_LIMITS.maxArcs) {
    boundsExceeded = true;
    noteRefusal('limit-exceeded', `${nodes.size} node(s) / ${arcs.length} arc(s) exceed the declared ${DEPENDENCY_CYCLE_LIMITS.maxNodes}/${DEPENDENCY_CYCLE_LIMITS.maxArcs} bound; no structural claim is made.`);
  }

  /* ------------------------------------------------- 3. line reach per node */
  const defectN = Array.isArray(matrix.defects) ? matrix.defects.length : 0;
  if (defectN) noteRefusal('matrix-defect', `${defectN} defect(s) in the declared reporting graph`);
  const lineReach = new Map();
  const allLineIds = new Set();
  const nodeLabels = new Map();
  for (const key of sorted(nodes.keys())) {
    const node = nodes.get(key);
    const personIds = sorted(peopleByNode.get(key) || []);
    const lineIds = new Set();
    const managerIds = new Set();
    let unknown = defectN > 0;
    let outsideSeat = false;
    const reasons = [];
    if (!personIds.length) {
      unknown = true;
      reasons.push('No declared people-edge names anyone for this record.');
    }
    for (const personId of personIds) {
      if (visiblePersonIds && !visiblePersonIds.has(personId)) {
        unknown = true;
        outsideSeat = true;
        noteRefusal('outside-seat', 'Named person outside this seat’s visible population.');
        reasons.push('A named person is outside this seat’s visible population.');
        continue;
      }
      if (!matrix.roster.has(personId)) {
        unknown = true;
        noteRefusal('untraced-person', visiblePersonIds ? 'off-roster person' : personId);
        reasons.push('A named person is not on the active roster.');
        continue;
      }
      const active = (matrix.linesByPerson.get(personId) || []).filter((line) => line && line.active !== false);
      if (!active.length) {
        unknown = true;
        noteRefusal('no-active-line', visiblePersonIds ? 'person with no active line' : personId);
        reasons.push('A named person has no active reporting line.');
        continue;
      }
      for (const line of active) {
        lineIds.add(line.id);
        managerIds.add(line.managerId);
        allLineIds.add(line.id);
      }
    }
    const withheld = Boolean(visiblePersonIds && (outsideSeat || !personIds.length));
    nodeLabels.set(key, {
      withheld,
      label: withheld ? `${node.type}: withheld outside seat span` : `${node.type}: ${node.title}`,
    });
    lineReach.set(key, {
      state: unknown ? 'line-reach-unknown' : 'known',
      personN: personIds.length,
      personIds: withheld ? [] : personIds,
      lineIds: sorted(lineIds),
      managerIds: sorted(managerIds),
      withheld,
      reason: reasons.length ? sorted(new Set(reasons)).join(' ') : null,
    });
  }

  /* ------------------------------------ 4. exact partitioning + condensation */
  const components = dependencyCycleComponents(sorted(nodes.keys()), arcs);
  const blockOf = new Map();
  components.forEach((members, index) => members.forEach((key) => blockOf.set(key, index)));
  const incoming = new Map(components.map((_, index) => [index, new Set()]));
  const outgoing = new Map(components.map((_, index) => [index, new Set()]));
  const internalArcs = new Array(components.length).fill(0);
  const internalArcList = components.map(() => []);
  let externalArcsN = 0;
  for (const arc of arcs) {
    const a = blockOf.get(arc.from);
    const b = blockOf.get(arc.to);
    if (a === undefined || b === undefined) continue;
    if (a === b) {
      internalArcs[a] += 1;
      internalArcList[a].push(arc);
    } else {
      externalArcsN += 1;
      outgoing.get(a).add(b);
      incoming.get(b).add(a);
    }
  }

  // Kahn topological order over the condensation DAG (always acyclic by
  // construction; if it is not, the register refuses instead of ordering).
  const indegree = new Array(components.length).fill(0);
  for (let i = 0; i < components.length; i += 1) indegree[i] = incoming.get(i).size;
  const queue = [];
  for (let i = 0; i < components.length; i += 1) if (indegree[i] === 0) queue.push(i);
  const rank = new Array(components.length).fill(0);
  let orderedN = 0;
  while (queue.length) {
    const index = queue.shift();
    orderedN += 1;
    for (const next of [...outgoing.get(index)].sort((a, b) => a - b)) {
      rank[next] = Math.max(rank[next], rank[index] + 1);
      indegree[next] -= 1;
      if (indegree[next] === 0) queue.push(next);
    }
  }
  const condensationAcyclic = orderedN === components.length;

  const indexedAsks = indexDependencyCycleAsks(source);
  const markers = Array.isArray(source.matrixMarkers) ? source.matrixMarkers : [];
  const observationsN = markers.filter((m) => m && m.ruleId === DEPENDENCY_CYCLE_RULE_ID && m.kind === 'dependency-cycle').length;

  const blocks = components.map((members, index) => {
    const reach = members.map((key) => lineReach.get(key));
    const unknown = reach.some((row) => !row || row.state !== 'known');
    const lineIds = sorted(new Set(reach.flatMap((row) => (row ? row.lineIds : []))));
    const managerIds = sorted(new Set(reach.flatMap((row) => (row ? row.managerIds : []))));
    const personIds = sorted(new Set(reach.flatMap((row) => (row ? row.personIds : []))));
    const isFeedback = members.length > 1 || members.some((key) => selfArcKeys.has(key));
    // "Cross-line" means more than one ACCOUNTABLE MANAGER, not merely more
    // than one line row: two people on the same home branch each carry their
    // own `home:` line id but they are one line of accountability. A person on
    // two lines contributes two managers and is genuinely matrix.
    const lineState = unknown ? 'line-reach-unknown' : (managerIds.length >= 2 ? 'cross-line' : 'single-line');
    let ownerState = 'not-applicable';
    let apexIds = [];
    let apex = null;
    let apexBasis = null;
    if (isFeedback && !unknown && lineState === 'cross-line') {
      apexBasis = personIds.length >= 2 ? 'people' : 'line-managers';
      apex = matrixJointApex(matrix, apexBasis === 'people' ? personIds : managerIds);
      apexIds = sorted(apex.apexIds || []);
      ownerState = apex.unique && apex.apexId ? 'joint-apex' : 'ambiguous-apex';
    } else if (isFeedback && !unknown) {
      ownerState = 'single-line';
    } else if (isFeedback) {
      ownerState = 'unattributed';
    }
    const reason = unknown
      ? sorted(new Set(reach.filter((row) => row?.reason).map((row) => row.reason))).join(' ')
      : (ownerState === 'ambiguous-apex'
        ? `The matrix DAG returns ${apexIds.length || 'no'} incomparable minimal ancestor(s); both are named and none is picked.`
        : null);

    const signature = isFeedback ? dependencyCycleSignature(members) : null;
    const tearing = isFeedback
      ? dependencyCycleTearSensitivity(members, internalArcList[index], {
        maxTearArcsPerBlock: DEPENDENCY_CYCLE_LIMITS.maxTearArcsPerBlock,
        lineReach,
        nodeLabels,
      })
      : null;

    let escalation = null;
    if (isFeedback) {
      let escState = 'unattributed';
      let rawSeatId = null;
      let escBasis = null;
      if (ownerState === 'single-line') {
        const holderId = managerIds[0] || null;
        escBasis = 'single-line-holder';
        if (!holderId) escState = 'unattributed';
        else if (holderId === LEADER_ID) escState = 'leader-held';
        else if (!matrix.roster.has(holderId)) escState = 'off-roster';
        else { escState = 'unique'; rawSeatId = holderId; }
      } else if (ownerState === 'joint-apex') {
        const apexId = apexIds[0] || null;
        escBasis = 'joint-apex';
        if (!apexId) escState = 'ambiguous';
        else if (apexId === LEADER_ID) escState = 'leader-held';
        else if (!matrix.roster.has(apexId)) escState = 'off-roster';
        else { escState = 'unique'; rawSeatId = apexId; }
      } else if (ownerState === 'ambiguous-apex') {
        escState = 'ambiguous';
        escBasis = apexBasis;
      } else {
        escState = 'unattributed';
      }

      let askState = 'not-applicable';
      let askDueOn = null;
      let askId = null;
      if (escState === 'unique' && rawSeatId) {
        const matching = indexedAsks.filter((a) => a.signature === signature && a.seatId === rawSeatId && a.task && a.task.personId === rawSeatId);
        const openAsk = matching.find((a) => a.task.status === 'active');
        const answeredAsk = matching.find((a) => (
          (a.task.status === 'done' && !str(a.task.completionNote).startsWith(DEPENDENCY_CYCLE_CLOSED_PREFIX))
          || a.task.status === 'returned'
        ));
        if (openAsk) {
          askState = 'open';
          askDueOn = str(openAsk.task.dueOn) || null;
          askId = openAsk.taskId;
        } else if (answeredAsk) {
          askState = 'answered';
          askId = answeredAsk.taskId;
        } else {
          askState = 'not-issued';
        }
      }

      const seatWithheld = Boolean(rawSeatId && visiblePersonIds && !visiblePersonIds.has(rawSeatId));
      escalation = {
        state: escState,
        basis: escBasis,
        seatId: seatWithheld ? null : rawSeatId,
        seatName: rawSeatId && !seatWithheld ? (matrix.nodes.get(rawSeatId)?.name || rawSeatId) : null,
        seatWithheld,
        askState,
        askDueOn,
        askId: seatWithheld ? null : askId,
      };
    }

    const printedApexIds = visiblePersonIds
      ? apexIds.map((id) => (visiblePersonIds.has(id) ? id : 'withheld'))
      : apexIds;

    return {
      key: `blk-${String(index + 1).padStart(3, '0')}`,
      index,
      signature,
      members: members.map((key) => {
        const node = nodes.get(key);
        const reachRow = lineReach.get(key);
        const withheld = Boolean(reachRow?.withheld);
        return {
          key: withheld ? `${node.type}:withheld` : key,
          type: node.type,
          title: withheld ? 'withheld outside seat span' : node.title,
          personN: reachRow?.personN ?? 0,
          withheld,
        };
      }),
      size: members.length,
      state: isFeedback ? 'feedback-cycle' : 'sequential',
      lineState,
      ownerState,
      lineIds: visiblePersonIds ? lineIds.filter((lid) => !lid.startsWith('home:') || visiblePersonIds.has(lid.slice(5))) : lineIds,
      managerIds: visiblePersonIds ? managerIds.filter((mid) => visiblePersonIds.has(mid)) : managerIds,
      personIds,
      apexIds: printedApexIds,
      apexBasis,
      apexAmbiguous: ownerState === 'ambiguous-apex',
      internalArcsN: internalArcs[index],
      externalInN: incoming.get(index).size,
      externalOutN: outgoing.get(index).size,
      order: rank[index],
      reason,
      tearing,
      escalation,
    };
  });

  /* -------------------------------------------- 5. roll-ups, identities, claims */
  const feedback = blocks.filter((block) => block.state === 'feedback-cycle');
  const sequentialN = blocks.length - feedback.length;
  const crossLineFeedback = feedback.filter((block) => block.lineState === 'cross-line');
  const singleLineFeedback = feedback.filter((block) => block.lineState === 'single-line');
  const unattributedFeedback = feedback.filter((block) => block.ownerState === 'unattributed');
  const jointApex = feedback.filter((block) => block.ownerState === 'joint-apex');
  const ambiguousApex = feedback.filter((block) => block.ownerState === 'ambiguous-apex');

  const singleArcTearableN = feedback.filter((b) => b.tearing?.tearState === 'single-arc-tearable').length;
  const partialSingleTearN = feedback.filter((b) => b.tearing?.tearState === 'partial-single-tear').length;
  const multiArcOnlyN = feedback.filter((b) => b.tearing?.tearState === 'multi-arc-only').length;
  const tearRefusedN = feedback.filter((b) => b.tearing?.tearState === 'tear-bound-exceeded').length;
  const evaluatedFeedback = feedback.filter((b) => b.tearing?.evaluated);
  const tearingReconciles = (singleArcTearableN + partialSingleTearN + multiArcOnlyN + tearRefusedN === feedback.length)
    && feedback.every((b) => Boolean(b.tearing?.reconciles));
  const tearing = {
    feedbackBlocksN: feedback.length,
    evaluatedBlocksN: evaluatedFeedback.length,
    singleArcTearableN,
    partialSingleTearN,
    multiArcOnlyN,
    tearRefusedN,
    internalPairsEvaluatedN: evaluatedFeedback.reduce((s, b) => s + b.tearing.internalPairsN, 0),
    singleArcBreakPairsN: evaluatedFeedback.reduce((s, b) => s + b.tearing.singleArcBreakN, 0),
    reconciles: tearingReconciles,
  };

  const escCounts = Object.fromEntries(DEPENDENCY_CYCLE_ESCALATION_STATES.map((s) => [s.key, 0]));
  const askCounts = Object.fromEntries(DEPENDENCY_CYCLE_ASK_STATES.map((k) => [k, 0]));
  for (const block of feedback) {
    if (block.escalation) {
      escCounts[block.escalation.state] = (escCounts[block.escalation.state] || 0) + 1;
      askCounts[block.escalation.askState] = (askCounts[block.escalation.askState] || 0) + 1;
    }
  }
  const escSum = Object.values(escCounts).reduce((a, b) => a + b, 0);
  const askSum = Object.values(askCounts).reduce((a, b) => a + b, 0);
  const asksReconcile = escSum === feedback.length
    && askSum === feedback.length
    && (askCounts.open + askCounts.answered + askCounts['not-issued'] === escCounts.unique);
  const asks = {
    ruleId: DEPENDENCY_CYCLE_RULE_ID,
    autoPropagate: resolvedSettings.dependencyCycleAutoPropagate,
    askDueDays: resolvedSettings.dependencyCycleAskDueDays,
    feedbackBlocksN: feedback.length,
    escalationStates: escCounts,
    askStates: askCounts,
    openN: askCounts.open,
    answeredN: askCounts.answered,
    notIssuedN: askCounts['not-issued'],
    notApplicableN: askCounts['not-applicable'],
    observationsN,
    reconciles: asksReconcile,
  };

  const rollUpMap = new Map();
  for (const block of feedback) {
    const key = block.ownerState === 'joint-apex'
      ? `apex:${block.apexIds[0]}`
      : block.ownerState === 'ambiguous-apex' ? 'apex:ambiguous'
        : block.ownerState === 'unattributed' ? 'apex:unattributed' : 'apex:single-line';
    if (!rollUpMap.has(key)) rollUpMap.set(key, { key, ownerState: block.ownerState, blocksN: 0, crossLineN: 0, ambiguousN: 0, maxOrder: 0 });
    const entry = rollUpMap.get(key);
    entry.blocksN += 1;
    if (block.lineState === 'cross-line') entry.crossLineN += 1;
    if (block.apexAmbiguous) entry.ambiguousN += 1;
    entry.maxOrder = Math.max(entry.maxOrder, block.order);
  }
  const rollUps = [...rollUpMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  const interfaceMap = new Map();
  for (const block of crossLineFeedback) {
    const lines = block.lineIds;
    for (let i = 0; i < lines.length; i += 1) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const key = `${lines[i]}<>${lines[j]}`;
        interfaceMap.set(key, (interfaceMap.get(key) || 0) + 1);
      }
    }
  }
  const interfaces = [...interfaceMap.entries()]
    .map(([key, blockN]) => ({ key, blockN, lines: key.split('<>') }))
    .sort((a, b) => b.blockN - a.blockN || a.key.localeCompare(b.key));

  const internalArcsN = internalArcs.reduce((sum, value) => sum + value, 0);
  const arcsN = arcs.length;
  const nodesN = nodes.size;
  const countsReconcile = blocks.reduce((sum, block) => sum + block.size, 0) === nodesN
    && internalArcsN + externalArcsN === arcsN
    && sequentialN + feedback.length === blocks.length
    && blocks.length === components.length
    && tearingReconciles
    && asksReconcile;
  const lineReachComplete = !boundsExceeded && defectN === 0
    && [...lineReach.values()].every((row) => row.state === 'known');
  const figuresComplete = countsReconcile && condensationAcyclic && !boundsExceeded;
  // An empty graph is not evidence of a clean structure: a vacuous "cross-line
  // claim made" over zero arcs would read as reassurance. Refuse it explicitly.
  const crossLineClaim = lineReachComplete && figuresComplete && arcsN > 0;

  let verdictKey;
  if (!arcsN) verdictKey = 'no-arcs';
  else if (!feedback.length) verdictKey = 'acyclic';
  else if (!crossLineClaim) verdictKey = 'unprovable-line-reach';
  else if (crossLineFeedback.length) verdictKey = 'cross-line-cycles';
  else verdictKey = 'single-line-cycles';
  const verdict = dependencyCycleVerdict(verdictKey);

  const refusalRows = sorted(refusalCounts.keys()).map((key) => ({
    key,
    label: REFUSAL_LABELS.get(key) || key,
    n: refusalCounts.get(key),
    reasons: sorted(refusalReasons.get(key) || []),
  }));
  const excluded = sorted(excludedCounts.keys()).map((relation) => ({
    relation,
    n: excludedCounts.get(relation),
    reason: EXCLUDED.get(relation)
      || (PEOPLE_RELATIONS.has(relation)
        ? 'A people-attribution edge: it names the line reach of a work node and is never a precedence arc.'
        : 'A declared typed relation outside the closed precedence lexicon; it creates no arc.'),
  }));
  const refusalsN = refusalRows.reduce((sum, row) => sum + row.n, 0);

  let reason = null;
  if (!arcsN) reason = 'No declared precedence arc was read, so no sequencing or coupling claim is made.';
  else if (!crossLineClaim) {
    reason = [
      !lineReachComplete ? 'At least one node has no provable reporting-line reach' : null,
      !figuresComplete ? 'the computed figures are not complete' : null,
      boundsExceeded ? 'a declared processing bound was exceeded' : null,
    ].filter(Boolean).join('; ') + '. The coupled blocks are still printed; the cross-line claim is refused.';
  } else if (crossLineFeedback.length) {
    reason = `${crossLineFeedback.length} coupled block(s) cross reporting lines and cannot be sequenced by one manager.`;
  } else if (feedback.length) {
    reason = `${feedback.length} coupled block(s) are inside a single line and are printed as irreducible sets.`;
  } else {
    reason = 'The declared precedence graph has no feedback cycle; the condensation order is a valid sequence.';
  }

  const activeAdditional = (matrix.lines || []).filter((line) => line.role !== 'primary' && line.active !== false);
  const board = {
    verdict: verdictKey, verdictLabel: verdict.label, tone: verdict.tone,
    nodesN, arcsN, pairsN: pairs.size, internalArcsN, externalArcsN,
    blocksN: blocks.length, sequentialN, feedbackN: feedback.length,
    crossLineFeedbackN: crossLineFeedback.length,
    singleLineFeedbackN: singleLineFeedback.length,
    unattributedFeedbackN: unattributedFeedback.length,
    jointApexN: jointApex.length, ambiguousApexN: ambiguousApex.length,
    distinctLineN: allLineIds.size, distinctLinePairN: interfaces.length,
    excludedRelationsN: excluded.reduce((sum, row) => sum + row.n, 0),
    refusalsN, duplicateArcsN, selfArcsN,
    lineReachComplete, countsReconcile, figuresComplete, condensationAcyclic,
    crossLineClaim, reason,
  };

  return {
    engineVersion: DEPENDENCY_CYCLE_ENGINE_VERSION,
    adr: DEPENDENCY_CYCLE_ADR,
    escalationAdr: DEPENDENCY_CYCLE_ESCALATION_ADR,
    generatedOn,
    settings: resolvedSettings,
    board,
    tearing,
    asks,
    blocks,
    rollUps,
    interfaces,
    refusals: refusalRows,
    excluded,
    matrix: {
      hasMatrix: activeAdditional.length > 0,
      declaredLinesN: (matrix.lines || []).filter((line) => line.role !== 'primary').length,
      activeLinesN: activeAdditional.length,
      defectsN: defectN,
    },
    method: [...DEPENDENCY_CYCLE_METHOD],
    conventions: DEPENDENCY_CYCLE_CONVENTIONS,
    frameworks: DEPENDENCY_CYCLE_FRAMEWORKS,
    relations: DEPENDENCY_CYCLE_RELATIONS,
    ownerStates: DEPENDENCY_CYCLE_OWNER_STATES,
    blockStates: DEPENDENCY_CYCLE_BLOCK_STATES,
    tearStates: DEPENDENCY_CYCLE_TEAR_STATES,
    tearOutcomes: DEPENDENCY_CYCLE_TEAR_OUTCOMES,
    escalationStates: DEPENDENCY_CYCLE_ESCALATION_STATES,
  };
}

/** Aggregate CSV rows. Every declared column is present on every row. */
export function dependencyCycleCsvRows(report) {
  const b = report.board;
  const t = report.tearing || emptyTearing();
  const a = report.asks || emptyAsks(normalizeDependencyCycleSettings({}));
  const common = {
    engine: report.engineVersion,
    generated_on: report.generatedOn,
    nodes_n: b.nodesN, arcs_n: b.arcsN, pairs_n: b.pairsN,
    internal_arcs_n: b.internalArcsN, external_arcs_n: b.externalArcsN,
    blocks_n: b.blocksN, sequential_n: b.sequentialN, feedback_n: b.feedbackN,
    cross_line_feedback_n: b.crossLineFeedbackN,
    single_line_feedback_n: b.singleLineFeedbackN,
    unattributed_feedback_n: b.unattributedFeedbackN,
    joint_apex_n: b.jointApexN, ambiguous_apex_n: b.ambiguousApexN,
    distinct_lines_n: b.distinctLineN,
    single_arc_tearable_blocks_n: t.singleArcTearableN,
    partial_single_tear_blocks_n: t.partialSingleTearN,
    multi_arc_only_blocks_n: t.multiArcOnlyN,
    tear_refused_blocks_n: t.tearRefusedN,
    escalation_unique_n: a.escalationStates?.unique ?? 0,
    asks_open_n: a.openN,
    asks_answered_n: a.answeredN,
    asks_not_issued_n: a.notIssuedN,
    line_reach_complete: b.lineReachComplete,
    counts_reconcile: b.countsReconcile,
    figures_complete: b.figuresComplete,
    cross_line_claim: b.crossLineClaim,
    verdict: b.verdict,
    refusal_reason: b.reason || '',
  };
  const blankBlock = {
    owner_state: 'workspace', block_state: '', block_size: '',
    block_internal_arcs_n: '', block_external_in_n: '', block_external_out_n: '',
    block_distinct_lines_n: '', tear_state: '', single_arc_breaks_n: '',
    upstream_n: '', downstream_n: '',
  };
  const rows = [{ row_kind: 'workspace', ...common, ...blankBlock }];

  for (const state of DEPENDENCY_CYCLE_OWNER_STATES) {
    const members = report.blocks.filter((block) => block.state === 'feedback-cycle' && block.ownerState === state.key);
    rows.push({
      row_kind: 'owner_state', ...common,
      owner_state: state.key,
      block_state: 'feedback-cycle',
      block_size: members.reduce((sum, block) => sum + block.size, 0),
      block_internal_arcs_n: members.reduce((sum, block) => sum + block.internalArcsN, 0),
      block_external_in_n: members.reduce((sum, block) => sum + block.externalInN, 0),
      block_external_out_n: members.reduce((sum, block) => sum + block.externalOutN, 0),
      block_distinct_lines_n: new Set(members.flatMap((block) => block.lineIds)).size,
      tear_state: '',
      single_arc_breaks_n: '',
      upstream_n: members.reduce((sum, block) => sum + block.externalInN, 0),
      downstream_n: members.reduce((sum, block) => sum + block.externalOutN, 0),
      refusal_reason: b.crossLineClaim ? '' : (b.reason || ''),
    });
  }

  for (const block of report.blocks) {
    if (block.state !== 'feedback-cycle') continue;
    rows.push({
      row_kind: 'feedback_block', ...common,
      owner_state: block.ownerState,
      block_state: block.state,
      block_size: block.size,
      block_internal_arcs_n: block.internalArcsN,
      block_external_in_n: block.externalInN,
      block_external_out_n: block.externalOutN,
      block_distinct_lines_n: block.lineIds.length,
      tear_state: block.tearing?.tearState || '',
      single_arc_breaks_n: block.tearing?.evaluated ? block.tearing.singleArcBreakN : '',
      upstream_n: block.externalInN,
      downstream_n: block.externalOutN,
      refusal_reason: block.tearing?.reason || block.reason || '',
    });
  }
  return rows;
}

/** The paragraph that goes upward. It names no person, line, record or date. */
export function dependencyCycleBriefText(report) {
  const b = report.board;
  const t = report.tearing || emptyTearing();
  const a = report.asks || emptyAsks(normalizeDependencyCycleSettings({}));
  const claims = [
    `Counts ${b.countsReconcile ? 'reconcile' : 'DO NOT reconcile'}; printed figures ${b.figuresComplete ? 'are the computed figures' : 'are incomplete'}.`,
    `Line reach is ${b.lineReachComplete ? 'complete' : 'incomplete'}; the cross-line claim is ${b.crossLineClaim ? 'made' : 'REFUSED'}.`,
  ].join(' ');
  const tearSummary = b.feedbackN
    ? ` Counterfactual single-arc tear census: ${t.singleArcTearableN} block(s) uncouple under 1-arc removal, ${t.partialSingleTearN} shrink their core, ${t.multiArcOnlyN} require multi-arc (≥2) tearing and ${t.tearRefusedN} exceed the tear bound.`
    : '';
  const askSummary = b.feedbackN
    ? ` Escalation (${a.ruleId}): ${a.escalationStates?.unique ?? 0} block(s) resolve to one accountable roster seat (${a.openN} ask(s) open, ${a.answeredN} answered, ${a.notIssuedN} not yet issued); ${a.notApplicableN} block(s) have no single roster seat and are observed without substitution.`
    : '';
  return `${b.nodesN} work record(s) carry ${b.arcsN} declared precedence arc(s) over ${b.pairsN} distinct pair(s). Exact partitioning yields ${b.blocksN} block(s): ${b.sequentialN} sequential and ${b.feedbackN} coupled feedback block(s), with ${b.internalArcsN} arc(s) inside blocks and ${b.externalArcsN} between them. ${b.crossLineFeedbackN} coupled block(s) cross reporting lines; ${b.jointApexN} have one joint apex and ${b.ambiguousApexN} have incomparable apexes that are all named.${tearSummary}${askSummary} ${claims} ${b.reason || ''}`;
}

export default buildDependencyCycles;
