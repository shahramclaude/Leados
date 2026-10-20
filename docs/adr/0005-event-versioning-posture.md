# ADR-0005: Append-only `event_log` with a per-row version, not full event sourcing (yet)

## Status
Accepted — Part 00.

## Context
This program's later parts (per the standing order's references to `agentLoop`/`agentCycle`/an
autonomous runner) will need an audit trail and, eventually, a reliable history an autonomous agent
can reason over — "what changed, when, and why" — that is sturdier than inferring intent from current
table state. Building full event sourcing (read models rebuilt from a stream, snapshotting,
replay-driven projections) in Part 00 would be speculative: there is exactly one vertical slice
(`organizations` → `leaders`) and no agent loop yet to consume a stream.

## Decision
Add one append-only table, `event_log` (`src/db/schema.ts`), with columns `id`, `event_type`,
`event_version` (text, default `"1"`), `payload` (`jsonb`), `actor`, `created_at`. Every
state-changing use case in `src/lib/app/useCases/**` calls `eventRepository.append()` after its
primary write (`createOrganization` → `organization.created` v1, `registerLeader` →
`leader.registered` v1). The table is the only I/O surface for this decision; there is no event bus,
no subscribers, and no projection/read-model layer yet. `eventRepository.recent()` is read directly
by the dashboard's `getDashboardSummary()` use case as the first (trivial) consumer.

## Consequences
- Every later part gets a free, already-wired audit trail for anything it adds to an existing use
  case, by calling `eventRepository.append()` with a new `eventType`.
- `event_version` exists from day one so a later part can change `leader.registered`'s payload shape
  without silently breaking the ability to read old rows — readers must branch on `eventVersion`,
  not assume the latest shape.
- This is explicitly **not** event sourcing: the `organizations` and `leaders` tables are still the
  source of truth for current state; `event_log` is a secondary, append-only record. If a later part
  needs to rebuild state from events (true event sourcing) or needs ordered, at-least-once delivery
  to external subscribers (a real event bus), that is a new ADR, not an extension of this one.

## Alternatives considered
- **No event log in Part 00; add it when the agent loop needs it.** Rejected: retrofitting event
  emission into every existing use case at the same time a later part is also trying to build the
  consumer is exactly the kind of two-birds change that produces untested code under deadline
  pressure. Emitting from day one costs two lines per use case now.
- **Full event sourcing from Part 00 (state derived entirely from the event stream).** Rejected as
  premature per the Context above — there is no projection consumer yet to justify the complexity,
  and the standing order for this part explicitly scopes repositories to "wrap existing Drizzle
  calls," not redesign persistence strategy.
