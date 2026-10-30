# ADR-0040: The Workforce Transition Terminal — a plan you can price, a screen you cannot quote, and the knowledge that walks out

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0036](./0036-bounded-propagation-lineage-and-typed-links.md), [ADR-0039](./0039-merit-and-pay-equity-terminal.md), [ADR-0029](./0029-mitigation-robustness-evidence-gate.md)

## Context

Every other surface in this workspace answers a question about work: did the decision hold, did the delegation
return, did the metric move, was the intervention delivered, was the merit budget spent well. The highest-consequence
people decision a first-time manager can be part of — **who leaves, at what cost, and what leaves with them** — had no
surface at all.

Two categories exist and neither fits the user of this product.

- **Enterprise RIF suites.** Onwards HR and comparable products sell employee pools, a selection worksheet, an
  adverse-impact analyser over protected classes, a WARN/mini-WARN timeline, release packets, and two-reviewer
  sign-off. That is a *compliance file*: its purpose is to survive a challenge, and its unit of output is a signed
  document. It requires the employer to hold protected characteristics and to have counsel in the loop.
- **Spreadsheets and a consultant.** A severance model in a workbook, a PDF from a consultancy, a plan that is out of
  date the day it is printed, and no record of what was predicted so that nobody can be shown to have been wrong.

A local-first, offline workspace for one leader with ten reports has neither a legal department nor a protected-class
dataset, and it has something the enterprise tool does not: the records that make the *consequences* observable —
recorded pay from the merit cycle, ratings, dependency stewardship, open cases, open delegations, open goals, bench
readiness. That is enough to answer the four questions that decide whether a reduction was a decision or a payment:

1. **What does this list cost, and what does the alternative cost?** Cash out of the door is arithmetic over recorded
   pay and declared conventions. Replacement exposure is a different number and must never be netted against it.
2. **What pattern does the list make?** A selection screen is a screen. It is not a legal finding, and at small n a
   single person can reverse it. Saying that out loud is the honest version of the enterprise analyser.
3. **What walks out with them?** Knowledge, cover of critical dependencies, and the ownership records that nobody
   else holds. A sole steward of a critical dependency is not a warning — it is a refusal.
4. **What happens to the people who stay?** Redistribution is mechanical, the overload is measurable, and the
   prediction made about the survivors has to be frozen before the change so it can be scored afterwards.

## Decision

1. **Schema v52, additive `51 → 52`.** One new collection, `transitionPrograms`, and eight clamped settings
   (`transitionNoticeDays`, `transitionSeveranceMonthsPerYear`, `transitionSeveranceCapMonths`,
   `transitionImpactRatio`, `transitionMinGroupSize`, `transitionSurvivorLoadPct`, `transitionHorizonDays`,
   `transitionAutoPropagate`). No programme, candidate, target, band or salary is invented for an existing workspace;
   a v51 workspace opens with an empty list and a warning-free migration.
2. **One page, `#/transition`, five tabs.** Plan (target, named exits, cost, gates), exposure (screen, price of
   compliance, weight-stability), continuity (who is a blocker, what must be handed over), alternatives (four paths
   on the same terms), method (conventions, frameworks, limits, calibration).
3. **Cost is arithmetic with printed conventions.** Pay in lieu of notice at the declared notice days, severance at
   the declared months-per-year-of-service inside the declared cap. No tax, no holiday balance, no statutory
   deduction, no FX, no legal inference. A person with no recorded pay is `unpriced` and `null` — never `0`, never
   silently excluded from a total that reads as complete.
4. **Selection under constraints, and honest about it.** Greedy construction by the declared objective plus swap
   repair against a cost ceiling, with hard exclusions (a blocked sole holder, a locked-out row) and forced inclusions
   (a locked-in row). The fractional-relaxation bound and the gap to it are printed; the module never claims
   optimality.
5. **Weight-stability, not a probability.** A deterministic ensemble (seeded per programme) perturbs each declared
   weight by a uniform factor, re-solves, and reports what share of the draws each person is selected in. A name in
   every draw is robust to the weight table; a name in half the draws is a judgement the model is hiding. It is
   explicitly *not* a probability that a person should leave.
6. **The screen runs on the decision, with intervals, coverage and fragility.** Four-fifths over a declared
   organisational dimension or opaque group codes, Wilson intervals on every rate, no comparison below the declared
   group floor, a printed statement of how many candidates carry no group code, and — the part the 2024 critique
   makes unavoidable — **how many selections would have to move, at constant headcount, before the direction of the
   disparity reverses**. One number, in words.
7. **Compliance is priced, not moralised.** When the screen fails, the module searches pairwise swaps between the
   over- and under-selecting groups and reports the cheapest set that clears the floor: swaps, cash delta, composite
   exposure lost, headcount unchanged, and an explicit `infeasible` when no swap set inside the plan can reach it.
8. **A sole steward of a critical dependency is refused.** `setTransitionRow` will not select them, and the refusal
   names the work that has to happen first: reassign the dependency, or keep the person.
9. **The survivors are modelled mechanically and scored out of sample.** A leaver's recorded ownership is shared
   equally across the three lowest-loaded people on the same team; overload is reported against a declared threshold;
   a four-term departure convention (base, load, mobility, nothing else) is frozen at finalization for retained
   high-value people as well as leavers, so false positives are recordable. Brier skill against the observed base
   rate is reported only at five resolved predictions.
10. **Four alternatives, priced on the same terms, compared by Pareto dominance.** Selection by the declared
    criteria, a voluntary offer (priced as *adverse selection* — take-up concentrates among the most mobile), internal
    redeployment (unavailable, not degenerate, when there is no receiving requisition), and doing nothing (which
    does not meet the target, and is priced at zero precisely so that is visible). Cash and capability are never
    converted into each other: the output is either a dominating option or the frontier and the trade between its
    ends.
11. **Seven rules on the existing post-commit spine, marker-idempotent.** `RULE-TRN-01` typed `separates` provenance
    from the programme to each named person; `RULE-TRN-02` exactly one mechanism decision about the *criteria and the
    target* (never a pairwise swap of two names) plus one owned scoring-grid evidence task; `RULE-TRN-03` one owned
    hand-over delegation per materially at-risk leaver, with typed edges to the dependencies at stake, bounded and
    dated before the last working day; `RULE-TRN-04` at most three blameless survivor prompts; `RULE-TRN-05` one dated
    outcome review plus one owned outcome-tracking task at finalization; `RULE-TRN-06` resolving a frozen prediction
    on `person.archived`.
12. **Two gates before the plan spends anything.** No decide without an accountable owner and a fully named target;
    no finalize without an owner and at least one *priced* exit. The gates are refused functions in `actions.js`, not
    warnings in the view.
13. **CSV scope #46 exports counts and ratios only**, under positional programme codes: no name, no identifier, no
    group code, no note, no per-person cost, no departure probability. The frontier is exported as a list of path
    names, never as a recommendation.
14. **The demo says what it cannot do.** Five people cannot support a rate comparison, so the live demo programme
    prints `insufficient` rather than a ratio computed over one group of one; the past programme carries a frozen
    snapshot whose cash cost differs from a recomputation today, which is exactly what a frozen snapshot is for.

## Rejected alternatives

| Rejected | Why |
|---|---|
| Store protected characteristics and compute a discrimination statistic | A local offline workspace has no business holding them, and the claim the data would license is one 8-person groups cannot support. The screen runs on declared organisational dimensions or opaque codes, and prints the limits. |
| Auto-generate the layoff list from the model | The model's job is to price a list and expose what the list does to the record, not to choose people. Selection stays a named leader action with a target declared before any name. |
| Minimax regret across cash and capability | First implementation; it recommended attrition at zero cost while removing nobody, because it never checked whether an option met the target. Pareto dominance over eligible options replaced it. |
| A departure probability for every person | That is per-person attrition prediction from thin records. Only retained *high-value* people are scored, and only so the convention can be graded. |
| Generate WARN notices, release packets or severance agreements | Legal documents from a local app with no counsel in the loop would be actively harmful. The module declares its conventions and refuses to call them law. |
| Swap two named people to make the screen pass silently | Buying compliance by swapping names still selects by group and leaves the criteria untouched. The module prices the swap set and opens a decision about the mechanism instead. |
| Treat ungrouped candidates as an `unspecified` group | The first implementation did, and twelve undeclared people made the screen read `insufficient` for the wrong reason. Undeclared rows are now reported as coverage, outside the comparison. |
| A hardcoded 365-day prediction horizon | The review was dated by the declared horizon and the outcome window by a literal, so the two could disagree. Both now read `transitionHorizonDays`. |

## Consequences and limits

- **Not legal advice, and not a legal record.** Notice and severance are declared conventions. No statutory test, no
  jurisdiction logic, no protected class, no counsel workflow.
- **The screen is a heuristic over an effect size.** It has no significance test; the fragility count is the honest
  substitute. A ratio above the floor does not prove fairness and one below it does not prove discrimination.
- **Capability value is operational value in this workspace's own records** — dependency stewardship, bench
  readiness, open ownership, last completed rating. It is not a person's worth, and the page says so.
- **The survivor redistribution rule is mechanical.** Equal shares to three teammates is a convention with a printed
  prediction, not a model of how work actually lands. Load is measured in recorded ownership units, which is the only
  local evidence of load and is a proxy.
- **No FX, no payroll, no external benchmark.** Currencies are never summed.
- **The optimizer is heuristic.** Bounded swap repair with a printed relaxation bound; no claim of optimality.
- **The ensemble is a weight table robustness check**, not a probability, and a thin run (fewer than 20 draws) says so.

## Verification

`tests/app/workforce-transition.test.mjs` pins fifteen claims: additive migration and clamping; normalisation of a
dangling row, default weights and a preserved snapshot; exit-cost arithmetic including `null` for missing pay; the
screen's intervals, coverage and one-transfer fragility; the cheapest compliant swap set with unchanged headcount and
an infeasible case; locks, exclusions, ceiling repair and the relaxation bound on synthetic rows; ensemble determinism
and a thin run; the three action refusals; a single decided programme producing typed `separates` edges, one mechanism
decision, owned hand-overs, bounded blameless prompts and no duplicates on a second scan; finalization freezing the
prediction and a departure resolving it with calibration withheld below five; CSV scope #46 leaking nothing; the demo
staying quiet when clean and cleaning up without rewriting a frozen snapshot; registration on the spine, catalog and
graph; brief determinism; and the four priced alternatives. See also `RESEARCH.md` §78.
