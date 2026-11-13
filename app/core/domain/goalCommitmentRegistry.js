/**
 * app/core/domain/goalCommitmentRegistry.js — closed vocabularies for the
 * Cross-Line Goal Commitment Conflict register
 * (ADR-0193, Schema v153, `RULE-GCC-01`, CSV scope #145,
 * `#/matrix?panel=commitments`).
 *
 * THE DUTY. `state.goals` carries ONE `ownerId`, a target and a due date, and
 * any manager in the chain may set one for a person. Nothing in the workspace
 * compares the COMMITMENTS TWO LINES HAVE EACH TAKEN ON THE SAME PERSON.
 * `goalCarriage` (ADR-0163 slice, Session 225) audits that a goal is counted
 * once in a span rather than twice; the Cross-Line Priority Arbitration
 * (ADR-0143) compares two managers' dated WORK ITEMS; the priority ballot
 * (ADR-0191) ranks a person's live items TODAY. None of them notices that a
 * project line has promised a delivery window the home line's goal already
 * consumes, or that two goals for one person ask for movement in opposite
 * directions on the same measure.
 *
 * The failure is silent in the worst direction. Both managers acted reasonably
 * inside their own line; the person became the integration point of two
 * promises neither of them could see; and the first evidence is a missed date.
 *
 * WHAT IS STORED. One human act, three times over:
 *
 *   1. DECLARE a commitment — the holder of ONE named reporting line (or the
 *      person themselves, for a commitment owed under no line at all) states
 *      the window that line's goal consumes, the effort it draws in integer
 *      hundredths of one person, and — optionally and only if they choose to —
 *      the measure it moves and the direction it moves it in;
 *   2. RE-BASELINE — a dated successor replaces an earlier commitment on the
 *      same goal and the same line, in one atomic commit, with a reason. The
 *      predecessor is closed, never edited and never deleted;
 *   3. RELEASE — a commitment is closed with a reason when the goal ends or the
 *      line stops owing it.
 *
 * WHAT IS DERIVED, never stored: every line state, every pair verdict, the
 * exact inclusive overlap in days, the measure claim, the sweep-line peak day of
 * concurrent declared effort, the person-level and per-line capacity verdicts,
 * the goal attribution rate and its Wilson interval, every roll-up and every
 * refusal.
 *
 * WHY DECLARED AND NEVER INFERRED. A goal's title, description and key results
 * are prose. Reading "reduce cycle time" off a title and concluding it opposes
 * "increase throughput" is a guess dressed as a finding, and it is exactly the
 * inference the doctrine forbids: a measure and a direction are a declaration a
 * line holder can be held to, or they are nothing. A commitment that declares no
 * measure is printed as declaring none; it is never given one.
 *
 * WHY CAPACITY IS NOT A PAIR CLAIM. Two lines' windows colliding is a RELATION
 * between two promises. Whether the person can carry the week is a STOCK: it
 * depends on every commitment covering that day, not on the two being compared.
 * Charging a 140% week to one pair of them would name a culprit the arithmetic
 * does not support, so the two claims are computed separately, printed
 * separately and escalated separately — and never collapsed into one word.
 */

export const GOAL_COMMITMENT_ENGINE_VERSION = 'goal-commitment-2026.11-v1';
export const GOAL_COMMITMENT_ADR = 'ADR-0193';
export const GOAL_COMMITMENT_RULE_ID = 'RULE-GCC-01';
export const GOAL_COMMITMENT_ROUTE = 'matrix-commitments';
export const GOAL_COMMITMENT_PANEL = 'commitments';
export const GOAL_COMMITMENT_CSV_SCOPE = 'matrix-goal-commitments';

export const GOAL_COMMITMENT_EVENTS = Object.freeze({
  DECLARED: 'goalCommitment.declared',
  REBASELINED: 'goalCommitment.rebaselined',
  RELEASED: 'goalCommitment.released',
  CONVENTIONS: 'goalCommitment.conventions.set',
  SCAN: 'goalCommitment.scan',
});
export const GOAL_COMMITMENT_EVENT_PREFIX = 'goalCommitment.';

/**
 * Declaring what your own line is promising is a first-person act at any
 * altitude — a project lead with no home-line reports is exactly who gets
 * handed a shared person. Governing the conventions and scanning the register
 * is director-and-above, the window every other matrix register uses.
 */
export const GOAL_COMMITMENT_RIGHTS = Object.freeze({
  READ: 'read-goal-commitments',
  DECLARE: 'declare-goal-commitment',
  RELEASE: 'release-goal-commitment',
  GOVERN: 'govern-goal-commitments',
});

/* ------------------------------------------------------------ vocabularies */

/** The explicit "owed under no reporting line" key. A declaration, not a hole. */
export const GOAL_COMMITMENT_NO_LINE = 'no-line';
/** The home line, read exactly as every other matrix surface reads it. */
export const GOAL_COMMITMENT_HOME_LINE = 'home';

/**
 * Per declaration. A commitment is LIVE only when the goal is still active, the
 * goal's owner has not moved, the owner is still on the roster, and — for a
 * named line — that line is still active and still held by the same manager.
 *
 * The closed states are benign and are never counted as a loss of coverage: a
 * goal that finished, a commitment that was re-baselined and one that was
 * released all did their job. The UNREACHABLE states are the ones that withhold
 * a comparison, and each is printed with its own reason rather than folded into
 * one reassuring "inactive".
 */
export const GOAL_COMMITMENT_STATES = Object.freeze([
  Object.freeze({ key: 'live', label: 'Live', tone: 'good', closed: false, comparable: true, says: 'The goal is active, its owner has not moved, and the holder still holds the line this commitment was declared under.' }),
  Object.freeze({ key: 'no-line', label: 'Owed under no line', tone: 'neutral', closed: false, comparable: false, says: 'Declared explicitly as owed under no reporting line. It still draws on the person and is counted in the capacity sweep, but there is no second principal to conflict with.' }),
  Object.freeze({ key: 'superseded', label: 'Re-baselined', tone: 'neutral', closed: true, comparable: false, says: 'A dated successor replaced this commitment on the same goal and line. The predecessor is kept as history and is never edited.' }),
  Object.freeze({ key: 'released', label: 'Released', tone: 'neutral', closed: true, comparable: false, says: 'Closed with a written reason: the goal ended, or the line stopped owing it.' }),
  Object.freeze({ key: 'goal-closed', label: 'Goal no longer active', tone: 'neutral', closed: true, comparable: false, says: 'The goal this commitment names has been completed or dropped. The commitment is kept as history.' }),
  Object.freeze({ key: 'owner-moved', label: 'Goal re-assigned', tone: 'warn', closed: true, comparable: false, says: 'The goal’s owner changed after this commitment was declared. It is NOT re-pointed at the new owner: the window and the effort were declared for the person who held it then.' }),
  Object.freeze({ key: 'owner-off-roster', label: 'Owner off roster', tone: 'warn', closed: true, comparable: false, says: 'The person this commitment was about has left the active roster. Nobody is substituted.' }),
  Object.freeze({ key: 'line-ended', label: 'Line ended', tone: 'bad', closed: true, comparable: false, says: 'The reporting line this commitment was declared under is no longer active. A later holder of the same line is not asked on the earlier holder’s behalf.' }),
  Object.freeze({ key: 'holder-moved', label: 'Holder changed', tone: 'bad', closed: true, comparable: false, says: 'The line is still active but its holder changed. The commitment belongs to the holder who declared it.' }),
  Object.freeze({ key: 'line-defective', label: 'Line refused by the graph', tone: 'bad', closed: true, comparable: false, says: 'The named line sits on an edge the matrix engine refused. The comparison is withheld rather than computed over a partial graph.' }),
]);
export const GOAL_COMMITMENT_STATE_KEYS = Object.freeze(GOAL_COMMITMENT_STATES.map((row) => row.key));
export const GOAL_COMMITMENT_STATE_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_STATES.map((row) => [row.key, row])));

/**
 * Per PAIR of live commitments on one owner. Exhaustive and mutually exclusive:
 * every pair of two live declarations lands in exactly one of these.
 *
 * Ranked by severity, worst last, so a screen sorted by rank puts the
 * contradiction that cannot be worked around above the collision that can.
 */
export const GOAL_COMMITMENT_PAIR_VERDICTS = Object.freeze([
  Object.freeze({ key: 'single-principal', label: 'No second principal', rank: 0, tone: 'neutral', says: 'At least one of the two is owed under no reporting line, so there is no second principal to disagree with. Both still draw on the person and both are counted in the capacity sweep.' }),
  Object.freeze({ key: 'same-line', label: 'One line’s own sequencing', rank: 1, tone: 'neutral', says: 'Both commitments are owed under the SAME line. That is one manager’s own ordering problem, not a cross-line conflict, and it is never routed to a joint apex.' }),
  Object.freeze({ key: 'compatible', label: 'Windows do not collide', rank: 2, tone: 'good', says: 'Two different lines, and the declared windows do not overlap on a single day.' }),
  Object.freeze({ key: 'date-overlap', label: 'Windows collide', rank: 3, tone: 'warn', says: 'Two different lines have each committed the same person over the same days. The exact overlap is printed; the two measures declared are not opposed, or one of them declared none.' }),
  Object.freeze({ key: 'target-conflict', label: 'Opposed targets', rank: 4, tone: 'bad', says: 'Two different lines have each committed the same person over the same days AND named the same measure in opposite directions. Neither promise can be kept by working harder: one of them has to be withdrawn or re-dated, and that decision belongs to the lines’ lowest joint apex.' }),
]);
export const GOAL_COMMITMENT_PAIR_VERDICT_KEYS = Object.freeze(GOAL_COMMITMENT_PAIR_VERDICTS.map((row) => row.key));
export const GOAL_COMMITMENT_PAIR_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_PAIR_VERDICTS.map((row) => [row.key, row])));

/**
 * Per OWNER. The register's headline verdict, decided by that person's pair
 * rows and capacity sweep together — with two states below every comparison
 * that say the register could not compare anything at all, because "no conflict
 * found" and "nothing declared to compare" are different facts and must never
 * print the same word.
 */
export const GOAL_COMMITMENT_OWNER_VERDICTS = Object.freeze([
  Object.freeze({ key: 'inert', label: 'One line only', rank: 0, tone: 'neutral', says: 'This person holds fewer than two active reporting lines, so there is no cross-line commitment to compare. A single line’s goals are that line’s own ordering.' }),
  Object.freeze({ key: 'undeclared', label: 'Nothing declared', rank: 1, tone: 'warn', says: 'This person holds two or more active lines and not one of their live goals carries a commitment declaration. The register prints the counts and claims nothing: silence here is not compatibility.' }),
  Object.freeze({ key: 'compatible', label: 'Commitments fit', rank: 2, tone: 'good', says: 'Every cross-line pair is compatible or collides only inside the declared capacity, and no two lines named the same measure in opposite directions.' }),
  Object.freeze({ key: 'date-overlap', label: 'Windows collide', rank: 3, tone: 'warn', says: 'At least two lines have committed this person over the same days, inside the capacity the declarations add up to. The exact overlap is printed per pair.' }),
  Object.freeze({ key: 'capacity-overcommit', label: 'Capacity overcommitted', rank: 4, tone: 'bad', says: 'On the exact day of maximum concurrent declared effort, the commitments this person carries add up to more than one whole person — or to more than a line’s own declared share. The peak day, the sum and the basis are printed.' }),
  Object.freeze({ key: 'target-conflict', label: 'Opposed targets', rank: 5, tone: 'bad', says: 'Two lines have committed this person over the same days to opposite movement on the same declared measure. This outranks an overcommit because it cannot be resolved by de-scoping: one of the two promises has to be withdrawn.' }),
]);
export const GOAL_COMMITMENT_OWNER_VERDICT_KEYS = Object.freeze(GOAL_COMMITMENT_OWNER_VERDICTS.map((row) => row.key));
export const GOAL_COMMITMENT_OWNER_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_OWNER_VERDICTS.map((row) => [row.key, row])));

/**
 * The capacity sweep is its OWN claim, printed beside the pairs and never
 * folded into a pair verdict. `share-undeclared` is the per-line refusal: the
 * line carries no declared share, so what that line promised cannot be measured
 * against what it was given — the whole-person reading still stands.
 */
export const GOAL_COMMITMENT_CAPACITY_VERDICTS = Object.freeze([
  Object.freeze({ key: 'unmeasurable', label: 'Nothing to measure', tone: 'neutral', says: 'No live commitment covers a day inside the declared horizon.' }),
  Object.freeze({ key: 'fits', label: 'Inside the basis', tone: 'good', says: 'At the exact peak day the concurrent declared effort is inside the basis it was measured against.' }),
  Object.freeze({ key: 'overcommit', label: 'Over the basis', tone: 'bad', says: 'At the exact peak day the concurrent declared effort exceeds the basis. The day, the sum, the basis and the excess are printed in integer hundredths; nothing is rounded away.' }),
  Object.freeze({ key: 'share-undeclared', label: 'Line share undeclared', tone: 'warn', says: 'This line carries no declared share of the person, so its commitments cannot be measured against what it was given. The per-line reading is refused; the whole-person reading still stands.' }),
]);
export const GOAL_COMMITMENT_CAPACITY_KEYS = Object.freeze(GOAL_COMMITMENT_CAPACITY_VERDICTS.map((row) => row.key));
export const GOAL_COMMITMENT_CAPACITY_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_CAPACITY_VERDICTS.map((row) => [row.key, row])));

/**
 * The measure claim on a colliding pair. `undeclared` and `different-measure`
 * are BOTH honest absences and are printed apart: "neither line said what it
 * moves" is not the same fact as "the two lines named different things".
 */
export const GOAL_COMMITMENT_MEASURE_CLAIMS = Object.freeze([
  Object.freeze({ key: 'opposed', label: 'Opposed directions', tone: 'bad', says: 'Both named the same measure and declared different directions.' }),
  Object.freeze({ key: 'aligned', label: 'Same direction', tone: 'good', says: 'Both named the same measure and declared the same direction. They still compete for the same person, which is the capacity claim’s business, not this one’s.' }),
  Object.freeze({ key: 'different-measure', label: 'Different measures', tone: 'neutral', says: 'The two lines named different measures. No target claim is possible between them.' }),
  Object.freeze({ key: 'undeclared', label: 'Measure not declared', tone: 'neutral', says: 'At least one of the two declared no measure. Nothing is inferred from the goal’s title, description or key results.' }),
]);
export const GOAL_COMMITMENT_MEASURE_KEYS = Object.freeze(GOAL_COMMITMENT_MEASURE_CLAIMS.map((row) => row.key));
export const GOAL_COMMITMENT_MEASURE_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_MEASURE_CLAIMS.map((row) => [row.key, row])));

/** The declared direction a commitment moves its measure in. Closed set. */
export const GOAL_COMMITMENT_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'increase', label: 'Increase', says: 'The commitment promises the measure goes UP over the window.' }),
  Object.freeze({ key: 'decrease', label: 'Decrease', says: 'The commitment promises the measure goes DOWN over the window.' }),
  Object.freeze({ key: 'hold', label: 'Hold steady', says: 'The commitment promises the measure does NOT move over the window — which is opposed to either of the other two, because one line holding a measure steady while another pushes it is a contradiction, not a difference of degree.' }),
]);
export const GOAL_COMMITMENT_DIRECTION_KEYS = Object.freeze(GOAL_COMMITMENT_DIRECTIONS.map((row) => row.key));

/**
 * Per live goal of a multi-line owner: was a line ever named for it? A goal with
 * no declaration is `unattributed` and is NEVER charged to the home line —
 * that is the one guess this register exists to refuse.
 */
export const GOAL_COMMITMENT_ATTRIBUTION_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Line declared', tone: 'good', says: 'At least one live commitment names the line this goal is owed under.' }),
  Object.freeze({ key: 'unattributed', label: 'No line declared', tone: 'warn', says: 'The owner holds two or more active lines and no commitment names one for this goal. It cannot be compared, and it is not charged to the home line.' }),
  Object.freeze({ key: 'single-line', label: 'One line only', tone: 'neutral', says: 'The owner holds exactly one active line, so the goal is that line’s by construction. Nothing to attribute.' }),
  Object.freeze({ key: 'ownerless', label: 'No person owns it', tone: 'neutral', says: 'The goal names no owner (a team goal). It is not one person’s commitment and is counted apart, never compared.' }),
  Object.freeze({ key: 'leader-owned', label: 'The workspace leader owns it', tone: 'neutral', says: 'The goal belongs to the workspace leader, who holds no reporting line in this register, so there is no second principal and nothing to attribute. Counted apart, never compared.' }),
  Object.freeze({ key: 'off-roster', label: 'Owner off roster', tone: 'warn', says: 'The goal’s owner has left the active roster. Its commitments are kept as history.' }),
]);
export const GOAL_COMMITMENT_ATTRIBUTION_KEYS = Object.freeze(GOAL_COMMITMENT_ATTRIBUTION_STATES.map((row) => row.key));
export const GOAL_COMMITMENT_ATTRIBUTION_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_ATTRIBUTION_STATES.map((row) => [row.key, row])));

/** What the read refused to print, and why. Refusals are counted, never dropped. */
export const GOAL_COMMITMENT_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unattributed-goal', says: 'A live goal of a person on two or more lines carries no commitment declaration, so its window and effort are unknown and it cannot be compared. Counted; never charged to the home line.' }),
  Object.freeze({ key: 'below-floor', says: 'Fewer comparable goals than the declared floor. The attribution counts are printed and no rate is claimed.' }),
  Object.freeze({ key: 'line-unreachable', says: 'A declaration’s line ended, or its holder changed. It is counted and printed; nobody is substituted for the holder who declared it.' }),
  Object.freeze({ key: 'owner-moved', says: 'The goal’s owner changed after the commitment was declared. The commitment is not re-pointed at the new owner.' }),
  Object.freeze({ key: 'owner-off-roster', says: 'The person the commitment is about has left the active roster. The commitment is kept as history.' }),
  Object.freeze({ key: 'line-defective', says: 'The reporting graph carries a refused line that this declaration names. The comparison is withheld rather than computed over a partial graph.' }),
  Object.freeze({ key: 'beyond-horizon', says: 'A live commitment’s window lies entirely beyond the declared horizon, so it is counted but takes no part in the capacity sweep. Lengthen the horizon to bring it into view.' }),
  Object.freeze({ key: 'window-beyond-goal-due', says: 'The declared window ends after the goal’s own due date: a promise the goal cannot keep. Printed against the commitment, never repaired to the due date.' }),
  Object.freeze({ key: 'window-before-goal', says: 'The declared window starts before the goal was created. Printed against the commitment, never clamped.' }),
  Object.freeze({ key: 'goal-undated', says: 'The goal carries no due date, so the declared window cannot be checked against it. The comparison against the goal’s own date is refused; the pair and capacity readings still stand.' }),
  Object.freeze({ key: 'share-undeclared', says: 'A line carrying commitments has no declared share of the person, so what it promised cannot be measured against what it was given. The per-line reading is refused.' }),
  Object.freeze({ key: 'matrix-defect', says: 'The reporting graph carries a refused line. Owner rows touching it are printed as incomplete.' }),
  Object.freeze({ key: 'below-disclosure', says: 'This seat’s disclosure level withholds the named rows. Totals are printed; the rows are counted, not shown.' }),
  Object.freeze({ key: 'truncated', says: 'More owner rows exist than this screen lists. The totals count all of them; the remainder is counted, not shown.' }),
]);
export const GOAL_COMMITMENT_REFUSAL_KEYS = Object.freeze(GOAL_COMMITMENT_REFUSALS.map((row) => row.key));
export const GOAL_COMMITMENT_REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(GOAL_COMMITMENT_REFUSALS.map((row) => [row.key, row])));

/* ------------------------------------------------------- bounds and limits */

export const GOAL_COMMITMENT_LIMITS = Object.freeze({
  commitments: 4000,
  /** Inclusive window length, in days. A two-year "commitment" is a strategy. */
  windowMaxDays: 730,
  measureKeyMin: 2,
  measureKeyMax: 40,
  noteMax: 400,
  reasonMin: 8,
  reasonMax: 400,
  /** Owner rows the screen carries. The remainder is counted, never dropped. */
  ownerRowsShown: 40,
  pairRowsShown: 60,
  commitmentRowsShown: 40,
  asksPerCommit: 6,
});

export const GOAL_COMMITMENT_SETTING_KEYS = Object.freeze({
  askDueDays: 'goalCommitmentAskDueDays',
  horizonDays: 'goalCommitmentHorizonDays',
  minOverlapDays: 'goalCommitmentMinOverlapDays',
  minGoals: 'goalCommitmentMinGoals',
  autoPropagate: 'goalCommitmentAutoPropagate',
});

export const GOAL_COMMITMENT_DEFAULTS = Object.freeze({
  askDueDays: 3,
  horizonDays: 90,
  minOverlapDays: 5,
  minGoals: 3,
  autoPropagate: true,
});

export const GOAL_COMMITMENT_BOUNDS = Object.freeze({
  askDueDays: Object.freeze([1, 14]),
  horizonDays: Object.freeze([7, 365]),
  minOverlapDays: Object.freeze([1, 60]),
  minGoals: Object.freeze([2, 20]),
});

export const GOAL_COMMITMENT_SETTING_LABELS = Object.freeze({
  askDueDays: 'Days a conflict ask is due within',
  horizonDays: 'Days ahead the capacity sweep reads',
  minOverlapDays: 'Overlapping days before a collision becomes an ask',
  minGoals: 'Comparable goals required before an attribution rate is claimed',
  autoPropagate: 'Goal-commitment conflict automation (RULE-GCC-01)',
});

/**
 * The capacity basis, in the SAME unit the matrix engine already uses for a
 * declared line share: integer hundredths of one person, so 100 = one whole
 * person and `shareHToDisplay(100)` prints `1.00` (`normalizeShareH` bounds a
 * declared share to 0–100, matrixSchema.js).
 *
 * Deliberately the same unit and the same bound, for one reason: the per-line
 * reading compares a line's declared commitments against that line's OWN
 * declared share, and two figures in different units cannot be compared without
 * a conversion nobody wrote down. Declared effort therefore also runs 0–100.
 *
 * This is NOT an invented allocation — it is the definition of the unit. A
 * separately declared per-person commitment capacity (someone on 0.60 FTE, a
 * secondment, a reduced-hours agreement) does not exist in this workspace yet
 * and is logged In Progress; until it does, the whole-person basis is printed as
 * the basis on every figure measured against it.
 *
 * GRANULARITY, stated rather than hidden: one hundredth of a person is the
 * smallest declarable draw, which is the granularity the matrix share engine
 * already has. A commitment that consumes half a day a fortnight is declared as
 * 0 or as 4; the register prints the declared figure and never refines it.
 */
export const GOAL_COMMITMENT_PERSON_BASIS_H = 100;

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #145. Aggregate only: one workspace row, then one row per owner
 * verdict, per pair verdict, per commitment state, per capacity verdict, per
 * attribution state and per refusal. No person, manager, line, goal title,
 * measure key, note or record id reaches the file.
 */
export const GOAL_COMMITMENT_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'label', 'generated_on',
  'commitments_n', 'live_n', 'closed_n', 'unreachable_n', 'no_line_n',
  'owners_n', 'owners_compared_n', 'owners_inert_n', 'owners_undeclared_n',
  'pairs_n', 'pairs_cross_line_n', 'target_conflict_n', 'date_overlap_n', 'compatible_n', 'same_line_n', 'single_principal_n',
  'capacity_overcommit_n', 'capacity_fits_n', 'capacity_unmeasurable_n', 'line_share_undeclared_n',
  'peak_sum_h', 'peak_day', 'capacity_basis_h',
  'goals_comparable_n', 'goals_declared_n', 'goals_unattributed_n',
  'attribution_pct', 'attribution_low_pct', 'attribution_high_pct', 'attribution_withheld_reason',
  'horizon_days', 'min_overlap_days', 'min_goals', 'ask_due_days',
  'counts_reconcile', 'figures_complete', 'claim_reason', 'engine_version',
]);

export const GOAL_COMMITMENT_CSV_DESCRIPTOR = Object.freeze({
  key: GOAL_COMMITMENT_CSV_SCOPE,
  label: 'Cross-line goal commitment conflicts (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-goal-commitments',
  description: 'One identity-free workspace row plus one row per owner verdict, per pair verdict, per commitment state, per capacity verdict, per goal-attribution state and per refusal: commitments declared and closed, cross-line pairs, exact window collisions, opposed-target conflicts, the peak concurrent declared effort in integer hundredths against the whole-person basis, and the goal-attribution rate with its Wilson interval (BLANK with its reason below the declared floor — never zero). Contains NO person, manager, line, goal title, measure key, note or record id.',
});

/* ------------------------------------------------------------------ method */

export const GOAL_COMMITMENT_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'galbraith', label: 'Galbraith (1973), Designing Complex Organizations — lateral relations', says: 'A matrix creates lateral parties who share a resource and each hold their own objectives. Where the two objectives collide, the decision belongs to their lowest common apex, not to the shared person and not to whichever line shouts last.' }),
  Object.freeze({ key: 'cyert-march', label: 'Cyert & March (1963), A Behavioral Theory of the Firm — quasi-resolution of conflict', says: 'Organisations do not resolve goal conflict; they subdivide it, satisfice on it and let it reappear as friction later. Recording the collision when it is declared is the only point at which it can still be settled cheaply.' }),
  Object.freeze({ key: 'march-simon', label: 'March & Simon (1958) — a person is one capacity, however many principals hold it', says: 'Attention and time are the scarcest resources in an organisation and they are not divisible by declaration. Two promises that each fit separately can be jointly impossible, and that impossibility is arithmetic, not opinion.' }),
  Object.freeze({ key: 'kaplan-norton', label: 'Kaplan & Norton (1996), The Balanced Scorecard — cause-and-effect chains must not contradict', says: 'A strategy map in which two branches demand opposite movement on the same measure is not ambitious, it is incoherent. The contradiction is a property of the declared measures and directions, and is testable exactly.' }),
  Object.freeze({ key: 'drucker', label: 'Drucker (1954), The Practice of Management — objectives must be derived from the work, not imposed on it', says: 'An objective set by a line that does not hold the resource is a demand, not a plan. Naming the line a commitment is owed under is what turns a goal into something another manager can reason about.' }),
  Object.freeze({ key: 'senge', label: 'Senge (1990), The Fifth Discipline — the systems view of a shared resource', says: 'The person is the stock; the commitments are inflows from several sources. Reading the peak of concurrent inflow at its exact day is a stock-and-flow reading, and blaming one pair of inflows for a full stock is a systems error.' }),
]);

export const GOAL_COMMITMENT_METHOD = Object.freeze({
  unit: 'one dated commitment = one goal × one named reporting line (or an explicit `no-line`) × one inclusive window × one declared effort in integer hundredths of one person × an optional declared measure and direction',
  firstPerson: 'A commitment under a named line is declared by the holder of THAT line and by nobody else: not by a peer, not by the workspace leader on a line holder’s behalf, and not by a later holder of the same line. A commitment under `no-line` is declared by the person it is about or by the operator view — a manager cannot declare that somebody else’s goal is owed under no line, because that is how a commitment disappears.',
  pair: 'Every pair of live commitments on ONE owner is compared. Different lines and an inclusive window overlap of at least one day is a collision, and the exact number of overlapping days is printed. Same line is one principal’s own sequencing and is never routed upward. A `no-line` commitment has no second principal and is never called a conflict.',
  measure: 'A target conflict needs a DECLARED measure key and a DECLARED direction on both sides. Same key, different direction — including one line holding a measure steady while the other moves it — is opposed. A commitment that declares no measure is printed as declaring none, and nothing is read out of the goal’s title, description or key results.',
  capacity: 'Capacity is a stock, not a relation. A sweep line over every live window inside the declared horizon finds the exact day of maximum concurrent declared effort for that person, sums it in integer hundredths and compares it against one whole person, then separately against each line’s own declared share. Charging an overcommitted week to one pair of commitments would name a culprit the arithmetic does not support, so the two claims are printed and escalated apart.',
  attribution: 'Every live goal of a person on two or more lines is asked whether a line was ever named for it. One that was not is `unattributed`, counted, and NEVER charged to the home line — the home-line guess is precisely the failure this register exists to refuse.',
  escalation: 'An opposed-target collision is routed to the lowest joint apex of the two line holders; a capacity overcommit is routed to the lowest joint apex of every holder carrying a live commitment on that person at the peak day. Where the lines share no single apex, or the apex is the workspace leader, the register records one identity-free observation and asks nobody rather than inventing an owner.',
  notSaid: 'Nothing here scores a person, ranks a manager, rates a goal’s ambition or says one line’s need matters more. A commitment is a line’s stated promise, and an absence of declarations is printed as an absence — never as compatibility.',
});

export const GOAL_COMMITMENT_ASK_PREFIX = 'Goal commitment condition: ';
export const GOAL_COMMITMENT_CLOSED_PREFIX = `Closed by ${GOAL_COMMITMENT_RULE_ID}:`;
export const GOAL_COMMITMENT_MARKER_KIND = 'goal-commitment';

/** The two conditions `RULE-GCC-01` acts on. A bare window collision is printed, not escalated. */
export const GOAL_COMMITMENT_RULE_CONDITIONS = Object.freeze([
  Object.freeze({ key: 'target-conflict', label: 'Opposed targets on one person', says: 'Two lines committed the same person over at least the declared minimum of overlapping days and named the same measure in opposite directions.' }),
  Object.freeze({ key: 'capacity-overcommit', label: 'Concurrent effort over one person', says: 'On the exact peak day inside the declared horizon, the commitments this person carries add up to more than one whole person.' }),
]);
