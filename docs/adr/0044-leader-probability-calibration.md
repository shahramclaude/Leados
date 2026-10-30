# ADR-0044 — Leader Probability Calibration Terminal (Schema v56)

Date: 2026-10-30
Status: Accepted (Session 79)

## Context

By Schema v55, LeadOS could price information (EVPI/EVSI), surface coupled decisions, freeze probability snapshots at decide-time, and score a frame once the true state arrived (multi-class Brier, log loss, incurred regret). What it could not do was answer the question that haunts every forecaster who sees their own Brier score:

> When I say "70%", how often am I actually right?

Without that answer, EVPI is an upper bound over an unchecked set of beliefs. An overconfident leader declares 95% on events that happen 60% of the time, EVPI arithmetic is flawless, and the answer is wrong because the input distribution was wrong. Public tools — Lattice, 15Five, Workboard, McKinsey's published decision-portfolio framework — do not score their user's own probabilistic judgements against outcomes using proper scoring rules, reliability diagrams, and overconfidence detection. Tetlock & Gardner's *Superforecasting* (2015) describes the practice; no leadership tool ships it as a live terminal.

## Decision

Ship a **Leader Probability Calibration Terminal** as a new "Calibration" tab under the existing Information Value (`#/voi`) page, Schema v56.

### Named theory, implemented explicitly

- **Proper scoring rules (Brier 1950; Good 1952).** Multi-class Brier primary composite; strictly proper.
- **Murphy (1973) reliability–resolution–uncertainty decomposition.** Brier = Reliability − Resolution + Uncertainty. Reports all three terms separately.
- **Reliability diagram** in five 20-percentage-point bands `[0,20), [20,40), [40,60), [60,80), [80,100]` with a Wilson (1927) 95% score interval per bin (Clopper–Pearson-style; better than the normal approximation at small samples).
- **Cromwell's rule (Dawid 1982; Lindley).** Probabilities of 0% or 100% are clamped to 5%/95% because 0% and 100% are not claims an honest forecaster can defend.
- **PSI drift detection.** Population Stability Index over the forecast mix between an earlier cohort and a recent cohort (10/10 split), thresholded at 0.1 stable / 0.25 watch / 0.25+ drifted.
- **Tetlock & Gardner (2015) Superforecasting feedback.** Per-band observed hit rates, mean absolute reliability gap, and an over/under verdict that fires when the high-P band (80–100) overshoots by ≥10pp AND the low-P band (0–20) undershoots symmetrically (overconfidence signature) or vice-versa (underconfidence).
- **Platt (1999) / isotonic-style advisory remap.** Per-band "you say X%, history resolves at Y%" table printed for inspection only — never auto-applied.

### Cross-module automation on the shared post-commit spine

Three marker-idempotent rules registered under RULE-LCAL-01..03:

- **RULE-LCAL-01 (Sample entry).** On `voi.scanned` (the event fired when a frame is settled) mark the frame and emit a `calibration.sample-added` event; fire `calibration.verdict-ready` when the usable count crosses the `lcalVerdictSamples` floor (default 10).
- **RULE-LCAL-02 (Drift, computed at read time).** PSI is re-derived on load; no stored state beyond the existing outcomes.
- **RULE-LCAL-03 (EVPI annotation).** On `voi.declared`, if the current verdict is overconfident, append an in-band `notes` entry to the new frame warning that the EVPI ceiling was produced by a distribution the leader's history discounts. **The rule never rewrites declared probabilities.**

### Refusals

- **Counts-only below 5 settled outcomes, verdict withheld below 10.** Calibration cannot be inferred from an anecdote.
- **Per-band verdict withheld below 3 samples** in that band; Wilson intervals shown when scored.
- **No auto-correction of probabilities.** The advisory remap is printed; inputs are never silently rewritten.
- **Per-topic breakdown uses explicit premise tags only**; no topic inference from prose or option labels.
- **Conflicts and anonymous pulses are never read.** Module reads only voiDecisions and premises.
- **Legacy outcomes** (pre-v54 settled frames lacking the frozen probability snapshot) are shown in counts but excluded from the verdict.

### Data model changes (Schema v56, additive)

- `calibrationMarkers: string[]` — append-only marker array for RULE-LCAL idempotency (max 2000 entries, 200 chars each, matching the convention used by `portfolioMarkers`).
- `notes: Array<{at, source, note}>` on voiDecisions — in-band advisory notes; capped at 20 per frame; the calibration engine appends a note when RULE-LCAL-03 fires.
- Five new settings: `lcalMinSamples` (5), `lcalVerdictSamples` (10), `lcalOverconfidencePp` (10), `lcalBadReliability` (0.08), `lcalWarnReliability` (0.04).
- New typed relation `calibrates` registered on the link graph (reserved for future use; current advisory is in-band on the frame's `notes` array rather than a link to a virtual node).

No new entity collection beyond the marker array is required — every calibration figure is re-derived on load from frozen outcomes, matching the "stored figure cannot drift from the record it describes" convention already used for VOI, fidelity, comp, transition and org design.

## Consequences

- Leaders using VOI now see, in the same terminal, not only "how much is this information worth?" but also "how much should I trust my own number?" — a closed-loop feedback system no market tool provides.
- Overconfident verdicts appear in Signals and in the VOI nav badge count, and stamp an in-band advisory on every newly declared frame until the track record improves.
- The calibration curve, advisory remap and Murphy decomposition are printed in the board-ready brief download.
- Drift alerts tell a leader when their forecasting style has shifted between cohorts, so stale calibration feedback is not mistaken for current behaviour.
- Because the rule never auto-adjusts probabilities, the leader can disagree, improve, or disregard the advisory — and the record shows which.
- Real-browser and assistive-technology behaviour of the new Calibration tab remains **[UNVERIFIED]**, as with prior v54+ tabs; the automated test suite asserts pure-domain behaviour, marker idempotency, migration, rule registration and typed-link registration.

## References

- Brier, G. W. (1950). "Verification of forecasts expressed in terms of probability." *Monthly Weather Review* 78(1):1–3.
- Good, I. J. (1952). "Rational decisions." *Journal of the Royal Statistical Society B* 14(1):107–114.
- Murphy, A. H. (1973). "A new vector partition of the probability score." *Journal of Applied Meteorology* 12(4):595–600.
- Wilson, E. B. (1927). "Probable inference, the law of succession, and statistical inference." *JASA* 22(158):209–212.
- Dawid, A. P. (1982). "The well-calibrated Bayesian." *JASA* 77(379):605–610.
- Tetlock, P. E. & Gardner, D. (2015). *Superforecasting: The Art and Science of Prediction.* Crown.
- Platt, J. C. (1999). "Probabilistic outputs for support vector machines…" *Advances in Large Margin Classifiers* 10(3):61–74.
- Bröcker, J. & Smith, L. A. (2007). "Increasing the reliability of reliability diagrams." *Weather and Forecasting* 22(3):651–661.
- Blackwell, D. (1951). "Comparison of experiments." *Proceedings of the Second Berkeley Symposium*:93–102.
