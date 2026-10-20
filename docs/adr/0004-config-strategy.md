# ADR-0004: Boot-time config validation via `instrumentation.ts`, schema-push over migrations for now

## Status
Accepted — Part 00.

## Context
`src/db/index.ts` already threw on a missing `DATABASE_URL`, but only at the moment the pool was
first constructed — which in Next.js's lazy module evaluation could be deep into handling the first
request, producing a confusing stack trace far from the real cause. Separately, the sandbox this
program runs in is explicitly instructed to use `npx drizzle-kit push` for schema changes rather than
generating and committing migration files, but a real deployment eventually needs versioned,
reviewable migrations.

## Decision
1. **Config validation:** centralize every environment variable the app depends on in
   `src/lib/platform/config.ts` (`ENV_VARS` + `validateConfig()`), call it from
   `src/instrumentation.ts`'s `register()` hook (Next.js's stable boot hook, runs once per server
   process before the first request) so missing configuration fails at boot with every missing
   variable named in one message, and also call it from `GET /api/health` so external health checks
   see the same failure mode instead of a generic 500.
2. **Schema strategy:** keep `npm run db:push` (`drizzle-kit push`) as the primary command for this
   phase of the program, matching the sandbox's own instructions, while adding `db:generate` and
   `db:migrate` scripts now so the transition to committed migrations is a one-command change
   (`npm run db:generate`) rather than a new ADR and new tooling later. No migration files are
   committed yet — `drizzle/` does not exist in this delivery — because none have been generated;
   generating empty/placeholder migration files to look complete would be exactly the kind of
   fabrication the honesty rules prohibit.

## Consequences
- Every later part that adds an environment variable (API keys, feature flags) must add it to both
  `ENV_VARS` in `config.ts` and the table in `docs/CONFIG.md` in the same change, or the two will
  drift the way `README.md` and code drifted in this program's prior (unverified) history.
- Schema changes in Parts 01+ continue via `npm run db:push` in this sandbox; the first part that
  targets a real staging/production deployment pipeline should switch the deployment step to
  `npm run db:generate && npm run db:migrate` and commit the generated `drizzle/` directory — that is
  the trigger condition for revisiting this ADR, not a fixed part number.

## Alternatives considered
- **Validate config lazily inside `src/db/index.ts` only.** Rejected: it only covers `DATABASE_URL`
  and only fires on first DB access, not at boot, and doesn't generalize to non-database config a
  later part will add (e.g. an LLM provider key).
- **Commit generated migration files now even though `db:push` is what actually runs in this
  sandbox.** Rejected: would create a `drizzle/` directory that nothing applies, which is worse than
  not having it — it implies a migration history that was never exercised.
