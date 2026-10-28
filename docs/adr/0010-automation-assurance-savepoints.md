# ADR-0010 — Post-commit savepoints and automation assurance

Date: 2026-10-27. Status: accepted, updated 2026-10-28 by ADR-0025. The original
savepoint design was additive to ADR-0008 in v32; current schema is v40.

## Observed problem

`runPostCommitRules` caught an exception and logged it but passed the live draft to each
rule. A throwing rule could therefore leave half its fan-out in the saved transaction,
including success audit events. Catch-and-continue was not isolation.

## Decision

Each synchronous post-commit rule receives a JSON clone of the last successful draft.
Its log events and warnings are buffered. Successful return publishes candidate state,
then success logs, before the next rule. Exception discards the candidate and buffers;
the named failure is appended through the existing store logger. Results from failed
rules are never returned. This matches the existing store's JSON-only persistence contract.

Rules remain ordered: downstream timing rules must see decisions created by earlier rules.
“Parallel” module fan-out means one atomic source transaction, not concurrent mutation of
shared state. No network, dependency, storage migration or framework change is introduced.
ID factories can advance on failure; gaps are expected, not a correctness error. Rule
callbacks must be synchronous and perform no external effects. A faulty logger or
non-JSON state is outside the supported store contract.

The Control Room consumes a pure operational graph projection. Invalid endpoints and
relations are diagnosed; duplicate directed typed relationships are deduplicated. Only
allowlisted entity types are resolved. Confidential links are silently excluded before
resolution. Shortest paths use breadth-first search and explicitly mark reverse traversal.
They are evidence trails, never a causal dependency simulation.

Case rehearsal clones state and invokes the same post-commit runner with a
`case.automation.refresh` event, injected clock and collision-checked disposable IDs. It returns collection deltas,
per-rule traces and redacted event categories, never a commit-ready state snapshot. Live
refresh recomputes from the latest store; it does not install preview data. This avoids
stale snapshot overwrite. Human approval to send comms is unchanged.

## Costs and limits

- JSON cloning per rule adds O(rules × workspace size) synchronous work and transient memory.
  Worker-backed execution and selective savepoints require future architecture work.
- Some action-level automation remains outside individual rule savepoints. Case creation
  and targeted refresh now use a shared lifecycle subscriber, but rehearsal is not historical
  event sourcing and cannot reproduce every source-action side effect. The bounded event queue
  and retry limitations are specified in ADR-0025.
- Historical retained failure counts do not indicate unresolved status or completeness.
- Explorer includes only linked valid operational endpoints, not every workspace record.
- The store's existing persistence warnings remain authoritative; in-memory commit does not
  imply successful disk persistence, particularly for encrypted/asynchronous saves.
- No automatic graph repair: deletion would destroy evidence without domain-specific intent.

## Verification

`tests/app/assurance.test.mjs` covers injected failures and continuation, actual store reload,
shortest/reverse paths, cycles, duplicates and invalid links, privacy exclusion, deterministic
zero-write rehearsal, actual comms/link reconstruction, idempotence, UI interaction and axe
accessibility (colour contrast disabled because JSDOM has no layout engine). Full browser
visual/contrast testing and very-large-workspace interaction timing remain unverified.
