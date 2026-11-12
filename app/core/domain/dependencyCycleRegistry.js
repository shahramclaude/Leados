/**
 * app/core/domain/dependencyCycleRegistry.js — the closed vocabulary of the
 * Cross-Boundary Dependency Feedback-Cycle Register (ADR-0183, Session 251,
 * Schema v145 unchanged, `#/matrix?panel=cycles`, CSV scope #137).
 *
 * Nothing in this module is inferred. The precedence direction of every typed
 * relation, the states, the refusals, the frameworks, the CSV columns and the
 * bounds are DECLARED here so a reader can argue with them. The read model in
 * `dependencyCycle.js` prints this file; it never paraphrases it.
 *
 * The item is the DSM partitioning slice of the Session-203 Planned capability:
 * exact strongly-connected-component partitioning of the typed dependency
 * graph, the condensation order, and the reporting-line reach of each coupled
 * block. Tearing, weighted numerical DSMs, clustering and simulation are NOT
 * claimed — they remain In Progress in ROADMAP.md.
 */

import { LINK_ENTITY_TYPES, FORBIDDEN_LINK_TYPES } from './cases.js';

export const DEPENDENCY_CYCLE_ENGINE_VERSION = 'dependency-cycle-2026.11-v1';
export const DEPENDENCY_CYCLE_ADR = 'ADR-0183';
export const DEPENDENCY_CYCLE_PANEL = 'cycles';
export const DEPENDENCY_CYCLE_CSV_SCOPE = 'matrix-dependency-cycles';

/**
 * The work-node vocabulary. A node is a canonical, non-confidential entity in
 * the shared typed graph that is NOT a person: people are the ATTRIBUTION side,
 * never a work item inside the dependency matrix. The list is derived once from
 * the single registry that link normalization, cleanup and resolution already
 * share, so a new entity type cannot pass one layer and vanish in another.
 */
export const DEPENDENCY_CYCLE_NODE_TYPES = Object.freeze(
  LINK_ENTITY_TYPES.filter((type) => type !== 'person' && !FORBIDDEN_LINK_TYPES.includes(type)),
);

/**
 * The DEPENDENCY lexicon. Each relation is a declared PRECEDENCE edge:
 * `'source-first'` means the source must settle before the target;
 * `'target-first'` means the target must settle before the source.
 *
 * Strongly connected components are invariant under a global reversal of every
 * edge, but NOT under reversing only some of them, which is why the direction
 * of each relation is a declaration here rather than a guess in the reader.
 *
 * Symmetric couplings (`shares-barrier`, `shares-approver`, `couples`) are
 * deliberately EXCLUDED: an equivalence class is not a precedence claim, and
 * treating it as two directed arcs would manufacture a two-node cycle out of
 * every pair of items that merely share an approver.
 */
export const DEPENDENCY_CYCLE_RELATIONS = Object.freeze([
  Object.freeze({
    relation: 'depends-on', direction: 'target-first',
    label: 'Declared upstream dependency',
    why: 'The source record waits on the target record, so the target is the prerequisite and the arc runs target → source.',
  }),
  Object.freeze({
    relation: 'rests-on', direction: 'target-first',
    label: 'Decision rests on a premise',
    why: 'A frozen decision rests on a recorded premise; the premise must be settled first, so the arc runs premise → decision.',
  }),
  Object.freeze({
    relation: 'informs', direction: 'source-first',
    label: 'Information precedence',
    why: 'The source record informs the target decision or action, so the source is read first and the arc runs source → target.',
  }),
  Object.freeze({
    relation: 'pre-registers', direction: 'source-first',
    label: 'Pre-registered work',
    why: 'A pre-registered bet declares the governed work it commits to before that work is graded, so the arc runs bet → work.',
  }),
  Object.freeze({
    relation: 'prefigures', direction: 'source-first',
    label: 'Scenario prefigures a case',
    why: 'A recorded war game prefigures the case whose severity it worsens; the scenario is read before the case.',
  }),
]);

export const DEPENDENCY_CYCLE_RELATION_KEYS = Object.freeze(
  DEPENDENCY_CYCLE_RELATIONS.map((row) => row.relation),
);

/** Couplings explicitly refused as precedence, with the reason printed. */
export const DEPENDENCY_CYCLE_EXCLUDED_RELATIONS = Object.freeze([
  Object.freeze({ relation: 'shares-barrier', reason: 'A shared systemic barrier is an equivalence class, not a declared precedence.' }),
  Object.freeze({ relation: 'shares-approver', reason: 'Two decisions waiting on the same approver are coupled, not ordered.' }),
  Object.freeze({ relation: 'couples', reason: 'A discovered coupling carries no direction and cannot be sequenced.' }),
  Object.freeze({ relation: 'impacts-goal', reason: 'An impact statement says what is at stake, not which record must settle first.' }),
]);

/**
 * The PEOPLE lexicon: the typed edges that name the person a work item touches.
 * Only these relations attribute a work node to a reporting line. A work node
 * with no such edge is `line-reach-unknown` and refuses every cross-line claim;
 * it is never assigned to the workspace root by default.
 */
export const DEPENDENCY_CYCLE_PEOPLE_RELATIONS = Object.freeze([
  'involves', 'concerns', 'coaches', 'assessed-for', 'structures',
  'separates', 'retains', 'hands-over', 'develops', 'onboards', 'stewards',
]);

export const DEPENDENCY_CYCLE_BLOCK_STATES = Object.freeze([
  Object.freeze({ key: 'feedback-cycle', label: 'Coupled feedback block', tone: 'bad', rank: 0 }),
  Object.freeze({ key: 'sequential', label: 'Sequential block', tone: 'neutral', rank: 1 }),
]);

export const DEPENDENCY_CYCLE_LINE_STATES = Object.freeze([
  Object.freeze({ key: 'cross-line', label: 'More than one accountable line holder', tone: 'warn', rank: 0 }),
  Object.freeze({ key: 'single-line', label: 'One accountable line holder', tone: 'neutral', rank: 1 }),
  Object.freeze({ key: 'line-reach-unknown', label: 'Line reach refused', tone: 'bad', rank: 2 }),
]);

/**
 * Ownership of a feedback block, in declared precedence order. `ambiguous-apex`
 * is a FINDING, not a refusal to print: the matrix DAG can return two
 * incomparable minimal ancestors and the register names both rather than
 * picking one. `unattributed` is a REFUSAL of the cross-line claim.
 */
export const DEPENDENCY_CYCLE_OWNER_STATES = Object.freeze([
  Object.freeze({ key: 'unattributed', label: 'Line reach not recorded', tone: 'bad', rank: 0 }),
  Object.freeze({ key: 'ambiguous-apex', label: 'No single joint apex', tone: 'bad', rank: 1 }),
  Object.freeze({ key: 'joint-apex', label: 'One joint apex', tone: 'warn', rank: 2 }),
  Object.freeze({ key: 'single-line', label: 'One line holds it', tone: 'neutral', rank: 3 }),
  Object.freeze({ key: 'not-applicable', label: 'No joint-owner claim for a sequential block', tone: 'neutral', rank: 4 }),
]);

export const DEPENDENCY_CYCLE_WORKSPACE_VERDICTS = Object.freeze([
  Object.freeze({ key: 'unprovable-line-reach', label: 'Feedback cycles found; the cross-line claim is refused', tone: 'bad', rank: 0 }),
  Object.freeze({ key: 'cross-line-cycles', label: 'Feedback cycles cross reporting lines', tone: 'bad', rank: 1 }),
  Object.freeze({ key: 'single-line-cycles', label: 'Feedback cycles are inside one line', tone: 'warn', rank: 2 }),
  Object.freeze({ key: 'acyclic', label: 'Dependency arcs are acyclic', tone: 'good', rank: 3 }),
  Object.freeze({ key: 'no-arcs', label: 'No declared precedence arc', tone: 'neutral', rank: 4 }),
]);

/** Every refusal is closed, counted and printed. None is a silent drop. */
export const DEPENDENCY_CYCLE_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unresolved-endpoint', label: 'An edge names a record the workspace no longer holds' }),
  Object.freeze({ key: 'forbidden-type', label: 'A confidential or anonymous entity cannot enter the matrix' }),
  Object.freeze({ key: 'outside-node-vocabulary', label: 'An endpoint is not a declared work-node type' }),
  Object.freeze({ key: 'person-node', label: 'A person is attribution, never a dependency node' }),
  Object.freeze({ key: 'unknown-relation', label: 'The relation is not a declared precedence relation' }),
  Object.freeze({ key: 'untraced-person', label: 'A named person is not on the active roster' }),
  Object.freeze({ key: 'no-active-line', label: 'A named person has no active reporting line' }),
  Object.freeze({ key: 'outside-seat', label: 'The named person is outside this seat’s visible population' }),
  Object.freeze({ key: 'matrix-defect', label: 'The declared reporting graph has a load-time defect' }),
  Object.freeze({ key: 'limit-exceeded', label: 'The graph exceeds the declared processing bound' }),
  Object.freeze({ key: 'self-arc', label: 'A record names itself as its own prerequisite' }),
]);

export const DEPENDENCY_CYCLE_LIMITS = Object.freeze({
  maxLinks: 20000,
  maxNodes: 4000,
  maxArcs: 12000,
  maxPrintedBlocks: 80,
});

export const DEPENDENCY_CYCLE_CONVENTIONS = Object.freeze([
  Object.freeze({
    label: 'A dependency is a declared typed edge, never a resemblance',
    detail: 'Only the five relations in the printed lexicon create an arc. No title similarity, co-occurrence, inferred weight or ML heuristic ever creates one. Every other relation is counted as excluded with its reason.',
  }),
  Object.freeze({
    label: 'Partitioning is exact, not approximate',
    detail: 'Strongly connected components are computed by an iterative two-pass graph algorithm over the exact adjacency derived from stored links. The result does not depend on node order, and no random restarts or heuristic clustering are used.',
  }),
  Object.freeze({
    label: 'A coupled block is not sequenced inside itself',
    detail: 'Records inside a feedback block are printed as one irreducible set. The condensation graph is acyclic and is ordered topologically, but the reader never invents an order inside a cycle or tears an edge to make one.',
  }),
  Object.freeze({
    label: 'One person, one line set, once',
    detail: 'A work node’s line reach is the union of the active reporting lines of the people its typed people-edges name. Each distinct line id is counted once per block; a person on three lines contributes three lines, not three people.',
  }),
  Object.freeze({
    label: 'No invented owner in a matrix',
    detail: 'A cross-line block is escalated to the canonical `matrixJointApex` of its line managers. Two incomparable minimal ancestors are printed as both; a disconnected graph is named disconnected. Nobody is chosen silently.',
  }),
  Object.freeze({
    label: 'Refusal instead of imputation',
    detail: 'A node with no recorded people-edge, an untraceable person, a defect in the declared graph or an out-of-seat person is `line-reach-unknown` and refuses the workspace cross-line claim. It is never charged to the home line by default.',
  }),
  Object.freeze({
    label: 'Two claims stay apart',
    detail: '“The counts add up” (countsReconcile) and “every printed figure is the computed figure” (figuresComplete) are separate claims. A reader that reconciles may still refuse the cross-line claim because the line reach is incomplete.',
  }),
]);

export const DEPENDENCY_CYCLE_FRAMEWORKS = Object.freeze([
  Object.freeze({
    label: 'Design Structure Matrix partitioning (Steward, 1981; Eppinger & Browning, 2012)',
    detail: 'A square dependency matrix is reordered into block-triangular form by identifying strongly connected components; coupled blocks form the irreducible squares on the diagonal. This register ships the partitioning and the condensation order.',
  }),
  Object.freeze({
    label: 'Strongly connected components (Tarjan, 1972; Kosaraju)',
    detail: 'Exact mutual-reachability partition of a directed graph, computed here iteratively (no recursion, bounded input) so a large workspace cannot overflow the stack.',
  }),
  Object.freeze({
    label: 'Information-processing view of the matrix (Galbraith, 1973; Simon, 1962)',
    detail: 'A feedback cycle that crosses reporting lines is a coordination cost no single manager can schedule away; near-decomposability is why the coupled block, not the individual record, is the unit of escalation.',
  }),
  Object.freeze({
    label: 'Common agency and minimal common ancestors in a matrix DAG (Bernheim & Whinston, 1986; ADR-0140)',
    detail: 'Several principals holding one coupled block escalate to their lowest joint apex. A diamond tie is reported as ambiguous; the system does not pick one of two incomparable managers.',
  }),
]);

/** CSV scope #137. Aggregate and identity-free: no id, name, title, note or date of any RECORD. */
export const DEPENDENCY_CYCLE_CSV_COLUMNS = Object.freeze([
  'row_kind', 'engine', 'generated_on', 'nodes_n', 'arcs_n', 'pairs_n',
  'internal_arcs_n', 'external_arcs_n', 'blocks_n', 'sequential_n', 'feedback_n',
  'cross_line_feedback_n', 'single_line_feedback_n', 'unattributed_feedback_n',
  'joint_apex_n', 'ambiguous_apex_n', 'distinct_lines_n',
  'line_reach_complete', 'counts_reconcile', 'figures_complete', 'cross_line_claim',
  'owner_state', 'block_state', 'block_size', 'block_internal_arcs_n',
  'block_external_in_n', 'block_external_out_n', 'block_distinct_lines_n',
  'upstream_n', 'downstream_n', 'verdict', 'refusal_reason',
]);

export const DEPENDENCY_CYCLE_CSV_DESCRIPTOR = Object.freeze({
  key: DEPENDENCY_CYCLE_CSV_SCOPE,
  label: 'Cross-boundary dependency feedback cycles (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-dependency-cycles',
  description: 'CSV scope #137 (ADR-0183, Schema v145 unchanged). One workspace row plus one row per ownership state and one row per coupled feedback block for the DSM partitioning of declared typed dependency arcs: nodes, arcs, distinct pairs, internal/external arcs, sequential and feedback blocks, cross-line, single-line and unattributed feedback blocks, unique and ambiguous joint apexes, distinct active reporting lines, and three separate claims (line_reach_complete, counts_reconcile, figures_complete) beside the cross_line_claim. NO person, NO manager, NO line id, NO record id, NO title, NO note, NO relation text and NO record date. A refused claim prints its reason; a refused figure is never a zero.',
});

export function dependencyCycleRelation(relation) {
  return DEPENDENCY_CYCLE_RELATIONS.find((row) => row.relation === relation) || null;
}

export function dependencyCycleVerdict(key) {
  return DEPENDENCY_CYCLE_WORKSPACE_VERDICTS.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_WORKSPACE_VERDICTS[DEPENDENCY_CYCLE_WORKSPACE_VERDICTS.length - 1];
}

export function dependencyCycleOwnerState(key) {
  return DEPENDENCY_CYCLE_OWNER_STATES.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_OWNER_STATES[0];
}

export function dependencyCycleBlockState(key) {
  return DEPENDENCY_CYCLE_BLOCK_STATES.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_BLOCK_STATES[1];
}

export function dependencyCycleLineState(key) {
  return DEPENDENCY_CYCLE_LINE_STATES.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_LINE_STATES[2];
}

/** The method lines the panel prints, in order. */
export const DEPENDENCY_CYCLE_METHOD = Object.freeze([
  'Read the shared typed-link spine written by the post-commit automation engine. Keep only the five declared precedence relations and orient each arc by its declared direction.',
  'Resolve both endpoints against the records the workspace actually holds. Drop nothing in silence: every failure is counted under a named refusal.',
  'Partition the exact directed graph into strongly connected components by an iterative two-pass algorithm. A component of more than one node — or one node with a self-arc — is a coupled feedback block.',
  'Build the condensation graph and order its blocks topologically. Blocks are ordered; records INSIDE a coupled block are never ordered, and no edge is torn.',
  'Attribute each block through the canonical matrix engine: the union of active reporting lines of the people its typed people-edges name. An unrecorded, untraceable, out-of-seat or defective attribution refuses the cross-line claim.',
  'Escalate a cross-line block to the canonical matrixJointApex of its managers. Name every incomparable apex; never pick one.',
  'Print four separate claims: line reach complete, counts reconcile, figures are the computed figures, and the cross-line claim. Reconciled counts do not license an unprovable structure claim.',
]);
