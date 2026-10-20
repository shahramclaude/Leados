# ADR-0002: One composite `/api/health` endpoint, backed by a synchronous automation ledger

- **Status:** accepted
- **Date:** 2026-10-20
- **Deciders:** AI session (SRE/release-manager role for this part)

## Context

The mission calls for consolidating "five health endpoints" into one
coherent model with real dependency checks (db connectivity, migration
version, queue lag, last successful automation run). This working tree
never had five health endpoints or an orchestrator/agent runtime to check
(see ADR-0001). The checks still need to be backed by real data, not
hard-coded "ok" values, or the composite endpoint would be theater.

## Decision

1. Ship **one** `/api/health` route (`src/app/api/health/route.ts`) that
   runs six checks in parallel
   (`src/lib/health/checks.ts`): `database`, `schema_version`,
   `automation_queue`, `automation_freshness`, `maintenance_mode`,
   `process`. Each check reports `ok | warn | fail`, whether it's
   `critical`, a human summary, machine-readable `details`, and a
   `runbook` anchor into `docs/RUNBOOKS.md`.
2. Aggregate to `healthy | degraded | unhealthy`: any critical check
   failing is `unhealthy` (HTTP 503); any non-critical `warn`/`fail` is
   `degraded` (HTTP 200, so a load balancer keeps light traffic flowing
   while paging on the dashboard); otherwise `healthy`.
3. Introduce a minimal `automation_runs` table and a **synchronous**
   `POST /api/automation/runs` endpoint that records a queued → running →
   succeeded/failed lifecycle within a single request/response, explicitly
   documented as a demonstration/test seam, not a real task queue — so the
   `automation_queue`/`automation_freshness` checks have real rows to
   evaluate instead of being permanently empty.
4. Render the same composite payload on a human page at `/health` with
   per-check drill-down and the runbook pointer, satisfying "a single
   Health page rendering all of it with drill-downs and remediation
   hints" without inventing a UI for subsystems that don't exist.

## Alternatives considered

- **Keep health as a single boolean `{ok: true}`.** Rejected: gives
  on-call nothing to diagnose from and doesn't satisfy the mission's
  "coherent diagnostics model."
- **Fabricate brain-health/decision-health/metric-health/rule-health
  endpoints that always return a canned "ok."** Rejected outright — this
  is exactly the "no fabricated results" violation the standing orders
  prohibit. A check that cannot fail does not provide information.
- **Build a real background worker/queue (BullMQ, pg-boss, etc.) for
  automation runs.** Rejected for this part: out of scope (this part is
  about observability/release engineering, not building an orchestrator),
  and would add an unvalidated dependency under a part that's supposed to
  be about hardening, not expanding surface area. Tracked in `FEATURES.md`.

## Consequences

- `/api/health` is genuinely load-bearing: toggling maintenance mode,
  killing the DB connection, or letting an automation run go stale all
  visibly change its output (demonstrated in `AI-SESSION-LOG.md`'s
  verification log).
- The `automation_runs` table and its synchronous endpoint are honestly
  labeled as a seam for a future real scheduler, not a finished feature.
- **Trigger to revisit:** the first time a real background worker exists,
  replace `POST /api/automation/runs`'s synchronous body with an insert
  (`status: 'queued'`) and have the worker perform the `running` →
  `succeeded/failed` transition; the health checks and schema do not need
  to change.
