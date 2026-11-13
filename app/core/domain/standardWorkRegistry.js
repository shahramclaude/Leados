/**
 * app/core/domain/standardWorkRegistry.js — closed vocabularies for Leader
 * Standard Work & Tiered Daily Management (ADR-0190, Schema v150, RULE-LSW-01,
 * CSV scope #143, `#/standard-work`).
 *
 * WHAT IS BEING MODELLED. A leader's job has a repeatable part: the go-and-see
 * walk, the tier huddle, the process confirmation, the board review. Mann
 * (*Creating a Lean Culture*, 2005) calls the declared version of that part
 * LEADER STANDARD WORK and makes it the first of four elements of a lean
 * management system; the second is the daily accountability process that
 * carries what a routine FINDS up one tier at a time until a tier can contain
 * it. This register stores three human acts and nothing else:
 *
 *   1. a ROUTINE someone declared (owner, cadence, minutes, the observable
 *      standard, and — in a matrix — the line it is owed under);
 *   2. a first-person CHECK against one calendar slot of that routine
 *      (done as standard · done and an abnormality found · missed, with a reason);
 *   3. a first-person TIER ACT by the leader an abnormality was escalated to
 *      (contained here · returned · escalated one tier further, to a named line).
 *
 * Every state, rate, interval, streak, verdict and roll-up is DERIVED on read.
 * Silence is `unrecorded` — it is never read as `missed with a reason`, and
 * neither is ever read as done. No verdict here describes a person.
 */

export const STANDARD_WORK_ENGINE_VERSION = 'standard-work-2026.11-v1';
export const STANDARD_WORK_ADR = 'ADR-0190';
export const STANDARD_WORK_RULE_ID = 'RULE-LSW-01';
export const STANDARD_WORK_ROUTE = 'standard-work';
export const STANDARD_WORK_CSV_SCOPE = 'standard-work';

export const STANDARD_WORK_EVENTS = Object.freeze({
  DECLARED: 'standardwork.routine.declared',
  RETIRED: 'standardwork.routine.retired',
  CHECKED: 'standardwork.check.recorded',
  TIER_ACTED: 'standardwork.tier.acted',
  CONVENTIONS: 'standardwork.conventions.set',
  SCAN: 'standardwork.scan',
});
export const STANDARD_WORK_EVENT_PREFIX = 'standardwork.';

/**
 * Standard work is every leader's own, so reading, declaring and recording are
 * open to every altitude — the action narrows each one to the person it belongs
 * to. Re-declaring the conventions and re-running the rule are rank 3–5, the
 * window the other registers use.
 */
export const STANDARD_WORK_RIGHTS = Object.freeze({
  READ: 'read-standard-work',
  DECLARE: 'declare-standard-work',
  RECORD: 'record-standard-work',
  GOVERN: 'govern-standard-work',
});

/* ------------------------------------------------------------ vocabularies */

export const STANDARD_WORK_KINDS = Object.freeze([
  Object.freeze({ key: 'gemba', label: 'Gemba walk (go and see)', says: 'Go to where the work is done and compare what is happening with the standard.' }),
  Object.freeze({ key: 'tier-huddle', label: 'Tier huddle / daily accountability', says: 'The short stand-up at the tier board where yesterday’s misses get an owner and a date.' }),
  Object.freeze({ key: 'process-confirmation', label: 'Process confirmation (kamishibai / layered audit)', says: 'Confirm one standard is being followed as written; a deviation is the finding.' }),
  Object.freeze({ key: 'visual-review', label: 'Visual-control review', says: 'Read the board: is it current, and does it show plan against actual?' }),
  Object.freeze({ key: 'safety', label: 'Safety & workplace-organisation check', says: 'A scheduled look for hazards and 5S drift.' }),
  Object.freeze({ key: 'coaching', label: 'Coaching routine', says: 'A scheduled development conversation or improvement-kata cycle.' }),
  Object.freeze({ key: 'handover', label: 'Shift / period handover', says: 'The structured hand-off of open abnormalities to whoever holds the work next.' }),
  Object.freeze({ key: 'improvement', label: 'Improvement follow-up', says: 'A scheduled review of open countermeasures and their evidence.' }),
  Object.freeze({ key: 'other', label: 'Other declared routine', says: 'A recurring leadership duty the kinds above do not name.' }),
]);
export const STANDARD_WORK_KIND_KEYS = Object.freeze(STANDARD_WORK_KINDS.map((row) => row.key));

/** A slot is the unit a routine owes: one working day, one ISO week, one calendar month. */
export const STANDARD_WORK_CADENCES = Object.freeze([
  Object.freeze({ key: 'daily', label: 'Daily', slotWord: 'day', says: 'One slot per declared working weekday.' }),
  Object.freeze({ key: 'weekly', label: 'Weekly', slotWord: 'week', says: 'One slot per ISO week (Monday–Sunday).' }),
  Object.freeze({ key: 'monthly', label: 'Monthly', slotWord: 'month', says: 'One slot per calendar month.' }),
]);
export const STANDARD_WORK_CADENCE_KEYS = Object.freeze(STANDARD_WORK_CADENCES.map((row) => row.key));

/** What the owner said about one slot. `abnormal` IS a completed routine — finding something is the point. */
export const STANDARD_WORK_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'done', label: 'Done — as standard', countsAsDone: true, tone: 'good', says: 'The routine was run and what was seen matched the standard.' }),
  Object.freeze({ key: 'abnormal', label: 'Done — abnormality found', countsAsDone: true, tone: 'warn', says: 'The routine was run and found a deviation from standard. This is the routine working.' }),
  Object.freeze({ key: 'missed', label: 'Missed — with a reason', countsAsDone: false, tone: 'bad', says: 'The owner states the routine was not run and says why. A stated miss is a different fact from silence.' }),
]);
export const STANDARD_WORK_OUTCOME_KEYS = Object.freeze(STANDARD_WORK_OUTCOMES.map((row) => row.key));

/** Where an abnormality goes. `escalated` always names the receiving leader; it is never inferred. */
export const STANDARD_WORK_DISPOSITIONS = Object.freeze([
  Object.freeze({ key: 'contained', label: 'Contained at this tier', says: 'The owner dealt with it and says how.' }),
  Object.freeze({ key: 'escalated', label: 'Escalated to the next tier', says: 'This tier cannot contain it. The receiving leader is one of the owner’s own line managers, named by the owner.' }),
]);
export const STANDARD_WORK_DISPOSITION_KEYS = Object.freeze(STANDARD_WORK_DISPOSITIONS.map((row) => row.key));

/** What the receiving tier did with an escalated abnormality. */
export const STANDARD_WORK_TIER_ACTS = Object.freeze([
  Object.freeze({ key: 'contained', label: 'Contained at this tier', closes: true, says: 'This tier resolved it and says how.' }),
  Object.freeze({ key: 'returned', label: 'Returned to the sender', closes: true, says: 'This tier sends it back with a reason. It closes the hop; it is counted apart from containment and never as one.' }),
  Object.freeze({ key: 'escalated', label: 'Escalated one tier further', closes: false, says: 'This tier cannot contain it either. The next leader is one of the actor’s own line managers, named by the actor.' }),
]);
export const STANDARD_WORK_TIER_ACT_KEYS = Object.freeze(STANDARD_WORK_TIER_ACTS.map((row) => row.key));

/** Derived per-slot state. Three closed states and two that are not owed. */
export const STANDARD_WORK_SLOT_STATES = Object.freeze([
  Object.freeze({ key: 'done', label: 'done', glyph: '●', closed: true }),
  Object.freeze({ key: 'abnormal', label: 'done · abnormality', glyph: '◆', closed: true }),
  Object.freeze({ key: 'missed', label: 'missed (reason given)', glyph: '✕', closed: true }),
  Object.freeze({ key: 'unrecorded', label: 'unrecorded', glyph: '○', closed: true }),
  Object.freeze({ key: 'open', label: 'open — still inside its period', glyph: '·', closed: false }),
]);

/** Derived per-routine verdict, most serious first. It describes the ROUTINE'S record, never the owner. */
export const STANDARD_WORK_VERDICTS = Object.freeze([
  Object.freeze({ key: 'lapsed', label: 'Lapsed', tone: 'bad', rank: 0, says: 'The most recent closed slots in a row — at least the declared run — are not done.' }),
  Object.freeze({ key: 'gaps', label: 'Gaps', tone: 'warn', rank: 1, says: 'Some closed slots in the window are not done, short of the declared run.' }),
  Object.freeze({ key: 'held', label: 'Held', tone: 'good', rank: 2, says: 'Every closed slot in the window is done.' }),
  Object.freeze({ key: 'new', label: 'No closed slot yet', tone: 'neutral', rank: 3, says: 'The routine has not yet owed a whole slot inside the window; there is nothing to read.' }),
]);
export const STANDARD_WORK_VERDICT_KEYS = Object.freeze(STANDARD_WORK_VERDICTS.map((row) => row.key));

/**
 * Who the tier above this routine is. In a single chain it is the home-line
 * manager. In a matrix it is ONLY the manager of the line the routine was
 * declared under — an owner with several active lines and no named line has no
 * knowable next tier, and that is printed, never resolved to the home line.
 */
export const STANDARD_WORK_TIER_STATES = Object.freeze([
  Object.freeze({ key: 'single-line', label: 'One line', resolved: true, says: 'The owner holds exactly one active line; its manager is the next tier.' }),
  Object.freeze({ key: 'named-line', label: 'Named line', resolved: true, says: 'The routine names one of the owner’s active lines; that line’s manager is the next tier.' }),
  Object.freeze({ key: 'top-tier', label: 'Top tier', resolved: false, says: 'The owner is the workspace leader. Nobody sits above this routine, so nothing is escalated.' }),
  Object.freeze({ key: 'ambiguous', label: 'Line not named', resolved: false, says: 'The owner holds several active lines and the routine names none. The next tier is not knowable and is not guessed.' }),
  Object.freeze({ key: 'line-ended', label: 'Named line ended', resolved: false, says: 'The line this routine was declared under is no longer active. The home line is not substituted.' }),
  Object.freeze({ key: 'off-roster', label: 'Owner off roster', resolved: false, says: 'The owner is no longer on the active roster; the routine owes nothing and is kept as history.' }),
]);
export const STANDARD_WORK_TIER_STATE_KEYS = Object.freeze(STANDARD_WORK_TIER_STATES.map((row) => row.key));

/** Derived state of one escalated abnormality. */
export const STANDARD_WORK_ESCALATION_STATES = Object.freeze([
  Object.freeze({ key: 'overdue', label: 'Overdue at tier', tone: 'bad', open: true, says: 'The receiving leader has held it longer than the declared tier window without acting.' }),
  Object.freeze({ key: 'open', label: 'With the tier', tone: 'warn', open: true, says: 'Inside the declared tier window, awaiting the receiving leader’s first act.' }),
  Object.freeze({ key: 'unattributable', label: 'Holder off roster', tone: 'bad', open: true, says: 'The leader it was addressed to is no longer on the active roster. Nobody is substituted.' }),
  Object.freeze({ key: 'contained', label: 'Contained', tone: 'good', open: false, says: 'A tier resolved it and said how.' }),
  Object.freeze({ key: 'returned', label: 'Returned', tone: 'neutral', open: false, says: 'A tier sent it back with a reason. Closed, and counted apart from containment.' }),
]);
export const STANDARD_WORK_ESCALATION_STATE_KEYS = Object.freeze(STANDARD_WORK_ESCALATION_STATES.map((row) => row.key));

/**
 * Structured-time reference bands. Mann (Creating a Lean Culture, 2005) gives approximate shares
 * of a leader's time that standard work should structure, falling with
 * altitude: team leaders about four-fifths, supervisors about half,
 * value-stream managers about a quarter, executives a tenth to a sixth. LeadOS
 * has five altitudes and Mann four roles, so the mapping below is LeadOS's
 * adaptation, printed as a REFERENCE band — never a target the workspace set,
 * and never a trigger for any automation.
 */
export const STANDARD_WORK_STRUCTURE_BANDS = Object.freeze({
  frontline: Object.freeze({ lowPct: 50, highPct: 80, basis: 'team leader ≈ 80% · supervisor ≈ 50%' }),
  manager: Object.freeze({ lowPct: 25, highPct: 50, basis: 'supervisor ≈ 50% · value-stream manager ≈ 25%' }),
  director: Object.freeze({ lowPct: 15, highPct: 25, basis: 'value-stream manager ≈ 25% · executive ≈ 10–15%' }),
  exec: Object.freeze({ lowPct: 10, highPct: 15, basis: 'executive ≈ 10–15%' }),
  chief: Object.freeze({ lowPct: 10, highPct: 15, basis: 'executive ≈ 10–15%' }),
});
export const STANDARD_WORK_STRUCTURE_VERDICTS = Object.freeze([
  Object.freeze({ key: 'below-band', label: 'Below the reference band', tone: 'warn' }),
  Object.freeze({ key: 'in-band', label: 'Inside the reference band', tone: 'good' }),
  Object.freeze({ key: 'above-band', label: 'Above the reference band', tone: 'warn' }),
  Object.freeze({ key: 'no-band', label: 'No altitude, no band', tone: 'neutral' }),
]);

/** What a read refused to print, and why. Refusals are counted, never dropped. */
export const STANDARD_WORK_READ_REFUSALS = Object.freeze([
  Object.freeze({ key: 'thin-slots', says: 'An adherence rate rests on fewer closed slots than the declared floor. The counts are printed; the rate and its interval are withheld.' }),
  Object.freeze({ key: 'tier-unresolved', says: 'A routine has no knowable next tier (line not named, or the named line ended). It is counted; nobody is asked on a guess.' }),
  Object.freeze({ key: 'off-roster', says: 'A routine’s owner or an escalation’s holder is no longer on the active roster. The record is kept as history and owes nothing.' }),
  Object.freeze({ key: 'below-tier', says: 'Routines further than one tier below this seat are counted in the span figure and not listed. Each tier checks the tier beneath it.' }),
  Object.freeze({ key: 'yield-thin', says: 'A finding-yield comparison rests on fewer checks than the declared floor on one side. No comparison is printed.' }),
  Object.freeze({ key: 'matrix-defect', says: 'The reporting graph carries a refused line. Roll-ups that cross it are printed as incomplete.' }),
  Object.freeze({ key: 'truncated', says: 'More rows exist than this screen lists. The totals count all of them; the remainder is counted, not shown.' }),
]);
export const STANDARD_WORK_READ_REFUSAL_KEYS = Object.freeze(STANDARD_WORK_READ_REFUSALS.map((row) => row.key));

/* ------------------------------------------------------- bounds and limits */

export const STANDARD_WORK_LIMITS = Object.freeze({
  routines: 600,
  checks: 20000,
  tierActs: 4000,
  routinesPerOwner: 24,
  titleMin: 4,
  titleMax: 120,
  standardMin: 12,
  standardMax: 600,
  noteMin: 12,
  noteMax: 600,
  minutes: Object.freeze([1, 480]),
  fromDayAheadMax: 60,
  /** One hop per altitude above the frontline; a sixth hop cannot exist. */
  hops: 5,
  asksPerCommit: 8,
  rowsShown: 200,
  /** Checks on each side before a finding-yield comparison is attempted. */
  yieldMinChecks: 8,
  yieldAlpha: 0.05,
});

export const STANDARD_WORK_SETTING_KEYS = Object.freeze({
  windowDays: 'standardWorkWindowDays',
  minSlots: 'standardWorkMinSlots',
  lapseRun: 'standardWorkLapseRun',
  tierDays: 'standardWorkTierDays',
  weekMinutes: 'standardWorkWeekMinutes',
  autoPropagate: 'standardWorkAutoPropagate',
});

export const STANDARD_WORK_DEFAULTS = Object.freeze({
  windowDays: 28,
  minSlots: 5,
  lapseRun: 3,
  tierDays: 2,
  weekMinutes: 2400,
  autoPropagate: true,
});

export const STANDARD_WORK_BOUNDS = Object.freeze({
  windowDays: Object.freeze([7, 180]),
  minSlots: Object.freeze([3, 30]),
  lapseRun: Object.freeze([2, 10]),
  tierDays: Object.freeze([1, 14]),
  weekMinutes: Object.freeze([600, 4800]),
});

export const STANDARD_WORK_SETTING_LABELS = Object.freeze({
  windowDays: 'Adherence read window (days)',
  minSlots: 'Closed slots required before a rate is printed',
  lapseRun: 'Consecutive not-done slots that make a routine lapsed',
  tierDays: 'Days a tier has to act on an escalated abnormality',
  weekMinutes: 'Declared working week (minutes)',
  autoPropagate: 'Standard-work automation (RULE-LSW-01)',
});

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #143. Aggregate only: one workspace row, then one row per routine
 * verdict, per slot state, per escalation state and per routine kind. No owner,
 * manager, line, routine title, standard, note or record id reaches the file.
 */
export const STANDARD_WORK_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'label', 'generated_on', 'window_from', 'window_to',
  'routines_n', 'owners_n', 'closed_slots_n', 'done_n', 'abnormal_n', 'missed_n', 'unrecorded_n', 'open_slots_n',
  'late_checks_n', 'adherence_pct', 'adherence_low_pct', 'adherence_high_pct', 'adherence_withheld_reason',
  'lapsed_n', 'tier_unresolved_n', 'escalations_n', 'escalations_open_n', 'escalations_overdue_n',
  'contained_n', 'returned_n', 'median_hops', 'yield_questions_n',
  'counts_reconcile', 'figures_complete', 'claim_reason', 'engine_version',
]);

export const STANDARD_WORK_CSV_DESCRIPTOR = Object.freeze({
  key: STANDARD_WORK_CSV_SCOPE,
  label: 'Leader standard work & tiered daily management (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'standard-work',
  description: 'One workspace summary row plus one row per routine verdict, slot state, escalation state and routine kind: declared routines, closed calendar slots, first-person checks, the adherence rate with its Wilson interval, lapsed routines and the tier-escalation partition. NO owner, manager, line, routine title, standard, note or record id. A rate below the declared slot floor exports BLANK with its reason — never zero.',
});

/* ------------------------------------------------------------------ method */

export const STANDARD_WORK_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'mann', label: 'Leader standard work (Mann, Creating a Lean Culture, 2005)', says: 'The repeatable part of a leader’s job is declared, visible and checked; a missed routine is itself an abnormality the tier above goes to see.' }),
  Object.freeze({ key: 'tiered', label: 'Tiered daily management / daily accountability', says: 'What a routine finds is contained at the lowest tier able to contain it and otherwise rises one tier at a time, with a date on every hop.' }),
  Object.freeze({ key: 'kamishibai', label: 'Kamishibai & layered process audits (AIAG CQI-8)', says: 'Each layer of leadership confirms a standard on a schedule. A confirmation that never finds anything is examined, not celebrated.' }),
  Object.freeze({ key: 'wilson', label: 'Wilson score interval (Wilson, 1927)', says: 'A completion rate over a handful of slots is printed with its 95% interval, and withheld below the declared floor.' }),
  Object.freeze({ key: 'exact', label: 'Clopper–Pearson bound & Fisher’s exact test', says: 'Zero findings in n checks bounds the true finding rate at 1 − 0.05^(1/n); a routine’s yield is compared with the pooled yield of the same kind exactly, with a Bonferroni correction across every routine tested.' }),
  Object.freeze({ key: 'galbraith', label: 'Lateral relations in a matrix (Galbraith, 1973)', says: 'A leader with two managers has two next tiers. The routine names the line it is owed under; the register never picks one for them.' }),
]);

export const STANDARD_WORK_METHOD = Object.freeze({
  unit: 'one calendar slot of one declared routine × one first-person check',
  slots: 'A daily routine owes one slot per declared working weekday; a weekly routine one per ISO week; a monthly routine one per calendar month. A slot is owed only when the routine was in force for the WHOLE period, so a routine declared mid-week owes nothing for that week. A slot closes when its period ends; a check may be recorded during the period or, marked late, during the very next one. After that the slot is unrecorded for good — it cannot be back-filled.',
  adherence: 'Adherence = closed slots done (as standard, or with an abnormality found) ÷ all closed slots in the window. A stated miss and silence both count against it and are printed apart.',
  tiers: 'An escalated abnormality is addressed to a named line manager of whoever escalates it and becomes a dated ask in that leader’s queue. Each tier may contain it, return it, or escalate once more. Nothing skips a tier automatically.',
  yieldTest: 'For a routine with no finding in the window, the exact one-sided 95% upper bound on its true finding rate is printed. Where it and the other routines of its kind each have enough checks, Fisher’s exact test compares them; a result is raised only as a question for the next go-and-see.',
  notSaid: 'Adherence is not performance. A held routine says the leader looked; it does not say the process is healthy. A lapsed routine says the record stopped; it does not say why. A yield question is a question. None of these is a rating of a person, and none is used to rank anyone.',
});

export const STANDARD_WORK_ASK_SUMMARY_PREFIX = 'Standard-work condition: ';
export const STANDARD_WORK_CLOSED_PREFIX = `Closed by ${STANDARD_WORK_RULE_ID}:`;
export const STANDARD_WORK_MARKER_KIND = 'standard-work';
