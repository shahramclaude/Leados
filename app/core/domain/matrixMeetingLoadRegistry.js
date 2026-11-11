/**
 * app/core/domain/matrixMeetingLoadRegistry.js — the declared vocabulary of the
 * Matrix Meeting-Load & Coordination-Tax Ledger (ADR-0169, Schema v135
 * unchanged, `#/matrix?panel=meeting-load`, CSV scope #124).
 *
 * THE GAP THIS REGISTRY EXISTS TO CLOSE
 * -------------------------------------
 * LeadOS already stores the raw material of a meeting-cost reading and has
 * never read it: `cadenceForums` declares each standing forum's chair and
 * attendance, and every sitting logged on `#/cadence` carries the day it sat,
 * the minutes it consumed and who was in the room. That is time-driven activity
 * data — duration × attendance — and nothing in the product turns it into a
 * workload a director can act on.
 *
 * The consequence is the ordinary failure of every matrix: the person on three
 * lines is booked into three lines' forums, nobody adds the hours up, and the
 * one figure every leader needs — *how much of my people's week is being
 * consumed by meetings convened by OTHER lines* — exists nowhere. In a
 * single-chain workspace the same reading still matters: minutes in forums
 * chaired by someone other than the person's own manager are time the home line
 * does not control.
 *
 * WHAT THIS LEDGER IS NOT
 * -----------------------
 *  - It is not a calendar and does not schedule, move or cancel anything.
 *  - It never estimates a duration. A sitting with no recorded minutes makes
 *    the totals of everyone who attended it BLANK, with the reason printed. The
 *    tempting default — "assume an hour" — is exactly the drift the Bulletproof
 *    Reliability Mandate forbids.
 *  - It never grades a person on meeting volume. Minutes are a fact about a
 *    calendar; the ladder below is a statement about the RECORD, not a ranking
 *    of anybody, and no verdict is a performance judgement.
 *
 * NOTHING HERE IS STORED. Every figure is derived on read from the sitting
 * register, the declared forums and the live matrix.
 */

export const MATRIX_MEETING_LOAD_ENGINE_VERSION = 'matrix-meeting-load/1';

/** The declared bounds. Stated once, read by the engine, the panel and the export. */
export const MATRIX_MEETING_LOAD_BOUNDS = Object.freeze({
  /** Suffix sittings read; beyond this the remainder is counted as omitted. */
  sessions: 2000,
  /** Person rows rendered; beyond this the remainder is counted as omitted. */
  rows: 200,
  /**
   * The per-person floor before a cross-line meeting rate is published. Below
   * twelve recorded minutes a "share of meeting time" is arithmetic on noise.
   */
  taxFloorMinutes: 12,
  /** The span floor before the workspace/span rate is published. */
  taxFloorPeople: 3,
  /** Sittings needed before a mean minutes-per-sitting figure is published. */
  sittingsFloor: 2,
  /** A sitting longer than a waking day is refused rather than counted. */
  minutesCeiling: 1440,
});

/**
 * How the chair of a sitting stands against one person's declared lines.
 *
 * Exactly one class applies to each charged sitting. There is deliberately NO
 * "chair holds two of this person's lines" class: the matrix engine stores at
 * most one line per (person, manager), so that record cannot exist, and this
 * ledger refuses to declare a class nobody can reach. Its match still requires
 * EXACTLY one line, so if that invariant ever changed, the minutes would fall to
 * `other` — counted as cross-line and attributed to no line — rather than split.
 */
export const MATRIX_MEETING_LOAD_PLACEMENTS = Object.freeze([
  Object.freeze({
    key: 'home',
    label: 'Home manager',
    crossLine: false,
    detail: 'The sitting was chaired by the person’s home manager. These minutes are printed and are NEVER charged to a declared second line — the home line is the person’s own chain of command, not a matrix tax.',
  }),
  Object.freeze({
    key: 'line',
    label: 'One declared line',
    crossLine: true,
    detail: 'The chair holds exactly one of this person’s active declared lines. This is the only class attributed to a named line; the match requires exactly one, so a record that broke the one-line-per-manager invariant would fall to “no declared line” rather than be split.',
  }),
  Object.freeze({
    key: 'other',
    label: 'No declared line',
    crossLine: true,
    detail: 'The chair holds no active declared line for this person (a skip-level, a peer or a leader above the home manager). The minutes are real and are counted as cross-line, never attributed to a line.',
  }),
  Object.freeze({
    key: 'self',
    label: 'The person’s own forum',
    crossLine: false,
    detail: 'The person chaired the sitting themselves. Counted as their own meeting time and never as a tax another line imposed.',
  }),
  Object.freeze({
    key: 'no-chair',
    label: 'Chair not on the roster',
    crossLine: true,
    detail: 'The forum names a chair who is not on the active roster. The sitting’s minutes are real, its line attribution is impossible, and it is counted as cross-line and printed as unattributed rather than assigned.',
  }),
]);

export const MATRIX_MEETING_LOAD_PLACEMENT_KEYS = Object.freeze(
  MATRIX_MEETING_LOAD_PLACEMENTS.map((p) => p.key),
);

export function meetingLoadPlacement(key) {
  return MATRIX_MEETING_LOAD_PLACEMENTS.find((p) => p.key === key) || null;
}

/**
 * The reason a sitting could not be charged to anybody. Each is COUNTED and
 * printed; none is silently dropped, and none is repaired into a plausible
 * duration or attendee list.
 */
export const MATRIX_MEETING_LOAD_SESSION_REFUSALS = Object.freeze([
  Object.freeze({
    key: 'no-forum',
    label: 'Forum not in the register',
    detail: 'The sitting names a forum that is not in the forum register, so its chair — and therefore its line attribution — does not exist.',
    blamesDuration: false,
    blamesAttendance: true,
  }),
  Object.freeze({
    key: 'no-minutes',
    label: 'Duration not recorded',
    detail: 'The sitting carries no readable duration (blank, zero, negative or longer than a day). Its minutes are unknown, so every attendee’s total is BLANK rather than understated. Nothing is assumed.',
    blamesDuration: true,
    blamesAttendance: false,
  }),
  Object.freeze({
    key: 'no-attendees',
    label: 'Nobody recorded as attending',
    detail: 'The sitting names no attendee. Its duration is real but its cost cannot be placed on anybody, so it is counted and charged to no person.',
    blamesDuration: false,
    blamesAttendance: true,
  }),
  Object.freeze({
    key: 'unknown-attendee',
    label: 'An attendee is not on the roster',
    detail: 'At least one attendee id does not resolve to the active roster. The population of the room cannot be validated, so the sitting is refused whole rather than charged to the attendees we happen to recognise.',
    blamesDuration: false,
    blamesAttendance: true,
  }),
]);

export const MATRIX_MEETING_LOAD_SESSION_REFUSAL_KEYS = Object.freeze(
  MATRIX_MEETING_LOAD_SESSION_REFUSALS.map((r) => r.key),
);

/**
 * The person-state ladder. `severity` is the ONLY place precedence is stated, so
 * the panel, the brief and the export cannot disagree about which word applies.
 */
export const MATRIX_MEETING_LOAD_PERSON_STATES = Object.freeze([
  Object.freeze({
    key: 'refused',
    severity: 0,
    label: 'Total refused',
    tone: 'bad',
    detail: 'This person attended at least one sitting whose duration or attendance could not be read. Their meeting total is BLANK: a partial sum printed as a total would understate the load they carried, and the missing minutes are counted in the refusal list instead.',
  }),
  Object.freeze({
    key: 'no-attendance',
    severity: 1,
    label: 'No recorded attendance',
    tone: 'neutral',
    detail: 'No held sitting inside the window names this person. Zero is printed as a count of the record — “no sitting recorded” — not as a claim that they attended no meetings.',
  }),
  Object.freeze({
    key: 'measured',
    severity: 2,
    label: 'Measured',
    tone: 'good',
    detail: 'Every sitting this person attended inside the window carries a readable duration and a resolved attendee list, so the total is the exact sum of the sittings printed.',
  }),
]);

export const MATRIX_MEETING_LOAD_PERSON_STATE_KEYS = Object.freeze(
  MATRIX_MEETING_LOAD_PERSON_STATES.map((s) => s.key),
);

export function meetingLoadPersonState(key) {
  return MATRIX_MEETING_LOAD_PERSON_STATES.find((s) => s.key === key) || null;
}

export function meetingLoadSeverity(key) {
  const state = meetingLoadPersonState(key);
  return state ? state.severity : 99;
}

/**
 * The printable conventions. The panel renders these verbatim; it does not
 * paraphrase them, and the export repeats the same declarations.
 */
export const MATRIX_MEETING_LOAD_CONVENTIONS = Object.freeze([
  Object.freeze({
    key: 'duration',
    label: 'Duration source',
    value: 'the whole minutes recorded on each sitting',
    detail: 'Never a forum default, never an assumed hour. A sitting with no readable duration refuses the totals of everyone who attended it.',
  }),
  Object.freeze({
    key: 'attendance',
    label: 'Attendance source',
    value: 'the sitting’s own attendee list',
    detail: 'The forum’s declared attendance is never substituted for who actually sat in the room. A sitting that names nobody charges nobody.',
  }),
  Object.freeze({
    key: 'person-minutes',
    label: 'Meeting cost',
    value: 'exact integer person-minutes = minutes × attendees, sitting by sitting',
    detail: 'Every figure is a whole number of minutes. No rounding is applied anywhere, so the printed total is the computed total.',
  }),
  Object.freeze({
    key: 'cross-line',
    label: 'Cross-line minutes',
    value: 'minutes in sittings chaired by anyone other than the person’s home manager',
    detail: 'This is the coordination tax as it can actually be measured: time convened by a line other than the one the person reports to. The person’s own forums are excluded from the tax and printed separately.',
  }),
  Object.freeze({
    key: 'rate-floor',
    label: 'Rate floor',
    value: `per person: ${MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes} recorded minutes; per span: ${MATRIX_MEETING_LOAD_BOUNDS.taxFloorPeople} measured people`,
    detail: 'Below the floor the counts are printed and the rate is BLANK with the reason in its own field. A proportion of a few minutes is arithmetic, not a reading.',
  }),
  Object.freeze({
    key: 'window',
    label: 'Window',
    value: 'one named period, the same window as the allocation ledger',
    detail: 'Sittings are placed by the day they actually sat. A sitting outside the window belongs to another period and is counted as outside, never stretched in.',
  }),
  Object.freeze({
    key: 'no-rating',
    label: 'No grading',
    value: 'minutes are never a performance measure',
    detail: 'A person with many minutes is not “bad at focus” and a forum with many minutes is not “wasteful”. This ledger prices a calendar so a leader can decide what to change; it ranks nobody and it changes nothing.',
  }),
]);

/**
 * The named methods. Nothing here is decoration: each entry states what the
 * arithmetic is and what it is not, in the words the panel prints.
 */
export const MATRIX_MEETING_LOAD_METHOD = Object.freeze([
  Object.freeze({
    name: 'Time-driven activity-based costing (Kaplan & Anderson, 2004)',
    why: 'The cost driver of a meeting is its duration multiplied by the people in the room. Recording a real duration per sitting — rather than a nominal hour — is what makes the driver measurable; the ledger simply multiplies and sums it.',
  }),
  Object.freeze({
    name: 'Coordination cost in the matrix (Galbraith, 1971; Bartlett & Ghoshal, 1990)',
    why: 'A matrix substitutes lateral integration for vertical command, and lateral integration is paid for in meeting hours. Splitting those hours into “convened by my own line” and “convened by another line” is the only way to see what the lateral structure is actually costing the person carrying it.',
  }),
  Object.freeze({
    name: 'Communication overhead (Brooks, 1975)',
    why: 'Attendee-sittings — the number of person-slots a forum consumed — grows with the number of people coupled into it. It is printed as a coupling count, not as a productivity score, and nothing here infers that a smaller meeting would have been better.',
  }),
  Object.freeze({
    name: 'Attention as a scarce resource (Simon, 1971; Ocasio, 1997)',
    why: 'A person’s week is finite and a matrix divides the claim on it among lines. Meeting minutes are the part of that claim the record can prove, which is why they are printed beside the declared allocation rather than instead of it.',
  }),
  Object.freeze({
    name: 'Refusal instead of imputation',
    why: 'A sitting without a duration is not given a default; a sitting with an unknown attendee is not charged to the attendees we recognise; a rate below the declared floor is BLANK with its reason. Each refusal is the ledger working, and each is counted.',
  }),
  Object.freeze({
    name: 'Measure the calendar, never the person',
    why: 'Every verdict belongs to a RECORD — a sitting, a forum, a person’s measured total. Not one word here grades a manager’s effectiveness or a person’s diligence, and no meeting is cancelled, moved or re-declared by this module.',
  }),
]);

/**
 * The export's columns. One workspace summary row plus one row per forum KIND.
 * Aggregate only: no person, no manager, no forum title, no sitting date.
 */
export const MATRIX_MEETING_LOAD_CSV_COLUMNS = Object.freeze([
  'scope',
  'period_from',
  'period_to',
  'period_days',
  'forum_kind',
  'forums_n',
  'active_forums_n',
  'retired_forums_n',
  'sittings_n',
  'held_n',
  'cancelled_n',
  'sittings_no_minutes_n',
  'sittings_no_attendees_n',
  'sittings_unknown_attendee_n',
  'sittings_no_forum_n',
  'sittings_outside_window_n',
  'person_minutes',
  'cross_line_minutes',
  'home_minutes',
  'line_minutes',
  'other_minutes',
  'self_minutes',
  'attendee_sittings_n',
  'people_n',
  'people_measured_n',
  'people_refused_n',
  'people_no_attendance_n',
  'people_withheld_n',
  'coordination_tax_permille',
  'tax_withheld',
  'withheld_reason',
  'tax_floor_minutes',
  'tax_floor_people',
  'minutes_reconcile',
  'figures_complete',
  'line_parity_rows_n',
  'line_parity_rows_omitted_n',
  'line_parity_computed_n',
  'line_parity_refused_n',
  'line_parity_rows_reconcile',
  'line_parity_figures_complete',
]);

export const MATRIX_MEETING_LOAD_LIMITS_TEXT = Object.freeze(
  `Up to ${MATRIX_MEETING_LOAD_BOUNDS.sessions} sittings are read and up to ${MATRIX_MEETING_LOAD_BOUNDS.rows} person rows are rendered; anything beyond is counted and printed as omitted, never silently dropped.`,
);

/** The refusal descriptor for one code. Used by the engine, the panel and the export. */
export function meetingLoadSessionRefusal(key) {
  return MATRIX_MEETING_LOAD_SESSION_REFUSALS.find((r) => r.key === key) || null;
}
