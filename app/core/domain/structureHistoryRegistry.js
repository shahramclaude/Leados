/**
 * app/core/domain/structureHistoryRegistry.js — the declared vocabulary of Matrix
 * Reorganisation Reconciliation & As-Of Structure Reads (ADR-0149, Schema v124,
 * `#/structure-history`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. On 1 March a director moves eleven people
 * between teams. In April a VP opens the matrix ledger and asks a question no
 * screen in this product could answer:
 *
 *   "Priya accepted 40% of Sam on the 12th of February. On that day Sam was on
 *    Dana's line. Dana is no longer Sam's manager. Which manager was Sam's
 *    manager on the day Priya said yes — and is the acceptance I am reading
 *    against the structure that actually existed, or against today's?"
 *
 * `person.managerId` is a POINTER. It holds where a person sits NOW, and the
 * workspace stores no record of where they sat before. Every stored act in every
 * module that names a manager — a line acceptance, a review's line set, a
 * consent, an arbitration, a delegation's owner — therefore gets silently
 * re-pointed at a structure that did not exist on the day it was written. That
 * is not a display bug. It is the difference between an audit trail and a story
 * told about the present, and a director cannot make a comparability call on it.
 *
 * WHAT THIS MODULE IS. A DATED STRUCTURE LEDGER over the reporting lines the
 * product already declares, plus an AS-OF READER that answers "what did the
 * structure look like on this day, and can you prove it?" for any day in the
 * record. It does not replace `buildChain`; it wraps it, exactly as the matrix
 * layer does.
 *
 * WHY "UNKNOWN" IS A FIRST-CLASS ANSWER AND NOT A GAP TO BE FILLED
 * ---------------------------------------------------------------
 * A workspace upgraded to v124 has people on it whose manager changed before the
 * ledger existed. The honest reading of a day in that window is NOT "the current
 * structure, probably". It is `unknown`, with the reason printed and the whole
 * as-of reading refused, because a roll-up over a guessed structure is a
 * fabricated comparability claim. Back-filling the current pointer across every
 * historical date would manufacture exactly the lie the module exists to catch —
 * and it would be invisible, because it would look complete.
 *
 * Cross-domain basis:
 *  - Temporal databases (Snodgrass, *Developing Time-Oriented Database
 *    Applications*, 1999): valid time vs transaction time, and the rule that a
 *    query without a temporal qualifier is a query about *now* silently applied
 *    to the past.
 *  - Sarbanes-Oxley §404 / audit-trail practice: a control is not evidenced by
 *    the present state of the system but by its state at the relevant date.
 *  - The reorganisation-comparability literature in org design (Galbraith;
 *    Nadler & Tushman): a restructure is a discontinuity, and series either side
 *    of it are not comparable without an explicit mapping.
 *  - Freeze-line accounting from ADR-0099, whose `previousManagers` evidence is
 *    the one place this product already recorded a before-state — this module
 *    is the generalisation of that idea to the whole roster.
 */

export const STRUCTURE_HISTORY_ENGINE_VERSION = 'structure-history-2026.11-v1';

/** The one rule this module adds to the shared spine. */
export const STRUCTURE_HISTORY_RULE_ID = 'RULE-SHR-01';

/**
 * The four stored events. Every one is a dated human act on ONE reporting
 * relationship. Nothing derived is stored — no span, no depth, no comparability
 * verdict — because a stored span is a number waiting to disagree with the
 * structure it claims to describe.
 */
export const STRUCTURE_HISTORY_EVENTS = Object.freeze({
  /** A home line (`person.managerId`) became the one it is now, from a stated day. */
  HOME_LINE_MOVED: 'structure.home-line.moved',
  /** The ledger was seeded from a frozen design's before/after evidence (ADR-0099). */
  IMPORTED: 'structure.history.imported',
  /**
   * The structure was recorded AS IT STANDS TODAY, for people with no recorded
   * home line. This is not a back-fill: the period starts today and says nothing
   * about any earlier day, which stays honestly unknown.
   */
  STRUCTURE_ESTABLISHED: 'structure.history.established',
  /** Nothing moved; the operator retried outstanding work the cap deferred. */
  SCAN: 'structure.history.scan',
});

/**
 * Observation states for one person on one day. This is the load-bearing
 * distinction of the whole module: an UNOBSERVED line is not the current line.
 *
 *  observed     a dated record covers this day; the manager is known.
 *  unknown      the person is on the roster, the ledger does not cover this day,
 *               and the current pointer therefore cannot be projected backwards
 *               without inventing a fact.
 *  not-on-roster  the person had not started, or had been archived, on that day.
 *               Different from unknown: it is a fact, not a gap.
 */
export const STRUCTURE_OBSERVATION_STATES = Object.freeze({
  observed: 'observed',
  unknown: 'unknown',
  notOnRoster: 'not-on-roster',
});

export const STRUCTURE_OBSERVATION_LABELS = Object.freeze({
  observed: 'Observed',
  unknown: 'Unknown on this day',
  'not-on-roster': 'Not on the roster',
});

export const STRUCTURE_OBSERVATION_TONES = Object.freeze({
  observed: 'good',
  unknown: 'bad',
  'not-on-roster': 'neutral',
});

/**
 * Verdicts for one as-of reading. Declared precedence, so the rule, the panel,
 * the brief and the CSV cannot disagree about which word a day gets.
 */
export const STRUCTURE_VERDICTS = Object.freeze([
  {
    key: 'future',
    label: 'Asking about a day that has not happened',
    severity: 0,
    tone: 'bad',
    open: true,
    detail: 'The date is in the future. There is no structure to read: a workspace cannot report the reporting lines it will have.',
  },
  {
    key: 'unrecorded',
    label: 'The structure on this day was never recorded',
    severity: 1,
    tone: 'bad',
    open: true,
    detail: 'Nobody in scope has a dated home-line record covering this day, so the structure is genuinely unknown. Printing today’s roster instead would be a comparability claim resting on a guess.',
  },
  {
    key: 'partial',
    label: 'Part of the structure on this day is unrecorded',
    severity: 2,
    tone: 'bad',
    open: true,
    detail: 'Some people in scope are observed on this day and some are not. Every derived figure is withheld: a span computed over the observed people only would understate the structure while looking complete.',
  },
  {
    key: 'observed',
    label: 'The structure on this day is recorded',
    severity: 3,
    tone: 'good',
    open: false,
    detail: 'Every person in scope has a dated home-line record covering this day. The reading is derived from those records and reconciles against the headcount.',
  },
]);

export const STRUCTURE_VERDICT_KEYS = Object.freeze(STRUCTURE_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(STRUCTURE_VERDICTS.map((v) => [v.key, v]));
export function structureVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * What changed between two readings, per relationship. `appeared` and
 * `disappeared` are the two that a comparability argument actually turns on: a
 * person who left the roster between the dates is not a person who changed
 * manager, and collapsing the two is how a re-org report understates turnover
 * and overstates movement.
 */
export const STRUCTURE_CHANGE_KINDS = Object.freeze([
  { key: 'moved', label: 'Changed manager' },
  { key: 'appeared', label: 'Joined the roster' },
  { key: 'disappeared', label: 'Left the roster' },
  { key: 'held', label: 'Unchanged' },
]);

export const STRUCTURE_CHANGE_KEYS = Object.freeze(STRUCTURE_CHANGE_KINDS.map((c) => c.key));
const CHANGE_BY_KEY = new Map(STRUCTURE_CHANGE_KINDS.map((c) => [c.key, c]));
export function structureChange(kind) {
  return CHANGE_BY_KEY.get(String(kind || '').trim()) || null;
}

/**
 * What a recorded act's manager-pointer resolves to when re-read against the
 * structure that stood on the day it was written. This is the reconciliation the
 * module exists for, and the four answers are deliberately not collapsible.
 */
export const STRUCTURE_ACT_STATES = Object.freeze([
  {
    key: 'consistent',
    label: 'Reads against the structure of its own day',
    tone: 'good',
    detail: 'The manager the act names was, on the day it was written, the manager that person actually reported to. The act’s meaning has not drifted.',
  },
  {
    key: 'drifted',
    label: 'Reads against a structure that no longer exists',
    tone: 'bad',
    detail: 'The act names a manager who was NOT that person’s manager on the day it was written, or who is not on the roster now. The act is not wrong — the STRUCTURE moved underneath it, and re-reading it against today’s pointer changes what it appears to mean.',
  },
  {
    key: 'unverifiable',
    label: 'Cannot be checked — the day was never recorded',
    tone: 'warn',
    detail: 'The act’s own date falls in a window the structure ledger does not cover. The act is neither confirmed nor contradicted: this reading refuses to call it either.',
  },
  {
    key: 'undated',
    label: 'The act carries no readable date',
    tone: 'warn',
    detail: 'Without a date there is no structure to read the act against. The act is counted here rather than assumed current.',
  },
]);

export const STRUCTURE_ACT_KEYS = Object.freeze(STRUCTURE_ACT_STATES.map((a) => a.key));
const ACT_BY_KEY = new Map(STRUCTURE_ACT_STATES.map((a) => [a.key, a]));
export function structureActState(key) {
  return ACT_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * The stored-act families this module reconciles. Deliberately a DECLARED list
 * rather than a grep: a module added later is not silently reconciled with the
 * wrong date field, and one removed here is one the panel stops claiming.
 *
 * `managerPath` names the pointer on the act that used to be the person's
 * manager. `datePaths` are tried in order — the first readable date wins.
 */
export const STRUCTURE_ACT_SOURCES = Object.freeze([
  Object.freeze({
    key: 'line-consent',
    label: 'Matrix line consent',
    collection: 'lineConsents',
    personPath: 'personId',
    managerPath: 'managerId',
    datePaths: Object.freeze(['decidedOn']),
    why: 'An acceptance or an acknowledgement is a judgement about a line on a day. If the person’s own manager moved afterwards, the act still means what it meant — but re-reading it against today’s pointer makes it look like it was about somebody else.',
  }),
  Object.freeze({
    key: 'reporting-line',
    label: 'Declared reporting line',
    collection: 'reportingLines',
    personPath: 'personId',
    managerPath: 'managerId',
    datePaths: Object.freeze(['fromISO', 'declaredAt']),
    why: 'A declared line is dated in and dated out. The manager on the line is fixed by the declaration, but whether that manager was reachable on that day through the HOME line is what decides if the line was a second line or the only line.',
  }),
  Object.freeze({
    key: 'arbitration',
    label: 'Cross-line priority arbitration',
    collection: 'priorityArbitrations',
    personPath: 'subjectPersonId',
    managerPath: 'arbiterNodeId',
    datePaths: Object.freeze(['openedOn', 'createdAt']),
    why: 'An arbiter was resolved as the minimal common ancestor of the lines as they stood. A re-org can make that ancestor no longer an ancestor at all.',
  }),
]);

/**
 * Bounds. Every cap is counted and printed; none is silent.
 */
export const STRUCTURE_HISTORY_LIMITS = Object.freeze({
  /** Dated structure records kept per workspace. Oldest displaced, printed. */
  records: 4000,
  /** Home-line moves retained per person. */
  perPerson: 60,
  /** Characters in a move's stated reason. */
  reasonChars: 400,
  /** Rule idempotency markers. */
  markers: 1200,
  /** Rows an as-of reading renders before the remainder is counted only. */
  rows: 200,
});

/** The declared reason-window: how long after a re-org the reader flags it. */
export const STRUCTURE_HISTORY_BOUNDS = Object.freeze({
  reviewDays: Object.freeze([7, 730]),
});

export const STRUCTURE_HISTORY_DEFAULTS = Object.freeze({
  reviewDays: 90,
});

/**
 * The declared windows this module prints. Each is clamped, printed and never
 * fitted from the record.
 */
export const STRUCTURE_HISTORY_CONVENTIONS = Object.freeze([
  { key: 'structureHistoryReviewDays', label: 'Days after a reorganisation the reader draws attention to it', bounds: [7, 730], fallback: 90 },
]);

/** Rights: reading history is reading the matrix; moving a home line is a write. */
export const STRUCTURE_HISTORY_RIGHTS = Object.freeze({
  read: 'declare-matrix-line',
  move: 'record-structure-change',
});

/** CSV scope #111 — aggregate only. No person, no manager, no act id. */
export const STRUCTURE_HISTORY_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'as_of',
  'days_ago',
  'roster_n',
  'observed_n',
  'unknown_n',
  'not_on_roster_n',
  'verdict',
  'reading_refused',
  'refused_reason',
  'moves_n',
  'gained_n',
  'lost_n',
  'held_n',
  'manager_n',
  'act_source',
  'acts_n',
  'acts_consistent_n',
  'acts_drifted_n',
  'acts_unverifiable_n',
  'acts_undated_n',
  'uncovered_from',
  'coverage_start',
]);

/** What the panel prints about its own method. */
export const STRUCTURE_HISTORY_METHOD = Object.freeze([
  Object.freeze({
    name: 'Valid time vs transaction time (Snodgrass, 1999)',
    why: 'A home line has a period during which it was TRUE and a moment at which it was RECORDED. This ledger stores both, because conflating them is how a back-dated correction silently rewrites a period that other acts were judged against.',
  }),
  Object.freeze({
    name: 'Freeze-line comparability (ADR-0099, extended)',
    why: 'A reorganisation is a discontinuity: readings either side of it are not comparable without an explicit mapping. This module supplies the mapping for the roster itself, so the freeze-line audit no longer has to rely on a design record being present.',
  }),
  Object.freeze({
    name: 'Audit-trail integrity (the SOX §404 reading)',
    why: 'A control is evidenced by the state of the system at the relevant date, not by its present state. A stored act that cannot be read against the structure of its own day is not evidence, and this module says so instead of printing it as if it were.',
  }),
  Object.freeze({
    name: 'Refusal instead of projection',
    why: 'Where the ledger does not cover a day, the structure that day is UNKNOWN and every derived figure is withheld with the reason. Projecting today’s roster backwards would produce a clean, complete, fabricated reading — the exact failure this module exists to catch.',
  }),
  Object.freeze({
    name: 'Integer arithmetic and exact reconciliation',
    why: 'Spans, move counts and act counts are integer counts over printed rows. A manager’s span is the number of people the reading says reported to them, and the sum is checked against the roster before it is printed.',
  }),
  Object.freeze({
    name: 'What is derived and what is stored',
    why: 'Stored: one dated record per home-line period, and the frozen design evidence imported from ADR-0099. Derived on every read: every observation state, every span, every changed/held verdict, every act reading. A stored span is a number waiting to disagree with the structure it describes.',
  }),
]);

/** Printed on the panel so the reading cannot be mistaken for a present-tense view. */
export const STRUCTURE_HISTORY_LIMITS_TEXT = Object.freeze([
  'This is a reading of the structure that was RECORDED, not of the structure that existed. Where the two differ, the difference is exactly what the “unrecorded” verdict is for.',
  'A day before the first recorded home-line move is unknown, not “probably like today”. No figure is projected backwards across it.',
  'An act is reconciled against the manager it names. The module does not edit, re-point, migrate or withdraw any act: it reports the drift so a human can decide what the act means now.',
  'Moving a home line is a dated, reasoned, first-person act by the manager who holds it or the span above both. Nothing is moved automatically, including by a reorganisation rehearsal.',
  'Seats are workflow declarations, not authentication. A seat check is a routing control, not an identity boundary.',
]);
