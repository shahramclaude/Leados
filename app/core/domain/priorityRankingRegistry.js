/**
 * app/core/domain/priorityRankingRegistry.js — closed vocabularies for the
 * Cross-Line Priority Ballot & Social-Choice Aggregation register
 * (ADR-0191, Schema v151, `RULE-SOC-01`, CSV scope #144,
 * `#/matrix?panel=priority`).
 *
 * THE DUTY. In a matrix, several lines share one person and each line ranks
 * that person's work differently. Every surface the workspace already holds is
 * a single line's view: `#/portfolio` carries the owner's own ambition horizon,
 * the Allocation Governor learns an exploratory *funding* share, and the
 * Cross-Line Priority Arbitration (ADR-0143) compares two managers' DATED work
 * item by item. None of them answers the question a line manager actually
 * faces: *given the same three things Sam could do this week, which do the
 * lines that share Sam put first — and where do they genuinely disagree?*
 *
 * WHAT IS STORED. Three human acts, nothing derived:
 *
 *   1. a ROUND: one seat freezes a person, a bounded set of that person's live
 *      work items and the person's reporting lines AS THEY ARE TODAY;
 *   2. a BALLOT: the frozen holder of exactly one frozen line ranks EVERY item
 *      of the frozen set once, strictly, first to last;
 *   3. a WITHDRAWAL: the round is closed with a reason. Nothing is deleted.
 *
 * WHAT IS DERIVED, never stored: the pairwise majority matrix, the Condorcet
 * winner (or the proof that none exists), the Schwartz top cycle, the Schulze
 * beatpath strengths and order, the exact Kemeny–Young ranking, every coverage
 * state, every verdict and every roll-up.
 *
 * WHY ORDINAL AND NOT SCORED. A self-declared score (WSJF, story points, a
 * 1–10 "value") lets whichever line inflates its numbers win, and interpersonal
 * utility comparisons are not available to the aggregator (Arrow, 1951). A
 * strict ranking asks each line only the question it can honestly answer:
 * *which of these first?*
 */

export const PRIORITY_BALLOT_ENGINE_VERSION = 'priority-ballot-2026.11-v1';
export const PRIORITY_BALLOT_ADR = 'ADR-0191';
export const PRIORITY_BALLOT_RULE_ID = 'RULE-SOC-01';
export const PRIORITY_BALLOT_ROUTE = 'matrix-priority';
export const PRIORITY_BALLOT_PANEL = 'priority';
export const PRIORITY_BALLOT_CSV_SCOPE = 'matrix-priority-ballots';

export const PRIORITY_BALLOT_EVENTS = Object.freeze({
  ROUND_DECLARED: 'priority.round.declared',
  BALLOT_CAST: 'priority.ballot.cast',
  ROUND_WITHDRAWN: 'priority.round.withdrawn',
  CONVENTIONS: 'priority.conventions.set',
  SCAN: 'priority.scan',
});
export const PRIORITY_BALLOT_EVENT_PREFIX = 'priority.';

/**
 * Declaring a cross-line round is a management act; casting a ballot is the
 * line holder's own first-person act at any altitude; governing the conventions
 * is director-and-above, the window every other register uses.
 */
export const PRIORITY_BALLOT_RIGHTS = Object.freeze({
  READ: 'read-priority-ballots',
  DECLARE: 'declare-priority-round',
  CAST: 'cast-priority-ballot',
  GOVERN: 'govern-priority-ballots',
});

/* ------------------------------------------------------------ vocabularies */

/**
 * The verdict describes THE ROUND, never a person and never a line. It is
 * decided by the ballots alone; coverage is a SEPARATE claim printed beside it,
 * so "nobody has voted yet" and "the lines disagree" are never collapsed into
 * one word.
 */
export const PRIORITY_BALLOT_VERDICTS = Object.freeze([
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn', rank: 0, tone: 'neutral', says: 'The round was closed with a reason. Ballots already cast are kept as history and are not aggregated.' }),
  Object.freeze({ key: 'inert', label: 'One line only', rank: 1, tone: 'neutral', says: 'The person holds fewer than two active lines, so there is nothing to aggregate. A single line’s order is that line’s own decision.' }),
  Object.freeze({ key: 'insufficient', label: 'Too few ballots', rank: 2, tone: 'warn', says: 'Fewer ballots were cast than the declared floor. The counts are printed and no aggregate is claimed.' }),
  Object.freeze({ key: 'condorcet', label: 'Majority winner', rank: 3, tone: 'good', says: 'One item beats every other item head-to-head on the cast ballots.' }),
  Object.freeze({ key: 'cycle', label: 'Genuine disagreement', rank: 4, tone: 'bad', says: 'No item beats every other item: the lines’ preferences form a majority cycle. The top cycle and the beatpath completion are printed, and the disagreement is routed to the lines’ lowest joint apex — it is never broken silently.' }),
]);
export const PRIORITY_BALLOT_VERDICT_KEYS = Object.freeze(PRIORITY_BALLOT_VERDICTS.map((row) => row.key));

/**
 * Per frozen line. `answered` is the only state that contributes a ballot.
 * Silence is never a ranking, and a line whose manager moved is never re-asked
 * on the new manager's behalf — the round froze the holder it asked.
 */
export const PRIORITY_BALLOT_COVERAGE_STATES = Object.freeze([
  Object.freeze({ key: 'answered', label: 'Ballot cast', tone: 'good', closed: true, counts: true }),
  Object.freeze({ key: 'pending', label: 'Not yet due', tone: 'neutral', closed: false, counts: false }),
  Object.freeze({ key: 'overdue', label: 'Overdue', tone: 'warn', closed: false, counts: false }),
  Object.freeze({ key: 'line-ended', label: 'Line ended', tone: 'bad', closed: true, counts: false }),
  Object.freeze({ key: 'holder-moved', label: 'Holder changed', tone: 'bad', closed: true, counts: false }),
  Object.freeze({ key: 'person-off-roster', label: 'Owner off roster', tone: 'bad', closed: true, counts: false }),
]);
export const PRIORITY_BALLOT_COVERAGE_KEYS = Object.freeze(PRIORITY_BALLOT_COVERAGE_STATES.map((row) => row.key));

/** The declared aggregation rule. Every completion is printed with the winner; none replaces it. */
export const PRIORITY_BALLOT_METHODS = Object.freeze([
  Object.freeze({ key: 'condorcet', label: 'Condorcet winner', says: 'An item that wins every head-to-head pairing. Where one exists it is the only outcome this register calls a winner.' }),
  Object.freeze({ key: 'schwartz', label: 'Schwartz top cycle', says: 'The smallest set of items no item outside it beats. A cycle is printed as the set plus the majority edges inside it.' }),
  Object.freeze({ key: 'schulze', label: 'Schulze beatpath', says: 'The widest-path strength of each item against each other, computed exactly on the pairwise margin graph. It orders a cyclic field without pretending a winner exists.' }),
  Object.freeze({ key: 'kemeny', label: 'Kemeny–Young ranking', says: 'The exact rank order that agrees with the most ballot pairs. Enumerated exactly up to the declared item cap; above it the register refuses rather than approximating.' }),
]);

/** What the read refused to print, and why. Refusals are counted, never dropped. */
export const PRIORITY_BALLOT_REFUSALS = Object.freeze([
  Object.freeze({ key: 'thin-ballots', says: 'The round has fewer cast ballots than the declared floor. The counts are printed and no pairwise matrix, winner or completion is claimed.' }),
  Object.freeze({ key: 'line-unreachable', says: 'A frozen line ended, or its holder changed, before a ballot was cast. It is counted and printed; nobody is substituted for the holder the round asked.' }),
  Object.freeze({ key: 'owner-off-roster', says: 'The person the round is about has left the active roster. The round is kept as history and owes no new ballot.' }),
  Object.freeze({ key: 'item-closed', says: 'A frozen work item has since been delivered or released. It stays in the frozen set — the ballots were cast over it — and the closure is printed beside the result.' }),
  Object.freeze({ key: 'kemeny-capped', says: 'The frozen set is larger than the declared exactness cap, so no Kemeny–Young ranking is claimed. The beatpath order is still printed.' }),
  Object.freeze({ key: 'kemeny-tied', says: 'More than one distinct ranking agrees with the most ballot pairs. No single ranking is claimed; the tie count is printed.' }),
  Object.freeze({ key: 'matrix-defect', says: 'The reporting graph carries a refused line. Rounds whose frozen lines touch it are printed as incomplete.' }),
  Object.freeze({ key: 'below-disclosure', says: 'This seat’s disclosure level withholds the named rows. Totals are printed; the rows are counted, not shown.' }),
  Object.freeze({ key: 'truncated', says: 'More rounds exist than this screen lists. The totals count all of them; the remainder is counted, not shown.' }),
]);
export const PRIORITY_BALLOT_REFUSAL_KEYS = Object.freeze(PRIORITY_BALLOT_REFUSALS.map((row) => row.key));

/* ------------------------------------------------------- bounds and limits */

export const PRIORITY_BALLOT_LIMITS = Object.freeze({
  rounds: 400,
  ballots: 4000,
  itemsMin: 2,
  itemsMax: 7,
  /** Exact Kemeny–Young enumeration cap: 6! = 720 orderings, computed on read. */
  kemenyMaxItems: 6,
  titleMin: 8,
  titleMax: 160,
  reasonMin: 8,
  reasonMax: 400,
  /** Days ahead a round's ballot deadline may be set. */
  dueAheadMax: 45,
  linesPerRound: 12,
  asksPerCommit: 6,
  roundsShown: 8,
  ballotsShown: 24,
  pairRowsShown: 49,
});

export const PRIORITY_BALLOT_SETTING_KEYS = Object.freeze({
  ballotDueDays: 'priorityBallotDueDays',
  askDueDays: 'priorityAskDueDays',
  minBallots: 'priorityMinBallots',
  autoPropagate: 'priorityBallotAutoPropagate',
});

export const PRIORITY_BALLOT_DEFAULTS = Object.freeze({
  ballotDueDays: 5,
  askDueDays: 3,
  minBallots: 2,
  autoPropagate: true,
});

export const PRIORITY_BALLOT_BOUNDS = Object.freeze({
  ballotDueDays: Object.freeze([1, 30]),
  askDueDays: Object.freeze([1, 14]),
  minBallots: Object.freeze([2, 6]),
});

export const PRIORITY_BALLOT_SETTING_LABELS = Object.freeze({
  ballotDueDays: 'Default days a line holder has to cast a ballot',
  askDueDays: 'Days the follow-up ask is due within',
  minBallots: 'Ballots required before any aggregate is claimed',
  autoPropagate: 'Priority-ballot automation (RULE-SOC-01)',
});

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #144. Aggregate only: one workspace row, then one row per round
 * verdict, per coverage state and per refusal. No person, manager, line, round
 * title, work-item title or record id reaches the file.
 */
export const PRIORITY_BALLOT_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'label', 'generated_on',
  'rounds_n', 'live_rounds_n', 'withdrawn_n', 'rounds_with_condorcet_n', 'rounds_with_cycle_n',
  'rounds_insufficient_n', 'rounds_inert_n',
  'lines_asked_n', 'ballots_cast_n', 'answered_n', 'pending_n', 'overdue_n', 'unresolvable_n',
  'items_frozen_n', 'items_closed_n',
  'min_ballots', 'ballot_due_days', 'ask_due_days', 'coverage_pct', 'coverage_withheld_reason',
  'counts_reconcile', 'figures_complete', 'claim_reason', 'engine_version',
]);

export const PRIORITY_BALLOT_CSV_DESCRIPTOR = Object.freeze({
  key: PRIORITY_BALLOT_CSV_SCOPE,
  label: 'Cross-line priority ballots & social-choice aggregation (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-priority-ballots',
  description: 'One identity-free workspace row plus one row per round verdict, per frozen-line coverage state and per refusal: rounds declared and withdrawn, frozen lines asked, ballots cast, the Condorcet-winner and majority-cycle counts, the exactness and floor conventions, and the ballot-coverage rate (BLANK with its reason below the declared floor — never zero). Contains NO person, manager, line, round title, work-item title, note or record id.',
});

/* ------------------------------------------------------------------ method */

export const PRIORITY_BALLOT_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'condorcet', label: 'Condorcet (1785) & the Marquis de Condorcet criterion', says: 'If one option beats every other option head-to-head, choosing anything else is indefensible. The register reports that winner, or proves none exists.' }),
  Object.freeze({ key: 'arrow', label: 'Arrow (1951), Social Choice and Individual Values', says: 'Ordinal rankings only: there is no interpersonal utility to add up, so no score is invented and no line’s numbers are weighted by rank or size.' }),
  Object.freeze({ key: 'schulze', label: 'Schulze (2011) beatpath method', says: 'Widest-path strengths order a cyclic field deterministically and can never rank a candidate above one that beats it head-to-head with a stronger path.' }),
  Object.freeze({ key: 'kemeny', label: 'Kemeny (1959) & Young — the median ranking', says: 'The ranking that agrees with the largest number of ballot pairs. Enumerated exactly inside the declared cap; a tie is printed as a tie.' }),
  Object.freeze({ key: 'schwartz', label: 'Schwartz set (1972; 1986)', says: 'The top cycle: the smallest set with no outside item beating any of its members. It names the disagreement without picking a side.' }),
  Object.freeze({ key: 'galbraith', label: 'Lateral relations in a matrix (Galbraith, 1973)', says: 'Lines that share a person are lateral parties with their own priorities. A cycle between them belongs to their lowest joint apex, never to the person being ranked.' }),
]);

export const PRIORITY_BALLOT_METHOD = Object.freeze({
  unit: 'one frozen working set of one person’s live work items × one first-person ballot by one frozen line holder',
  snapshot: 'A round freezes three things on the day it is declared: the person, the work items (2–7, each with the title it had that day) and the person’s active reporting lines with their holders. A later reorganisation cannot add a voter or change who was asked; a ballot cast before a line ended still counts as that holder’s act.',
  ballot: 'A ballot ranks EVERY frozen item exactly once, strictly. An incomplete ballot, a duplicated item or a second ballot from the same line is refused at the door and dropped on load — never repaired into a ranking.',
  aggregate: 'The pairwise matrix counts, for every ordered pair, how many ballots put the first item above the second. A Condorcet winner is the item that strictly beats every other. Where none exists the majority cycle is real: the Schwartz top cycle and the Schulze beatpath order are printed as the declared completion, and the disagreement is routed upward.',
  escalation: 'A majority cycle is a disagreement between LINES, not a defect in the person being ranked. One dated ask goes to the lowest joint apex of the lines that were asked; if the lines have no single apex, or the apex is the workspace leader, the register records an identity-free observation and asks nobody rather than inventing an owner.',
  notSaid: 'A ballot is a line’s stated priority, not a measurement of the person. Nothing here scores a person, ranks a manager, or says one line’s need matters more. A missing ballot is silence, and silence is never a ranking.',
});

export const PRIORITY_BALLOT_ASK_PREFIX = 'Priority ballot condition: ';
export const PRIORITY_BALLOT_CLOSED_PREFIX = `Closed by ${PRIORITY_BALLOT_RULE_ID}:`;
export const PRIORITY_BALLOT_MARKER_KIND = 'priority-ballot';

/** Map lookups used by the reader, the rule and the view. */
export const PRIORITY_BALLOT_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(PRIORITY_BALLOT_VERDICTS.map((row) => [row.key, row])));
export const PRIORITY_BALLOT_COVERAGE_BY_KEY = Object.freeze(Object.fromEntries(PRIORITY_BALLOT_COVERAGE_STATES.map((row) => [row.key, row])));
export const PRIORITY_BALLOT_REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(PRIORITY_BALLOT_REFUSALS.map((row) => [row.key, row])));
