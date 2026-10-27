# ADR-0015 — An Impact Ledger: pre-registration, a counterfactual, and a refusal to claim causation

- **Status:** Accepted
- **Date:** 2026-10-27
- **Session:** 49
- **Supersedes:** nothing. **Extends:** ADR-0008 (post-commit rules spine),
  ADR-0011 (decision tempo receives the resulting scale/stop decision).

## Context

Every surface in LeadOS before this session answered a question about *now* or
about *the near future*: what needs attention, what the network looks like, what
a decision's delay costs. None could answer the question a leader actually asks
after running something: **"did that work, or did the line go up anyway?"**

The market does not answer it either. The 2026 people-analytics tools are
descriptive and predictive; the research literature's own agenda for the field
names the gap as *"causal evidence rather than correlational snapshots"*; and the
meta-analytic evidence says leadership interventions move outcomes by roughly
g = 0.12–0.29 (coaching, the strongest case, ≈ 0.59 with acknowledged
publication bias). A four-week before/after comparison on a noisy weekly metric
therefore cannot see the effect even when the effect is real. Reporting "no
effect" in that situation is not neutral — it is a false negative that kills
interventions that work.

## Decision

Ship an **Impact Ledger** (`#/impact`) with five non-negotiable properties.

1. **Reconstruction from records only.** Vitals are derived from dated lifecycle
   fields the leader already typed. No new telemetry, no survey, no external data.
   An unobserved period is `null`, never `0`; an undated closure is excluded and
   counted, never interpolated; a metric is trimmed at its coverage frontier; a
   metric with no records at all yields an empty series with a reason.
2. **Pre-registration enforced by the data model.** `declaredOn` is stamped by
   the action, never accepted as input. The confirmatory/retrospective grade is
   derived from `declaredOn ≤ windowStart`. Predictive fields are immutable after
   the window closes. Scoring freezes the evaluation, and every read path uses the
   frozen copy.
3. **Inference that can fail.** Segmented ITS with Newey–West HAC errors; gaps
   skipped rather than zero-filled; a minimum detectable effect in the metric's
   own units; in-space and in-time placebo tests that report their finest
   attainable p-value and are *not* used as gates when that floor exceeds α; a
   breakdown-trend bound on the parallel-trends assumption.
4. **A pre-intervention power planner.** `designPower` uses the metric's own
   I-MR noise and the design matrix implied by the chosen pre/post weeks to state
   the smallest detectable shift *before* any post-period exists, and the declare
   dialog runs it live.
5. **Propagation that acts, but only on evidence.** `RULE-IMP-01..06` create typed
   links, exactly one DACI decision for a confirmatory decisive result, blameless
   talking points for a contradicted people-facing intervention, and exactly one
   proposed replication of a supported one — atomically, idempotently, and with
   the standard pause semantics.

## Consequences

- **Positive.** The app can now say "this cannot be measured", "this was
  inside the noise", "the metric was already trending", and "this worked, and
  here is the replication I owe you" — distinctions no competitor in the category
  makes. Calibration gives the leader a personal effect-size prior instead of an
  industry average.
- **Cost.** Schema v31 with a new collection and a migration; four new settings;
  a fifth full-page surface and a sixth post-commit rule family; 56 new tests.
- **Constraint accepted.** A retrospective study is still evaluated but can never
  be called confirmation. This is deliberately annoying: the alternative is a tool
  that lets a leader relabel hindsight as foresight.
- **Rejected.** Fitted synthetic-control weights (a donor pool tuned on the pre-
  period can always be made to look convincing; the shipped composite is
  equal-weight and deliberately unfitted). RCT support, staggered-adoption
  estimators and sibling-team controls are *not* claimed — they are roadmap
  items, and the UI states the donor-composite limitation beside every placebo
  distribution.
- **Never.** Causal language, patient-level or person-level ratings, backdated
  declarations, rescoring a locked study, or moving a window after seeing the
  outcome.
