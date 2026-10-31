# ADR-0059 — Price the option to wait, not only the cost of waiting

**Status:** Accepted · 2026-10-31 · Session 97 · Schema v68 · ADR-0059 · RULE-DRO-01..03 · DRO-01..04 · CSV #58

## Context

Every delay surface in LeadOS is one-sided. Decision Tempo derives a carrying cost per week from a linear cost-of-delay profile; the Cost of Waiting terminal prices the queue and freezes weekly exposure certificates; the Consequence Lab integrates the conditional survival curve to an expected carrying cost; Information Value prices what one more test would tell you. All four answer **what waiting costs**. None answers the question that decides whether waiting is rational: **what is the flexibility to wait worth?**

The distinction matters because the workspace's own numbers can say "wait" and be wrong. A leader who records an irreversible call with real uncertainty and a modest carry price is told by every existing surface that the delay is expensive; the same ledger has no way to say that holding the call open is itself an asset worth a specific amount, or to identify the stake at which committing becomes the better policy. The negative-drift assumption is built into the arithmetic (the Cost of Waiting's 12-week erosion window), so the product can only ever nag.

Two further constraints shaped the decision. First, an option premium is **not** EVSI and must never be added to it: value of information prices learning about an unobservable state; an option to defer has value even with nothing left to learn, because committing sinks money into a call the world can still invalidate. Second, the workspace has no traded underlying, no replicating portfolio and no market price, so a risk-neutral measure would be a fiction. Whatever is built must be a decision-analysis expected value on a real-world measure, labelled as such, with the model's assumptions printed next to its numbers.

## Decision

Ship a **Deferral Option Terminal** (`#/deferral`) that prices one decision's option to wait as an **American call**, solved by Cox–Ross–Rubinstein backward induction, and refuses whenever the inputs cannot support the model.

1. **The model.** `V` (the value at stake) follows a geometric Brownian motion under the leader's declared drift (default 0). Committing at any node pays `max(V − K, 0)`, where `K` is the commitment cost — the money a commitment sinks, not the stake. Waiting pays the weekly carry `c` and keeps the right to commit later or to walk away. The lattice solves the stopping problem at every node; the root decision is the recommendation.
2. **`K` comes from the record.** A decision's commitment cost is the sum of budget lines that point at it (`sourceType: 'decision'`), in the frame's currency. A reversible call sinks nothing, so `K = 0` and the frame says to decide now — the type-2 decision the workspace otherwise nags about. An irreversible call with no committed line falls back to the full stake and **prints that convention**. Every basis string is shown on screen and frozen into the record.
3. **σ is derived, or withheld.** The estimator is the robust log-scale dispersion (1.4826 × MAD, Rousseeuw & Croux) of the workspace's own settled realised ÷ assessed magnitudes — settled case exposure ratios and delivered plan-effort ratios — annualised by root-time scaling from the median observed horizon. Below the observation floor (default 5) it refuses; below the σ floor (default 5%) it withholds with `belowFloor`. The floor polices the estimator, not the leader: a **declared** σ is accepted, labelled `declared`, and carried into the frozen record with its provenance.
4. **Carry is a cash outflow, never drift.** Putting the delay price into both the drift and the carry would double-count the Cost of Waiting arithmetic. The frame prints the carry source (derived by the same 12-week erosion window, or declared for the frame) and the break-even carry price at which waiting stops paying.
5. **Break-evens are solved, not eyeballed.** Bisection on the same tree returns the carry price at which the premium hits zero and the volatility below which it never appears. Those two numbers are what make the terminal usable: they convert "wait or not" into "wait only if your carry is below X / your σ is above Y".
6. **Verdicts are decisions, not scores.** `commit-now` (the policy exercises at the root), `wait` (holding is worth more than committing), `indifferent` (a premium under the materiality floor is not advice to postpone), `act-or-drop` (at today's stake committing does not clear its own cost) and `withheld` (no supportable inputs). The materiality floor is a share of the value at stake, default 1%.
7. **The record is a prospective forecast.** A frozen frame stores the stake, cost, carry, σ and its source, the lattice output and **one** timing claim: `predictedCommitByDeadlinePct` — the real-world probability that the optimal policy commits before the window closes. It stores no title, question, rationale, person or note. Grading happens once, after the window, from the decision's **recorded** `decidedOn`: a decision recorded as chosen without a date is ungradable rather than late. Brier is computed against that claim; skill against the observed commit rate waits for five grades.
8. **It is not added to anything.** The premium is never summed with EVSI, with the Cost of Waiting's integrated carrying cost, or with another currency. The UI, the brief and the ADR all say so, because the arithmetic invites exactly that mistake.

## Propagation

Three marker-idempotent rules on the existing spine, all writing inside the caller's transaction:

- **RULE-DRO-01** (`deferral.frozen`) writes a typed `optionframe → decision` link with relation `defers-decision`; when the verdict is `wait` or `indifferent` it also opens exactly one owned task to watch the exercise boundary, due in `clamp(horizonDays, 1, 30)` days, carrying the frozen boundary and premium. `commit-now` and `act-or-drop` deliberately open no watch task — the frame's own answer is "decide".
- **RULE-DRO-02** (`deferral.scan`) reconciles only this module's edges, opens at most three grading tasks for due frames, and turns a window that expired with the decision still open into exactly one governed DACI decision per ISO week, linked to its frames with `surfaces-impact`. A re-scan changes nothing.
- **RULE-DRO-03** (`deferral.graded`) opens one blameless process task when the Brier loss is at least 0.25. It never rates a person.

The pause switch (`deferralAutoPropagate = false`) stops freeze-driven writes; an explicit scan always runs.

## Schema

Additive `67 → 68`: empty `deferralFrames` and `deferralMarkers`, plus nine clamped `deferral*` conventions (`deferralAutoPropagate`, `deferralMinObservations`, `deferralSigmaFloorPct`, `deferralSteps`, `deferralDiscountPct`, `deferralMaxHorizonDays`, `deferralWatchBandPct`, `deferralMaterialityPct`, `deferralReviewCap`). Empty collections are the correct upgrade state: a frame is a forecast, and back-filling one would be a prediction made after the answer was known.

## Alternatives rejected

- **Add the premium to EVSI or to the Cost of Waiting's expected carrying cost.** They measure different things; summing them would produce a number no theory supports and would double-count the delay price, which is already the carry term of the lattice.
- **Risk-neutral pricing.** There is no replicable portfolio for a leadership decision. A risk-neutral measure would dress a decision-analysis number in market language and invite exactly the misreading the module refuses.
- **Black–Scholes as the model.** Early exercise is the whole point: the exercise boundary, the hysteresis between `K` and `V*`, and the "wait until the stake reaches X" instruction only exist in the American lattice. BSM is retained **only** as the validation anchor for the tree (pinned by test).
- **A single "wait score".** A 0–100 flexibility score would hide the two numbers a leader can act on (the premium and the boundary) and would tempt cross-decision ranking on incommensurable stakes.
- **Defaulting σ, K or carry.** Each would have made the terminal work on every workspace and printed a number nobody supplied. The refusals are the feature: the screen names the missing input and offers the declaration.
- **Back-filling frames on migration.** A frame written after the deadline is not a prediction.

## Consequences and limits

The terminal is a **model**, not a measurement: constant σ, no jumps, no stochastic volatility, no learning-by-waiting, no competitor response, no drift beyond what the leader declares. The derived σ is a scale-mixture assumption over realised ratios, annualised from a median horizon that is printed because the extrapolation is the weakest link; on short cycles it produces large σ, which the materiality floor then has to absorb. `K` from budget lines is a proxy for the reversal cost, and an irreversible call with no committed line falls back to the full stake — a conservative convention, not a measurement. The real-world measure means the "probability" is a decision-analysis subjective probability, not a frequency.

The workspace's own 12-week erosion convention is brutal: with carry at stake ÷ 12 weeks, most demo frames read `commit-now` or `indifferent`, and the honest finding is that **waiting rarely pays its carry** — which is exactly what the break-even columns exist to show. Deliberately out of scope: deferral of a *portfolio* of calls (correlation between decisions), option value from learning (EVSI), and any claim that the lattice beats a leader's judgement. Real-browser and assistive-technology walkthroughs remain **[UNVERIFIED]**.

## Validation

`tests/app/deferral-option.test.mjs` (41 claims): the 67→68 migration and its clamped settings; fail-closed normalisation (a frame without a stake, currency, σ, verdict or duplicate id is dropped, a claimed grade without an outcome returns to frozen); CRR against the Black–Scholes reference (10.4506) and its convergence in steps; the American tree dominating its European twin; `K = 0` exercising immediately; σ = 0 as the deterministic limit; monotonicity of the premium in σ and in carry; refusals for empty value, negative cost, negative σ, empty window and negative carry; σ derived only from settled records and withheld below the floor; declared σ labelled; the reversible and irreversible commitment-cost conventions; the materiality indifference; what-if isolation to the focused frame; freeze → typed link → one boundary watch, idempotent on replay; the pause switch; the expired-window decision (one per ISO week, linked, idempotent); due-grading work opened once; grading refusing early, missing and undated outcomes and the hand-computed Brier values (0.16 / 0.36); persist/reload of a graded frame; the typed node/collection/relation and its resolver; contract parity with the rule chain; the Insights bucket and its signals; CSV scope #58 (aggregate-only, means blank below five frames, no titles); routes and nav aliases; four panels rendered under JSDOM with axe clean; the empty workspace as an explained dead end; an identity-free brief that carries its refusals; and the demo workspace producing supported frames from a derived σ.
