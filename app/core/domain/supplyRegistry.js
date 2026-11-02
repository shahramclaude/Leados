/**
 * app/core/domain/supplyRegistry.js — leaf vocabulary for the Evidence Supply
 * Chain (Schema v79, ADR-0071).
 *
 * Zero imports, so `schema.js`, `supply.js`, `supplyRules.js`,
 * `propagationContracts.js`, `csv.js`, `insights.js` and `cases.js` share one
 * canonical vocabulary without a circular dependency.
 *
 * THE QUESTION THIS TERMINAL ANSWERS
 * ----------------------------------
 * LeadOS refuses to judge on thin evidence. By Session 110 there were dozens of
 * such refusals across the app — "too few verdicts", "below the at-risk floor",
 * "no decision points", "the record cannot separate two people" — and every one
 * of them was a *dead end on a separate screen*. A first-time leader reads
 * fifteen variations of "ask again later" and concludes the tool is broken.
 *
 * The correct frame is a production system, because that is what it is. A
 * judgement is output. Evidence is the input. The workspace manufactures
 * evidence at rates it can measure from its own dated records, and it
 * manufactures some kinds far faster than others. So the only four questions
 * that matter are operational:
 *
 *   1. Which judgements are *starved* — where the record produces the missing
 *      input too slowly for the question to ever close?
 *   2. What is the *bottleneck* — the single evidence line carrying the most
 *      starved demand — because improving anything else is motion, not progress?
 *   3. Is *capturing* the missing evidence now cheaper than *waiting* for it?
 *   4. Which questions should be *retired* rather than left open forever?
 *
 * CROSS-DOMAIN FOUNDATIONS ENCODED HERE
 * -------------------------------------
 *  - **Theory of Constraints** (Goldratt 1984; Goldratt & Cox, *The Goal*): a
 *    system's throughput equals its bottleneck's throughput. "Identify →
 *    exploit → subordinate → elevate" is the only sequence that raises output.
 *    Elevating a non-constraint is the classic local-optimum error.
 *  - **Drum–Buffer–Rope** (Goldratt 1990; Schragenheim & Dettmer 2000): the
 *    bottleneck beats the drum for the whole line, a buffer protects it, and the
 *    rope prevents upstream work from outrunning it. Here the drum is the slowest
 *    evidence line and the rope is the leader's declared evidence hours.
 *  - **Little's Law** (Little 1961): L = λW. Queue length, arrival rate and time
 *    in system are not three facts but one identity — so an open-questions queue
 *    of L items against a measured output rate λ *implies* a wait of W. Printed
 *    as a diagnostic, with its (unchanged-demand) assumption stated.
 *  - **Marginal value of information / optimal stopping** (Raiffa & Schlaifer
 *    1961; Dixit & Pindyck 1994; Stokey 2009): information is worth collecting
 *    only up to the point where its marginal cost exceeds its marginal value,
 *    and that point moves as the underlying decision's value decays. Waiting has
 *    a carrying cost, which is why "keep gathering data" is not a free default.
 *  - **Sunk-cost fallacy** (Arkes & Blumer 1985; Thaler 1980): time already spent
 *    waiting is unrecoverable and must not influence whether to keep waiting.
 *    The retire verdict prices the *future* only.
 *  - **Gamma–Poisson (negative binomial) prediction** (Jeffreys 1946; Good 1965):
 *    with arrivals measured and a Jeffreys prior on the rate, the predictive
 *    distribution of the time to the next k arrivals is closed-form. It is the
 *    honest way to turn "we have seen 3 in six months" into an interval, and it
 *    never prints a point ETA as if it were known.
 *  - **Fréchet–Hoeffding bounds** (Fréchet 1951; Hoeffding 1942): the probability
 *    that *at least one* line clears is bounded by max(p_i) ≤ P(any) ≤ min(1,Σp_i)
 *    with no independence assumption. A frozen plan quotes the assumption-free
 *    bound as its headline and the independence value beside it.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 * It does not invent a refused judgement, a floor, or a count. Every unit is a
 * dated record the workspace already holds; every shortfall is measured against
 * a floor the leader declared. It never rates a person, never scores a team and
 * never reads a confidential conflict or an anonymous pulse response.
 */

export const SUPPLY_ENGINE_VERSION = 'evidence-supply-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. The evidence lines — the registry the whole engine iterates      */
/* ------------------------------------------------------------------ */

/**
 * One line turns dated records into a judgeable quantity.
 *
 *  key             stable id, persisted on frozen plans and in markers
 *  label           what the line produces, in the leader's language
 *  unitLabel       one unit of production ("settled assumption", "call with a
 *                  recorded decision day")
 *  consumerLabel   the surface that cannot judge until the line is full
 *  consumerRoute   where that surface lives, so a met line is one click away
 *  demandLabel     the open work the line's output is for
 *  defaultRequired the count the consuming instrument needs (leader-editable)
 *  defaultMinutes  leader minutes to manufacture ONE unit deliberately
 *  question        the sentence the line exists to make answerable
 *
 * Adding a line is one entry here plus one harvester in `supply.js`; the report,
 * the plan, the rules, the view and the CSV scope all iterate this array.
 */
export const SUPPLY_LINES = Object.freeze([
  Object.freeze({
    key: 'premise-outcome',
    label: 'Assumption settlements',
    unitLabel: 'settled assumption',
    consumerLabel: 'Borrowed evidence & premise calibration',
    consumerRoute: '#/credibility',
    demandLabel: 'open calls resting on an unsettled assumption',
    defaultRequired: 8,
    defaultMinutes: 20,
    question: 'which of my assumptions actually held, and how often?',
  }),
  Object.freeze({
    key: 'decision-resolution',
    label: 'Decisions with a recorded decision day',
    unitLabel: 'call with a decision day',
    consumerLabel: 'Counterfactual policy',
    consumerRoute: '#/counterfactual',
    demandLabel: 'open calls whose alternatives have never been compared',
    defaultRequired: 10,
    defaultMinutes: 15,
    question: 'which of the ways I decide is actually better?',
  }),
  Object.freeze({
    key: 'delegation-delivery',
    label: 'Delegations that closed',
    unitLabel: 'closed delegation',
    consumerLabel: 'Leadership parity & borrowed evidence',
    consumerRoute: '#/parity',
    demandLabel: 'delegations still open past their due date',
    defaultRequired: 12,
    defaultMinutes: 10,
    question: 'does the authority I hand over come back delivered?',
  }),
  Object.freeze({
    key: 'review-observation',
    label: 'Completed review observations',
    unitLabel: 'completed review',
    consumerLabel: 'Measurement reliability',
    consumerRoute: '#/reliability',
    demandLabel: 'people with no completed review in the window',
    defaultRequired: 8,
    defaultMinutes: 45,
    question: 'can my rating instrument tell anyone apart at all?',
  }),
  Object.freeze({
    key: 'case-resolution',
    label: 'Resolved operational cases',
    unitLabel: 'resolved case',
    consumerLabel: 'Outcome attribution',
    consumerRoute: '#/attribution',
    demandLabel: 'cases still open',
    defaultRequired: 6,
    defaultMinutes: 25,
    question: 'did the interventions I chose actually settle the cases?',
  }),
  Object.freeze({
    key: 'forecast-grade',
    label: 'Graded forecasts',
    unitLabel: 'graded forecast',
    consumerLabel: 'Forecast integrity & confidence transport',
    consumerRoute: '#/confidence',
    demandLabel: 'open calls recorded without a probability',
    defaultRequired: 8,
    defaultMinutes: 5,
    question: 'are the probability words I write down calibrated?',
  }),
]);

export const SUPPLY_LINE_KEYS = Object.freeze(SUPPLY_LINES.map((line) => line.key));

export function supplyLine(key) {
  return SUPPLY_LINES.find((line) => line.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 2. Verdicts — what the record says about one line                   */
/* ------------------------------------------------------------------ */

export const SUPPLY_VERDICTS = Object.freeze([
  'met',
  'filling',
  'starved',
  'retire',
  'unobserved',
]);

export const SUPPLY_VERDICT_LABELS = Object.freeze({
  met: 'Answerable now',
  filling: 'Filling on its own',
  starved: 'Starved',
  retire: 'Retire the question',
  unobserved: 'Nothing observed yet',
});

export const SUPPLY_VERDICT_TEXT = Object.freeze({
  met: 'The record already holds at least the count this instrument needs. Stop gathering and go read the answer.',
  filling: 'At the record’s own arrival rate this line reaches its floor inside the horizon. The cheapest move is to wait and let the workspace fill it.',
  starved: 'At the record’s own arrival rate this line reaches its floor after the horizon. Waiting is not a plan; either manufacture the missing units deliberately or accept the judgement stays unavailable.',
  retire: 'This question has been starved long enough that waiting cannot pay for itself, and the demand it was for is already older than the retirement bar. The honest move is to close the question, not to keep it open.',
  unobserved: 'No unit of this kind has ever been produced. That is not a slow line — it is a line that does not exist yet, and no amount of waiting will start it.',
});

export const SUPPLY_CAPTURE_VERDICTS = Object.freeze(['capture', 'wait', 'either']);
export const SUPPLY_CAPTURE_LABELS = Object.freeze({
  capture: 'Capture deliberately',
  wait: 'Let the record fill it',
  either: 'Either — the difference is small',
});

/* ------------------------------------------------------------------ */
/* 3. Ids, events and limits                                           */
/* ------------------------------------------------------------------ */

export const SUPPLY_RULE_IDS = Object.freeze({
  PLAN: 'RULE-SUP-01',
  TRIAGE: 'RULE-SUP-02',
  RETIRE: 'RULE-SUP-03',
  UNLOCK: 'RULE-SUP-04',
  GRADE: 'RULE-SUP-05',
});

export const SUPPLY_SIGNAL_IDS = Object.freeze({
  BOTTLENECK: 'SUP-01',
  RETIRE: 'SUP-02',
  UNLOCKED: 'SUP-03',
  UNGRADED: 'SUP-04',
  CAPTURE: 'SUP-05',
  NO_LINE: 'SUP-06',
});

export const SUPPLY_EVENTS = Object.freeze({
  FROZEN: 'supply.planFrozen',
  GRADED: 'supply.planGraded',
  DELETED: 'supply.planDeleted',
  SCAN: 'supply.scan',
  CONVENTIONS: 'supply.conventions',
});

/**
 * Every setting is clamped into a printed range on read. A floor of zero would
 * switch a measurement off silently — the failure mode this module's sibling
 * terminals have each found the hard way — so no range here contains the value
 * that disables its own test.
 */
export const SUPPLY_LIMITS = Object.freeze({
  windowDays: [28, 730],
  windowDaysDefault: 180,
  horizonDays: [14, 365],
  horizonDaysDefault: 56,
  starvePct: [10, 95],
  starvePctDefault: 50,
  bottleneckPct: [10, 100],
  bottleneckPctDefault: 40,
  weeklyHours: [0.5, 40],
  weeklyHoursDefault: 3,
  abandonDays: [30, 730],
  abandonDaysDefault: 120,
  captureRatio: [0.1, 20],
  captureRatioDefault: 1,
  planCap: [2, 40],
  planCapDefault: 12,
  reviewHorizonDays: [7, 365],
  reviewHorizonDaysDefault: 60,
  maxTasks: [1, 6],
  maxTasksDefault: 3,
  minutesMin: 5,
  minutesMax: 480,
  maxDemandItems: 6,
  maxMembers: 8,
});

export const SUPPLY_CONVENTIONS_NOTE =
  'Every number here is a declared convention, not a statistic: the window the arrival '
  + 'rate is measured over, the horizon a line must fill inside to count as healthy, the '
  + 'probability below which a line is starved, the share of starved demand that makes one '
  + 'line THE bottleneck, the leader minutes one more unit costs, and how many weeks of '
  + 'waiting one hour of capture must save to be worth doing.';
