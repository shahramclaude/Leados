# ADR-0037: Typed Impact execution evidence at score time

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0015](./0015-impact-ledger-preegistered-evaluation.md), [ADR-0036](./0036-bounded-propagation-lineage-and-typed-links.md)

## Context

The Impact Ledger already freezes a pre-registered outcome evaluation, and the shared post-commit engine now keeps bounded lineage for successful rule effects. These are different questions:

1. **Outcome:** did the declared metric move enough, relative to its baseline, for the evaluation to pass its statistical gates?
2. **Implementation evidence:** was a successful LeadOS rule transaction retained whose root or applied-step event named the exact workspace record selected as the intervention source?

Without an explicit typed source, a leader can only type a label. Matching that prose to automation summaries would be ambiguous, privacy-expensive and easy to overstate. Conversely, a zero match in a bounded local ledger is not evidence that work did not happen: work may not have triggered a rule, may be outside LeadOS, or may have aged out. An execution receipt cannot establish delivery, exposure, implementation fidelity, adoption, quality or causal effectiveness.

The architectural ambition is a narrow, useful join between the existing event-driven work graph and the existing pre-registered Impact outcome model—not a rewrite, a second event store or another isolated form.

## Decision

Extend the existing local event and Impact paths with a frozen, content-minimal association.

1. **Select an exact typed source when one exists.** The declaration dialog offers records from `LINK_ENTITY_COLLECTIONS` for supported intervention types. Action-layer validation rejects a missing or cross-type ID. A free-text label remains available for team-wide/unrecorded routines, but is never a match key.
2. **Capture a scoring-time snapshot.** When `lockImpactStudy()` commits the evaluation, it also records a versioned `executionSnapshot` in the same store transaction. The join requires exact `entityType + entityId` equality in either the retained root event or an applied rule-step event, with transaction timestamps from `windowStart` through `lockedAt`. A matching target or link alone does not qualify.
3. **Store aggregate counts and bounded navigation references, not record text.** The snapshot freezes status, matching transaction/root/step-event counts, bounded counts of rule steps and changed-target/link/event references, truncation count, ledger size/capacity and up to 12 matching trace IDs. It copies no source title, hypothesis, note, event payload or outcome value. Trace IDs are local navigation pointers, not proof of impact.
4. **Make uncertainty visible.** Status distinguishes `no-record-selected`, `no-matching-retained-trace`, `source-record-missing`, `observed`, and `source-cleared`. The UI explicitly says a non-match is not proof that the work did not occur, and that a match is only recorded successful LeadOS rule propagation. Historical scored studies without a snapshot are shown as `not-recorded`; they are never backfilled.
5. **Keep outcome and execution evidence separate.** The existing Impact verdict/statistical gates do not depend on snapshot status or counts. RULE-IMP-01 continues to create a typed `evaluates` edge; an Impact scoring event cannot enter its own snapshot because snapshot capture precedes post-commit rule execution.
6. **Migrate without changing historical conclusions.** Add schema migration `48 → 49`, initializing execution snapshots to `null`. Preserve existing locked evaluations and do not infer prior matches from old events, labels or existing records. Invalid imported snapshots are discarded rather than recomputed.
7. **Respect lifecycle and export boundaries.** Removing a selected source through demo cleanup clears the source pointer, preserves the frozen counts and marks the snapshot `source-cleared`; trace references inside redacted exports are removed when the referenced lineage row is omitted. The existing Impact CSV scope #32 exports bounded aggregate counts and status only—no source IDs, trace IDs, labels, titles, hypotheses or free text.

## Frameworks applied

- **Implementation fidelity versus outcomes:** Carroll et al.'s implementation-fidelity framework motivates recording what a defined process actually executed separately from its outcome; the 2024 fidelity debate also emphasizes context and flexibility. This snapshot is narrower than full fidelity: it sees successful LeadOS rule propagation, not exposure, quality or adaptation.
- **Causal inference and pre-registration:** the Impact Ledger's existing interrupted-time-series, placebo, pre-trend and falsifiability gates remain the outcome model. A typed execution match is not a treatment-assignment design and does not repair confounding or missing exposure.
- **Reliability engineering:** transactional outbox and idempotency patterns informed the atomicity question, but LeadOS's synchronous browser store is not a distributed queue. This ADR does not add durable crash recovery, replay or worker semantics.
- **Statistics under bounded observation:** retained-lineage absence is treated as unknown/partial, not a negative outcome. Counts have explicit denominators and caps; no unobserved work is silently encoded as zero.
- **Data minimization and Goodhart guardrails:** use a source ID only for exact matching and navigation; export aggregate process counts, not people-level or free-text claims. No individual is scored from the trace.

## Alternatives considered

- **Match free-text labels or event summaries.** Rejected: string similarity is not identity, may expose sensitive prose and would turn ambiguous narratives into false joins.
- **Count every target/link reference as an intervention execution.** Rejected: downstream association is not proof that the source record triggered or participated in the successful event; only exact root/step event references qualify.
- **Backfill old scored studies.** Rejected: historical lineage was not retained in the previous schema, and reconstruction would invent evidence.
- **Make snapshot status a verdict gate or calculate a causal "fidelity score."** Rejected: the event ledger observes only local successful automation and lacks evidence of real-world delivery or exposure.
- **Export trace IDs or source titles in CSV.** Rejected: unnecessary for aggregate analysis and increases re-identification/linkability risk. The JSON workspace still contains the underlying local records and IDs; it is not anonymous.
- **Replace the rule engine or add a workflow platform.** Rejected: the current post-commit spine can provide the needed typed local evidence. A versioned crash-safe outbox remains future work.

## Consequences

- A leader can choose the exact record behind an intervention, inspect the bounded successful propagation associated with it at scoring, and navigate from the study to retained traces and back to the source record.
- A real `case.created` cascade can produce linked decision/delegation/goal/coaching records; scoring a study about that case freezes only the already-retained matching trace. The implementation is tested through the production action and rule spine, not a fabricated view fixture.
- The snapshot is immutable with the scored study and intentionally incomplete. The trace ledger keeps only the latest bounded transactions, and cross-system work is not observed.
- A positive match says a successful LeadOS rule path referenced the selected source. It does **not** say the intervention was delivered, received, adopted, high-quality, effective or causal. A zero match says only that no exact transaction remained in the inspected local ledger at scoring.
- Regression coverage is in [`tests/app/impact-execution.test.mjs`](../../tests/app/impact-execution.test.mjs) for migration, normalization, typed selection, date filtering, bounds, privacy, cleanup, CSV, UI accessibility and a real case-propagation path.
