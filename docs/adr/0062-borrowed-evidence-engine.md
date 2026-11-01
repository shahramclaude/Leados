# ADR-0062: The Borrowed Evidence Engine — partial pooling for every small sample, graded on whether pooling helped

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decision owners:** LeadOS product/engineering
- **Related:** ADR-0008 (generalized post-commit rule spine), ADR-0006/0007 (canonical
  zero-build app), ADR-0019/0020 (assumption ledger and premise outcomes), ADR-0044
  (leader probability calibration), ADR-0055 (evidence terminal), ADR-0061 (signal
  integrity board)

## Context

Ninety-nine sessions taught each terminal to refuse a judgement on a small sample. The
Signal Integrity Board prints "too few verdicts" below four; the assumption ledger cannot
say how often a *class* of assumption holds; nothing estimates how often delegated work
lands on time at a given authority level. Each refusal is correct. Together they are a
failure mode: a first-time manager's workspace is made of small samples, so in its first
quarter the honest answer to almost every question was "ask again later".

Session 99 named the fix as its top priority — "a family with 3 verdicts can borrow pooled
precision from the 54 others through a partial-pooling model instead of printing
'insufficient' for a quarter" — and the same structure recurs in two other ledgers. The
market's answer to small samples (2026 scan, RESEARCH.md §86) is *suppression*: survey
vendors hide any group under 3–5 respondents, which leaves a fifteen-person company with
one company-wide number.

## Decision

Schema v71 adds a generalized hierarchical engine over three evidence groups, three
post-commit rules, a six-panel terminal (`#/credibility`) and a cross-module hook into the
Signal Integrity Board. Every borrowed number is derived on read; the only stored records
are frozen forecasts, the leader's exchangeability rulings and rule markers.

### The model

| Piece | Implementation | Why this and not the simpler thing |
|---|---|---|
| Likelihood | Beta-binomial: `p_i ~ Beta(μM, (1−μ)M)`, `x_i ~ Bin(n_i, p_i)` | The three quantities are Bernoulli rates with tiny n; the conjugate form gives an exact credibility weight |
| Credibility weight | `Z = n/(n+M)`, reported as its posterior expectation | Bühlmann credibility is exact for this conjugate family (Jewell 1974), so "how much of this number is yours" is a model quantity, not a heuristic |
| Hyperparameters | Full Bayes over `(logit μ, log M)` under the BDA3 §5.3 prior `p(α,β) ∝ (α+β)^(−5/2)`, on a 33×33 coarse grid that locates the mass of the full and every leave-one-out posterior, refined to 41×41 | Plug-in empirical Bayes treats the fitted prior as known and understates uncertainty (Morris 1983; Kass & Steffey 1989). A deterministic grid keeps the app free of `Math.random` and MCMC, and is exact to the grid |
| Intervals | Beta moment-matched to the posterior mixture | Exact mixture quantiles need ~10⁵ incomplete-beta calls per render; the suite pins the approximation to within 1.5 points of the exact quantiles |
| Verdicts | Exact mixture `P(p < floor)` against a declared decisive probability (95%) | The decision quantity is computed exactly, not from the approximate interval |
| Concentrated Betas | One-term Edgeworth expansion above `a+b = 2000` | The continued fraction needs O(√max(a,b)) iterations — slow and, under any cap, inexact for priors worth up to 10⁶ outcomes; the suite pins the switch-over to < 1e-3 |
| Regime | Mean posterior `E[Z]`: pool-led (< 40%), balanced, own-led (> 70%) | A significance test cannot name the regime: in the first build a p = 0.056 group was labelled "no detectable spread — the pool dominates" while every unit kept 63% of its own number |
| Heterogeneity | Pearson χ² with I² (Higgins & Thompson 2002), flagged only when p < α **and** I² ≥ 50%; approximate when an expected cell is under five | A significant but trivial spread is not a reason to question exchangeability |
| Influence | Leave-one-out on the cached grid; a unit "carries the pool" only if another unit moves ≥ 15 points **and** by more than its own posterior SD | With a dozen outcomes any absolute threshold fires; the first build opened a governance decision for a four-unit, twelve-outcome pool |
| Graduation | Outcomes for own weight z: `⌈M̃·z/(1−z)⌉`, dated from the last 13 weeks' pace | Turns "insufficient" into a date |
| What-if / break-even | Exact reweighting of the hyperposterior by the unit's new/old marginal-likelihood ratio | No refit, no approximation beyond the grid; "3 more false alarms put this family decisively below the floor" |

### The three groups

| Group | Units | Quantity | Floor |
|---|---|---|---|
| Signal families | each Insights domain with decisive verdicts | the Board's **actionable precision** (confirmed vs false alarm; explained/dismissed excluded) | the Board's own `integrityPrecisionFloorPct` |
| Assumption classes | criticality (load-bearing / major / monitor) | hold rate of settled premises; inconclusive excluded | 70% |
| Delegation classes | authority (recommend / agree / act-inform / own / unspecified) | delivered by the due date; returned and overdue-open count as not delivered; not-yet-due is censored | 70% |

No group has a per-person unit. Groups are never pooled across, and a group the leader has
refused is fitted only to name its regime — nothing borrowed is printed or acted on.

### Rules on the spine (between the integrity rule and Decision Tempo)

- **RULE-CRE-01** re-reads only the group an event can change. A signal family decisively
  below the floor on borrowed evidence while its own record is insufficient or unresolved
  opens one owned re-tune task per family per ISO week (never for the auditors' own
  families). An open premise whose class's borrowed hold rate is below its declared prior
  with ≥ 95% posterior probability opens one outside-view decision per class per week
  (typed `outside-view` edges; premises flagged later that week attach to the open
  decision) — and this fires on `premise.created`, while the outside view is still cheap.
  An authority class decisively below the on-time floor with active work falling due inside
  21 days opens one leader-owned checkpoint task per class per week, linked to each. Every
  unit acted on gets a frozen frame (`borrows-evidence`, `governs-pooling`).
- **RULE-CRE-02** opens one exchangeability decision per group per week when the
  heterogeneity screen flags or one unit carries the pool, silenced for 90 days by a ruling.
- **RULE-CRE-03** grades due frames once — the borrowed forecast **and** the own-data
  Jeffreys forecast, by Brier, on the same first outcomes inside the window — lapses empty
  windows after a review period, opens a blameless process task after a borrowed miss that
  own data avoided, opens one skill decision per group per week when borrowing loses over
  ≥ 6 graded frames, and reconciles edges to deleted frames.

## Consequences

- Every small sample now has a number, its interval, the share of it that is its own, the
  date its own record takes over, and the count of outcomes that would flip its verdict.
- Every borrowed claim the workspace acts on is frozen and later graded against the unit's
  own record, so the product can say — with its own data — whether borrowing helps here.
- The Signal Integrity Board's inventory shows each thin family's borrowed precision and
  what a never-judged family inherits, instead of a bare "too few verdicts".
- CSV scope #61 exports group, unit and frame telemetry; units are classes, so no person
  or record id leaves the workspace.

## Defects found and fixed while building it

| Defect | Why it mattered |
|---|---|
| Regime named by a significance test | A balanced group (mean Z 62%) was labelled "the pool dominates" because p = 0.056 sat above α |
| Influence on an absolute threshold | Fired on every small pool, opening governance decisions nobody needed |
| Continued fraction under a 400-iteration cap | ~50 µs and inexact for concentrated Betas; posteriors took 40 ms per unit |
| Shrinkage measured from the Jeffreys estimate | The model shrinks x/n; from Jeffreys, a 3/5 unit appeared to move *away* from a 57% pool |
| A global `.row` CSS rule | Would have re-laid-out the evidence, performance and watch views, which use `.row` unstyled |
| Second premise flagged in the same week was dropped | One decision per class per week left later premises without an edge; they now attach to the open decision |

## Deliberately not built

- **Pooling across groups or a "universal" prior.** Different quantities; a pool of unlike
  things is an average, not a prior.
- **Per-person units** (delegation on-time by delegate, premise hold rate by owner). They
  would be performance ratings by another name.
- **MCMC.** Non-deterministic and unnecessary at two hyperparameters.
- **Auto-correcting a prior or a floor.** The engine opens a decision; the leader decides.
- **A composite "evidence quality" score.** It would hide which term is failing.

## Still [UNVERIFIED]

Whether 95% / 70% / 21-day defaults survive contact with real leaders; whether criticality
and authority classes are the exchangeability classes leaders actually believe in;
real-browser and assistive-technology walkthroughs; full competitor coverage.
