# Architecture

## Layers

```
src/app/            Next.js App Router: pages + API routes (HTTP layer only)
src/middleware.ts    Edge-compatible correlation-id injection
src/instrumentation.ts  Process boot hook (graceful-shutdown signal handling)
src/lib/observability/  Logging, metrics, error-tracking hook, request context
src/lib/health/      Composite health model: checks, aggregation, shutdown flag
src/db/              Drizzle schema + connection pool
```

Dependency direction is one-way: `src/app/**` may import from `src/lib/**`
and `src/db/**`; `src/lib/health/**` and `src/lib/observability/**` may
import from `src/db/**` but never from `src/app/**`. `src/db/**` imports
nothing from this project except `drizzle-orm`/`pg`. This keeps the health
and observability modules usable from a script or a future worker process
without dragging in Next.js.

## Why one `automation_runs` table instead of a generic event log

An append-only event log (the kind of design referenced in the broader
LEADOS brief) is a legitimate future direction, but it's a bigger
architectural commitment (schema registry, versioned payloads, projections,
a rebuild runbook) than this part's scope — observability and release
engineering — justifies introducing on its own. `automation_runs` is
intentionally narrow: just enough real, queryable state for the health
system's queue-depth and freshness checks to mean something. See
`docs/adr/0002-composite-health-and-synchronous-automation-ledger.md`.

## Why `drizzle-kit push` instead of a numbered migration chain

`push` diffs the schema file against the live database and is simpler for
a single-maintainer project at this stage; the tradeoff (no replayable
migration history, "rollback" means checking out an old schema file and
pushing it again) is documented in `docs/RELEASING.md` and
`docs/RUNBOOKS.md` → "Schema rollback" rather than hidden. Revisit this if
multiple environments need to apply the exact same migration steps in a
guaranteed order (a numbered migration chain, e.g. via `drizzle-kit
generate` + `migrate`, would be the next step).

## Observability data flow

```
client request
   │  (optional) x-correlation-id header
   ▼
middleware.ts  — generates one if missing, stamps it on the request+response
   ▼
route handler, wrapped in withObservability(routeName, handler)
   │  - binds correlation id into AsyncLocalStorage (requestContext.ts)
   │  - every logger.* call picks it up automatically
   │  - records latency + error outcome into metrics.ts (in-memory, per route)
   │  - uncaught errors go through errorTracking.ts (local log always;
   │    optional webhook POST if ERROR_TRACKING_WEBHOOK_URL is set)
   ▼
response, with x-correlation-id header set
```

`GET /api/health` and `GET /api/metrics` both read from this same data
plus the database (`automation_runs`, `system_meta`) — there is no separate
"five endpoints" model; see `docs/adr/0002-...md` for why.
