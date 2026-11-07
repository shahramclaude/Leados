/**
 * app/core/domain/epistemicRegistry.js — the Epistemic Ledger (`#/epistemic`,
 * Schema v105, ADR-0103).
 *
 * THE QUESTION, AND WHY THE WHOLE PRODUCT WAS MISSING IT
 * ------------------------------------------------------
 * Thirty-one sessions of this workspace have made one thing excellent: every
 * screen in LeadOS tells a leader what the *record* says. The hindsight lock
 * (ADR-0102) added the second half of that sentence — what the record said *at
 * the moment of the call*. Both are still answers to the same question:
 *
 *        "What do we know?"
 *
 * Nobody, in this product or in the reviewed market, asks the complementary
 * question, and it is the one that actually costs an organisation its year:
 *
 *        "What does this team believe that is FALSE, what does it not know
 *         that it COULD know, and how would we ever find out?"
 *
 * Every instrument in the category measures perception — engagement, sentiment,
 * eNPS, 360 agreement, manager effectiveness — and every one of them is
 * *self-reported*. A survey can tell you that a team is unhappy. It cannot tell
 * you that a risk three people privately saw was never escalated, that a metric
 * everybody cites stopped being true in March, or that a "resolved" incident
 * count only counts the incidents someone was willing to log. Those are
 * *epistemic* failures, and they are invisible to every dashboard because they
 * are failures OF the dashboard.
 *
 * THE MECHANISM (three parts, none of them a survey)
 * --------------------------------------------------
 * 1. THE LEDGER OF UNKNOWNS. Most of what an organisation does not know is not
 *    mysterious — it is *already on the record somewhere* and nobody looked.
 *    RULE-EPI-01 therefore does not ask a human to brainstorm risks. It
 *    harvests, on the shared spine, every DANGER signal (an unclosed
 *    constructive-feedback follow-up, an aging risk case, an unresolved
 *    conflict, a stagnating performance concern), every DEFECT signal (a
 *    breached premise, an at-risk goal, an overdue delegation, a decision whose
 *    recorded outcome was bad) and every OPPORTUNITY signal (a quiet
 *    recognition record, a finished goal nobody noticed, a closed case) that the
 *    rest of the workspace already holds. Each becomes one UNKNOWN with an
 *    EVIDENCE-BOUND expiry: it can only be closed by an act, never by time.
 *    What remains after harvesting — the six declared EVIDENCE CLASSES with no
 *    evidence at all in the window — is printed as the workspace's own
 *    UNKNOWN-UNKNOWN set, because a class with no evidence is not a clean
 *    class, it is a blind instrument.
 *
 * 2. THE OVERCONFIDENCE INDEX. Agreement between what a leader *believes* about
 *    how work is going and what the record actually shows is testable, with
 *    Cohen's (1960) kappa on a 2×2 table of declared belief against resolved
 *    outcome. The number that matters is not the agreement — a leader who says
 *    "fine" about everything agrees with a healthy team by accident — it is the
 *    DIRECTION of the disagreement. McKenna & Myers (1997) split it into a
 *    PREVALENCE index (does the belief over-predict good outcomes?) and a BIAS
 *    index (does it over-predict in one direction specifically?), and Feinstein
 *    & Cicchetti (1990) showed why the raw kappa collapses when outcomes are
 *    rare — so the terminal prints the prevalence-adjusted, bias-adjusted kappa
 *    (PABAK) beside it and reads the ratio, not the level. When a span's beliefs
 *    are systematically sunnier than its record, the terminal says "optimism
 *    gap" and hands it up. When the record is sunnier than the belief, it says
 *    "underconfidence" and hands it DOWN, because a leader who cannot see their
 *    own wins is a different problem with a different owner.
 *
 * 3. THE IMPLIED LEDGER. A blind spot can be measured without asking anyone a
 *    question, because the plumbing already reports it. Every module on the
 *    shared spine writes `rolls-up-to` edges to each leadership ancestor
 *    (ADR-0076). The *absence* of those edges for a span is therefore evidence:
 *    distinct danger classes that never produced a single arriving edge, a
 *    horizon of silence in days, feedback repair latency, ungraded decisions
 *    past their review date, and failed searches for things the person was
 *    supposed to hold. Their union is an evidence-based lower bound on how many
 *    kinds of trouble can exist in that span without anyone above it ever
 *    hearing — with a Poisson upper bound on the rate. It is never a score for a
 *    person, and the screen says so in the same sentence it prints the number.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *  - It never asks "how are you feeling?" and calls the answer knowledge. There
 *    is no sentiment score here. An unknown is closed by an ACT on the record.
 *  - It never closes an unknown because time passed. Expiry escalates; it does
 *    not resolve. A risk that disappeared because the quarter ended was never
 *    addressed.
 *  - It never infers a perception. The leader DECLARES what they believed; the
 *    outcome is the record's own; kappa measures the distance and names the
 *    direction. A belief with no resolved outcome is `unpaired` and excluded.
 *  - It never rates, ranks or scores a person. The unit is the UNKNOWN, the
 *    SPAN, the EVIDENCE CLASS and the CELL. Above director rank the terminal
 *    prints counts by altitude; the implied ledger is a statement about a
 *    span's information system, not about the person running it.
 *  - It never prints a rate, an interval or a kappa its own floor refuses, and a
 *    suppressed cell is BLANK, never zero.
 *
 * Purity: vocabulary only, zero imports, so `schema.js`, the engine, the rules,
 * `csv.js` and the view share one canonical vocabulary.
 */

export const EPISTEMIC_ENGINE_VERSION = 'epistemic-ledger-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. The unknown ledger                                              */
/* ------------------------------------------------------------------ */

/**
 * What kind of thing has not been looked at. Severity is a DECLARED weight per
 * class (never a probability), used only to order the queue a human reads.
 */
export const UNKNOWN_KINDS = Object.freeze({
  danger: Object.freeze({
    key: 'danger',
    label: 'Danger',
    weight: 3,
    tone: 'bad',
    meaning: 'Something the record already flags as going wrong, and nobody has looked at it since it was flagged. Harvested from the workspace, never brainstormed.',
  }),
  defect: Object.freeze({
    key: 'defect',
    label: 'Defect',
    weight: 2,
    tone: 'warn',
    meaning: 'A gap between what was committed and what the record shows. The commitment is still on the record, so the gap is knowable — it has simply not been read.',
  }),
  opportunity: Object.freeze({
    key: 'opportunity',
    label: 'Opportunity',
    weight: 1,
    tone: 'good',
    meaning: 'An asset the record shows and nobody has acted on — a finished goal nobody recognised, a closed case nobody learned from, a silence where a contribution should have been named. Also a kind of blindness, and the cheapest to fix.',
  }),
  declared: Object.freeze({
    key: 'declared',
    label: 'Declared',
    weight: 2,
    tone: 'neutral',
    meaning: 'A question a human wrote down as unresolved. This is the only kind whose content came from a person rather than from the record — and it is the only kind that can be closed by an answer nobody can derive.',
  }),
});

export const UNKNOWN_KIND_KEYS = Object.freeze(Object.keys(UNKNOWN_KINDS));

/**
 * A harvested obligation's lifecycle. `unopened` is the state the product
 * exists to make visible: the record already knew, and nobody looked.
 */
export const UNKNOWN_STATES = Object.freeze({
  unopened: Object.freeze({
    key: 'unopened',
    label: 'Unopened',
    tone: 'bad',
    meaning: 'Harvested from the record and never read by a human. This is the state that costs an organisation its year, and the only state a scan can create.',
  }),
  open: Object.freeze({
    key: 'open',
    label: 'Open',
    tone: 'warn',
    meaning: 'Looked at, and the answer is not in yet. A dated investigation is owned by a named span.',
  }),
  answered: Object.freeze({
    key: 'answered',
    label: 'Answered',
    tone: 'good',
    meaning: 'A human recorded that the question was resolved, and the belief was then graded against what the record later showed. An answered unknown teaches; an expired one does not.',
  }),
  expired: Object.freeze({
    key: 'expired',
    label: 'Expired',
    tone: 'bad',
    meaning: 'The declared window passed with no human answer. The workspace refuses to call this resolved: an unknown that disappeared because the quarter ended was never addressed. Expiry escalates.',
  }),
  dismissed: Object.freeze({
    key: 'dismissed',
    label: 'Dismissed',
    tone: 'neutral',
    meaning: 'A human judged it not worth carrying, and had to write why. The dismissal rate is printed beside the answer rate, because dismissing everything is itself a finding.',
  }),
});

export const UNKNOWN_STATE_KEYS = Object.freeze(Object.keys(UNKNOWN_STATES));

/** Where a harvested signal came from. Every one is a collection this workspace owns. */
export const SIGNAL_SOURCES = Object.freeze([
  'feedback', 'cases', 'conflicts', 'performanceConcerns', 'escalationRecords',
  'premises', 'goals', 'delegations', 'decisions', 'recognition', 'stakeholders',
  'oneOnOnes', 'reviews', 'people', 'forecastChallenges',
]);

/** The discipline each harvested signal belongs to. Cross-domain by construction. */
export const SIGNAL_DISCIPLINES = Object.freeze({
  operations: 'Operations & production — a defect that stays unread becomes a stoppage.',
  finance: 'Finance & investment — an unpriced exposure is a liability the ledger has not admitted.',
  politics: 'Political science — what is privately seen and never escalated is a coalition problem before it is a data problem.',
  statistics: 'Statistics — a class with no evidence cannot support a rate, and is reported as a blind instrument rather than a clean one.',
  engineering: 'Engineering — root cause is only findable while the artifact is still open.',
  strategy: 'Strategy — a premise nobody re-read is a bet running on an assumption that may already be false.',
  people: 'People & practice — a concern nobody named is a conversation that will happen later, worse.',
});

/* ------------------------------------------------------------------ */
/* 2. The overconfidence index                                        */
/* ------------------------------------------------------------------ */

/**
 * The 2×2. `belief` is what the leader DECLARED before the outcome was known;
 * `truth` is the record's own resolved outcome. There is no third group: a pair
 * with no resolved outcome is `unpaired` and excluded from every cell.
 */
export const BELIEF_CELLS = Object.freeze({
  agreedOk: Object.freeze({ key: 'agreedOk', label: 'Said fine, was fine', meaning: 'Belief and record agree. Not evidence of skill on its own — a leader who says fine about everything lands here at random.' }),
  optimism: Object.freeze({ key: 'optimism', label: 'Said fine, was not', meaning: 'The dangerous cell. The belief ran ahead of the record: this is where surprise lives.' }),
  pessimism: Object.freeze({ key: 'pessimism', label: 'Said not fine, was fine', meaning: 'The belief ran behind the record. Expensive in a different currency — it burns attention and trust on problems that did not arrive.' }),
  agreedBad: Object.freeze({ key: 'agreedBad', label: 'Said not fine, was not', meaning: 'Belief and record agree on trouble. This is the cell no product names as a SUCCESS, and it is one: sometimes the answer was knowable and was known.' }),
});

export const BELIEF_CELL_KEYS = Object.freeze(Object.keys(BELIEF_CELLS));

/**
 * Four readings of the same table, because any one of them alone can be argued
 * away. Cook (2005) is the standing reason the first is never printed alone.
 */
export const CALIBRATION_VERDICTS = Object.freeze({
  calibrated: Object.freeze({
    key: 'calibrated',
    tone: 'good',
    label: 'Calibrated',
    meaning: 'Belief and record disagree no more than chance allows at this sample, and neither the prevalence nor the bias index points a direction. The honest reading is "no gap measured", never "accurate".',
  }),
  optimism: Object.freeze({
    key: 'optimism',
    tone: 'bad',
    label: 'Optimism gap',
    meaning: 'Belief over-predicts good outcomes. This is the pattern that produces surprise, and the terminal hands it upward with the count of specific beliefs that ran ahead of the record.',
  }),
  underconfidence: Object.freeze({
    key: 'underconfidence',
    tone: 'warn',
    label: 'Underconfidence',
    meaning: 'The record is better than the belief. This is handed DOWN, not up: it is a problem of visibility and self-reading, and the owner is the span itself. It is only reachable without resolved outcomes if the leader has been declaring worse than the record — which is why it can be demoralising and is never a score.',
  }),
  'no-signal': Object.freeze({
    key: 'no-signal',
    tone: 'neutral',
    label: 'No directional signal',
    meaning: 'The two indices point opposite ways, or the sample cannot separate them. Printed as a state, never averaged into a number, because an average of two disagreeing signs is a fiction.',
  }),
  refused: Object.freeze({
    key: 'refused',
    tone: 'neutral',
    label: 'Refused',
    meaning: 'Below the declared floor, or one cell holds everything. A kappa computed where one cell holds the whole table is a prior wearing a decimal point.',
  }),
});

export const CALIBRATION_VERDICT_KEYS = Object.freeze(Object.keys(CALIBRATION_VERDICTS));

/* ------------------------------------------------------------------ */
/* 3. The implied ledger (blind-spot bound)                           */
/* ------------------------------------------------------------------ */

/**
 * The six blind classes. Each is measured from the plumbing rather than from an
 * opinion: an arrival is a typed `rolls-up-to` edge the shared spine already
 * wrote, and a silence is its absence.
 */
export const BLIND_CLASSES = Object.freeze({
  danger: Object.freeze({ key: 'danger', label: 'Danger signals', question: 'Does trouble that exists below this span ever arrive at it?' }),
  delivery: Object.freeze({ key: 'delivery', label: 'Delivery evidence', question: 'Does work that finished below this span ever produce a record this span can see?' }),
  people: Object.freeze({ key: 'people', label: 'People signals', question: 'Do the one-to-ones, feedback and reviews this span is responsible for actually exist?' }),
  decisions: Object.freeze({ key: 'decisions', label: 'Decision closure', question: 'Are the decisions taken here ever graded, or does the record simply stop at the call?' }),
  strategy: Object.freeze({ key: 'strategy', label: 'Strategy premises', question: 'Are the premises the plan rests on ever re-read, or are they still on the page from the day they were written?' }),
  repair: Object.freeze({ key: 'repair', label: 'Repair loops', question: 'When something breaks, is there any dated record of it being fixed?' }),
});

export const BLIND_CLASS_KEYS = Object.freeze(Object.keys(BLIND_CLASSES));

/** Severity of a measured blind class, in DECLARED bands — never a fitted cut. */
export const BLIND_BANDS = Object.freeze([
  Object.freeze({ key: 'none', min: 0.85, tone: 'good', label: 'Covered', meaning: 'At least the declared share of the measurable activity arrived. Nothing is claimed about quality.' }),
  Object.freeze({ key: 'partial', min: 0.55, tone: 'warn', label: 'Partly blind', meaning: 'Between the declared bands. Some of what happens below this span is not reaching it.' }),
  Object.freeze({ key: 'blind', min: 0.25, tone: 'bad', label: 'Mostly blind', meaning: 'Most measurable activity did not arrive. The span is being managed from memory and conversation, not from the record.' }),
  Object.freeze({ key: 'dark', min: 0, tone: 'bad', label: 'Dark', meaning: 'Nothing arrived for this class although measurable activity exists. This is the strongest evidence-based statement the workspace can make, and it is deliberately about the span’s information system — never about a person.' }),
]);

/* ------------------------------------------------------------------ */
/* 4. Limits, conventions and panels                                  */
/* ------------------------------------------------------------------ */

export const EPISTEMIC_LIMITS = Object.freeze({
  unknowns: 600,           // bounded ledger
  observations: 600,       // frozen belief observations
  grades: 400,             // once-only grades
  markers: 800,            // idempotency markers
  findingsPerPass: 6,      // governed work opened per spine pass
  titleChars: 200,
  noteChars: 2000,
  refsPerUnknown: 8,
  pairsPerObservation: 24,
  windowDays: 730,         // harvest horizon ceiling
});

/**
 * The six panels, each with the question it answers. Declared here rather than in
 * the view so a test can assert the panel set without importing the DOM.
 */
export const EPISTEMIC_PANELS = Object.freeze([
  Object.freeze({ key: 'desk', label: 'Desk' }),
  Object.freeze({ key: 'unknowns', label: 'Unknowns' }),
  Object.freeze({ key: 'calibration', label: 'Calibration' }),
  Object.freeze({ key: 'blind', label: 'Blind spots' }),
  Object.freeze({ key: 'rollup', label: 'Roll-up' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

/**
 * Every number below is a DECLARED, editable convention — printed with the
 * reading it produced, never presented as a measured fact. The floors mirror
 * the rest of the workspace (counts refused below five; cells below three
 * suppressed) so no two screens disagree about what "enough" means.
 */
export const EPISTEMIC_DEFAULTS = Object.freeze({
  epistemicWindowDays: 90,          // how far back the harvest reads
  epistemicEscalateDays: 14,        // age at which an unopened danger escalates
  epistemicExpiryDays: 30,          // declared evidence-bound expiry on a harvested unknown
  epistemicAnswerFloor: 5,          // answers needed before an answer rate is printed
  epistemicPairFloor: 8,            // paired beliefs needed before kappa is printed
  epistemicCellFloor: 3,            // small-cell suppression
  epistemicBlindFloor: 0.55,        // coverage below which a class is 'partly blind'
  epistemicBlindDarkPct: 5,         // coverage at/below which a class is 'dark'
  epistemicReviewDays: 14,          // horizon on a governed finding
  // ADR-0117: the bounded backlog policy. At most this many RULE-EPI-02
  // escalations open per owning span per ISO week — a WIP limit on one span's
  // escalation inbox (Anderson's bounded work-in-progress; Reinertsen's
  // small-batch economics), so a large harvested backlog drains as a weekly
  // batch a human can actually read instead of flooding every save. The
  // over-budget remainder stays queued and is PRINTED (count + renewal week),
  // never silently dropped. Every transaction respects the week's remaining
  // quota, so the weekly bound also bounds each transaction.
  epistemicEscalateMaxPerWeek: 5,   // per-span weekly escalation budget (ADR-0117)
  epistemicAutoPropagate: true,     // pausable; an explicit scan always runs
});

export const EPISTEMIC_BOUNDS = Object.freeze({
  epistemicWindowDays: Object.freeze([14, 730]),
  epistemicEscalateDays: Object.freeze([3, 180]),
  epistemicExpiryDays: Object.freeze([7, 365]),
  epistemicAnswerFloor: Object.freeze([2, 50]),
  epistemicPairFloor: Object.freeze([4, 200]),
  epistemicCellFloor: Object.freeze([2, 20]),
  epistemicBlindFloor: Object.freeze([5, 95]),
  epistemicBlindDarkPct: Object.freeze([0, 40]),
  epistemicReviewDays: Object.freeze([3, 90]),
  epistemicEscalateMaxPerWeek: Object.freeze([1, 52]),
});

export const EPISTEMIC_RULE_IDS = Object.freeze({
  HARVEST: 'RULE-EPI-01',   // harvest record signals into unknowns, one rolls-up-to per ancestor
  ESCALATE: 'RULE-EPI-02',  // an unopened danger past the declared age opens ONE governed decision,
                            // bounded to the declared weekly budget per span (ADR-0117); the
                            // over-budget remainder is deferred and printed, never dropped
  EXPIRE: 'RULE-EPI-03',    // declared expiry passes with no human answer -> escalated, never resolved
  GAP: 'RULE-EPI-04',       // a span whose beliefs over-predict good outcomes opens ONE calibration review
  GRADE: 'RULE-EPI-05',     // grade a frozen belief observation once against the record's own outcome
});

export const EPISTEMIC_EVENTS = Object.freeze({
  DECLARED: 'epistemic.declared',
  OPENED: 'epistemic.opened',
  ANSWERED: 'epistemic.answered',
  DISMISSED: 'epistemic.dismissed',
  OBSERVED: 'epistemic.observed',       // a belief pair was declared
  GRADED: 'epistemic.graded',
  SCAN: 'epistemic.scan',
  CONVENTIONS: 'epistemic.setConventions',
});

export const EPISTEMIC_TRIGGER_PREFIX = 'epistemic.';

export const EPISTEMIC_TRIGGER_EVENTS = Object.freeze([
  'case.created', 'case.updated', 'case.resolved', 'case.reopened',
  'feedback.updated', 'feedback.recorded', 'goal.updated', 'goal.completed',
  'premise.updated', 'premise.evidence', 'decision.updated', 'decision.made',
  'decision.reviewed', 'delegation.updated', 'delegation.completed',
  'conflict.updated', 'recognition.recorded', 'oneonone.logged', 'review.completed',
]);

/* ------------------------------------------------------------------ */
/* 5. Altitude playbooks — five different jobs, not five skins         */
/* ------------------------------------------------------------------ */

export const EPISTEMIC_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'What the week is hiding from me',
    horizon: '1–7 days',
    question: 'Which of this week’s signals did I never open, and what did I believe last week that the record has already contradicted?',
    see: 'The unopened danger signals harvested from this team’s own feedback, conflicts and concerns; the calibration cells over your own declared beliefs; the two blind classes a team lead can actually close.',
    act: 'Open one unknown and record what you found — or dismiss it with a reason. Declare a belief before the next outcome is known, so the workspace can tell you whether you read your team accurately.',
    hand: 'Anything past the declared age, with the day it crossed — and the calibration cell if it is thin, because a thin cell is a statement about the record and not about you.',
  }),
  manager: Object.freeze({
    title: 'Which of my functions is running on self-report',
    horizon: '30–90 days',
    question: 'Across the span I run, which evidence classes have produced nothing at all, and which of my leads’ beliefs are systematically sunnier than their own record?',
    see: 'Unopened and expired unknowns by span and by kind; the overconfidence index per direct span; the implied-ledger coverage per blind class with its Poisson upper bound.',
    act: 'Route one finding to the span that owns it, and re-declare the conventions when the declared window stops matching how the team actually works.',
    hand: 'A single prevalence-and-bias reading per span, plus the count of beliefs that ran ahead of the record — never the individual beliefs, which stay with the span that declared them.',
  }),
  director: Object.freeze({
    title: 'Where the organisation’s knowledge stops',
    horizon: '90–365 days',
    question: 'Which evidence classes are blind across the whole tree, and is the overconfidence pattern a person problem or a reporting-chain problem?',
    see: 'Coverage by blind class across every span in scope; calibration cells by altitude; suppressed small cells rather than printed guesses.',
    act: 'Re-declare the floors and bands. Open a governed calibration review where a span’s beliefs over-predict outcomes above the declared floor.',
    hand: 'Counts by altitude and class, the direction of the gap, and every refusal printed instead of a number.',
  }),
  executive: Object.freeze({
    title: 'Enterprise epistemic exposure',
    horizon: '180–730 days',
    question: 'How much of what this enterprise believes about itself is unverified, and where would a surprise most likely come from?',
    see: 'The all-altitude unopened ledger with its age distribution; the number of evidence classes that are dark somewhere in the tree; the pooled calibration direction with its interval.',
    act: 'Set the enterprise convention: a span with a dark class cannot certify its own health, and the certification says which class is dark.',
    hand: 'An identity-free statement of exposure — counts, classes, directions and refusals — that a board can read without reading anybody’s notes.',
  }),
  chief: Object.freeze({
    title: 'The enterprise’s knowledge debt',
    horizon: '365–1460 days',
    question: 'What does this company not know about itself that it could know by Tuesday, and who is structurally unable to tell me?',
    see: 'The dark-class map at enterprise scope, the age distribution of unopened unknowns, and the pooled prevalence index with its confidence interval.',
    act: 'Declare that the enterprise’s own reporting is an instrument under test — and hold this terminal to the same standard by grading its predictions once, out of sample.',
    hand: 'One dated, aggregate-only paragraph with every refusal beside its number.',
  }),
});

/* ------------------------------------------------------------------ */
/* 6. Disclosure — what the screen promises, in plain words            */
/* ------------------------------------------------------------------ */

export const EPISTEMIC_DISCLOSURE = Object.freeze({
  harvest: 'Every harvested unknown names the record it came from. Nothing is brainstormed, invented or inferred from a mood — an error in this ledger is an error in the record it read, and it is navigable to that record in one click.',
  expiry: 'Expiry is not resolution. An unknown whose declared window passes with no human answer is marked expired and escalated; the workspace refuses to launder a missed risk into a closed one by the passage of time.',
  calibration: 'Beliefs are declared by a human and outcomes are read from the record. Kappa measures the distance and the two indices name its direction; a refusal is printed where one cell would carry the table, and no person is scored from it.',
  blind: 'The implied ledger measures the INFORMATION SYSTEM around a span — which classes produced an arriving edge and which produced silence — and bounds the rate with Poisson. It is never a judgement of a person, and the span is the unit.',
  refusal: 'Below the declared floors nothing is printed and the reason is shown; a suppressed cell is BLANK, never zero; an averaged index is never substituted for two indices that point in opposite directions.',
  local: 'Operating seats are local workflow declarations, not authenticated multi-user security. A declared belief records who held the seat at the time it was declared — a record of the workflow, not proof of authorship.',
});

export const EPISTEMIC_PREMISE =
  'This screen hunts what the record already knew and nobody read, measures whether your beliefs about your own span run sunnier than its record, and bounds how much can be going wrong below you that you would never hear — and it refuses to print a rate, an index or a kappa its own floor cannot carry.';

/* ------------------------------------------------------------------ */
/* 7. Helpers that must not drift between modules                     */
/* ------------------------------------------------------------------ */

/** FNV-1a 32-bit, rendered as 12 lowercase base-36 chars. Content addressing, not crypto. */
export function epistemicHash(value) {
  let result = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

/** Deterministic id for one harvested signal, so a rescan cannot duplicate it. */
export function harvestedUnknownId(className, sourceType, sourceId) {
  return `epu-${className}-${epistemicHash(`${sourceType}:${sourceId}`)}`;
}

/** Deterministic id for one idempotency marker. */
export function epistemicMarkerId(kind, key) {
  return `epm-${kind}-${epistemicHash(key)}`;
}
