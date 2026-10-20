# Configuration Reference

Every environment variable LEADOS reads, in one place.

| Variable | Purpose | Required? | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Postgres connection string used by Drizzle (`src/db/index.ts`) for every query in the app. | **Yes.** The app throws a descriptive startup error (on first query) if it is missing — see `src/db/index.ts`. | `postgresql://postgres:postgres@127.0.0.1:5432/app_db` |
| `NODE_ENV` | Standard Node/Next.js runtime mode flag. Controls whether the Postgres connection pool is cached on the global object across hot reloads (`development`) or created fresh (`production`). | No — defaults to `development`. | `production` |
| `ERROR_TRACKING_WEBHOOK_URL` | If set, errors captured by `src/lib/observability/errorTracking.ts` are also POSTed here as JSON. No SDK/vendor is required — any endpoint that accepts a JSON POST works. | No. Local logging to stdout always happens regardless. | `https://example.com/ingest/leados-errors` |
| `PORT` | Port the Next.js server listens on. Used by `docker-compose.production.yml` and the `Dockerfile`'s `CMD`. | No — defaults to `3000`. | `3000` |

## Where configuration is loaded

1. `src/db/index.ts` reads `process.env.DATABASE_URL` directly and throws
   if it's empty, before constructing the `pg.Pool`/Drizzle client — there
   is no scenario where the app starts successfully with a missing
   connection string and fails later inside a request.
2. `src/lib/observability/errorTracking.ts` reads
   `process.env.ERROR_TRACKING_WEBHOOK_URL` lazily, per captured error, so
   toggling it doesn't require a restart in environments that reload env
   vars (it does require a restart in this app's current process model,
   since `process.env` is read once per process — restart to pick up a
   change).
3. Local development reads `.env` (via Next.js's built-in dotenv support).
   Production deployments read `.env` via `docker-compose.production.yml`'s
   `env_file:` directive — copy `.env.production.example` to `.env` on the
   host and fill in real values; that file is never committed with real
   secrets (enforced in spirit by `scripts/scan-secrets.sh`).

## Adding a new required variable

1. Read it in the module that needs it (fail fast with a clear error if
   missing — follow the pattern in `src/db/index.ts`).
2. Add a row to the table above.
3. Add a placeholder line to `.env.production.example`.
4. If it's needed locally, add it to `.env` (never with a real production
   secret in a shared sandbox).
