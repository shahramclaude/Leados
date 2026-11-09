/**
 * app/core/domain/onboardingMatrixRegistry.js — the declared vocabulary of Matrix
 * Onboarding Completeness (ADR-0150, Schema v125, `RULE-ONB-01`,
 * `#/onboarding?panel=matrix`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. On Monday Sam joins the team. Dana is her
 * functional manager and owns the 30-60-90 plan; Priya has bought 40% of her for
 * a project that started the same week. The plan names role clarity, a buddy, the
 * stakeholders to meet, an early win and three check-ins — all of it written by
 * one line about one job. Nothing in the workspace records that Priya's line has
 * any onboarding obligation at all, so the plan reads as the whole story while a
 * second manager has said nothing to anyone about what Sam owes that project, who
 * she must meet there, or what her first piece of work on it is. If Priya had been
 * told and had answered nothing, the record would look identical.
 *
 * THE SECOND FAILURE, WHICH IS WORSE. `onboardingSummary` counts PLANS. A matrix
 * person can therefore hold two concurrent 30-60-90 plans, one opened by each
 * manager, and every count in the product reads two plans and one person as
 * though the person had been onboarded twice — or as though either plan described
 * the whole job. Neither reading is true, and both are invisible.
 *
 * WHAT THIS MODULE IS. One bounded read model that puts the matrix around the
 * existing 30-60-90 machinery: for one person's onboarding window, which lines
 * were in force, what each line actually committed to in writing, whose word it
 * was, whether the person acknowledged it, and — separately and never collapsed —
 * whether the plan itself is healthy.
 *
 * WHAT IT IS NEVER ALLOWED TO DO (Bulletproof Reliability Mandate)
 * ---------------------------------------------------------------
 *  - It never COUNTS A PERSON TWICE. One case per person; lines are rows inside
 *    the case. `peopleN` is a count of distinct people, never of plan-line pairs.
 *  - It never reads a completed plan as cross-line completion. `planComplete` and
 *    `crossLineComplete` are two different claims and are printed as two figures.
 *  - It never treats silence as agreement. An unbriefed line reads `unbriefed`, an
 *    unacknowledged brief reads `briefed` — never `complete`.
 *  - It never calls the home line "covered" on evidence. With no brief the home
 *    line reads `presumed`, and the presumption is named on every surface.
 *  - It never derives a line's share of a person. A declared share is printed as
 *    declared, or as undeclared; the module invents no allocation.
 *  - It never rates the joiner. Nothing here is a score, grade or read on the
 *    person's capability; every row is about what a LINE or a PLAN did.
 *  - It is INERT in a single-chain workspace: no case, no row, no ask, no edge, and
 *    every existing 30-60-90 plan behaves exactly as it did before.
 */

export const ONBOARDING_MATRIX_ENGINE_VERSION = 'onboarding-matrix-2026.11-v1';

/** The one rule this module adds to the shared spine. */
export const ONBOARDING_MATRIX_RULE_ID = 'RULE-ONB-01';

/**
 * Two declared events, each one human act, plus the two existing lifecycle
 * events that make the rule look again. There is deliberately no "ask" event: an
 * onboarding obligation is DERIVED from the plan and the lines in force, so
 * storing an ask would be a second copy of a fact the workspace already holds and
 * a second thing that can drift from it. What is stored is the answer — the brief
 * itself — because words a manager wrote are not derivable from anything.
 */
export const ONBOARDING_MATRIX_EVENTS = Object.freeze({
  BRIEF: 'onboarding.line.briefed',
  ACKNOWLEDGE: 'onboarding.line.acknowledged',
  PLAN_CREATED: 'onboarding.created',
  PLAN_UPDATED: 'onboarding.updated',
  LINE_DECLARED: 'matrix.line.declared',
});

/** An explicit operator retry for work a cap deferred. Changes no declaration. */
export const ONBOARDING_MATRIX_SCAN_EVENT = 'onboarding.matrix.scan';

/**
 * The eight states a line can be in for one person's onboarding window. Each is a
 * different fact about the organisation and implies a different next action, so
 * each is printed with its own word.
 */
export const ONBOARDING_MATRIX_STATES = Object.freeze({
  /** A brief exists and the PERSON has acknowledged it, dated. The only state that counts as coverage. */
  acknowledged: 'acknowledged',
  /** A manager wrote the line's commitment; the person has not (yet) acknowledged it. */
  briefed: 'briefed',
  /** A brief exists and the acknowledgement window has passed with no acknowledgement. */
  acknowledgementOverdue: 'acknowledgement-overdue',
  /**
   * The line holder answered in writing that this person carries no onboarding
   * obligation on their line yet, with a stated reason. That is an ANSWER, not a
   * gap — but it is explicitly NOT coverage, and it is never counted as one.
   */
  declined: 'declined',
  /** No brief, and the declared brief window has passed. The gap this module exists to name. */
  unbriefed: 'unbriefed',
  /** No brief, and the window is still open. Nothing is late; nothing is settled. */
  awaitingBrief: 'awaiting-brief',
  /**
   * The home line with no brief. The 30-60-90 plan itself carries that line's
   * obligations (role clarity, buddy, early win, check-ins), so this is not a gap
   * — but it is a PRESUMPTION, printed as one, and never upgraded to evidence.
   */
  presumed: 'presumed',
  /** The line does not overlap the onboarding window. Not a gap and not a zero. */
  excluded: 'excluded',
});

export const ONBOARDING_MATRIX_STATE_LABELS = Object.freeze({
  acknowledged: 'Brief acknowledged by the person',
  briefed: 'Briefed by the line',
  'acknowledgement-overdue': 'Briefed, acknowledgement overdue',
  declined: 'Declined, with reason',
  unbriefed: 'Never briefed',
  'awaiting-brief': 'Awaiting the line’s brief',
  presumed: 'Carried by the plan (presumed)',
  excluded: 'Outside the onboarding window',
});

export const ONBOARDING_MATRIX_STATE_TONES = Object.freeze({
  acknowledged: 'good',
  briefed: 'warn',
  'acknowledgement-overdue': 'bad',
  declined: 'neutral',
  unbriefed: 'bad',
  'awaiting-brief': 'warn',
  presumed: 'caution',
  excluded: 'neutral',
});

/**
 * A line is SETTLED when a human act has closed it — acknowledged by the person,
 * or declined with a reason by the line's holder. A presumption does not settle a
 * line; an outstanding brief does not either.
 */
export const ONBOARDING_MATRIX_SETTLED_STATES = Object.freeze([
  ONBOARDING_MATRIX_STATES.acknowledged,
  ONBOARDING_MATRIX_STATES.declined,
]);

/**
 * Overall verdict for one onboarding case. EIGHT different claims; the panel
 * prints the selected one on its own line with the counts beside it, because a
 * single reassuring word ("onboarded") would collapse all of them.
 *
 * `severity` is the sort order used by the board and by the rule; lower is worse.
 * Precedence is declared HERE so the rule, the panel and the CSV cannot disagree.
 */
export const ONBOARDING_MATRIX_VERDICTS = Object.freeze([
  {
    key: 'unplanned-matrix',
    label: 'No 30-60-90 plan at all',
    severity: 0,
    tone: 'bad',
    open: true,
    detail: 'This person sits on more than one reporting line and has no active 30-60-90 plan. Two managers each believe the other one is onboarding them, and the workspace has no record of either.',
  },
  {
    key: 'duplicate-plans',
    label: 'Two concurrent plans for one person',
    severity: 1,
    tone: 'bad',
    open: true,
    detail: 'More than one active plan of the same kind covers this person. Each line opened its own 30-60-90 and neither is the account of the job; the plan counts in this workspace overstate how many people are being onboarded.',
  },
  {
    key: 'unbriefed-line',
    label: 'A line never said what it expects',
    severity: 2,
    tone: 'bad',
    open: true,
    detail: 'A line in force during the onboarding window has written nothing about what this person owes it, and the declared brief window has passed. The plan reads as complete while a manager has never stated the job.',
  },
  {
    key: 'acknowledgement-overdue',
    label: 'Person has not acknowledged a brief',
    severity: 3,
    tone: 'bad',
    open: true,
    detail: 'A line wrote its expectations and the person has not acknowledged them inside the declared window. Expectation set by one party is not an agreement between two.',
  },
  {
    key: 'awaiting-brief',
    label: 'A line’s brief is still inside its window',
    severity: 4,
    tone: 'warn',
    open: true,
    detail: 'A line in force has not written its brief yet and the declared window has not closed. Nothing is late; nothing is settled either, so the case cannot be read as cross-line complete.',
  },
  {
    key: 'unacknowledged',
    label: 'Briefed, awaiting the person',
    severity: 5,
    tone: 'warn',
    open: true,
    detail: 'Every line that was due has written its brief and at least one of those briefs has not been acknowledged by the person yet, inside its window.',
  },
  {
    key: 'settled-with-declines',
    label: 'Settled — a line declined its own onboarding',
    severity: 6,
    tone: 'neutral',
    open: false,
    detail: 'Every line is settled and at least one line’s holder stated in writing that this person carries no onboarding obligation there yet. That is a dated human answer, not a gap — and it is not coverage either.',
  },
  {
    key: 'complete',
    label: 'Every line onboarded this person',
    severity: 7,
    tone: 'good',
    open: false,
    detail: 'Every line in force during the window is settled: each wrote its brief and the person acknowledged it, or the line holder declined with a stated reason. The home line’s presumption is named on the case, never counted as an answer.',
  },
  {
    key: 'single-line',
    label: 'Single line — nothing to reconcile',
    severity: 8,
    tone: 'neutral',
    open: false,
    detail: 'This person reported to one manager for the whole window. The ordinary 30-60-90 applies; no matrix step is required, and this module adds no row to it.',
  },
]);

export const ONBOARDING_MATRIX_VERDICT_KEYS = Object.freeze(ONBOARDING_MATRIX_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(ONBOARDING_MATRIX_VERDICTS.map((v) => [v.key, v]));

export function onboardingMatrixVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/** Bound on stored rows and text. Every cap is counted, never silent. */
export const ONBOARDING_MATRIX_LIMITS = Object.freeze({
  /** Brief rows per case. A re-brief is a new row; history is kept. */
  briefs: 24,
  /** Characters in the scope the line wrote. */
  scopeChars: 2000,
  /** Characters in the line's stated first piece of work. */
  firstWorkChars: 600,
  /** Stakeholders a line may require the person to meet. */
  stakeholders: 12,
  /** Characters in one stakeholder name. */
  stakeholderChars: 120,
  /** Characters in a decline reason. */
  reasonChars: 400,
  /** Characters in the person's own acknowledgement. */
  acknowledgementChars: 600,
  /** Rows the board renders before the remainder is counted only. */
  board: 40,
  /** Rule idempotency markers retained for this module. */
  markers: 400,
});

/**
 * The two rights this module declares on the seat spine. They are NOT the same
 * act and are deliberately separate: `brief-onboarding-line` is a manager's own
 * statement about the line they hold, and `acknowledge-onboarding-line` is the
 * person's own act. Neither can perform the other's.
 */
export const ONBOARDING_MATRIX_RIGHTS = Object.freeze({
  brief: 'brief-onboarding-line',
  acknowledge: 'acknowledge-onboarding-line',
});

/** Bound on the two declared windows, in whole days. */
export const ONBOARDING_MATRIX_BOUNDS = Object.freeze({
  briefDays: Object.freeze([1, 30]),
  acknowledgeDays: Object.freeze([1, 90]),
});

export const ONBOARDING_MATRIX_DEFAULTS = Object.freeze({
  /** Days after the plan starts by which every line in force owes its brief. */
  briefDays: 7,
  /** Days a brief may stand unacknowledged by the person before it reads overdue. */
  acknowledgeDays: 14,
});

/** The 90-day window every plan is measured over. */
export const ONBOARDING_MATRIX_WINDOW_DAYS = 90;

/** Why a brief can be refused. Named so the panel and CSV cannot invent a word. */
export const ONBOARDING_MATRIX_REFUSALS = Object.freeze({
  singleLine: 'This person holds a single reporting line. The 30-60-90 plan already carries that line’s obligations, so the matrix step is inert and a line brief would be a second copy of the same claim.',
  noPlan: 'Only an active 30-60-90 plan can be reconciled. This person has none, which is itself a finding rather than a reason to accept a brief against an imaginary plan.',
  outsideWindow: 'This reporting line does not overlap the onboarding window, so a brief against it would describe a job that did not exist in those 90 days.',
  scopeTooShort: 'A line brief must state, in words, what this person owes this line. A brief shorter than a sentence is not an expectation anybody could work to.',
  duplicateBrief: 'This line’s current brief already says exactly this. A second identical row would add no commitment and would reset the person’s acknowledgement for no reason.',
  notLineHolder: 'Only the manager who holds this line may state what it expects. A peer, another line’s manager or the workspace operator may not write it for them.',
  notThePerson: 'Only the person themselves may acknowledge what a line expects of them. A manager cannot acknowledge on their behalf — that is exactly the shadow accountability this module exists to prevent.',
  noBriefToAcknowledge: 'There is no current brief on this line to acknowledge. Nothing is inferred from silence.',
});
