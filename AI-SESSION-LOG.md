# AI Session Log

This file is the session-by-session ledger for the LEADOS transformation program. Each entry
records what was done, what was verified and how, what remains, and every decision a future session
must not silently reverse. This file did not exist before Part 00; it is created here.

---

## Part 00 — Baseline audit and engineering law

**Scope of the standing order:** establish ground truth (audit), kill any legacy duality, fix brand
truth, establish and enforce layering, establish configuration truth, and deliver governance
artifacts (ADRs, FEATURES.md).

### What was found (read before anything was written)

Files actually read: `package.json`, `tsconfig.json`, `next.config.ts`, `src/db/schema.ts`,
`src/db/index.ts`, `eslint.config.mjs`, `drizzle.config.json`, `src/app/layout.tsx`,
`src/app/page.tsx`, `src/app/api/health/route.ts`, `src/app/globals.css`, `postcss.config.mjs`,
`.env`, plus a full `list_files` root listing and a `find`/`ls -la` sweep for the legacy filenames
named in the standing order (`App.tsx`, `main.tsx`, `vite.config.ts`, `index.html`, `engine.ts`,
`store.ts`, `ui.tsx`, `leados-cli.html`).

**Finding, reported honestly:** the repository contained none of the history the standing order
describes. No legacy Vite app, no `src/app/routes.ts`, no `AI-SESSION-LOG.md`, no `src/lib`
directory, no competing engine clusters, no `*.js` compiled twins. It was the generic
`nextjs-postgresql-template` starter (`package.json` name, `"Arena Next.js PostgreSQL Starter"`
metadata in `layout.tsx`, one placeholder page, one health route, an empty `schema.ts`). This is
documented in full, with the exact search commands, in `docs/AUDIT-2026.md` §0 and §B, and in
`deprecated/README.md`. No deletions were performed because nothing to delete existed; this was
verified, not assumed.

### What was done

1. **Audit** (`docs/AUDIT-2026.md`): measured LOC per layer, file counts, 15 largest files, a route
   inventory cross-checked against the (newly created) `src/app/routes.ts` (0 mismatches), an engine
   inventory (no duplicates found — a from-scratch baseline has none by construction), and the
   measured numbers: 0 TypeScript errors, 0 ESLint errors/warnings across 29 linted files, `next
   build` wall time ≈6.8s (Turbopack, this sandbox), `.next` output 11M total / 669K static, 3
   Postgres tables.
2. **Brand truth:** `package.json` name changed `nextjs-postgresql-template` → `leados`.
   `src/app/layout.tsx` metadata changed from "Arena Next.js PostgreSQL Starter" to "LEADOS —
   Autonomous Leadership Intelligence" with a real description and `openGraph` block.
   `src/db/index.ts`'s global pool cache key renamed from `__arenaNextJsPostgresqlPool` to
   `__leadosPgPool`.
3. **Layering law** (`ARCHITECTURE.md`, `eslint.config.mjs`): introduced
   `src/app → src/lib/app → src/lib/domain → src/lib/platform`, with `src/lib/domain` required pure
   (zero I/O) and `src/lib/platform/repositories` the only importer of `@/db`. Enforced via
   `import/no-restricted-paths` (from `eslint-plugin-import`, already a transitive dependency of
   `eslint-config-next`, no new package installed). **Verified the rule actually fires**, not just
   exists in config: temporarily prepended a forbidden `@/db` import into
   `src/lib/domain/leadership/readinessEngine.ts`, ran `npx eslint` on it, observed 2 errors naming
   the configured rule text, then reverted the file and re-ran `npx eslint .` to confirm 0
   errors/warnings in the delivered state. One documented exception exists:
   `src/app/api/health/route.ts` imports `@/db` directly for its liveness probe
   (`ARCHITECTURE.md` rule 5) — this is the only route allowed to do so.
4. **First vertical slice**, built to prove the layering end-to-end rather than leave it
   aspirational: `organizations` and `leaders` tables (`src/db/schema.ts`), 3 repositories
   (`src/lib/platform/repositories/`), one pure domain engine
   (`src/lib/domain/leadership/readinessEngine.ts`, a 3-input linear readiness score), 5 use cases
   (`src/lib/app/useCases/**`), an append-only `event_log` table + `eventRepository` written to by
   every mutating use case, 4 pages and 3 API routes (`src/app/**`), and `src/app/routes.ts` as the
   single machine-readable source of truth for the route tables in `README.md` and `FEATURES.md`.
5. **Configuration truth:** `src/lib/platform/config.ts` (`validateConfig`, `ConfigValidationError`)
   is the single list of environment variables; `src/instrumentation.ts` calls it at boot via
   Next.js's `register()` hook; `GET /api/health` calls it too. `docs/CONFIG.md` documents every
   variable (currently: `DATABASE_URL` required, `NODE_ENV` optional) and every `db:*` script.
6. **Scripts:** added `verify`, `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:reset`,
   `db:studio` to `package.json`. `scripts/seed.sql` + `scripts/seed.mjs` (idempotent, pure Node +
   `pg`, no `psql` dependency) and `scripts/reset.mjs` (drops the 3 tables). Ran `npm run db:push`
   then `npm run db:seed` against the sandbox's live Postgres and confirmed row counts directly with
   `psql` (organizations=2, leaders=2, event_log=1).
7. **Governance artifacts:** 5 ADRs in `docs/adr/` (canonical app, layering, repository layer,
   config strategy, event-versioning posture) and `FEATURES.md` (one row per route, plus an explicit
   "not yet built" table so later parts know what they own).
8. **README.md** rewritten in full: architecture (mermaid), route tables generated from
   `src/app/routes.ts`, data model (mermaid ER diagram), a 5-command quickstart, and a capability
   matrix where 3 representative claims are traced to the files that back them.

### What was verified, and how (exact commands in the Verification Log of this delivery)

- `npx next typegen` — passed.
- `npm exec tsc -- --noEmit --pretty false` — 0 errors.
- `npm run build` — succeeded, Turbopack, all 4 pages + 3 API routes compiled, no static-generation
  failures.
- `npm run lint` (`eslint .`) — 0 errors, 0 warnings, 29 files linted.
- `npm run verify` — all three of the above in one command, exit 0.
- `build_and_start` tool — bootstrapped the sandbox, built, started, and passed `/api/health`.
- Database: `npx drizzle-kit push`, then `npm run db:seed`, then direct `psql` queries confirming 3
  tables and the seeded row counts above.
- Lint boundary rule: proved it fires on a forbidden import (see step 3 above), then confirmed clean
  on the delivered code.

### What remains (explicitly not done in Part 00, so a later part doesn't assume it exists)

- `routes.ts`-vs-filesystem drift checking (`findMismatches()` in `src/app/routes.ts`) is a function
  that exists and was exercised manually for this audit; it is **not yet wired into CI or into
  `npm run verify`**. The next part that touches routing should add a small script that walks
  `src/app` with `fs`, calls `findMismatches()`, and exits non-zero on any entry — turning a manual
  check into an enforced one.
- No committed Drizzle migration files (`drizzle/` does not exist). `db:generate`/`db:migrate`
  scripts exist and are documented, but this program still uses `db:push` in the sandbox per its own
  operating instructions (see `docs/adr/0004-config-strategy.md`).
- No authentication, no multi-tenant access control. `organizations` currently has no access
  boundary — any request can read/write any organization's leaders. This is acceptable for a Part 00
  single-tenant baseline and must not be mistaken for an oversight if a later part adds real users.
- No components layer (`src/components/`) — there is one UI surface so far; `docs/AUDIT-2026.md` §1
  flags this as the trigger condition for introducing one, not a gap in Part 00.
- `src/lib/platform/clock.ts`'s `systemClock` has no consumer yet (table timestamps come from
  Postgres `defaultNow()`, not from application code). It is kept intentionally as the documented
  seam for the first time-dependent domain engine — do not delete it as "dead code" without reading
  `docs/AUDIT-2026.md` §3's note on it first.

### Decisions a future session must not silently reverse

1. **Canonical app is `src/` Next.js, permanently** (ADR-0001) — do not resurrect or merge in a
   Vite-era app without updating this ADR first.
2. **`src/lib/domain/**` must stay pure (zero I/O)** (ADR-0002) — enforced by lint; do not loosen the
   `import/no-restricted-paths` zones to "fix" a failing build without finding a way to thread the
   I/O through the calling use case instead.
3. **Only `src/lib/platform/repositories/**` (plus the one documented health-check exception) may
   import `@/db`** (ADR-0003) — do not add a second raw-`@/db` call site anywhere else; add a
   repository function instead, even for a one-off read.
4. **`db:push` is the active schema-apply strategy until a real deploy pipeline exists** (ADR-0004)
   — do not start generating migration files for one environment while still pushing schema directly
   in another; pick one path and update this ADR when you do.
5. **`event_log` is an append-only audit trail, not an event-sourcing source of truth** (ADR-0005) —
   `organizations`/`leaders` tables remain the source of truth for current state; do not derive state
   from `event_log` without a new ADR replacing this one.
