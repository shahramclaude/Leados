# LeadOS — current program state

**Snapshot:** 2026-10-29. This file describes the repository that is present now; it is not a speculative product brief or a history of work that has not been verified.

## Canonical product

- **Runtime:** `index.html` → native browser modules in `app/**`; a local-first, zero-build application with a separately generated single-file offline build. Records stay in the browser unless the user exports them. There is no application backend or telemetry path in the canonical app.
- **Architecture:** `ARCHITECTURE.md` is the current map. `src/**` and other quarantined trees are legacy/non-canonical; their implementation and old architecture claims are not treated as current behavior.
- **Verification:** `npm run verify:canonical` runs ESLint, the canonical boundary check, internal documentation-link checking and app tests. `npm run verify:standalone` builds the single-file artifact and runs its portability tests.

## Current data and automation

- **Schema v51.** The additive `50 → 51` migration adds four empty pay collections (`payBands`, `payAssignments`, `payAudits`, `meritRounds`) and two null attestation dates. Nothing is invented: a band reconstructed from today's salaries would manufacture the range it is then used to judge.
- **Schema v50.** The additive `49 → 50` migration adds an empty `fidelityPlans` collection: no plan, attestation or settlement is invented for an existing workspace, because a denominator chosen after delivery is post-hoc. Schema v49's additive `48 → 49` migration still initializes Impact `executionSnapshot` values to `null`, and Schema v48's still adds an empty `propagationLineage`.
- **Typed relationships.** `app/core/domain/cases.js` is the shared registry for allowed link types, relations, collection owners and destination routes. Destination views accept focused deep links, including encoded IDs, without writing the linked record.
- **Event-driven propagation.** `app/core/domain/postCommit.js` runs synchronous rule effects using savepoints. Successful changed effects can append a bounded, content-free lineage transaction; failed rules continue to use the separate `propagationReceipts` path. Every registered rule declares its purpose and writes in `app/core/domain/propagationContracts.js`, and the contracts test fails when an unregistered rule joins the chain.
- **Lineage bounds:** at most 250 transactions; 32 rule steps; and 48 targets, new typed edges and emitted event references per transaction. It stores identifiers and type/provenance fields, not titles, notes, score inputs or record bodies. IDs are still workspace data and are not claimed to be anonymous.
- **Privacy/lifecycle:** conflicts and anonymous pulse responses are excluded; candidate-referenced transactions are omitted from redacted exports; `clearDemo` keeps history while scrubbing references to removed records. CSV scope #43 is counts/types-only; a full JSON backup preserves the bounded ledger.

## Current cross-module slice

A committed scorecard can propagate through the existing rule engine into a redesign or calibration decision, owned delegations, a coaching prompt and typed `informs` links. The scorecard remains a frozen source record. The `#/propagation?tab=lineage` view shows successful rule steps and links to the exact typed records. All registered link kinds are tested through resolver/schema round-trips; route-to-view tests exercise selection across the relevant destination screens, including retired scorecards.

The trace records that a rule committed changes. It does **not** prove those changes were effective, establish causality, or support replay. No pre-v48 success history is backfilled.

**Implementation fidelity (v50).** A leader declares an implementation plan *before* delivery: intervention type, an optional exact typed source record, owner, intended population, planned units and a window of at most 364 days. Five stages are scored — reach (0.25), dose (0.30), delivery quality (0.25), maintenance (0.10) and adaptation (0.10). Four are derived from dated typed records with an explicit standard (1:1 holding written notes, SBI-complete feedback, a delegation carrying a dated check-in, a key result that moved); adaptation has no instrument and is attested only, and the UI says so instead of substituting a proxy. Exposure is **multiplicative** (reach × dose × quality), never a weighted mean, and a plan whose evidence covers less than 60% of the model's weight is `insufficient` rather than low — a refusal to grade. The second reading is a dated human attestation; a verdict that contradicts the records requires a written reason and is classified as optimistic, conservative, lenient, strict or mismatched. Across plans that becomes a leader-level calibration statistic with a Wilson 95% interval, withheld below three verdicts.

`RULE-FID-01..05` run on the same spine: typed `measures-delivery` links, a disagreement prompt, one repair decision plus one owned delegation per materially under-delivered settlement, one owned task per plan for overdue checkpoints, and a frozen `implementationSnapshot` when a linked Impact study is scored. That snapshot prints ITT, the Bloom/LATE per-complier estimate and the inflated MDE together, and yields `null` — never `0` — when the evaluation could not fit. `RULE-IMP-02` now reads measured exposure: a contradicted but materially under-delivered study opens *repair delivery or stop on a weak test* instead of a stop decision. The `#/fidelity` page, CSV scope #44 (derived telemetry only) and the `Implementation fidelity` Insights bucket complete the slice.

**Impact execution evidence (v49).** A study may select an exact typed source record. Scoring freezes the count of retained lineage transactions whose root or applied-step event names that exact record from the declared start date through scoring, plus up to 12 trace-navigation references. A real case-created cascade can connect to its downstream decision/delegation/goal/coaching records, while RULE-IMP-01 links the Impact study back to the case. The match is implementation telemetry only: no hit may mean work happened outside LeadOS, triggered no automation or aged out; a hit does not prove delivery, exposure, fidelity, adoption, quality or causal effectiveness. Legacy scored studies show `not-recorded`, not a reconstructed zero.

## Pay architecture and equity (v51)

Pay is held locally in the browser and never converted between currencies. `payAssignments` is an append-only dated ledger — the current rate is derived, never overwritten — and a band is looked up from family × level × currency, so a placement that has no band is reported as unbanded rather than attached to the nearest range. Placement yields compa-ratio, range penetration and one of five statuses, and every active person is listed so a missing record is a coverage gap, not a zero.

The equity model is `ln(pay) = a + b·group + controls` fitted by OLS on the leader's declared controls (level, role family, tenure), reported with a classical 95% interval, residual degrees of freedom, R² and a two-sided p-value. It refuses to publish a coefficient below eight comparable people, below three per group, or where a requested control is singular on the cohort (an explicit fallback ladder records what was tried and what was used). Filing freezes the snapshot; later corrections cannot rewrite it and a filed audit cannot be deleted. `RULE-PAY-01..05` turn a filing into one joint-assessment decision plus the owned criteria task, one structural remediation decision, per-person placement work, the fairness decision a widening merit round implies, and one blameless 1:1 prompt on a large single-step change. No rule adjusts anyone's pay, rates a person or sends anything.

Two mechanics of Directive (EU) 2023/970 are modelled because they are computable from these records: the quartile distribution and the 5% joint-pay-assessment threshold on a category of workers. A gender-neutral job evaluation and a pay-information route are recorded as dated leader attestations and labelled as such. **This is not a compliance certificate**, the adjusted figure is not a finding of discrimination, and per-category differences are within-level and unadjusted — which the page prints where they appear. CSV scope #45 exports opaque-coded model output only.

## Research and decisions

- [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md) records the bounded lineage and typed-navigation decision.
- [ADR-0037](docs/adr/0037-impact-execution-evidence.md) records the typed Impact snapshot decision and why execution counts are not outcome claims.
- [ADR-0039](docs/adr/0039-pay-architecture-and-equity-terminal.md) records the pay decision: append-only dated pay, derived placement, a model with explicit refusals, filing that freezes, projections that re-fit, and why the terminal never adjusts anyone's pay.
- [ADR-0038](docs/adr/0038-implementation-fidelity-ledger.md) records the fidelity-ledger decision: declared denominators, record-derived delivery beside attested judgement, and why the dilution correction is not a causal estimate.
- `RESEARCH.md` §§74–76 record the 2026-10-29 technical-pattern review and two fresh public benchmarks. Competitor absence, parity and comparative effectiveness remain **[UNVERIFIED]**.
- `ROADMAP.md` and `AI-SESSION-LOG.md` record what shipped, verification, limits and next work.

## Known limits

- Real-browser assistive-technology behavior and the quarantined legacy tree are not certified by the automated suite.
- The lineage is deliberately partial, capped and local. No event payload replay, distributed tracing service, hosted sync, application backend or automatic compensation is implemented.
- Direct product feature parity was not established by this technical-pattern review; public repository/readme material is not independent proof of product effectiveness.

## Next ambitious bets

0. **Pay: a second, independent estimator.** An Oaxaca–Blinder decomposition beside the regression so the explained and unexplained components are separated explicitly, and a matched-cohort check that does not depend on the functional form at all.
1. **Prospective implementation milestones:** let a leader record intended, delivered and verified stages for selected intervention types, with dated owner-evidenced steps—without treating a rule trace as delivery or a proxy for fidelity.
2. **Crash-safe rule outbox:** explicit versioning, retry/deduplication semantics and kill/restart tests, while keeping the current local synchronous model and human gates honest.
3. **Leader-controlled retention/purge:** policy and UI for the bounded lineage window and its effect on snapshot references, exports and historical completeness.
