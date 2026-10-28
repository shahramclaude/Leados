# ADR-0024: Early-Warning Watch — false-discovery control, a measured alarm budget, and no automation without a verdict

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decision owners:** LeadOS product/engineering
- **Related:** ADR-0008 (post-commit rules), ADR-0015 (Impact Ledger pre-registration), ADR-0022 (System Dynamics), ADR-0023 (Structural Capital Allocation)

## Context

Session 56 added an honest but inert control chart: one reconstructed weekly series with
Shewhart limits and an explicit refusal to forecast. Everything about the surface was
correct and nothing about it was useful — a leader could see a special cause and no other
part of the product knew it had happened.

Meanwhile the disciplines that live or die by alerting have converged on three findings
that no leadership product has applied:

1. **A single chart is not surveillance.** A leader who watches a dozen series is running
   a dozen statistical tests per period. At a per-chart α of 0.0027 per point nothing goes
   wrong, but the runs and cluster rules are not that rare, and the family-wise chance of at
   least one false alarm per period rises quickly with m. Genomics and robust anomaly
   detection solved this with false-discovery-rate control (Benjamini & Hochberg, 1995);
   alerting tools largely did not.
2. **Alert precision is the binding constraint, and almost nobody measures it.** Published
   operations figures put roughly half of production security alerts in the false-positive
   bucket, with practitioners reporting tens of percent of alerts going unaddressed; the
   alert-fatigue literature is explicit that the ratio, not the volume, is what destroys a
   detector's credibility. Clinical early-warning work makes the same point quantitatively:
   a high-AUROC model with a 10–11% positive predictive value produces almost no action.
3. **Automating on a statistical signal is how a product loses trust.** The base rate of
   most operational events is low, so a detector tuned for coverage is wrong most of the
   time by arithmetic, not by bad engineering. Any irreversible action taken automatically
   on that basis imports the error rate into the organisation's work queue.

LeadOS is local-first, single-user, and entirely derived from records a leader typed. It
cannot observe people and must not pretend to. What it *can* do is run the statistics
properly, publish the constants, freeze its own predictions before the fact, and let a
human judgement be the only thing that creates work.

## Decision

Schema v39 adds two append-only collections and one post-commit rule with five rule ids.

- `watchAlerts` — every candidate the scan produced, promoted **and** suppressed, plus the
  one-way human verdict. A suppressed row carries its reason (`budget`, `cooldown`,
  `noisy-series`), so throttling is visible rather than calm.
- `watchForecasts` — one frozen next-week prediction per series per day
  (`point`, `lo`, `hi`, `baselinePoint`, `sigma`, `dueOn`, `method`). **Skill is not
  stored**; it is derived at read time from the reconstructed series, so a stored figure can
  never drift from the data it claims to describe. The ledger is capped at 240 rows.
- `RULE-EW-00..04` on the existing generalized post-commit spine (ADR-0008), registered
  upstream of Decision Tempo so a triage decision receives its timing position inside the
  same atomic transaction.

**Detection.** Twelve series are reconstructed by `vitals.js` — the same read model the rest
of the product already uses, so the two surfaces cannot disagree. Each is tested with the
existing XmR engine. The p value entering the scan is the strongest of the four Shewhart
rules on the latest measured point, Bonferroni-inflated by four for the rules tested on that
chart. The α of each rule is computed from its own null model and exported:
`beyond-limit` and `range-spike` = 2(1−Φ(3)) ≈ 0.0027 (the moving-range case is labelled a
normal approximation, because the MR distribution is skewed), `near-limit-cluster` =
binomial tail for 3 of 4 beyond 2σ, `sustained-shift` = 0.5⁷. A scan-level
Benjamini–Hochberg step-up at the leader's declared q then decides which series may alert;
*m*, the cutoff, the rejected set and the expected number of false discoveries are printed.
Only adverse signals that survive the step-up are promoted. Nothing is promoted from a chart
without limits, and a bucket with no contributing record is a gap that is never interpolated.

**Honest reporting.** Every frozen prediction is scored out of sample as
1 − |model error| / |naive error| against naive persistence (the "next week looks like this
week" rule). Below three scored predictions the counts are shown and every aggregate
(mean skill, MAE, direction accuracy) is withheld. Alert precision counts only `confirmed`
and `false-alarm`, because `explained` and `dismissed` are not claims about the statistics;
it is reported as a Wilson (1927) score interval at n ≥ 3, and a precision below 50% is
labelled *badly tuned*.

**Governors.** A rolling alert budget (default 4 per 28 days), a per-series cooldown
(default 14 days) and a noisy-series demotion (2 false alarms in 90 days) each stop a real
signal from reaching the leader — and each writes a `suppressed` row. A demoted series still
counts in *m*, the honest denominator.

**Response.** A p value creates nothing. `confirmed` opens exactly one operational case with
the statistics frozen into its summary and a typed `escalates-from` edge, after which the
existing case engine cascades normally. An alert past the triage deadline opens exactly one
four-option DACI decision. Budget exhaustion opens exactly one monitoring-scope decision per
window. Measured precision below tolerance opens exactly one re-tuning decision per quarter.
Every rule is idempotent by marker and every verdict is one-way, so the precision record
cannot be retro-fitted.

**Export.** CSV scope #40 emits opaque alert codes, the fixed series vocabulary, the
statistics, the frozen prediction and its realised errors. No summaries, no verdict notes,
no free text, no people.

## Consequences

- LeadOS can now say "this changed, and here is how often my saying that has been right",
  which is a different claim from "here is a chart".
- The demo workspace reports a *negative* forecast skill (−3.26 over 21 scored predictions)
  and a counts-only precision record. That is the honest output of a centre-line model on
  autocorrelated weekly series, and it is reported as such (EW-05) rather than tuned away.
- Benjamini–Hochberg assumes independence or positive dependence. Series derived from the
  same records are correlated, so the true FDR can exceed the target; this is stated on the
  page and in the brief instead of being papered over with a Bonferroni correction that would
  make the detector useless.
- XmR limits are in-sample and a level shift contaminates the centre line: this is a
  screening device, not a process model, and the brief says so.
- Twelve series × one scan per commit is cheap (milliseconds, pure functions), but the
  ledger is bounded and normalised on load so an old workspace cannot grow without limit.

## Verification

`tests/app/early-warning.test.mjs` — 30 tests: the normal tail and exact binomial tail
against published values, the exported α table recomputed from its own null models,
hand-computed Benjamini–Hochberg rejections and ties, the published Wilson 3-of-4 interval,
hand-computed skill (−0.6667, and withheld when naive is exact), counts-only pooling below the
floor, precision accounting that excludes explained/dismissed, the real demo scan (m,
rejections, adverse-only promotion), the additive v38→v39 migration and six normaliser
repairs that each fail in the *honest* direction, the real store cascade (one case, one typed
edge, idempotent rescans, one-way verdicts), the budget/cooldown/noisy governors, the stale
escalation, the pause switch, signals and Insights, CSV scope #40 opacity, brief determinism,
and JSDOM + axe across all five tabs plus the verdict dialog end to end.
