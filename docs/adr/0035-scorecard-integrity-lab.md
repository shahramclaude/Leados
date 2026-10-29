# ADR-0035: The Scorecard Integrity Lab — modelling what a measure will make people do, before the evidence arrives

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0028](./0028-after-action-review-learning-ledger.md), [ADR-0032](./0032-leader-continuity-drill.md)

## Context

LeadOS had a goals module that is honest about progress (`goalPace`, `goalHealth`, KR-derived
percentages) and a change module that checks Holmström–Milgrom alignment at the level of a
*single* redesign (`evaluateStarAlignment`). Neither answers the question a first-time leader
gets wrong most often and most quietly:

> If I pay attention to these numbers, what will people actually do differently?

Nothing in the product priced the **measurement instrument** itself. A leader could set a goal
with three key results, give it 100% of the bonus, and the app would report progress on it
faithfully — while the metric pulled effort out of the work the leader cared about and into
whatever moved the number. That failure is silent by construction: the dashboard goes up, the
real work goes down, and the first evidence of it is a quarterly surprise.

The competing options were rejected explicitly:

- **A better goals dashboard** (more charts, KR trees, weighted roll-ups). This is the safe move
  and it changes nothing about the incentive.
- **An AI narrative** over the leader's goals ("your OKRs look strong"). Untestable, unversioned,
  and incapable of saying *no*.
- **Person-level scoring or attrition prediction.** Rejected on evidence and privacy grounds in
  earlier sessions and rejected again here: the incentive is the object, not the person.

## Decision

Ship a **declared-parameter mechanism-design instrument** with a closed-form equilibrium, a
deterministic redesign search, and a frozen prediction that is scored later.

1. **The model is published, not hidden.** `scorecardEquilibrium` implements a multi-task
   principal–agent problem with a gaming technology:
   `ŵ = w/Σw`; `ρ = ŵ/(1 + rσ²)` (LEN risk, Banker & Datar 1989); `c = 1 + 3·cost`;
   `k = 0.25 + 2(1 − ease)²`; `genuine = (ρ/c)(1 − 0.6·ratchet)` (Weitzman 1980);
   `gaming = ρ·ease·(0.6 + 0.8·stakes)/k` (Campbell 1979). Effort is normalized to a conserved
   budget; the uncounted-work floor is declared, and when the leader declares nothing uncounted
   that floor redistributes rather than evaporating. First-best allocates effort ∝ value ÷ cost
   across counted and uncounted work alike, so "efficiency" is always measured against the same
   denominator.
2. **Distortion is a property of the measure.** `goodhartProfile` returns a per-metric index that
   combines the modelled cosmetic share, a stakes amplifier and the leader's declared detection
   rate (Baker 1992; Kerr 1975). It is a declared composite that orders attention; the UI says so.
3. **Redesign is searched, and "keep it" is a real answer.** `rankDesigns` evaluates seven
   deterministic designs (re-weight, guardrail, de-stake, measure-the-gap, and combinations) and
   subtracts a declared per-metric measurement cost (`measurementMetricCostPct`, default 2 value
   points). It recommends a change only when the net lift clears 2 points.
4. **The prediction is frozen before the evidence.** `commitScorecard` freezes
   `freezeMeasurementPrediction` output — efficiency, gaming share, neglect, Goodhart index,
   worst metric, and a falsifier margin (`+12pp`). `recordScorecardObservation` records the
   leader's own estimate of cosmetic movement; `scoreMeasurementObservation` scores it, and the
   report refuses to claim calibration below three observations.
5. **The model becomes work, on the existing spine.** `RULE-MTX-01` on `scorecard.committed`
   opens exactly one DACI redesign decision (four options including "accept the distortion"),
   at most two owned delegations (instrument the counter-metric; baseline the uncounted work)
   and at most one blameless 1:1 question. `RULE-MTX-02` on `scorecard.observed` opens one
   calibration decision and one pre-filled after-action review when the recorded gaming beats
   the frozen prediction by the declared margin. A sound scorecard creates nothing at all.
6. **A committed design is evidence.** It cannot be edited in place; the lab forks a new draft
   with its own prediction, so the earlier forecast remains scorable.

## Consequences

- The product can now say, with arithmetic and in hours, how much of a team's effort a
  scorecard is modelled to misdirect — and what a different card would recover.
- Every number is a model result under leader-declared conventions. None of it is a measurement
  of a person, and the page prints the equations so a reader can overrule them with a calculator.
- Contradiction risk is real: if a leader's declared parameters are self-flattering (gaming ease
  0, detection 100%), the model will say the card is sound. The falsifier and the calibration
  ledger are the defence — the model can be wrong in public and the miss is recorded.
- A new active surface (7th view in the Growth section) and a new badge. The badge is attention,
  not telemetry: it counts distorted/leaky cards and overdue measurements.
- Schema v47 is additive. No historical scorecard is invented; an older workspace starts with an
  empty lab that says so.
