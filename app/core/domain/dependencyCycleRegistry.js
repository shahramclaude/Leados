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

export const DEPENDENCY_CYCLE_ENGINE_VERSION = 'dependency-cycle-2026.11-v2';
export const DEPENDENCY_CYCLE_ADR = 'ADR-0183';
export const DEPENDENCY_CYCLE_ESCALATION_ADR = 'ADR-0187';
export const DEPENDENCY_CYCLE_RULE_ID = 'RULE-CYC-01';
export const DEPENDENCY_CYCLE_RIGHT = 'govern-dependency-cycles';
export const DEPENDENCY_CYCLE_PANEL = 'cycles';
export const DEPENDENCY_CYCLE_CSV_SCOPE = 'matrix-dependency-cycles';

export const DEPENDENCY_CYCLE_EVENTS = Object.freeze({
  SCAN: 'matrix.cycles.scan',
  CONVENTIONS: 'matrix.cycles.conventions.set',
});

export const DEPENDENCY_CYCLE_DEFAULTS = Object.freeze({
  askDueDays: 7,
  autoPropagate: true,
});

export const DEPENDENCY_CYCLE_BOUNDS = Object.freeze({
  askDueDays: Object.freeze([1, 30]),
});

export const DEPENDENCY_CYCLE_SETTING_KEYS = Object.freeze({
  askDueDays: 'dependencyCycleAskDueDays',
  autoPropagate: 'dependencyCycleAutoPropagate',
});

export const DEPENDENCY_CYCLE_SETTING_LABELS = Object.freeze({
  askDueDays: 'Cycle remediation ask due window (days)',
  autoPropagate: 'Automatic cycle escalation (RULE-CYC-01)',
});

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
  maxTearArcsPerBlock: 64,
  asksPerCommit: 6,
  markers: 400,
});

export const DEPENDENCY_CYCLE_TEAR_STATES = Object.freeze([
  Object.freeze({
    key: 'single-arc-tearable',
    label: 'Uncouples under 1-arc tear',
    tone: 'good',
    detail: 'At least one declared precedence pair inside the block, if re-sequenced or split into an explicit premise, breaks the entire block into sequential records.',
  }),
  Object.freeze({
    key: 'partial-single-tear',
    label: 'Shrinks core under 1-arc tear',
    tone: 'warn',
    detail: 'No single arc breaks the whole block, but removing one arc frees at least one record into sequential order and leaves a smaller coupled core.',
  }),
  Object.freeze({
    key: 'multi-arc-only',
    label: 'Requires multi-arc tear (≥2)',
    tone: 'bad',
    detail: 'Alternate directed paths inside the block keep every record mutually reachable after any single-arc removal; settling it requires re-sequencing at least two pairs together.',
  }),
  Object.freeze({
    key: 'tear-bound-exceeded',
    label: 'Tear census refused (bound)',
    tone: 'warn',
    detail: 'The block holds more distinct internal directed pairs than maxTearArcsPerBlock, so counterfactual tear evaluation is refused rather than heuristically sampled.',
  }),
]);

export const DEPENDENCY_CYCLE_TEAR_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'acyclic', label: 'Breaks loop completely', tone: 'good' }),
  Object.freeze({ key: 'reduces-core', label: 'Shrinks coupled core', tone: 'warn' }),
  Object.freeze({ key: 'core-persists', label: 'Full loop persists', tone: 'neutral' }),
]);

export const DEPENDENCY_CYCLE_ARC_SPAN_STATES = Object.freeze([
  'same-holder',
  'cross-holder',
  'unattributed-endpoint',
]);

export const DEPENDENCY_CYCLE_ESCALATION_STATES = Object.freeze([
  Object.freeze({ key: 'unique', label: 'One accountable roster seat', tone: 'good' }),
  Object.freeze({ key: 'leader-held', label: 'Held by workspace leader', tone: 'warn' }),
  Object.freeze({ key: 'ambiguous', label: 'Incomparable minimal ancestors', tone: 'bad' }),
  Object.freeze({ key: 'unattributed', label: 'Line reach incomplete', tone: 'bad' }),
  Object.freeze({ key: 'off-roster', label: 'Holder off active roster', tone: 'bad' }),
]);

export const DEPENDENCY_CYCLE_ASK_STATES = Object.freeze([
  'open',
  'answered',
  'not-issued',
  'not-applicable',
]);

export const DEPENDENCY_CYCLE_METHOD = Object.freeze([
  'Read every stored link in deterministic order up to maxLinks; classify people-attribution edges separately from the five declared precedence relations.',
  'Resolve both endpoints of every precedence edge against canonical non-confidential collections; count unresolved, forbidden, person-endpoint and self-arc edges as named refusals.',
  'Partition the directed precedence graph into exact strongly connected components via iterative two-pass Kosaraju and order the condensation DAG via Kahn topological sort.',
  'Join each node’s named people to buildMatrix active reporting lines; refuse the workspace cross-line claim whenever any node lacks provable line reach or the matrix carries a defect.',
  'Resolve block ownership: single-line loops resolve to their sole accountable line holder; cross-line loops resolve to matrixJointApex (naming all incomparable minimal ancestors on a diamond tie without picking one).',
  'For each coupled feedback block within maxTearArcsPerBlock, run an exact counterfactual SCC pass removing one distinct internal directed pair at a time — reporting whether that removal breaks the block completely, shrinks its core or leaves it intact, without recommending which business commitment to drop.',
  'On the shared post-commit spine (RULE-CYC-01), issue at most one dated sequencing ask per coupled block with a unique active roster seat (single-line manager or joint apex), attach matrix-DAG rolls-up-to provenance, self-close asks when the loop clears or its seat moves, and record identity-free observations for leader-held, ambiguous, unattributed or off-roster blocks.',
]);

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
    label: 'Counterfactual tear sensitivity never auto-tears or picks a winner',
    detail: 'Records inside a feedback block remain unordered until a human changes the stored graph. The tear census tests every distinct internal directed pair by exact SCC recomputation and prints the structural consequence of each, never a heuristic tear order.',
  }),
  Object.freeze({
    label: 'One person, one line set, once',
    detail: 'A work node’s line reach is the union of the active reporting lines of the people its typed people-edges name. Each distinct line id is counted once per block; a person on three lines contributes three lines, not three people.',
  }),
  Object.freeze({
    label: 'Both single-chain and matrix loops reach their true accountable seat',
    detail: 'A single-line feedback block addresses its sole line manager; a cross-line block addresses the unique matrixJointApex of its people or line holders. Two incomparable minimal ancestors, a leader-held root, an off-roster holder or an unattributed node are observed and never substituted.',
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
    label: 'Design Structure Matrix partitioning & tearing (Steward, 1981; Eppinger & Browning, 2012)',
    detail: 'A square dependency matrix is reordered into block-triangular form by identifying strongly connected components; coupled blocks form irreducible squares on the diagonal, and exact single-arc tear sensitivity identifies cardinality-1 feedback arcs without heuristic tie-breaking.',
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
    label: 'Common agency and minimal common ancestors in a matrix DAG (Bernheim & Whinston, 1986; ADR-0140 / ADR-0187)',
    detail: 'Several principals holding one coupled block escalate to their lowest joint apex, while single-line loops stay at the line manager who holds the whole loop. A diamond tie is reported as ambiguous; the system does not pick one of two incomparable managers.',
  }),
]);

/** CSV scope #137. Aggregate and identity-free: no id, name, title, note or date of any RECORD. */
export const DEPENDENCY_CYCLE_CSV_COLUMNS = Object.freeze([
  'row_kind', 'engine', 'generated_on', 'nodes_n', 'arcs_n', 'pairs_n',
  'internal_arcs_n', 'external_arcs_n', 'blocks_n', 'sequential_n', 'feedback_n',
  'cross_line_feedback_n', 'single_line_feedback_n', 'unattributed_feedback_n',
  'joint_apex_n', 'ambiguous_apex_n', 'distinct_lines_n',
  'single_arc_tearable_blocks_n', 'partial_single_tear_blocks_n',
  'multi_arc_only_blocks_n', 'tear_refused_blocks_n',
  'escalation_unique_n', 'asks_open_n', 'asks_answered_n', 'asks_not_issued_n',
  'line_reach_complete', 'counts_reconcile', 'figures_complete', 'cross_line_claim',
  'owner_state', 'block_state', 'block_size', 'block_internal_arcs_n',
  'block_external_in_n', 'block_external_out_n', 'block_distinct_lines_n',
  'tear_state', 'single_arc_breaks_n',
  'upstream_n', 'downstream_n', 'verdict', 'refusal_reason',
]);

export const DEPENDENCY_CYCLE_CSV_DESCRIPTOR = Object.freeze({
  key: DEPENDENCY_CYCLE_CSV_SCOPE,
  label: 'Cross-boundary dependency feedback cycles (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-dependency-cycles',
  description: 'CSV scope #137 (ADR-0183 / ADR-0187, Schema v148 unchanged). One workspace row plus one row per ownership state and one row per coupled feedback block for the DSM partitioning, exact counterfactual single-arc tear sensitivity and RULE-CYC-01 ask status of declared typed dependency arcs: nodes, arcs, distinct pairs, internal/external arcs, sequential and feedback blocks, cross-line, single-line and unattributed feedback blocks, unique and ambiguous joint apexes, tearable/partial/multi-arc/refused block counts, open/answered/unissued ask counts, distinct active reporting lines, and three separate claims (line_reach_complete, counts_reconcile, figures_complete) beside the cross_line_claim. NO person, NO manager, NO line id, NO record id, NO title, NO note, NO relation text and NO record date. A refused claim prints its reason; a refused figure is never a zero.',
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

export function dependencyCycleTearState(key) {
  return DEPENDENCY_CYCLE_TEAR_STATES.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_TEAR_STATES[DEPENDENCY_CYCLE_TEAR_STATES.length - 1];
}

export function dependencyCycleTearOutcome(key) {
  return DEPENDENCY_CYCLE_TEAR_OUTCOMES.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_TEAR_OUTCOMES[DEPENDENCY_CYCLE_TEAR_OUTCOMES.length - 1];
}

export function dependencyCycleEscalationState(key) {
  return DEPENDENCY_CYCLE_ESCALATION_STATES.find((row) => row.key === key)
    || DEPENDENCY_CYCLE_ESCALATION_STATES[3];
}
