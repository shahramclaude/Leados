# ADR-0061: The Signal Integrity Board — charging the error budget and grading the detectors

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decision owners:** LeadOS product/engineering
- **Related:** ADR-0008 (generalized post-commit rule spine), ADR-0006/0007 (canonical
  zero-build app), ADR-0024 (early-warning watch), ADR-0025 (connected response and
  watch integrity), ADR-0055 (evidence terminal), ADR-0060 (deferral portfolio)

## Context

LeadOS evaluates around 300 deterministic rule predicates and one p-valued statistical
scan every time a screen renders. Each of those is a test. A leader did not ask for a
multiple-testing procedure; the product performs one anyway, and until this session it
kept no record of the procedure's own cost or quality.

Three specific gaps were open, and each had been named by an earlier session and then
carried:

1. **The error budget was never charged.** Session 39 gave the early-warning scan a
   Benjamini–Hochberg step-up *inside one look*. Nothing counted the looks. A leader who
   opens the app weekly for a quarter takes thirteen looks at the same records; at
   per-look α there is a family-wise chance of a false alert on the order of
   `1 − (1 − α)^K`, which for α = 10% and K = 13 is 75%. The product never said so.
2. **Nothing ever graded the detectors.** The watch ledger had a human verdict, the
   precision of one scan was computed from it, and every other family in the workspace
   was unaudited. Nobody could answer "is this rule right more often than it is wrong?"
   for the 55 families the Insights roll-up files findings under.
3. **The repeated-look aduit was owed since Session 95.** The weekly scans across
   modules are repeated looks at the same records. That is a sequential-monitoring
   problem with forty years of published machinery — Lan–DeMets alpha spending, Pocock
   and O'Brien–Fleming boundaries — and none of it had been applied.

## Decision

Schema v70 adds four collections and four post-commit rules. The module is deliberately
split across one leaf vocabulary file, one schema file, one pure read model, one rules
file, one view and one dialog file, because the read model has to be importable from
`insights.js` without a cycle through `schema.js`.

### What is computed, and what each figure actually is

| Capability | Where | What it computes |
|---|---|---|
| Spending-function arithmetic | `alphaSpent`, `lookBoundary` | O'Brien–Fleming-like `α*(t) = 2 − 2Φ(z_{α/2}/√t)` and Pocock-like `α*(t) = α·ln(1 + (e−1)t)`, both normalised so `α*(1) = α`. Look *k* of *K* receives `α*(k/K) − α*((k−1)/K)`; the per-test bar is that increment over the effective test count |
| Marginal look discipline | `lookBoundary` beyond the plan | A look past the planned number spends nothing and grants no significance — the budget does not renew itself |
| Effective test count | `effectiveTests` | `1 + (m−1)(1−ρ)` with a **declared** ρ, printed with a three-point ρ sensitivity table on the Overview panel. Never estimated from the workspace |
| Measured precision | `scoreFamily`, `wilsonInterval`, `pooledPrecision` | Per-family detection precision and actionable precision with Wilson 95% boundaries; status is `over-claiming` only when the *upper* bound is below the declared floor, `calibrated` only when the *lower* bound clears it, and `indeterminate` otherwise |
| Alerts per useful alert | `scoreFamily.nnfAlert` | `⌈1/p̂⌉` with its interval, so the cost of attention is a number rather than a complaint |
| Look ledger | `buildLookLedger`, `reconstructLooks` | One look per day, durable records winning over reconstructions, p values stored as facts and the boundary derived on read — a later change of plan cannot rewrite history |
| Frozen reviews | `buildIntegrityReview`, `gradeIntegrityReview` | Budget state on a date plus exactly one prospective claim (P(any false alarm in the next *n* surfaced signals)), graded once from surfaced verdicts dated inside the window, Brier scored, skill withheld below three grades |
| Signals | `integritySignals` | INT-01..06: budget spent ahead of plan, a family measurably over-claiming, an ungraded suite, due reviews, graded surprises, a look overrun |

### Rules on the spine

- **RULE-INT-01** records one look per day after the early-warning scan in the same
  transaction, with the plan in force and the p values that look produced.
- **RULE-INT-02** re-scores the family a verdict belongs to; when the upper Wilson bound
  is below the floor it appends one challenge note to the newest ungraded review (never a
  rewrite) and opens exactly one owned calibration task per family per ISO week —
  assigned to the leader, never to the colleague whose record tripped the rule.
- **RULE-INT-03** opens exactly one governed monitoring-plan decision per ISO week when
  the budget is nearly spent and the plan is not over. It never changes the plan itself.
- **RULE-INT-04** grades reviews whose windows have closed on an explicit scan, withholds
  the grade when no verdict landed, opens one blameless process task after a wide miss,
  and reconciles edges to deleted reviews.

## Consequences and the honesty boundaries this module enforces

- **No p-value is manufactured for a deterministic rule.** A predicate over the leader's
  records has no null distribution. Applying Bonferroni to it would produce a number with
  the *appearance* of rigour and none of the content. 54 of the 55 families are therefore
  classified `rule` and audited by measured precision; exactly one (`Early warning`) is
  `statistical` and receives the full correction. `STATISTICAL_FAMILIES` is asserted in
  the suite so this claim cannot silently become false.
- **ρ is declared, not estimated.** A leadership record cannot identify the dependence
  between its own detectors. The default is 30%, the Method panel prints the boundary at
  0/30/60%, and no code path derives it.
- **A reconstructed look count is a lower bound.** A day scanned with no candidate leaves
  no trace in the alert ledger, so reconstructions under-count looks, which under-states
  spend. The report carries `lowerBound` and the UI prints the direction of that error.
- **A review that cannot be graded stays ungraded.** No outcome is inferred from an empty
  window, and a stored grade without an outcome is dropped on load.
- **No person is scored.** Verdicts are keyed by a de-identified FNV digest of the
  finding, the ledger has no person field, and no per-person precision exists anywhere in
  the module.
- **Defaults are chosen for usability, not for the strictest possible number.** A
  26-look O'Brien–Fleming plan puts the first reachable boundary near p < 1e-9, which is
  true and useless. The default is Pocock-like over 12 weekly looks, both functions are
  offered, and the trade-off is printed beside the declaration.

## Alternatives considered and rejected

- **A single Bonferroni divisor over every rule.** Rejected above: it would be arithmetic
  cosplay over predicates with no null hypothesis.
- **Deriving ρ from observed co-firing.** Rejected: it would be an invented fact dressed
  as a measurement, and it would move every threshold whenever the workspace changed.
- **Applying the correction silently.** Rejected: the leader chose α and the look plan;
  hiding either makes the boundary unexplainable at the moment it matters.
- **Storing the boundary or the survivor count on the look record.** Rejected: a stored
  derived figure drifts from the plan it claims to describe. Both are recomputed on read.
- **Grading a review by counting every alert in the window, including suppressions.**
  Rejected: a suppressed candidate was never shown to the leader, so a forecast about
  "the next alerts" must not be graded on records nobody saw. `surfaced` is carried
  explicitly through `collectVerdictObservations`.
- **Making the governor change the plan automatically.** Rejected: a monitoring plan is a
  leadership decision with a cost either way; the rule opens the choice.
