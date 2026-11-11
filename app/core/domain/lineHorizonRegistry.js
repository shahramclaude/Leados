/**
 * app/core/domain/lineHorizonRegistry.js — the declared vocabulary of the
 * Matrix Forward Allocation Horizon (ADR-0179, Schema v143 unchanged,
 * `#/matrix?panel=horizon`, `RULE-LHZ-01`, CSV scope #134).
 *
 * Every other matrix surface reads the declared lines for TODAY (the live
 * ledger, ADR-0140) or for a CLOSED period (the period-allocation ledger,
 * ADR-0158). A reporting line is nevertheless a dated agreement: it has a first
 * day and, often, a last one. The lines that START next month and the lines
 * that END in three weeks are already in the record, and nothing read them
 * forward. A functional director running a weekly staffing review could not ask
 * the three questions that review exists to answer:
 *
 *   - who rolls off which line, when, and what do they roll off INTO?
 *   - who is double-booked on a day that has not arrived yet?
 *   - how much of each manager's span is attributed week by week from here?
 *
 * This registry is the closed vocabulary for that forward reading. Nothing here
 * is derived: the panel, the brief, the CSV and the rule import the same
 * constants, so they cannot disagree about what a word means.
 */

export const LINE_HORIZON_ENGINE_VERSION = 'line-horizon/1';

export const LINE_HORIZON_RULE_ID = 'RULE-LHZ-01';
export const LINE_HORIZON_SCAN_EVENT = 'matrix.horizon.scan';

/**
 * Declared bounds. Outside them the reading is REFUSED with the bound printed —
 * never clamped, because clamping answers a question nobody asked.
 *
 * Thirteen weeks is the default because it is one quarter: the rolling outlook
 * a staffing review, a rough-cut capacity plan and a cash forecast all share.
 * Twenty-six is the ceiling because beyond half a year the declared end dates
 * the reading rests on are mostly absent, and a long horizon over open-ended
 * lines is a flat line pretending to be a forecast.
 */
export const LINE_HORIZON_BOUNDS = Object.freeze({
  weeks: Object.freeze({ min: 1, max: 26, fallback: 13 }),
});

/** Hard caps. A capped table always prints how many rows it left out. */
export const LINE_HORIZON_LIMITS = Object.freeze({
  people: 60,
  events: 80,
  managers: 40,
  incoming: 40,
  runsPerPerson: 12,
  refusedLines: 40,
  /**
   * Days on which the live ledger is evaluated. The default thirteen weeks is
   * at most 91 days, so it can never reach this; a longer horizon over a
   * workspace whose line set changes almost daily is refused, not truncated.
   */
  segments: 120,
  /** Dated asks RULE-LHZ-01 may issue in ONE transaction; the rest are counted. */
  asksPerCommit: 8,
  /** Shared append-only matrix marker ledger bound (ADR-0140). */
  markers: 400,
});

export const LINE_HORIZON_FULL_H = 100;

/* ------------------------------------------------------------ person verdicts */

/**
 * ONE verdict per person in scope, worst first. The order is the precedence:
 * a person who is both double-booked ahead and unallocated later is counted
 * once, under the worse of the two, so the six counts add to the headcount.
 *
 * "Ahead" always means a state the person ENTERS on a later day inside the
 * horizon — the day before, the ledger read something else. A state that
 * simply continues from today is the live ledger's finding, and is counted
 * here only so the horizon cannot hide it.
 */
export const LINE_HORIZON_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'double-booked-ahead',
    label: 'Double-booked ahead',
    tone: 'bad',
    detail: 'On a later day inside the horizon the person ENTERS over-commitment: the declared shares in force exceed one person by more than the declared tolerance, and the day before they did not.',
  }),
  Object.freeze({
    key: 'split-unknown-ahead',
    label: 'Split unknown ahead',
    tone: 'bad',
    detail: 'On a later day the person holds more than one line and at least one of them carries no declared share, so from that day nothing can be attributed to anyone — and the day before it could.',
  }),
  Object.freeze({
    key: 'unallocated-ahead',
    label: 'Unallocated ahead',
    tone: 'warn',
    detail: 'On a later day the declared shares in force account for less than the person by more than the declared tolerance, and the day before they did not. Nobody holds the remainder.',
  }),
  Object.freeze({
    key: 'exposed-now',
    label: 'Exposed today',
    tone: 'warn',
    detail: 'Already over-committed, under-allocated or undeclared today and entering no new exposure ahead. This is the live ledger’s finding, repeated here so the forward reading does not read as a clean bill.',
  }),
  Object.freeze({
    key: 'changes-ahead',
    label: 'Changes, stays balanced',
    tone: 'neutral',
    detail: 'The set of lines the ledger reads for this person changes inside the horizon — a line starts or ends, or a home-share declaration does — and the person is balanced on every day of it.',
  }),
  Object.freeze({
    key: 'steady',
    label: 'Steady',
    tone: 'good',
    detail: 'No line the ledger reads for this person starts or ends inside the horizon and the person is balanced throughout.',
  }),
]);

export const LINE_HORIZON_VERDICT_KEYS = Object.freeze(LINE_HORIZON_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(LINE_HORIZON_VERDICTS.map((v) => [v.key, v]));
export function lineHorizonVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '')) || null;
}

/* ------------------------------------------------------------------- events */

/** A dated change in the declared line set. One row per stored line boundary. */
export const LINE_HORIZON_EVENT_KINDS = Object.freeze([
  Object.freeze({ key: 'roll-off', label: 'Rolls off', detail: 'A declared additional line reaches its last day; the first day without it is the day printed.' }),
  Object.freeze({ key: 'roll-on', label: 'Rolls on', detail: 'A declared additional line has its first day.' }),
  Object.freeze({ key: 'home-share-end', label: 'Home share lapses', detail: 'The declared allocation of the HOME line reaches its last day. The home line itself continues; its declared share lapses, so with another line in force the split becomes unknown.' }),
  Object.freeze({ key: 'home-share-start', label: 'Home share starts', detail: 'A declared allocation of the home line has its first day.' }),
]);

export const LINE_HORIZON_EVENT_KIND_KEYS = Object.freeze(LINE_HORIZON_EVENT_KINDS.map((k) => k.key));
const EVENT_KIND_BY_KEY = new Map(LINE_HORIZON_EVENT_KINDS.map((k) => [k.key, k]));
export function lineHorizonEventKind(key) {
  return EVENT_KIND_BY_KEY.get(String(key || '')) || null;
}

/**
 * What the person is LEFT IN on the first day after the change. Read from the
 * same engine that prints the live ledger, evaluated on that day — never
 * inferred from the event itself.
 */
export const LINE_HORIZON_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'over-committed', label: 'Over-committed after', tone: 'bad' }),
  Object.freeze({ key: 'undeclared', label: 'Split unknown after', tone: 'bad' }),
  Object.freeze({ key: 'under-allocated', label: 'Unallocated share after', tone: 'warn' }),
  Object.freeze({ key: 'returns-to-home', label: 'Returns to the home line in full', tone: 'neutral' }),
  Object.freeze({ key: 'balanced', label: 'Balanced after', tone: 'good' }),
]);

export const LINE_HORIZON_OUTCOME_KEYS = Object.freeze(LINE_HORIZON_OUTCOMES.map((o) => o.key));
const OUTCOME_BY_KEY = new Map(LINE_HORIZON_OUTCOMES.map((o) => [o.key, o]));
export function lineHorizonOutcome(key) {
  return OUTCOME_BY_KEY.get(String(key || '')) || null;
}

/* ------------------------------------------------------------- exposure owners */

/**
 * Who a forward exposure is put in front of. The rule never picks one of
 * several managers: an owner is either unique by construction or the exposure
 * is observed, counted and left with the people who can see it.
 */
export const LINE_HORIZON_OWNER_STATES = Object.freeze([
  Object.freeze({ key: 'unique', label: 'One accountable seat', detail: 'Exactly one roster seat owns the fix; a dated ask can be addressed to it.' }),
  Object.freeze({ key: 'leader-held', label: 'Held by the workspace leader', detail: 'The owning seat is the workspace leader, who holds no roster record and already reads the whole workspace. Observed, no ask.' }),
  Object.freeze({ key: 'ambiguous', label: 'No single seat', detail: 'The managers involved meet at more than one lowest seat in the reporting graph, or at none. Observed and counted; nobody is substituted.' }),
  Object.freeze({ key: 'off-roster', label: 'Owner not on the roster', detail: 'The owning seat is not an active roster person. Observed and counted; nobody is substituted.' }),
]);

export const LINE_HORIZON_OWNER_STATE_KEYS = Object.freeze(LINE_HORIZON_OWNER_STATES.map((o) => o.key));

/* -------------------------------------------------------------- conventions */

export const LINE_HORIZON_CONVENTIONS = Object.freeze([
  Object.freeze({
    key: 'engine',
    label: 'One engine, evaluated on each day the line set changes',
    value: 'the live matrix ledger (ADR-0140), re-run as of each boundary day',
    detail: 'The forward reading is not a second allocation model. The declared line set can only change on a day a line starts or on the day after one ends, so the same graph and the same per-person allocation that print today’s ledger are evaluated once per such day. The first segment is today, so the first figures here are the live ledger’s figures by construction.',
  }),
  Object.freeze({
    key: 'weeks',
    label: 'Week buckets',
    value: 'ISO calendar weeks, Monday to Sunday; the first bucket runs from today to this Sunday',
    detail: 'Lines usually start on a Monday and end on a Friday or a month end, so calendar weeks keep a week either on a line or off it. The first bucket is the rest of the running week and prints its own day count; no bucket is scaled to seven days.',
  }),
  Object.freeze({
    key: 'unit',
    label: 'Unit',
    value: 'share-days: whole hundredths of a person × whole calendar days',
    detail: 'Every total is an integer sum, printed as exact person-days (share-days ÷ 100, two decimals, nothing rounded). No average is printed. Calendar days are counted, weekends included: the record holds no working calendar and no leave.',
  }),
  Object.freeze({
    key: 'tolerance',
    label: 'Balance tolerance',
    value: 'the live ledger’s own declared tolerance (matrixBalanceHundredths)',
    detail: 'A day is over-committed or under-allocated here exactly when the live ledger would call it that on the same shares. The horizon declares no threshold of its own.',
  }),
  Object.freeze({
    key: 'share-held',
    label: 'A share is held at today’s figure',
    value: 'each line is read at its current declared share until its declared last day',
    detail: 'A retune takes effect on the day it is made; the record cannot hold a share change dated in the future. The horizon therefore never ramps a share up or down — it reads what was declared.',
  }),
  Object.freeze({
    key: 'open-ended',
    label: 'Open-ended lines',
    value: 'a line with no declared last day is read as continuing through the horizon',
    detail: 'That is what “until further notice” declares. The number of such lines is printed, because every week of the reading that rests on one is a week nobody has dated.',
  }),
  Object.freeze({
    key: 'home-line',
    label: 'The home line',
    value: 'today’s `person.managerId`, read as continuing through the horizon',
    detail: 'The dated home-line history (ADR-0149) records moves that have happened. A planned reorganisation is not in the record, so the horizon does not invent one.',
  }),
  Object.freeze({
    key: 'refusal',
    label: 'Refusals',
    value: 'an undeclared person-day or a refused line withholds every share-day total it touches',
    detail: 'Counts of people and person-days by state are always printed. A share-day total is printed only when every person-day under it resolved and no declaration the ledger refuses is in force on it; otherwise it is withheld with the reason, never summed over the rows that happen to carry a number. A refused declaration is listed by name with the days it touches. One whose dates are reversed is treated as touching every day between the two dates it names.',
  }),
  Object.freeze({
    key: 'lead-window',
    label: 'Lead window for asks',
    value: 'the live ledger’s declared expiry window (matrixExpiringDays)',
    detail: 'RULE-LHZ-01 acts only on an exposure whose first day falls inside the same window the ledger already uses to call a line “expiring”. A longer horizon is for reading; the asks stay inside the window a leader declared.',
  }),
]);

/* ------------------------------------------------------------------- method */

export const LINE_HORIZON_METHOD = Object.freeze([
  Object.freeze({
    name: 'Resource histogram / resource loading (PMI, PMBOK Guide — Project Resource Management)',
    why: 'A person is one unit of capacity; each declared line loads a fraction of it over a dated window. Summed per day and compared with the unit, the load is over, under or level. This reading is that histogram, built from declared lines instead of a schedule, and printed per person, per manager and per week.',
  }),
  Object.freeze({
    name: 'Rough-cut capacity planning (Vollmann, Berry, Whybark & Jacobs, Manufacturing Planning and Control)',
    why: 'Before detailed scheduling, load is checked against capacity in coarse time buckets to find the weeks that cannot work. The weekly buckets here do the same for declared accountability: they name the weeks in which a span is short or a person is double-booked while there is still time to change the declaration.',
  }),
  Object.freeze({
    name: 'Common agency (Bernheim & Whinston, 1986)',
    why: 'A double-booking is created by two or more principals who each hold part of one person. None of them can settle it alone, so the ask climbs to the one roster seat above all of them — and when there is no such single seat, the rule says so instead of choosing. An unallocated remainder falls back to the home line, whose manager is unique by construction; a missing share belongs to the line that has not declared it.',
  }),
  Object.freeze({
    name: 'Integer share-day arithmetic',
    why: 'Shares are whole hundredths and days are whole days, so every weekly and horizon total is an integer sum that either reconciles exactly or is reported as not reconciling. Nothing rounds into looking right.',
  }),
  Object.freeze({
    name: 'Refusal instead of imputation',
    why: 'A line with no declared share on a future day makes that person’s split unknown from that day. The reading counts the person-days it cannot resolve and withholds the totals they touch; it never fills the hole with an even split or a zero.',
  }),
]);

/** What this reading cannot know. Printed on the panel, not buried in an ADR. */
export const LINE_HORIZON_LIMITS_TEXT = Object.freeze([
  'An allocation is a DECLARATION, not a measurement. Share-days are declared shares over calendar days; they are not hours anyone will work.',
  'The roster is today’s. A hire who has not started and a person who is going to leave are not in the record, so they are not in the reading.',
  'A line’s consent state (ADR-0148) is not joined: a future line that has been declared but not yet accepted is read like any other declared line, exactly as the live ledger reads it.',
  'One stored row exists per person, manager and line kind. A renewal is therefore an edit to the last day, and the horizon reads the edited row.',
  '“Returns to the home line in full” is arithmetic: the person holds one line, so that line holds the whole person. It is not a finding that the person is unoccupied.',
  'A scoped seat’s wall is today’s. A person who joins the seat’s span on a later day is listed only by the one line declared to that seat — never by their other lines, their total or their state.',
  'The record holds no clock. RULE-LHZ-01 runs when something is written — a reporting-line act, a roster change, or any operational write while a line boundary sits inside the lead window or one of its own asks is open — or when a scan is pressed. In a workspace nobody writes to, nothing is issued and nothing is closed.',
]);

/* ---------------------------------------------------------------------- csv */

/**
 * CSV scope #134. Aggregate only: one workspace row, one row per ISO week and
 * one row per person verdict. No person, manager, line or seat identifier and
 * no free text crosses the export boundary.
 */
export const LINE_HORIZON_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'scope',
  'horizon_from',
  'horizon_to',
  'horizon_days',
  'week_index',
  'week_from',
  'week_to',
  'week_days',
  'verdict',
  'people_n',
  'person_days_n',
  'balanced_person_days_n',
  'over_person_days_n',
  'under_person_days_n',
  'undeclared_person_days_n',
  'over_people_n',
  'under_people_n',
  'undeclared_people_n',
  'attributed_share_days_h',
  'capacity_share_days_h',
  'over_share_days_h',
  'unallocated_share_days_h',
  'roll_off_n',
  'roll_on_n',
  'home_share_change_n',
  'returns_to_home_n',
  'open_ended_line_n',
  'refused_line_n',
  'lead_window_days',
  'ahead_inside_lead_window_n',
  'owner_unique_n',
  'owner_unresolved_n',
  'person_days_reconcile',
  'verdicts_reconcile',
  'share_days_reconcile',
  'fan_out_reconcile',
  'reading_complete',
  'withheld_reason',
]);

export const LINE_HORIZON_CSV_DESCRIPTOR = Object.freeze({
  key: 'line-horizon',
  label: 'Matrix forward allocation horizon (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'line-horizon',
  description: 'One workspace row, one row per ISO week of the default thirteen-week horizon and one row per person verdict: people and person-days by allocation state, exact integer attributed / capacity / over-committed / unallocated share-days, roll-offs, roll-ons and home-share changes, the times a person is left holding only their home line, open-ended and refused lines, the exposures that begin inside the declared lead window and how many of them have one accountable seat, and four separate reconciliation claims. A share-day total is BLANK with its reason in its own column wherever an undeclared person-day or a refused line touches it — never a zero and never a partial sum. NO person, manager, line, declaration or seat identifier, no name and no free text is exported.',
});
