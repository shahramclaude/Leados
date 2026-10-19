# Configuration Reference

Every environment variable LEADOS reads is listed here. The schema that
enforces this table at runtime lives in `src/lib/platform/env.ts` — if you
add a variable to the app, add it to both places in the same change.

| Variable | Purpose | Required? | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Postgres connection string used by Drizzle (`src/db/index.ts`) for every query in the app, including the repository layer under `src/lib/platform/db`. | **Yes.** The app throws a descriptive startup error and refuses to boot if it is missing or empty — see `src/lib/platform/env.ts`. | `postgresql://postgres:postgres@127.0.0.1:5432/app_db` |
| `NODE_ENV` | Standard Node/Next.js runtime mode flag. Controls whether the Postgres connection pool is cached on the global object across hot reloads (`development`) or created fresh (`production`). | No — defaults to `development`. | `production` |

## Where configuration is loaded

1. `src/lib/platform/env.ts` parses `process.env` through a `zod` schema at
   module load time. Any missing/invalid variable throws immediately with a
   message that points back to this document — there is no scenario where
   the app starts successfully with broken configuration and fails later
   inside a database call.
2. `src/db/index.ts` imports `env` from that module (never raw
   `process.env`) to construct the `pg.Pool` / Drizzle client.
3. Local development reads `.env` (via Next.js's built-in dotenv support).
   Production deployments should set real secrets through the hosting
   platform's environment/secret manager; `.env.production.example`
   documents the shape without real values.

## Adding a new required variable

1. Add it to the `envSchema` object in `src/lib/platform/env.ts`.
2. Add a row to the table above.
3. Add a placeholder line to `.env.production.example`.
4. If it's needed locally, add it to `.env` (not committed with real
   secrets in shared environments).
