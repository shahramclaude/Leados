# ADR-0045 — Calibration-to-decision sensitivity, never automatic belief correction

**Status:** accepted · **Date:** 2026-10-30 · **Schema:** v56 · **Session:** 80

## Context

The Information Value Terminal computes an exact EVPI from a declared probability vector and payoff matrix. The Leader Probability Calibration Terminal scores the user's settled forecasts with Brier/Murphy measures and exposes reliability bins. Those two records lived beside each other but did not answer the manager's operational question: **how much could my own historical forecasting error change the value of learning, or even change the preferred action?**

A raw calibration curve cannot be applied mechanically to a categorical payoff model. The one-vs-rest state rates do not necessarily sum to one, bins can be sparse, and probability pairs from the same resolved frame are dependent. A naive plug-in would turn descriptive, correlated samples into false precision and silently replace the leader's current belief with their historical average.

## Decision

Add a read-only calibration stress bridge to the existing VOI and calibration modules, and a marker-idempotent `RULE-LCAL-04` on the shared post-commit spine.

1. **Only complete priced frames qualify.** If any payoff is missing, probabilities do not sum to 100, or any state probability maps to a reliability bin with fewer than three observations, the stress is `null` with a reason. No imputation.
2. **Shrink, then cohere.** For each state, estimate its one-vs-rest historical event rate with a Jeffreys Beta(½,½) posterior mean. Blend that rate with the declared probability using weight `n/(n+10)`. The value 10 is a transparent prior-strength convention, not a fitted parameter. Renormalize the resulting state vector to 100% (rounding residual goes to the final state), then recompute EVPI through the existing exact payoff enumerator.
3. **Expose sensitivity, not a confidence claim.** Propagate each covered bin's Wilson 95% marginal interval through every lower/upper corner (at most `2^6 = 64` for the supported frame size), renormalize each coherent vector, and report the minimum/maximum EVPI and the set of expected-value choices. These are stress bounds, not simultaneous confidence limits.
4. **Preserve the decision record.** The current declaration and any already frozen prediction are never changed. The view displays raw EVPI beside the shrinkage scenario and interval, and explicitly says the scenario is not a posterior or corrected belief.
5. **Record provenance on a fresh decision or when evidence matures.** On `voi.declared`, `voi.scanned` (settlement), or an explicit scan, when every band is covered, `RULE-LCAL-04` appends one note and up to three `calibrates` edges from the prior settled forecast frames contributing most observations in those bins. This connects already-open frames when the newest settlement makes their bands mature. Settlement sweeps are capped at twenty frames; a remainder event tells the leader to scan again. It never links to a synthetic report entity. Reruns are marker-idempotent. The existing full calibration verdict replaces the old quick high/low heuristic for `RULE-LCAL-03`.

## Consequences

- Historical calibration now reaches the decision in money and choice terms, not only a reliability chart. The leader can see whether a nominally large information ceiling is fragile to their own record and inspect the exact source frames.
- The outputs remain local, explainable and reversible in the sense that they are read-side scenarios; only the append-only note and typed provenance edge are written on the event that declares a new frame.
- No schema migration is needed: the feature reads existing settled `voiDecisions` and writes to existing `notes`, `calibrationMarkers`, and `links` shapes. There is no new data collection.

## Limits and rejected alternatives

- **Not Bayesian belief updating.** A reliability-bin event frequency is not the posterior probability for this specific event; this deliberately weak scenario says so in the UI, brief and automation note.
- **Not a simultaneous or cluster-robust confidence interval.** State-pairs within a categorical frame are dependent; Wilson intervals do not account for that dependence. The marginal corner envelope can be wide or misleading in small, domain-shifted samples.
- **Not domain-specific.** The existing sample is workspace-wide unless users have enough explicit premise-topic samples; the bridge does not infer domain similarity from text.
- **No silent calibration correction.** Automatically applying a learned remap was rejected because it substitutes the past for the present, hides judgement, and can create an unauditable feedback loop.
- **No weighted composite of EVPI, Brier and regret.** It would obscure the money trade-off. EVPI is recomputed under declared scenario distributions instead.
- **No bootstrapped pseudo-certainty.** Frame-cluster resampling and domain-specific calibration remain planned research; the present output is explicitly labelled a sensitivity stress.

## Verification contract

`tests/app/leader-calibration.test.mjs` checks exact EVPI re-evaluation, bounded 64-corner enumeration, missing-band and incomplete-frame refusals, input immutability, typed source/target link resolution, event idempotency, contract/catalog registration and the UI table. Full canonical verification is recorded in `AI-SESSION-LOG.md` after it is run.
