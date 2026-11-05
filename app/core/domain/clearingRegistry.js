/**
 * app/core/domain/clearingRegistry.js — leaf vocabulary for the Hierarchical
 * Clearinghouse & Clarke–Groves Internal Resource Market (`#/clearing`,
 * Schema v100, ADR-0098).
 *
 * Zero imports so `schema.js`, `seatRegistry.js`, `disclosureManifests.js`,
 * `csv.js`, `clearingSchema.js`, `clearing.js` and `clearingRules.js` share one
 * canonical vocabulary without circular dependencies.
 *
 * THE ORGANIZATIONAL PROBLEM THIS TERMINAL SOLVES
 * -----------------------------------------------
 * Across every enterprise planning tool (Workday Adaptive, Anaplan, Pigment,
 * Orgvue, ChartHop), cross-team resource contention is resolved by one of two
 * broken mechanisms:
 *   1. Political bargaining & anchored visibility — early bidders anchor late
 *      bidders and loud units capture budget (Milgrom & Roberts 1988,
 *      "An Economic Approach to Influence Activities in Organizations");
 *   2. Uniform "peanut-butter" haircuts — excess demand is cut proportionally
 *      across all spans regardless of marginal value (Hall, Lovallo & Musters
 *      2012, McKinsey corporate capital-reallocation study).
 *
 * And even after a unit wins scarce budget or shared person-days, no workspace
 * records the *sibling opportunity cost* (`τ_i`) its funding displaced, or checks
 * out of sample at the horizon whether realized delivery even cleared that
 * sibling externality hurdle.
 *
 * WHAT THIS MODULE COMPUTES AND ENFORCES
 * --------------------------------------
 *   1. Sealed Multi-Tranche Span Bids: subordinate spans submit 1..4 discrete
 *      package tiers `(cost, capacityDays, [valueLo, valueHi], isMinimumViable)`
 *      into a parent seat's round. While `open`, sibling bids are sealed horizontally
 *      so peers cannot anchor or game one another.
 *   2. Exact 2D Combinatorial Clearing (`budgetCap × capacityCap`) under three
 *      explicit criteria: Nominal, Bertsimas–Sim `Γ`-Robust worst-case, and
 *      Savage Minimax-Regret, with an exact node-counted certificate.
 *   3. Exact `N + 1` Vickrey–Clarke–Groves (VCG) Marginal-Economy Solver:
 *      solves `W*(N)` and each `W*(N \ {i})` to print each funded span's exact
 *      Clarke pivot externality hurdle `τ_i = W*(N \ {i}) - (W*(N) - v_i(x*))`
 *      and net social contribution `ΔW_i = W*(N) - W*(N \ {i})`.
 *   4. Hall–Lovallo–Musters Peanut-Butter Benchmark: computes the exact value
 *      of uniform proportional haircuts and prints `reallocationAlpha = W* - W_pb`.
 *   5. Dantzig–Wolfe / Lagrangian Dual Shadow Prices `(λ*_budget, λ*_capacity)`,
 *      the Decentralization / Integrality Gap `L* - W*`, Herfindahl–Hirschman
 *      concentration, Price of Floor Protection, and Goldratt Theory-of-Constraints
 *      resource-mix bottleneck detection.
 *   6. Once-only Out-of-Sample Hurdle Settlement: grades realized delivery
 *      against `τ_i` with Wilson 95% intervals and Brier proper scoring.
 */

export const CLEARING_ENGINE_VERSION = 'internal-clearinghouse-v1';

export const CLEARING_LIMITS = Object.freeze({
  rounds: 200,
  markers: 1600,
  bidsPerRoundMax: 8,
  tiersPerBidMax: 4,
  titleMax: 140,
  labelMax: 100,
  noteMax: 400,
  budgetMax: 1_000_000_000,
  capacityDaysMax: 50_000,
  valueMax: 1_000_000_000,
  horizonDaysMin: 1,
  horizonDaysMax: 730,
  expectedHoldPctMin: 5,
  expectedHoldPctMax: 95,
  cellFloorMin: 2,
  cellFloorMax: 12,
  reviewDaysMin: 3,
  reviewDaysMax: 180,
  combinationsMin: 1000,
  combinationsMax: 400_000,
  nodeBudgetMin: 5000,
  nodeBudgetMax: 1_000_000,
  imbalanceHighPctMin: 70,
  imbalanceHighPctMax: 100,
  imbalanceLowPctMin: 10,
  imbalanceLowPctMax: 65,
});

export const CLEARING_DEFAULTS = Object.freeze({
  clearingCellFloor: 3,
  clearingReviewDays: 14,
  clearingAutoPropagate: true,
  clearingMaxCombinations: 250_000,
  clearingNodeBudget: 350_000,
  clearingMixImbalanceHighPct: 85,
  clearingMixImbalanceLowPct: 50,
});

export const CLEARING_STATUSES = Object.freeze([
  'open',
  'cleared',
  'settled',
  'withdrawn',
]);

export const CLEARING_REGIMES = Object.freeze([
  'robust',
  'nominal',
  'minimax',
]);

export const CLEARING_LINKABLE_TYPES = Object.freeze([
  'goal',
  'case',
  'strategy',
  'delegation',
]);

export const CLEARING_RULE_IDS = Object.freeze({
  clear: 'RULE-CLR-01',
  hurdle: 'RULE-CLR-02',
  overdue: 'RULE-CLR-03',
  mix: 'RULE-CLR-04',
  calibration: 'RULE-CLR-05',
});

export const CLEARING_MARKER_KINDS = Object.freeze([
  'clear',
  'hurdle',
  'overdue',
  'mix',
  'calibration',
]);

export const CLEARING_EVENTS = Object.freeze({
  OPENED: 'clearing.opened',
  BID_SUBMITTED: 'clearing.bid_submitted',
  WITHDRAWN: 'clearing.withdrawn',
  COMMITTED: 'clearing.committed',
  SETTLED: 'clearing.settled',
  SCAN: 'clearing.scan',
  CONVENTIONS: 'clearing.conventions',
});

export const CLEARING_TRIGGER_PREFIX = 'clearing.';

export const CLEARING_TRIGGER_EVENTS = Object.freeze([
  CLEARING_EVENTS.COMMITTED,
  CLEARING_EVENTS.SETTLED,
  CLEARING_EVENTS.SCAN,
]);

export const CLEARING_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'vcg',
    label: 'Vickrey–Clarke–Groves (VCG) Pivot Mechanism',
    citation: 'Vickrey (1961); Clarke (1971); Groves (1973)',
    summary: 'Solves N + 1 exact combinatorial economies to charge each winning span the exact value τ_i its allocation displaced from sibling spans, aligning truthful bidding with collective welfare.',
  }),
  Object.freeze({
    key: 'dantzig-wolfe',
    label: 'Dantzig–Wolfe / Lagrangian Dual Shadow Pricing',
    citation: 'Dantzig & Wolfe (1960); Baumol & Fabian (1964)',
    summary: 'Computes dual multipliers (λ*_budget, λ*_capacity), discrete marginal unit gains, and the exact Decentralization / Integrality Gap L* − W* between price-guided autonomy and central combinatorial clearing.',
  }),
  Object.freeze({
    key: 'bertsimas-sim',
    label: 'Budgeted Γ-Robust Combinatorial Clearing',
    citation: 'Bertsimas & Sim (2004)',
    summary: 'Evaluates every package combination against adversarial worst-case draws where up to Γ funded spans simultaneously hit the bottom of their declared [lo, hi] value range.',
  }),
  Object.freeze({
    key: 'peanut-butter',
    label: 'Corporate Reallocation & Peanut-Butter Benchmark',
    citation: 'Hall, Lovallo & Musters (2012)',
    summary: 'Benchmarks optimal combinatorial clearing against uniform proportional haircuts and equal splits, printing exact Reallocation Alpha rescued from inertia.',
  }),
  Object.freeze({
    key: 'influence-costs',
    label: 'Sealed-Bid Anti-Anchoring & Influence-Cost Guard',
    citation: 'Milgrom & Roberts (1988)',
    summary: 'Seals sibling tranche bids while a round is open so early bidders cannot anchor late bidders and lateral spans cannot reverse-engineer peer requests.',
  }),
  Object.freeze({
    key: 'toc-mix',
    label: 'Theory of Constraints Resource-Mix Bottleneck',
    citation: 'Goldratt (1984)',
    summary: 'Detects mismatched envelopes where one constraint (money or shared person-days) starves positive-value tranches while the paired constraint sits idle, escalating envelope rebalancing upward.',
  }),
  Object.freeze({
    key: 'calibration',
    label: 'Out-of-Sample Clarke Hurdle Coverage & Proper Scoring',
    citation: 'Wilson (1927); Brier (1950)',
    summary: 'Grades settled rounds once against whether pivotal winners delivered at least their Clarke opportunity-cost hurdle τ_i, with Wilson 95% intervals and strictly-prior Brier skill.',
  }),
]);

export const CLEARING_ALTITUDE_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    horizonDays: 14,
    title: 'Sealed shift & sprint tranche bidder',
    question: 'Which 1–4 concrete delivery tranches can my team execute inside the shift/sprint envelope, and what Clarke hurdle τ_i do I owe siblings if funded?',
    see: 'Open rounds chaired by your direct manager, your own sealed tranche schedule, your own funded tier and Clarke opportunity-cost hurdle, and your delivery task — never sibling spans’ sealed bids.',
    act: 'Submit or revise your span’s tiered package bid with honest [lo, hi] outcome bounds and link the workspace goal, case or delegation that will prove delivery.',
    hand: 'A structured package schedule (cost, shared person-days, [lo, hi] value) instead of an all-or-nothing plea.',
  }),
  manager: Object.freeze({
    horizonDays: 30,
    title: 'Frontline clearing chair & upward unit bidder',
    question: 'Which frontline tranches clear my monthly budget/capacity envelope without peanut-butter haircuts — and what tiered bid should my unit carry upward to my director?',
    see: 'Full clearing table, Clarke externalities and shadow prices for rounds you chair; sealed own-bid view for director rounds above you.',
    act: 'Open a monthly clearing round for your frontline leads, review nominal vs Γ-robust clearing against the peanut-butter haircut baseline, commit the winner, and settle at horizon.',
    hand: 'Committed DACI clearing record, shadow-price bottleneck signal, and upward unit tranche bid.',
  }),
  director: Object.freeze({
    horizonDays: 90,
    title: 'Multi-team market chair & shadow-price governor',
    question: 'Where is money vs shared specialist capacity the true binding bottleneck across my managers, and how much Reallocation Alpha did combinatorial clearing rescue?',
    see: 'Quarterly multi-manager clearing tables, Dantzig–Wolfe dual shadow prices, Decentralization Gap, Resource-Mix Bottleneck alerts, and pooled hurdle calibration.',
    act: 'Chair cross-manager quarterly clearing rounds, rebalance budget-vs-capacity mix escalations from managers below, and govern workspace clearing conventions.',
    hand: 'Currency-segregated Reallocation Alpha, binding shadow prices, and small-cell-safe calibration posture.',
  }),
  exec: Object.freeze({
    horizonDays: 180,
    title: 'Portfolio clearing & hurdle solvency steward',
    question: 'Are pivotal bets across directorates actually delivering above the sibling opportunity cost τ_i they displaced, or is a division chronically over-bidding?',
    see: 'Subtree roll-up across directorates, Reallocation Alpha by currency, Clarke Hurdle Hold rates with Wilson 95% intervals, Brier skill, and suppressed sub-floor cells.',
    act: 'Chair semi-annual directorate clearing rounds, act on chronic hurdle-miss calibration decisions, and audit publication safety before externalizing portfolio tables.',
    hand: 'Audited portfolio reallocation summary and Differencing Register release.',
  }),
  chief: Object.freeze({
    horizonDays: 365,
    title: 'Enterprise capital-capacity clearing & board certificate',
    question: 'How much strategic value did mechanism-driven reallocation rescue over uniform corporate haircuts this year, and is pivotal delivery calibrated across altitudes?',
    see: 'Enterprise altitude roll-up, HHI concentration posture, Clarke Hurdle Hold calibration, Brier skill, and provably undetermined board-pack aggregates.',
    act: 'Chair annual enterprise clearing across executive spans, resolve structural budget-vs-capacity mix bottlenecks, and publish the identity-free Clearing Certificate.',
    hand: 'Identity-free Board Clearing Brief, aggregate CSV #94, and Differencing Register certificate.',
  }),
});

export const CLEARING_DISCLOSURE = Object.freeze({
  truthfulness: 'VCG Clarke pivot pricing makes truthful value revelation a dominant strategy when package values are independent, private to each span, and evaluated under a single fixed additive social objective without collusion or repeat-game budget ratcheting. Under Γ > 0 adversarial coupling or multi-period budget updates, τ_i remains an exact marginal displacement hurdle rather than an unconditional strategyproofness proof.',
  personNeutral: 'A bidder is an organizational SPAN (team, unit, directorate), never an individual performance rating. Missing a Clarke hurdle opens a blameless mechanism & reallocation review decision — it never scores, ranks, disciplines or compensates a person.',
  currency: 'Every round operates in ONE explicit ISO-4217 currency. Reallocation Alpha and encumbered budget totals are partitioned by currency and are NEVER summed across currencies.',
  seal: 'While a round is open, subordinate seats see only the envelope and their own span’s bid. Sibling bids are withheld horizontally to prevent anchoring and influence gaming. Local operating seats remain workflow boundaries, not multi-user cryptographic isolation.',
  determinacy: 'Upward roll-ups, Markdown briefs and CSV #94 strip round titles, bid labels, span names and person names, suppress cells below clearingCellFloor with complementary suppression, and integrate with the ADR-0092 Differencing Register.',
});

export const CLEARING_PREMISE =
  'Uniform haircuts punish your highest-return teams to subsidize inertia; political bargaining rewards volume over value. Clear scarce budget and capacity by sealed tranche schedules, price every winner against the exact sibling value τ_i it displaced, and grade delivery against that hurdle at the horizon.';
