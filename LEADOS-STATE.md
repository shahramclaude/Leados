# LeadOS — current program state

**Snapshot:** 2026-10-29. This file describes the repository that is present now; it is not a speculative product brief or a history of work that has not been verified.

## Canonical product

- **Runtime:** `index.html` → native browser modules in `app/**`; a local-first, zero-build application with a separately generated single-file offline build. Records stay in the browser unless the user exports them. There is no application backend or telemetry path in the canonical app.
- **Architecture:** `ARCHITECTURE.md` is the current map. `src/**` and other quarantined trees are legacy/non-canonical; their implementation and old architecture claims are not treated as current behavior.
- **Verification:** `npm run verify:canonical` runs ESLint, the canonical boundary check, internal documentation-link checking and app tests. `npm run verify:standalone` builds the single-file artifact and runs its portability tests.

## Current data and automation

- **Schema v49.** The additive `48 → 49` migration initializes Impact `executionSnapshot` values to `null`. Existing score/evaluation records are preserved; no execution history is reconstructed. Schema v48's additive `47 → 48` migration still adds an empty `propagationLineage` collection without inferring successful history from audit messages or records.
- **Typed relationships.** `app/core/domain/cases.js` is the shared registry for allowed link types, relations, collection owners and destination routes. Destination views accept focused deep links, including encoded IDs, without writing the linked record.
- **Event-driven propagation.** `app/core/domain/postCommit.js` runs synchronous rule effects using savepoints. Successful changed effects can append a bounded, content-free lineage transaction; failed rules continue to use the separate `propagationReceipts` path.
- **Lineage bounds:** at most 250 transactions; 32 rule steps; and 48 targets, new typed edges and emitted event references per transaction. It stores identifiers and type/provenance fields, not titles, notes, score inputs or record bodies. IDs are still workspace data and are not claimed to be anonymous.
- **Privacy/lifecycle:** conflicts and anonymous pulse responses are excluded; candidate-referenced transactions are omitted from redacted exports; `clearDemo` keeps history while scrubbing references to removed records. CSV scope #43 is counts/types-only; a full JSON backup preserves the bounded ledger.

## Current cross-module slice

A committed scorecard can propagate through the existing rule engine into a redesign or calibration decision, owned delegations, a coaching prompt and typed `informs` links. The scorecard remains a frozen source record. The `#/propagation?tab=lineage` view shows successful rule steps and links to the exact typed records. All registered link kinds are tested through resolver/schema round-trips; route-to-view tests exercise selection across the relevant destination screens, including retired scorecards.

The trace records that a rule committed changes. It does **not** prove those changes were effective, establish causality, or support replay. No pre-v48 success history is backfilled.

**Impact execution evidence (v49).** A study may select an exact typed source record. Scoring freezes the count of retained lineage transactions whose root or applied-step event names that exact record from the declared start date through scoring, plus up to 12 trace-navigation references. A real case-created cascade can connect to its downstream decision/delegation/goal/coaching records, while RULE-IMP-01 links the Impact study back to the case. The match is implementation telemetry only: no hit may mean work happened outside LeadOS, triggered no automation or aged out; a hit does not prove delivery, exposure, fidelity, adoption, quality or causal effectiveness. Legacy scored studies show `not-recorded`, not a reconstructed zero.

## Research and decisions

- [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md) records the bounded lineage and typed-navigation decision.
- [ADR-0037](docs/adr/0037-impact-execution-evidence.md) records the typed Impact snapshot decision and why execution counts are not outcome claims.
- `RESEARCH.md` §§74–75 record the 2026-10-29 technical-pattern review and a fresh official-product benchmark. Competitor absence, parity and comparative effectiveness remain **[UNVERIFIED]**.
- `ROADMAP.md` and `AI-SESSION-LOG.md` record what shipped, verification, limits and next work.

## Known limits

- Real-browser assistive-technology behavior and the quarantined legacy tree are not certified by the automated suite.
- The lineage is deliberately partial, capped and local. No event payload replay, distributed tracing service, hosted sync, application backend or automatic compensation is implemented.
- Direct product feature parity was not established by this technical-pattern review; public repository/readme material is not independent proof of product effectiveness.

## Next ambitious bets

1. **Prospective implementation milestones:** let a leader record intended, delivered and verified stages for selected intervention types, with dated owner-evidenced steps—without treating a rule trace as delivery or a proxy for fidelity.
2. **Crash-safe rule outbox:** explicit versioning, retry/deduplication semantics and kill/restart tests, while keeping the current local synchronous model and human gates honest.
3. **Leader-controlled retention/purge:** policy and UI for the bounded lineage window and its effect on snapshot references, exports and historical completeness.
