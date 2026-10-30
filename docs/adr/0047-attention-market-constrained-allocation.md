# ADR-0047 — An attention market: solve the week as a constrained allocation, not a list

**Status:** Accepted (Session 82, Schema v57)
**Date:** 2026-10-30
**Supersedes:** nothing. Extends the propagation spine in [ADR-0008](0008-post-commit-rules-hook.md) and the frozen-prediction pattern used by [ADR-0040](0040-workforce-transition-terminal.md) and [ADR-0046](0046-sequential-investigation-planner.md).

## Context

By Session 81 the workspace held roughly forty screens, each of which owns a queue and each of which reports its own attention count. The `Signals` feed merges them with severity and priority. None of that answers the only question a leader opens the product to ask on a Monday:

> I have eleven hours this week. Given everything I have recorded, what is the best eleven hours I can buy, and what does the twelfth cost me?

A merged, severity-sorted list is not an answer to that. It cannot express that two of its rows are the same item in different modes, it cannot express that handing an item off converts the leader's hours into somebody else's, and it prices nothing. The consequence is visible in every other tool in the category and in the workspace itself: the obligations that carry a number win, the obligations that do not carry a number quietly stop being scheduled, and nobody records the decision because nobody made one.

Two secondary problems were found while auditing the existing modules:

1. **Every module reasons about cost of delay, but nothing reasons about cost of forgone.** The Decision Portfolio prices delayed decisions; the Risk register prices expected loss; none of them produces the sentence "these four things will not happen this week and that is worth X".
2. **Every module has a queue; none has a budget.** The Capacity screen measures the team's throughput. The leader's own attention — the scarcest, most over-subscribed resource in any management job — is the one quantity no screen in the product ever modelled.

## Decision

Build the Attention Market as a **multiple-choice knapsack over monetised obligations with two resource constraints**, and commit its result to the same propagation spine every other module uses.

### The model, stated exactly

```
maximise    Σ_i  v_i(mode_i)
subject to  Σ_i  h_i(mode_i)           ≤  H        (the leader's week)
            Σ_i  d_i(mode_i) · μ-free  ≤  D        (the delegate pool)
            mode_i ∈ {do, delegate, drop}
```

* `v_i(do)  = exposure_i × p_self` where `p_self` is the empirical-Bayes share of this class of obligation that closed by its own due date.
* `v_i(delegate) = exposure_i × p_person`, `h_i(delegate) = share × h_i(do)`, `d_i(delegate) = h_i(do)`.
* `v_i(drop) = 0`, `h_i(drop) = 0`.

`exposure_i` is **derived from the record that already exists** — a case's own three-point cost estimate, a funded item's three-point value, a negotiation's stakes over its BATTA, a dependency's daily impact times time-to-recover, an overspent budget's overage, a decision frame's largest declared payoff. Nothing is invented. Where the record carries no money the candidate is `unpriced`, is counted, and is printed with the hours it consumes, because an obligation that cannot enter the optimisation is a fact the leader needs to see rather than a row to be silently dropped.

### Why not a ranking

Ranking by value-per-hour is the standard advice and it is wrong here for two reasons that the records already contain. First, **do and delegate are different modes of the same item with different costs and different success probabilities** — the item is a group of mutually exclusive alternatives, not a line. Second, **a ranking produces no price for the constraint**. The price is the interesting number.

### The solver, stated exactly

Three stages, in this order:

1. **Convex-hull pruning per group** (`pruneToHull`). Options that add hours without adding value are dominated and removed; the survivors are pruned to the upper convex hull so each group's marginal ratio is non-increasing. The pruner removes the *expensive* dominated point, never the cheap one — an earlier version removed the cheap one and silently deleted every delegation from the market, which is now a regression test.
2. **Exact search where affordable** (`solveExact`). Depth-first branch and bound over the pruned hulls with a remaining-value ceiling and two feasibility prunes, inside a hard node budget, for markets of at most 14 groups. When the tree closes, the plan is **optimal** and the printed gap is exactly zero.
3. **Lagrangian fallback** (`solveMarket`). Where the tree cannot close, the linear relaxation is solved exactly by Dyer's (1984) incremental-ratio algorithm, the plan is built over both constraints and improved by local search, and the bound is the Lagrangian dual on the delegate constraint minimised by golden-section search. Weak duality makes it a real upper bound; the gap between it and the achievable plan is printed.

**The price of an hour is a finite difference**, not a relaxation dual: the same market is re-solved with one more hour and the change in the optimal value is the price. On a knapsack the value function is a step function, so a derivative would be meaningless and the difference is exact. When an extra hour buys nothing the price is zero, which is an answer.

### The two ceilings and the delegate pool

Delegation converts leader hours into someone else's. Ignoring that produces the plan the model produces by itself: hand everything to the most reliable person and spend almost nothing — arithmetically correct, operationally absurd. The delegate pool is therefore a second hard constraint, and its Lagrangian price is printed separately ("one more hour of *somebody else's* week is worth X") because it implies a different action: hiring or cross-training rather than re-planning.

Delegability is a property of the obligation, not a preference. A case, a package of funded work and a resilience gap can be owned by a report; a budget ceiling, a negotiation mandate and a decision frame cannot, and offering that mode would be inventing an option that does not exist.

**No automatic hand-off is offered until the named person has a measured on-time record** (four completed delegations). With no evidence the prior makes delegation look strictly better than doing the work — same value, a quarter of the hours — and that is an artefact of the prior, not a finding about the team. Below the floor the mode is withheld and the screen asks the leader to name a person, which is a declaration they own.

### The frozen prediction

Committing freezes the budget, the bought set, the forgone set **with its price**, the LP/exact bound, the shadow price and each item's success probability. The review re-reads each bought record and classifies it `realised` / `contradicted` / `open` / `unmeasured`, measures the drop in that record's own declared exposure, and scores the frozen probabilities with a Brier term over settled items only. Open items are excluded rather than scored as misses: a plan is not wrong because it is young.

The review explicitly does **not** claim that the work caused the drop. It is a reading of the record, and it says so.

## Consequences

### What this buys

* A number no other tool in the category produces: **the marginal value of the leader's next hour**, measured rather than asserted.
* A written, dated, owned record of **what the week knowingly does not do**, with the money it forgoes. `RULE-ATT-03` puts it in the decision register, so "I was too busy" acquires a price and an owner.
* An honest gap: where the market is too large to solve exactly the terminal prints the distance to a bound it can prove, instead of claiming optimality it does not have.
* A second constraint that makes delegation a real decision rather than a free lunch.

### What it costs

* The market is only as good as the money already recorded. A workspace with no three-point estimates produces an empty terminal and an explicit prompt. That is the design, not a defect, but it means the feature is inert until the leader prices something.
* The hours are the soft spot. `effortDays` and `capacityDays` are TEAM effort; the leader's attention is a different quantity that no record contains. The module applies a **declared leader share** (default 10%), prints it beside every derived figure, and lets the leader override any row. This is the one derived hour in the module and it is labelled as such everywhere.
* The finite-difference price costs two extra solves. The signal feed and nav badge therefore run a cheap mode that skips it; only the terminal pays.

### Explicitly rejected

* **A single objective with weights.** The module never merges value and hours into one score. The budget is a constraint, and the dual is the exchange rate between the two. Weighted sums hide which term the leader actually cares about.
* **Automatic delegate assignment without measured evidence.** See above.
* **Correlation between obligations.** Two cases caused by one root cause are two exposures unless a typed link says they are the same record. The workspace can only prove what it recorded, so `resolveAtoms` collapses only linked records and calls the rest what they are.
* **Cross-currency summation.** Each currency is its own market with its own budget and its own price. Summing USD and EUR would require a rate nobody recorded.
* **Auto-delegating work to a person whose pool is full.** The load is printed and flagged; it is not silently trimmed, because the delegate's real capacity is the Capacity module's measurement and overriding it here would be inventing a limit.

### Limits, stated

* No correlation, no learning curve, no diminishing returns inside a mode, no scheduling (the plan is a set, not a week), no cross-currency arithmetic.
* The success probabilities are empirical-Bayes shares of this workspace's own closed records; below four observations they are a prior and every row says so.
* The leader-share convention can be wrong in either direction. That is what the override exists for.
* Real-browser and assistive-technology behaviour of `#/attention` is **[UNVERIFIED]**, as is the quarantined legacy `src/**` tree.

## Related

* [ADR-0008](0008-post-commit-rules-hook.md) — the rule spine the four ATT rules ride.
* [ADR-0043](0043-decision-portfolio-sequencing.md) — sequencing and coupling; the market deliberately does not schedule.
* [ADR-0046](0046-sequential-investigation-planner.md) — the previous terminal, whose "test or decide" verdict the market prices in hours.
