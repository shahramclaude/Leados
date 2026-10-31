/**
 * app/core/domain/integrityRegistry.js — the vocabulary of the Signal Integrity
 * Board (Schema v70, ADR-0061).
 *
 * A leaf module with no imports, for the same practical reason
 * `watchRegistry.js` is one: `schema.js` must validate integrity records, and
 * the read model that produces them is imported by `insights.js`. Keeping the
 * vocabulary here means the normaliser, the engine and the insights roll-up can
 * never disagree about which families exist, which verdicts are legal, or what
 * a rule id is called — and it breaks the import cycle that would otherwise
 * exist (insights → integrity → schema → insights).
 *
 * THE IDEA THIS FILE ENCODES
 * --------------------------
 * LeadOS evaluates several hundred deterministic rules and one p-valued
 * statistical scan (`Early warning`) every time a screen renders. That is a
 * multiple-testing procedure the leader never agreed to and cannot see. The
 * Board exists to publish its size, charge its error budget, and grade it from
 * the leader's own verdicts. This file is the inventory it charges against.
 *
 * `tier` is the honest distinction the Board never collapses:
 *   - `statistical` — the detector emits a probability under a stated null, so
 *     a multiplicity correction is meaningful. Exactly one family qualifies
 *     today (the XmR scan behind `Early warning`).
 *   - `rule` — a deterministic predicate over the leader's records. It has no
 *     p-value and the Board REFUSES to manufacture one; these families are
 *     audited by measured precision instead of by a corrected p-value.
 */

export const INTEGRITY_ENGINE_VERSION = 'signal-integrity-2026.10-v1';

/** Rule ids. Four rules on the post-commit spine (ADR-0008). */
export const INTEGRITY_RULE_IDS = Object.freeze({
  LOOK: 'RULE-INT-01',
  VERDICT: 'RULE-INT-02',
  BUDGET: 'RULE-INT-03',
  GRADE: 'RULE-INT-04',
});

/** Lifecycle events this module publishes. */
export const INTEGRITY_EVENTS = Object.freeze({
  SCAN: 'integrity.scan',
  LOOK: 'integrity.look',
  VERDICT: 'integrity.verdict',
  FROZEN: 'integrity.review.frozen',
  GRADED: 'integrity.review.graded',
  DECLARED: 'integrity.declared',
});

/** Signal ids contributed to the recommendation engine. */
export const INTEGRITY_SIGNAL_IDS = Object.freeze({
  ALPHA_EXHAUSTED: 'INT-01',
  OVER_CLAIMS: 'INT-02',
  UNSCORED: 'INT-03',
  REVIEW_DUE: 'INT-04',
  SURPRISE: 'INT-05',
  LOOKS_OVERRUN: 'INT-06',
});

/** The domain label the Board's own signals are filed under. */
export const INTEGRITY_DOMAIN = 'Signal integrity';

/**
 * The four one-way verdicts. Deliberately the SAME four words the early-warning
 * ledger uses, so a leader learns one vocabulary in two places instead of two
 * vocabularies for the same judgement.
 */
export const SIGNAL_VERDICTS = Object.freeze(['confirmed', 'explained', 'dismissed', 'false-alarm']);

export const SIGNAL_VERDICT_LABELS = Object.freeze({
  confirmed: 'Real — and worth acting on',
  explained: 'Real — but the cause was already known',
  dismissed: 'Real — but not worth acting on',
  'false-alarm': 'Noise — the record did not really change',
});

export const SIGNAL_VERDICT_KINDS = Object.freeze({
  confirmed: 'true',
  explained: 'true-known',
  dismissed: 'true-lowvalue',
  'false-alarm': 'false',
});

export const FAMILY_STATUSES = Object.freeze([
  'calibrated', 'indeterminate', 'over-claiming', 'insufficient', 'unscored',
]);

export const FAMILY_STATUS_LABELS = Object.freeze({
  calibrated: 'Calibrated — measured precision clears the declared floor',
  indeterminate: 'Unresolved — the interval straddles the floor',
  'over-claiming': 'Over-claiming — measured precision is below the floor',
  insufficient: 'Too few verdicts to judge',
  unscored: 'Never verdict-ed',
});

/** Alpha-spending functions the Board implements. */
export const SPENDING_FUNCTIONS = Object.freeze(['obf', 'pocock']);
export const SPENDING_LABELS = Object.freeze({
  obf: 'O’Brien–Fleming-like (Lan–DeMets 1983) — stingy early, almost nothing held back late',
  pocock: 'Pocock-like (Lan–DeMets 1983) — a constant boundary at every look',
});

export const INTEGRITY_DEFAULTS = Object.freeze({
  integrityAutoPropagate: true,
  integrityAlphaPct: 10,
  // Twelve planned looks is one weekly look per quarter. The default spending
  // function is the Pocock-like one because a 26-look O’Brien–Fleming plan puts
  // the first reachable boundary so far into the quarter that the bar is, in
  // practice, unreachable — true, and useless to a working manager. The Method
  // panel prints both so the trade-off is visible instead of assumed.
  integrityPlannedLooks: 12,
  integritySpending: 'pocock',
  integrityRhoPct: 30,
  integrityPrecisionFloorPct: 60,
  integrityMinVerdicts: 4,
  integritySpendWarnPct: 80,
  // The share of the planned looks that must STILL be unspent before an early
  // budget spend is a decision rather than arithmetic: "80% of my budget is
  // gone and I have not even reached the last quarter of the plan".
  integrityLooksWarnPct: 20,
  integritySurpriseBrier: 0.25,
  integrityHorizonAlerts: 6,
  integrityReviewCap: 20,
  integrityLookCap: 240,
  integrityVerdictCap: 600,
});

export const INTEGRITY_CLAMPS = Object.freeze({
  integrityAlphaPct: [1, 50],
  integrityPlannedLooks: [2, 260],
  integrityRhoPct: [0, 90],
  integrityPrecisionFloorPct: [20, 95],
  integrityMinVerdicts: [2, 40],
  integritySpendWarnPct: [50, 100],
  integrityLooksWarnPct: [10, 100],
  integritySurpriseBrier: [0.05, 0.49],
  integrityHorizonAlerts: [1, 40],
  integrityReviewCap: [5, 20],
  integrityLookCap: [60, 400],
  integrityVerdictCap: [100, 1200],
});

/** Convention labels for the three ρ values the Method panel stress-tests. */
export const RHO_SENSITIVITY = Object.freeze([0, 0.3, 0.6]);

/**
 * Every signal family the workspace can raise, with what it reads.
 *
 * Column 1 is the exact `domain` string `buildInsights` files the finding under;
 * a family missing here is charged as an unaudited test, and
 * `tests/app/signal-integrity.test.mjs` asserts this table and
 * `DOMAIN_ORDER` cover each other in both directions.
 */
const TABLE = [
  ['People', 'rule', 'roster, tenure and start dates'],
  ['Conversations', 'rule', '1:1 cadence, agendas and the actions they produced'],
  ['Feedback', 'rule', 'dated feedback given, received and its latency'],
  ['Goals', 'rule', 'goal check-ins, confidence and due dates'],
  ['Delegation', 'rule', 'delegated work, authority and return reasons'],
  ['Operational cases', 'rule', 'open cases, severity and mitigations'],
  ['Operational resilience', 'rule', 'single points of failure and continuity drills'],
  ['Leader continuity', 'rule', 'absence cover and handover readiness'],
  ['Continuity coupling', 'rule', 'shared barriers across continuity plans'],
  ['Coalition & power', 'rule', 'stakeholder power, interest and dependence'],
  ['Org network', 'rule', 'who talks to whom, as recorded'],
  ['Impact', 'rule', 'intervention studies and their measured effects'],
  ['Comms', 'rule', 'stakeholder messages drafted, approved and sent'],
  ['Stakeholders', 'rule', 'stance, salience and engagement recency'],
  ['Negotiation', 'rule', 'negotiation terms, trades and settled outcomes'],
  ['Org design & change', 'rule', 'declared changes, stages and barriers'],
  ['Capacity & flow', 'rule', 'committed throughput against allocatable capacity'],
  ['Allocation', 'rule', 'funded bets, exploration share and settled outcomes'],
  ['Load & attention', 'rule', 'the leader’s own hours and cognitive saturation'],
  ['Premise sentinel', 'rule', 'decision premises, signposts and dated outcomes'],
  ['System dynamics', 'rule', 'feedback loops, delays and declared policies'],
  ['Capital allocation', 'rule', 'capital policies, effort weights and checkpoints'],
  ['Early warning', 'statistical', 'twelve reconstructed weekly series, XmR limits'],
  ['Strategy', 'rule', 'strategy bets, say–do gaps and stop rules'],
  ['Learning', 'rule', 'after-action reviews and committed changes'],
  ['Scorecard integrity', 'rule', 'measurement models, games and frozen predictions'],
  ['Implementation fidelity', 'rule', 'dose, reach and delivered stages of an intervention'],
  ['Merit & pay equity', 'rule', 'merit cycles, relative pay and its fairness audit'],
  ['Workforce transition', 'rule', 'transition programmes, gates and named rows'],
  ['Structural design', 'rule', 'reporting graph, spans, layers and priced coordination'],
  ['Information value', 'rule', 'decision frames, inquiries and elicited probabilities'],
  ['Attention market', 'rule', 'committed attention plans and what they forgave'],
  ['Autopilot', 'rule', 'declared operating agreements and their executions'],
  ['Signal path', 'rule', 'declared escalation channels and their measured relay'],
  ['War games', 'rule', 'scenarios, stressed bets and prefigured cases'],
  ['Coupled load', 'rule', 'shared approvers, hand-off chains and coupled delays'],
  ['Performance recovery', 'rule', 'concerns, expected outcomes and review dates'],
  ['Delivery survival', 'rule', 'time-to-finish with censoring for what is still open'],
  ['Cost of waiting', 'rule', 'declared delay prices and weekly exposure'],
  ['Leadership parity', 'rule', 'the leader’s own allocation, promises and standards'],
  ['Evidence', 'rule', 'pooled study estimates and their heterogeneity'],
  ['Decision consequences', 'rule', 'frozen decision futures and two-hop adjacency'],
  ['Deferral options', 'rule', 'priced option to wait and exercise boundaries'],
  ['Deferral portfolio', 'rule', 'the book of calls, declared ρ and joint lapse'],
  ['Finance', 'rule', 'budgets, lines, commitments and calibrated forecasts'],
  ['Hiring', 'rule', 'requisitions, candidate flow and loop feedback'],
  ['Growth', 'rule', 'growth plans, will/skill actions and reviews'],
  ['Wellbeing', 'rule', 'pulse readings and their voluntary disclosure'],
  ['Decisions', 'rule', 'DACI records, review dates and outcomes'],
  ['Decision tempo', 'rule', 'timeboxes, stall cost and decision load'],
  ['Forecast integrity', 'rule', 'frozen forecasts, resolved outcomes and scores'],
  ['Intake triage', 'rule', 'free-text intake, its routing and confidence'],
  ['Conflict resolution', 'rule', 'conflicts, positions and resolution stages'],
  ['Recognition', 'rule', 'dated recognition and who received it'],
  ['Succession', 'rule', 'readiness bands, gaps and bench depth'],
  ['Signal integrity', 'rule', 'this Board’s own looks, verdicts and frozen reviews'],
];

export const SIGNAL_FAMILIES = Object.freeze(TABLE.map(([domain, tier, reads]) => Object.freeze({
  domain, tier, reads,
})));

export const SIGNAL_FAMILY_BY_DOMAIN = new Map(SIGNAL_FAMILIES.map((f) => [f.domain, f]));

export const STATISTICAL_FAMILIES = Object.freeze(
  SIGNAL_FAMILIES.filter((f) => f.tier === 'statistical').map((f) => f.domain),
);

/**
 * Event types that constitute a recorded LOOK at the workspace. A look is the
 * unit the error budget is charged in, so it must be an event that actually ran
 * the detectors — not a page render, which the leader never sees recorded.
 */
export const LOOK_TRIGGERS = Object.freeze(['watch.scan', 'integrity.scan']);

/** Event types that constitute a human verdict on a surfaced signal. */
export const VERDICT_TRIGGERS = Object.freeze(['integrity.verdict', 'watch.triaged']);
