# Runbooks

Every entry follows: **Trigger symptom → Diagnosis → Action → Verification**.
Commands assume you're at the repo root with `DATABASE_URL` set (see
`docs/CONFIG.md`). Replace `psql "$DATABASE_URL"` with your actual
connection method if different.

---

## Degraded database

**Trigger symptom:** `/api/health` → `checks[].id == "database"` is `fail`;
the UI at `/health` shows a red "Database connectivity" card; requests to
any route start returning `500` with `{"error":"internal_error"}`.

**Diagnosis:**
1. `curl -s $APP_URL/api/health | jq '.checks[] | select(.id=="database")'`
   — read the `summary` field; it contains the raw error message.
2. `psql "$DATABASE_URL" -c 'select 1;'` from the app host/container to
   confirm whether Postgres itself is reachable, out of connections, or
   just slow.
3. `psql "$DATABASE_URL" -c "select count(*) from pg_stat_activity;"` to
   check for connection exhaustion.
4. Check the Postgres container/host logs (`docker compose -f
   docker-compose.production.yml logs db --tail=200`) for OOM kills, disk
   full, or crash-restart loops.

**Action:**
- Connection exhaustion: restart the API container
  (`docker compose -f docker-compose.production.yml restart app`) to drop
  its pool and reconnect; the Node `pg.Pool` in `src/db/index.ts` is small
  by default (driver default), so this is rarely the root cause, but it
  rules it out quickly.
- Postgres down/crashed: restart the `db` service
  (`docker compose -f docker-compose.production.yml restart db`); if it
  doesn't come back, check disk space (`df -h`) — a full disk is the most
  common real-world cause.
- Postgres unreachable (network/DNS/firewall): confirm `DATABASE_URL`
  still resolves and the security group/firewall rule allowing the app →
  db path hasn't changed.

**Verification:**
`curl -s $APP_URL/api/health | jq '.checks[] | select(.id=="database").status'`
returns `"ok"`, and `.status` at the top level is `"healthy"` or
`"degraded"` (not `"unhealthy"`).

---

## Stuck automation run

**Trigger symptom:** `/api/health` → `automation_queue` is `warn`/`fail`
(oldest queued/running row has been sitting for ≥5 or ≥30 minutes), or
`automation_freshness` is `warn`/`fail` (no success in ≥24h/≥72h).

**Diagnosis:**
1. `GET /api/automation/runs?limit=20` (or the "Recent automation runs"
   table on `/health`) to see what's stuck and its `status`.
2. `psql "$DATABASE_URL" -c "select id, name, status, queued_at, started_at from automation_runs where status in ('queued','running') order by queued_at;"`

**Action:**
- This build has no real background worker (see the honest-limitation
  comment in `src/app/api/automation/runs/route.ts` — `POST
  /api/automation/runs` runs synchronously end-to-end). So a "stuck" row in
  this codebase almost always means a request died mid-flight (process
  crash/restart between the `running` update and the final update).
  Mark it failed explicitly so it stops counting against queue lag:
  ```sql
  update automation_runs
    set status = 'failed', finished_at = now(), error_message = 'manually closed out — see runbook'
    where id = <id>;
  ```
- If/when a real scheduler is introduced (tracked in `FEATURES.md`), add
  to this runbook: check the worker process logs, confirm it's still
  consuming from its queue, and restart the worker (not the API) first.

**Verification:**
`automation_queue.details.depth` back to the expected baseline and
`automation_freshness.status == "ok"` after the next successful run
(`POST /api/automation/runs` can be used to manually trigger one while
diagnosing).

---

## Projection / read-model rebuild

**Status: not applicable in this build.** There is no event-sourced log or
materialized projection in this working tree — `/api/metrics` and
`/api/health` compute everything on read, directly from `automation_runs`
and `system_meta`, so there is nothing to "rebuild." This entry is kept
here deliberately (rather than deleted) because the mission for this part
calls for it, and because the only table design that would introduce
projections — an append-only event log — is exactly the kind of change
that should land with its own rebuild runbook in the same change.
**When a projection is introduced:** document here (1) how to detect a
stale/corrupt projection (compare a projection's `updated_at`/version
against the source event log's latest sequence number), (2) the rebuild
command, and (3) how to verify row counts/checksums match before cutting
traffic back over.

---

## Backup restore

**Trigger symptom:** data loss/corruption confirmed (bad migration, bad
manual `UPDATE`/`DELETE`, disk failure on the `db` volume).

**Diagnosis:**
1. Confirm the extent of the damage: which tables, how many rows, what
   time window.
2. List available backups: `ls -lh backups/` (see
   `docker-compose.production.yml` → the `db-backup` service writes
   nightly `pg_dump` files there; see `docs/DEPLOYMENT.md`).

**Action:**
1. Put the app in maintenance mode first so nothing writes during the
   restore:
   ```bash
   curl -s -X POST $APP_URL/api/admin/maintenance -H 'content-type: application/json' -d '{"enabled": true}'
   ```
2. Take a fresh dump of the current (bad) state before touching anything,
   in case the restore itself needs undoing:
   `pg_dump "$DATABASE_URL" > backups/pre-restore-$(date +%Y%m%dT%H%M%S).sql`
3. Restore the chosen backup into a **new** database first and sanity
   check it, then point `DATABASE_URL` at it (or restore in place only if
   you've already validated the dump):
   ```bash
   createdb leados_restore_check
   psql leados_restore_check < backups/<chosen-backup>.sql
   psql leados_restore_check -c "select count(*) from automation_runs;"
   ```
4. Once validated, restore into the real database (`dropdb`/`createdb`
   cycle or `pg_restore --clean` depending on dump format), then run
   `npm run db:migrate` to make sure `system_meta.schema_version` matches
   the code currently deployed (a backup from before a migration will be
   behind).

**Verification:**
`/api/health` → `database: ok` and `schema_version: ok`; spot-check row
counts against what you expected from the diagnosis step; turn maintenance
mode back off:
```bash
curl -s -X POST $APP_URL/api/admin/maintenance -H 'content-type: application/json' -d '{"enabled": false}'
```

---

## Schema rollback

**Trigger symptom:** a deploy shipped a schema change (via `npx drizzle-kit
push`) that needs to be undone — e.g. `schema_version: fail` because the
app was rolled back to older code but the DB wasn't, or the new schema
itself is the problem.

**Diagnosis:**
1. `curl -s $APP_URL/api/health | jq '.checks[] | select(.id=="schema_version")'`
   shows `expected` (what the running app wants) vs `recorded` (what the DB
   has).
2. Compare `src/db/schemaVersion.json` between the currently-deployed
   commit and the previous release tag (`git diff <prev-tag> HEAD --
   src/db/schema.ts src/db/schemaVersion.json`).

**Action:**
This project uses `drizzle-kit push` (schema-diffing, not a numbered
migration chain — see `docs/RELEASING.md` "expand/contract" section for
why), so "rollback" means: check out the previous release's
`src/db/schema.ts`, run `npx drizzle-kit push` against it to converge the
DB back to that shape, then run
`node scripts/record-schema-version.mjs` from that same previous commit so
`system_meta.schema_version` matches again. **Only do this for additive
("expand") changes you're sure have no dependent code relying on the new
columns/tables** — dropping a column that newer code still reads from will
break it harder than the original incident.

**Verification:**
`schema_version: ok` on `/api/health`, and the previously-deployed app
version boots and serves traffic normally.

---

## Data export for an investigation

**Trigger symptom:** need a point-in-time, read-only export of
operational data (e.g. for a security review, a customer data request, or
a postmortem).

**Diagnosis:** confirm the exact table(s)/time window needed; exports
should be scoped as narrowly as possible.

**Action:**
```bash
psql "$DATABASE_URL" -c "\copy (select * from automation_runs where queued_at >= '2026-01-01') to 'export-automation-runs.csv' with csv header"
psql "$DATABASE_URL" -c "\copy (select * from system_meta) to 'export-system-meta.csv' with csv header"
```
Store exports outside the repo, encrypt at rest if they leave the host, and
delete them once the investigation closes. Log who requested the export
and why (even just a dated note in your incident tracker) — this build has
no built-in audit log yet (see `FEATURES.md`), so that accountability trail
has to be manual today.

**Verification:** row counts in the CSV match
`select count(*) from <table> where <same filter>;`.

---

## Rotating credentials

**Trigger symptom:** scheduled rotation, or a suspected leak (e.g.
`scripts/scan-secrets.sh` or a provider's leak alert fired).

**Diagnosis:** identify every place the credential is read from — for the
database password, that's `DATABASE_URL` in `.env` (local),
`.env.production.example`/the host's secret store (production), and
nowhere else (it is never hardcoded — enforced by `scripts/scan-secrets.sh`
and by `src/db/index.ts` throwing if `DATABASE_URL` is missing rather than
falling back to a default).

**Action:**
1. Create a new Postgres role/password (or rotate the managed DB's
   credential through your provider).
2. Update the secret in the host's secret manager / `.env` on the server
   (never in git).
3. Roll the `app` container so it picks up the new `DATABASE_URL`:
   `docker compose -f docker-compose.production.yml up -d --force-recreate app`
   — this is a few seconds of dropped connections, not a hard outage,
   because Next.js finishes in-flight requests before exiting (see
   "Maintenance mode & graceful shutdown" below).
4. Revoke/drop the old Postgres role once you've confirmed the app is
   healthy on the new one.
5. If `ERROR_TRACKING_WEBHOOK_URL` or any other secret-bearing env var was
   involved, rotate and redeploy the same way.

**Verification:**
`/api/health` → `database: ok`; confirm the old credential no longer works
(`psql` with the old password should fail to connect).

---

## Maintenance mode & graceful shutdown

**Trigger symptom:** planned maintenance (schema rollback, restore,
credential rotation) needs writes paused; or a deploy/restart needs to
avoid dropping in-flight requests.

**Maintenance mode:**
```bash
curl -s -X POST $APP_URL/api/admin/maintenance -H 'content-type: application/json' -d '{"enabled": true}'
```
This flips `system_meta.maintenance_mode`, which `/api/health` surfaces as
a `warn` on the `maintenance_mode` check (pulling the composite status to
`degraded` even though nothing else is wrong — this is intentional, so
dashboards/alerts visibly show "we did this on purpose"). **Honest gap:**
in this build the flag is informational/health-visible but not yet
enforced by every write route — if you add a route that must refuse writes
during maintenance, check
`GET /api/admin/maintenance` (or query `system_meta` directly) at the top
of the handler. Turn it off the same way with `{"enabled": false}`.

**Graceful shutdown:** `src/instrumentation.ts` registers `SIGTERM`/`SIGINT`
handlers that flip an in-memory flag (`src/lib/health/shutdown.ts`)
immediately, which the `process` health check reports as `warn`. Give the
orchestrator a grace period (`docker-compose.production.yml` sets
`stop_grace_period: 30s`) so Node finishes in-flight HTTP responses before
the process actually exits. **Honest limitation:** this app has no
long-running background worker process to "drain" — all work today
(`POST /api/automation/runs`) completes synchronously within a single HTTP
request, so there is no separate queue consumer that needs a drain
sequence. If a real worker is added later, it must subscribe to the same
`isShuttingDown()` flag and stop pulling new work the moment it flips.

**Verification:** during a restart, `/api/health` briefly shows
`process: warn` with `shuttingDown: true`, then the new instance starts
serving `shuttingDown: false` once it's up; no `5xx` spike should appear in
`/api/metrics` for in-flight requests that started before the signal.
