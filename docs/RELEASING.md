# Releasing LEADOS

This is the actual checklist used to cut `v0.1.0`, and the one `.github/workflows/release.yml` automates
where possible. Follow it in order.

## 1. Gates (all must pass locally first)

```
$ npx next typegen
$ npm exec tsc -- --noEmit --pretty false
$ npm run lint
$ npm run test
$ npm run build
```

Equivalently: `npm run verify` runs lint → typecheck → test → build (typegen is run separately since it's
a Next.js-specific pre-step, see `.github/workflows/ci.yml`).

## 2. Calibration drift

LEADOS v0.1.0 has no ML model and no calibration process — the scoring engine is a deterministic rule
evaluator (`docs/explanations/intelligence-methodology.md`). **There is nothing to check for calibration
drift in this release.** Future releases that add outcome-based calibration must add a real drift check
here before this step can be marked done — do not check this box based on a model that doesn't exist.

## 3. Migrations

- Confirm `src/db/schema.ts` matches what `npx drizzle-kit push --config=drizzle.config.json` will apply.
- Confirm the change follows expand/contract (`docs/RUNBOOKS.md`): no `NOT NULL` additions or column
  drops that current application code depends on, in the same release.
- If the release includes a schema change, re-run the rollback drill pattern in
  `docs/ROLLBACK-DRILL.md` against a copy of the migrated database before shipping.

## 4. Performance

No load testing tooling exists yet (`docs/PERFORMANCE.md`). This step is currently a no-op; it is listed
so it isn't silently skipped once load testing is added.

## 5. Security

- Run `npm audit` and record the count/severity in the release notes.
- Confirm no new route handler was added without going through `docs/SECURITY.md`'s "no auth yet" caveat —
  i.e. don't let an unrelated PR quietly imply auth exists when it doesn't.

## 6. Version bump

Bump `package.json`'s `version` following semver:

- **patch** — bug fixes, no schema or API shape changes (e.g. the `source` field scoring fix in this
  release, see `docs/AUDIT-2026.md` finding #8 — though since this is the first tagged release, it's
  folded into `0.1.0` rather than a separate patch).
- **minor** — new, backward-compatible capability (e.g. a new rule operator, a new API route).
- **major** — breaking API or schema change requiring a contract step, or removal of a documented capability.

## 7. Changelog

Add an entry to `CHANGELOG.md` under the new version, following [Keep a Changelog](https://keepachangelog.com/).
Entries must describe what is actually shipped — no forward-looking promises (those belong in `FEATURES.md`'s
roadmap column).

## 8. Tag and build

```
$ git tag vX.Y.Z
$ git push --tags
```

Pushing a tag matching `v*` triggers `.github/workflows/release.yml`, which:

1. Runs the full gate sequence (lint, typecheck, test, build).
2. Builds a pinned container image (`Dockerfile`) and tags it with the release version.
3. Generates an SBOM via `npm sbom --sbom-format cyclonedx` and attaches it as a release artifact.
4. Attaches `openapi.yaml` (API spec) as a release artifact.
5. Runs `node --experimental-test-coverage --import tsx --test tests/**/*.test.ts` and attaches the
   coverage output as an artifact. (There is no mutation-testing or LLM-eval artifact, because neither
   tool exists in this repository — see `docs/TESTING.md`.)
6. Creates a GitHub Release with the above artifacts attached.

## 9. Deploy

Deployment target/infrastructure is out of scope for this repository (see
`docs/LEADOS-ARCHITECTURE-2026.md`). At minimum: apply any pending schema migration first (expand), then
deploy the new container image.

## 10. Smoke test

```
$ curl -s https://<deployed-host>/api/health
{"ok":true,"service":"leados","version":"X.Y.Z"}
```

Then walk `docs/tutorials/first-hour.md`'s steps 5–7 against the deployed host to confirm scoring and
rotation work end to end.

## 11. Announce

Update release notes with: what changed (from `CHANGELOG.md`), the `npm audit` summary, the coverage
numbers, and a link to the SBOM and OpenAPI artifacts.
