/**
 * app/core/domain/goalAttainmentRegistry.js — the closed vocabulary of the Goal
 * Attainment Period Close & Restatement Register (ADR-0206, Session 274,
 * Schema v160, `RULE-GAR-01`, CSV scope #149, `#/matrix?panel=attainment`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. On the second working day of October a VP
 * reports the quarter that ended: *forty-two objectives fell due, thirty on
 * track, eight at risk, four off track.* Three weeks later the same screen, the
 * same dates, reads twenty-seven on track. Nothing improved and nothing worsened
 * — the record moved underneath the closed quarter: a check-in was filed late
 * but dated inside the period, a manager re-owned an objective to their own
 * span, a dropped objective was archived, and one due date was edited out of
 * September into October. The workspace has no idea that it once reported a
 * figure, so it cannot tell a leader whether the portfolio changed or the
 * paperwork did. Every OKR platform on the market recomputes history silently
 * for exactly this reason: it never froze the figure, so it has nothing to
 * restate.
 *
 * WHAT IS FROZEN. ONE closing act per declared period, performed by a human,
 * over a period that has already ENDED. The act records, per span, the
 * attainment bucket of every goal that fell due inside the period — the exact
 * count and the exact goal identities behind it, because a count without the
 * identities cannot be attributed when it moves. Nothing derived is stored: no
 * live figure, no verdict, no delta and no restatement signature. Every read
 * re-derives the same period from the record as it stands today and prints the
 * difference.
 *
 * WHY THE AS-OF STRUCTURE AND NOT TODAY'S CHART. A reorganisation in November
 * must not restate September's span figures — the September report was true of
 * September's structure. So the span a goal is counted in is resolved from the
 * recorded home-line ledger AS OF the period's last day (ADR-0149), never from
 * today's `managerId`. A re-organisation that moves a person AFTER the close is
 * therefore invisible to this register (correctly); a goal whose OWNER FIELD is
 * edited is not invisible — it is a restatement, because the record of who owns
 * it changed (ADR-0206).
 *
 * WHY THE HOME LINE AND NOT AN ALLOCATION. A goal carries one owner. Splitting
 * one objective across a person's additional matrix lines would manufacture an
 * allocation nobody agreed to, which the Matrix Leadership Mandate forbids
 * outright. A goal is counted ONCE, in its owner's recorded home-line span, and
 * a multi-line owner is PRINTED as such (`multi-line-owner`) rather than split.
 * The counts therefore never double-count a goal and never drop one, and adding
 * span totals is only permitted over disjoint spans — the register prints the
 * exception where spans nest.
 *
 * WHAT IT NEVER DOES. It never edits a goal, a check-in, a due date or an owner;
 * it never calls a restatement a failure or a person responsible for one; it
 * never infers attainment from a title, a note or prose; it never scores a
 * person or a span; and it never reports a rate below its declared evidence
 * floor.
 */

export const GOAL_ATTAINMENT_ENGINE_VERSION = 'goal-attainment-2026.11-v1';
export const GOAL_ATTAINMENT_ADR = 'ADR-0206';
export const GOAL_ATTAINMENT_RULE_ID = 'RULE-GAR-01';
export const GOAL_ATTAINMENT_ROUTE = 'matrix-attainment';
export const GOAL_ATTAINMENT_PANEL = 'attainment';
export const GOAL_ATTAINMENT_CSV_SCOPE = 'goal-attainment-closures';
export const GOAL_ATTAINMENT_MARKER_KIND = 'goal-attainment';

export const GOAL_ATTAINMENT_EVENTS = Object.freeze({
  CLOSED: 'goalAttainment.closed',
  ACKNOWLEDGED: 'goalAttainment.acknowledged',
  CONVENTIONS: 'goalAttainment.conventions.set',
  SCAN: 'goalAttainment.scan',
});
export const GOAL_ATTAINMENT_EVENT_PREFIX = 'goalAttainment.';

/**
 * Closing a period's reported figures is the act of the altitude that reports
 * them upward: director and above. Reading is open to every altitude so a
 * frontline manager can see what was reported about their span; governing the
 * ask window and running the scan is the same director-and-above window every
 * matrix register uses.
 */
export const GOAL_ATTAINMENT_RIGHTS = Object.freeze({
  READ: 'read-goal-attainment',
  CLOSE: 'close-goal-attainment',
  GOVERN: 'govern-goal-attainment',
});

/* ------------------------------------------------------------ vocabularies */

/**
 * The attainment buckets. Exhaustive and mutually exclusive: every goal due
 * inside a closed period lands in exactly one, and the bucket counts must add up
 * to the goal count or the closure is not printed.
 *
 * The bucket is the CONFIDENCE THE OWNER LAST RECORDED ON OR BEFORE THE PERIOD
 * END — the same declared word the goals screen reports upward — plus the dated
 * completion. It is deliberately not the pace-derived health: pace is a function
 * of "now", so a bucket built on it could never be frozen at all.
 */
export const GOAL_ATTAINMENT_BUCKETS = Object.freeze([
  Object.freeze({ key: 'achieved', label: 'Completed by the period end', tone: 'good', rank: 0, says: 'The goal carries a dated completion on or before the period’s last day.' }),
  Object.freeze({ key: 'on-track', label: 'On track', tone: 'good', rank: 1, says: 'The last check-in dated on or before the period end declared the goal on track.' }),
  Object.freeze({ key: 'at-risk', label: 'At risk', tone: 'warn', rank: 2, says: 'The last check-in dated on or before the period end declared the goal at risk.' }),
  Object.freeze({ key: 'off-track', label: 'Off track', tone: 'bad', rank: 3, says: 'The last check-in dated on or before the period end declared the goal off track.' }),
  Object.freeze({ key: 'no-checkin', label: 'Never checked in', tone: 'warn', rank: 4, says: 'No check-in was recorded on or before the period end. This is an absence of evidence, never a zero and never “on track”.' }),
  Object.freeze({ key: 'unknown-confidence', label: 'Confidence unreadable', tone: 'warn', rank: 5, says: 'A check-in exists on or before the period end but its recorded confidence is not one of the three declared words. The row is printed as unreadable rather than read as reassurance.' }),
  Object.freeze({ key: 'dropped', label: 'Dropped', tone: 'neutral', rank: 6, says: 'The goal was dropped before the period end. Counted so the buckets add up, and never presented as an achievement.' }),
]);
export const GOAL_ATTAINMENT_BUCKET_KEYS = Object.freeze(GOAL_ATTAINMENT_BUCKETS.map((row) => row.key));
export const GOAL_ATTAINMENT_BUCKET_BY_KEY = Object.freeze(Object.fromEntries(GOAL_ATTAINMENT_BUCKETS.map((row) => [row.key, row])));

/**
 * The verdict on ONE closed period, re-derived on every read. `faithful` and
 * `restated` are different claims; `acknowledged` is a third and is never folded
 * into either: the figures DID move and a human put their name to the new basis.
 * `unprovable` is a fourth: the period cannot be re-derived at all, so no delta
 * is claimed in either direction.
 */
export const GOAL_ATTAINMENT_VERDICTS = Object.freeze([
  Object.freeze({ key: 'faithful', label: 'Reproduces exactly', tone: 'good', rank: 0, says: 'Every goal due inside the period re-derives to the same bucket in the same span, with the same counts. The reported figure is still the computed figure.' }),
  Object.freeze({ key: 'acknowledged', label: 'Restated and acknowledged', tone: 'warn', rank: 1, says: 'The figures moved, and a dated written acknowledgement of THIS exact restatement is on the record. The restated basis stands as the accepted period fact; the original is still printed beside it.' }),
  Object.freeze({ key: 'restated', label: 'Restated — unacknowledged', tone: 'bad', rank: 2, says: 'The record no longer reproduces the figures that were reported for this period, and nobody has acknowledged the restated basis. The deltas are printed by cause.' }),
  Object.freeze({ key: 'unprovable', label: 'Cannot be re-derived', tone: 'bad', rank: 3, says: 'A goal due inside the period has an owner whose home line on the period’s last day is not on the recorded structure. No delta is claimed: a figure computed over the goals that happen to be attributable would read as complete and be wrong.' }),
]);
export const GOAL_ATTAINMENT_VERDICT_KEYS = Object.freeze(GOAL_ATTAINMENT_VERDICTS.map((row) => row.key));
export const GOAL_ATTAINMENT_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(GOAL_ATTAINMENT_VERDICTS.map((row) => [row.key, row])));

/**
 * Why a closed figure moved. Exhaustive and mutually exclusive per goal, so the
 * cause counts always add up to the number of goals whose attribution changed.
 * A goal can be both re-bucketed and re-spanned; that is its OWN cause, printed
 * apart, because collapsing it into either one would understate what moved.
 */
export const GOAL_ATTAINMENT_CAUSES = Object.freeze([
  Object.freeze({ key: 'added', label: 'Added to the period', tone: 'warn', says: 'A goal now falls due inside the period that the closure did not carry: it was created later with a due date inside the period, or its due date was moved into the period after the close.' }),
  Object.freeze({ key: 'removed', label: 'Left the period', tone: 'warn', says: 'A goal the closure carried no longer falls due inside the period, or no longer exists: its due date was moved out, or the objective was deleted.' }),
  Object.freeze({ key: 'bucket-changed', label: 'Attainment moved', tone: 'bad', says: 'The same goal, in the same span, now re-derives to a different bucket — a check-in was filed late with a date inside the period, an existing check-in was edited or removed, or a completion was recorded.' }),
  Object.freeze({ key: 'span-moved', label: 'Moved span', tone: 'warn', says: 'The same goal, in the same bucket, is now counted in a different span because its recorded owner changed. A reorganisation after the close does NOT move it: spans are read as of the period end.' }),
  Object.freeze({ key: 'bucket-and-span-changed', label: 'Moved and attainment changed', tone: 'bad', says: 'The goal moved span AND its bucket moved. Both facts are true, so they are printed together rather than ranked.' }),
]);
export const GOAL_ATTAINMENT_CAUSE_KEYS = Object.freeze(GOAL_ATTAINMENT_CAUSES.map((row) => row.key));
export const GOAL_ATTAINMENT_CAUSE_BY_KEY = Object.freeze(Object.fromEntries(GOAL_ATTAINMENT_CAUSES.map((row) => [row.key, row])));

/** What the reader refused to print, and why. Refusals are counted, never dropped. */
export const GOAL_ATTAINMENT_REFUSALS = Object.freeze([
  Object.freeze({ key: 'structure-unproven', says: 'A goal due inside the period belongs to somebody whose home line on the period’s last day is not on the recorded structure. Today’s pointer is not evidence about that day, so the whole period refuses rather than reporting over the attributable part.' }),
  Object.freeze({ key: 'ownerless', says: 'A goal due inside the period names no owner (a team objective). It is counted apart and never charged to a span.' }),
  Object.freeze({ key: 'undated', says: 'A goal carries no readable due date, so it belongs to no period. Counted, never placed by inference.' }),
  Object.freeze({ key: 'multi-line-owner', says: 'The owner held more than one reporting line at the period end. The goal is counted ONCE, in the home line, and is not split across lines — an allocation nobody agreed to would be invented by doing so.' }),
  Object.freeze({ key: 'below-disclosure', says: 'This seat’s disclosure level withholds the named rows (and counts below the declared floor). Totals are printed; the rows are counted, not shown.' }),
  Object.freeze({ key: 'truncated', says: 'More closures or spans exist than this screen lists. The totals count all of them; the remainder is counted, not shown.' }),
  Object.freeze({ key: 'invalid-ledger', says: 'Rows in the attainment ledger could not be read exactly and were dropped with a counted warning. Nothing was repaired into plausibility.' }),
  Object.freeze({ key: 'not-reconciled', says: 'A closure’s bucket counts do not add up to its goal count. The closure refuses its figures rather than printing a total that cannot be reproduced from the rows beneath it.' }),
]);
export const GOAL_ATTAINMENT_REFUSAL_KEYS = Object.freeze(GOAL_ATTAINMENT_REFUSALS.map((row) => row.key));
export const GOAL_ATTAINMENT_REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(GOAL_ATTAINMENT_REFUSALS.map((row) => [row.key, row])));

/* ------------------------------------------------------- bounds and limits */

export const GOAL_ATTAINMENT_LIMITS = Object.freeze({
  /** Closing acts kept. Append-only and never pruned by the reader. */
  closures: 500,
  /** Notes (written acknowledgements) kept. */
  notes: 4000,
  /** Stored rows a single closing act may carry. */
  goalsPerClosure: 4000,
  spansPerClosure: 400,
  closureRowsShown: 24,
  spanRowsShown: 24,
  noteRowsShown: 12,
  labelMin: 2,
  labelMax: 80,
  reasonMin: 8,
  reasonMax: 500,
  /** The longest period one closing act may declare, in inclusive days. */
  periodMaxDays: 400,
  /** Goals a closing act will accept; a period larger than this is not one report. */
  asksPerCommit: 4,
});

export const GOAL_ATTAINMENT_SETTING_KEYS = Object.freeze({
  askDueDays: 'goalAttainmentAskDueDays',
  autoPropagate: 'goalAttainmentAutoPropagate',
});

export const GOAL_ATTAINMENT_DEFAULTS = Object.freeze({
  askDueDays: 7,
  autoPropagate: true,
});

export const GOAL_ATTAINMENT_BOUNDS = Object.freeze({
  askDueDays: Object.freeze([1, 30]),
});

export const GOAL_ATTAINMENT_SETTING_LABELS = Object.freeze({
  askDueDays: 'Days a restatement ask is due within',
  autoPropagate: 'Goal-attainment restatement automation (RULE-GAR-01)',
});

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #149. Aggregate only: one workspace row, one row per closure, one
 * row per span slice. No person, no manager, no span name, no goal id, no goal
 * title, no label, no note or reason text — a span is exported as `S01`. A
 * withheld figure exports BLANK with its reason, never zero.
 */
export const GOAL_ATTAINMENT_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'period_from', 'period_to', 'generated_on',
  'closures_n', 'faithful_n', 'restated_n', 'acknowledged_n', 'unprovable_n',
  'spans_n', 'goals_n', 'ownerless_n', 'multi_line_n', 'undated_n',
  'achieved_n', 'on_track_n', 'at_risk_n', 'off_track_n', 'no_checkin_n', 'unknown_confidence_n', 'dropped_n',
  'restated_spans_n', 'restated_goals_n', 'added_n', 'removed_n', 'bucket_changed_n', 'span_moved_n', 'bucket_and_span_changed_n',
  'notes_n', 'unacknowledged_n', 'frozen_n', 'live_n', 'delta_n',
  'ask_due_days', 'counts_reconcile', 'figures_complete', 'claim_reason', 'engine_version',
]);

export const GOAL_ATTAINMENT_CSV_DESCRIPTOR = Object.freeze({
  key: GOAL_ATTAINMENT_CSV_SCOPE,
  label: 'Goal attainment period close and restatements (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'goal-attainment-closures',
  description: 'One identity-free workspace row, one row per closed period and one row per span slice: goals that fell due inside the period, their frozen attainment buckets, whether the period still reproduces those figures, and — when it does not — the exact goal count by cause (added, removed, attainment moved, moved span, both). Contains NO person, manager, span name, goal id, goal title, period label, note or reason text; a span is exported as a positional code and a withheld figure exports BLANK with its reason, never zero.',
});

/* ------------------------------------------------------------------ method */

export const GOAL_ATTAINMENT_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'ias-8', label: 'IAS 8 / ASC 250 — prior-period adjustment and restatement', says: 'A figure that was reported is not silently recomputed when its inputs change: it is kept as originally reported, the changed basis is printed beside it with its cause, and an error is corrected by restatement rather than by overwriting the closed period. This register is that control applied to a goal portfolio rather than to a set of accounts.' }),
  Object.freeze({ key: 'coso', label: 'COSO (2013) principle 10 — period-end control over reported information', says: 'The organisation selects and develops control activities over the capture and reporting of information. A closing act that freezes the reported figure and a dated acknowledgement of any later change are the two controls the period-end process needs; without them the report is a screen, not a fact.' }),
  Object.freeze({ key: 'kaplan-norton', label: 'Kaplan & Norton (1996) — the scorecard must be comparable over time', says: 'A strategy report whose history silently rewrites itself cannot support a learning loop: every quarter looks like a different quarter because the denominator moved. Freezing the reported figure is what makes a trend a trend.' }),
  Object.freeze({ key: 'witowski', label: 'Witowski, T. et al. on data provenance — freeze the derived figure, not the raw record', says: 'An aggregate re-derived from live records is not a historical fact about the aggregate; it is a fact about today applied to an old date. A closure stores the derived figure and the identities behind it, so a later difference can be attributed instead of merely noticed.' }),
  Object.freeze({ key: 'deming', label: 'Deming (1986) — management by the process, not by the number', says: 'A restated number is a signal about the recording process, not about the people who reported it. The register attributes every change to a record act, and never to a person or a span.' }),
]);

export const GOAL_ATTAINMENT_METHOD = Object.freeze({
  unit: 'one closing act = one declared, already-ended period × the attainment bucket of every goal due inside it × the span that goal’s owner held on the period’s last recorded day. Nothing derived is stored.',
  population: 'The population is every goal whose DUE DATE falls inside the declared period, inclusive. A goal with no readable due date belongs to no period and is counted apart; a goal that was created after the period is still in it if its due date says so — that is exactly the case a close must catch.',
  bucket: 'The bucket is (1) `achieved` where a dated completion falls on or before the period end, (2) `dropped` where the goal was dropped before it, else (3) the confidence recorded by the LAST check-in dated on or before the period end. No check-in is `no-checkin`; an unreadable confidence is `unknown-confidence`. Pace-derived health is never used because pace is a function of today.',
  structure: 'The span a goal is counted in is the owner’s home line AS RECORDED on the period’s last day (ADR-0149), never today’s pointer. A reorganisation after the close therefore does not restate the period; an edit to the goal’s own owner field does, because the record of who owns it changed.',
  matrix: 'A goal is counted exactly once, in the owner’s home line. A person’s additional reporting lines never receive a share of it: splitting one objective across lines would invent an allocation no human agreed to. A multi-line owner is printed and counted (`multi-line-owner`); a leader-owned goal sits in the leader’s own span; an ownerless team goal is counted apart and never charged to a span.',
  restatement: 'Every read re-derives the same period from the record as it stands and compares it with the frozen set goal by goal. The difference is printed by cause and by span, and fingerprinted. A written acknowledgement of THAT fingerprint is a dated human decision that the restated basis stands; a different fingerprint is a different restatement and needs its own acknowledgement. A restatement that disappears (the record was repaired) prints the fix as history rather than as cover.',
  refusal: 'Where a goal’s owner has no recorded home line on the period end, the period refuses entirely (`unprovable`): an aggregate over the attributable part would read as complete and be wrong. A closure whose bucket counts do not add up to its goal count refuses in the same way.',
  notSaid: 'Nothing here rates a person, a manager or a span, calls a restatement an error by anyone, or infers attainment from a goal’s title, description or prose. A restatement is a fact about the record, and the register charges it to the record.',
});

export const GOAL_ATTAINMENT_ASK_PREFIX = 'Goal-attainment restatement: ';
export const GOAL_ATTAINMENT_CLOSED_PREFIX = `Closed by ${GOAL_ATTAINMENT_RULE_ID}:`;

/** The one condition `RULE-GAR-01` acts on. Nothing else is escalated. */
export const GOAL_ATTAINMENT_RULE_CONDITIONS = Object.freeze([
  Object.freeze({
    key: 'restated-period',
    label: 'A reported period no longer reproduces',
    says: 'A closed period re-derives to different figures than the ones that were reported, and no dated acknowledgement of this exact restatement is on the record.',
  }),
]);
