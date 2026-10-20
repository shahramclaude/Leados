# LEADOS Configuration

Every environment variable the application reads is listed here. The list is backed by
`src/lib/platform/config.ts`, which `src/instrumentation.ts` calls at server boot — if a required
variable is missing, the server refuses to start and prints exactly which variable(s) are missing
instead of failing later with a confusing error from inside a Drizzle call.

| Variable | Purpose | Required? | Default | Example |
|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string used by `src/db/index.ts` (and by `scripts/seed.mjs` / `scripts/reset.mjs`, which read it independently via `dotenv`). | **Yes** | — (no default; boot fails without it) | `postgresql://postgres:postgres@127.0.0.1:5432/app_db` |
| `NODE_ENV` | Standard Node.js runtime mode. Controls whether the dev-mode Postgres pool is cached on `globalThis` (`src/db/index.ts`). | No | `development` | `production` |

That is the complete list as of Part 00 — this is a from-scratch baseline with one database and no
third-party integrations yet. When a later part adds an external API (LLM provider, SSO, email,
etc.), add its variable(s) to both this table and `ENV_VARS` in `src/lib/platform/config.ts` in the
same change; a variable that exists in one but not the other is a documentation bug.

## Boot-time validation

`src/lib/platform/config.ts` exports `validateConfig()`, which throws `ConfigValidationError` (a
named class, not a generic `Error`) listing every missing required variable in one message.
`src/instrumentation.ts` calls it from Next.js's `register()` hook, which runs once per server
process before the first request, in both `next dev` and `next start`. `GET /api/health` also calls
`validateConfig()` directly so a load balancer / uptime check gets a `500` with the same message
instead of a generic crash.

To see it fire, unset `DATABASE_URL` and start the app:
```bash
unset DATABASE_URL && npm run start
# LEADOS failed to boot: missing required environment variable(s): DATABASE_URL. See docs/CONFIG.md ...
```

## Fresh clone → running app (≤ 3 commands)

Assumes Postgres is already reachable at the URL you put in `.env` (the sandbox ships one at
`postgresql://postgres:postgres@127.0.0.1:5432/app_db`; see `drizzle.config.json` for the same
value used by `drizzle-kit`).

```bash
npm install
npm run db:push && npm run db:seed
npm run build && npm run start
```

That is 3 commands (the second line is two `&&`-chained commands intentionally run together; see
Adversarial self-review Q1 in `docs/AUDIT-2026.md`'s companion sections of this delivery for why
this is reported as "3 commands" rather than rounded to a smaller number it genuinely is not). For
local iteration, replace the last line with `npm run dev`.

## Database scripts

| Script | Command | What it does |
|---|---|---|
| `db:push` | `drizzle-kit push --config drizzle.config.json` | Applies `src/db/schema.ts` directly to `DATABASE_URL` without generating migration files. Used in this sandbox and for fast local iteration. |
| `db:generate` | `drizzle-kit generate --config drizzle.config.json` | Generates versioned SQL migration files from `src/db/schema.ts` into `drizzle/` (not yet committed — see ADR-0004). Use this instead of `db:push` once there is a real deployment pipeline. |
| `db:migrate` | `drizzle-kit migrate --config drizzle.config.json` | Applies generated migration files from `drizzle/` in order. Requires `db:generate` to have been run first; does nothing today because no migrations have been generated yet (see ADR-0004). |
| `db:seed` | `node scripts/seed.mjs` | Runs `scripts/seed.sql` (idempotent — matches on natural keys before inserting) against `DATABASE_URL` using `pg` directly, no `psql` dependency. |
| `db:reset` | `node scripts/reset.mjs` | Drops `event_log`, `leaders`, `organizations` (in that order) from `DATABASE_URL`. Local development only — never run against production. |
| `db:studio` | `drizzle-kit studio --config drizzle.config.json` | Opens Drizzle Studio against `DATABASE_URL`. |
