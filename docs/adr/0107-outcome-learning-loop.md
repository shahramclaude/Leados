# ADR-0107 — The Outcome Learning Loop (Schema v109, additive `108 → 109`)

**Status:** shipped on `arena/4622ebba-leados`, 2026-11-06. Session 147.

## Decision

The workspace could adopt a coordinated response atomically (ADR-0105) and close
it from dated terminal evidence (ADR-0106), but it never recorded **what the
organisation expected when it adopted the response**, so no grade, calibration
or outside view could exist without hindsight. We add ONE new unit of analysis —
the frozen expectation attached to an adopted action bundle — and four rules on
the **existing** generalized post-commit spine:

- `RULE-OLN-01 FREEZE` — one expectation per adopted bundle, id derived from the
  bundle. The reviewed Command Flow confidence (or an explicit human
  pre-registration) is frozen at adoption with a horizon, source pointers and a
  fingerprint. Typed `pre-registers` / `rests-on` edges connect the new
  `outcomecontract` graph node to the case, decision, delegation, coaching,
  premise, budget and comms records the response actually touched, plus one
  `rolls-up-to` edge per leadership ancestor — cross-module propagation and
  vertical roll-up in the **same** atomic transaction, zero manual re-entry.
- `RULE-OLN-02 GRADE` — once-only, out of sample, from a closed execution loop
  plus a dated human decision outcome. A missing forecast, missing review or
  postdated review produces a **stored refusal** (`ungradable`), never a zero.
- `RULE-OLN-03 STALE` / `RULE-OLN-04 BIAS` — one governed review decision per
  span per ISO week for open loops past the declared stale window, and one
  governed recalibration ask when the pooled declared confidence is materially
  inconsistent with the workspace's own realised base rate. These are ASKS to a
  human, never automatic changes to anyone's forecast.

Altitude is a dimension of this engine, not a second hierarchy system. The read
model is role-tiered: frontline/manager see their own loop detail and receipt;
director/VP/CEO receive identity-free pooled intervals, every refusal, and
small-cell suppression. CSV scope #101 exports aggregates only. The Decision
Tempo terminal prints a published **outside view** beside the declared forecast
and refuses a thin record; option value is not recomputed from it.

## Why this is an architecture change worth making

It raises the ambition ceiling from "we can prove what happened" to "we can
measure whether our declared beliefs were earned, and price the next decision
against our own base rate" — using the SAME event spine, SAME link vocabulary,
SAME seat/permission gateway and SAME disclosure boundary. No new dashboard
stack, no per-role glue, no second roll-up engine. Three additive collections
(`outcomeContracts`, `outcomeGrades`, `outcomeMarkers`), declared settings, one
new graph entity type and one new CSV scope. Migration back-fills nothing: an
empty ledger honestly means "no response was pre-registered here yet".

## Named frameworks (implemented, not name-dropped)

Brier (1950) proper scoring against a strictly-prior 0.5 base rate; Wilson
(1927) score intervals; Vovk et al. (2005) one-sided split-conformal finite
sample coverage with refusal when `k > n`; Kahneman & Tversky (1979) /
Flyvbjerg (2006) reference-class forecasting from the workspace's OWN graded
loops, shrunk toward Laplace/Beta(1,1); PDCA/Deming separation of Check from
Act (a good outcome on thin delivery is `lucky`, not `earned`); Kahneman's
pre-mortem discipline (pre-registration before evidence); Six Sigma process
gates (stale review instead of person rating); portfolio ROI discipline (Brier
skill, not win rate); stakeholder/power safety (blameless refusals, no person
score, no upward detail leak).

## Integrity constraints

- Stored scores are re-derived from the frozen probability and the human outcome
  on every normalize; a hand-edited Brier is DROPPED with a warning.
- A human outcome review may not be future-dated or postdate the case closure.
- A forecast declared after the outcome is hindsight; only an explicit
  pre-registration before evidence is accepted, and only once.
- `record-outcome-learning` rank 1–5; `govern-outcome-learning` rank 4–5 AND
  full enterprise access; reads are allow-listed in the gateway.
- Pausable automation with an explicit scan that always runs; root events only,
  no second-order cascade; one summary timeline event per pass.
- Suppression is not differential privacy; conformal bands assume
  exchangeability and are printed as such; grades are associations, not causal
  claims or person ratings. Local seats are declarations, not authentication.

## Verification status

`tests/app/outcome-learning.test.mjs` — 16/16 green (pure statistics, v109
migration, 87th rule/contract parity, cross-module typed graph, four-rung
roll-up, once-only grading, corruption refusal, altitude disclosure, CSV
privacy, tempo outside view, Mission Control panel, pause gate, governance,
hindsight refusal). Canonical lint / boundary / docs-links / standalone rebuild
results are recorded in `AI-SESSION-LOG.md`. Full `npm test` and real-browser
AT walkthrough: see the session log; anything not personally re-run is
`[UNVERIFIED]`.
