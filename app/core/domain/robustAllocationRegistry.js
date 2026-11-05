/**
 * app/core/domain/robustAllocationRegistry.js — the Robust Allocation Terminal
 * (ADR-0095, Schema v98).
 *
 * THE QUESTION
 * ------------
 * A leader has a fixed budget, a fixed number of leadership hours, and several
 * heterogeneous populations (segments) that each need a different intervention.
 * Every intervention's true effect is unknown — only a declared range [lo, hi]
 * is defensible. The naive move is to plug in a point estimate and optimise;
 * that maximises the forecast and maximises the error (Michaud 1989,
 * "error maximisation"). The OR world answers this with robust optimisation
 * (Soyster 1973; Ben-Tal & Nemirovski 1998; Bertsimas & Sim 2004) but hands the
 * leader a Python solver, not a governed decision. The people-analytics world
 * (Visier, Workday, Orgvue, ChartHop) answers it with point-forecast scenario
 * dashboards that never print a worst-case guarantee, never price an equity
 * floor, and never grade the allocation out of sample.
 *
 * This terminal does the OR properly INSIDE the leadership workspace: it solves
 * a multi-action, capacity-constrained integer allocation under Bertsimas–Sim
 * budgeted uncertainty, prints the Wald maximin and the Savage minimax-regret
 * plans side by side, prices the equity floor (the "price of fairness"), stress
 * tests which single effect range flips the recommendation, and ranks the
 * ranges by the regret they would release if resolved. Adopting the plan writes
 * one governed DACI decision, one owned delivery task per funded line, typed
 * provenance and one roll-up edge per leadership ancestor — in the SAME atomic
 * transaction on the shared spine. A linked Prospective Intervention Contract
 * (ADR-0094) then grades the premise out of sample, and a missed threshold opens
 * a governed re-allocation decision automatically.
 *
 * FRAMEWORKS ENCODED (named, not paraphrased)
 * -------------------------------------------
 *  - Bertsimas & Sim (2004) budgeted uncertainty Γ: at most Γ of the n effect
 *    ranges sit at their worst end simultaneously. Γ=0 is the optimistic point
 *    forecast; Γ=n is Soyster's full box. The adversary picks the Γ largest
 *    downside exposures, so the worst case is exact, not sampled.
 *  - Wald (1950) maximin: choose the allocation with the best worst case.
 *  - Savage (1951) minimax regret: choose the allocation whose largest gap to
 *    the scenario-wise oracle is smallest. Regret is computed against the exact
 *    per-scenario optimum over the SAME feasible set.
 *  - Bertsimas & Sim (2004) / Goerigk & Lendl (2021) / Yaman (2023): a robust
 *    integer problem under budgeted uncertainty is solved exactly by enumerating
 *    the C(n, Γ) nominal scenario problems — efficient for small n, which is the
 *    bounded regime this terminal declares and refuses outside of.
 *  - Rawls (1971) maximin / equity floor: a per-segment minimum coverage is a
 *    hard constraint; the worst-case value it costs is the printed price of
 *    fairness, so the equity–efficiency trade-off is a number, not a slogan.
 *  - Little (1961) / capacity saturation: a segment cannot be served beyond its
 *    declared size; budget and leadership hours are hard, single-currency caps.
 *  - One-at-a-time sensitivity / break-even analysis: stress each effect range
 *    to its floor and report which single stress flips the recommended plan.
 *  - Value of information (Raiffa & Schlaifer 1961): rank ranges by worst-case
 *    exposure and compute the exact regret released by resolving the top one.
 *  - Jaques' time-span of discretion: the horizon and the question change with
 *    the altitude that declares the allocation.
 *  - Statistical disclosure control (small-cell + complementary suppression)
 *    and the Wilson (1927) score interval for the falsified share.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - Never rate, rank or score a person. The subject of every figure is a PLAN,
 *    a SEGMENT or an ACTION LINE — never an individual's worth or effort.
 *  - Never assert causality. A solved allocation is a decision under declared
 *    assumptions; a graded contract says a threshold was reached, not that the
 *    allocation caused it.
 *  - Never pool money across currencies. A plan declares ONE currency; the
 *    upward roll-up carries hours and counts, never a summed budget.
 *  - Never invent an effect, a segment size or a feasible plan. An infeasible
 *    floor, an over-cap instance or an unobservable outcome is REFUSED with a
 *    printed reason, never silently truncated or scored as zero.
 *  - Never auto-adopt a plan, close a human decision, send a message or change a
 *    reporting line.
 */

export const ROBUST_ALLOCATION_ENGINE_VERSION = 'robust-allocation-v1';

export const ROBUST_ALLOCATION_LIMITS = Object.freeze({
  plans: 120,
  markers: 900,
  actionsMax: 6,
  segmentsMax: 6,
  unitsMax: 8,
  // The exact-enumeration bound. A plan whose feasible grid exceeds this is
  // REFUSED with a printed reason (reduce units or actions), never approximated.
  combinationsMax: 50000,
  combinationsMin: 1000,
  // C(6,3)=20 is the largest scenario count for n<=6; the cap is a guard, not a
  // refusal the declared regime can reach.
  scenariosMax: 24,
  budgetMax: 100000000,
  hoursMax: 100000,
  effectMax: 100000,
  sizeMax: 100000,
  horizonDaysMin: 7,
  horizonDaysMax: 365,
  cellFloorMin: 2,
  cellFloorMax: 20,
  reviewDaysMin: 1,
  reviewDaysMax: 90,
  decisionsPerScan: 12,
  titleMax: 120,
  labelMax: 80,
  noteMax: 240,
});

export const ROBUST_ALLOCATION_DEFAULTS = Object.freeze({
  robustAllocationCellFloor: 4,
  robustAllocationReviewDays: 14,
  robustAllocationAutoPropagate: true,
  robustAllocationMaxCombinations: 50000,
});

export const ROBUST_ALLOCATION_RULE_IDS = Object.freeze({
  adopt: 'RULE-RAL-01',
  falsified: 'RULE-RAL-02',
  overdue: 'RULE-RAL-03',
  ungraded: 'RULE-RAL-04',
});

export const ROBUST_ALLOCATION_EVENTS = Object.freeze({
  DECLARED: 'robustAllocation.declared',
  ADOPTED: 'robustAllocation.adopted',
  SCAN: 'robustAllocation.scan',
  CONVENTIONS: 'robustAllocation.conventions',
});

export const ROBUST_ALLOCATION_TRIGGER_PREFIX = 'robustAllocation.';

export const ROBUST_ALLOCATION_MARKER_KINDS = Object.freeze([
  'declared', 'adopted', 'falsified', 'overdue', 'ungraded', 'conventions',
]);

/** Default planning horizon by declaring altitude (Jaques time-span). */
export const ROBUST_ALLOCATION_ALTITUDE_HORIZONS = Object.freeze({
  frontline: 14,
  manager: 30,
  director: 60,
  exec: 90,
  chief: 180,
});

/**
 * Five altitude-specific jobs. One solver, five different questions, five
 * different decisions and five different hand-ups. A frontline lead is never
 * buried in enterprise portfolio analytics; a chief never reads a shift line.
 */
export const ROBUST_ALLOCATION_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Where do my next hours and budget actually buy the most?',
    horizon: 'Next 7–14 days',
    question: 'Given my budget, my hours and the people I serve, which mix of interventions has the best worst case?',
    see: 'My own plan, its robust and regret lines, and the stress that would flip it. No pooled rate is published at this altitude.',
    act: 'Model the ranges honestly, adopt the robust line, and let the engine open the delivery tasks. Re-declare when a range is falsified.',
    hand: 'A dated count of funded lines and committed hours; never a self-rating and never a claim about anyone\u2019s performance.',
  }),
  manager: Object.freeze({
    title: 'Is my unit\u2019s capacity going to the work that survives the worst case?',
    horizon: '30–60 days',
    question: 'Across my spans, which adopted plans are funded, which are overdue, and which premises were falsified out of sample?',
    see: 'Plans in my span, their funded lines and committed hours, and any open re-allocation finding. Pooled rates are withheld below the floor.',
    act: 'Own the delivery-integrity decision for an overdue plan; re-allocate when a linked contract misses its threshold.',
    hand: 'Counts of adopted, falsified and overdue plans plus committed hours; no person named, no budget summed across currencies.',
  }),
  director: Object.freeze({
    title: 'What is the price of the equity floor we are choosing to pay?',
    horizon: '60–180 days',
    question: 'Across altitude × segment cells, how much worst-case value does the equity floor cost, and where is the evidence too thin to say?',
    see: 'Per-cell price of fairness, falsified share with a Wilson 95% interval, and complementary suppression below the floor.',
    act: 'Set the cell and review conventions; own the one governed re-allocation decision per falsified plan per week.',
    hand: 'A cell table with intervals and refusals; no plan id, no title, no person and no free text.',
  }),
  exec: Object.freeze({
    title: 'Which portfolio of allocations is mispriced against its own assumptions?',
    horizon: '90–365 days',
    question: 'Where is the organisation systematically over-optimistic, and is the measured sample large enough to say?',
    see: 'Aggregate rows by altitude, the falsified share against the base rate, and the count of refused cells.',
    act: 'Decide which planning practice to change; the engine never re-solves or re-adopts a plan for anyone.',
    hand: 'A portfolio row and the governed decisions this portfolio owns.',
  }),
  chief: Object.freeze({
    title: 'Is the leadership bench allocating under uncertainty honestly?',
    horizon: 'Company-wide',
    question: 'Across the whole declared tree, are allocations robust, are equity floors priced, and how much of the evidence is refused?',
    see: 'One workspace row, the identity-free brief and the reliability of the instrument itself.',
    act: 'Carry the identity-free brief to the board; never drill into an individual shift\u2019s funded lines.',
    hand: 'A board-ready sentence with a Wilson interval and an explicit statement of what is NOT claimed.',
  }),
});

export const ROBUST_ALLOCATION_DISCLOSURE = Object.freeze({
  premise: 'An allocation is solved under declared effect ranges and hard capacity, budget and equity constraints. It is a decision under assumptions, not a forecast of what will happen and never a rating of a person.',
  uncertainty: 'Bertsimas–Sim budgeted uncertainty: at most Γ of the effect ranges sit at their worst end at once. Γ=0 is the optimistic point forecast; Γ=n is the full box. The worst case is the exact adversary choice, not a sample.',
  solver: 'The robust integer problem is solved exactly by enumerating the feasible integer grid and the C(n, Γ) scenario problems. A grid above the declared combination bound is REFUSED with a printed reason, never approximated or silently truncated.',
  equity: 'A per-segment equity floor is a hard constraint. The worst-case value it costs versus the unconstrained plan is the printed price of fairness; an infeasible floor is refused, not relaxed.',
  rollup: 'An adopted plan is a graph node fanned out to every leadership ancestor in the SAME atomic transaction. The upward form carries counts, hours, dates and state names — never a title, a plan id, a person name or a currency amount.',
  engine: 'The engine opens governed decisions and owned dated work and writes typed provenance. It never auto-adopts a plan, never closes a human decision, never sends a message and never changes a reporting line.',
  local: 'Local seat selection is an auditable workflow declaration, not authentication. There is no server-side tenancy here; a real deployment still needs an authenticated boundary.',
});

export const ROBUST_ALLOCATION_PREMISE =
  'This screen solves a multi-action, capacity-constrained allocation under declared effect ranges — printing the Wald maximin and Savage minimax-regret plans, the price of the equity floor, and the single range whose resolution would release the most regret — and refuses to dress a point forecast up as a guarantee.';
