# Deployment

One canonical path: a multi-stage `Dockerfile`, a health-checked
`docker-compose.production.yml`, and `scripts/deploy.sh` that wraps both so
there is exactly one command to run a deploy. No secrets are baked into the
image — `docker-compose.production.yml` injects them at container start via
`env_file`/`environment`, and the `Dockerfile`'s build stage never receives
`DATABASE_URL` or any other secret.

## Quickstart (local, non-Docker)

See `README.md` → "Quickstart" for the 5-command local dev path
(`npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`).
This document covers the containerized/production path.

## One-command deploy

```bash
./scripts/deploy.sh --env=production
```

What it does, in order (read `scripts/deploy.sh` for the exact commands):

1. Builds the production image from the multi-stage `Dockerfile`.
2. Starts/updates the stack via `docker compose -f
   docker-compose.production.yml up -d`.
3. Waits for the `db` service's healthcheck to pass.
4. Runs `npm run db:migrate` *inside* the freshly built app image against
   the running `db` service (expand-only changes — see
   `docs/RELEASING.md`), so migrations always run with the exact
   dependency versions the app was built with.
5. Polls `GET /api/health` on the `app` service until it returns `200`
   (or times out and prints the failing check).

## Staging

See `docs/RELEASING.md` → "Staging environment procedure". Same compose
file, different `.env` (different `DATABASE_URL`/port), run with
`./scripts/deploy.sh --env=staging`.

## Verify a deploy

```bash
curl -s https://<host>/api/health | jq .
curl -s https://<host>/api/metrics | jq .totals
curl -s -X POST https://<host>/api/automation/runs -H 'content-type: application/json' -d '{"name":"post-deploy-smoke-test"}'
```
Expect `status` to be `healthy` (or `degraded` only for expected reasons —
e.g. a fresh install's `automation_freshness: warn` before the first real
run), and the automation-run POST to return `201` with
`run.status == "succeeded"`.

## Rolling back

`docs/RELEASING.md` → "Rollback procedure". In short:
`./scripts/deploy.sh --env=production --tag=vX.Y.Z` for a previous tag.

## Secrets

- Never baked into the image. The `Dockerfile`'s builder stage runs `npm
  run build` with no database connectivity and no secrets in its
  environment (Next.js API routes don't need a live DB at build time in
  this app — `src/db/index.ts` only opens a connection lazily, on first
  query).
- Runtime secrets (`DATABASE_URL`, optionally `ERROR_TRACKING_WEBHOOK_URL`)
  are supplied to the `app` service via `env_file: .env` in
  `docker-compose.production.yml`. Keep that `.env` out of git (see
  `.gitignore`/`scripts/scan-secrets.sh`) and out of the image
  (`.dockerignore` excludes it).
- Rotate via `docs/RUNBOOKS.md` → "Rotating credentials".

## Health-checked compose

`docker-compose.production.yml`:
- `db`: official `postgres:16-alpine`, healthcheck via `pg_isready`.
- `app`: built from the local `Dockerfile`, `depends_on: db: condition:
  service_healthy`, its own healthcheck hits `GET /api/health` inside the
  container, `stop_grace_period: 30s` so `SIGTERM` has time to let
  in-flight requests finish (see `docs/RUNBOOKS.md` → "Maintenance mode &
  graceful shutdown").
- `db-backup`: a sidecar that runs `pg_dump` on a schedule into a mounted
  `./backups` volume (see `docs/RUNBOOKS.md` → "Backup restore"). It's a
  plain shell loop in the compose file, not a separate image, to avoid
  adding another thing to build/maintain for a single-instance deployment.

## What this deployment story does **not** cover (tracked, not hidden)

- Multi-region/multi-instance orchestration (Kubernetes manifests, etc.) —
  out of scope; `docker-compose.production.yml` targets a single host.
- Zero-downtime blue/green deploys — `scripts/deploy.sh` does a
  recreate-in-place of the `app` container with a grace period, which is
  "mostly zero downtime" for a single instance but will drop any request
  that doesn't finish inside `stop_grace_period`. Running two `app`
  replicas behind a load balancer and draining one at a time would close
  this gap; not implemented here.
- Automated staging provisioning (Terraform/etc.) — the staging procedure
  is manual (same compose file, different `.env`).
