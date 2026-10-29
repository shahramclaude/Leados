# ADR-0038: The Implementation Fidelity Ledger — observed delivery beside attested delivery

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0015](./0015-impact-ledger-preegistered-evaluation.md), [ADR-0035](./0035-scorecard-integrity-lab.md), [ADR-0037](./0037-impact-execution-evidence.md)

## Context

LeadOS could already answer two questions well and had no answer to the one in between.

1. **Outcome:** did the declared metric move, relative to a frozen baseline, enough to pass the pre-registered Impact gates (ADR-0015)?
2. **Execution evidence:** did a retained LeadOS rule transaction name the exact typed record chosen as the intervention source (ADR-0037)?

Neither is delivery. A study can be under-powered, abandoned or never declared; an execution trace can exist for work that reached nobody. The gap is the one implementation science has measured for two decades: **was the intervention delivered as designed — to whom, at what dose, at what quality, and did it keep happening?**

The market comparison is unflattering. Lattice's public analytics page describes its "Adoption Dashboards" as quantifying "the success of your people programs by providing metrics on engagement and utilization of Lattice" — product utilisation, not intervention fidelity. 15Five's public material centres weekly check-in completion. Those are useful operational metrics and they are not the same construct: a team can log every check-in and run none of the practice. A 2025 scoping review of fidelity frameworks found consensus that adherence, dose and quality of delivery sit at the core of fidelity but substantial disagreement about the rest; a 2025 systematic review of 190 school-based programme studies found only 72 (38%) measured any fidelity component at all, with quality-of-delivery measured in 9 (13%) and no component measured at high quality consistently. The field itself under-measures this; management software barely names it.

Two design temptations had to be refused at the start.

- **Auto-derive everything.** Tempting, cheap, and dishonest for stages with no instrument: a plausible-looking proxy for "adaptation" would be an invented number.
- **Ask the leader to rate themselves.** Cheap and dishonest in the other direction: self-report is exactly the instrument whose bias this feature should measure, not reproduce.

The product idea is to do both and **never merge them**.

## Decision

1. **A plan is a declaration with a denominator, made before delivery.** `fidelityPlans` records the intervention type, an optional exact typed source record, an owner, the intended population (1–500; the active roster when omitted), planned units (1–5,000; a cadence suggestion when omitted), and a window of at most 364 days that cannot start in the future. The denominator is captured at declaration because a denominator chosen after the fact is a rationalisation.

2. **Five stages, four of them observable.** Reach (0.25), dose delivered (0.30), delivery quality (0.25), maintenance (0.10), adaptation (0.10). The first four are derived from dated typed records the leader already keeps. Adaptation has no instrument and says so; if it were scored from prose it would be a guess wearing a decimal point.

3. **Instruments are explicit, per intervention type, and never substituted.** 1:1s measure as "held 1:1 carrying written notes"; feedback as "a complete Situation–Behaviour–Impact record"; delegations as "a delegation carrying at least one dated check-in"; goals as "at least one key result that moved off its starting value". An intervention type with no instrument is labelled *no record instrument*; its stages are attested only, and the UI prints that.

4. **Two readings, never averaged.** The observed ratio comes from the records; the attested verdict is a dated human judgement with an author and a note. A verdict that contradicts the records by the declared thresholds (`≥0.8` clearly met, `≤0.5` clearly not met) requires a written reason of at least 12 characters. The disagreement is classified (`concordant`, `optimistic`, `conservative`, `lenient`, `strict`, `mismatched`, `unverifiable`) and displayed, not reconciled away.

5. **Exposure is multiplicative, not an average.** Exposure = reach × dose × quality. A practice delivered to everyone at 40% dose is not 70% delivered, and a weighted mean would say it was.

6. **A grade requires coverage.** Below 60% of the model's weight on record the plan is `insufficient`, which is a refusal to grade, not a low score. That is the reporting gap the literature keeps finding, surfaced as a state instead of a footnote.

7. **Settlement freezes the reading and does work.** Settling stores a frozen snapshot and, through `RULE-FID-01..05` on the existing post-commit spine, opens at most one DACI repair decision, one owned remediation delegation and one blameless 1:1 question — idempotently, inside the same transaction, with typed links in both directions. An overdue checkpoint becomes one owned task per plan, not one per stage.

8. **The Impact intersection is a dilution correction, not a verdict.** When a linked study is scored, `implementationSnapshot` freezes the delivery reading beside the evaluation. The per-complier effect is the ITT estimate divided by measured exposure (Bloom 1984/LATE), and the minimum detectable effect inflates by the same factor — so a study run at 50% exposure was underpowered by construction for the effect it was designed to detect. The adjustment is withheld below 10% exposure, prints its exclusion/monotonicity assumptions, and yields `null` rather than `0` when the evaluation failed to fit. Measured exposure also changes what `RULE-IMP-02` asks: a contradicted study that was materially under-delivered opens a *repair-delivery-or-stop* decision instead of a stop decision.

9. **Calibration is a leader-level statistic, not a person score.** Concordance and over-claim rate carry Wilson 95% intervals and are withheld below three record-verifiable verdicts. They describe plans, never people.

10. **Migration is additive and lifecycle-honest.** `49 → 50` adds an empty `fidelityPlans` collection; no plan, attestation or settlement is invented for existing workspaces, because a backfilled denominator would be a post-hoc denominator. Demo cleanup removes demo plans, keeps declared ones and nulls their pointers without rewriting a frozen settlement. CSV scope #44 exports derived ratios, stage labels and grades only — no plan title, attestation note, person name or record ID.

## Frameworks applied

- **RE-AIM (Glasgow, Vogt & Boles, 1999):** reach, implementation, maintenance. Adoption at setting level is deliberately *not* claimed; a local workspace cannot see eligible adopters it never recorded.
- **Carroll et al. (2007) implementation fidelity:** adherence, dose, quality of delivery — plus adaptation, which the RE-AIM reviews find reported by a minority of studies and which this ledger treats as a first-class scored artefact.
- **Bloom (1984) / Imbens–Angrist LATE:** per-complier effect ≈ ITT ÷ compliance under exclusion and monotonicity. The identity is used as an order-of-magnitude dilution correction with named assumptions, never as a causal estimate: the leader is not randomised.
- **Statistics under small n:** Wilson score intervals instead of the normal approximation; counts below the calibration floor are withheld rather than reported with false precision.
- **Goodhart / Campbell:** each stage prints its own gaming route, because a delivery ratio is a measure and measures get gamed.

## Alternatives considered

- **A field on the Impact study.** Rejected: delivery exists without an evaluation (most interventions are never formally evaluated), it starts before the study window, and burying it inside the study would make the ledger unavailable exactly when it is most needed.
- **Observed-only, no attestation.** Rejected: it would delete the calibration signal, and four instruments cannot cover every practice a leader runs.
- **Attested-only, no derivation.** Rejected: this is what every check-in product already does, and it is the failure mode the feature exists to expose.
- **A weighted mean instead of a product.** Rejected: it flatters partial delivery in exactly the cases that matter.
- **Backfilling plans from existing records.** Rejected: a denominator chosen after delivery measures the story, not the delivery.

## Consequences

**Positive.** Delivery becomes a first-class, gradeable object; the disagreement between memory and records becomes a number with an interval; the Impact Ledger stops reporting dilution-free effects; and a contradicted study can no longer be read as a failed idea when the intervention was never run.

**Negative.** Five constants (coverage floor, exposure floor, agreement thresholds, calibration minimum, sustain window) are conventions, not laws, and are printed on the page rather than hidden. Reach depends on the roster being current. The instruments cover four intervention types only; everything else is attested, and the ledger says so on every such plan. The dilution correction assumes exclusion and monotonicity that a leader's own delivery does not guarantee.

**Explicitly not claimed.** This feature does not measure effectiveness, does not establish causality, does not rate any person, and does not compare LeadOS to any vendor's capability. Competitor absence, parity and comparative effectiveness remain **[UNVERIFIED]**.
