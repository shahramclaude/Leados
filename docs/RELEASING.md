# Releasing LEADOS

LEADOS uses [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`. Bump `MAJOR` for
breaking API/schema changes, `MINOR` for backward-compatible features, `PATCH` for fixes/docs.

## Checklist (every item must be checked before tagging)

1. **All gates green.**
   ```bash
   npx next typegen
   npm exec tsc -- --noEmit --pretty false
   npm run verify            # lint + typecheck + docs link check + production build
   ```
2. **Calibration drift check.** LEADOS's scoring is rule-based, not a trained model (see
   `docs/explanation.md`), so there is no statistical calibration to drift. The equivalent check
   here is a **rule-weight diff review**: run `git diff <previous-tag> -- src/lib/scoring.ts` and
   confirm every changed weight is called out in `CHANGELOG.md`. If `SCORE_VERSION` wasn't bumped
   for a meaningful rule change, bump it now — see `docs/how-to-guides.md` → "Add a scoring rule".
3. **Migration check.** Confirm `npm run db:push` is idempotent against a copy of the current
   production schema (no destructive column drops without an expand/contract plan — see
   `docs/ROLLBACK.md`). Since this project uses `drizzle-kit push` rather than generated migration
   files (see `docs/explanation.md` → "Why no migration files yet"), "migration check" means:
   diff `src/db/schema.ts` against the previous tag and confirm any column removal has already
   shipped a prior release where the column was simply unused, not read.
4. **Perf check.** No load-testing harness exists yet (tracked gap). Minimum bar: `npm run build`
   succeeds and `/api/health` responds in a manual `curl -w "%{time_total}\n"` check under 1 second
   against a warm local server. Record the number in the release notes.
5. **Security scan.** `npm audit --omit=dev` and review new findings since the last release (see
   `docs/explanation.md` → "Security posture" for the currently-accepted baseline). Any new
   high/critical finding in a dependency actually reachable at runtime blocks the release.
6. **Version bump.** Update:
   - `src/app/api/health/route.ts` → `LEADOS_VERSION`
   - `package.json` → add/update a `"version"` field matching the tag (without a leading `v`)
7. **Changelog.** Move `[Unreleased]` entries in `CHANGELOG.md` into a new `## [X.Y.Z] - YYYY-MM-DD`
   section. CI (`.github/workflows/release.yml`) fails the release job if no section matching the
   tag's version exists in `CHANGELOG.md`.
8. **Tag.**
   ```bash
   git tag -a vX.Y.Z -m "LEADOS vX.Y.Z"
   git push origin vX.Y.Z
   ```
9. **Build artifacts.** Pushing the tag triggers `.github/workflows/release.yml`, which:
   - builds and pushes a pinned container image (tagged both `vX.Y.Z` and the image digest),
   - generates and attaches a Software Bill of Materials (SBOM) via `npm sbom` (CycloneDX format),
   - attaches `FEATURES.md` and `docs/reference.md` as the "API spec" artifact (see note below on
     why there is no separate OpenAPI file yet),
   - runs `npm run verify` again inside CI and attaches its log as a build artifact.
10. **Deploy.** Follow `docs/DEPLOYMENT.md` — staging first, health-gated promotion to production.
11. **Smoke test.** After deploy, `curl https://<host>/api/health` must return
    `{"ok":true,"service":"leados","version":"X.Y.Z"}` with the version matching the tag. Also
    exercise one real write: create a throwaway lead via `POST /api/leads`, confirm it appears in
    `GET /api/leads`, then delete it.
12. **Announce.** Post the `CHANGELOG.md` section for this version wherever your team tracks
    releases (issue comment, release notes on GitHub — the release workflow auto-populates the
    GitHub Release body from the matching `CHANGELOG.md` section).

## Note on "API spec" artifact

There is no OpenAPI/Swagger document in this version — `docs/reference.md` is the hand-maintained
contract. Rather than ship a fabricated OpenAPI file nobody validates, the release workflow attaches
the real reference doc as the spec artifact and says so in the release notes. Generating a real
OpenAPI spec from the route handlers is listed in `FEATURES.md` as a roadmap item (dependency: M3,
so routes can be contract-tested against the generated spec, not just documented by it).

## Rollback

See `docs/ROLLBACK.md` for the full procedure and a real transcript of a rollback drill performed
against this version.
