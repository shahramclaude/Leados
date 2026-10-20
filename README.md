# LEADOS

LEADOS is meant to be an operating system for leadership intelligence. **This
README describes only what exists and has been verified to work in this
working tree today** — not the aspirational full product. For the honest
capability matrix see [`FEATURES.md`](FEATURES.md); for why this is smaller
than you might expect from a casual browse of the broader project, see
[`docs/adr/0001-scope-given-upstream-repo-state.md`](docs/adr/0001-scope-given-upstream-repo-state.md)
and [`docs/history/`](docs/history).

## What's actually here (Part 14 — Observability, Reliability & Release Engineering)

A small, real Next.js (App Router) + PostgreSQL (Drizzle) application whose
entire purpose in this part was to be **production-honest**: one composite
health endpoint backed by real dependency checks, structured logging with
correlation IDs, metrics, documented SLOs, runbooks for real failure modes,
one canonical Docker-based deploy path, and release engineering discipline
(semver, changelog, release checklist, rollback). Nothing here is a stub
that returns a canned "ok."

## Architecture

```mermaid
flowchart TD
    client[Client / curl / browser] -->|x-correlation-id?| mw[src/middleware.ts]
    mw -->|stamps correlation id| route[Route handler\nwithObservability()]
    route --> logger[logger.ts\nJSON stdout logs]
    route --> metrics[metrics.ts\nin-memory counters]
    route --> errtrack[errorTracking.ts\noptional webhook]
    route --> db[(Postgres\nvia Drizzle)]
    db --> runs[automation_runs]
    db --> meta[system_meta]
    health[GET /api/health] --> checks[src/lib/health/checks.ts]
    checks --> db
    healthpage[/health page] --> health
    metricsroute[GET /api/metrics] --> metrics
    metricsroute --> db
```

Layer rules and the reasoning behind each architectural call are in
[`ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/adr/`](docs/adr).

## Quickstart (5 commands)

Requires Node 22+ and a reachable Postgres instance (connection string in
`.env`, see [`docs/CONFIG.md`](docs/CONFIG.md)):

```bash
npm install
npm run db:migrate   # drizzle-kit push + records the schema version
npm run db:seed       # a few sample automation_runs rows so health/metrics aren't empty
npm run dev            # http://localhost:3000
curl -s http://localhost:3000/api/health | jq .
```

Production/Docker path (one command once `.env` exists — copy it from
`.env.production.example` first):

```bash
./scripts/deploy.sh --env=production
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for details.

## Capability matrix

Full table with evidence links: [`FEATURES.md`](FEATURES.md). Summary:

| Area | Status |
| --- | --- |
| Composite health check + dashboard | ✅ live |
| Structured logging, correlation IDs, metrics, error-tracking hook | ✅ live |
| Automation run ledger (demonstration seam, not a real queue) | ✅ live, explicitly scoped |
| Docker build + compose + one-command deploy + nightly backup | ✅ live |
| SLOs, runbooks, release checklist, rollback procedure | ✅ live (documents) |
| Auth, event log, orchestrator/agents, decisions/findings/knowledge domains, forecasting | ❌ not started |
| `eval:intelligence` / `perf:check` / `i18n:check` gates, automated test suite | ❌ not started — nothing exists yet for them to evaluate |

## Route table

| Path | Kind | Notes |
| --- | --- | --- |
| `/` | page | Landing page, links to health surfaces |
| `/health` | page | Human-readable composite health dashboard |
| `/api/health` | API | Composite health check (`200` healthy/degraded, `503` unhealthy) |
| `/api/metrics` | API | Request/latency/error/queue/automation metrics (JSON or `?format=prometheus`) |
| `/api/automation/runs` | API | GET: list recent runs. POST: record one run synchronously (demo/test seam) |
| `/api/admin/maintenance` | API | GET/POST maintenance-mode flag (unauthenticated — see security posture below) |

Machine-readable spec: [`docs/api/openapi.json`](docs/api/openapi.json).

## Security & privacy posture

- **No auth system exists in this build.** Every route above is reachable
  by anyone who can reach the host. Treat `./scripts/deploy.sh`'s output
  as something to put behind a VPN/allowlist/reverse-proxy auth before
  exposing it beyond a trusted network — this is explicitly called out
  again in `docs/DEPLOYMENT.md` and `src/app/api/admin/maintenance/route.ts`.
- **No personal/customer data model exists in this build** — the only
  tables are `automation_runs` (operational metadata) and `system_meta`
  (key/value flags). There is nothing to classify as PII today.
- **Secrets:** never hardcoded; read from `process.env` only
  (`src/db/index.ts`, `src/lib/observability/errorTracking.ts`). Never
  baked into the Docker image (`.dockerignore` excludes `.env*`; the
  `Dockerfile`'s build stage has no database connectivity). Rotation
  procedure: `docs/RUNBOOKS.md` → "Rotating credentials". Scanned for in
  CI: `scripts/scan-secrets.sh` (`npm run security:scan`) — a minimal,
  dependency-free check, not a replacement for a dedicated tool
  (tracked in `FEATURES.md` → Roadmap).
- **Error reporting:** opt-in only, via `ERROR_TRACKING_WEBHOOK_URL`; no
  vendor SDK is bundled, so no telemetry leaves the process unless an
  operator configures it.

## Observability

- Every request gets a correlation id (`x-correlation-id`), generated or
  propagated by `src/middleware.ts`, bound to every log line for that
  request via `AsyncLocalStorage` (`src/lib/observability/requestContext.ts`).
- Logs are single-line JSON on stdout (`src/lib/observability/logger.ts`) —
  pipe to whatever log collector you already run; no vendor lock-in.
- Metrics (`GET /api/metrics`) are in-process and per-instance — see the
  documented limitation in `src/lib/observability/metrics.ts` for what
  that means in a multi-instance deployment.
- SLOs, error budgets, and alert rules: [`docs/SLO.md`](docs/SLO.md).

## Reliability

- `docs/RUNBOOKS.md` covers: degraded database, stuck automation run,
  projection rebuild (marked not-applicable with a reason), backup
  restore, schema rollback, data export for an investigation, rotating
  credentials, and maintenance mode / graceful shutdown.
- Graceful shutdown: `src/instrumentation.ts` + `src/lib/health/shutdown.ts`
  flip a flag on `SIGTERM`/`SIGINT` that the health check surfaces
  immediately; `docker-compose.production.yml` gives the process a 30s
  grace period.

## Release engineering

- [`CHANGELOG.md`](CHANGELOG.md) — Keep a Changelog format.
- [`docs/RELEASING.md`](docs/RELEASING.md) — semver policy, expand/contract
  migration strategy, release checklist, rollback procedure.
- `.github/workflows/release.yml` — on tag push: typecheck, lint, build,
  security scan, apply schema to a scratch Postgres, build the production
  Docker image, attach it and `docs/api/openapi.json` to the GitHub
  Release. (No fabricated coverage report — no test suite with coverage
  instrumentation exists yet.)

## Roadmap

No dedicated team exists yet to assign named owners to; milestones below
are sequenced by dependency, not by date, and should get real
owners/dates attached the moment more than one contributor is working on
this repository.

| Milestone | Depends on | Notes |
| --- | --- | --- |
| M1: Auth & RBAC | — | Needed before anything handles real user/customer data or before `/api/admin/maintenance` can be safely exposed. |
| M2: Real automation worker | M1 (to scope who can trigger it) | Replace the synchronous `POST /api/automation/runs` with an actual queue consumer; schema/health checks already support this (ADR-0002). |
| M3: Event log + first projection | M2 | Only once there's a real producer of events; unlocks the "projection rebuild" runbook that's currently marked not-applicable. |
| M4: Forecasting/calibration engine | M3 | Unlocks real `forecastDrift` values in `/api/metrics` and an `eval:intelligence` gate in `docs/RELEASING.md`. |
| M5: Automated test suite + coverage | any time, ideally before M1 | Currently the single biggest gap for safe iteration speed. |
| M6: Multi-instance deploy | M1–M3 enough traffic to justify it | Closes the gap noted in `docs/DEPLOYMENT.md` → "what this deployment story does not cover." |

## Project layout

```
src/
  app/                       Next.js App Router: pages + API routes (HTTP layer only)
    api/health/route.ts      Composite health endpoint
    api/metrics/route.ts     Metrics endpoint
    api/automation/runs/route.ts
    api/admin/maintenance/route.ts
    health/page.tsx          Health dashboard
    page.tsx, layout.tsx
  middleware.ts              Correlation-id injection (edge-compatible)
  instrumentation.ts         Graceful-shutdown signal handling
  lib/
    observability/           logger, requestContext, metrics, errorTracking, apiHandler
    health/                  types, checks, composite, shutdown
  db/
    schema.ts                Drizzle table definitions
    schemaVersion.json        Hand-bumped schema version, checked at runtime
    index.ts                  Drizzle client / connection pool
scripts/
  seed.mjs                   Idempotent local/dev seed
  record-schema-version.mjs  Writes schemaVersion.json's value into the DB
  scan-secrets.sh             Minimal dependency-free secret scan
  deploy.sh                    One-command deploy
docs/                        SLOs, runbooks, releasing, deployment, config, ADRs, history, index
ARCHITECTURE.md              Layer diagram + dependency rules
FEATURES.md                  Capability matrix (live vs. roadmap)
CONTRIBUTING.md               How to contribute, pre-PR checklist
CHANGELOG.md                  Keep a Changelog
AI-SESSION-LOG.md            Session-by-session change log
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentation index

See [`docs/README.md`](docs/README.md) for every doc in this repo, one
line each on what it covers.
