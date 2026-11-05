# ADR-0097: The Calibrated Allocator — certified branch-and-bound past the enumeration wall, and graded evidence read back against declared ranges without ever moving them

**Status:** Accepted · **Date:** 2026-11-05 · **Schema:** v99 (additive `98 → 99`) · **Route:** `#/robust-allocation` (sixth panel: Calibration) · **Rules:** RULE-RAL-05 added; RAL-01..04 unchanged · **CSV:** unchanged (#93; no new scope)

## Context

ADR-0095 shipped an exact robust allocator over Bertsimas–Sim budgeted uncertainty with an honest wall: a feasible grid above the declared enumeration bound (default 50,000 combinations) was REFUSED. ADR-0094 froze pre-registered contracts and graded them once with the Brier proper score. Two roadmap items named the frontier: (a) solve the over-cap instances exactly instead of refusing them, without ever printing an approximation; (b) read the settled graded record back against the effect ranges leaders declare — without the engine adjusting a number (ADR-0094 forbids auto-adjustment) and without claiming causality.

Session 136 closed the differencing-register gap for five terminals; `#/robust-allocation`'s and `#/prospective`'s printed aggregates were still not entering the ADR-0092 publication register.

## Decision

**1. Certified branch-and-bound** (`app/core/domain/robustBranchBound.js`). Above the enumeration bound, `solveRobustPlan` hands the plan to a depth-first branch-and-bound that proves the identical printed values — Wald maximin, Savage minimax regret against exact per-scenario oracles, the price of the equity floor, one-at-a-time stress switches, Raiffa–Schlaifer regret release. Exactness is in the code, not the prose:

- All fractional-relaxation (bounded-knapsack) bounds compare densities by integer cross-multiplication; no float ever decides a prune or a tie.
- Fractional remainders are CEILED to the next integer, so a bound is never below the true fractional optimum — rounding can only weaken pruning, never falsify optimality.
- Pruning is STRICT (`UB < incumbent` / `LB > incumbent`); a tie is explored, because the declaration-order tie-breaks (lower cost, lower hours, lexicographically smaller unit vector) must produce the same unique total-order optimum the enumerator prints.
- One shared node budget (`robustAllocationNodeBudget`, director+, clamped 25,000–2,000,000, default 250,000) covers every sub-solve (oracles, maximin, minimax, fairness, stress, regret release). Exhaustion REFUSES the whole solve with a printed reason. Structural bounds (unit sum ≤ 40 — reachable at 6 actions × 8 units, so a real refusal line; Γ-scenarios ≤ 24) are checked before the first branch.
- Every solve — enumeration or branch-and-bound — carries a provenance `certificate` (`engine`, `nodes`, `pruned`, `budget`, `certified`), frozen at adoption and printed on the Solve panel.

Equivalence is proven, not claimed: a seeded sweep over random feasible and infeasible fixtures asserts field-for-field identity between the two engines, including infeasibility refusals.

**2. Closed-loop evidence calibration** — read-only over records the prospective module owns. Settled grades cluster by altitude × instrument cell with the Wilson (1927) interval, the declared cell floor, complementary suppression and the director-rank gate (the same disclosure ladder as the allocation roll-up). A plan action may now declare which of the four observable instruments grades its premise (`evidenceInstrumentKey`, fail-closed). The Solve panel prints the graded reading beside the declared range; a cell more falsified than reached at or above the floor is flagged **TENSION**. Coverage is subtree-correct: a plan reads cells at its own altitude or below it, never a peer span. The engine never adjusts, nudges or "learns" a range — the human act is a **revision**: a newly declared plan carrying `supersedesId`, frozen separately at adoption; the earlier plan is never edited.

**3. RULE-RAL-05 (premise–evidence tension)** on the same shared post-commit spine, in the same explicit-scan family as RAL-02..04 and pausable by the same module toggle: at most one governed DACI decision per cell per ISO week when a published cell at or above the floor is more falsified than reached and at least one scoped plan rests on that instrument. The decision carries counts and the Wilson interval — never a cohort id, a contract id, a plan title or a person — plus one `rolls-up-to` edge per leadership ancestor of the anchoring plan's span, marker-idempotent (`premise-tension`), bounded by the module scan order.

**4. Registered publication for the two newest terminals.** `#/robust-allocation` and `#/prospective` (both already manifest-declared) mount the shared ADR-0096 publication panel, so their printed roll-up aggregates enter the ADR-0092 differencing register as dated, audited releases — closing the named honest limit from Sessions 134/135 without a new CSV scope.

**5. Hygiene.** Two pre-existing test failures on the base commit are repaired: the cadence spine-parity assertion now encodes the post-ADR-0088 order (strategyCycle → carryover → cadence), and the measurement "sound commit" test measures ceremony from the post-declaration baseline (other modules' bounded, marker-idempotent scan remediation of stale demo data is not this module's ceremony), strengthened by a no-new-reference assertion.

## Consequences

- A 9⁵ = 59,049-combination plan now solves exactly through the real API (adopt → frozen certificate + full RULE-RAL-01 fan-out) instead of refusing; 6 × 8-unit instances (unit sum 48 > 40) still refuse, as do exhausted budgets.
- Old frozen adoptions migrate with an honest legacy certificate (`engine: 'enumeration'`, certified by construction, nodes null — the pre-certificate era is stated, not back-filled).
- Altitude behaviour is unchanged in shape and extended in content: frontline/manager keep counts and their own plans; pooled calibration rates stay withheld below director rank; director reads per-cell intervals with complementary suppression; VP/chief read identity-free aggregates, the brief's calibration block, and the register's verdict.

## Honest limits

The branch-and-bound is exact within its certified regime and refuses outside it; no asymptotic guarantee is claimed. A cell reading is the graded record of frozen thresholds — evidence, not causality, never a person rating; transport of a reading to a different planning population is the reader's judgement, which is why the flag is a tension and not an adjustment. Suppression remains small-cell withholding, not differential privacy. The tension rule runs on explicit scan, like its sibling scan rules. Local seats remain auditable declarations, not authentication (the standing top roadmap item).

## References

Bertsimas & Sim (2004) budgeted uncertainty; Bertsimas, de Moor, den Hertog & Donnini (2026) *Signed Budget Uncertainty* — nominal-problem enumeration for small K is efficient, which ADR-0095 already enumerates for oracles and this ADR keeps exact under B&B; the 2026 arXiv group-envelope work using fixed-threshold branch-and-bound with "optimizer-certified optimality or infeasibility" — the contract adopted here; Wald (1950); Savage (1951); Rawls (1971); Raiffa & Schlaifer (1961); Wilson (1927). Aera's "decision memory" (records decisions + outcomes) is the nearest commercial analog; no surveyed people-analytics or decision-intelligence platform was shown to feed out-of-sample graded bets back into an exact robust allocator's premise review inside a hierarchy-aware workspace gap claim from public snippets, not verified vendor capability.
