# LeadOS — current program state

**Snapshot:** 2026-10-29. This file describes the repository that is present now; it is not a speculative product brief or a history of work that has not been verified.

## Canonical product

- **Runtime:** `index.html` → native browser modules in `app/**`; a local-first, zero-build application with a separately generated single-file offline build. Records stay in the browser unless the user exports them. There is no application backend or telemetry path in the canonical app.
- **Architecture:** `ARCHITECTURE.md` is the current map. `src/**` and other quarantined trees are legacy/non-canonical; their implementation and old architecture claims are not treated as current behavior.
- **Verification:** `npm run verify:canonical` runs ESLint, the canonical boundary check, internal documentation-link checking and app tests. `npm run verify:standalone` builds the single-file artifact and runs its portability tests.

## Current data and automation

- **Schema v48.** The additive `47 → 48` migration adds `propagationLineage` as an empty collection. It does not infer successful history from existing audit messages or records.
- **Typed relationships.** `app/core/domain/cases.js` is the shared registry for allowed link types, relations, collection owners and destination routes. Destination views accept focused deep links, including encoded IDs, without writing the linked record.
- **Event-driven propagation.** `app/core/domain/postCommit.js` runs synchronous rule effects using savepoints. Successful changed effects can append a bounded, content-free lineage transaction; failed rules continue to use the separate `propagationReceipts` path.
- **Lineage bounds:** at most 250 transactions; 32 rule steps; and 48 targets, new typed edges and emitted event references per transaction. It stores identifiers and type/provenance fields, not titles, notes, score inputs or record bodies. IDs are still workspace data and are not claimed to be anonymous.
- **Privacy/lifecycle:** conflicts and anonymous pulse responses are excluded; candidate-referenced transactions are omitted from redacted exports; `clearDemo` keeps history while scrubbing references to removed records. CSV scope #43 is counts/types-only; a full JSON backup preserves the bounded ledger.

## Current cross-module slice

A committed scorecard can propagate through the existing rule engine into a redesign or calibration decision, owned delegations, a coaching prompt and typed `informs` links. The scorecard remains a frozen source record. The `#/propagation?tab=lineage` view shows successful rule steps and links to the exact typed records. All registered link kinds are tested through resolver/schema round-trips; route-to-view tests exercise selection across the relevant destination screens, including retired scorecards.

The trace records that a rule committed changes. It does **not** prove those changes were effective, establish causality, or support replay. No pre-v48 success history is backfilled.

## Research and decisions

- [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md) records the design decision and rejected alternatives.
- `RESEARCH.md` §74 records the fresh 2026-10-29 public technical-pattern review and separates architecture benchmarks from direct competitor claims.
- `ROADMAP.md` and `AI-SESSION-LOG.md` record what shipped, verification, limits and next work.

## Known limits

- Real-browser assistive-technology behavior and the quarantined legacy tree are not certified by the automated suite.
- The lineage is deliberately partial, capped and local. No event payload replay, distributed tracing service, hosted sync, application backend or automatic compensation is implemented.
- Direct product feature parity was not established by this technical-pattern review; public repository/readme material is not independent proof of product effectiveness.

## Next ambitious bets

1. A **versioned, crash-safe rule outbox** with explicit retry/deduplication semantics and kill/restart tests—without weakening human gates.
2. A **decision-to-outcome provenance chain** that joins typed execution receipts to pre-registered impact evidence while keeping association separate from causal claims.
3. A **leader-controlled retention and purge policy** for local lineage references, with visible consequences for exports and historical completeness.
