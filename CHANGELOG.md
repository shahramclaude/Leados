# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [14.0.0] - 2026-10-20

### Added

- Composite `/api/health` endpoint aggregating six real dependency checks:
  database connectivity, schema-version drift, automation queue depth/lag,
  automation freshness, maintenance mode, and process runtime —
  replacing the single `{ok: true}` placeholder.
- `/health` dashboard page rendering the composite result with
  per-check drill-downs and remediation pointers into `docs/RUNBOOKS.md`.
- `GET /api/metrics` (JSON and `?format=prometheus`): per-route request
  counts, error rates, p50/p95/p99 latency, automation-run outcomes, and
  queue depth. `forecastDrift` is reserved but reports
  `status: "not_implemented"` honestly (no forecasting engine exists yet).
- Structured JSON logging with correlation IDs
  (`src/lib/observability/logger.ts`, `requestContext.ts`), propagated via
  `src/middleware.ts` and `withObservability()`.
- Env-configured error-tracking hook with no vendor SDK
  (`src/lib/observability/errorTracking.ts`,
  `ERROR_TRACKING_WEBHOOK_URL`).
- `automation_runs` and `system_meta` tables (`src/db/schema.ts`), backing
  the health checks above with real, queryable data instead of
  placeholders.
- `POST /api/automation/runs` (synchronous demonstration/test endpoint —
  see ADR-0002) and `GET /api/automation/runs`.
- `POST /api/admin/maintenance` + `GET /api/admin/maintenance`, surfaced in
  the composite health check.
- Graceful shutdown signal handling (`src/instrumentation.ts`,
  `src/lib/health/shutdown.ts`).
- Schema-version drift detection: `src/db/schemaVersion.json`,
  `scripts/record-schema-version.mjs`, wired into `npm run db:migrate`.
- Minimal dependency-free secret scanner: `scripts/scan-secrets.sh`,
  `npm run security:scan`.
- Multi-stage `Dockerfile`, health-checked `docker-compose.production.yml`
  (app + db + nightly backup sidecar), and `scripts/deploy.sh` as the one
  canonical deploy path.
- `.github/workflows/release.yml`: on tag push, runs typecheck/lint/build/
  security scan, builds the production image, and attaches
  `docs/api/openapi.json` to the GitHub Release.
- Documentation: `docs/SLO.md`, `docs/RUNBOOKS.md`, `docs/RELEASING.md`,
  `docs/DEPLOYMENT.md`, `docs/CONFIG.md`, `docs/README.md` (index),
  `docs/adr/` (template + two ADRs), `docs/history/` (provenance notes),
  `docs/api/openapi.json`. Rewrote `README.md`, added `FEATURES.md`,
  `ARCHITECTURE.md`, `CONTRIBUTING.md`.

### Changed

- Renamed the project from `nextjs-postgresql-template` to `leados` in
  `package.json`, and updated `src/app/layout.tsx` metadata and
  `src/app/page.tsx` to reflect LEADOS branding and link to the new health
  surfaces.
- `src/app/api/health/route.ts` now returns the composite payload (see
  Added) instead of `{ok: boolean}`. This is a **breaking** response-shape
  change for any existing caller of that route, which is why this is
  `14.0.0` and not a patch — see `docs/RELEASING.md` version-bump rule.

### Known gaps (tracked, not hidden — see FEATURES.md → Roadmap)

- No auth/session system, event log, orchestrator/agent runtime, decisions/
  findings/metrics-definitions domains, or forecasting/calibration engine
  exist in this working tree.
- `eval:intelligence`, `perf:check`, and `i18n:check` gates referenced in
  the broader LEADOS program brief are not implemented — there is nothing
  yet for them to evaluate. `docs/RELEASING.md`'s checklist lists them
  explicitly as not applicable rather than silently skipping them.
- No automated test suite (unit/integration/e2e) or coverage report exists
  yet; the release workflow does not fabricate one.
- See `docs/adr/0001-scope-given-upstream-repo-state.md` for the full
  reasoning behind this version's scope relative to the broader LEADOS
  program.
