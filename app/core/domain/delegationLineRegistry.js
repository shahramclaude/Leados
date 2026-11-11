/**
 * app/core/domain/delegationLineRegistry.js — vocabulary for Cross-Line Ask
 * Attribution & Shared-Contributor Load Reconciliation (ADR-0178, Schema v143,
 * `RULE-DLA-01`, CSV scope #133, `#/matrix?panel=asks`).
 *
 * STATUS (Session 243, 2026-11-11): SHIPPED — Schema v143, RULE-DLA-01, CSV #133 and `#/matrix?panel=asks` are wired end to end.
 *
 * THE DUTY. A frontline contributor in a matrix answers to a functional manager
 * and a project or product manager. Both hand over dated work, and each of them
 * sees a reasonable list. Nobody sees the sum, because a delegation names the
 * person it was handed to and never the reporting line it was handed over on.
 * The person cannot push back on either list, and the manager above both learns
 * about it from a missed date.
 *
 * Frameworks applied (named, not paraphrased):
 *  - Multi-task, multi-principal agency (Holmström & Milgrom, 1991): two
 *    principals who each observe only their own asks jointly over-ask an agent
 *    whose capacity is common to both.
 *  - Common-pool resources (Hardin, 1968; Ostrom, 1990): a shared person's week
 *    is a commons. It is governed by making every appropriator's take visible
 *    and by a declared share, not by goodwill.
 *  - Role conflict and role overload (Kahn et al., 1964; Rizzo, House &
 *    Lirtzman, 1970): incompatible demands from two legitimate role senders are
 *    a property of the structure, so they are printed per sender.
 *  - Responsibility-centre accounting: load is charged to the line that issued
 *    it, against that line's declared share of the person.
 *  - Decision rights (RAPID, Rogers & Blenko, 2006): the matrix charter already
 *    declares which line holds the `assignment` right; an ask is tested against
 *    it and never adjudicated.
 *
 * Leaf module: imports nothing, so schema, read model, rule, actions, CSV and
 * view can all depend on it without a cycle.
 */

export const DELEGATION_LINE_RULE_ID = 'RULE-DLA-01';
export const DELEGATION_LINE_ADR = 'ADR-0178';

export const DELEGATION_LINE_EVENTS = Object.freeze({
  ATTRIBUTED: 'delegation.line.attributed',
  SCAN: 'delegation.line.scan',
  CONVENTIONS: 'delegation.line.conventions',
});

export const DELEGATION_LINE_RIGHTS = Object.freeze({
  GOVERN: 'govern-delegation-lines',
});

/**
 * How an attribution came to be recorded.
 *   declared  a human chose the line explicitly;
 *   seat      stamped from the acting seat, because exactly one of the person's
 *             active lines runs through that seat. Never used in the operator view.
 */
export const DELEGATION_LINE_BASES = Object.freeze(['declared', 'seat']);

export const DELEGATION_LINE_LIMITS = Object.freeze({
  acts: 5000,
  markers: 2000,
  idMax: 80,
  asksPerCommit: 8,
});

/**
 * The default budget is the Load engine's own commitment budget (`load.js`,
 * `LOAD_COMMITMENT_BUDGET`), so the two modules speak about the same ceiling.
 * Parity is pinned by test rather than by an import, to keep this file a leaf.
 */
export const DELEGATION_LINE_DEFAULTS = Object.freeze({ budget: 6, askDueDays: 5, autoPropagate: true });
export const DELEGATION_LINE_BOUNDS = Object.freeze({
  budget: Object.freeze([1, 24]),
  askDueDays: Object.freeze([1, 30]),
});

/** The matrix decision right an ask is tested against ("Who hands them a task?"). */
export const DELEGATION_LINE_CHARTER_RIGHT = 'assignment';

/** One class per open ask. Closed vocabulary, in print order. */
export const DELEGATION_LINE_CLASSES = Object.freeze(['attributed', 'sole-line', 'rule-issued', 'unattributed', 'stale']);
export const DELEGATION_LINE_CLASS_LABELS = Object.freeze({
  attributed: 'On a named line',
  'sole-line': 'Single line (derived)',
  'rule-issued': 'Issued by automation',
  unattributed: 'On no line',
  stale: 'Line no longer held',
});
export const DELEGATION_LINE_CLASS_REASONS = Object.freeze({
  attributed: 'A recorded attribution names one of the lines this person actively holds, and that line still runs through the manager it named.',
  'sole-line': 'The person holds exactly one reporting line, so the ask can only be on it. Derived by arithmetic; nothing is stored.',
  'rule-issued': 'No attribution is recorded and a typed `issues-obligation` edge shows an automation rule issued this ask. It loads the person and belongs to no manager’s line.',
  unattributed: 'The person holds two or more reporting lines and nothing records which of them this ask was handed over on. It is REFUSED a line rather than guessed onto one.',
  stale: 'A recorded attribution names a line this person no longer holds, or whose manager has changed. It is printed as recorded and is never re-pointed.',
});

/** One verdict per shared person with at least one open ask. Closed, in precedence order. */
export const DELEGATION_LINE_VERDICTS = Object.freeze(['overloaded', 'unattributed', 'share-undeclared', 'line-over-share', 'within']);
export const DELEGATION_LINE_VERDICT_LABELS = Object.freeze({
  overloaded: 'Over budget across lines',
  unattributed: 'An ask is on no line',
  'share-undeclared': 'Split not declared',
  'line-over-share': 'A line is over its share',
  within: 'Within budget and share',
});
export const DELEGATION_LINE_VERDICT_REASONS = Object.freeze({
  overloaded: 'The open asks from every source exceed the declared budget. This needs no attribution to be true; the per-line split beside it says which lines carry it, or why that cannot be read.',
  unattributed: 'Within budget, but at least one open ask is on no line (never attributed, or attributed to a line no longer held), so the per-line reading is refused for this person.',
  'share-undeclared': 'Within budget and every ask is placed, but the split of this person’s time across their lines is not fully declared, so no line’s entitlement can be computed. Nothing is split evenly.',
  'line-over-share': 'Within budget, but at least one line holds more open asks than its declared share of the budget entitles it to. The next ask from another line overloads the person.',
  within: 'Within budget, every ask is placed, and every line is inside its declared share of the budget.',
});

/** One state per active line of a shared person. Closed. */
export const DELEGATION_LINE_LINE_STATES = Object.freeze(['over-share', 'within-share', 'share-undeclared']);
export const DELEGATION_LINE_LINE_STATE_LABELS = Object.freeze({
  'over-share': 'Over its share',
  'within-share': 'Within its share',
  'share-undeclared': 'Share not declared',
});

/** One state per line-attributed ask on a shared person. Closed. */
export const DELEGATION_LINE_CHARTER_STATES = Object.freeze(['chartered', 'outside-charter', 'charter-silent']);
export const DELEGATION_LINE_CHARTER_LABELS = Object.freeze({
  chartered: 'Line holds the assignment right',
  'outside-charter': 'Line does not hold the assignment right',
  'charter-silent': 'No line holds the assignment right',
});

/** Where an over-budget person’s reconciliation lands. Closed. */
export const DELEGATION_LINE_APEX_STATES = Object.freeze(['unique', 'leader-held', 'ambiguous', 'off-roster']);
export const DELEGATION_LINE_APEX_LABELS = Object.freeze({
  unique: 'One covering seat',
  'leader-held': 'Covered only by the workspace leader',
  ambiguous: 'No single covering seat',
  'off-roster': 'Covering seat not on the roster',
});

export const DELEGATION_LINE_RULE_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

export const DELEGATION_LINE_METHOD = Object.freeze([
  'An attribution is a dated, append-only act naming ONE active reporting line of the person an ask was handed to. The latest act per ask is the effective one. It is never inferred from a title, a team, a project name or whoever happens to be signed in.',
  'A person on exactly one line needs no act: the ask can only be on that line, and the register derives it. A person on two or more lines with no act reads “on no line”, and no line is charged with it.',
  'An ask an automation rule issued (a typed `issues-obligation` edge carrying a rule id) is counted apart. It loads the person and is charged to no manager’s line unless a human attributes it.',
  'Budget is a declared convention: the number of open asks one person can carry from every source at once. The default equals the Load engine’s commitment budget.',
  'A line’s entitlement is budget × its declared share of the person, in exact hundredths of an ask. A line is over its share when asks × 100 > budget × share, an integer comparison with no rounding. If any of the person’s lines has no declared share, EVERY entitlement for that person is refused; nothing is split evenly.',
  'Each line-attributed ask is tested against the matrix charter’s `assignment` right (“who hands them a task?”). The result is printed and nothing is blocked: the charter is recorded, never adjudicated here.',
  'RULE-DLA-01 puts one dated reconciliation ask in front of the single seat that covers EVERY line the over-budget person holds (the joint apex of the reporting graph), at most once per breaching ask, and closes it when the person is back within budget. A covering seat held only by the workspace leader, off the roster, or tied between two incomparable seats is recorded as an observation; nobody is substituted.',
]);

export const DELEGATION_LINE_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope', 'budget',
  'asks_read', 'asks_attributed', 'asks_sole_line', 'asks_rule_issued', 'asks_unattributed', 'asks_stale', 'classes_reconcile',
  'asks_not_read',
  'shared_people_read',
  'verdict_overloaded', 'verdict_unattributed', 'verdict_share_undeclared', 'verdict_line_over_share', 'verdict_within', 'verdicts_reconcile',
  'line_pairs', 'lines_over_share', 'lines_within_share', 'lines_share_undeclared', 'lines_reconcile',
  'shared_asks_on_a_line', 'asks_chartered', 'asks_outside_charter', 'asks_charter_silent', 'charter_reconcile',
  'over_budget_unreadable_by_line', 'asks_reattributed',
  'apex_unique', 'apex_leader_held', 'apex_ambiguous', 'apex_off_roster',
  'open_reconciliation_asks', 'ask_due_days',
]);

export const DELEGATION_LINE_CSV_DESCRIPTOR = Object.freeze({
  key: 'delegation-lines',
  label: 'Cross-line ask attribution (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'delegation-lines',
  description: 'One summary row for the open delegations the acting seat may read: how they divide between a named reporting line, a single line derived by arithmetic, automation, no line at all and a line no longer held (the five counts reconcile to the asks read, and the row says whether they do); how many people on two or more lines read under each of the five verdicts (reconciled separately); how their lines divide between over-share, within-share and share-not-declared (reconciled separately); how the line-attributed asks test against the matrix charter’s assignment right (reconciled separately); how many over-budget people cannot be read line by line; where each over-budget person’s reconciliation lands; and how many reconciliation asks are open. NO person, NO manager, NO ask title and NO free text.',
});
