/**
 * app/core/domain/dependencyCycle.js — Cross-Boundary Dependency Feedback-Cycle
 * Register (ADR-0183, Session 251, Schema v145 unchanged,
 * `#/matrix?panel=cycles`, CSV scope #137).
 *
 * Pure read model. It answers ONE question a linear plan cannot:
 *
 *   which work records are mutually dependent in a closed loop, and does that
 *   loop cross reporting lines that no single manager can settle?
 *
 * The input is the shared typed-link spine written by the post-commit
 * cross-module automation engine; the reporting-line reach is read from the ONE
 * canonical matrix engine (`buildMatrix`, `matrixJointApex`). Nothing derived is
 * stored, no clock is read except the injected `now`, and no input object is
 * mutated — so a printed figure is the computed figure by construction.
 *
 * The exact partition and the condensation order are the DSM partitioning slice
 * of the Session-203 Planned capability. Tearing, numerical DSMs, clustering
 * and simulation are deliberately NOT implemented (ROADMAP: In Progress).
 */

import { dayKey } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_COLLECTIONS,
  LINK_RELATIONS,
} from './cases.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  DEPENDENCY_CYCLE_ADR,
  DEPENDENCY_CYCLE_BLOCK_STATES,
  DEPENDENCY_CYCLE_CONVENTIONS,
  DEPENDENCY_CYCLE_CSV_COLUMNS,
  DEPENDENCY_CYCLE_ENGINE_VERSION,
  DEPENDENCY_CYCLE_EXCLUDED_RELATIONS,
  DEPENDENCY_CYCLE_FRAMEWORKS,
  DEPENDENCY_CYCLE_LIMITS,
  DEPENDENCY_CYCLE_METHOD,
  DEPENDENCY_CYCLE_NODE_TYPES,
  DEPENDENCY_CYCLE_OWNER_STATES,
  DEPENDENCY_CYCLE_PEOPLE_RELATIONS,
  DEPENDENCY_CYCLE_REFUSALS,
  DEPENDENCY_CYCLE_RELATIONS,
  dependencyCycleRelation,
  dependencyCycleVerdict,
} from './dependencyCycleRegistry.js';

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

/**
 * Build the register. Options:
 *   `now`               injected clock (only for the read date and matrix windows)
 *   `settings`          canonical settings override
 *   `visiblePersonIds`  Set of person ids a scoped seat may read; null = all
 */
export function buildDependencyCycles(state, { now = new Date(), settings = null, visiblePersonIds = null } = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const generatedOn = dayKey(now);
  const rawLinks = Array.isArray(source.links) ? source.links : [];

  let matrix;
  try {
    matrix = buildMatrix(source, { now, settings: settings || source.settings || null });
  } catch (error) {
    const refused = emptyBoard(`The canonical matrix engine could not be built: ${String(error?.message || error)}`);
    refused.condensationAcyclic = false;
    return {
      engineVersion: DEPENDENCY_CYCLE_ENGINE_VERSION, adr: DEPENDENCY_CYCLE_ADR, generatedOn,
      board: refused, blocks: [], rollUps: [], interfaces: [], refusals: [], excluded: [],
      matrix: { hasMatrix: false, declaredLinesN: 0, activeLinesN: 0, defectsN: 0 },
      method: [...DEPENDENCY_CYCLE_METHOD], conventions: DEPENDENCY_CYCLE_CONVENTIONS,
      frameworks: DEPENDENCY_CYCLE_FRAMEWORKS, relations: DEPENDENCY_CYCLE_RELATIONS,
      ownerStates: DEPENDENCY_CYCLE_OWNER_STATES, blockStates: DEPENDENCY_CYCLE_BLOCK_STATES,
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
    if (!NODE_TYPES.has(workType) || !personId) continue;
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
    arcs.push({ from, to, relation, self });
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
  for (const key of sorted(nodes.keys())) {
    const personIds = sorted(peopleByNode.get(key) || []);
    const lineIds = new Set();
    const managerIds = new Set();
    let unknown = defectN > 0;
    const reasons = [];
    if (!personIds.length) {
      unknown = true;
      reasons.push('No declared people-edge names anyone for this record.');
    }
    for (const personId of personIds) {
      if (visiblePersonIds && !visiblePersonIds.has(personId)) {
        unknown = true;
        noteRefusal('outside-seat', personId);
        reasons.push('A named person is outside this seat’s visible population.');
        continue;
      }
      if (!matrix.roster.has(personId)) {
        unknown = true;
        noteRefusal('untraced-person', personId);
        reasons.push('A named person is not on the active roster.');
        continue;
      }
      const active = (matrix.linesByPerson.get(personId) || []).filter((line) => line && line.active !== false);
      if (!active.length) {
        unknown = true;
        noteRefusal('no-active-line', personId);
        reasons.push('A named person has no active reporting line.');
        continue;
      }
      for (const line of active) {
        lineIds.add(line.id);
        managerIds.add(line.managerId);
        allLineIds.add(line.id);
      }
    }
    lineReach.set(key, {
      state: unknown ? 'line-reach-unknown' : 'known',
      personN: personIds.length,
      personIds,
      lineIds: sorted(lineIds),
      managerIds: sorted(managerIds),
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
  let externalArcsN = 0;
  for (const arc of arcs) {
    const a = blockOf.get(arc.from);
    const b = blockOf.get(arc.to);
    if (a === undefined || b === undefined) continue;
    if (a === b) {
      internalArcs[a] += 1;
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
      // The joint apex is the lowest seat(s) covering the PEOPLE the block
      // touches when there are two or more of them: those are the ids whose
      // ancestor sets can hold a matrix diamond tie. With one person, the
      // equivalent question is the joint apex of that person's LINE HOLDERS.
      // The basis is printed, never switched in silence.
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
    return {
      key: `blk-${String(index + 1).padStart(3, '0')}`,
      index,
      members: members.map((key) => {
        const node = nodes.get(key);
        return { key, type: node.type, title: node.title, personN: lineReach.get(key)?.personN ?? 0 };
      }),
      size: members.length,
      state: isFeedback ? 'feedback-cycle' : 'sequential',
      lineState,
      ownerState,
      lineIds,
      managerIds,
      personIds,
      apexIds,
      apexBasis,
      apexAmbiguous: ownerState === 'ambiguous-apex',
      internalArcsN: internalArcs[index],
      externalInN: incoming.get(index).size,
      externalOutN: outgoing.get(index).size,
      order: rank[index],
      reason,
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
    && blocks.length === components.length;
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
    nodesN, arcsN, pairsN: pairs.size, internalArcsN, externalArcsN: externalArcsN,
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
    generatedOn,
    board,
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
  };
}

/** Aggregate CSV rows. Every declared column is present on every row. */
export function dependencyCycleCsvRows(report) {
  const b = report.board;
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
    block_distinct_lines_n: '', upstream_n: '', downstream_n: '',
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
      upstream_n: block.externalInN,
      downstream_n: block.externalOutN,
      refusal_reason: block.reason || '',
    });
  }
  return rows;
}

/** The paragraph that goes upward. It names no person, line, record or date. */
export function dependencyCycleBriefText(report) {
  const b = report.board;
  const claims = [
    `Counts ${b.countsReconcile ? 'reconcile' : 'DO NOT reconcile'}; printed figures ${b.figuresComplete ? 'are the computed figures' : 'are incomplete'}.`,
    `Line reach is ${b.lineReachComplete ? 'complete' : 'incomplete'}; the cross-line claim is ${b.crossLineClaim ? 'made' : 'REFUSED'}.`,
  ].join(' ');
  return `${b.nodesN} work record(s) carry ${b.arcsN} declared precedence arc(s) over ${b.pairsN} distinct pair(s). Exact partitioning yields ${b.blocksN} block(s): ${b.sequentialN} sequential and ${b.feedbackN} coupled feedback block(s), with ${b.internalArcsN} arc(s) inside blocks and ${b.externalArcsN} between them. ${b.crossLineFeedbackN} coupled block(s) cross reporting lines; ${b.jointApexN} have one joint apex and ${b.ambiguousApexN} have incomparable apexes that are all named. ${claims} ${b.reason || ''}`;
}

export default buildDependencyCycles;
