# Feature registry

Source of truth for what's live vs. planned. Every "live" row links to the
file(s) that implement it; every row was verified by running the app
against a real Postgres instance during this session (see
`AI-SESSION-LOG.md` → Verification log), not just by reading the code.

## Live

| Capability | Status | Evidence |
| --- | --- | --- |
| Next.js App Router app, single canonical entry point | live | `src/app/**`, no competing root app |
| Postgres via Drizzle | live | `src/db/index.ts`, `src/db/schema.ts` |
| Composite health check (db, schema version, automation queue/freshness, maintenance mode, process) | live | `src/lib/health/**`, `src/app/api/health/route.ts` |
| Health dashboard with per-check drill-down + remediation hints | live | `src/app/health/page.tsx` |
| Structured JSON logging with correlation IDs | live | `src/lib/observability/logger.ts`, `src/lib/observability/requestContext.ts`, `src/middleware.ts` |
| Request metrics (latency p50/p95/p99, error rate, per route) | live | `src/lib/observability/metrics.ts`, `src/app/api/metrics/route.ts` |
| Prometheus-format metrics export | live | `GET /api/metrics?format=prometheus` |
| Error-tracking hook, env-configured, no vendor SDK | live | `src/lib/observability/errorTracking.ts` |
| Automation run ledger (demonstration/test seam — synchronous, not a real queue) | live | `src/db/schema.ts` (`automationRuns`), `src/app/api/automation/runs/route.ts` |
| Maintenance mode flag, surfaced in health | live | `src/app/api/admin/maintenance/route.ts` |
| Graceful shutdown signal handling | live | `src/instrumentation.ts`, `src/lib/health/shutdown.ts` |
| Schema-version drift detection | live | `src/db/schemaVersion.json`, `scripts/record-schema-version.mjs`, `checkSchemaVersion` |
| Dependency-free secret scan gate | live | `scripts/scan-secrets.sh`, `npm run security:scan` |
| Multi-stage Docker build, health-checked compose, nightly backup sidecar | live | `Dockerfile`, `docker-compose.production.yml` |
| One-command deploy script (build + migrate + health-poll) | live | `scripts/deploy.sh` |
| GitHub Actions release workflow (build image, attach OpenAPI spec) | live | `.github/workflows/release.yml` |
| SLOs with error budgets and alert rules | live (as a policy document) | `docs/SLO.md` |
| Runbooks for degraded DB, stuck automation, backup restore, schema rollback, data export, credential rotation, maintenance/shutdown | live | `docs/RUNBOOKS.md` |
| Release checklist, expand/contract migration policy, rollback procedure | live | `docs/RELEASING.md` |

## Roadmap (not implemented — do not assume these exist)

| Capability | Status | Notes |
| --- | --- | --- |
| Auth / sessions / RBAC | not started | No `users`/`sessions` tables or login routes in this tree. |
| Event log / event sourcing | not started | `automation_runs` is a flat ledger, not an append-only event log; no projections to rebuild. |
| Orchestrator / agent runtime | not started | `POST /api/automation/runs` is synchronous and explicitly a demonstration seam (see ADR-0002), not a real worker/queue. |
| Decisions, findings, metrics-definitions, knowledge graph, financial/strategy domains | not started | None of these tables or routes exist in this tree. |
| Forecasting / calibration engine | not started | `GET /api/metrics` reserves a `forecastDrift` field that always reports `status: "not_implemented"` rather than a fabricated number. |
| `eval:intelligence`, `perf:check`, `i18n:check` gates | not started | No corresponding engines exist yet to evaluate; not wired into `package.json` or `docs/RELEASING.md`'s checklist as pass/fail gates — explicitly listed there as "tracked, not skipped silently." |
| Automated test suite (unit/integration/e2e) with coverage | not started | No test runner is configured. The release workflow does not fabricate a coverage report. |
| Dedicated secret-scanning tool (gitleaks/trufflehog) | not started | `scripts/scan-secrets.sh` is a minimal stand-in, documented as such. |
| Multi-instance / zero-downtime deploys | not started | `docker-compose.production.yml` targets a single `app` replica; see `docs/DEPLOYMENT.md` → "What this deployment story does not cover." |

See `docs/adr/0001-scope-given-upstream-repo-state.md` for why this list is
smaller than a casual look at the `shahramclaude/Leados` GitHub repository
might suggest.
