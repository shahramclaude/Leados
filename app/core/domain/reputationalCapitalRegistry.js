/**
 * app/core/domain/reputationalCapitalRegistry.js — vocabulary for the
 * Reputational Capital Ledger (`#/reputation`, Schema v103, ADR-0101).
 *
 * Zero imports, so `schema.js`, the engine, the rules, `csv.js`, the access
 * gateway and the view share one canonical vocabulary without a cycle.
 *
 * THE QUESTION NOBODY ELSE ANSWERS
 * --------------------------------
 * Every other terminal in LeadOS answers a question about ONE act. A frozen
 * prospective contract grades one bet. A Decision Rights Exchange contract
 * grades one hand-off. A promise-solvency reading prices one book. None of them
 * answers the question that actually governs how an organisation behaves over
 * time:
 *
 *   Given what this person's ACTS have credibly signalled, what will it cost to
 *   cause the next change — and what would it cost to build back what a breach
 *   destroyed?
 *
 * That is a question about REPUTATION as working capital, and it has a real,
 * computable answer. Kreps, Milgrom, Roberts & Wilson (1982, "Rational
 * Cooperation in the Finitely Repeated Prisoners' Dilemma") showed that a small
 * probability of a committed type sustains cooperation in games where backward
 * induction says it must collapse. The practical content of that theorem is not
 * a philosophy of trust — it is a BALANCE: act types a leader completes
 * accumulate a stake in being believed; act types a leader is observed to
 * defect on DESTROY that stake; and a person who has never committed to an act
 * type has no stake to spend, so a guarantee from them is worth its stated
 * price and nothing more.
 *
 * MARKET POSITION, STATED HONESTLY
 * --------------------------------
 * The 2026 people-analytics category (Visier, Workday Illuminate, Lattice,
 * Culture Amp, ChartHop, Orgvue) measures STRUCTURE and SURVEY SENTIMENT. The
 * research frontier (Doval & Smolin 2026 on calibrated mechanism design; the
 * 2025-2026 dynamic-contract literature) asks exactly this reputational
 * question — and ships in no product. Vendors and papers are benchmarks from
 * public snippets, not audited capabilities, and this module claims no novelty
 * in the theory: it applies established repeated-game and mechanism-design
 * results explicitly and names them.
 *
 * WHAT THIS FILE OWNS
 * -------------------
 * Verdict vocabulary, act classes, statuses, bounded limits, declared defaults,
 * engagement tiers, playbooks and disclosure lines. The ENGINE lives in
 * `reputationalCapital.js`; the stored contract in
 * `reputationalCapitalSchema.js`; the spine in `reputationalCapitalRules.js`.
 */

export const REPUTATION_ENGINE_VERSION = 'reputational-capital-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. Six verdicts, read off an interval, never off a point estimate   */
/* ------------------------------------------------------------------ */

/**
 * One verdict per (person × act class) cell.
 *
 * `solvent`      the interval clears the declared obstacle threshold: the
 *                stake this record establishes is enough to carry the ask.
 * `encumbered`   the stake is real but the ask is larger than the record has
 *                earned; the honest answer is to price the gap, not to refuse.
 * `insolvent`    no completion of this act class is on record at all. Not a
 *                judgement about a person — the WILSON-FIRST rule: reputation is
 *                built from acts, and there are no acts to read.
 * `contested`    the act class is disputed: a recorded challenge against a
 *                completion, or a breach disputed by the holder.
 * `expired`      the record is older than the declared observation window: the
 *                reputational claim has lapsed by convention, not been lost.
 * `refused`      too few acts, or too little weighted exposure, to publish a
 *                rate at all. A refusal is a first-class outcome and prints its
 *                own reason — never a zero and never a coin-flip with a badge.
 */
export const REPUTATION_VERDICTS = Object.freeze(['solvent', 'encumbered', 'drawn-down', 'insolvent', 'contested', 'expired', 'refused']);

export const REPUTATION_VERDICT_META = Object.freeze({
  solvent: Object.freeze({
    label: 'Solvent',
    tone: 'good',
    meaning: 'The record\'s weighted beta interval clears the declared obstacle threshold for this act class. The stake is enough to carry the ask.',
  }),
  encumbered: Object.freeze({
    label: 'Encumbered',
    tone: 'warn',
    meaning: 'The stake is real but smaller than the ask. The report prices the gap in acts — it never recommends withholding the ask on its own.',
  }),
  'drawn-down': Object.freeze({
    label: 'Drawn down',
    tone: 'bad',
    meaning: 'The whole interval sits BELOW the declared class hazard rate: this is not a large ask, it is a record worse than the base rate for its class. A repair is the only honest route and the report prices it.',
  }),
  insolvent: Object.freeze({
    label: 'No history',
    tone: 'neutral',
    meaning: 'Nothing of this act class has been completed on record. A guarantee from this span is worth its stated price and nothing more.',
  }),
  contested: Object.freeze({
    label: 'Contested',
    tone: 'bad',
    meaning: 'A recorded challenge or a disputed breach sits against this act class. The dispute is owned by a human; this screen will not resolve it.',
  }),
  expired: Object.freeze({
    label: 'Lapsed',
    tone: 'neutral',
    meaning: 'The most recent act of this class is outside the declared observation window. The record is not lost — it has stopped counting.',
  }),
  refused: Object.freeze({
    label: 'Refused',
    tone: 'neutral',
    meaning: 'Below the declared act floor or exposure floor. The module refuses a rate rather than printing a coincidence with a badge on it.',
  }),
});

export function reputationVerdictMeta(key) {
  return REPUTATION_VERDICT_META[key] || null;
}

/* ------------------------------------------------------------------ */
/* 2. Act classes — what a person can be relied on for                 */
/* ------------------------------------------------------------------ */

/**
 * The eight commit types an organisation actually relies on. Each is graded
 * from records OTHER modules already own, so a leader does not re-type history
 * to earn reputational credit — the ordinary work is the evidence.
 *
 * `hazard` is the DECLARED base breach rate for the class under the workspace's
 * own convention (see `reputationalCapitalSchema.js`): the prior α/β a
 * Laplace-style estimator starts from. It is a convention, printed on screen,
 * never a fitted value pretending to be a finding.
 */
export const ACT_CLASSES = Object.freeze([
  Object.freeze({ key: 'delivery', label: 'Delivery', frontier: 'Delegations returned on time', question: 'When this span is given a dated piece of work, does it come back — and when?' }),
  Object.freeze({ key: 'custody', label: 'Custody of authority', frontier: 'Bounded authority contracts verified by the sender', question: 'When this span holds authority over someone else\'s resource or right, does it return it whole?' }),
  Object.freeze({ key: 'calibration', label: 'Calibration', frontier: 'Prospective bets graded out of sample', question: 'When this span states a probability and a threshold, does the record beat its class base rate?' }),
  Object.freeze({ key: 'stewardship', label: 'Absorption', frontier: 'Escalations absorbed inside the span\'s own horizon', question: 'Does work stop at the level that can decide it, or climb the ladder by surprise?' }),
  Object.freeze({ key: 'continuity', label: 'Continuity', frontier: 'Declared leadership edges that carry work across the window', question: 'Do the spans beneath this one keep their measured channels?' }),
  Object.freeze({ key: 'allocation', label: 'Allocation', frontier: 'Robust allocations delivered against their frozen solution', question: 'When this span commits a capacity-constrained plan, does the plan happen?' }),
  Object.freeze({ key: 'forecast', label: 'Prediction', frontier: 'Frozen forecasts and scorecard predictions scored once', question: 'Are this span\'s numeric promises inside their own error bars?' }),
  Object.freeze({ key: 'contribution', label: 'Contribution', frontier: 'Recognised acts not witnessed by the span\'s own leader', question: 'Does the span do visible work the person grading it did not see?' }),
]);

export const ACT_CLASS_KEYS = Object.freeze(ACT_CLASSES.map((entry) => entry.key));

export function actClassMeta(key) {
  return ACT_CLASSES.find((entry) => entry.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 3. Act statuses and ledger dispositions                             */
/* ------------------------------------------------------------------ */

/** A single dated act. There are exactly four outcomes. */
export const ACT_STATUSES = Object.freeze(['kept', 'breached', 'disputed', 'excused']);

export const ACT_STATUS_META = Object.freeze({
  kept: Object.freeze({ label: 'Kept', tone: 'good' }),
  breached: Object.freeze({ label: 'Breached', tone: 'bad' }),
  disputed: Object.freeze({ label: 'Disputed', tone: 'warn' }),
  excused: Object.freeze({ label: 'Excused', tone: 'neutral', meaning: 'A human recorded a reason the act could not be met. It neither builds nor destroys stake.' }),
});

/** A derivative, dated position held against a span (a guarantee, or a repair). */
export const POSITION_KINDS = Object.freeze(['guarantee', 'repair']);

export const POSITION_STATUSES = Object.freeze(['open', 'kept', 'breached', 'withdrawn']);

/* ------------------------------------------------------------------ */
/* 4. Conventions (declared, clamped, printed)                         */
/* ------------------------------------------------------------------ */

export const REPUTATION_DEFAULTS = Object.freeze({
  // Observation window: an act older than this has lapsed by convention.
  reputationWindowDays: 365,
  // Below this many graded acts in a cell, no rate is printed.
  reputationActFloor: 6,
  // Below this much weighted (decayed) exposure, no rate is printed.
  reputationExposureFloor: 4,
  // Convexity of the PREMIUM charged when the ask exceeds the stake. 0 = a flat
  // tier obstacle; 1 would charge the full log-ratio. 0.35 means asking twice
  // what the record earned raises the obstacle by about 24% of the way to 100,
  // which is a premium a leader can read, not a cliff.
  reputationObstacleGamma: 0.35,
  // Breach weight per act class (basis points of a kept act). Declared, not fitted.
  reputationBreachBp: 400,
  // Half-life, in days, of an act's reputational weight.
  reputationHalfLifeDays: 270,
  // The guarantee is priced in acts, never in money: this is how many acts of
  // THIS class the offered terms are worth if the class is breached again.
  reputationAskActs: 2,
  // A cell needs at least this share of its acts inside the window to be read.
  reputationCoveragePct: 50,
  // Automatic propagation is on unless a workspace switches it off.
  reputationAutoPropagate: true,
});

export const REPUTATION_LIMITS = Object.freeze({
  windowDaysMin: 30,
  windowDaysMax: 1825,
  actFloorMin: 2,
  actFloorMax: 40,
  exposureFloorMin: 1,
  exposureFloorMax: 40,
  gammaMin: 0.25,
  gammaMax: 4,
  // Convexity of the PREMIUM only: the multiplier is 1 + γ·max(0, ln(ask/stake)),
  // so γ must stay ≤ 3 for the maximum premium to be bounded (at γ = 3 the worst
  // case is 1 + 3·ln(ask/stake)). Uncapped γ would let a large ask print a
  // three-digit obstacle, which is not a price — it is a refusal wearing a number.
  premiumGammaMax: 3,
  breachBpMin: 0,
  breachBpMax: 3000,
  halfLifeMin: 30,
  halfLifeMax: 1825,
  askActsMin: 0,
  askActsMax: 20,
  coverageMin: 0,
  coverageMax: 100,
  // Bounded ledgers. Every collection in this app is capped for a reason: an
  // unbounded append-only ledger eventually stops being a record and starts
  // being a liability.
  acts: 4000,
  positions: 400,
  markers: 1200,
  guaranteesPerScan: 3,
  repairsPerScan: 3,
  actsPerScan: 2000,
  // A cell at or above this many acts may be published without complementary
  // suppression; below it the complementary cell is blanked too (ADR-0092).
  publishedCellFloor: 3,
});

/* ------------------------------------------------------------------ */
/* 5. Engagement tiers — what "guarantee" costs at each obstacle        */
/* ------------------------------------------------------------------ */

/**
 * The obstacle a guarantee has to clear, expressed as a compact ladder rather
 * than a free-text field. A leader picking "escrowed" is declaring that the ask
 * is worth roughly two acts of this class; "vouching" is worth none.
 *
 * The percentage is the DECLARED share of the ask the platform treats as
 * guaranteed at each tier BEFORE the record is read. The ledger's contribution
 * is to move that share with a Wilson-bounded record — up when the class is
 * solvent, down when it is contested, and to zero when it is insolvent.
 */
export const ENGAGEMENT_TIERS = Object.freeze([
  // THE ORDER IS THE HONESTY. A promise backed only by someone's good name is the
  // cheapest to make and the most expensive to keep: it has to be believed at a
  // very high rate before it is worth anything. Every step down the ladder moves
  // the ask OFF the person and ONTO a mechanism, so the rate the record has to
  // clear falls. Smuggling `askActs` into the tier would double-count the ask —
  // the ask is declared per position, and the tier only sets the base obstacle.
  Object.freeze({ key: 'vouching', label: 'Vouching', obstaclePct: 85, meaning: 'Reputation alone. The promise has to be believed at a very high rate to be worth anything, and it is worth nothing if the record has nothing.' }),
  Object.freeze({ key: 'bearing', label: 'Bearing cost', obstaclePct: 60, meaning: 'The holder carries the consequence of a breach personally, so a lower kept rate already makes the promise credible.' }),
  Object.freeze({ key: 'escrowed', label: 'Escrowed', obstaclePct: 35, meaning: 'Something of value is held by a third party until the act completes. The obstacle falls because the consequence no longer depends on trust.' }),
  Object.freeze({ key: 'structural', label: 'Structural', obstaclePct: 15, meaning: 'The guarantee no longer depends on the person at all: the right, the money or the seat is separated (Grossman–Hart residual control). The only tier that survives a breach of its own class.' }),
]);

export const ENGAGEMENT_TIER_KEYS = Object.freeze(ENGAGEMENT_TIERS.map((tier) => tier.key));

export function engagementTierMeta(key) {
  return ENGAGEMENT_TIERS.find((tier) => tier.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 6. Rules and event vocabulary                                       */
/* ------------------------------------------------------------------ */

export const REPUTATION_RULE_IDS = Object.freeze({
  act: 'RULE-RCL-01',
  breach: 'RULE-RCL-02',
  guarantee: 'RULE-RCL-03',
  repair: 'RULE-RCL-04',
  grade: 'RULE-RCL-05',
});

export const REPUTATION_EVENTS = Object.freeze({
  ACT_RECORDED: 'reputation.act.recorded',
  POSITION_OPENED: 'reputation.position.opened',
  POSITION_CLOSED: 'reputation.position.closed',
  SCAN: 'reputation.scan',
});

export const REPUTATION_TRIGGER_PREFIX = 'reputation.';
export const REPUTATION_ACT_EVENTS = Object.freeze([
  'case.resolved', 'case.closed', 'delegation.completed', 'delegation.returned',
  'mandate.verified', 'mandate.breached', 'prospective.graded',
  'escalation.settled', 'robustallocation.delivered', 'forecast.settled',
  'decision.reviewed', 'goal.completed',
]);

/* ------------------------------------------------------------------ */
/* 7. Five altitude-specific playbooks                                 */
/* ------------------------------------------------------------------ */

/**
 * The same ledger read at five altitudes. What changes is not the arithmetic —
 * it is the horizon, the question, and what may travel upward. A frontline lead
 * must never be handed the enterprise's belief about their boss; a chief must
 * never read an individual's repair plan.
 */
export const REPUTATION_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'What do my promises cost to guarantee?',
    horizon: 'Next 7–30 days',
    question: 'For the acts I make every week — delivering, absorbing, showing up — what does my own record support today, and what would one repair cost?',
    see: 'Your own cells only: acts kept, the weighted beta interval, an obstacle price per engagement tier. Never a peer\'s, never your manager\'s.',
    act: 'Where a cell is encumbered, open a repair position before asking for the guarantee. The ledger prices it; it does not open it for you.',
    hand: 'One class, one repair you chose, one date. Never a self-rating and never another person\'s name.',
  }),
  manager: Object.freeze({
    title: 'Whose guarantee is worth taking this month?',
    horizon: '30–90 days',
    question: 'Which of the spans under me is solvent in the act class a proposed guarantee rests on, and which guarantee would be a promise I cannot back?',
    see: 'Each direct report\'s cell at the class the ask names, with the weighted beta interval and the exposure behind it. Peer managers are aggregates.',
    act: 'Price the guarantee against the class it needs, choose the cheapest tier that clears the obstacle, and record it as a dated position.',
    hand: 'The guarantee, its class, the tier and the date it lapses — never a judgement about whether the person is trustworthy.',
  }),
  director: Object.freeze({
    title: 'Where is reputational capital destroying itself?',
    horizon: '90–180 days',
    question: 'Across the spans beneath me, which act classes are being drawn down faster than they are earned — and does a breach cluster in a class, a tier or a span?',
    see: 'Cells aggregated by class × altitude with complementary suppression; contested and expired cells flagged; the class base rate beside the record.',
    act: 'Where one class is insolvent across many spans, the obstacle is structural, not personal: redesign the guarantee, not the people.',
    hand: 'A class-level finding, the count of spans it touches, and the structural change proposed — no individual reading.',
  }),
  exec: Object.freeze({
    title: 'What is our capacity to make binding commitments?',
    horizon: '180–365 days',
    question: 'How much of the enterprise\'s authority is resting on reputational capital, and which portfolios would fail if a class were drawn to zero?',
    see: 'Aggregate cells by altitude and class with intervals; the share of open guarantees resting on a solvent class; the withdrawal shock for the worst class.',
    act: 'Decide which guarantees must become structural, and fund the repairs those classes need before the next commitment cycle.',
    hand: 'A bounded aggregate and the structural asks, with the classes left refused stated as refused.',
  }),
  chief: Object.freeze({
    title: 'The enterprise\'s capacity to be believed',
    horizon: '365–730 days',
    question: 'Across every span, class and tier: is the organisation\'s reputational capital growing, flat or being drawn down — and is any single class carrying more than it can bear?',
    see: 'A single weighted-beta reading per class, a growth/drawdown verdict against the declared window, and the number of classes that cannot be published at all.',
    act: 'Record the enterprise decision on where those classes must become structural — and accept that the ledger will keep printing refusals until they do.',
    hand: 'One dated, identity-free statement of capacity-to-be-believed, with every refusal named.',
  }),
});

/* ------------------------------------------------------------------ */
/* 8. Disclosure — printed on the screen, not buried in a tooltip      */
/* ------------------------------------------------------------------ */

export const REPUTATION_DISCLOSURE = Object.freeze({
  model:
    'Obstacle price = the declared tier obstacle, raised by (1 + gamma × max(0, ln(ask / stake))): a convex cost of asking beyond what the record has earned. Stake is the Laplace-weighted beta of a Wilson-bounded act series, decayed half-life-wise over the observation window. The gamma convexity is an exponent applied to an odds ratio — it behaves like a power law, not like the raw beta.',
  unit:
    'The unit is the PERSON as a counter-party, never the person as an employee: the ledger prices what an act will cost to guarantee. It holds no performance rating, no potential rating and no ranking, and it is not readable by anyone who does not hold the person\'s own cell or the aggregate above them.',
  wilson:
    'Every published rate is a Wilson (1927) score interval at the declared level, and a verdict is read off the INTERVAL, never off the point estimate: a cell whose interval straddles the obstacle is refused rather than called solvent.',
  wilsonFirst:
    'WILSON-FIRST: if a single act were observed from an unknown counter-party, would the interval already place this class at the obstacle? A prior that could decide the answer on its own is not a prior — it is an opinion wearing a uniform, so the prior never decides a verdict.',
  base:
    'The class hazard rate is a DECLARED convention printed beside every cell, not a fitted value. It anchors the estimator; it is never presented as a finding about people.',
  decay:
    'Acts lapse by half-life. A three-year-old perfect record and a perfect record last quarter do not buy the same guarantee, and this screen says so instead of averaging them into flattery.',
  sunkCost:
    'Reputational capital is Sunk-Cost-Invariant (a present re-derivation on the record alone). What a spent act cost in effort cannot make the next guarantee cheaper — only what the act established can.',
  refusal:
    'Below the act floor, the exposure floor, or the publishing cell floor, a figure is BLANK, never zero. A refused cell is a first-class outcome and states its own reason.',
  engine:
    'The engine records, prices, grades and rolls up. It never withholds a decision, never edits a reporting line, never contacts anyone, and never converts a reputational reading into a performance judgement a human did not make.',
});

export const REPUTATION_PREMISE =
  'This screen prices what it costs to be believed. It reads only acts other modules already dated, refuses every cell its own evidence cannot support, and treats a refusal as an answer.';
