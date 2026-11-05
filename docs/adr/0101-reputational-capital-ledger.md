# ADR-0101 — The Reputational Capital Ledger

**Status:** Accepted · **Schema:** v103 (additive 102 → 103) · **Route:** `#/reputation` · **CSV:** scope #97
**Session:** 141 · **Date:** 2026-11-05

## The problem nobody in the category prices

Every people-analytics product in the 2026 market measures one of two things: **structure** (spans,
layers, cost — Orgvue, ChartHop) or **survey sentiment** (engagement, eNPS — Culture Amp, Lattice,
Viva Insights). Neither answers the question a first-time leader actually has to answer before they
delegate anything real:

> *If I hand this person this ask, will it hold — and if it does not, what exactly is missing?*

That is not a personality question and it must never become a "trust score." It is a **pricing**
question, and it has a precise economic meaning: a promise is only credible to the extent the
counter-party has a *stake* to lose. Reputation is a stock that decays, can be drawn down, and can
only be rebuilt by a costly, observable signal. The category has no such ledger, so leaders
substitute intuition, and intuition is where favouritism gets in.

## Decision

Ship a **Reputational Capital Ledger** that prices what an act costs to guarantee here, harvested
from records the workspace has *already dated* — never from a survey, never from a self-report, and
never with a composite score attached to a person.

### 1. Eight act classes, harvested from other modules

No module is allowed to be the source of its own reputation. Each class reads a record another
terminal owns:

| Class | Source of truth | Kept when |
|---|---|---|
| delivery | `delegations` | returned on or before `dueOn` |
| custody | `mandates` | the sender verified it |
| calibration | `prospectiveGrades` | the frozen bet called its own direction |
| stewardship | `escalationRecords` | absorbed where it arose |
| continuity | leadership edges with measured carriage | the edge carried work |
| allocation | funded plan lines | delivered |
| prediction | settled forecasts | scored out of sample |
| contribution | recognitions | witnessed outside the person's own leader |

A person may record a manual act for work LeadOS cannot see (a supplier commitment, a public
promise). **A hand-typed twin of a derived act is refused**, because writing it twice would let a
leader manufacture their own stake.

### 2. The estimator is Wilson, in beta-parameter space, anchored and decayed

`wilsonBeta(kept, breached)` is the textbook Wilson score interval, re-expressed as Beta parameters:

```
z² = 3.8416 (95%)
denom  = 1 + z²/n
centre = (p + z²/(2n)) / denom
alpha  = centre · (n + z²)          beta = (n + z²) − alpha
pseudoActs = z²/2 = 1.9208
```

`wilsonBeta(9,1)` → `[0.5958, 0.9821]`, `α + β = n + z²` always. Anchoring is a weak prior over the
**declared class hazard**, not an empirical-Bayes guess (Gelman et al. 2008); decay is
half-life exponential (`0.5^(age/halfLife)`); the staked mean is
`(k + prior·(1−h)) / (k + b + prior)`.

### 3. The obstacle is a price, and it is bounded

`obstaclePct = 100 − (100 − base)·e^(−premium)`, `premium = γ·max(0, ln(ask/stake))`.

An ask that fits inside the observed stake pays the tier's base rate and no more; an ask larger than
the stake is priced up along a convex curve that can never leave `(base, 99.5)`. **A three-digit
obstacle is not a price, it is a refusal wearing a number**, so γ is clamped to 3 and the ceiling is
printed.

### 4. Four engagement tiers, in order of honesty

`vouching 85 → bearing 60 → escrowed 35 → structural 15`. The ladder is the Grossman–Hart
residual-control argument made operational: the further the ask moves **off the person and onto a
mechanism** (collateral, an escrowed right, a structural arrangement), the lower the kept rate the
record has to clear. Every counterfactual prices *all four* and names the cheapest honest route in
acts.

### 5. Verdicts are read off the interval, and refusal is an outcome

| Verdict | Condition |
|---|---|
| `solvent` | interval low ≥ obstacle |
| `encumbered` | interval high < obstacle, but not below the class hazard |
| `drawn-down` | interval high < the declared class hazard — the record is *worse than the base rate* |
| `contested` | an act of the class is disputed by a human |
| `expired` | no act inside the declared window |
| `refused` | no act, all excused, below floor, or anchor-decided |

`drawn-down` is deliberately distinct from `encumbered` and from any notion of "insolvency": a record
below the base rate is a *fact about an act class*, never a verdict about a person's worth.

### 6. WILSON-FIRST: a prior may never decide the verdict by itself

Efron's warning, implemented as an admission test. **The anchor is put on trial, not the record.**
The prior is treated as `priorActs` pseudo-acts at `hazardPct`, given its own Wilson interval, and if
that *anchor's* low end already clears the obstacle, the cell is refused with the anchor's own
interval printed. This rule exists to catch a class whose declared base rate is so high that no
record could ever be tested against it.

> **Defect repaired during this session.** The first implementation probed
> `wilsonBeta(kept + 1, breached)`, which asks whether the *record* clears — and so refused every
> good record (9 kept / 0 breached was refused at a 15% anchor). The function also ignored its
> `posterior !== null` term in a way that would have masked the error. It now probes
> `wilsonBeta(hazard·prior, (1−hazard)·prior)`.

### 7. Guarantees freeze a claim; the ledger grades itself

Opening a guarantee freezes `claimP` = the interval's low end **at that moment**. When the tagged
source settles, RULE-RCL-05 grades the ledger's own error exactly once: `(claimP − y)²`. A claim
written after the outcome is not a claim, so a position opened with no readable interval carries
`claimP: null` and is **refused a grade, by name, on the audit trail** — never back-filled.

### 8. Repairs are costly signals, closed from the record

A repair declares a target count and a due date; the engine reads only acts **dated after the repair
opened**. A met repair closes as `kept` from the record; an unmet one stays open and opens a bounded
governed decision. Nobody self-certifies a repair (Fudenberg–Tirole 1990).

## Propagation — the shared spine, not module glue

`RULE-RCL-01..05` are registered on `DEFAULT_POST_COMMIT_RULES` (82 rules) immediately after
`spanCalibrationRule` and before `identityRule`:

| Rule | Writes |
|---|---|
| RCL-01 | one `rests-on` edge per distinct dated source record + one `rolls-up-to` per leadership ancestor, SAME transaction |
| RCL-02 | at most one governed decision per span × class × ISO week when `encumbered` / `drawn-down` / `contested` |
| RCL-03 | at most one per open guarantee per week when its cell is not solvent |
| RCL-04 | repair closure / repair finding |
| RCL-05 | the once-only self-grade against the frozen claim |

**No cell, rate or verdict is ever stored.** Every figure is re-derived on read; a stored copy would
be a second, drifting truth. The rule runs on `reputation.*` events **and** on the declared source
events (`delegation.completed`, `prospective.graded`, `mandate.verified`, …), because the module that
owns an outcome should not require a human to press Scan before its reader sees it.

## Seat boundary

`buildReputationReport({ seatId })` reads the seat and everything beneath it, and refuses peers and
managers. Under the undeclared operator view it reads the whole workspace — that is the pre-ADR-0076
single-operator behaviour, preserved deliberately, not a leak.

> **Defect repaired during this session.** The report added `seat.subtreeIds`, which is an **empty
> array on every real seat**; the populated primitive is `seat.scope`. A declared frontline lead could
> therefore see exactly itself and none of its own ICs. Both the report and RULE-RCL-02/03 were also
> still scoping to `seatId: LEADER_ID`, which reads only the leader's own person id — so the spine
> never saw the org beneath it and opened no finding at all.

## Export

CSV scope **#97**, aggregate-only: one row per class, per class × verdict band, per tier, plus a
direction row. **No person id, no act id, no source id, no note.** A suppressed cell and a refused
rate are **blank, never zero** — complementary suppression keeps a blank from being a subtraction
away from a disclosed total.

## Consequences

- A leader can price an ask *before* making it, and gets an integer count of acts rather than a
  probability a person could not afford.
- Reputation becomes auditable: every cell traces to the dated records it read.
- The ledger is wrong in public: RULE-RCL-05 scores its own frozen claims.
- **Honest limits.** The class hazard, half-life and γ are **declared conventions, not estimates**.
  Decay is exponential on the observation clock. Work done outside LeadOS reads as *silence*, not
  breach. Seats are workflow declarations, not authentication. Nothing here is a measure of a
  person's worth, and there is no composite score or ranking anywhere in the module.
  Real-browser AT walkthrough **[UNVERIFIED]**.

## Rejected

- A single composite "trust score" per person — it ranks people, invites favouritism, and destroys
  the audit trail a per-class interval preserves.
- Reading self-assessments or peer nominations as acts — cheap talk, and gameable in one week.
- A gated Bayesian posterior mean as the headline — a mean hides the interval, and the interval is
  the whole argument.
- Storing the cell — it would drift from the records that produce it.
