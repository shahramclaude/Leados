/**
 * app/core/domain/solvencyRegistry.js — leaf vocabulary for the Promise
 * Solvency Terminal (Schema v80, ADR-0073).
 *
 * Zero imports, so `schema.js`, `solvency.js`, `solvencyRules.js`,
 * `propagationContracts.js`, `csv.js`, `insights.js` and `cases.js` share one
 * canonical vocabulary without a circular dependency.
 *
 * THE QUESTION THIS TERMINAL ANSWERS
 * ----------------------------------
 * Every module in this workspace records a *promise*: a delegation with a due
 * date, a call with a review date, a goal with a date on it, a follow-up owed on
 * feedback, a stakeholder owed a contact, a requisition promised a start date.
 * Each screen shows its own promise. None of them shows the *book*.
 *
 * A first-time leader does not fail because one promise slips. They fail because
 * the book is over-sold: they have promised more than their own measured
 * delivery rate can serve, and they find out one apology at a time. The book is
 * a liability portfolio, the leader's capacity is its capital, and the only
 * honest question is the one every credit desk asks:
 *
 *   Given how this leader actually settles commitments, what is the chance that
 *   at least one promise in the book breaks inside the horizon — and which
 *   single promise is worth renegotiating today?
 *
 * CROSS-DOMAIN FOUNDATIONS ENCODED HERE
 * -------------------------------------
 *  - **Credit portfolio modelling** (Vasicek 1987; Merton 1974; Basel II IRB;
 *    CreditMetrics/Gupton–Finger–Bhatia 1997): promises are exposures, breach is
 *    default, and a one-factor Gaussian copula prices the *joint* probability
 *    that at least one breaks. The single factor is the leader's shared
 *    capacity — the reason promises break together rather than independently.
 *  - **Survival analysis / conditional survival** (Kaplan & Meier 1958; Cox &
 *    Oakes 1984): a promise's breach probability is read off the leader's own
 *    settled history as the conditional survival of the settlement offset, so an
 *    item that has already outlived every recorded settlement is treated as the
 *    near-certain breach it is.
 *  - **Fréchet–Hoeffding bounds** (Fréchet 1951; Hoeffding 1942): with no
 *    dependence assumption at all, P(any) is trapped between max(pᵢ) and
 *    min(1, Σpᵢ). Printed beside the model so a correlation choice can be seen
 *    to move the answer only inside a known interval.
 *  - **Liquidity coverage / maturity laddering** (Basel III LCR, BCBS 2010;
 *    standard bank asset-liability management): obligations bucketed by the date
 *    they fall due against the capacity that will exist to serve them. Called an
 *    analogue, never a regulation.
 *  - **Little's Law** (Little 1961): an open book of L promises against a
 *    measured settlement rate λ implies a clearance time W = L/λ. An identity,
 *    not a forecast, and printed with that assumption.
 *  - **Marginal risk contribution / Euler allocation** (Tasche 1999, 2008):
 *    the value of renegotiating one promise is the drop in the book's joint
 *    breach probability when that exposure is removed — which is not the same as
 *    its own probability, and is the only number that ranks a repair queue.
 *  - **Trust repair asymmetry** (Robinson & Morrison 1995, psychological
 *    contract breach; Kim, Ferrin, Cooper & Dirks 2004, *Journal of Applied
 *    Psychology*): a violation discovered late costs more to repair than one
 *    renegotiated early. The multiplier is DECLARED by the leader and printed —
 *    it is a convention, not a measurement, and this app never dresses a
 *    convention as a statistic.
 *  - **Sunk-cost discipline** (Arkes & Blumer 1985): a date moved for the third
 *    time is not a renegotiation, it is a decision to break the promise slowly.
 *    The registry therefore caps moves and escalates to a governed decision
 *    instead of a fourth reminder.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 * It never invents a promise, a date, a settlement or a breach; every exposure
 * is a dated record another module already keeps. It never rates a person: the
 * counterparty classes are `person`, `org` and `external`, and no individual is
 * scored, ranked or named in an export. And it never treats an unpriced promise
 * as safe — a promise with no measurable history is excluded from the joint
 * probability and *counted out loud*.
 */

export const SOLVENCY_ENGINE_VERSION = 'promise-solvency-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. The promise sources — the registry the whole engine iterates     */
/* ------------------------------------------------------------------ */

/**
 * One source turns a dated record another module owns into a promise.
 *
 *  key               stable id, persisted on frozen readings and in markers
 *  label             the promise in the leader's language
 *  unit              one promise of this kind
 *  settleLabel       what counts as keeping it
 *  counterparty      who is owed it: 'person' | 'org' | 'external'
 *  route             where the record lives, so every exposure is one click away
 *  weight            declared stakes of breaking one of these (1–5), used to
 *                    rank repairs. A convention, printed as one; not a statistic.
 *  question          the sentence the source exists to make answerable
 *
 * Adding a source is one entry here plus one harvester in `solvency.js`; the
 * book, ladder, risk model, repair queue, rules, view and CSV all iterate this
 * array.
 */
export const PROMISE_SOURCES = Object.freeze([
  Object.freeze({
    key: 'delegation',
    label: 'Delegation deadlines',
    unit: 'delegation',
    settleLabel: 'closed (delivered or returned)',
    counterparty: 'person',
    route: '#/delegations',
    weight: 3,
    question: 'did the work I handed over come back when I said it would?',
  }),
  Object.freeze({
    key: 'decision',
    label: 'Decision review dates',
    unit: 'call',
    settleLabel: 'reviewed',
    counterparty: 'org',
    route: '#/decisions',
    weight: 4,
    question: 'did I close the loop on the calls I made?',
  }),
  Object.freeze({
    key: 'goal',
    label: 'Goal dates',
    unit: 'goal',
    settleLabel: 'completed',
    counterparty: 'org',
    route: '#/goals',
    weight: 3,
    question: 'did the outcome land by the date it was promised for?',
  }),
  Object.freeze({
    key: 'followup',
    label: 'Feedback follow-ups',
    unit: 'follow-up',
    settleLabel: 'followed up',
    counterparty: 'person',
    route: '#/feedback',
    weight: 2,
    question: 'did I come back to the person I said I would?',
  }),
  Object.freeze({
    key: 'contact',
    label: 'Stakeholder contact dates',
    unit: 'contact',
    settleLabel: 'contacted',
    counterparty: 'external',
    route: '#/stakeholders',
    weight: 2,
    question: 'did I show up for the stakeholders who were promised a cadence?',
  }),
  Object.freeze({
    key: 'requisition',
    label: 'Hiring start dates',
    unit: 'hire',
    settleLabel: 'closed',
    counterparty: 'org',
    route: '#/hiring',
    weight: 4,
    question: 'did the seat I promised a start date for actually start?',
  }),
]);

export const PROMISE_SOURCE_KEYS = Object.freeze(PROMISE_SOURCES.map((s) => s.key));

export function promiseSource(key) {
  return PROMISE_SOURCES.find((s) => s.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 2. Verdicts                                                        */
/* ------------------------------------------------------------------ */

/** A source's own reliability, measured from its settled history. */
export const SOLVENCY_SOURCE_VERDICTS = Object.freeze([
  'reliable',
  'watch',
  'unreliable',
  'unproven',
]);

export const SOLVENCY_SOURCE_VERDICT_LABELS = Object.freeze({
  reliable: 'Kept on time',
  watch: 'Slipping',
  unreliable: 'Mostly late',
  unproven: 'No history to judge',
});

export const SOLVENCY_SOURCE_VERDICT_TEXT = Object.freeze({
  reliable: 'At least the declared share of this kind of promise settled on or before its date. The source is not where the book is leaking.',
  watch: 'The on-time share sits below the declared bar. The book is leaking here, and it will keep reading this way until the underlying process changes.',
  unreliable: 'Most of these promises settle after their date. Pricing the rest of the book off this source is pricing it off a habit, not a bad week.',
  unproven: 'This source has too few settled promises to judge. Nothing here is assumed — promises of this kind are counted out loud and left out of the joint probability.',
});

/** A promise's own state. */
export const PROMISE_STATES = Object.freeze(['overdue', 'imminent', 'open', 'unpriced', 'settled']);

export const PROMISE_STATE_LABELS = Object.freeze({
  overdue: 'Already late',
  imminent: 'Due inside the horizon',
  open: 'Open, outside the horizon',
  unpriced: 'No measurable history',
  settled: 'Settled',
});

/** What to do with one exposure. */
export const PROMISE_REPAIR_VERDICTS = Object.freeze(['renegotiate', 'watch', 'let-run', 'decide']);

export const PROMISE_REPAIR_LABELS = Object.freeze({
  renegotiate: 'Renegotiate now',
  watch: 'Watch — do not spend the ask yet',
  'let-run': 'Leave it: the promise is very likely to hold',
  decide: 'Decide, do not move the date again',
});

/* ------------------------------------------------------------------ */
/* 3. Ids, events and limits                                          */
/* ------------------------------------------------------------------ */

export const SOLVENCY_RULE_IDS = Object.freeze({
  READ: 'RULE-SLV-01',
  OVERDUE: 'RULE-SLV-02',
  ALARM: 'RULE-SLV-03',
  GRADE: 'RULE-SLV-04',
  RECONCILE: 'RULE-SLV-05',
});

export const SOLVENCY_SIGNAL_IDS = Object.freeze({
  COVERAGE: 'SLV-01',
  OVERDUE: 'SLV-02',
  JOINT: 'SLV-03',
  MARGINAL: 'SLV-04',
  UNPRICED: 'SLV-05',
  UNGRADED: 'SLV-06',
  UNDELIVERABLE: 'SLV-07',
});

export const SOLVENCY_EVENTS = Object.freeze({
  FROZEN: 'solvency.readingFrozen',
  GRADED: 'solvency.readingGraded',
  DELETED: 'solvency.readingDeleted',
  RENEGOTIATED: 'solvency.promiseRenegotiated',
  SCAN: 'solvency.scan',
  CONVENTIONS: 'solvency.conventions',
});

/** Labels for the deadline buckets of the maturity ladder. */
export const SOLVENCY_BUCKETS = Object.freeze([
  Object.freeze({ key: 'b7', label: 'Next 7 days', days: 7 }),
  Object.freeze({ key: 'b14', label: '8–14 days', days: 14 }),
  Object.freeze({ key: 'b28', label: '15–28 days', days: 28 }),
  Object.freeze({ key: 'b56', label: '29–56 days', days: 56 }),
  Object.freeze({ key: 'b90', label: '57–90 days', days: 90 }),
  Object.freeze({ key: 'beyond', label: 'Beyond 90 days', days: Infinity }),
]);

/**
 * Every setting is clamped into a printed range on read. No range contains the
 * value that would silently switch its own test off: a correlation of exactly 1,
 * an alarm of 0%, a history floor of 0 or a breach multiplier of 1 would each
 * make a finding unfalsifiable, so none of them is reachable.
 */
export const SOLVENCY_LIMITS = Object.freeze({
  windowDays: [28, 730],
  windowDaysDefault: 180,
  horizonDays: [7, 365],
  horizonDaysDefault: 56,
  rhoPct: [0, 95],
  rhoPctDefault: 30,
  alarmPct: [5, 95],
  alarmPctDefault: 50,
  onTimeBarPct: [30, 99],
  onTimeBarPctDefault: 80,
  minHistory: [3, 40],
  minHistoryDefault: 5,
  breachMultiplier: [1.5, 10],
  breachMultiplierDefault: 3,
  reviewHorizonDays: [7, 365],
  reviewHorizonDaysDefault: 60,
  readingCap: [2, 40],
  readingCapDefault: 12,
  maxTasks: [1, 6],
  maxTasksDefault: 3,
  maxMoves: [1, 5],
  maxMovesDefault: 2,
  maxExposures: 60,
  maxMarginal: 24,
  maxBuckets: 6,
  quadratureNodes: 400,
});

export const SOLVENCY_CONVENTIONS_NOTE =
  'Every number here is a declared convention, not a statistic: the window the settlement history is '
  + 'measured over, the horizon a promise is priced inside, the single-factor correlation that decides how '
  + 'much promises break together rather than independently, the joint breach probability that raises the '
  + 'alarm, the share of promises that must settle on time for a source to count as reliable, the settled '
  + 'items a source needs before it may be priced at all, and how much more a late breach costs than an '
  + 'early renegotiation.';
