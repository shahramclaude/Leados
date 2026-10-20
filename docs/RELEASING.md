# Releasing LEADOS

This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (see
`CHANGELOG.md`). Tags are `vMAJOR.MINOR.PATCH`.

## Expand/contract migration strategy

`npx drizzle-kit push` (used by `npm run db:migrate`) diffs
`src/db/schema.ts` against the live database and applies the difference
directly — there is no numbered migration chain to replay in this build.
That makes **backward-compatible, additive ("expand") changes the only
safe kind to ship without a maintenance window**:

- **Expand (safe, default):** add a new table, add a nullable column, add
  an index, add a new enum value. Old and new app code can both run
  against the resulting schema, which is what makes rolling/zero-downtime
  deploys possible.
- **Contract (needs a window):** drop a column/table, rename a column,
  change a column's type, make a column `NOT NULL` without a default. Any
  of these must happen *after* every instance of the app that reads/writes
  the old shape has been fully replaced — never in the same deploy as the
  code change that stops using it. Two-step it: (1) ship code that stops
  using the old shape (but the old shape still exists — an "expand" from
  the DB's point of view, since nothing is removed yet), verify, *then*
  (2) a follow-up release that actually drops the old column/table.

Bump `src/db/schemaVersion.json` whenever `src/db/schema.ts` changes, in
the same commit. `npm run db:migrate` writes that value into
`system_meta.schema_version`, and `/api/health` fails loudly
(`schema_version: fail`, critical) if the running app and the database
disagree — see `docs/RUNBOOKS.md` → "Schema rollback".

## Release checklist

Run from a clean checkout of the commit you intend to tag:

1. **Static checks**
   - `npx next typegen`
   - `npm run typecheck`
   - `npm run lint`
2. **Build**
   - `npm run build`
3. **Security**
   - `npm run security:scan`
4. **Database**
   - Confirm `src/db/schemaVersion.json` was bumped if
     `src/db/schema.ts` changed in this release.
   - Dry-run `npx drizzle-kit push` against a staging database (see
     "Staging" below) and read the diff it prints before it ever touches
     production.
5. **Gates that don't exist yet in this build (tracked, not skipped
   silently):**
   - `eval:intelligence` (calibration/forecast evaluation) — no
     forecasting/calibration engine exists in this working tree yet.
     Tracked in `FEATURES.md` → Roadmap. Not run.
   - `perf:check` (load/perf budget gate) — no load-testing harness is
     wired up yet. The closest proxy today is reading `p95Ms` from
     `GET /api/metrics` after a manual smoke test and comparing against
     `docs/SLO.md`.
   - `i18n:check` — the app has no i18n surface (single hard-coded English
     UI). Not applicable until localization is in scope.
   - End-to-end browser test suite — none exists in this build; the
     closest thing today is the manual smoke sequence in
     `docs/DEPLOYMENT.md` → "Verify a deploy".
6. **Changelog**
   - Move the `[Unreleased]` section of `CHANGELOG.md` into a new
     `[MAJOR.MINOR.PATCH] - YYYY-MM-DD` section.
7. **Tag**
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push origin vX.Y.Z`
   - Pushing the tag triggers `.github/workflows/release.yml`, which
     builds the production Docker image and attaches `docs/api/openapi.json`
     to the GitHub Release. (There is no automated coverage report in this
     build — no test runner with coverage instrumentation exists yet; this
     is listed as a known gap rather than faked.)

## Version bump rule of thumb

- **PATCH:** bug fix, doc fix, no schema change, no API change.
- **MINOR:** new endpoint/table/feature, additive schema change, no
  breaking change to an existing response shape.
- **MAJOR:** any breaking change to an existing API response shape, a
  "contract" schema change, or a required new environment variable with no
  default.

## Staging environment procedure

This repo doesn't provision staging infrastructure (no cloud account
access from here), but the procedure is:

1. Run a second Postgres instance (or a separate database on the same
   instance) and a second copy of the `app` container pointed at it via a
   separate `DATABASE_URL` — `docker-compose.production.yml` can be reused
   as-is with a different `.env` (different `DATABASE_URL`, different
   `PORT`/host port mapping).
2. Deploy the candidate commit to staging first:
   `./scripts/deploy.sh --env=staging` (see `docs/DEPLOYMENT.md`).
3. Run the release checklist's build/security steps against staging, then
   do a manual smoke pass: `/`, `/health`, `POST /api/automation/runs`,
   `POST /api/admin/maintenance` (toggle on then back off).
4. Only promote to production (`./scripts/deploy.sh --env=production`)
   once staging's `/api/health` has been `healthy` for a soak period (a
   few minutes is enough for this app; lengthen once there's real traffic
   to watch).

## Rollback procedure

1. Identify the last known-good tag: `git tag --sort=-creatordate | head`.
2. Redeploy that tag's image:
   `./scripts/deploy.sh --env=production --tag=vX.Y.Z`
   (the script pulls/builds the image for that tag and restarts the `app`
   service only — it does not touch the database).
3. If the bad release included an **expand** schema change, leave the
   schema as-is (old code ignores new nullable columns/tables — that's the
   point of expand/contract). If it included a **contract** change, you
   cannot roll back the app alone — follow
   `docs/RUNBOOKS.md` → "Schema rollback" first, then redeploy the old
   image.
4. Verify: `/api/health` → `status: healthy` (or `degraded` with only
   expected warnings), `schema_version: ok`.
5. File a postmortem noting what broke and whether this document's
   checklist would have caught it; update the checklist if not.
