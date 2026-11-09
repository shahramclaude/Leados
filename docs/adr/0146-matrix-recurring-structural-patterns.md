# ADR-0146: Matrix recurring structural-pattern lens

- **Status:** Accepted
- **Date:** 2026-11-09
- **Schema:** v121 unchanged
- **Surface:** `#/matrix?panel=concordance`, matrix brief, CSV scope #108
- **Altitude:** CEO / C-suite primary; the same seat-scoped read is available at every altitude
- **Structure:** matrix; single-chain workspaces remain inert

## Context

ADR-0145 checks each completed decision against the rights active on its subject's matrix lines on that decision date. A per-decision audit can show that a bypass, contested right, unresolved authority or consultation gap occurred, but it does not tell an executive whether the same structural configuration keeps producing the same failure. Repeated friction is a design signal; it must not become a score on the person who appears in the records.

## Decision

Extend the existing decision-right concordance with a pure, identity-free recurrence read model. Its structural signature is the finding kind, the sorted set of active line kinds, and the sorted affected right keys. It counts distinct decisions per signature; one decision contributes at most once to a signature even when several provenance-linked subjects share it. A pattern is recurring only at two or more distinct decisions. Rows are ordered by distinct-decision count, bounded at twelve, and the remainder is counted. The displayed first/last dates describe the contributing decisions.

The view, brief and aggregate CSV use the same computed report. The CSV includes only structural labels, rights, counts and dates—never person, manager, line, decision or case identifiers, participant names, decision titles or rationale. Recurrence is scoped to the acting seat's matrix visibility; out-of-scope subjects are not used to widen a pattern sideways.

## Shared-system boundary

The reader reuses ADR-0145's typed decision-provenance subject resolution, date-specific `buildMatrix`, and the matrix report's `matrixLineScopeFor` / seat scope. It adds no second hierarchy, second event engine, guessed subject, stored derived state or new write path. Its output flows through the existing matrix report, brief and CSV rather than a separate one-off analytics surface. It does not trigger work: a repeated pattern is evidence for a human design review, not authority to rewrite a reporting line or judge a person.

## Reliability identities and limits

The recurrence source unit is a distinct `(decision, structural signature)` observation. `observationN = recurringObservationN + oneOffObservationN`; the bounded queue satisfies `shownPatternsN + remainderN = recurringPatternN`. The read model recomputes from the current decision log, typed graph and the current roster with historical line windows re-evaluated at each decision date. It does not reconstruct historical roster membership, prove causation, or infer that a recurrence is harmful. Repeated signatures are a review prompt, not a rate, benchmark or person rating. Single-chain workspaces have no multi-line findings and therefore no recurrence patterns.

## Consequences

Executives can distinguish a one-off exception from a repeated matrix-design pattern without exposing the people or decisions involved in the aggregate view. Every altitude receives the same logic through its own matrix scope. No schema migration or automation fan-out is necessary because this is a read of existing provenance and hierarchy records; repeated patterns do not mutate the workspace.
