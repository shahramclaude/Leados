# How-to guides

Task-oriented guides. Each one assumes you've already done the tutorial
(`docs/tutorials.md`) once. Each guide states its implementation status up front —
some of these describe things LEADOS does not do yet, and say so rather than pretending.

## Configure tenancy

**Status: ⚪ Planned — not implemented.** LEADOS v0.1.0 is single-tenant: every lead lives in one
shared `leads` table with no tenant/organization column (`src/db/schema.ts`). There is currently
no way to "configure tenancy" because there is only one tenant, implicitly, the whole database.

Intended shape for when this ships (tracked as README roadmap milestone M2, depends on M1 auth):

1. Add a `tenant_id` column to `leads` and `score_events`, non-nullable, no default.
2. Every query in `src/app/api/leads/**` gains a `where(eq(leads.tenantId, currentTenantId))`
   clause, where `currentTenantId` comes from the authenticated session (M1), not from a request
   body or query param — a tenant must never be able to pass another tenant's id.
3. Add a composite index on `(tenant_id, status)` to keep the dashboard query fast per tenant.
4. Seed script (`scripts/seed.ts`) gains a `--tenant` flag.

Until this exists, do not deploy one LEADOS instance for multiple customers/teams who should not
see each other's leads. One instance per tenant is the only safe topology today.

## Add a scoring rule

**Status: 🟢 Live** — this works today, it's intentionally simple.

1. Open `src/lib/scoring.ts`. Every rule is a line in `computeScore()` that writes a named key into
   `breakdown`, e.g.:
   ```ts
   breakdown.hasCompany = input.company && input.company.trim().length > 0 ? 15 : 0;
   ```
2. Add your rule following the same pattern — always write a named key, never an anonymous number,
   so the breakdown stays explainable in the dashboard tooltip.
3. Decide whether this is a weight tweak or a new signal. If it's a new signal, consider bumping
   `SCORE_VERSION` (e.g. `"rule-v2"`) so future `score_events` rows are distinguishable from old
   ones — the audit trail keeps both.
4. Existing leads keep their *old* score until recomputed. To re-run every lead through the new
   rules:
   ```bash
   # one-off recompute for a single lead:
   curl -X POST http://localhost:3000/api/leads/1/score

   # or, for all leads, loop over the IDs from GET /api/leads
   ```
   There is no bulk-recompute endpoint yet — see `FEATURES.md` for related planned work
   (M5, scenario/simulation engine) which would make an "apply new rules to all history and diff
   the outcome" workflow a first-class feature instead of a shell loop.
5. Update `docs/reference.md` → "Scoring breakdown keys" with your new key name, and add a line to
   `CHANGELOG.md` under `[Unreleased]`.

## Run a scenario

**Status: ⚪ Planned, with a documented manual workaround.** There is no simulation/scenario engine
(`FEATURES.md`, roadmap M5). "Running a scenario" today means manually comparing scores before and
after a rule change:

1. Note current scores: `curl http://localhost:3000/api/leads | jq '.leads[] | {id, name, score}'`
2. Make your change in `src/lib/scoring.ts` and restart `npm run dev`.
3. Force-recompute the same leads (see previous guide) and diff the two score lists by hand (or
   pipe both into a file and `diff` them).
4. Each recompute writes a `score_events` row with `reason: "recomputed"`, so the audit trail
   (`GET /api/leads/:id`) shows the before/after even without a dedicated scenario tool.

This is a workaround, not a feature — it does not run in a sandboxed copy of the data, it mutates
your real `leads` table. Do this against a non-production database.

## Rotate credentials

**Status: 🟡 Partial — the only credential is `DATABASE_URL`, and rotating it is a manual
procedure.**

1. Create a new PostgreSQL role/password (or ask your DB host to do so) with the same grants as the
   current app role.
2. Verify connectivity with the new credential *before* touching the running app:
   ```bash
   psql "postgresql://<new-user>:<new-password>@<host>:5432/<db>" -c "select 1;"
   ```
3. Update `.env` (local) or your deployment's secret store (production — see `docs/DEPLOYMENT.md`)
   with the new `DATABASE_URL`.
4. Restart the app process. Because the app reads `DATABASE_URL` once at process start
   (`src/db/index.ts`), there is no hot-reload of credentials — a restart is required.
5. Confirm with `curl http://<host>/api/health` — it must return `{"ok":true,...}`.
6. Revoke the old credential only after step 5 passes.

There is no automated rotation schedule or secret-manager integration yet. If/when one is added,
document it here and update `FEATURES.md`.
