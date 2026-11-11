/**
 * app/core/domain/sodRegisterRegistry.js — the closed vocabulary of the
 * Cross-Line Segregation-of-Duties Register (ADR-0170, Schema v135 unchanged,
 * `#/matrix?panel=sod`, CSV scope #125, RULE-SOD-01).
 *
 * Everything the reader, the panel, the brief, the export and the rule may say
 * is declared here once. A class, a route, a refusal or a seat state that is not
 * in this file cannot be printed, so the screen and the export cannot disagree
 * about a word.
 *
 * Pure data: no DOM, no storage, no clock.
 */

export const SOD_ENGINE_VERSION = 'sod-register-2026.11-v1';

/** The one rule on the shared spine, and the one event that makes it run. */
export const SOD_RULE_ID = 'RULE-SOD-01';
export const SOD_REVIEW_EVENT = 'sod.review';

/**
 * The duties the register can read, each from ONE typed field of the record.
 * A duty is never inferred from a job title, a level or a team name.
 */
export const SOD_DUTIES = Object.freeze([
  Object.freeze({
    key: 'initiate',
    label: 'Initiate',
    source: 'The decision’s Driver field (DACI).',
    detail: 'The hand that framed the call and drove it to a decision — decision management in Fama & Jensen’s terms. The record says who drove a call; it does not say who carried it out.',
  }),
  Object.freeze({
    key: 'authorize',
    label: 'Authorize',
    source: 'The decision’s Approver field (DACI).',
    detail: 'The hand that ratified the call — decision control. This is the hand whose independence the register tests.',
  }),
  Object.freeze({
    key: 'custody',
    label: 'Custody',
    source: 'The owner of a case joined to the decision by a typed link.',
    detail: 'The hand that holds the object the decision disposes of. Read from the case as it stands today: the case record keeps no dated ownership history, so custody is always printed as a presumption.',
  }),
]);

/**
 * The conflict classes. Closed: a decision is tested against exactly these
 * three, and each is established from recorded fields and declared lines only.
 */
export const SOD_CLASSES = Object.freeze([
  Object.freeze({
    key: 'same-hand',
    label: 'One hand initiates and authorizes',
    short: 'One hand',
    duties: Object.freeze(['initiate', 'authorize']),
    tone: 'bad',
    rank: 0,
    needsStructure: false,
    detail: 'The Driver and the Approver resolve to the same roster person. Nobody else stood between the proposal and its ratification: the four-eyes principle has one pair of eyes.',
  }),
  Object.freeze({
    key: 'dependent-hand',
    label: 'The authorizing hand is accountable to the initiating hand',
    short: 'Dependent hand',
    duties: Object.freeze(['initiate', 'authorize']),
    tone: 'bad',
    rank: 1,
    needsStructure: true,
    detail: 'On the decision day the Approver reported to the Driver — directly or through a chain of lines. A second hand exists on paper, but its pay, appraisal, leave or priorities are governed by the hand it is supposed to check.',
  }),
  Object.freeze({
    key: 'custody-and-approval',
    label: 'The custodian of the object authorizes the act on it',
    short: 'Custodian authorizes',
    duties: Object.freeze(['custody', 'authorize']),
    tone: 'warn',
    rank: 2,
    needsStructure: false,
    detail: 'The Approver is the recorded owner of a case the decision is typed-linked to. The hand that holds the object also ratified what is done with it. Always a presumption: ownership is read as the case stands today.',
  }),
]);

export const SOD_CLASS_KEYS = Object.freeze(SOD_CLASSES.map((c) => c.key));
const CLASS_BY_KEY = new Map(SOD_CLASSES.map((c) => [c.key, c]));
export function sodClass(key) {
  return CLASS_BY_KEY.get(String(key || '')) || null;
}

/** How a dependent hand reaches the hand it depends on. */
export const SOD_ROUTES = Object.freeze([
  Object.freeze({
    key: 'home-chain',
    label: 'Through the home chain',
    detail: 'The path from the Approver up to the Driver runs over home lines only. A reporting tree shows this dependence.',
  }),
  Object.freeze({
    key: 'second-line',
    label: 'Only through a declared second line',
    detail: 'No path over the home lines of that day exists; the dependence needs at least one declared project, product, cross-functional or administrative line. A check that reads the tree alone passes this decision.',
  }),
]);

const ROUTE_BY_KEY = new Map(SOD_ROUTES.map((r) => [r.key, r]));
export function sodRoute(key) {
  return ROUTE_BY_KEY.get(String(key || '')) || null;
}

/** What a structural reading of a past day rests on. */
export const SOD_BASES = Object.freeze([
  Object.freeze({
    key: 'recorded',
    label: 'Recorded',
    detail: 'Every line the finding rests on is on the record for the decision day: a declared line inside its own dated window, or a home line the structure-history ledger covers.',
  }),
  Object.freeze({
    key: 'presumed',
    label: 'Presumed',
    detail: 'At least one home line the finding rests on has no recorded history at all, so today’s pointer is used and printed as a presumption — or the finding is a custody reading, which is always read from the case as it stands today.',
  }),
]);

const BASIS_BY_KEY = new Map(SOD_BASES.map((b) => [b.key, b]));
export function sodBasis(key) {
  return BASIS_BY_KEY.get(String(key || '')) || null;
}

/**
 * Materiality. The decision record already carries the only field that says
 * whether a single hand is a design choice or a control gap: reversibility.
 */
export const SOD_TIERS = Object.freeze([
  Object.freeze({
    key: 'one-way',
    label: 'One-way door',
    reversibility: 'irreversible',
    tone: 'bad',
    detail: 'The decision is recorded as irreversible. A conflict here is a control gap: the call cannot be walked back, and no independent hand ratified it.',
  }),
  Object.freeze({
    key: 'two-way',
    label: 'Two-way door',
    reversibility: 'reversible',
    tone: 'warn',
    detail: 'The decision is recorded as reversible. A single hand on a call that can be undone is often a deliberate trade of control for speed; it is counted and printed, never hidden and never escalated as a gap.',
  }),
]);

export const SOD_TIER_KEYS = Object.freeze(SOD_TIERS.map((t) => t.key));
const TIER_BY_KEY = new Map(SOD_TIERS.map((t) => [t.key, t]));
export function sodTier(key) {
  return TIER_BY_KEY.get(String(key || '')) || null;
}
export function sodTierFor(reversibility) {
  return reversibility === 'irreversible' ? 'one-way' : 'two-way';
}

/**
 * Why a decided decision cannot be tested at all. Checked in this order; a
 * decision lands in exactly one bucket, so `tested + refused` is an identity.
 */
export const SOD_RECORD_REFUSALS = Object.freeze([
  Object.freeze({
    key: 'no-approver',
    label: 'No authorizing hand recorded',
    detail: 'The Approver field is empty. There is no second hand to test — and no first one either: the record does not say who ratified the call.',
  }),
  Object.freeze({
    key: 'no-driver',
    label: 'No initiating hand recorded',
    detail: 'The Driver field is empty, so the Approver cannot be tested against anyone.',
  }),
  Object.freeze({
    key: 'several-named',
    label: 'A role names more than one person',
    detail: 'The Driver or the Approver field lists several people. The register tests one initiating hand against one authorizing hand and does not guess which of several names held the pen.',
  }),
  Object.freeze({
    key: 'unresolved-hand',
    label: 'A named hand is not one roster person',
    detail: 'The Driver or the Approver is a title, a team, a body, a name that is not on the active roster, or a name two roster people share. A conflict is never inferred from a title.',
  }),
]);

export const SOD_RECORD_REFUSAL_KEYS = Object.freeze(SOD_RECORD_REFUSALS.map((r) => r.key));
const RECORD_REFUSAL_BY_KEY = new Map(SOD_RECORD_REFUSALS.map((r) => [r.key, r]));
export function sodRecordRefusal(key) {
  return RECORD_REFUSAL_BY_KEY.get(String(key || '')) || null;
}

/**
 * Why the structure of the decision day cannot answer the dependence question.
 * Independence is then neither established nor excluded, and is printed so.
 */
export const SOD_STRUCTURE_REFUSALS = Object.freeze([
  Object.freeze({
    key: 'no-decision-day',
    label: 'No decision day on the record',
    detail: 'The decision is recorded as made but carries no decision day (a record from before the day was stamped). The structure of an unknown day cannot be read, and today’s structure is not evidence about it.',
  }),
  Object.freeze({
    key: 'home-line-unrecorded',
    label: 'A home line above the hand is not recorded for that day',
    detail: 'Somewhere above the authorizing hand a person has recorded home-line history that does not cover the decision day. Who they reported to that day was never recorded, so the chain above the hand is open.',
  }),
  Object.freeze({
    key: 'not-placed',
    label: 'A person above the hand cannot be placed on that day',
    detail: 'By the roster’s own dates a person on the path was not on the roster on the decision day, or the matrix engine refused their line on that day. The chain above the hand is open.',
  }),
]);

export const SOD_STRUCTURE_REFUSAL_KEYS = Object.freeze(SOD_STRUCTURE_REFUSALS.map((r) => r.key));
const STRUCTURE_REFUSAL_BY_KEY = new Map(SOD_STRUCTURE_REFUSALS.map((r) => [r.key, r]));
export function sodStructureRefusal(key) {
  return STRUCTURE_REFUSAL_BY_KEY.get(String(key || '')) || null;
}

/** The three states a tested decision can be in. Exactly one applies. */
export const SOD_DECISION_STATES = Object.freeze([
  Object.freeze({
    key: 'conflict',
    label: 'Conflict established',
    tone: 'bad',
    detail: 'At least one conflict class is established from the record.',
  }),
  Object.freeze({
    key: 'unreadable',
    label: 'Independence not readable',
    tone: 'warn',
    detail: 'No class is established, and the structure of the decision day cannot say whether the authorizing hand was independent. Not a pass and not a finding.',
  }),
  Object.freeze({
    key: 'clear',
    label: 'Two independent hands',
    tone: 'good',
    detail: 'Two different roster people, the authorizing hand not accountable to the initiating hand on any line of that day, and no custody conflict on a linked case.',
  }),
]);

const DECISION_STATE_BY_KEY = new Map(SOD_DECISION_STATES.map((s) => [s.key, s]));
export function sodDecisionState(key) {
  return DECISION_STATE_BY_KEY.get(String(key || '')) || null;
}

/**
 * Who could supply the independent second hand: the seat(s) directly above the
 * SENIOR hand of a conflicted decision, on the decision day.
 */
export const SOD_SEAT_STATES = Object.freeze([
  Object.freeze({
    key: 'unique',
    label: 'One seat above the hand',
    tone: 'neutral',
    detail: 'Exactly one manager sat directly above the senior hand that day. That seat can supply the second hand.',
  }),
  Object.freeze({
    key: 'tie',
    label: 'Two or more seats above the hand',
    tone: 'warn',
    detail: 'The senior hand sat on more than one line that day. Each manager is above the hand; the structure does not say which of them supplies the second hand. The lowest seat above all of them is printed where it is unique.',
  }),
  Object.freeze({
    key: 'none',
    label: 'No seat above the hand',
    tone: 'bad',
    detail: 'The senior hand is the workspace leader. No seat inside the reporting structure can supply an independent second hand; it can only come from outside it — a board, an audit committee, a peer executive.',
  }),
  Object.freeze({
    key: 'unreadable',
    label: 'Seat not readable for that day',
    tone: 'warn',
    detail: 'The decision carries no decision day, or the senior hand’s own home line is not recorded for it. No seat is named rather than naming today’s.',
  }),
]);

export const SOD_SEAT_STATE_KEYS = Object.freeze(SOD_SEAT_STATES.map((s) => s.key));
const SEAT_STATE_BY_KEY = new Map(SOD_SEAT_STATES.map((s) => [s.key, s]));
export function sodSeatState(key) {
  return SEAT_STATE_BY_KEY.get(String(key || '')) || null;
}

/** Declared bounds. Every one is printed on the method card. */
export const SOD_BOUNDS = Object.freeze({
  /** Decided decisions read, most recent first. The remainder is counted, never dropped silently. */
  decisions: 400,
  /** Conflict rows carried on the panel before the rest are counted. */
  rows: 40,
  /** Rows of decisions whose independence cannot be read. */
  unreadableRows: 20,
  /** Driver/Approver pairs carried before the rest are counted. */
  pairs: 20,
  /** Span rows carried in the roll-up. */
  spans: 24,
  /** Tested decisions below which a rate is refused. */
  rateFloor: 10,
  titleChars: 90,
  detailChars: 300,
});

export const SOD_CONVENTIONS = Object.freeze([
  Object.freeze({
    label: 'Population',
    value: 'Decided decisions',
    detail: 'A decision is read once it records what was chosen. An open decision has no ratification to test.',
  }),
  Object.freeze({
    label: 'Day the structure is read on',
    value: 'The decision day',
    detail: 'Declared lines are read by their own dated windows on the day the call was made; home lines from the structure-history ledger where it covers that day. Today’s chart is never applied to a past decision silently.',
  }),
  Object.freeze({
    label: 'Materiality',
    value: 'Recorded reversibility',
    detail: 'An irreversible decision is a one-way door and a conflict on it is a control gap. A reversible one is counted and printed, and never escalated.',
  }),
  Object.freeze({
    label: 'Roll-up',
    value: 'Today’s reporting graph, every line',
    detail: 'A conflict is rolled up to every leadership span that holds its senior hand today — through the home line and through every declared second line. Span rows are therefore not additive; the distinct total is printed beside them.',
  }),
  Object.freeze({
    label: 'Rate floor',
    value: `${SOD_BOUNDS.rateFloor} tested decisions`,
    detail: 'A share of fewer tested decisions is arithmetic, not a reading. It is refused, and it is also refused while any tested decision is unreadable.',
  }),
]);

/** Aggregate-only export. No person, no name, no decision id, no title, no date of any decision. */
export const SOD_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'class',
  'read_on',
  'seat_scope',
  'decided_n',
  'read_n',
  'omitted_n',
  'outside_seat_n',
  'in_seat_n',
  'tested_n',
  'refused_n',
  'refused_no_approver_n',
  'refused_no_driver_n',
  'refused_several_named_n',
  'refused_unresolved_hand_n',
  'conflict_decisions_n',
  'conflict_one_way_n',
  'conflict_two_way_n',
  'unreadable_decisions_n',
  'clear_decisions_n',
  'findings_n',
  'findings_one_way_n',
  'findings_two_way_n',
  'home_chain_n',
  'second_line_n',
  'presumed_basis_n',
  'stewardship_n',
  'seat_unique_n',
  'seat_tie_n',
  'seat_none_n',
  'seat_unreadable_n',
  'conflict_permille',
  'conflict_permille_withheld',
  'one_way_conflict_permille',
  'one_way_permille_withheld',
  'counts_reconcile',
]);

/** The named methods. The panel prints these; it does not paraphrase them. */
export const SOD_METHOD = Object.freeze([
  Object.freeze({
    name: 'Segregation of duties (COSO Internal Control — Integrated Framework, 2013, Principle 10)',
    why: 'No one person should be able to both carry an act forward and ratify it. Where segregation is not practical, management selects an alternative control — which is why the register prints the seat that could supply the second hand instead of blocking the decision.',
  }),
  Object.freeze({
    name: 'Decision management and decision control (Fama & Jensen, 1983)',
    why: 'A decision has four steps: initiation, ratification, implementation and monitoring. The agent who initiates must not be the agent who ratifies. The decision log already names both hands as Driver and Approver; the register reads those two fields against each other.',
  }),
  Object.freeze({
    name: 'Four-eyes principle and reviewer independence',
    why: 'A second signature only counts when the second signer does not depend on the first. An Approver who reports to the Driver — on any line — is a second pair of eyes attached to the first head.',
  }),
  Object.freeze({
    name: 'The reporting graph, not the reporting tree (ADR-0140)',
    why: 'In a matrix a person is accountable through several lines. Dependence is therefore tested over every line in force on the decision day, and a dependence that exists only through a declared second line is named as such: the tree cannot see it.',
  }),
  Object.freeze({
    name: 'RAPID decision rights (Rogers & Blenko, 2006)',
    why: 'Where the Driver holds a direct line over the Approver, the rights that line declares — appraisal, pay, leave, priority, assignment, technical direction — are printed. That is what the dependence consists of, in the workspace’s own declared terms.',
  }),
  Object.freeze({
    name: 'One-way and two-way doors (decision reversibility)',
    why: 'A reversible call made by one hand is a trade of control for speed. An irreversible one is a control gap. The register uses the reversibility the decision itself records and invents no other materiality score.',
  }),
  Object.freeze({
    name: 'As-of structure and refusal instead of imputation (ADR-0149)',
    why: 'A past decision is judged against the structure of its own day. Where the record does not cover that day the dependence question is refused, and where no history exists at all today’s pointer is used and printed as a presumption — never passed off as an observation.',
  }),
]);

export const SOD_LIMITS_TEXT = Object.freeze([
  'Only the Driver and Approver fields of a decided decision are read, exactly as typed. A name is matched to the active roster case-insensitively and in full; a title, a team or a body is never resolved to a person.',
  'The Driver is the hand that drove the call. The record does not say who carried it out, so this is an initiate-and-authorize reading, not proof of who executed anything.',
  'A role that lists several people is refused, not split. Whether one of several approvers was independent is not guessed.',
  'Custody is read from the case as it stands today. A case re-assigned after the decision is read against its present owner, which is why every custody finding is printed as a presumption.',
  'Decisions opened by an automation rule carry the roles that rule pre-filled, usually the workspace leader. The register reads the record as it stands; editing the roles on the decision is how a different pair of hands is stated.',
  'Declared personal or financial interests, recusals and two approvals collapsed into one hand are not read here: the workspace stores no interest declaration and no approval chain. A compensating control is not yet recorded against a conflict.',
  'This is a reading, not an access control. Nothing is blocked, no right is revoked, no decision is reopened and nobody is rated. Recording a review writes one identity-free line to the automation ledger; its own rule writes nothing else, and the workspace’s other standing rules run on that save as they would on any other.',
]);
