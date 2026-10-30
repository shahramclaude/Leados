# ADR-0039: The Merit & Pay-Equity Terminal — a budget, a decomposition, and a signal nobody asked for

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0035](./0035-scorecard-integrity-lab.md), [ADR-0036](./0036-bounded-propagation-lineage-and-typed-links.md), [ADR-0038](./0038-implementation-fidelity-ledger.md)

## Context

Every other module in this workspace answers a question about *work*: did the decision hold, did the delegation
return, did the metric move, was the intervention delivered. The single largest decision a first-time manager
actually makes about *people* had no surface at all — how to spend a fixed merit budget across a team of unequal
market position, unequal replaceability and unequal history.

The existing tools in this category produce a spreadsheet and a communication problem. Pay-equity consulting
produces a PDF that is out of date the day it is printed. Both answer "what did we pay" and neither answers the
three questions that decide the outcome:

1. **What is the money buying?** A raise changes a departure probability, not a number in a cell. Replacement
   cost is observable and pay is the lever, so the allocation is a portfolio problem, not a fairness ritual.
2. **What pattern does the allocation make?** A team reads relative pay with more precision than it reads any
   performance document. Inversions, external-hire premiums and a merit grid that quietly reproduces an old
   distribution are visible to everyone and recorded by almost nobody.
3. **Was the model right?** A flight-risk score nobody ever checks is astrology with a decimal point.

Two temptations had to be refused before the design started.

- **Collect protected characteristics and produce a "discrimination" number.** This is what the enterprise
  vendors do, because their customers' legal departments require it. A local, offline, first-time-manager
  workspace has no business storing a protected characteristic, and the statistical claim it would license is
  one the data cannot support anyway.
- **Produce a raise recommendation per person.** That converts a structural finding into one person's windfall
  and leaves the mechanism that produced it completely intact. It is also indistinguishable, from the inside,
  from favouritism with a model attached.

## Decision

1. **Two new collections, additive migration.** `50 → 51` adds `compBands` (level, min, mid, max, effective
   date, label) and `meritCycles` (label, status `draft | finalized | abandoned`, effective date, currency, a
   budget as an amount or as a share of payroll, one declared comparison dimension, an owner, nested pay rows,
   frozen `audit`, resolved `outcomes`, bounded `history`). Nothing is invented for an existing workspace: no
   band, no cycle, no salary.

2. **No protected characteristic is stored, and the page says why.** The decomposition runs on a comparison the
   leader declares — hire origin (internal promotion versus external hire) or reporting line (which sub-team a
   person sits in). Both are real, recorded, decision-relevant and *not* protected classes. The three caveats
   the module always prints: an unexplained gap is not proof of discrimination; the controls are level, tenure
   and the last completed rating only; and scope, negotiation history and market timing are not recorded, so
   they sit inside the unresolved residual.

3. **Bands are a declaration, not a fit.** A band that does not form a range (`min < mid < max`) is dropped with
   a warning naming the reason. The app never repairs a band into money, and it never derives a band from what
   the current team happens to be paid — that is exactly how a pay structure becomes a mirror.

4. **A missing salary is missing.** `money(null)` used to coerce to `0` through `Number(null)`, which quietly
   turned "pay not recorded" into a real zero that flowed into compa-ratios, budget arithmetic and the frozen
   audit. The first run of the v51 suite caught it; the guard now refuses to finalize a cycle containing a row
   with no current pay or no proposal, because a frozen audit cannot contain a blank decision.

5. **The decomposition is twofold Oaxaca–Blinder on log pay, with an interval that matches the sample.**
   Controls are level dummies, tenure in years, last completed rating, and an explicit missingness term when
   someone has no review (dropping them would delete exactly the people a thin paperwork culture forgets). The
   gap splits into explained and unexplained. The interval on the *adjusted* gap is the standard error of a group
   indicator in the same regression, times a small-sample t. A percentile bootstrap over eight people per group
   was tried first and rejected: a resample can leave a level cell empty, the level coefficient becomes
   unidentified, and the interval ends up measuring composition noise instead of uncertainty about the gap.

6. **Adverse impact is a screen, not a verdict.** The four-fifths rule (EEOC Uniform Guidelines) is applied to
   the *decision*, not to headcount: a favourable outcome is an adjustment at or above the cohort median, and
   the ratio is the smaller group's favourable rate over the larger one's. Wilson intervals are attached,
   `reliable` is false below the sample floor, and the UI prints that a screen is not a legal conclusion.

7. **A budget is a constraint on a policy, so three policies are priced against it.** Across-the-board at the
   budget's share of payroll; performance-weighted with an explicit fallback weight for anyone with no completed
   review; and marginal retention value, a greedy raise-by-raise optimiser over
   `replacement cost × reduction in departure probability` that respects the band ceiling and the cycle's maximum
   increase. Each policy prints spend, budget use, the minimum and maximum increase, band violations, the
   four-fifths ratio it would produce, expected departures, retained value and regret against the best feasible
   policy. Applying one recomputes it server-side; the view never writes a plan it was handed.

8. **The retention model is small, printed and graded.** `p(depart) = logistic(z)` with four terms: band deficit,
   deficit against the same-level peer median, a recorded retention concern, and nothing else. Every coefficient
   is on the method card and no coefficient was fitted to the user's data — which is precisely why the module
   scores itself: finalizing freezes a per-person probability, `person.archived` resolves it, and the Brier skill
   score against the observed base rate is reported only at five or more outcomes.

9. **The rules refuse to fix a pattern by moving one person.** `RULE-COMP-02` opens exactly one DACI decision
   about the *mechanism* — recalibrate the bands against the work, publish the grid and its evidence rules,
   commission a targeted review of the flagged segment, or collect the missing variables first — with named costs
   on every option. It never proposes an individual adjustment, because no individual adjustment repairs a
   distribution. `RULE-COMP-03` opens one owned relative-pay task per cycle (never one per pair) and typed
   `compares-pay-with` links between the people whose pay relationship is flagged. `RULE-COMP-04` schedules one
   dated outcome review. `RULE-COMP-05` turns an archived person into a resolved prediction. `RULE-COMP-01`
   writes typed `compensates` provenance from the cycle to every person it pays.

10. **Calibration, CSV and lifecycle stay in the same discipline as everywhere else.** CSV scope #45 exports
    ratios, counts and grades under opaque cycle codes: no salary, no absolute pay figure, no name, no note, no
    cycle label, no identifier. Demo cleanup removes demo cycles and rows, nulls dead owner pointers and
    explicitly **keeps a frozen audit** — a settlement is a record of what was decided, not a projection that
    should be recomputed after the people it described have been deleted.

## Frameworks applied

- **Oaxaca (1973) / Blinder (1973)** twofold decomposition of log pay.
- **EEOC Uniform Guidelines (1978) four-fifths rule**, with Wilson (1927) score intervals, treated as a screen.
- **Holmström–Milgrom (1991) informativeness principle** behind the "record the missing variables" option: a
  measure that cannot separate effort from luck should not be the basis of a payment.
- **Principal–agent framing of retention pay**: the marginal value of a dollar of merit is
  `P(departure avoided) × replacement cost`, and the optimiser allocates until marginal value per dollar is
  equalised subject to the band ceiling.
- **Brier (1950) skill score** against the observed base rate, for the retention model's own out-of-sample grade.
- **Bloom/LATE-style dilution thinking** is deliberately *not* applied here; the departure model is a hazard
  proxy, not a causal estimate of what a raise prevents.

## Alternatives considered

- **A "recommended raise" per person.** Rejected: it makes the tool an authority on individuals it cannot see,
  and it hides the mechanism behind a number nobody can argue with.
- **Auto-apply the retention-optimal policy.** Rejected: the optimiser is a model with printed conventions; the
  leader is accountable for the distribution. The button writes the plan, it does not choose it.
- **Full pay-equity regression per protected class, enterprise style.** Rejected: storing a protected
  characteristic in a local browser workspace is a liability with no matching benefit, and at n≈10 the estimate
  would be noise dressed as compliance.
- **Percentile bootstrap for the interval.** Tried, measured, rejected (see decision 5).
- **Recompute the frozen audit after demo cleanup.** Rejected: a settlement is evidence of a past decision.

## Consequences

- The module is only as good as the pay data entered. It refuses to grade without bands, refuses to freeze a
  cycle with blank decisions, and refuses to report a decomposition below five people per group; the refusal is
  the feature.
- The retention coefficients are conventions. The Brier score exists to make that visible over time rather than
  to hide it behind a percentage.
- `compMaxAdjustPct` (default 20) means a merit cycle is explicitly not the instrument for a promotion or a
  market correction; those need their own decision record, and the action says so when a raise is refused.
