# ADR-0199: Repeatable reads, typed signal identity, and bounded automation recovery

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** LeadOS maintainers (Arena agent implementation)

## Context

The Session-266 evaluation made the three pillars measurable, but the next run
found three narrower defects that measurement alone did not remove:

1. `#/scenarios` re-ran the same seeded comparison and tornado on every paint,
   even when only focus or a query tab changed. The sandbox spec is deliberately
   non-persisted, so a revision-only cache key would have been wrong.
2. The fusion hub inferred an entity from `personId` before looking at the
   destination, and otherwise used the first two route segments verbatim. A
   dependency finding could therefore cluster under its representative person,
   and `#/cases/c1` produced the screen name `cases` rather than the graph type
   `case`. Equal-urgency ties depended on source order.
3. The event spine warned when source-created events exceeded its delivery
   budget, but the reporter had no omitted-event count. A cascade could commit
   with downstream work missing and still read healthy because no rule threw.
   Failure receipts could only be retried one click at a time.

The constraints are unchanged: local-first, zero-build, no network, synchronous
ordered persistence, FIFO cascade order, deny-by-default seat adapters, and no
new stored field or schema migration.

## Decision

Reuse a scenario read only for the same immutable state snapshot, UTC day and
serialized sandbox spec; resolve signal identity from the focused record using
canonical graph types; and make budget exhaustion a measured unhealthy outcome
with a bounded, human-requested receipt-retry batch.

### Efficiency

- `app/core/time.js` parses to a timestamp once and floors UTC days
  arithmetically. It preserves the historical `Date.UTC` behaviour for years
  0–99 and the old extended-year `dayKey` slice. A differential test compares
  thousands of fixed inputs against the previous implementation.
- `app/views/scenarios.js` keeps a per-API `createKeyedMemo` keyed by
  `(state identity, dayKey(now), JSON.stringify(sandboxSpec))`. A committed
  write, a new day, or any lever edit invalidates it. The cached value is the
  exact result of the existing public engines; no simulation is approximated.
- `app/core/perf.js` keeps cumulative totals only for the coarse product lanes
  (`nav.counters`, `scenario.read`, `store:update`). Per-rule samples still use
  the bounded recent-sample ring, so measurement does not add a map update to
  every hot rule invocation.
- Duplicate `carryover`/`cadence` counter calls and duplicate document-title
  keys are removed. The surviving value is the one JavaScript already used.

### Intelligence

- Explicit `(entityType, entityId)` wins; then a canonical focused destination
  (including record query parameters); then `personId` for a person-centric
  finding. Rolled-up groups and filter-only routes are unclustered.
- Cluster keys are JSON pairs of canonical type and id, not colon-delimited
  strings that can collide. Equal-urgency and equal-severity ties have stable
  domain/rule/title/entity tie-breakers. Recommendations follow the same ranked
  leader rather than independently re-sorting by severity.
- Severity and confidence are normalized at the hub boundary; the convergence
  boost remains ordering-only and capped as in ADR-0198.

### Automation

- The post-commit reporter records `budget`, `budgetUsed`, `budgetRemaining`,
  `omittedEvents` and `budgetExhausted`. Source-created events dropped at the
  cap and an emission that rolls its producer back both count as withheld work.
  `automationHealth.ok` is false when either rollbacks or omissions exist.
- `retryPropagationReceipts({ limit })` accepts an integer batch size from 1 to
  25, defaults to 10, reuses the existing single-rule retry transaction, stops
  at the first repeated rule failure or persistence failure, and returns
  attempted/resolved/failed/skipped/remaining counts. It is operator-only: no
  reviewed seat adapter is added, so the existing gateway continues to refuse
  it under a declared seat.
- `#/efficiency` prints withheld events and budget headroom; `#/propagation`
  offers the bounded batch beside the existing per-receipt controls.

## Measurement

`scripts/eval-app.mjs` now detects the router's failure screen instead of
counting it as a rendered route, reports spine time and withheld events beside
commit time, and counts signal families referenced by the canonical insights
engine separately from families observed in the hub. The old registry count was
zero because the shell registers one `insights` source, not one domain per
family.

The paired comparison and its methodology are recorded in
[`reports/eval-app-comparison.json`](../../reports/eval-app-comparison.json).
The headline repeatable result is the warm scenario route: the same seeded
comparison and tornado are reused across unchanged paints. Absolute jsdom
milliseconds are environment-dependent and are not browser claims.

## Alternatives considered

- **Cache scenarios by revision only.** Rejected: the sandbox spec is mutable
  and non-persisted, and the read also depends on the calendar day.
- **Cache every domain report globally.** Rejected for this change: several
  reports are mutated or annotated by views, and a shared cache would need a
  per-report purity audit. The scenario read is already a pure seeded engine
  result and has a local, exact invalidation key.
- **Keep the route segment as the entity type.** Rejected: it splits one record
  into plural-screen and singular-graph clusters.
- **Automatically replay the whole chain or retry in the background.** Rejected:
  it would duplicate successful effects, cross the human-review boundary, and
  change the FIFO/atomicity contract. The batch replays only failed rules and
  stops on the first repeated failure.
- **Raise the event budget.** Rejected: the cap is a safety property. This change
  makes exhaustion visible and recoverable; it does not silently deliver more.

## Consequences

- Unchanged scenario paints avoid re-running Monte Carlo; changed inputs still
  pay the full calculation. Cold first paint is not claimed as solved.
- Signal counts can stay the same while cluster membership becomes more
  accurate. The demo still has 213 signals and 59 observed families; convergence
  is now about typed records rather than representative people or screen names.
- A truncated cascade is no longer reported as healthy. There is still no
  durable receipt for every omitted source event; the warning and counters name
  the loss, and an explicit scan/reviewed replay remains the reconciliation path.
- Batch retry is a convenience over the existing transaction, not a new
  automation policy. It cannot run under a declared seat and never auto-sends,
  auto-commits, or reorders the spine.
- The full canonical suite has pre-existing failures on the base commit. This
  ADR does not claim `verify:canonical` is green; the session log records the
  exact baseline and post-change failure sets.
