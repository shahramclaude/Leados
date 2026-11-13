/**
 * app/core/domain/changeSaturationRegistry.js — closed vocabulary for the
 * Cross-Line Change Saturation & Absorptive-Capacity Ledger (ADR-0186,
 * Session 254, Schema v148, `#/matrix?panel=change-saturation`, CSV #140).
 *
 * THE DUTY. Three change programmes can each be individually reasonable and
 * collectively land on the SAME person in the same quarter, because each
 * reporting line approves its own changes. The functional line moves the
 * career structure, the product line cuts over the tooling, the project line
 * re-draws the interfaces — and every one of those approvals is made by a
 * manager who can see only their own. Nobody in the structure is asked the only
 * question that matters on the day the third approval is given: what is this
 * person already carrying, and who else is about to put something on them? The
 * ledger records each line's dated change demand against the person, sums what
 * the person actually holds across every line, and compares that sum with a
 * capacity a human declared. It is the change-portfolio equivalent of the intake
 * gate (ADR-0171), applied to the load a change puts on a person rather than to
 * the days a line borrows.
 *
 * WHAT MAKES THIS HARD, AND WHAT THIS MODULE REFUSES TO DO
 * -------------------------------------------------------
 * A change record already names the people it impacts (`change.impacts`), but
 * it holds no window in which the impact has to be absorbed and no statement of
 * how heavy it is for that person. `change.targetOn` is the GO-LIVE day, not the
 * adoption window, and the record's Beta-PERT effort triple prices the WORK, not
 * the burden the change puts on the person receiving it. Inventing either would
 * put numbers under an approval that no human made — the exact failure the
 * Bulletproof Reliability Mandate exists to stop. So the weight band, the window
 * and the capacity ceiling are each a dated human declaration
 * (`changeSaturationActs`, `changeSaturationCeilings`), empty on upgrade, and
 * every verdict is re-derived on read.
 *
 * The refusals that carry the module:
 *   1. `no-ceiling`      — a person with demand and no declared capacity gets NO
 *      verdict. Capacity is never defaulted, never inferred from headcount, pay
 *      grade, meeting load or share-days, and never borrowed from a peer.
 *   2. `intensity-divergence` — two lines that declared the same change for the
 *      same person at different weights are not averaged. The person's load uses
 *      the heaviest declaration (the demand exists either way) and the
 *      disagreement is printed as its own verdict, because two managers seeing
 *      the same change as weight 1 and weight 4 is a finding, not noise.
 *   3. `ceiling-conflict` — two in-force ceilings for one subject that disagree
 *      refuse the comparison instead of quietly taking the min or the max.
 *
 * MATRIX CORRECTNESS. Each demand is charged to the line that DECLARED it, so a
 * pool total never needs a guessed split; and a person is counted ONCE in their
 * own total however many lines put work on them. A workspace with no additional
 * line gets the person-level reading in full and the cross-line claim prints
 * `inert` rather than restating a single line's numbers as a matrix finding.
 *
 * Leaf-ish module: imports nothing, so schema, read model, rule, actions, CSV
 * and view can all depend on it without an import cycle.
 */

export const CHANGE_SATURATION_ENGINE_VERSION = 'change-saturation-2026.11-v1';
export const CHANGE_SATURATION_ADR = 'ADR-0186';
export const CHANGE_SATURATION_RULE_ID = 'RULE-CSA-01';
export const CHANGE_SATURATION_PANEL = 'change-saturation';
export const CHANGE_SATURATION_CSV_SCOPE = 'matrix-change-saturation';

export const CHANGE_SATURATION_EVENTS = Object.freeze({
  DEMAND_DECLARED: 'change.saturation.declared',
  DEMAND_WITHDRAWN: 'change.saturation.withdrawn',
  CEILING_DECLARED: 'change.saturation.ceiling.declared',
  CEILING_RETIRED: 'change.saturation.ceiling.retired',
  CONVENTIONS: 'change.saturation.conventions.set',
  SCAN: 'change.saturation.scan',
});

/**
 * Declaring a demand is an ordinary act of the manager who issues the change
 * work on their line. Setting the capacity a span will absorb, and governing the
 * register, is a separate right because it is a different human's statement.
 */
export const CHANGE_SATURATION_RIGHTS = Object.freeze({
  DECLARE: 'declare-change-demand',
  GOVERN: 'govern-change-saturation',
});

/**
 * THE WEIGHT BANDS. A declared ordinal, not a measurement: it says how heavy
 * this change is FOR THIS PERSON, on the line that declared it, in the words of
 * the manager who has to absorb it. There is deliberately no conversion to
 * hours, days or share-days — a band multiplied by an invented hours figure would
 * look like data and be a guess. Everything downstream is exact integer
 * arithmetic on the band value itself.
 */
export const CHANGE_SATURATION_BANDS = Object.freeze([
  Object.freeze({
    value: 1, key: 'notice', label: 'Notice', tone: 'neutral',
    meaning: 'A document, an announcement or a habit changes. The person’s work is the same the next morning.',
  }),
  Object.freeze({
    value: 2, key: 'light', label: 'Light', tone: 'neutral',
    meaning: 'A local ritual, form or cadence changes. Existing skills apply; the sequence of the work is redrawn.',
  }),
  Object.freeze({
    value: 3, key: 'moderate', label: 'Moderate', tone: 'warn',
    meaning: 'Scope or an interface changes. Who to ask, what is handed over and what is owned all have to be relearned.',
  }),
  Object.freeze({
    value: 4, key: 'heavy', label: 'Heavy', tone: 'warn',
    meaning: 'A reporting line or team boundary moves. Priorities, relationships and identity move with it.',
  }),
  Object.freeze({
    value: 5, key: 'disruptive', label: 'Disruptive', tone: 'bad',
    meaning: 'The person must rebuild how they work while carrying their current load — a cutover, a migration or a simultaneous ownership change.',
  }),
]);

export const CHANGE_SATURATION_BAND_VALUES = Object.freeze(CHANGE_SATURATION_BANDS.map((b) => b.value));

export function changeSaturationBand(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : Number(value);
  return CHANGE_SATURATION_BANDS.find((b) => b.value === n) || null;
}

export function changeSaturationBandLabel(value) {
  return changeSaturationBand(value)?.label || 'Band not declared';
}

/** The unit every figure in this module is expressed in, printed wherever a figure appears. */
export const CHANGE_SATURATION_UNIT = Object.freeze({
  name: 'change-weight unit-days',
  definition: 'One declared weight band carried for one calendar day. A person’s load on a day is the sum of the weights of the distinct changes landing on them that day; their exposure over a window is that figure summed across the days.',
  notSaid: 'It is not hours, not a percentage of capacity and not a share-day figure. Nothing in this ledger converts a band into time, and nothing compares a band with the meeting-load or share-day ledgers.',
});

/**
 * Every reason a demand act can be refused at the door. The list is closed and
 * the action prints the codes it hit, so a refusal never has to be re-parsed out
 * of a sentence, and a reader can tell an unfinished declaration from a
 * rejected one.
 */
export const CHANGE_SATURATION_ACT_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unknown-band', says: 'The weight is not one of the five declared bands.' }),
  Object.freeze({ key: 'missing-person', says: 'No person was named.' }),
  Object.freeze({ key: 'off-roster', says: 'The named person is not on this workspace’s roster.' }),
  Object.freeze({ key: 'missing-change', says: 'No change was named.' }),
  Object.freeze({ key: 'unknown-change', says: 'That change does not exist in this workspace.' }),
  Object.freeze({ key: 'impact-not-recorded', says: 'The change does not name this person among its impacts, so this ledger will not record a demand for them.' }),
  Object.freeze({ key: 'unknown-line', says: 'The named line is not one of this person’s declared Matrix lines.' }),
  Object.freeze({ key: 'line-not-active', says: 'The named line is not active today, so nobody owns the demand.' }),
  Object.freeze({ key: 'bad-day', says: 'A window day is not a real calendar date.' }),
  Object.freeze({ key: 'reversed-window', says: 'The window ends before it starts.' }),
  Object.freeze({ key: 'future-window', says: 'The window opens on a day that has not arrived; a demand is recorded when the work is put on someone.' }),
  Object.freeze({ key: 'window-too-long', says: 'The window is longer than the declared ceiling on a single demand’s span.' }),
  Object.freeze({ key: 'duplicate-line-demand', says: 'This line already declared a demand for this person on this change. Withdraw it first — a line states a thing once.' }),
  Object.freeze({ key: 'ledger-full', says: 'The demand ledger holds its declared cap.' }),
]);

/** Every reason a capacity declaration can be refused at the door. */
export const CHANGE_SATURATION_CEILING_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unknown-scope', says: 'A ceiling is declared for a person or for a pool. Nothing else.' }),
  Object.freeze({ key: 'missing-subject', says: 'No subject was named for the ceiling.' }),
  Object.freeze({ key: 'off-roster-subject', says: 'The subject of the ceiling is not on this workspace’s roster.' }),
  Object.freeze({ key: 'band-not-whole', says: 'A ceiling is a whole number of concurrent weight units. Nothing was rounded.' }),
  Object.freeze({ key: 'band-out-of-range', says: 'The declared ceiling is outside the bounded range the register carries.' }),
  Object.freeze({ key: 'bad-day', says: 'A window day is not a real calendar date.' }),
  Object.freeze({ key: 'reversed-window', says: 'The window ends before it starts.' }),
  Object.freeze({ key: 'window-passed', says: 'The whole window lies in the past; a ceiling is declared forward, and history keeps its own row.' }),
  Object.freeze({ key: 'overlapping-ceiling', says: 'A ceiling is already in force for this subject over these days. Retire it first — two live ceilings for one subject is a conflict, not a choice.' }),
  Object.freeze({ key: 'ledger-full', says: 'The ceiling ledger holds its declared cap.' }),
]);

/**
 * WHY A FIGURE IS NOT PRINTED **ON READ**. These are the reasons the reader can
 * raise, distinct from the door's refusals: an act that was legal when it was
 * declared can become unattributable when a line ends, and a pair can have no
 * demand declared at all. The list is closed and
 * `tests/app/change-saturation.test.mjs` fails the build if the reader raises a
 * reason that is not declared here, because an undeclared reason is a sentence
 * the method section does not explain.
 */
export const CHANGE_SATURATION_READ_REFUSALS = Object.freeze([
  Object.freeze({ key: 'no-ceiling', says: 'No person ceiling in force covers the subject, so no verdict exists.' }),
  Object.freeze({ key: 'ceiling-conflict', says: 'Two ceilings in force for one subject disagree; neither was chosen for them.' }),
  Object.freeze({ key: 'intensity-divergence', says: 'Lines declared different weight bands for the same change and person.' }),
  Object.freeze({ key: 'matrix-defect', says: 'The Matrix cannot verify this person’s active line set.' }),
  Object.freeze({ key: 'pool-below-floor', says: 'The pool holds fewer people than the declared disclosure floor.' }),
  Object.freeze({ key: 'window-outside-read', says: 'The declared window lies wholly outside the read window.' }),
  Object.freeze({ key: 'off-seat', says: 'The subject sits outside the operating seat’s span and declared lines.' }),
  Object.freeze({ key: 'unknown-change', says: 'The demand names a change this workspace no longer holds.' }),
  Object.freeze({ key: 'line-not-active', says: 'The declaring line is not an active Matrix line of this person today.' }),
  Object.freeze({ key: 'line-unverifiable', says: 'The demand for this pair exists but its line cannot be owned, so the day is not charged.' }),
  Object.freeze({ key: 'demand-not-declared', says: 'The change names this person among its impacts and no line has declared what that puts on them.' }),
  Object.freeze({ key: 'no-in-window-demand', says: 'This person has no demand charging a day inside the read window.' }),
  Object.freeze({ key: 'already-over-ceiling', says: 'The person was already over their declared ceiling before this demand is counted; the demand did not tip it.' }),
]);

export const CHANGE_SATURATION_READ_REFUSAL_KEYS = Object.freeze(CHANGE_SATURATION_READ_REFUSALS.map((row) => row.key));

/**
 * THE VERDICTS A PERSON CAN CARRY. Precedence is declared, high severity first,
 * so no row can be read as two different things and no refusal is folded into a
 * reassuring word.
 */
export const CHANGE_SATURATION_STATES = Object.freeze([
  Object.freeze({ key: 'unreadable', label: 'Cannot be read', tone: 'bad', severity: 0, says: 'A Matrix defect, an off-roster person or an out-of-seat subject blocks the reading. This is not a pass and not a failure — it is the register saying it cannot see.' }),
  Object.freeze({ key: 'contested', label: 'Declarations disagree', tone: 'bad', severity: 1, says: 'Two lines weigh the same change differently for this person, or two live ceilings for this subject disagree. The disagreement is printed; the verdict is withheld until a human settles it.' }),
  Object.freeze({ key: 'no-ceiling', label: 'No capacity declared', tone: 'warn', severity: 2, says: 'Demand was recorded and no PERSON ceiling in force covers this person. A pool ceiling is a pacing limit on a line, never a borrowed individual limit; the register refuses to guess a capacity, so no comparison is made.' }),
  Object.freeze({ key: 'saturated', label: 'Over declared capacity', tone: 'bad', severity: 3, says: 'At least one day in the window carries more concurrent weight than the declared ceiling allows. This is a statement about the window, not a permission.' }),
  Object.freeze({ key: 'at-limit', label: 'At the ceiling, no headroom', tone: 'warn', severity: 4, says: 'The peak equals the declared ceiling exactly. Nothing is over, and nothing is spare — the next demand of any weight tips it.' }),
  Object.freeze({ key: 'within', label: 'Within declared capacity', tone: 'good', severity: 5, says: 'Every day in the window stays under the declared ceiling. The word “declared” is load-bearing: this is a statement about a human’s limit, not a measurement of the person.' }),
]);

const STATE_BY_KEY = new Map(CHANGE_SATURATION_STATES.map((s) => [s.key, s]));
export function changeSaturationState(key) {
  return STATE_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * WHY A FIGURE IS NOT PRINTED. Six distinct withheld reasons, each with its own
 * field on the row. A withheld figure is a dash and a reason; it is never a zero,
 * and a zero — a measured none — is a different claim from a withheld one.
 */
export const CHANGE_SATURATION_WITHHELD = Object.freeze([
  Object.freeze({ key: 'no-ceiling', says: 'No person ceiling in force covers this person, and a pool ceiling is never borrowed in its place.' }),
  Object.freeze({ key: 'ceiling-conflict', says: 'Two ceilings in force for this subject disagree; the smaller was not silently chosen.' }),
  Object.freeze({ key: 'intensity-divergence', says: 'Lines declared different weights for the same change and person; no average was taken.' }),
  Object.freeze({ key: 'matrix-defect', says: 'The Matrix cannot verify this person’s active line set.' }),
  Object.freeze({ key: 'pool-below-floor', says: 'The pool has fewer people than the declared disclosure floor, so a pool figure would identify someone.' }),
  Object.freeze({ key: 'window-outside-read', says: 'The demand’s window lies wholly outside the read window, so the window cannot support a claim about it.' }),
  Object.freeze({ key: 'off-seat', says: 'The subject sits outside the operating seat’s span and declared lines.' }),
]);

export const CHANGE_SATURATION_WITHHELD_LABELS = Object.freeze(
  CHANGE_SATURATION_WITHHELD.reduce((acc, row) => ({ ...acc, [row.key]: row.says }), {}),
);

/**
 * THE CLEARANCE — the one decision-support sentence this ledger is allowed to
 * print about a future act: on the evidence in the record, can this change’s
 * demand for this person be absorbed without breaching a declared ceiling?
 * It is a printed statement, never a gate: nothing here blocks a change,
 * defers a date or routes an approval, and `clearable` is not permission.
 */
export const CHANGE_SATURATION_CLEARANCE = Object.freeze([
  Object.freeze({ key: 'clearable', label: 'Absorbable on the record', tone: 'good', says: 'With this demand included, every day in the window stays within every ceiling in force that applies, and nothing about the person’s lines or ceilings is contested.' }),
  Object.freeze({ key: 'refused', label: 'Refused — breaches a declared ceiling', tone: 'bad', says: 'Including this demand puts at least one day over a declared ceiling. The register states which day and by how much; it does not veto the change.' }),
  Object.freeze({ key: 'unavailable', label: 'Cannot be answered', tone: 'warn', says: 'No applicable ceiling is in force, or the record touching this person is incomplete. Absence of a ceiling is never read as spare capacity.' }),
  Object.freeze({ key: 'not-open', label: 'Not an open demand', tone: 'neutral', says: 'The change is anchored, paused or abandoned, or the demand was withdrawn. It is history, and history gets no clearance question.' }),
]);

const CLEARANCE_BY_KEY = new Map(CHANGE_SATURATION_CLEARANCE.map((c) => [c.key, c]));
export function changeSaturationClearance(key) {
  return CLEARANCE_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * WHAT A CEILING CAN BE DECLARED FOR. `person` bounds what one person may carry
 * at once across every line; `pool` bounds what one manager’s span may carry at
 * once. There is deliberately no team, unit or altitude scope: those would be a
 * ceiling nobody named, and a ceiling an unnamed subject cannot be told apart
 * from a quota.
 */
export const CHANGE_SATURATION_SCOPES = Object.freeze([
  Object.freeze({ key: 'person', label: 'A person', subject: 'personId', says: 'The most concurrent change weight this individual may carry, summed across every line that puts work on them.' }),
  Object.freeze({ key: 'pool', label: 'A line’s pool', subject: 'managerId', says: 'The most concurrent change weight this manager’s line may put on its people at once. This is the pacing question Huy (2001) puts to the middle of the structure.' }),
]);

export const CHANGE_SATURATION_SCOPE_KEYS = Object.freeze(CHANGE_SATURATION_SCOPES.map((s) => s.key));

export function changeSaturationScope(key) {
  return CHANGE_SATURATION_SCOPES.find((s) => s.key === key) || null;
}

/** How a stored ceiling sits relative to today and to the read window. */
export const CHANGE_SATURATION_CEILING_STATUS = Object.freeze([
  Object.freeze({ key: 'in-force', label: 'In force', tone: 'good', says: 'Its window covers today, so it governs the reading.' }),
  Object.freeze({ key: 'forward-only', label: 'Dated forward', tone: 'neutral', says: 'It begins after today. It governs nothing yet and is printed as a declaration, not a reading.' }),
  Object.freeze({ key: 'expired', label: 'Window passed', tone: 'warn', says: 'The period it covered has ended and nobody re-affirmed it. It stays as history and governs no verdict — an expired limit is not a limit that was met.' }),
  Object.freeze({ key: 'retired', label: 'Retired', tone: 'neutral', says: 'Withdrawn by a dated act. The row survives so the record of what was agreed is not rewritten.' }),
]);

/* ------------------------------------------------------------------ settings */

export const CHANGE_SATURATION_SETTING_KEYS = Object.freeze({
  windowDays: 'changeSaturationWindowDays',
  minPoolN: 'changeSaturationMinPoolN',
  askDueDays: 'changeSaturationAskDueDays',
  autoPropagate: 'changeSaturationAutoPropagate',
});

export const CHANGE_SATURATION_DEFAULTS = Object.freeze({
  /** The read window ends today and runs back this many days, inclusive. */
  windowDays: 90,
  /** A pool with fewer people than this gets no pool figure at all. */
  minPoolN: 3,
  askDueDays: 14,
  autoPropagate: true,
});

export const CHANGE_SATURATION_BOUNDS = Object.freeze({
  windowDays: Object.freeze([14, 365]),
  minPoolN: Object.freeze([2, 25]),
  askDueDays: Object.freeze([1, 30]),
});

export const CHANGE_SATURATION_SETTING_LABELS = Object.freeze({
  windowDays: 'Saturation read window (days back from today, 14–365)',
  minPoolN: 'Fewest people in a pool before its figure is withheld (2–25)',
  askDueDays: 'Days allowed to answer a saturation ask (1–30)',
  autoPropagate: 'Issue saturation asks automatically',
});

export const CHANGE_SATURATION_LIMITS = Object.freeze({
  acts: 4000,
  ceilings: 400,
  markers: 600,
  /** A single demand may not claim a window longer than this (days). */
  demandDays: 730,
  peopleRows: 120,
  poolRows: 60,
  clearanceRows: 120,
  /** Tripwire: the day-by-day sweep is bounded by the window convention, not here. */
  scanDays: 400,
  asksPerCommit: 4,
  noteMax: 300,
});

/** The disclosure ladder, applied INSIDE the read model. Printed, never silent. */
export const CHANGE_SATURATION_DETAIL_LEVELS = Object.freeze(['full', 'span', 'none']);
export const CHANGE_SATURATION_DETAIL_REASONS = Object.freeze({
  full: 'The operating seat is the workspace view, or sits at rank 3 or above: named people, pools and ceilings are returned.',
  span: 'A manager seat reads the people in its span and on its declared lines, and no others.',
  none: 'No seat is declared, or the seat reaches nobody in this ledger: only workspace totals are returned. Totals are not a floor to fall through to — the reason is printed.',
});

/**
 * THE METHOD, in plain language, printed by the panel. No step is a black box.
 */
export const CHANGE_SATURATION_METHOD = Object.freeze([
  'A demand is a dated, human-declared act: one person, one change that already names that person among its impacts, the line that is putting the work on them, a weight band from the five declared, and a window with a first and a last day. It is never inferred from a change’s status, its go-live date or its effort triple, and nothing is back-filled on upgrade.',
  'Load is computed day by day. On each day, a person’s load is the sum, over the DISTINCT changes landing on them, of the weight declared for that change; their exposure over the window is that figure summed across the days, in exact integers. The unit is declared weight-band × day and is never converted into hours, share-days or a percentage of capacity.',
  'One change, one person, one count — even when several lines declared it. Where two lines declare the same change for the same person with overlapping windows, the day is charged the heaviest band, never the sum of the two declarations, because a line approving its own change twice does not make the impact happen twice. Where the two bands differ, that disagreement is printed as its own verdict and the person’s row is `contested`.',
  'The cross-line sum is the reason this ledger exists. Every line’s own approval is visible to the manager who gave it; the person’s day is the sum of all of them. The register prints each line’s contribution beside the whole so a leader can see which line added the demand that tipped it, and no manager is ever substituted as the owner of another line’s declaration.',
  'A ceiling is a declaration, never a derivation. It is set per person or per pool, in whole concurrent weight units, for a dated window, by a named seat. Capacity is never inferred from headcount, pay grade, seniority, meeting minutes, share-days or last quarter’s performance, and there is no default ceiling for a subject nobody declared — an undeclared subject gets no verdict rather than a generous one.',
  'Six verdicts are kept apart and never collapsed: `unreadable`, `contested`, `no-ceiling`, `saturated`, `at-limit` and `within`. A measured zero is a different claim from a withheld figure, so a person with demand recorded and no day over the ceiling prints `within`, and a person whose ceiling was never declared prints `no-ceiling`. A ceiling whose window has passed is `expired` and governs nothing — an expired limit is not a limit that was met.',
  'The clearance sentence is printed per change-and-person pair and is a statement about the record: with this demand included, does any day exceed a ceiling in force? `refused` names the day and the excess; `unavailable` says what is missing. It never blocks, defers or re-schedules a change, and `clearable` is not approval — the decision stays with the humans who approve changes.',
  'Two claims are printed apart because they are two different facts: `countsReconcile` proves the printed rows account for every stored act (read + withdrawn + absorbed + halted + unattributable = ledger), and `figuresComplete` proves no printed figure rests on a cell that was withheld. A refusal is counted in its own column, never dropped, and a withheld pool figure says which floor it failed.',
  'Nothing here rates a person. No verdict is a performance statement, no figure is a health or wellbeing claim, and no name, id, manager or free text crosses into the export, which carries workspace and state counts only. A single-chain workspace gets the person-level reading in full and the cross-line claim prints `inert` rather than restating one line’s figures as a matrix finding.',
]);

/**
 * THE FRAMEWORKS this module is built on, named so a reader can argue with the
 * modelling choice instead of taking it on trust.
 */
export const CHANGE_SATURATION_FRAMEWORKS = Object.freeze([
  Object.freeze({
    name: 'Absorptive capacity (Cohen & Levinthal, 1990, *Management Science*)',
    why: 'The capacity to recognise, assimilate and apply new information is a stock that a firm builds by deploying, and it is consumed by the very acts that build it. That is the modelling claim under this ledger: the ceiling is declared, and a demand beyond it degrades the absorption of the changes below it rather than merely arriving late.',
  }),
  Object.freeze({
    name: 'Change overload and pacing (Huy, 2001, “In Praise of Middle Management”, *Long Range Planning*)',
    why: 'Huy’s finding is about quantity and timing: too many simultaneous initiatives hit the middle of the structure hardest, because that is where several lines’ changes converge. The pool reading is that argument made auditable — a manager’s own concurrency limit, and the count of days it is breached across their people.',
  }),
  Object.freeze({
    name: 'Cumulative load, kept as an arithmetic claim (Allostatic load; Cohen & Levinthal’s “consumption” reading)',
    why: 'A burden spread across several sources can exceed a capacity that each source individually respects. The register applies that arithmetic to the record only — the sum of dated declarations — and refuses any inference from absence of data. It makes no claim about anybody’s health, stress or stamina, and the export carries no person at all.',
  }),
  Object.freeze({
    name: 'Work-in-progress limits at the point of admission (Lean / *Principles of Product Development Flow*, Ward & Liker; the intake gate already in ADR-0171)',
    why: 'A ceiling enforced where work is admitted beats one enforced at delivery, because by then the queue exists. This is the same mechanism the Matrix Line Intake Gate applies to borrowed share-days, applied to change weight: the clearance prints the breach before the third approval becomes a fourth week of nobody’s plan.',
  }),
  Object.freeze({
    name: 'Multi-principal agency and the common-pool resource (Holmström & Milgrom, 1991; Hardin, 1968)',
    why: 'Several managers each drawing on one person’s capacity to absorb change is a common pool with no owner. Each line’s withdrawal is individually rational and visible only to that line; the person’s total is the tragedy the ledger prints. No allocation is imposed, because a split nobody agreed to would be a fabricated fact.',
  }),
  Object.freeze({
    name: 'Fail-closed small-cell discipline (this repository’s own convention)',
    why: 'A pool figure over two named people can identify one of them, and a verdict over a record nobody declared is noise wearing a decimal point. Below the declared disclosure floor the figure is BLANK with its reason — the convention this codebase will not relax, because a plausible number over a thin cell is how people-analytics products mislead their buyers.',
  }),
]);

/** THE CONVENTIONS the panel prints as in force, resolved from settings. */
export const CHANGE_SATURATION_CONVENTIONS = Object.freeze([
  Object.freeze({
    label: 'A ceiling has to be declared before a verdict exists',
    text: 'No comparison is made for a subject with no ceiling in force. The row prints `no capacity declared`, and the count of such rows is printed beside it — a workspace that reads “nothing is over” while nobody has declared a limit is exactly the reassurance this register refuses to give.',
  }),
  Object.freeze({
    label: 'A change is charged to a person once per day, whoever declared it',
    text: 'Overlapping declarations of the same change for the same person collapse to the heaviest band on that day, and a disagreement between the bands is printed as a contested verdict rather than averaged away.',
  }),
  Object.freeze({
    label: 'Pools smaller than the declared floor print no figure',
    text: `Fewer than the declared minimum of people in a pool withholds the pool’s concurrency and days-over figures with their reason, while the workspace total still counts those demands.`,
  }),
  Object.freeze({
    label: 'A passed ceiling window is history, not compliance',
    text: 'When a ceiling’s window ends, the verdict does not become “within capacity”. It becomes `no capacity declared`, and the expired declaration stays on the register as the dated statement it was.',
  }),
  Object.freeze({
    label: 'The ledger advises and never gates',
    text: 'A `refused` clearance prints the day, the ceiling and the excess. It changes no change record, moves no date, assigns no owner and blocks no approval. Every consequence of it is a human act recorded somewhere else.',
  }),
]);

/**
 * CSV scope #140 — aggregate only. No person, manager, line, change title,
 * record id or prose crosses this boundary.
 */
export const CHANGE_SATURATION_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'as_of',
  'window_days',
  'acts_total_n',
  'acts_read_n',
  'acts_withdrawn_n',
  'acts_absorbed_n',
  'acts_halted_n',
  'acts_unattributed_n',
  // The sixth partition. Without it a reader cannot add the parts back up to
  // `acts_total_n`, which is the one claim `counts_reconcile` makes.
  'acts_before_window_n',
  'changes_n',
  'people_n',
  'multi_line_people_n',
  'pools_n',
  'ceilings_in_force_n',
  'ceilings_expired_n',
  'saturated_n',
  'at_limit_n',
  'within_n',
  'no_ceiling_n',
  'contested_n',
  'unreadable_n',
  'clearable_n',
  'clearance_refused_n',
  'clearance_unavailable_n',
  'clearance_not_open_n',
  'peak_units',
  'over_days_total',
  'longest_run_days',
  'withheld_rows_n',
  'saturated_pct',
  'saturated_pct_withheld',
  'saturated_pct_withheld_reason',
  'counts_reconcile',
  'figures_complete',
  'claim_ceilings_declared',
  'claim_cross_line',
  'claim_clearance_made',
  'engine_version',
]);

export const CHANGE_SATURATION_CSV_DESCRIPTOR = Object.freeze({
  key: CHANGE_SATURATION_CSV_SCOPE,
  label: 'Cross-line change saturation (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-change-saturation',
  description: 'One workspace summary row plus one row per verdict state: recorded change demands, the people and lines they touch, the ceilings declared over them and the counts of each verdict. NO person, manager, change title, line, record id, weight-by-person detail or free text. A percentage is withheld below the declared floor or on an incomplete read; `within` means within a human-declared ceiling, and `clearable` is not approval of a change.',
});
