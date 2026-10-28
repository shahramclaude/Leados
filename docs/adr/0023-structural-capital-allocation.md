# ADR-0023: Structural Capital Allocation — budgeted lever portfolios, exact Shapley and a trust ladder

## Status
Accepted — 2026-10-28 (Session 58). Schema v38; additive migration (`capitalPolicies`,
`dynamicsCheckpoints`, five `capital*` settings).

## Decision
Treat an improvement plan as a **portfolio selected under a fixed effort-week budget**, not as a
sequence of independent bets. A leader declares a budget (1–40 weeks, default 12), a horizon and
four objective weights; the engine allocates greedily by marginal objective gain per effort-week
across six structural levers (each with a published effort-book cost), runs a complementarity pass,
and reports the joint trajectory against doing nothing. Attribution is **exact Shapley over every
coalition of the funded levers**, with pair interactions reported separately. Uncertainty is handled
by seeded lognormal parameter stress and **Savage minimax regret** across the plan, the six named
playbooks and doing nothing. The do-nothing baseline is **frozen beside the prediction at adoption**,
so a later observation produces a skill score (`1 − model error / naive error`), never a
memory test. A five-grade trust ladder gates the word *actionable* on out-of-sample evidence.

## Guardrails
- The objective weights are a declared, leader-owned **value function**, printed with the plan;
  "optimal" always means optimal for those weights. Effort costs are labelled conventions.
- Greedy allocation is **not** presented as a global optimum; every accepted step proves a positive
  marginal gain, and the page says the search is greedy.
- Shapley is computed exactly (≤ 64 evaluations). The efficiency gap is printed. A negative marginal
  can make a share exceed 100% in magnitude; the pair table is printed beside it for that reason.
- A checkpoint may not be dated in the future, may not predate adoption, and may not duplicate
  `(subject, recordedOn)`. Skill is withheld when no baseline was frozen; pooled skill is counts-only
  below n = 2.
- A non-positive pooled skill opens exactly **one** re-baselining decision. The model is never
  silently retuned, and adoption is never automatic.
- `capitalAutoPropagate:false` pauses checkpoint governance (re-baselining and lineage edges) only.
  An explicit adoption the leader just made always fans out, because suppressing it would hide the
  leader's own act.
- Stored scores are re-derived from observation plus frozen prediction on every load, so a hand-edited
  skill cannot survive a reload.
- Nothing ranks people; the answer is structural. No morale, sentiment or attrition is inferred.

## Consequences
- Two new collection types and two new link entity types (`capital`, `checkpoint`) with relations
  `allocates` and `scores`; an unregistered type would silently drop the edge, so registration is a
  hard requirement for the lineage to exist.
- The rule and signal namespace is **`RULE-SCA-*` / `SCA-*`**, not `RULE-CAP-*`: Capacity & Flow owns
  that prefix, and a collision had already produced 98 catalog rows with 94 unique ids during this
  session. Duplicate rule ids are now asserted against in tests.
- A fresh workspace cannot reach `actionable` by construction. That is the intended behaviour: the
  module's first job is to tell a leader how much its own numbers are worth.

## Alternatives rejected
- Expected-value ranking without regret (over-claims precision for parameters that are conventions).
- Monte-Carlo Shapley (exact is cheaper at six levers and cannot be argued with).
- Auto-retuning the model when checkpoints fail (the leader decides what the failure means).
- Scoring against a baseline reconstructed after the observation (that is a memory test).
- Auto-adopting the recommendation, or hiding the trust grade behind a tooltip.
