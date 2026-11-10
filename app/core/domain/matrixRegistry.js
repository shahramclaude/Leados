/**
 * app/core/domain/matrixRegistry.js — the declared vocabulary of the Matrix
 * Accountability Ledger (ADR-0140, Schema v119).
 *
 * LeadOS modelled an organisation as a TREE: `person.managerId` is a single
 * pointer, and every roll-up — ownership by lowest common ancestor, span of
 * control, the seat's disclosure ladder, the automation fan-out — is a property
 * of that tree. A tree cannot express the structure most real organisations
 * above a few hundred people actually run: a person with a functional manager
 * AND a project manager AND a product lead at the same time.
 *
 * This registry declares the vocabulary the matrix needs. Nothing here is
 * derived; every reader imports the same constants so a panel, a CSV column and
 * a rule cannot disagree about what a word means.
 */

/**
 * Line kinds. `functional` is the HOME line — the one `person.managerId` already
 * records, which owns the person's craft, their pay and their career. Every
 * other kind is an ADDITIONAL line declared on top of it.
 */
export const MATRIX_LINE_KINDS = Object.freeze([
  Object.freeze({ key: 'functional', label: 'Functional', role: 'primary', hint: 'The home line: craft, career and pay. Already recorded as person.managerId.' }),
  Object.freeze({ key: 'project', label: 'Project', role: 'secondary', hint: 'Accountable for delivery of a dated piece of work.' }),
  Object.freeze({ key: 'product', label: 'Product', role: 'secondary', hint: 'Accountable for what gets built and in what order.' }),
  Object.freeze({ key: 'cross-functional', label: 'Cross-functional', role: 'secondary', hint: 'Accountable for a capability that cuts several units.' }),
  Object.freeze({ key: 'administrative', label: 'Administrative', role: 'secondary', hint: 'Accountable for time, expenses and leave approval only.' }),
]);

export const MATRIX_LINE_KIND_KEYS = Object.freeze(MATRIX_LINE_KINDS.map((k) => k.key));
export const MATRIX_PRIMARY_KIND = 'functional';
export const MATRIX_SECONDARY_KIND_KEYS = Object.freeze(
  MATRIX_LINE_KINDS.filter((k) => k.role === 'secondary').map((k) => k.key),
);
const KIND_BY_KEY = new Map(MATRIX_LINE_KINDS.map((k) => [k.key, k]));
export function matrixLineKind(key) {
  return KIND_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * The six decision rights that a matrix splits across managers. Named after the
 * decision-rights literature rather than invented: RAPID (Rogers & Blenko,
 * *Harvard Business Review*, 2006) and RACI both exist because in a matrix the
 * question is never "who is my manager" but "who decides THIS".
 */
export const MATRIX_RIGHTS = Object.freeze([
  Object.freeze({ key: 'priority', label: 'Priority', question: 'What does this person work on first?' }),
  Object.freeze({ key: 'assignment', label: 'Assignment', question: 'Who hands them a task?' }),
  Object.freeze({ key: 'technical', label: 'Technical direction', question: 'How is the work done?' }),
  Object.freeze({ key: 'performance', label: 'Performance assessment', question: 'Who writes the assessment?' }),
  Object.freeze({ key: 'pay', label: 'Pay', question: 'Who sets compensation?' }),
  Object.freeze({ key: 'absence', label: 'Absence approval', question: 'Who approves leave?' }),
]);

export const MATRIX_RIGHT_KEYS = Object.freeze(MATRIX_RIGHTS.map((r) => r.key));

/**
 * The three rights the home line is PRESUMED to hold.
 *
 * This is a declared convention, not a finding about any particular person: in
 * every matrix organisation that functions, pay, performance assessment and
 * absence approval sit with the functional manager unless they are explicitly
 * moved. Forcing a leader to re-declare those three on every single dual-line
 * person would guarantee the register is never filled in, and an empty register
 * is worse than a declared presumption. The presumption is printed as such on
 * every row it affects, and it is outvoted the moment any line declares one of
 * these rights — a contested right is then reported as contested, which is the
 * truth about that decision.
 */
export const MATRIX_HOME_RIGHTS_DEFAULT = Object.freeze(['performance', 'pay', 'absence']);

/**
 * Operational rights decide what a person works on day to day (`priority`,
 * `assignment`, `technical`). When two managers both claim one, the conflict
 * climbs out of both spans to their joint apex in the reporting DAG.
 * Stewardship rights (`performance`, `pay`, `absence`) govern the employment
 * relationship and belong to the home line unless explicitly split.
 */
export const MATRIX_OPERATIONAL_RIGHTS = Object.freeze(['priority', 'assignment', 'technical']);
export const MATRIX_STEWARDSHIP_RIGHTS = Object.freeze(['performance', 'pay', 'absence']);

const RIGHT_BY_KEY = new Map(MATRIX_RIGHTS.map((r) => [r.key, r]));
export function matrixRight(key) {
  return RIGHT_BY_KEY.get(String(key || '').trim()) || null;
}

export const MATRIX_ENGINE_VERSION = 'matrix-accountability-2026.11-v1';

export const MATRIX_LIMITS = Object.freeze({
  /** Additional (non-primary) lines one person may hold at once. */
  linesPerPerson: 6,
  /** Rows the bounded review queue carries. The remainder is counted, never dropped. */
  queue: 24,
  /** Manager rows carried in the span table before the rest are counted. */
  managers: 12,
  /** Person rows carried in the reconciliation table. */
  people: 40,
  noteChars: 400,
  reasonChars: 300,
  /** Append-only marker ledger bound. */
  markers: 400,
  /** Allocation changes kept on the row they replaced. */
  history: 5,
  /** Roll-up edges RULE-MTX-01 may write in ONE transaction. */
  fanoutEdges: 120,
});

export const MATRIX_FLOORS = Object.freeze({
  /**
   * Share tolerance, in integer hundredths. A person whose declared shares sum
   * to 1.00 ± 0.05 is treated as balanced; outside that band the deviation is
   * reported, never rounded away. Five hundredths is a DECLARED convention —
   * it is the slack a leader needs to split a week, not a measured optimum.
   */
  balanceHundredths: 5,
  /**
   * Above this seat rank a manager row is disclosed as a count and a band, not
   * as a named person with a named allocation: an allocation is item detail.
   */
  detailRank: 4,
  /** A named manager row needs at least this many attributed people to print. */
  cellN: 3,
});

export const MATRIX_BOUNDS = Object.freeze({
  balanceHundredths: Object.freeze({ min: 0, max: 25, step: 1 }),
  expiringDays: Object.freeze({ min: 1, max: 180, step: 1 }),
});

export const MATRIX_DEFAULTS = Object.freeze({
  balanceHundredths: 5,
  expiringDays: 14,
});

/**
 * Share state per person. This is the load-bearing distinction of the whole
 * module: an UNDECLARED allocation is not a zero allocation. A zero would let
 * the roll-up add up to a tidy total; an undeclared share makes the total
 * refuse to close, which is the truth.
 */
export const MATRIX_SHARE_STATES = Object.freeze({
  balanced: 'balanced',
  over: 'over-committed',
  under: 'under-allocated',
  undeclared: 'undeclared',
});

export const MATRIX_SHARE_STATE_LABELS = Object.freeze({
  balanced: 'Balanced',
  over: 'Over-committed',
  under: 'Under-allocated',
  undeclared: 'Undeclared',
});

/** Right-ownership state, worst first. */
export const MATRIX_RIGHT_STATES = Object.freeze({
  contested: 'contested',
  unowned: 'unowned',
  held: 'held',
});

export const MATRIX_RIGHT_STATE_LABELS = Object.freeze({
  contested: 'Contested',
  unowned: 'Unowned',
  held: 'Held by one',
});

/** Finding codes for the bounded review queue, dispatched worst first. */
export const MATRIX_FINDINGS = Object.freeze([
  { key: 'over-committed', label: 'Declared allocations exceed the person' },
  { key: 'contested-right', label: 'Two or more managers hold the same decision right' },
  { key: 'unowned-right', label: 'A decision right nobody holds' },
  { key: 'undeclared-share', label: 'An active line carries no declared allocation' },
  { key: 'under-allocated', label: 'Declared allocations do not account for the person' },
  { key: 'expiring', label: 'A line ends within the declared window' },
  { key: 'multi-line', label: 'Accountable to more than one manager' },
  { key: 'line-only-work', label: 'Open work reaches a manager only through a declared line' },
  { key: 'shared-work', label: 'Open work with more than one accountable manager' },
  { key: 'seat-refused', label: 'A declared line holder the roster cannot seat' },
]);

export const MATRIX_FINDING_KEYS = Object.freeze(MATRIX_FINDINGS.map((f) => f.key));
const FINDING_RANK = new Map(MATRIX_FINDINGS.map((f, i) => [f.key, i]));
export function matrixFindingRank(key) {
  const rank = FINDING_RANK.get(key);
  return typeof rank === 'number' ? rank : FINDING_RANK.size;
}

export const MATRIX_PANELS = Object.freeze([
  Object.freeze({ key: 'desk', label: 'Desk', hint: 'The reconciliation: does the roll-up add up?' }),
  Object.freeze({ key: 'lines', label: 'Lines', hint: 'Every declared reporting line, dated and dated out.' }),
  Object.freeze({ key: 'exit', label: 'Line exit', hint: 'What a line that has ended still owes — and who has settled it.' }),
  Object.freeze({ key: 'consent', label: 'Consent', hint: 'A declared share is an ask until the line accepts it and the person acknowledges it.' }),
  Object.freeze({ key: 'renewal', label: 'Re-affirmation', hint: 'A line has a term. Which commitments does anyone actually agree to today?' }),
  Object.freeze({ key: 'allocation', label: 'Period allocation', hint: 'What each line actually charged across a named period — time-weighted share-days, or refused.' }),
  Object.freeze({ key: 'activity', label: 'Line activity', hint: 'What each line was charged against what it actually originated — and the refusals between them.' }),
  Object.freeze({ key: 'rights', label: 'Rights', hint: 'Who decides what, for each person on more than one line.' }),
  Object.freeze({ key: 'concordance', label: 'Concordance', hint: 'What the decision log actually did, against the rights declared on each line.' }),
  Object.freeze({ key: 'continuity', label: 'Continuity', hint: 'Which frozen decisions still name the authority that made them — and which have drifted.' }),
  Object.freeze({ key: 'seats', label: 'Seats', hint: 'Whose line the work actually reaches — and who the roster cannot seat.' }),
  Object.freeze({ key: 'governance', label: 'Governance', hint: 'Executive view: joint-apex escalations, cross-axis coupling and structural checks.' }),
  Object.freeze({ key: 'queue', label: 'Review', hint: 'The bounded queue, worst first.' }),
  Object.freeze({ key: 'method', label: 'Method', hint: 'What is declared, what is derived, and what is refused.' }),
]);

export const MATRIX_PANEL_KEYS = Object.freeze(MATRIX_PANELS.map((p) => p.key));

/** Line defects found at load time. Every one is reported; none is repaired. */
export const MATRIX_LINE_DEFECTS = Object.freeze([
  { key: 'self-line', label: 'Reports to themselves' },
  { key: 'duplicate', label: 'Duplicate of an existing line' },
  { key: 'cycle', label: 'Would create a loop in the reporting graph' },
  { key: 'missing-person', label: 'Names a person who is not on the roster' },
  { key: 'missing-manager', label: 'Names a manager who is not on the roster' },
  { key: 'archived', label: 'Names an archived person' },
  { key: 'bad-share', label: 'Allocation outside 0–100%' },
  { key: 'bad-window', label: 'Ends before it starts' },
]);

export const MATRIX_LINE_DEFECT_KEYS = Object.freeze(MATRIX_LINE_DEFECTS.map((d) => d.key));

/**
 * The named methods. The module prints these; it does not paraphrase them.
 */
export const MATRIX_METHOD = Object.freeze([
  {
    name: 'RAPID decision rights (Rogers & Blenko, 2006)',
    why: 'In a matrix the question is never "who is my manager" but "who decides this". Each of the six rights is attributed to a named line, so a right held by two managers is a conflict the structure created, and a right held by nobody is a gap the structure created — both are recorded, neither is adjudicated for the leader.',
  },
  {
    name: 'Full-time-equivalent allocation (managerial accounting)',
    why: 'A person is one unit of capacity. The shares a leader declares are that unit split across the lines that consume it, so each manager is attributed a fraction and the fractions must add back to the person. This is the same discipline as cost allocation to responsibility centres (Anthony & Govindarajan): attribution, not a grand total, is the unit of the reading.',
  },
  {
    name: 'Integer-hundredths arithmetic',
    why: 'Every allocation is held as a whole number of hundredths and every total is an integer sum, so the reconciliation the panel prints is exact rather than a floating-point number that rounds into looking correct. A ledger a chief will act on is not allowed to be off by a rounding error it cannot show.',
  },
  {
    name: 'Refusal instead of imputation',
    why: 'A line with no declared allocation contributes nothing and is counted as undeclared. Splitting the remainder evenly would be inventing an agreement nobody made, and it would make the total close while hiding that it closed on a guess.',
  },
  {
    name: 'No netting and no single-owner guess',
    why: 'A person over-allocated on one line is not offset by being under-allocated on another, and work touching a person with three managers is fanned to all three rather than assigned to whichever one the tree happens to name first. Choosing one silently is a decision the system is not entitled to make.',
  },
  {
    name: 'Statistical disclosure control',
    why: 'Above the declared detail ceiling a manager row is disclosed as a count and a band. A person’s allocation is item detail about an individual; an organisation-level total is an aggregate.',
  },
  {
    name: 'Common-agency escalation tax (Bernheim & Whinston, 1986; Galbraith, 1971)',
    why: 'When multiple principals hold the same operational right (priority, assignment, technical direction) or govern the same work item, neither line can settle the trade-off alone. The conflict climbs to their lowest joint apex in the reporting graph.',
  },
  {
    name: 'Minimal common ancestors in a matrix DAG',
    why: 'A tree has one lowest common ancestor for any two spans; a matrix DAG can have two incomparable minimal ancestors (a diamond tie). All minimal ancestors are named and none is picked silently — guessing one owner is a structural lie.',
  },
  {
    name: 'Cross-axis structural coupling (Simon, 1962; Brooks, 1975)',
    why: 'A person on two lines couples two managerial spans into shared failure modes. Coupling is counted as distinct span-pairs and Wilson-bounded workspace shares (refused below the cell floor), never collapsed into a composite score or a rating of any person.',
  },
]);

/**
 * The typed edge a declared ADDITIONAL line writes. The home line writes none:
 * `person.managerId` already records it, and a second copy of the same fact is
 * a fact waiting to drift.
 */
export const MATRIX_RELATION = 'reports-to';

export const MATRIX_RULE_IDS = Object.freeze({
  FANOUT: 'RULE-MTX-01',
});

export const MATRIX_CSV_COLUMNS = Object.freeze([
  'row_kind', 'scope', 'altitude', 'person_n', 'line_n', 'secondary_line_n',
  'multi_line_n', 'attributed_h', 'attributable_people_n', 'undeclared_people_n',
  'net_fte_error_h', 'balances', 'over_committed_n', 'under_allocated_n',
  'balanced_n', 'contested_right_n', 'unowned_right_n', 'expiring_n',
  'manager_rank', 'manager_attributed_h', 'manager_direct_n', 'manager_shared_n',
  'manager_withheld', 'right_key', 'right_state', 'right_holders_n',
  'share_state', 'share_total_h', 'finding', 'band', 'withheld', 'withheld_reason',
  'line_scope_n', 'line_only_n', 'line_work_n', 'line_work_shared_n', 'seat_state',
  'apex_contested_n', 'apex_operational_contested_n', 'apex_shared_work_n',
  'apex_ambiguous_n', 'coupled_span_pairs_n', 'governance_alert_n',
]);
