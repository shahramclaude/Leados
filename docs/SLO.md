# Service Level Objectives

**Status: no formal SLOs are defined.** This document exists to say that honestly rather than inventing
numbers nobody has validated.

## What exists today

- A single liveness/readiness check: `GET /api/health`, which runs `select 1` against PostgreSQL and
  returns `{ ok: true, service: "leados", version: "0.1.0" }` on success or HTTP 500 with `ok: false` on
  failure (`src/app/api/health/route.ts`). `build_and_start`'s healthcheck step depends on this endpoint.
- No uptime tracking, no latency dashboards, no error-rate budget, and no alerting configuration exist in
  this repository.

## Why no SLOs are published yet

Publishing an SLO (e.g. "p95 < 200ms") without a load test or production traffic history to validate it
would be a fabricated number. `docs/PERFORMANCE.md` documents that no load testing has been performed.
Once real traffic or load-test data exists, this document should be replaced with actual targets and the
real data that justifies them — not before.

## What a future SLO set should probably cover

- Availability of `/api/health` and the dashboard page.
- Scoring latency (`POST /api/leads/:id/score`) since it is the "first insight" moment described in
  `docs/tutorials/first-hour.md`.
- Evidence ledger write durability (no decision should be lost between the scoring/rotation action and the
  `decisions` insert — today these are not wrapped in an explicit transaction, which is a gap worth noting:
  `src/app/api/leads/[id]/score/route.ts` and `src/app/api/rotations/assign/route.ts` perform the primary
  write and the ledger write as two separate statements, not one transaction).
