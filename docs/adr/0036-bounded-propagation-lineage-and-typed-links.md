# ADR-0036: Bounded propagation lineage and navigable typed links

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0006](./0006-canonical-zero-build-app.md), [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0026](./0026-propagation-ledger.md), [ADR-0035](./0035-scorecard-integrity-lab.md)

## Context

LeadOS already had a generalized, synchronous post-commit rule engine and a typed cross-module relationship registry. Links could identify related records, and the Propagation Ledger could price the most recent automation run. Neither left a durable account of a *successful* cascade after the live metrics expired. Durable propagation receipts cover failures, not successful writes. Audit prose is not a safe substitute: it does not reliably identify which typed records and edges changed, and parsing it into a history would invent certainty.

The Scorecard Integrity Lab made this gap concrete. A committed scorecard can produce a decision, owned delegations, a coaching prompt and typed provenance links. A leader should be able to follow those exact records from the scorecard and inspect which rule actually changed the workspace, without copying sensitive record text into a second ledger.

## Decision

Extend the existing event-driven architecture; do not replace it with a new runtime or event store.

1. **Persist one bounded transaction for a real success.** When the source event is traceable and at least one rule commits a workspace change or emits a typed event, append a `propagationLineage` row in the same workspace transaction. No-op invocations and rolled-back rules are not represented as successes. Failures continue to use the separate `propagationReceipts` ledger.
2. **Store provenance, not duplicate content.** Each transaction records its source event type and typed ID, workspace revision, timestamp, applied rule steps, step-parent/depth metadata, changed collection names, changed typed record IDs and change kinds, newly added typed edges, and emitted event types. It does not retain titles, summaries, notes, score inputs or record bodies. Conflicts and anonymous pulse records/edges/events are excluded.
3. **Make the trace useful from both directions.** Keep the existing typed-link registry and resolver as the canonical route builder. Destination views select the exact linked record through an encoded route parameter; the trace view links its source and changed records back through the same resolver. Opening a link is navigation, not a write. The `informs` relation gives scorecards explicit provenance to decisions and actions produced from them.
4. **Bound storage and reject unsafe references.** Retain at most 250 transactions, 32 steps per transaction, and 48 targets, links and emitted events per transaction. IDs are not truncated into misleading partial references; values over 80 characters are rejected. Step-parent references must point to an earlier, different step. The UI discloses omissions at the cap.
5. **Migrate additively and do not invent history.** Schema v48 initializes `propagationLineage` to `[]` for earlier workspaces. It does not infer past successes from audit entries or existing records. Normalization is idempotent and content-free.
6. **Honor lifecycle and export boundaries.** Clearing demo data keeps the trace but scrubs references to removed records. Redacted export omits a whole transaction if it references a candidate being removed. CSV scope #43 aggregates by event/rule/module/entity/link types and counts; it exports no transaction-level timestamps, revisions, workspace IDs or free text. A full JSON backup retains the bounded local ledger.

## Alternatives considered

- **Keep only live execution metrics.** Rejected because a run is no longer inspectable after the next write.
- **Copy event payloads, snapshots or rule summaries.** Rejected because this duplicates sensitive workspace content, increases storage without a retention strategy, and makes the trace a second source of truth.
- **Backfill successful history from old audit messages.** Rejected because old entries do not prove a rule committed; migration must not fabricate provenance.
- **Add an external tracing service or distributed workflow runtime.** Rejected for this increment: LeadOS is a local-first, no-network browser application. OpenTelemetry, OpenLineage, Temporal and LangGraph inform the data model and future reliability questions, but are not runtime dependencies or claims of feature parity.
- **Replay or automatically compensate a past cascade.** Deferred. The ledger intentionally has no record bodies or frozen rule executable, so it is not a replay log. Re-execution needs separate idempotency, versioning and human-approval design.

## Consequences

- Leaders can inspect the successful rule-to-record chain and navigate to exact typed destinations. A scorecard commit demonstrates a real cross-module cascade; lineage is not merely a narrative or a forecast.
- History is explicitly partial: only successful effects are retained, and caps can omit later detail. The UI reports those omissions; transient timing and failure retry remain in their existing surfaces.
- Record IDs remain in the local JSON workspace. They are identifiers, not a promise of anonymity. The trace contains no record prose or metric values, and the redacted/CSV boundaries are tested separately.
- A lineage edge proves that a rule wrote that edge; it does **not** prove that the resulting action was effective or caused a later outcome. Outcome evaluation remains a separate human-evidenced responsibility.
- Regression coverage lives in `tests/app/typed-links-lineage.test.mjs` and `tests/app/typed-link-navigation.test.mjs`, including migration/reload, cross-module propagation, privacy, cleanup, URL encoding and destination focus.
