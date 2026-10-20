# Service Level Objectives

Scope: the API surface that exists in this working tree today — `/`,
`/health`, `/api/health`, `/api/metrics`, `/api/automation/runs`,
`/api/admin/maintenance`. These are deliberately conservative numbers for a
single-instance deployment with no SLA-backed infrastructure yet; tighten
them once real traffic/incident data exists.

## 1. Availability

**Objective:** 99.5% of `/api/health` probes over a rolling 30 days return
HTTP 200 or 503 within the probe timeout (i.e. the process is up and
answering, even if it reports itself "unhealthy"). A probe that times out or
gets a connection refused counts against the objective; a 503 with a body
does not (that's the health system doing its job).

**Error budget:** 99.5% over 30 days ≈ 3h 39m of allowed full downtime
(connection-level failures) per month.

**Measurement:** uptime check against `GET /api/health` from outside the
deployment (not from inside the same container/host). Not yet wired to an
external uptime provider in this repo — see `docs/DEPLOYMENT.md` for where
to add one.

**Alert rule:** page if 3 consecutive external probes (at a 1-minute
interval) fail to connect or time out (>5s).

## 2. Latency

**Objective:** p95 latency for `GET /api/health` and `GET /api/metrics`
under 300ms; p95 for `POST /api/automation/runs` (which does 3 sequential
writes) under 500ms. Measured from `GET /api/metrics` itself
(`routes[].p95Ms`), which is in-process and per-instance — see the
limitation noted in `src/lib/observability/metrics.ts`.

**Error budget:** burn rate alert at 2x the p95 objective sustained for 10
minutes.

**Alert rule:** warn if `p95Ms > 600` for any route for 10 consecutive
minutes of traffic; page if `p95Ms > 1500`.

## 3. Data freshness (automation)

**Objective:** at least one `automation_runs` row reaches `status =
'succeeded'` at least once every 24 hours once the deployment is live
(this is exactly what `checkAutomationFreshness` in
`src/lib/health/checks.ts` evaluates).

**Error budget:** the check already encodes this as two thresholds:
- `warn` at 24h since the last success,
- `fail` at 72h since the last success.

**Alert rule:** page when `/api/health` reports `automation_freshness:
fail`; a `warn` is a ticket, not a page, until there's real automation
traffic to calibrate against.

**Honest caveat:** there is no real background worker in this build (see
`src/app/api/automation/runs/route.ts`), so in production this objective is
aspirational until a real scheduler/orchestrator exists. The check and the
alert rule are real and wired up now so that when a scheduler is added, it
only has to write rows to `automation_runs` — no observability work left to
do.

## 4. Automation / request success rate

**Objective:** error rate (5xx / total) under 1% per route, measured over a
rolling 1-hour window via `GET /api/metrics` → `totals.errorRatePct`.

**Error budget:** 1% of requests per hour. Burn-rate alert: page if
`errorRatePct > 5` sustained for 5 minutes (fast burn), ticket if
`errorRatePct` between 1–5% sustained for 1 hour (slow burn).

## 5. Migration consistency

**Objective:** `schema_version` check (`src/lib/health/checks.ts`) is `ok`
100% of the time outside an active deploy window. A deploy script that
forgets `npm run db:migrate` is a deploy bug, not an infra incident, but the
blast radius is identical, so it gets the same page.

**Alert rule:** page immediately on `schema_version: fail` (critical
dependency) outside a declared deploy window (see
`docs/RELEASING.md`).

## Where these numbers come from

They are starting points chosen to be realistic for a small, single-region,
single-instance deployment with one maintainer — not benchmarked against
real incident history (there isn't any yet). Revisit this document the
first time an objective is missed; see `docs/RUNBOOKS.md` for the response
procedure for each failure mode and `AI-SESSION-LOG.md` for how this
document should evolve alongside real operational data.
