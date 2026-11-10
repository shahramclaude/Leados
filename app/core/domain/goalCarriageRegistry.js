/**
 * app/core/domain/goalCarriageRegistry.js — closed vocabulary, limits, CSV
 * schema and named method of the Matrix Goal Carriage & Attainment
 * Reconciliation Register.
 *
 * STATUS — IN PROGRESS, NOT WIRED (Session 224). This file and
 * `goalCarriageSchema.js` are the only parts that exist. Nothing in the app
 * imports them: there is no reader, no action, no post-commit rule, no panel,
 * no CSV scope and no schema migration. `SCHEMA_VERSION` is still 131 and
 * ADR-0163 has not been written. Every identifier below — `RULE-GCA-01`, the
 * event and right names, the `goal-carriage` CSV key, the "Schema v132"
 * collections — is RESERVED for that work and is not live. The method and
 * limits texts describe the intended design; none of it is enforced yet.
 * Remove this note when the register ships.
 *
 * Leaf module: no storage, clock or DOM, so `schema.js`, the pure reader, the
 * rule, the actions, `csv.js` and the panel can all read ONE vocabulary.
 *
 * The question this register exists to answer is the one a goal's single
 * `ownerId` cannot: when the owner reports on more than one line, WHICH spans
 * does the goal count in, and what happens to an attainment figure when a
 * leader adds the branches below them together?
 */

export const GOAL_CARRIAGE_ENGINE_VERSION = 'goal-carriage-2026.11-v1';
export const GOAL_CARRIAGE_RULE_ID = 'RULE-GCA-01';

export const GOAL_CARRIAGE_EVENTS = Object.freeze({
  STATE: 'goal.carriage.stated',
  WITHDRAW: 'goal.carriage.withdrawn',
  SCAN: 'goal.carriage.scan',
});

export const GOAL_CARRIAGE_RIGHTS = Object.freeze({
  STATE: 'state-goal-carriage',
});

/**
 * What a line's own manager may say about a goal, in the first person, for the
 * line they hold. `withdrawn` takes a previous statement back and returns the
 * line to silence; it is stored as its own act because the ledger is
 * append-only and a deleted statement is a statement nobody can audit.
 */
export const GOAL_CARRIAGE_STANCES = Object.freeze(['carries', 'releases', 'withdrawn']);
export const GOAL_CARRIAGE_LIVE_STANCES = Object.freeze(['carries', 'releases']);

export const GOAL_CARRIAGE_STANCE_LABELS = Object.freeze({
  carries: 'Carries',
  releases: 'Released',
  silent: 'Has not answered',
});

export const GOAL_CARRIAGE_LIMITS = Object.freeze({
  /** Append-only stance ledger bound (oldest evicted first, counted on write). */
  acts: 1200,
  /** RULE-GCA-01 idempotency marker bound. */
  markers: 400,
  /** Goal rows printed on the register; the remainder is counted, never hidden. */
  goalRows: 60,
  /** Span rows printed in the reconciliation; the remainder is counted. */
  spanRows: 40,
  basisMin: 8,
  basisMax: 300,
  /** Dated asks RULE-GCA-01 may issue in ONE transaction; the rest is deferred and counted. */
  asksPerCommit: 8,
});

export const GOAL_CARRIAGE_BOUNDS = Object.freeze({
  /**
   * Days a line manager is given to answer the ask. A DECLARED convention —
   * two working weeks — printed on the panel; it is not a measured optimum.
   */
  askDays: 14,
});

/**
 * Closed carriage states, worst first. Every active goal resolves to exactly
 * one; the nine counts add up to the active goals in view or the register
 * prints that they do not.
 */
export const GOAL_CARRIAGE_STATES = Object.freeze([
  Object.freeze({
    key: 'unplaced',
    label: 'Owner off the roster',
    tone: 'bad',
    multiLine: false,
    settled: false,
    hint: 'The goal names an owner who is not on the active roster. It reaches no span at all, so it is counted at the workspace level and never dropped.',
  }),
  Object.freeze({
    key: 'unanchored',
    label: 'Owner has no readable line',
    tone: 'bad',
    multiLine: false,
    settled: false,
    hint: 'The owner is on the roster but no reporting line could be read for them — the roster line was refused as a defect. The goal stays with its owner and is counted at the workspace level.',
  }),
  Object.freeze({
    key: 'release-pending',
    label: 'Released, nobody carries',
    tone: 'bad',
    multiLine: true,
    settled: false,
    hint: 'At least one line released the goal and no line has said it carries it. A release takes effect only when another line carries, so every line still carries it.',
  }),
  Object.freeze({
    key: 'unattributed',
    label: 'Unattributed',
    tone: 'warn',
    multiLine: true,
    settled: false,
    hint: 'The owner is on more than one line and no line has stated whether it carries this goal. It counts in every line’s span.',
  }),
  Object.freeze({
    key: 'open',
    label: 'One line answered',
    tone: 'warn',
    multiLine: true,
    settled: false,
    hint: 'At least one line states that it carries the goal and at least one other line has not answered. A silent line still carries it — nobody takes a goal off another line’s scorecard by claiming it.',
  }),
  Object.freeze({
    key: 'joint',
    label: 'Declared joint',
    tone: 'neutral',
    multiLine: true,
    settled: true,
    hint: 'Two or more lines each state that they carry the goal and every other line released it. It counts once in each carrying span — a declared overlap that a span above both must not add.',
  }),
  Object.freeze({
    key: 'attributed',
    label: 'Attributed',
    tone: 'good',
    multiLine: true,
    settled: true,
    hint: 'Exactly one line states that it carries the goal and every other line released it.',
  }),
  Object.freeze({
    key: 'single-line',
    label: 'Single line',
    tone: 'good',
    multiLine: false,
    settled: true,
    hint: 'The owner reports on one line. There is no attribution question.',
  }),
  Object.freeze({
    key: 'leader-owned',
    label: 'Leader-owned',
    tone: 'neutral',
    multiLine: false,
    settled: true,
    hint: 'The goal names no owner; it is the workspace leader’s own.',
  }),
]);

export const GOAL_CARRIAGE_STATE_KEYS = Object.freeze(GOAL_CARRIAGE_STATES.map((s) => s.key));
const STATE_BY_KEY = new Map(GOAL_CARRIAGE_STATES.map((s) => [s.key, s]));
const STATE_RANK = new Map(GOAL_CARRIAGE_STATES.map((s, index) => [s.key, index]));

export function goalCarriageStateMeta(key) {
  return STATE_BY_KEY.get(String(key || '').trim()) || null;
}
export function goalCarriageStateRank(key) {
  const rank = STATE_RANK.get(key);
  return typeof rank === 'number' ? rank : STATE_RANK.size;
}

/** The multi-line states in which a line manager's answer is still owed. */
export const GOAL_CARRIAGE_UNSETTLED_STATES = Object.freeze(
  GOAL_CARRIAGE_STATES.filter((s) => s.multiLine && !s.settled).map((s) => s.key),
);

/**
 * Why a goal arrives at a span through more than one branch. A multiply
 * counted goal is classified by ITS OWN carriage first, so a count that a
 * stance could settle is never filed under structure.
 */
export const GOAL_CARRIAGE_CAUSES = Object.freeze([
  Object.freeze({
    key: 'unsettled',
    label: 'Unsettled carriage',
    hint: 'The goal is carried on more than one of its owner’s lines, and at least one of those lines has not stated that it carries it.',
  }),
  Object.freeze({
    key: 'declared-joint',
    label: 'Declared joint',
    hint: 'Every line that carries the goal has stated that it does.',
  }),
  Object.freeze({
    key: 'upstream-structure',
    label: 'Structure above the owner',
    hint: 'The goal is carried on one line; a manager above its owner reports on more than one line and those lines re-join at this span. No stance can settle this.',
  }),
]);
export const GOAL_CARRIAGE_CAUSE_KEYS = Object.freeze(GOAL_CARRIAGE_CAUSES.map((c) => c.key));

/** A span's reconciliation reading, worst first. */
export const GOAL_CARRIAGE_SPAN_STATES = Object.freeze([
  Object.freeze({ key: 'refused', label: 'Refused', tone: 'bad', hint: 'A reporting-line defect sits inside this span, so the carried figures are withheld rather than computed over the lines that could be read.' }),
  Object.freeze({ key: 'unsettled', label: 'Unsettled double count', tone: 'warn', hint: 'Adding the branches counts at least one goal more than once, and at least one of those goals has no settled carriage.' }),
  Object.freeze({ key: 'structural', label: 'Structural double count', tone: 'warn', hint: 'Adding the branches counts at least one goal more than once because of the reporting structure above its owner.' }),
  Object.freeze({ key: 'declared', label: 'Declared overlap only', tone: 'neutral', hint: 'Every goal the branches count more than once is a declared joint goal.' }),
  Object.freeze({ key: 'clean', label: 'Adds up', tone: 'good', hint: 'Every goal reaches this span through exactly one branch; adding the branches gives the distinct count.' }),
]);
const SPAN_STATE_BY_KEY = new Map(GOAL_CARRIAGE_SPAN_STATES.map((s) => [s.key, s]));
const SPAN_STATE_RANK = new Map(GOAL_CARRIAGE_SPAN_STATES.map((s, index) => [s.key, index]));
export function goalCarriageSpanStateMeta(key) {
  return SPAN_STATE_BY_KEY.get(key) || SPAN_STATE_BY_KEY.get('clean');
}
export function goalCarriageSpanStateRank(key) {
  const rank = SPAN_STATE_RANK.get(key);
  return typeof rank === 'number' ? rank : SPAN_STATE_RANK.size;
}

export const GOAL_CARRIAGE_DIRECTIONS = Object.freeze({
  overstates: 'Adding the branches OVERSTATES the on-track share',
  understates: 'Adding the branches UNDERSTATES the on-track share',
  equal: 'Adding the branches gives the same on-track share',
});

/**
 * Matrix line defects that can remove or misplace an edge a goal would have
 * travelled along. `duplicate` (a second home-allocation row) and
 * `missing-person` (a line about someone not on the roster) change no edge a
 * placed goal can use, so they do not refuse a span.
 */
export const GOAL_CARRIAGE_EDGE_DEFECTS = Object.freeze([
  'missing-manager', 'self-line', 'bad-share', 'bad-window', 'cycle',
]);

export const GOAL_CARRIAGE_METHOD = Object.freeze([
  Object.freeze({
    name: 'Responsibility-centre attribution (Anthony & Govindarajan)',
    why: 'A measure belongs to the unit that is accountable for it. A goal therefore counts in a span because a reporting line CARRIES it there — the owner’s own lines first, then every line of each manager above — and not because of where the owner is drawn on the home-line tree.',
  }),
  Object.freeze({
    name: 'Inclusion–exclusion, printed as a reconciliation',
    why: 'For every span the register prints two numbers: the ADDITIVE count (the span’s own goals plus each branch’s scorecard, which is what adding up reports produces) and the DISTINCT count (each goal once). Their difference must equal the sum, over goals, of the branches each arrives through minus one. The two sides are computed by separate traversals and an unequal pair is printed as a failed identity, never rounded away.',
  }),
  Object.freeze({
    name: 'Two-key attribution (segregation of duties; Cyert & March)',
    why: 'Goals in a matrix are bargained over. A goal leaves a line’s scorecard only when THAT line’s manager releases it AND another line’s manager states that it carries it. One key alone changes nothing: a line cannot take sole credit by claiming, and cannot shed an off-track goal by releasing it.',
  }),
  Object.freeze({
    name: 'One measure, shared with the Chain of Command',
    why: 'Attainment here is the chain’s own reading: stated confidence “on track” over active goals that carry a date, withheld below the same evidence floor. The tree-side figure for every span is checked against `spanRates`, so a difference between the tree and the matrix is a difference of structure, not of definition.',
  }),
  Object.freeze({
    name: 'Exact integers; direction by cross-multiplication',
    why: 'Every figure is a count. Whether adding the branches over- or understates the on-track share is decided by comparing two integer products, never two rounded percentages; the percentages are display only.',
  }),
  Object.freeze({
    name: 'No fractional credit',
    why: 'A goal is never divided between lines by allocation share or by anything else, and its key results follow it whole. Where carriage is unsettled the register says so and counts the goal in every carrying span.',
  }),
]);

export const GOAL_CARRIAGE_LIMITS_TEXT = Object.freeze([
  'A stance is stated per goal by the manager who holds one of the owner’s lines. Key results carry no owner of their own and follow their goal; they are never split.',
  'A stance stands until it is withdrawn, superseded, the line ends or its manager changes. It has no term and never expires by itself; a stance on a line that ended or changed hands is counted as stale and treated as silence.',
  'A double count caused by the structure ABOVE the owner (a manager who reports on two lines that re-join) is reported and cannot be settled here: stances exist only on the goal owner’s own lines.',
  'Nobody above the two lines can rule on a disagreement in this register. A goal one line claims and another will not release stays counted in both and stays visible at the span above them.',
  'The Chain of Command’s own span rates still read the home-line tree. This register prints the difference per span; it does not rewrite the chain’s figure.',
  'Attainment is the STATED confidence on the goal. This register does not judge whether the stated confidence is right.',
]);

export const GOAL_CARRIAGE_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'scope',
  'as_of',
  'is_matrix',
  'active_goals_n',
  'dated_goals_n',
  'state_key',
  'state_goals_n',
  'multi_line_goals_n',
  'settled_goals_n',
  'unsettled_goals_n',
  'altitude',
  'spans_n',
  'spans_with_overlap_n',
  'spans_refused_n',
  'spans_overstating_n',
  'spans_understating_n',
  'additive_n',
  'distinct_n',
  'overlap_n',
  'excess_unsettled_n',
  'excess_declared_joint_n',
  'excess_structure_n',
  'tree_n',
  'line_only_n',
  'tree_not_carried_n',
  'additive_on_track_n',
  'additive_dated_n',
  'distinct_on_track_n',
  'distinct_dated_n',
  'additive_on_track_pct',
  'distinct_on_track_pct',
  'direction',
  'rate_withheld',
  'rate_withheld_reason',
  'refused',
  'refused_reason',
  'identities_hold',
  'stances_in_force_n',
  'stale_stances_n',
  'rate_floor',
]);

export const GOAL_CARRIAGE_CSV_DESCRIPTOR = Object.freeze({
  key: 'goal-carriage',
  label: 'Matrix goal carriage and attainment reconciliation (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'goal-carriage',
  description: 'One workspace summary row (the reconciliation at the workspace leader’s span: goals added across branches against goals counted once, the excess split by cause, the home-line tree reading against the carried reading, and the on-track share both ways with the direction of the difference), one row per carriage state (unplaced, unanchored, release-pending, unattributed, open, joint, attributed, single-line, leader-owned) and one row per leadership altitude counting spans by reading. Altitude rows carry span counts and the summed excess only — never a pooled rate, which would be the double count this export exists to expose. NO goal id, NO goal title, NO person id, NO person name, NO manager id, NO line id and NO free text. A span or workspace whose reporting lines carry a defect exports its carried figures BLANK with refused = true and the printed reason; an on-track percentage below the evidence floor is BLANK with rate_withheld = true, never a zero.',
});
