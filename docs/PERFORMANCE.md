# Performance

**Status: not measured.** There is no load testing tool, benchmark suite, or performance budget wired
into this repository yet. This document exists so that absence is explicit rather than silent.

## What we know, informally

- Every API route and the dashboard page query PostgreSQL directly and synchronously, with no caching.
- The scoring and rotation engines (`src/lib/scoring.ts`, `src/lib/rotation.ts`) are pure, in-memory
  functions over small arrays (a tenant's rules/reps) — they are not expected to be a bottleneck at small
  scale, but this has not been benchmarked.
- `next build` output (captured during this part) shows all routes as dynamic (`ƒ`) except the 404 page,
  meaning every request does real work server-side; there is no static/ISR caching to fall back on.

## What is explicitly roadmap, not done

- No p50/p95/p99 latency targets exist (see `docs/SLO.md`).
- No load test (k6, autocannon, etc.) has been run against `/api/leads`, `/api/leads/:id/score`, or
  `/api/rotations/assign`.
- No database index review beyond the primary keys and the two explicit unique indexes
  (`tenants.slug`, `rotation_state.tenant_id`) defined in `src/db/schema.ts`.
- No connection pool sizing guidance beyond the `pg.Pool` default used in `src/db/index.ts`.

Until a load test exists, do not trust any performance claim about this codebase that isn't in this file.
