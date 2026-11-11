/**
 * app/core/domain/workTurnRegistry.js — vocabulary for the Non-Promotable Work
 * Turn Ledger (ADR-0181, Schema v144, `RULE-NPW-01`, CSV scope #135,
 * `#/matrix?panel=turns`).
 *
 * STATUS (Session 247, 2026-11-11): SHIPPED — Schema v144, RULE-NPW-01, CSV #135
 * and `#/matrix?panel=turns` are wired end to end.
 *
 * THE DUTY. Every team runs on work that has to be done and gets nobody
 * promoted: taking the notes, onboarding the new starter, organising the
 * offsite, sitting on the committee, chasing the action list. A frontline
 * manager hands that work out one ask at a time, and each ask is reasonable.
 * What the manager is accountable for is the PATTERN — whether the same person
 * is asked every time — and nothing in the workspace has ever shown it to them.
 *
 * In a matrix the pattern is invisible by construction. The functional manager
 * asked once and the project manager asked once; each of them took a fair turn
 * from where they sit, and the shared contributor is carrying the housework of
 * two teams. Neither manager can see it, and the seat above both only learns
 * about it when that person's promotable work stops moving.
 *
 * Frameworks applied (named, not paraphrased):
 *  - Low-promotability tasks (Babcock, Recalde, Vesterlund & Weingart, 2017,
 *    American Economic Review 107(3); Babcock, Peyser, Vesterlund & Weingart,
 *    2022, "The No Club"): work that benefits the organisation and does not
 *    advance the person who does it is asked of, and accepted by, the same
 *    people. The remedy the authors test is ROTATION — taking turns — not
 *    goodwill and not a volunteer call.
 *  - The volunteer's dilemma (Diekmann, 1985): when a task needs exactly one
 *    volunteer and everyone gains if somebody does it, each person waits. The
 *    person with the lowest tolerance for the wait does it, every time. A turn
 *    list removes the dilemma.
 *  - Multi-principal agency (Holmström & Milgrom, 1991): two principals who
 *    each observe only their own asks jointly over-ask one agent. A turn
 *    computed per manager is blind to the sum; the sum is read per person.
 *  - Distributive and procedural justice (Adams, 1965; Leventhal, 1980): the
 *    bar is consistency of the allocation rule, which is why the ledger grades
 *    the manager's allocation and never the person who carried the work.
 *
 * Leaf module: imports nothing, so schema, read model, rule, actions, CSV and
 * view can all depend on it without a cycle.
 */

export const WORK_TURN_RULE_ID = 'RULE-NPW-01';
export const WORK_TURN_ADR = 'ADR-0181';

export const WORK_TURN_EVENTS = Object.freeze({
  CLASSIFIED: 'work.turn.classified',
  SCAN: 'work.turn.scan',
  CONVENTIONS: 'work.turn.conventions',
});

export const WORK_TURN_RIGHTS = Object.freeze({
  CLASSIFY: 'classify-work-turn',
  GOVERN: 'govern-work-turns',
});

/**
 * What a human declared an ask to be. Closed. There is deliberately no third
 * stored kind: an ask nobody has classified is `unclassified` on read, which is
 * a different fact from "somebody looked and it advances the person".
 */
export const WORK_TURN_KINDS = Object.freeze(['non-promotable', 'promotable']);
export const WORK_TURN_KIND_LABELS = Object.freeze({
  'non-promotable': 'Non-promotable',
  promotable: 'Promotable',
});

export const WORK_TURN_LIMITS = Object.freeze({
  acts: 5000,
  markers: 2000,
  idMax: 80,
  asksPerCommit: 8,
  askRows: 200,
});

export const WORK_TURN_DEFAULTS = Object.freeze({
  windowDays: 90,
  minAsks: 4,
  factorPct: 200,
  askDueDays: 7,
  autoPropagate: true,
});

/** Inclusive `[min, max]` bounds. The setter REFUSES outside them; the loader clamps. */
export const WORK_TURN_BOUNDS = Object.freeze({
  windowDays: Object.freeze([28, 365]),
  minAsks: Object.freeze([2, 50]),
  factorPct: Object.freeze([125, 500]),
  askDueDays: Object.freeze([1, 30]),
});

/** Convention name → the settings key it is stored under. One table, read by the schema, the setter and the view. */
export const WORK_TURN_SETTING_KEYS = Object.freeze({
  windowDays: 'workTurnWindowDays',
  minAsks: 'workTurnMinAsks',
  factorPct: 'workTurnFactorPct',
  askDueDays: 'workTurnAskDueDays',
  autoPropagate: 'workTurnAutoPropagate',
});

export const WORK_TURN_SETTING_LABELS = Object.freeze({
  windowDays: 'Look-back window (days)',
  minAsks: 'Fewest non-promotable asks before any pattern is claimed',
  factorPct: 'Over-turn threshold (% of a fair turn)',
  askDueDays: 'Days allowed for a rotation ask',
  autoPropagate: 'Issue rotation asks automatically',
});

/** One class per ask read. Closed, in print order. The three counts reconcile to the asks read. */
export const WORK_TURN_CLASSES = Object.freeze(['non-promotable', 'promotable', 'unclassified']);
export const WORK_TURN_CLASS_LABELS = Object.freeze({
  'non-promotable': 'Non-promotable',
  promotable: 'Promotable',
  unclassified: 'Not classified',
});
export const WORK_TURN_CLASS_REASONS = Object.freeze({
  'non-promotable': 'A recorded act declares this ask as work that has to be done and does not advance the person who does it.',
  promotable: 'A recorded act declares this ask as work that advances the person who does it.',
  unclassified: 'Nothing records what kind of work this ask is. It is REFUSED a kind rather than guessed from its title.',
});

/** One placement per non-promotable ask. Closed, in print order. */
export const WORK_TURN_PLACEMENTS = Object.freeze(['attributed', 'sole-line', 'unplaced', 'stale']);
export const WORK_TURN_PLACEMENT_LABELS = Object.freeze({
  attributed: 'On a named line',
  'sole-line': 'Single line (derived)',
  unplaced: 'On no line',
  stale: 'Line no longer held',
});
export const WORK_TURN_PLACEMENT_REASONS = Object.freeze({
  attributed: 'A recorded attribution (ADR-0178) names one of the lines this person actively holds, so the ask is charged to that manager’s pool.',
  'sole-line': 'The person holds exactly one reporting line, so the ask can only have come down it. Derived by arithmetic; nothing is stored.',
  unplaced: 'The person holds two or more reporting lines, or none that can be read, and nothing records which line handed this ask over. It is charged to NO pool rather than guessed onto one.',
  stale: 'A recorded attribution names a line this person no longer holds, or whose manager has changed. It is charged to no current pool and is never re-pointed.',
});

/** One state per manager pool read. Closed, in precedence order. */
export const WORK_TURN_POOL_STATES = Object.freeze(['partial', 'below-floor', 'share-undeclared', 'concentrated', 'even']);
export const WORK_TURN_POOL_STATE_LABELS = Object.freeze({
  partial: 'Partly outside this seat',
  'below-floor': 'Too few asks to read',
  'share-undeclared': 'A share is not declared',
  concentrated: 'One person carries the turn',
  even: 'Turns are spread',
});
export const WORK_TURN_POOL_STATE_REASONS = Object.freeze({
  partial: 'At least one person this manager holds is outside the reading seat, so the pool’s total is not known here. A turn computed over part of a pool could flatter or accuse; it is refused.',
  'below-floor': 'The pool has fewer than two people, or fewer non-promotable asks in the window than the declared floor. No pattern is claimed from that few.',
  'share-undeclared': 'At least one person in the pool is split across lines with a share missing, so nobody’s fair turn on this line can be computed. Nothing is split evenly.',
  concentrated: 'At least one person carries two or more of the pool’s non-promotable asks AND at least the declared multiple of their share-weighted fair turn.',
  even: 'Every person is below the declared multiple of their share-weighted fair turn.',
});

/** One verdict per person read. Closed, in precedence order. */
export const WORK_TURN_VERDICTS = Object.freeze(['unplaced', 'over-turn', 'unread', 'stacked', 'within']);
export const WORK_TURN_VERDICT_LABELS = Object.freeze({
  unplaced: 'An ask is on no line',
  'over-turn': 'Over a fair turn on a line',
  unread: 'A pool could not be read',
  stacked: 'Stacked across lines',
  within: 'Within a fair turn',
});
export const WORK_TURN_VERDICT_REASONS = Object.freeze({
  unplaced: 'At least one of this person’s non-promotable asks is on no readable line, so the line-by-line reading is refused for them.',
  'over-turn': 'In at least one manager’s pool this person carries two or more non-promotable asks and at least the declared multiple of their fair turn.',
  unread: 'This person carries two or more non-promotable asks and at least one pool they sit in could not be read from this seat — it is held outside the seat, partly outside it, or a share in it is missing. Neither test was completed for them, so neither verdict is claimed.',
  stacked: 'Every pool this person sits in was read and none is over a fair turn with them. Non-promotable asks came down two or more of their lines; in sum they carry two or more and at least the declared multiple of the per-person average. Each manager took a fair turn; the sum is not one.',
  within: 'No non-promotable ask in the window, only one (no test can be met by one ask), or none of the tests above is met.',
});

/** Where a finding lands. Closed. */
export const WORK_TURN_OWNER_STATES = Object.freeze(['unique', 'leader-held', 'ambiguous', 'off-roster']);
export const WORK_TURN_OWNER_LABELS = Object.freeze({
  unique: 'One owning seat',
  'leader-held': 'Held only by the workspace leader',
  ambiguous: 'No single covering seat',
  'off-roster': 'Owning seat not on the roster',
});

export const WORK_TURN_FINDING_KINDS = Object.freeze(['pool', 'stack']);
export const WORK_TURN_FINDING_LABELS = Object.freeze({
  pool: 'A pool concentrates its turns',
  stack: 'A person is stacked across lines',
});

/** How much of the reading a seat is shown. Mirrors the altitude disclosure ladder (`chainRegistry.js`). */
export const WORK_TURN_DETAIL_LEVELS = Object.freeze(['visible', 'leaders', 'none']);
export const WORK_TURN_DETAIL_REASONS = Object.freeze({
  visible: '',
  leaders: 'This seat reads leaders by name and people as counts. Each pool is listed with its manager. A pool’s members, a person row, an ask or the names in a finding are shown only where everyone named leads a line of their own; the rest are counted above and withheld.',
  none: 'This seat reads counts only. Pools, people and asks are withheld; every figure above is computed over the whole of this seat’s span.',
});

export const WORK_TURN_RULE_RELATIONS = Object.freeze(['issues-obligation', 'rolls-up-to']);

export const WORK_TURN_METHOD = Object.freeze([
  'A classification is a dated, append-only act by a manager who reaches the person, declaring ONE ask as non-promotable or promotable. The latest act per ask is the effective one. It is never inferred from a title, a role, a team or who the person is, and the person is never asked to classify their own ask.',
  'The reading covers asks handed over inside the declared look-back window that are open or done. An ask that was handed back is counted apart and carried by nobody. An ask an automation rule issued — one carrying a rule’s obligation link, or a rule identifier in its support note — is counted apart: it is not a manager’s choice of person.',
  'A non-promotable ask is charged to the pool of the manager whose line it came down: the recorded attribution (ADR-0178) when it names a line the person still holds, or the person’s only line. On a person with two or more lines and no attribution it is charged to NO pool.',
  'A pool is one manager and every person they hold on an active line, home or additional. A person’s fair turn in a pool is the pool’s total × their declared share on that line ÷ the pool’s total share — in exact integers. Someone who gives a line a fifth of their time owes it a fifth of a turn.',
  'A person is over a fair turn when they carry two or more of the pool’s asks AND asks × total share × 100 ≥ threshold % × pool total × their share — one integer comparison, no rounding. A pool below the declared floor, with one person, with a share missing, or partly outside the reading seat makes NO claim.',
  'A person on two or more lines is stacked when every pool they sit in was read, none is over a fair turn with them, non-promotable asks came down two or more of their lines, and in sum they carry two or more asks AND asks × people read × 100 ≥ threshold % × all non-promotable asks read — tested only once the non-promotable asks read reach the declared floor. This is the finding only a matrix has. When someone carries two or more asks and one of their pools cannot be read, they read “a pool could not be read”, never “within”.',
  'The next turn in a pool is the person, or the tied people, with the lowest carried-to-share ratio. A tie is printed as a tie; nobody is picked.',
  'RULE-NPW-01 puts one dated rotation ask in front of the manager of a concentrated pool, and one in front of the single seat above every line a stacked person holds, at most once per finding, and closes its own ask when the reading clears. An owner that is the workspace leader, off the roster, or tied between two incomparable seats is recorded as an observation; nobody is substituted.',
  'This ledger grades the ALLOCATION a manager made. It stores no rating of any person, no reason an ask was accepted, and no personal characteristic of anyone.',
]);

export const WORK_TURN_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope', 'detail_level',
  'window_from', 'window_to', 'window_days', 'min_asks', 'factor_pct',
  'asks_in_window', 'asks_not_read', 'asks_returned', 'asks_rule_issued', 'asks_read', 'population_reconciles',
  'asks_non_promotable', 'asks_promotable', 'asks_unclassified', 'classes_reconcile',
  'npt_attributed', 'npt_sole_line', 'npt_unplaced', 'npt_stale', 'placements_reconcile',
  'people_read', 'carriers',
  'verdict_unplaced', 'verdict_over_turn', 'verdict_unread', 'verdict_stacked', 'verdict_within', 'verdicts_reconcile',
  'pools_read', 'pool_partial', 'pool_below_floor', 'pool_share_undeclared', 'pool_concentrated', 'pool_even', 'pools_reconcile',
  'findings', 'findings_pool', 'findings_stack',
  'owner_unique', 'owner_leader_held', 'owner_ambiguous', 'owner_off_roster', 'owners_reconcile',
  'open_rotation_asks', 'ask_due_days',
]);

export const WORK_TURN_CSV_DESCRIPTOR = Object.freeze({
  key: 'work-turns',
  label: 'Non-promotable work turns (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'work-turns',
  description: 'One summary row for the asks the acting seat may read inside the declared look-back window: how they divide between handed back, issued by automation and read (reconciled to the asks in the window); how the asks read divide between non-promotable, promotable and not classified (reconciled separately); how the non-promotable asks are placed on a named line, a single derived line, no line and a line no longer held (reconciled separately); how many people read under each of the five verdicts (reconciled separately); how many manager pools read under each of the five states (reconciled separately); how many findings there are and where each one lands (reconciled separately); and how many rotation asks are open. NO person, NO manager, NO ask title and NO free text.',
});
