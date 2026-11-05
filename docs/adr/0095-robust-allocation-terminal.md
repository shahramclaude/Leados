# ADR-0095: The Robust Allocation Terminal — a multi-action, capacity-constrained allocation solved exactly under declared effect ranges, with the equity floor priced and the premise graded out of sample

- **Status:** accepted
- **Date:** 2026-11-05
- **Deciders:** LeadOS sole cross-domain architect/engineer (Session 135)
- **Schema:** v98 (additive `97 → 98`)
- **Surface:** `#/robust-allocation` (aliases `robust-portfolio`, `minimax-regret`, `maximin`, `capacity-allocation`, `equity-floor`, `bertsimas-sim`)
- **Rules:** RULE-RAL-01..04 on the shared post-commit spine
- **Export:** aggregate-only CSV scope #93 `robust-allocation`

## Context

The roadmap's number-one planned item (Session 134) was *multi-action robust
allocation with explicit capacity constraints, heterogeneous populations and
sensitivity to effectiveness ranges — now that a pre-registered cohort exists to
grade it out of sample*. Two worlds answer this question and neither serves a
first-time leader:

- **Operations research** (Gurobi, OR-Tools, FICO Xpress) solves robust integer
  programs beautifully but hands the leader a Python model and a solver licence,
  with no hierarchy, no governance, no disclosure boundary and no out-of-sample
  grading. The 2026 Gurobi Summit and the Γ-robust capacity-planning literature
  (MDPI *Mathematics* 2026) confirm the method is mature and the interface is
  expert-only.
- **People analytics** (Visier, Workday Prism, Orgvue, ChartHop, SAP
  SuccessFactors) sells "scenario modelling" that is a point-forecast dashboard:
  it never prints a worst-case guarantee, never prices an equity floor, never
  computes regret against a scenario oracle, and never grades the allocation
  against a frozen pre-registered premise.

LeadOS already owns the pieces no vendor combines: a five-altitude reporting
tree with a lowest-common-ancestor roll-up, a generalized atomic post-commit
spine, a disclosure compiler, and (ADR-0094) a Prospective Intervention Contract
that freezes a cohort and grades it once with a proper score. The missing piece
was the **decision itself**: how a leader, at any altitude, allocates a fixed
budget and fixed leadership hours across heterogeneous populations when every
intervention's effect is only a defensible *range*.

The naive move — plug in a point estimate and optimise — maximises the forecast
and maximises the error (Michaud 1989, "error maximisation"). The honest move is
robust optimisation, made governable.

## Decision

Build a terminal that solves a **multi-action integer allocation exactly** under
**Bertsimas–Sim (2004) budgeted uncertainty** and prints, side by side, the
**Wald (1950) maximin** plan and the **Savage (1951) minimax-regret** plan, the
optimistic point-forecast plan and its worst case, the **price of the equity
floor** (a Rawlsian per-segment minimum coverage), a one-at-a-time **stress
table** naming which single effect range flips the recommendation, and the
**exact regret released** by resolving the highest-exposure range
(Raiffa–Schlaifer value of information). Adopting the plan writes one governed
DACI decision, one owned delivery task per funded line, typed provenance and one
`rolls-up-to` edge per leadership ancestor — in the SAME atomic transaction on
the shared spine. A linked Prospective Intervention Contract that misses its
pre-registered threshold opens a governed re-allocation decision automatically.

### The model (exact integer arithmetic, no sampling)

A plan declares: one outcome unit; one ISO currency (money is **never** pooled
across currencies); a budget cap; a leadership-hours cap; an uncertainty budget
`Γ ∈ [0, n]`; 1–6 heterogeneous **segments** `{size, floorCoverage}`; and 1–6
**actions** `{segmentKey, unitCost, unitHours, unitCoverage, effectLo, effectHi,
maxUnits}` with `maxUnits ≤ 8`.

Feasible allocations are the integer grid satisfying, simultaneously:

- `Σ unitCost_i · x_i ≤ budgetCap` (single currency),
- `Σ unitHours_i · x_i ≤ hoursCap`,
- per segment `Σ unitCoverage_i · x_i ≤ size` (Little saturation) and
  `≥ floorCoverage` (the equity floor).

Under `Γ`-budgeted uncertainty the adversary pushes at most `Γ` of the `n`
effect ranges from `hi` to `lo`. The worst case of an allocation is therefore
**exact**: `Σ hi_i·x_i − (sum of the Γ largest (hi_i−lo_i)·x_i)`. `Γ=0` is the
optimistic point forecast; `Γ=n` is Soyster's full box.

The solver enumerates the feasible grid (bounded by a declared
`maxCombinations`, default 50,000) and the `C(n, Γ)` nominal scenario problems
(the Goerigk–Lendl 2021 / Yaman 2023 enumeration result, efficient for small
`n`). It computes:

- **maximin** — the allocation with the best worst case (one pass);
- **optimistic** — the allocation with the best nominal value, and its worst case;
- **minimax regret** — for each scenario `S`, the oracle is the best feasible
  value under `S`; an allocation's regret is the largest gap to any oracle; the
  minimax plan minimises that largest gap (two passes);
- **price of fairness** — the worst-case value lost versus the same solve with
  the equity floors removed;
- **stress switches** — re-solve maximin with each range forced to its floor
  (`lo=0`); report which single stress changes the recommended vector;
- **regret release** — rank ranges by worst-case exposure on the robust plan,
  then re-solve minimax with the top range resolved (`dev=0`) and report the exact
  reduction in minimum maximum regret.

Tie-breaking is deterministic: higher value (lower for regret), then lower cost,
then lower hours, then lexicographically smaller unit vector. An **over-cap grid
or an infeasible constraint set is REFUSED with a printed reason**, never
approximated, relaxed or silently truncated.

### Governance and the spine (RULE-RAL-01..04)

- **RULE-RAL-01 (adopt):** one adopted plan → one governed DACI decision (the
  choice, kept separate from the frozen numeric solution), one owned dated
  delivery task per funded line, an `allocates` edge to the decision, a
  `consumes-capacity` edge per task, a `rests-on` edge to any linked prospective
  contract, and one `rolls-up-to` edge per leadership ancestor. All in the same
  atomic transaction; the solution is frozen at adoption so the governed work is
  never re-derived from a changed assumption.
- **RULE-RAL-02 (falsified):** a linked prospective contract graded `outcome 0`
  opens at most one governed re-allocation decision per plan per ISO week.
- **RULE-RAL-03 (overdue):** a funded line that outlives the horizon + review
  window opens one delivery-integrity decision per plan per ISO week.
- **RULE-RAL-04 (ungraded):** a linked contract past its window with no grade
  opens one evidence-integrity decision per plan per ISO week.

All four are marker-idempotent, bounded and pausable via
`robustAllocationAutoPropagate`; an explicit `robustAllocation.scan` always runs.
The rule is registered immediately after `prospectiveRule` and before the
attention market, succession terminal, operating seat and seal, so the decisions
and tasks it opens are priced, certified and rolled up in the same commit. One
auditable propagation contract is declared; the shared-spine tripwire moves
77 → 78.

### Disclosure and altitude

`detailCeiling: 0` record policies for `robustPlans`/`robustMarkers`; an adaptive
manifest row with a scoped report adapter; the `declare-robust-allocation` right
at rank 1–5 with director+ conventions enforced in the action; four seat-scoped
safe reads. The roll-up publishes per-altitude counts, funded lines, committed
hours and the falsified share with a Wilson (1927) 95% interval, withheld below
the declared cell floor and below director rank, with complementary suppression
of a sibling row. The upward brief and CSV #93 carry **no plan id, title, person
name or currency amount**; money is never pooled. An identity-free graph resolver
projects an adopted plan as counts, dates and state names only. Five
altitude-specific playbooks (Jaques time-span horizons) give each rung a
different question, decision and hand-up.

## Alternatives considered

- **A point-forecast scenario dashboard (the people-analytics pattern).**
  Rejected: it maximises the forecast and the error, prints no guarantee, and
  cannot price an equity floor or compute regret. It is the mediocre option the
  ambition bar forbids.
- **Embed a real MIP solver (Gurobi/OR-Tools) or a heuristic/metaheuristic.**
  Rejected: a solver dependency breaks the zero-build, local-first, offline
  promise and adds a network/native binary; a heuristic would print an
  *approximate* "robust" plan, which is exactly the dishonesty this terminal
  exists to avoid. Exact enumeration over a declared, bounded regime is honest
  and dependency-free, and refuses outside the regime instead of guessing.
- **A second command bus or per-role glue for the hierarchy.** Rejected: altitude
  stays a dimension of the existing seat scope, rule fan-out and disclosure
  compiler. The module plugs into the one spine like every other.
- **Auto-adopt the optimal plan / auto-re-solve on falsification.** Rejected: the
  engine opens governed work and never closes a human decision, never adopts for
  anyone, and never asserts causality. A missed threshold is a decision prompt,
  not an automatic re-allocation.

## Consequences

- **Easier:** a leader at any altitude gets a defensible worst-case allocation,
  the explicit price of the equity floor, and a named range to resolve first —
  with the commitment, delivery work and upward roll-up written automatically and
  the premise graded out of sample by the existing prospective ledger.
- **Harder / debt:** the exact solver is bounded (≤6 actions, ≤8 units, ≤50,000
  combinations); larger problems are refused, not solved. The stress and
  value-of-information reads re-solve, so they are computed only for the selected
  plan, never for every row on every render. The roll-up's repeated per-altitude
  series re-opens the temporal-differencing item (ADR-0092) for this module's
  releases. Effect ranges are declared assumptions, not measurements.
- **Revisit when:** a real authenticated tenant boundary exists (the standing
  top roadmap item); or a leader needs a problem larger than the declared bound,
  at which point a bounded branch-and-bound or an offline exact solver export —
  not a silent heuristic — is the honest next step.

## Honest limits

Local seats are auditable workflow declarations, **not** authentication. A solved
allocation is a decision under declared assumptions — not a causal forecast and
not a rating of any person. Small-cell suppression is not differential privacy.
The module reads only records other modules own (prospective grades, delegations,
the reporting tree); it writes none of them. Vendor comparisons are web-search
snippets, not installed-product audits. Full real-browser assistive-technology
accessibility and exhaustive permission walkthroughs remain **[UNVERIFIED]**;
automated axe-style panel rendering and a four-altitude leak oracle are what ran.

## Verification (actual)

- `tests/app/robust-allocation.test.mjs`: **19/19 PASS** — additive migration,
  fail-closed normalizers, validator refusals, hand-verified exact solver values
  (maximin 29 / optimist's worst case 28 / minimax regret 6), price of fairness
  12, regret release 10, over-cap and infeasible refusals, one-transaction
  cross-module + vertical propagation, peer-span isolation, falsified/overdue/
  ungraded findings with ISO-week idempotency, reload with zero repair warnings,
  rank/permission gates, graph-registry invariants, a four-altitude leak oracle
  over brief/CSV/all five panels, CSV #93 round-trip, and fail-closed API boundary.
- `npm run lint`, `npm run check:boundary` (473 modules / 139 suites),
  `npm run check:links`, `npm run build:standalone` + `verify:standalone`
  (8,072,085 bytes / 472 modules / schema v98, density 17,102 < 24,000): **PASS**.
- Tripwire sweep: schema-version assertions → 98, migration chains → `97 → 98`,
  CSV-scope assertions → 93, shared-spine tripwire → 78, `RENDERER_ROUTES` and
  graph registries kept exhaustive.
