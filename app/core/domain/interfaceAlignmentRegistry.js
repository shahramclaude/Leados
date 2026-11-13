/**
 * app/core/domain/interfaceAlignmentRegistry.js — the closed vocabulary of the
 * Product–Organisation Interface Alignment Matrix (ADR-0189, Session 257,
 * Schema v149 unchanged, `#/matrix?panel=alignment`, CSV scope #142).
 *
 * Nothing in this module is inferred. The precedence lexicon and node
 * vocabulary are imported from the ONE typed-graph registry the dependency
 * register already prints (`dependencyCycleRegistry.js`) — two registers that
 * disagree about what a precedence edge is would be two opinions about the
 * same stored fact. The channel states, pair verdicts, failure-mode groups,
 * refusals, frameworks, CSV columns and bounds are DECLARED here so a reader
 * can argue with them. The read model in `interfaceAlignment.js` prints this
 * file; it never paraphrases it.
 *
 * THE TWO FAILURE MODES (Sosa, Eppinger & Rowles, 2004)
 * -----------------------------------------------------
 *  1. UNATTENDED TECHNICAL INTERFACE — work records depend across two spans
 *     whose holders have neither an active interface agreement nor a shared
 *     cadence forum. Reported in two separately printed states: `unattended`
 *     (nothing declared at all) and `channel-not-live` (a channel is declared
 *     but is dark — one-sided, contested, expired, future-dated or its forum
 *     is gone). The two are never collapsed into one word.
 *  2. IDLE COORDINATION CHANNEL — an ACTIVE interface agreement whose two
 *     spans carry zero live shared people and zero cross-span work
 *     dependencies inside the declared window. Scoped to AGREEMENTS per the
 *     register's declared definition; a shared forum with no dependency and no
 *     shared people is printed as `forum-without-interface`, a counted context
 *     row, never claimed as the second failure mode.
 *
 * An endpoint whose holder set is not exactly ONE accountable manager is
 * REFUSED (`unattributed-endpoint`), never charged to a home line and never
 * split by an invented allocation.
 */

import {
  DEPENDENCY_CYCLE_EXCLUDED_RELATIONS,
  DEPENDENCY_CYCLE_NODE_TYPES,
  DEPENDENCY_CYCLE_PEOPLE_RELATIONS,
  DEPENDENCY_CYCLE_RELATIONS,
} from './dependencyCycleRegistry.js';

export const INTERFACE_ALIGNMENT_ENGINE_VERSION = 'interface-alignment-2026.11-v1';
export const INTERFACE_ALIGNMENT_ADR = 'ADR-0189';
export const INTERFACE_ALIGNMENT_RULE_ID = 'RULE-OIA-01';
export const INTERFACE_ALIGNMENT_RIGHT = 'govern-interface-alignment';
export const INTERFACE_ALIGNMENT_PANEL = 'alignment';
export const INTERFACE_ALIGNMENT_CSV_SCOPE = 'matrix-interface-alignment';

export const INTERFACE_ALIGNMENT_EVENTS = Object.freeze({
  SCAN: 'matrix.alignment.scan',
  CONVENTIONS: 'matrix.alignment.conventions.set',
});

export const INTERFACE_ALIGNMENT_DEFAULTS = Object.freeze({
  windowDays: 180,
  askDueDays: 7,
  autoPropagate: true,
});

export const INTERFACE_ALIGNMENT_BOUNDS = Object.freeze({
  windowDays: Object.freeze([30, 730]),
  askDueDays: Object.freeze([1, 30]),
});

export const INTERFACE_ALIGNMENT_SETTING_KEYS = Object.freeze({
  windowDays: 'interfaceAlignmentWindowDays',
  askDueDays: 'interfaceAlignmentAskDueDays',
  autoPropagate: 'interfaceAlignmentAutoPropagate',
});

export const INTERFACE_ALIGNMENT_SETTING_LABELS = Object.freeze({
  windowDays: 'Alignment dependency window (days)',
  askDueDays: 'Alignment finding ask due window (days)',
  autoPropagate: 'Automatic alignment escalation (RULE-OIA-01)',
});

/* ------------------------------------------- the ONE typed-graph vocabulary */

/** Work-node vocabulary: canonical non-confidential entities, never people. */
export const INTERFACE_ALIGNMENT_NODE_TYPES = DEPENDENCY_CYCLE_NODE_TYPES;

/** Typed edges that attribute a work node to a person (and so to their lines). */
export const INTERFACE_ALIGNMENT_PEOPLE_RELATIONS = DEPENDENCY_CYCLE_PEOPLE_RELATIONS;

/**
 * The precedence lexicon, directions included. A technical interface is an
 * ordered claim (upstream → downstream); the direction comes from the SAME
 * declaration the DSM partitioning uses, never a guess here.
 */
export const INTERFACE_ALIGNMENT_RELATIONS = DEPENDENCY_CYCLE_RELATIONS;

export const INTERFACE_ALIGNMENT_RELATION_KEYS = Object.freeze(
  INTERFACE_ALIGNMENT_RELATIONS.map((row) => row.relation),
);

/** Couplings explicitly refused as precedence, with the reason printed. */
export const INTERFACE_ALIGNMENT_EXCLUDED_RELATIONS = DEPENDENCY_CYCLE_EXCLUDED_RELATIONS;

/* --------------------------------------------------------- channel states */

/**
 * What coordination channel exists between the two holders of a pair, derived
 * from the append-only bilateral acts (ADR-0162) and live cadence forums.
 * `live` marks the channel states that count as ATTENDED; every other state is
 * a declared-but-dark or absent channel and is printed as such.
 */
export const INTERFACE_ALIGNMENT_CHANNEL_STATES = Object.freeze([
  Object.freeze({
    key: 'live-agreement', label: 'Active bilateral agreement', tone: 'good', live: true,
    detail: 'Both counterparts hold matched live terms in force on the reading day (ADR-0162 semantics).',
  }),
  Object.freeze({
    key: 'shared-forum', label: 'Shared active cadence forum', tone: 'good', live: true,
    detail: 'No live agreement, but both holders attend the same active cadence forum.',
  }),
  Object.freeze({
    key: 'contested-terms', label: 'Terms diverge', tone: 'warn', live: false,
    detail: 'Both counterparts signed live acts whose terms disagree; there is no one agreement in force.',
  }),
  Object.freeze({
    key: 'one-sided', label: 'One side only', tone: 'warn', live: false,
    detail: 'One counterpart signed terms and the other never answered; silence is not agreement.',
  }),
  Object.freeze({
    key: 'expired-agreement', label: 'Agreement lapsed', tone: 'warn', live: false,
    detail: 'Matched terms exist but the review deadline passed; an expired channel is not a live one.',
  }),
  Object.freeze({
    key: 'forum-unavailable', label: 'Agreed venue is gone', tone: 'warn', live: false,
    detail: 'Matched terms are in force but name a cadence forum that is missing or retired; the agreed venue cannot carry the conversation.',
  }),
  Object.freeze({
    key: 'future-agreement', label: 'Terms not yet in force', tone: 'warn', live: false,
    detail: 'Matched terms start after the reading day; the channel is agreed but not yet open.',
  }),
  Object.freeze({
    key: 'none', label: 'No channel declared', tone: 'bad', live: false,
    detail: 'Neither an interface agreement nor a shared active cadence forum connects the two holders.',
  }),
]);

/* ---------------------------------------------------------- pair verdicts */

/**
 * The alignment-matrix cell states. `failureMode` groups the states into the
 * two Sosa failure modes; states in the same group stay SEPARATE rows and
 * separate counts — the group exists so the board can print the two-mode
 * headline, never to collapse distinct claims into one word.
 */
export const INTERFACE_ALIGNMENT_PAIR_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'unattended-interface',
    label: 'Unattended technical interface',
    tone: 'bad',
    rank: 0,
    failureMode: 'interface-unattended',
    detail: 'Declared work depends across the two spans and NO coordination channel — agreement or shared forum — has ever been recorded between their holders.',
  }),
  Object.freeze({
    key: 'channel-not-live',
    label: 'Interface carries a dark channel',
    tone: 'bad',
    rank: 1,
    failureMode: 'interface-unattended',
    detail: 'Declared work depends across the two spans and a channel is DECLARED but is not live (one-sided, contested, lapsed, not yet in force, or its forum is gone).',
  }),
  Object.freeze({
    key: 'idle-channel',
    label: 'Idle coordination channel',
    tone: 'warn',
    rank: 2,
    failureMode: 'agreement-idle',
    detail: 'An ACTIVE interface agreement sits between two spans that carry zero live shared people and zero cross-span work dependency inside the declared window.',
  }),
  Object.freeze({
    key: 'forum-without-interface',
    label: 'Shared forum with no interface',
    tone: 'neutral',
    rank: 3,
    failureMode: null,
    detail: 'The only channel is a shared cadence forum and neither a shared person nor a cross-span dependency stands behind it. Printed as context; the register’s second failure-mode claim is scoped to agreements.',
  }),
  Object.freeze({
    key: 'channel-without-interface',
    label: 'Dark channel with nothing behind it',
    tone: 'neutral',
    rank: 4,
    failureMode: null,
    detail: 'A channel is declared but dark (one-sided, contested, lapsed, future-dated or venue gone) and nothing stands behind it — no dependency and no shared person. Printed as context; the idle claim is scoped to ACTIVE agreements.',
  }),
  Object.freeze({
    key: 'standing',
    label: 'Channel carries shared contributors',
    tone: 'good',
    rank: 5,
    failureMode: null,
    detail: 'A live channel exists and the two spans share at least one live contributor, and no cross-span dependency needs riding it (a dependency on a live channel reads as attended) — the standing coordination a shared person requires.',
  }),
  Object.freeze({
    key: 'attended',
    label: 'Dependencies attended by a live channel',
    tone: 'good',
    rank: 6,
    failureMode: null,
    detail: 'Every declared cross-span dependency between these holders rides a live channel.',
  }),
]);

/** The arc classes of the technical-interface census. */
export const INTERFACE_ALIGNMENT_ARC_STATES = Object.freeze([
  Object.freeze({ key: 'cross-holder', label: 'Cross-holder technical interface', tone: 'warn' }),
  Object.freeze({ key: 'same-holder', label: 'Inside one holder', tone: 'neutral' }),
  Object.freeze({ key: 'unattributed-endpoint', label: 'Holder refused (not exactly one manager)', tone: 'bad' }),
]);

/* --------------------------------------------------- escalation / ownership */

export const INTERFACE_ALIGNMENT_ESCALATION_STATES = Object.freeze([
  Object.freeze({ key: 'unique', label: 'One accountable roster seat', tone: 'good' }),
  Object.freeze({ key: 'leader-held', label: 'Held by workspace leader', tone: 'warn' }),
  Object.freeze({ key: 'ambiguous', label: 'Incomparable minimal ancestors', tone: 'bad' }),
  Object.freeze({ key: 'unattributed', label: 'Pair reach incomplete', tone: 'bad' }),
  Object.freeze({ key: 'off-roster', label: 'Holder off active roster', tone: 'bad' }),
  Object.freeze({ key: 'not-applicable', label: 'No finding on this pair', tone: 'neutral' }),
]);

export const INTERFACE_ALIGNMENT_ASK_STATES = Object.freeze([
  'open',
  'answered',
  'not-issued',
  'not-applicable',
]);

/** The two finding kinds a rule ask (or marker) is keyed by. */
export const INTERFACE_ALIGNMENT_FINDINGS = Object.freeze([
  Object.freeze({
    key: 'interface-unattended',
    label: 'Cross-span dependency with no live channel',
    failureMode: 'interface-unattended',
  }),
  Object.freeze({
    key: 'agreement-idle',
    label: 'Active agreement with no shared person and no in-window dependency',
    failureMode: 'agreement-idle',
  }),
]);

/* ---------------------------------------------------------- workspace claim */

export const INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'unattended-interfaces',
    label: 'Unattended technical interfaces found',
    tone: 'bad',
    rank: 0,
  }),
  Object.freeze({
    key: 'idle-channels',
    label: 'Idle coordination channels found',
    tone: 'bad',
    rank: 1,
  }),
  Object.freeze({
    key: 'aligned',
    label: 'Every declared interface is attended',
    tone: 'good',
    rank: 2,
  }),
  Object.freeze({
    key: 'no-cross-holder-interfaces',
    label: 'No cross-holder dependency declared',
    tone: 'neutral',
    rank: 3,
  }),
]);

/* ---------------------------------------------------------------- refusals */

/** Every refusal is closed, counted and printed. None is a silent drop. */
export const INTERFACE_ALIGNMENT_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unresolved-endpoint', label: 'An edge names a record the workspace no longer holds' }),
  Object.freeze({ key: 'forbidden-type', label: 'A confidential or anonymous entity cannot enter the matrix' }),
  Object.freeze({ key: 'outside-node-vocabulary', label: 'An endpoint is not a declared work-node type' }),
  Object.freeze({ key: 'person-node', label: 'A person is attribution, never a dependency node' }),
  Object.freeze({ key: 'unknown-relation', label: 'The relation is not a declared precedence relation' }),
  Object.freeze({ key: 'self-arc', label: 'A record names itself as its own prerequisite — not an interface' }),
  Object.freeze({ key: 'duplicate-arc', label: 'A duplicate of an already-read precedence claim' }),
  Object.freeze({ key: 'untraced-person', label: 'A named person is not on the active roster' }),
  Object.freeze({ key: 'no-active-line', label: 'A named person has no active reporting line' }),
  Object.freeze({ key: 'outside-seat', label: 'The named person is outside this seat’s visible population' }),
  Object.freeze({ key: 'matrix-defect', label: 'The declared reporting graph has a load-time defect' }),
  Object.freeze({ key: 'unattributed-endpoint', label: 'An endpoint does not resolve to exactly one accountable manager — refused, never charged to a home line' }),
  Object.freeze({ key: 'undated-link', label: 'A precedence link carries no readable date and cannot be windowed' }),
  Object.freeze({ key: 'limit-exceeded', label: 'The graph exceeds the declared processing bound' }),
]);

export const INTERFACE_ALIGNMENT_LIMITS = Object.freeze({
  maxLinks: 20000,
  maxNodes: 4000,
  maxArcs: 12000,
  maxPrintedPairs: 80,
  maxPrintedInterfaces: 40,
  asksPerCommit: 6,
  markers: 400,
});

export const INTERFACE_ALIGNMENT_METHOD = Object.freeze([
  'Read every stored typed link in deterministic order up to maxLinks; classify people-attribution edges separately from the five declared precedence relations (the SAME lexicon, with the SAME directions, the DSM partitioning prints).',
  'Resolve both endpoints of every precedence edge against canonical non-confidential collections; count unresolved, forbidden, person-endpoint, self-arc and duplicate edges as named refusals.',
  'Join each node’s named people to buildMatrix active reporting lines. An arc counts as a CROSS-HOLDER technical interface only when each endpoint resolves to exactly ONE accountable manager and the two differ; the same manager on both ends is a same-holder arc; every other shape (multi-manager, untraceable, defective) is `unattributed-endpoint` and refuses the census-completeness claim — it is never charged to a home line and never split by an invented allocation.',
  'Derive each pair’s coordination channel from the append-only bilateral acts (ADR-0162) and live cadence forums: matched live terms in force read `live-agreement`; shared active forum attendance reads `shared-forum`; one-sided, diverged, lapsed or future-dated terms are printed as their own dark states; nothing declared reads `none`.',
  'Classify each pair: dependencies with no channel are `unattended-interface`, dependencies behind a dark channel are `channel-not-live`, an ACTIVE agreement with zero live shared people and zero in-window dependencies is `idle-channel`, a live channel carrying shared contributors is `standing`, and attended dependencies read `attended`.',
  'Roll every pair up to its matrixJointApex (naming all incomparable minimal ancestors on a diamond tie without picking one) and aggregate the two failure-mode counts per apex, so the seat above both spans can read its own exposure.',
  'On the shared post-commit spine (RULE-OIA-01), issue at most one dated ask per pair finding with a unique active roster seat — “open or renew a coordination channel, or record why the dependency stands without one”, or “retire the idle agreement or record what it stands ready for” — attach matrix-DAG rolls-up-to provenance, self-close asks when the finding clears or its seat moves, and record identity-free observations for leader-held, ambiguous, unattributed or off-roster findings.',
]);

export const INTERFACE_ALIGNMENT_CONVENTIONS = Object.freeze([
  Object.freeze({
    label: 'A dependency is a declared typed edge, never a resemblance',
    detail: 'Only the five relations in the printed lexicon create an interface. No title similarity, co-occurrence, inferred weight or ML heuristic ever creates one. Every other relation is counted as excluded with its reason.',
  }),
  Object.freeze({
    label: 'A holder is exactly one accountable manager, or the arc is refused',
    detail: 'An endpoint whose person carries two active reporting lines has TWO accountable managers; which of them owns the dependency is a decision no human made, so the arc reads `unattributed-endpoint` and refuses the completeness claim rather than charging a home line or splitting an invented share.',
  }),
  Object.freeze({
    label: 'Silence is never a channel',
    detail: 'A one-sided, contested, lapsed or future-dated agreement is printed as its own dark state and never counts as attended. A channel is live only when bilateral matched terms are in force or both holders attend the same active forum.',
  }),
  Object.freeze({
    label: 'The idle claim is scoped to ACTIVE AGREEMENTS and the declared window',
    detail: 'Idle means: an agreement in force whose two spans carry zero live shared people and zero cross-span dependency inside interfaceAlignmentWindowDays. Dependencies older than the window are printed beside the finding, never hidden and never counted as in-window. A shared forum with no dependency is `forum-without-interface`, a context row, not the second failure mode.',
  }),
  Object.freeze({
    label: 'Two claims stay apart',
    detail: '“The counts add up” (countsReconcile) and “every printed figure is the computed figure” (figuresComplete) are separate claims, and the census-completeness claim (interfacesClaim) is a third: a reader that reconciles may still refuse completeness because an endpoint was unattributable.',
  }),
  Object.freeze({
    label: 'Refusal instead of imputation',
    detail: 'An untraceable person, a defective graph, an out-of-seat person or a multi-manager endpoint refuses its cell and names the reason. No figure is invented to fill the matrix, and a refused figure is never a zero.',
  }),
  Object.freeze({
    label: 'This register never scores a manager',
    detail: 'Every row is a structural fact about where declared work meets (or fails to meet) a declared channel. No finding is a rating of either holder, no finding blames a person, and the rule asks about the RECORD — the channel or the dependency — never about anyone’s competence.',
  }),
]);

export const INTERFACE_ALIGNMENT_FRAMEWORKS = Object.freeze([
  Object.freeze({
    label: 'Product architecture × organisation alignment (Sosa, Eppinger & Rowles, 2004)',
    detail: 'The alignment matrix maps technical dependencies among design elements onto communication/coordination dependencies among the organisation units that own them. Misalignment appears in two canonical forms: technical interfaces left UNATTENDED by any organizational link, and organizational coordination channels left IDLE with no technical work behind them.',
  }),
  Object.freeze({
    label: 'Design Structure Matrix partitioning (Steward, 1981; Eppinger & Browning, 2012)',
    detail: 'The technical-interface census runs over the same directed precedence graph the DSM partitioning reads, so “which work depends on which” is one stored fact with one lexicon, not two analyses with two opinions.',
  }),
  Object.freeze({
    label: 'Information-processing view of organisation design (Galbraith, 1973/1974; Thompson, 1967)',
    detail: 'Reciprocal interdependence between two spans creates information-processing demand that the organisation must carry through a lateral relation — an agreement, a forum, a liaison role. A dependency with no such channel is an information-processing gap; a channel with no dependency is capacity spent on nothing the work requires.',
  }),
  Object.freeze({
    label: 'Common agency and minimal common ancestors in a matrix DAG (Bernheim & Whinston, 1986; ADR-0140 / ADR-0187)',
    detail: 'A cross-holder finding escalates to the lowest joint apex of the two holders; a diamond tie is reported as ambiguous and the system does not pick one of two incomparable managers.',
  }),
]);

/* --------------------------------------------------------------- CSV #142 */

/** Aggregate and identity-free: no id, name, title, note or date of any record. */
export const INTERFACE_ALIGNMENT_CSV_COLUMNS = Object.freeze([
  'row_kind', 'engine', 'generated_on', 'window_days', 'nodes_n', 'precedence_arcs_n',
  'cross_holder_arcs_n', 'cross_holder_in_window_n', 'cross_holder_out_of_window_n',
  'same_holder_arcs_n', 'unattributed_arcs_n', 'pair_rows_n',
  'unattended_pairs_n', 'dark_channel_pairs_n', 'idle_agreement_pairs_n',
  'attended_pairs_n', 'standing_pairs_n', 'forum_only_pairs_n',
  'shared_people_only_pairs_n', 'live_agreements_n', 'partial_agreements_n',
  'shared_active_forums_n', 'failure_mode_interfaces_n', 'failure_mode_idle_n',
  'rollup_apex_n', 'ambiguous_apex_n', 'escalation_unique_n',
  'asks_open_n', 'asks_answered_n', 'asks_not_issued_n',
  'counts_reconcile', 'figures_complete', 'interfaces_claim', 'claim_reason',
  'verdict', 'state_key', 'state_count', 'refusal_key', 'refusal_count', 'refusal_reason',
]);

export const INTERFACE_ALIGNMENT_CSV_DESCRIPTOR = Object.freeze({
  key: INTERFACE_ALIGNMENT_CSV_SCOPE,
  label: 'Product–organisation interface alignment (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-interface-alignment',
  description: 'CSV scope #142 (ADR-0189, Schema v149 unchanged). One workspace row plus one row per pair verdict, one row per channel state and one row per refusal, for the Sosa/Eppinger/Rowles alignment matrix over declared typed dependency arcs and recorded coordination channels: cross-holder versus same-holder versus unattributed arcs, in-window and out-of-window interface counts, unattended and dark-channel pair counts, idle active agreements, attended and standing pairs, shared forums, live and partial agreements, the two failure-mode totals, joint-apex roll-ups and ask status, beside three SEPARATE claims (counts_reconcile, figures_complete, interfaces_claim). NO person, NO manager, NO pair key, NO line id, NO record id, NO title, NO note and NO record date. A refused claim prints its reason; a refused figure is never a zero.',
});

/* --------------------------------------------------------------- lookups */

export function interfaceAlignmentChannelState(key) {
  return INTERFACE_ALIGNMENT_CHANNEL_STATES.find((row) => row.key === key)
    || INTERFACE_ALIGNMENT_CHANNEL_STATES[INTERFACE_ALIGNMENT_CHANNEL_STATES.length - 1];
}

export function interfaceAlignmentPairVerdict(key) {
  return INTERFACE_ALIGNMENT_PAIR_VERDICTS.find((row) => row.key === key)
    || INTERFACE_ALIGNMENT_PAIR_VERDICTS[0];
}

export function interfaceAlignmentArcState(key) {
  return INTERFACE_ALIGNMENT_ARC_STATES.find((row) => row.key === key)
    || INTERFACE_ALIGNMENT_ARC_STATES[INTERFACE_ALIGNMENT_ARC_STATES.length - 1];
}

export function interfaceAlignmentEscalationState(key) {
  return INTERFACE_ALIGNMENT_ESCALATION_STATES.find((row) => row.key === key)
    || INTERFACE_ALIGNMENT_ESCALATION_STATES[3];
}

export function interfaceAlignmentWorkspaceVerdict(key) {
  return INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS.find((row) => row.key === key)
    || INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS[INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS.length - 1];
}

export function interfaceAlignmentFinding(key) {
  return INTERFACE_ALIGNMENT_FINDINGS.find((row) => row.key === key) || null;
}
