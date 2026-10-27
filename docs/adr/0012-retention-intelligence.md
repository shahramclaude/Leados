# ADR-0012 — Retention intelligence: survival analysis, an abstaining hazard model, and pay equity inside the allocation

- **Status:** Accepted
- **Date:** 2026-10-27
- **Session:** 45 (Schema v29)
- **Supersedes:** nothing; extends the typed-graph and post-commit-rule pattern of ADR-0008
- **Related:** ADR-0008 (post-commit rules hook), ADR-0011 (decision tempo), RESEARCH §53

## Context

The 2026 people-analytics hunt found a consistent gap: predictive attrition is the highest-stated
investment priority and one of the least-deployed capabilities, and the reason is not missing
ambition but missing method. The products that exist mostly return a 0–100 flight-risk score with
no interval, no base rate, no statement of what the model abstains from, and no money. The
compensation vendors that are winning in 2026 make the opposite move — they put pay-equity
analysis *inside* the cycle, on live data, with declared control factors, because a gap discovered
after the money is spent cannot be closed.

A leader using this app has, at best, tens of people and single-digit voluntary departures. Any
method that cannot say "I do not know yet" is therefore wrong by construction here. The workspace
also has a hard privacy wall (no confidential conflict content, no anonymous pulse responses) and
a hard rule that money is never invented.

## Decision

Build `#/retention` as a survival-analysis and expected-loss terminal, with five commitments:

1. **Model tenure, not people.** Kaplan–Meier product-limit estimation with Greenwood variance and
   log–log bands, censoring tracked explicitly, and the median reported *unidentified* when the
   curve never reaches 50%. Only voluntary exits are events; every other exit is censoring,
   because a redundancy carries no information about voluntary attrition.
2. **Shrink the thin cells.** Tenure-band hazards are `(events + α·prior)/(months + α)` over
   Lexis person-months, where α (`retentionPriorStrengthMonths`, default 12) is "person-months of
   evidence needed to move off the prior". A band with no exposure returns the prior exactly and
   is flagged prior-driven.
3. **Abstain below the evidence floor.** Factor multipliers are fitted by penalised Poisson IRLS
   with a log-exposure offset, an unpenalised intercept and a Gaussian prior on each published
   log-hazard-ratio (λ = `retentionRidge`, default 2). Below `retentionEvidenceFloor` (default 10)
   observed voluntary departures the model reports `mode: 'prior'`, the number of departures still
   needed, and every downstream number is labelled as prior-based. Non-convergence falls back to
   the priors rather than to whatever the last iteration produced.
4. **Two bands, named differently.** An absolute probability threshold encodes turnover
   conventions, not people; a low-turnover team would never trip it even for someone carrying four
   multipliers. The **watch band is relative** (`indexBandFor`: hazard index against the
   tenure-band baseline, default threshold 1.6×, so 1.6 = elevated and 2.48 = high), and the
   **absolute probability** with its baseline-hazard interval is reported beside it and used for
   the economics. The two are never conflated in copy or in code.
5. **Money is derived, and equity is inside the allocation.** Replacement cost = recorded annual
   cost × a stated convention (50% default, 10–300% allowed); no recorded cost means *unpriced*,
   excluded from totals, and currencies are never summed. The optimiser is a two-constraint
   knapsack over money **and** leader attention, with a **tier 0** that funds a below-band pay gap
   before any better-ratio option, and reports benefit at the point estimate and at the lower bound
   of the workspace's own baseline-hazard interval, plus the share of benefit that survives it.

## Consequences

- Every number on the screen carries its sample size, its interval or its abstention. That is
  slower to read than a score and it is the only version of this that survives a challenge from
  an employee, a works council or a board.
- The rule set can stay conservative. `RULE-RET-01` proposes (never commits) a plan only for an
  **observed** person (at least one recorded 1:1, feedback, review, pulse or recognition) whose
  index band is elevated or high and who has no live plan — because missing data is not risk, and
  a rule that fires for a freshly imported roster is a rule that gets muted. `RULE-RET-02` moots a
  live plan when someone leaves; `RULE-RET-03` raises one model-governance DACI decision when the
  evidence floor is crossed; `RULE-RET-04` raises one systemic-driver decision per clustered exit
  class instead of a case per person.
- The engine is pure and memoised by week + state key, so the nav badge, the Today card and the
  terminal share one computation and the standalone single-file build produces identical numbers.
- Two measurement statistics ship with the model: Harrell's C over comparable pairs (minimum five)
  and a Brier score over committed plans whose horizon has closed. A C below 0.6 raises its own
  signal telling the leader not to allocate on the ranking.
- Accepted limitations, all stated in the UI: proportional hazards is assumed and untested
  (Schoenfeld residuals are roadmap); the six priors are published research, not this team;
  replacement cost is a convention; baseline-hazard intervals exclude multiplier uncertainty,
  which is reported separately; Kaplan–Meier assumes non-informative censoring; and no workspace
  has yet crossed the floor, so the ordering has never been calibrated out of sample.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A single 0–100 risk score | Destroys interval, base rate and censoring information; cannot be calibrated or explained to the person affected. |
| Gradient-boosted attrition model | At tens of people and single-digit events it fits noise, cannot be audited, and would need more data than the workspace will ever hold. |
| Absolute-only watch threshold | Silent for low-turnover teams; a 4.5% risk with four multipliers was filed as "low" in the first integration test. |
| Engine commits the highest-ROI intervention | Spending is the leader's authority; committing raises a DACI decision with recorded options and a cost. |
| Estimating a missing salary from level/team averages | Fabricates the denominator of the business case; unpriced must stay a first-class state. |
| Pay-equity gap as a post-hoc report | The 2026 vendor finding: a gap discovered after the money is spent cannot be closed. Tier 0 puts it inside the allocation instead. |
| Using confidential conflicts or anonymous pulses as factors | Existing privacy walls; a score must never let a leader infer an anonymous response. |
