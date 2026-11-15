/**
 * app/core/domain/capitalRationingRegistry.js — the closed vocabulary of the
 * Capital Rationing & Funded-Set Selection Register (ADR-0211, Session 280,
 * Schema v165, `RULE-CRS-01`, CSV scope #153, `#/finance?panel=rationing`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. It is the second week of November and the
 * group has 40 million to commit before the year turns. Eleven investment cases
 * are on the register, ratified, each individually worth more than zero at its
 * own declared hurdle, and the sum of what they ask is 61 million. Every one of
 * them can be justified on its own. The ratio of them that can be funded is the
 * question nobody in this workspace can currently answer, because the register
 * appraises each case *alone* and then prints the proposals in an order. An
 * order is not a decision. Two of the eleven are alternative ways of doing the
 * same thing — a second line in Aarhus OR the third shift in Vejle — and funding
 * both funds the same benefit twice. One of them only pays back if the warehouse
 * expansion (a different case) is also funded, and the warehouse is the one that
 * looks weakest on its own numbers. Another delivers a benefit the finance
 * system will already book from a programme that is not on this register at all.
 *
 * THE GAP THIS CLOSES, IN THE PRODUCT'S OWN WORDS. Session 277 built the
 * register and printed its own limit on the panel: "proposals are ordered for
 * rationing but not cut off against a declared capital budget." Session 279
 * closed a different gap. The register's ordering (`investmentCase.js` §5) sorts
 * proposals by profitability index and stops there. A rank is not a funded set,
 * and a profitability index ranking is *known to be wrong* the moment any case
 * consumes a shared benefit, depends on another, or excludes another —
 * Weingartner (1963) is the paper that ended the ranking era, and the reason
 * integer programming replaced it.
 *
 * WHAT THIS REGISTER ADDS, AND IT IS ALL DECLARATION + EXACT SEARCH.
 *
 *   1. A CAPITAL CEILING — a dated, per-currency statement by a seat at the
 *      enterprise altitude of how much money may be committed in a period. One
 *      ceiling per (currency, period). Never inferred from the sum of the budget
 *      envelopes, because an envelope is an authority to spend on operations and
 *      a capital ceiling is a claim on the balance sheet; the two are different
 *      instruments held by different people, and a ceiling invented from them
 *      would fabricate a constraint nobody signed.
 *
 *   2. RELATIONS BETWEEN CASES — three kinds, each a dated human declaration
 *      with a written reason, because none of them can be read from the flows:
 *        `exclusive`      — at most one of the pair may be funded. The reason is
 *                            that they pursue the same objective by different
 *                            means. Funding both double-counts the benefit, so
 *                            the pair's *sum* is not an achievable value.
 *        `requires`       — the first may only be funded if the second is. The
 *                            benefit claimed by the first is contingent on the
 *                            second being real; funding it alone buys a promise
 *                            with nothing behind it.
 *        `overlap`        — a declared, quantified share of one case's promised
 *                            benefit that will ALSO be booked by the other, as
 *                            whole basis points. Not zero and not 10,000: a
 *                            full overlap is an `exclusive` declaration and the
 *                            register refuses to record it as something weaker.
 *
 *   3. THE EXACT FUNDED SET — a multiple-choice, multi-constraint integer
 *      knapsack solved to PROVEN optimality by depth-first branch and bound
 *      with an exact rational LP-relaxation bound (Dantzig 1957; Weingartner
 *      1963; Kellerer, Pferschy & Pisinger 2004). No greedy pass, no "close
 *      enough": when the search finishes inside its declared node budget the
 *      value is optimal and this register says so; when the budget is exhausted
 *      the answer is REFUSED with the reason rather than downgraded to the best
 *      found so far and called a plan.
 *
 *   4. THE PRICE OF THE CONSTRAINT — the shadow price of capital, read as the
 *      exact finite difference: the same problem re-solved with one more unit of
 *      ceiling, and the change in the optimal value. On a knapsack the value
 *      function is a step function, so a derivative is meaningless and the
 *      difference is exact and finite. It is the number that answers "what is
 *      the next million worth to us?", which no ranking can produce.
 *
 *   5. THE VALUE OF THE ORDINARY RANKING, MEASURED — the profitability-index
 *      order that the register already prints is solved as a second, separate
 *      plan, and the exact difference between it and the optimum is printed.
 *      That number is the cost of the heuristic this product shipped with. It is
 *      zero when every case is independent, and it is not zero exactly when
 *      exclusivity, dependency or overlap is present — which is the finding.
 *
 *  WHAT IT NEVER DOES. It never funds anything: a funded set is a RECOMMENDATION
 *  computed from ratified cases and declared ceilings, and ratification remains
 *  the human act it already was. It never edits a case, its flows, its appraisal
 *  or its ratification. It never pools currencies — each currency is its own
 *  problem with its own ceiling, its own shadow price and its own funded set,
 *  because adding DKK to EUR manufactures a figure no record supports. It never
 *  treats an unpriced case as free, or a caseless ceiling as satisfied. It never
 *  rates a person.
 */

export const CAPITAL_RATIONING_ENGINE_VERSION = 'capital-rationing-2026.11-v1';
export const CAPITAL_RATIONING_ADR = 'ADR-0211';
export const CAPITAL_RATIONING_RULE_ID = 'RULE-CRS-01';
export const CAPITAL_RATIONING_ROUTE = 'finance';
export const CAPITAL_RATIONING_PANEL = 'rationing';
export const CAPITAL_RATIONING_HREF = '#/finance?panel=rationing';
export const CAPITAL_RATIONING_CSV_SCOPE = 'capital-rationing-funded-sets';
export const CAPITAL_RATIONING_MARKER_KIND = 'capital-rationing';

export const CAPITAL_RATIONING_EVENTS = Object.freeze({
  CEILING_DECLARED: 'capitalCeiling.declared',
  CEILING_RETIRED: 'capitalCeiling.retired',
  RELATION_DECLARED: 'capitalRelation.declared',
  RELATION_RETIRED: 'capitalRelation.retired',
  CONVENTIONS: 'capitalRationing.conventions.set',
  SCAN: 'capitalRationing.scan',
});
export const CAPITAL_RATIONING_EVENT_PREFIX = 'capitalRationing.';
export const CAPITAL_CEILING_EVENT_PREFIX = 'capitalCeiling.';
export const CAPITAL_RELATION_EVENT_PREFIX = 'capitalRelation.';

/**
 * Reading is open at every altitude and scoped by the reader to the cases whose
 * benefit owner sits in the seat's span. A ceiling is a claim on the enterprise's
 * own money, so DECLARING one is a VP / C-suite act — the altitude that answers
 * "what do we fund, what do we deliberately refuse". A relation between two cases
 * is declared by a seat above BOTH cases' benefit owners (through the tree or a
 * declared matrix line): the person who can see both promises is the only one who
 * can say they are alternatives. GOVERNING the conventions is the same window.
 */
export const CAPITAL_RATIONING_RIGHTS = Object.freeze({
  READ: 'read-capital-rationing',
  DECLARE_CEILING: 'declare-capital-ceiling',
  DECLARE_RELATION: 'declare-capital-relation',
  GOVERN: 'govern-capital-rationing',
});

/* ------------------------------------------------------------ vocabularies */

/**
 * The three relations a human may declare between two investment cases.
 * Exhaustive and mutually exclusive by construction: one row, one kind.
 */
export const CAPITAL_RELATION_KINDS = Object.freeze([
  Object.freeze({
    key: 'exclusive',
    label: 'Alternatives — at most one may be funded',
    symmetric: true,
    says: 'Both cases pursue the same objective by different means, so funding both funds the same benefit twice. The pair’s combined value is NOT the sum of their values, and the solver may fund at most one of them.',
  }),
  Object.freeze({
    key: 'requires',
    label: 'Depends on — only fundable together with',
    symmetric: false,
    says: 'The first case’s promised benefit is contingent on the second being real. Funding the first alone buys a promise with nothing behind it, so the solver funds the first only when it also funds the second.',
  }),
  Object.freeze({
    key: 'overlap',
    label: 'Shared benefit — a declared share is counted twice',
    symmetric: true,
    says: 'A declared share of one case’s promised benefit will also be booked by the other. The solver deducts exactly that declared share from the combined value when both are funded, so the funded set never claims a benefit twice.',
  }),
]);
export const CAPITAL_RELATION_KIND_KEYS = Object.freeze(CAPITAL_RELATION_KINDS.map((row) => row.key));
export const capitalRelationKindByKey = (key) => CAPITAL_RELATION_KINDS.find((row) => row.key === key) || null;

/** How an overlap share was entered and stored: whole basis points of the FIRST case's benefit. */
export const CAPITAL_OVERLAP_UNITS = 'basis points of the “a” case’s promised benefit, exclusive of 0 and 10,000';

/**
 * Why a funded set is or is not printed. Exhaustive and mutually exclusive, and
 * decided in this order, so the reason on the screen is the reason that applied.
 */
export const CAPITAL_SELECTION_STATES = Object.freeze([
  Object.freeze({ key: 'optimal', label: 'Proven optimal', tone: 'good', printed: true, says: 'The branch-and-bound search closed its gap and no combination of the candidates beats the one printed. The value is the maximum achievable under the declared ceiling and relations.' }),
  Object.freeze({ key: 'node-budget-exhausted', label: 'Refused — search bound reached', tone: 'bad', printed: false, says: 'The candidate set was too large for the declared node budget, so no optimality could be proven. The best-found set is NOT printed as a plan: a set that might be beaten by a better one is a guess wearing a table.' }),
  Object.freeze({ key: 'too-many-cases', label: 'Refused — above the certified size', tone: 'bad', printed: false, says: 'The number of undecided candidates exceeds the size this solver certifies. Nothing is printed rather than printing an approximation.' }),
  Object.freeze({ key: 'no-ceiling', label: 'No ceiling declared', tone: 'warn', printed: false, says: 'No seat at the enterprise altitude has declared how much money may be committed in this currency and period. Every candidate in that currency fits trivially, which is an arithmetic fact and not a decision.' }),
  Object.freeze({ key: 'no-candidates', label: 'Nothing to select', tone: 'neutral', printed: true, says: 'No ratified case is undecided in this currency and period. The set is empty because the population is empty, not because everything was refused.' }),
  Object.freeze({ key: 'unpriced-candidates', label: 'Incomplete — a candidate has no price', tone: 'warn', printed: false, says: 'At least one candidate’s value could not be read (its flows or its declared hurdle do not resolve). It is counted and the set is withheld rather than priced at zero, because a case treated as free is always selected.' }),
]);
export const CAPITAL_SELECTION_STATE_KEYS = Object.freeze(CAPITAL_SELECTION_STATES.map((row) => row.key));
export const CAPITAL_SELECTION_STATE_BY_KEY = Object.freeze(Object.fromEntries(CAPITAL_SELECTION_STATES.map((row) => [row.key, row])));

/** Which comparison plan is being described. */
export const CAPITAL_PLAN_KINDS = Object.freeze([
  Object.freeze({ key: 'optimal', label: 'Proven optimal set', says: 'The highest achievable present value under the declared ceiling, exclusivity, dependency and overlap.' }),
  Object.freeze({ key: 'rank-order', label: 'Profitability-index order', says: 'The heuristic this workspace already printed: take cases in descending present value returned per unit put in, skipping any that no longer fit. Solved under the SAME relations, so the only difference measured is the ORDER.' }),
]);

/**
 * Every reason a figure on this panel can be a dash rather than a number. The
 * panel prints the ones that applied; the CSV blanks the cell and names the key.
 */
export const CAPITAL_RATIONING_REFUSALS = Object.freeze([
  Object.freeze({ key: 'currencies-not-pooled', says: 'Currencies are never pooled and a ceiling is never converted. Each currency is its own problem with its own optimal set and its own shadow price.' }),
  Object.freeze({ key: 'npv-not-summed-across-days', says: 'Net present values valued on different days at different rates are not added into a workspace total. Each case carries its own value; the funded set sums only what it selected, in one currency.' }),
  Object.freeze({ key: 'no-ceiling-declared', says: 'A currency has candidates but no declared ceiling. Nothing is cut off against a number nobody declared.' }),
  Object.freeze({ key: 'no-ceiling-by-any-seat', says: 'No ceiling at all is on the record. Every section of this register is empty because the constraint it reads does not exist yet.' }),
  Object.freeze({ key: 'search-refused', says: 'A search was refused (node budget or size). The reason is printed per currency; no approximate plan is offered in its place.' }),
  Object.freeze({ key: 'unpriced-candidate', says: 'A candidate’s value could not be read. It is counted, excluded from the problem, and the set for its currency is withheld — a case priced at zero is always selected.' }),
  Object.freeze({ key: 'relation-unreadable', says: 'A declared relation names a case that is not ratified, is already decided, or cannot be read in the same currency. It is counted and excluded from the problem; the set prints the count rather than silently ignoring it.' }),
  Object.freeze({ key: 'relation-currency-mismatch', says: 'A relation spans two currencies. It is counted and excluded: a DKK case can never be an alternative to a EUR case, and the register will not invent an exchange rate to make it one.' }),
  Object.freeze({ key: 'retrospective-excluded', says: 'A case declared after its first outlay day was written with hindsight. It is offered as a candidate only when it is ratified and undecided; its own retrospective flag is printed on the case and it is counted here.' }),
  Object.freeze({ key: 'already-decided', says: 'A case already ratified is NOT undecided, and one refused or withdrawn is not fundable. Neither is a candidate: the funded set is a recommendation over what nobody has decided yet, and a decision already taken is a fact the register does not re-open.' }),
  Object.freeze({ key: 'outside-span', says: 'Cases whose benefit owner sits outside this seat’s tree and declared lines are counted, never listed, and never enter a set this seat reads.' }),
  Object.freeze({ key: 'truncated', says: 'More candidates exist than this screen lists. The totals count all of them and the search ran over all of them.' }),
  Object.freeze({ key: 'invalid-ledger', says: 'A stored ceiling or relation could not be read exactly and was dropped with a counted warning. Nothing was repaired into a constraint.' }),
  Object.freeze({ key: 'rank-order-equal', says: 'The profitability-index order achieved exactly the optimal value on today’s candidates. That is a property of this problem, not a general guarantee.' }),
]);

export const CAPITAL_RATIONING_LIMITS = Object.freeze({
  /** Declared ceilings kept. Append-only. */
  ceilings: 400,
  /** Declared relations kept. Append-only. */
  relations: 1200,
  /** The rule's bounded observation ledger. */
  markers: 400,
  /** Candidates one currency may present to the exact search. Above this it refuses. */
  maxCandidates: 26,
  /** The shared node budget for every search in one read. */
  nodeBudget: 400_000,
  /** Distinct currencies one read will solve. A workspace with 40 currencies is not a decision. */
  maxCurrencies: 12,
  titleMin: 3,
  titleMax: 120,
  reasonMin: 8,
  reasonMax: 500,
  /** Overlap share bounds in basis points, exclusive at both ends. */
  overlapBpMin: 1,
  overlapBpMax: 9999,
  /** The funded-set history kept on the screen. */
  historyRowsShown: 20,
  /** How many rows a plan prints before it summarises. */
  planRowsShown: 40,
  asksPerCommit: 4,
  /** A ceiling's period is a real calendar range: at most two years. */
  periodMaxDays: 731,
});

export const CAPITAL_RATIONING_SETTING_KEYS = Object.freeze({
  askDueDays: 'capitalRationingAskDueDays',
  autoPropagate: 'capitalRationingAutoPropagate',
});

export const CAPITAL_RATIONING_DEFAULTS = Object.freeze({
  askDueDays: 14,
  autoPropagate: true,
});

export const CAPITAL_RATIONING_BOUNDS = Object.freeze({
  askDueDays: Object.freeze([1, 60]),
});

export const CAPITAL_RATIONING_SETTING_LABELS = Object.freeze({
  askDueDays: 'Days a "declare a ceiling" ask is due within',
  autoPropagate: 'Capital-rationing automation (RULE-CRS-01)',
});

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #153. One workspace row, one row per currency, one row per candidate
 * under an opaque positional code, and one row per relation. NO person, NO
 * manager, NO case id, NO case title, NO note and NO reason text. A figure that
 * cannot be claimed exports BLANK with its reason key, never zero. Money is whole
 * cents; shares and rates are whole basis points.
 */
export const CAPITAL_RATIONING_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'currency', 'generated_on',
  'candidates_n', 'selected_n', 'ceiling_cents', 'ask_cents', 'selected_cents', 'headroom_cents',
  'selection_state', 'optimal_npv_cents', 'rank_order_npv_cents', 'rank_order_gap_cents',
  'shadow_price_cents', 'shadow_price_bp', 'nodes_explored', 'nodes_pruned', 'bound_proven',
  'exclusive_pairs_n', 'requires_pairs_n', 'overlap_pairs_n', 'relations_excluded_n',
  'case_code', 'case_npv_cents', 'case_outlay_cents', 'case_pi_permille', 'case_status', 'case_selected',
  'relation_kind', 'relation_bp', 'relation_state',
  'ceilings_n', 'period_from', 'period_to',
  'figures_complete', 'claim_reason', 'engine_version',
]);

export const CAPITAL_RATIONING_CSV_DESCRIPTOR = Object.freeze({
  key: CAPITAL_RATIONING_CSV_SCOPE,
  label: 'Capital rationing funded sets and shadow price (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'capital-rationing-funded-sets',
  description: 'One identity-free workspace row, one row per currency solved, one row per candidate under an opaque positional code and one row per declared relation: the declared ceiling, what the candidates ask, the proven-optimal funded set (present value, money committed, headroom), the shadow price of one more unit of ceiling, the value the profitability-index order achieved and the exact gap between it and the optimum, the nodes the exact search explored and pruned, and the declared exclusivity, dependency and overlap relations with their state. Contains NO person, manager, case id, title, note or reason text. Currencies are never pooled and net present values are never summed across valuation days. A figure that cannot be claimed exports BLANK with its reason key, never zero. Money is whole cents.',
});

/* ------------------------------------------------------------------ method */

export const CAPITAL_RATIONING_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'weingartner',
    label: 'Weingartner (1963), “Mathematical Programming and the Analysis of Capital Budgeting Problems” — the ranking era ended here',
    says: 'Discounting each project alone and then ranking by profitability index is exactly correct only when every project is independent, divisible and there is one constraint. It fails the moment projects are mutually exclusive, contingent on one another, or share a benefit. Weingartner formulated the budget as an integer program for that reason, and this register solves it that way rather than re-printing a ranking.',
  }),
  Object.freeze({
    key: 'dantzig',
    label: 'Dantzig (1957) — bounded knapsack, and branch and bound as an exact method',
    says: 'A 0/1 selection under a single resource ceiling is the bounded knapsack, and Lin-Kernighan-style local search is not required to solve it: depth-first branch and bound with a relaxation bound finds a PROVABLY optimal set and can say when it has. Every node budget, every prune and the proof itself is printed here so the claim is checkable rather than asserted.',
  }),
  Object.freeze({
    key: 'lp-bound',
    label: 'The LP relaxation of a knapsack is solved exactly by the density ordering (Dantzig 1957)',
    says: 'The fractional optimum takes items in decreasing value per unit of resource until one is cut. That value is an upper bound on any integer set, which is why it can prune: if no completion of a branch can beat the best set already found, the branch is abandoned without pretending the rest was searched.',
  }),
  Object.freeze({
    key: 'shadow-price',
    label: 'The shadow price of capital is a finite difference, not a derivative',
    says: 'The optimal value as a function of the ceiling is a step function: it rises only when another cent lets a whole case in. A derivative would be meaningless and a marginal ratio would be wrong. The price of the next unit is read by re-solving with one more and printing the exact change, and it is zero exactly when the ceiling is not binding — which is an answer, not a failure.',
  }),
  Object.freeze({
    key: 'marginalism',
    label: 'Marginal analysis and the hard budget constraint (Lorie & Savage 1955)',
    says: 'Lorie and Savage showed that under a hard capital constraint the correct test is marginal: accept projects whose return exceeds the opportunity cost implied by the constraint itself, not the ones that look best in isolation. That opportunity cost is precisely the shadow price printed here.',
  }),
  Object.freeze({
    key: 'outside-view',
    label: 'The heuristic is measured, not merely replaced (Kahneman & Lovallo 1993)',
    says: 'Replacing a ranking with an optimizer is only half the duty. The register also solves the ranking as a plan and prints the exact shortfall, so the cost of the convenient method is a number on the record rather than an argument. Where the shortfall is zero it says so, because a zero difference is also evidence.',
  }),
  Object.freeze({
    key: 'no-fx',
    label: 'No currency is converted, ever (the same rule as every money module here)',
    says: 'A DKK case cannot be an alternative to a EUR case and one ceiling cannot bind both. Each currency is a separate problem with a separate set and a separate shadow price. A workspace holding many currencies reads many answers; it is never handed one figure that no exchange rate on the record supports.',
  }),
]);

export const CAPITAL_RATIONING_METHOD = Object.freeze({
  candidate: 'A candidate is a RATIFIED case with no decision act that is already a decision — impossible by construction — which in practice means: the register’s own `approved` and `tracking` states, i.e. ratified by a seat above the benefit owner and not yet reviewed to closure. A `proposed` case is not a candidate (nobody has ratified it, so it is not fundable yet), and a refused, closed or withdrawn case is not one either. Each candidate contributes its appraised net present value at ITS OWN declared hurdle and ITS OWN valuation day; those values are compared only inside one currency and one ceiling.',
  ceiling: 'A ceiling is declared, never inferred: one seat at the enterprise altitude states a currency, a period and a whole-cents maximum commitment, with a written basis. The sum of the budget envelopes is deliberately NOT used — an envelope is authority to spend on operations and appears in a different control ledger held by a different person.',
  exclusive: 'Two cases declared alternatives may not both be funded. The solver searches over combinations under that constraint rather than summing their values, which is the exact arithmetic the pair requires: their benefits measure the same thing.',
  requires: 'A case declared contingent may only be funded together with the case it depends on. The constraint is enforced on the COMBINATION, so a set that funds the dependent alone is not a feasible set and is never printed.',
  overlap: 'A declared shared-benefit relation deducts exactly the declared basis points of the first case’s net present value from the pair when both are funded. Basis points are integers, so the deduction is exact: the funded set never claims a benefit twice, and the deduction is only applied to a set that actually funds both.',
  search: 'Depth-first branch and bound over the candidates in decreasing value-per-cent order, with two bounding rules — the exact fractional knapsack bound on the remaining items (Dantzig 1957) and a declared closure test on the objective. Pruning is STRICT: a node whose bound merely ties the incumbent is still explored, because a tie can hide a different set with the same value, and the register would rather print the first by its own declared order than claim uniqueness it does not have.',
  refusal: 'A search that exhausts its node budget or meets more candidates than the certified size prints NO set, with the reason. An unpriced candidate withholds its currency’s set entirely. A relation that cannot be read is counted and excluded, and the count is printed.',
  shadow: 'The shadow price is the exact change in the optimal value when the ceiling is raised by one whole currency unit (100 cents), re-solved under the same relations. Where the ceiling is not binding it is zero. Where the raise changes nothing it is zero, and zero is printed as zero — not as a dash.',
  rankOrder: 'The profitability-index order is built by taking candidates in descending present value per unit of present value committed, skipping any that would breach the ceiling or a declared relation, and then the same exact search is run over the SAME candidates under the SAME constraints. The difference printed is therefore attributable to the ORDER alone, and it is printed only when both plans were proven.',
  matrix: 'A case’s value is its own; a person with several reporting lines does not make a case cheaper or more valuable, and a case is counted once however many lines reach its owner. What the matrix DOES change is who may declare a relation: the declaring seat must sit above BOTH cases’ benefit owners — through the tree or through declared lines — so an alternatives declaration is never made by one line on behalf of another. Where the two owners share no single seat above them, the relation is printed as unowned and an identity-free observation is recorded instead of an ask.',
  notSaid: 'Nothing here says a funded set is the right strategy, that a case will deliver its promise, or that a person performed. It says: given the promises on the record at their own declared rates, and the ceilings a human declared, this is the combination that returns the most present value — and here is the exact price of the constraint and the exact cost of the shortcut.',
});

export const CAPITAL_RATIONING_ASK_PREFIX = 'Capital rationing: ';
export const CAPITAL_RATIONING_CLOSED_PREFIX = `Closed by ${CAPITAL_RATIONING_RULE_ID}:`;

/**
 * The one condition `RULE-CRS-01` acts on. A committee cannot be asked; a person
 * can, and the ask is that somebody declares the constraint that is missing or
 * settles the contradiction that makes the set unprintable.
 */
export const CAPITAL_RATIONING_RULE_CONDITIONS = Object.freeze([
  Object.freeze({
    key: 'ceiling-missing',
    label: 'Candidates exist in a currency with no declared ceiling',
    says: 'A ratified case is awaiting selection in a currency nobody has declared a ceiling for. The register cannot ration what it has not been told the size of.',
  }),
  Object.freeze({
    key: 'relation-unreadable',
    label: 'A declared relation cannot be read',
    says: 'A relation names a case that is not ratified, is already decided, or sits in another currency. Counted and excluded, and the set for that currency is printed with the count rather than silently narrowed.',
  }),
]);
