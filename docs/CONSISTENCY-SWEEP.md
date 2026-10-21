# Consistency sweep — Part 19 / v0.1.0

This is the checklist required by the Part 19 standing order: every self-contradiction found in the
repository, and how it was resolved. The sweep method was: grep the full repository for stale
product names, old branding, and claims not backed by code, then read every source file that
existed.

Commands actually run for this sweep (reproduced from the session transcript):

```bash
grep -ril "arena" --include="*.ts*" .
grep -ril "nextjs-postgresql-template" .
git -C . log --oneline        # confirmed: no .git directory, no prior history
ls docs 2>/dev/null           # confirmed: empty before this part
```

## Findings and resolutions

| # | Inconsistency found | Where | Resolution |
|---|---|---|---|
| C-1 | Page `<title>`/description said "Arena Next.js PostgreSQL Starter" while the product/program is named LEADOS everywhere else (task brief, this doc set). | `src/app/layout.tsx` | Changed title/description to LEADOS. |
| C-2 | Homepage rendered a generic "Starter template" placeholder card with copy about "a successful PostgreSQL query", unrelated to the product this program describes. | `src/app/page.tsx` | Replaced with the actual LEADOS lead dashboard (`src/components/LeadBoard.tsx`), which is real, working product surface, not a placeholder. |
| C-3 | Internal global variable name baked in the old template's branding (`__arenaNextJsPostgresqlPool`), which would leak into stack traces / debugging sessions and confuse anyone searching for "LEADOS" in the codebase. | `src/db/index.ts` | Renamed to `__leadosDbPool`. No behavior change — verified by `npx tsc --noEmit` and `npm run build` passing after the rename. |
| C-4 | `package.json` `name` field was `nextjs-postgresql-template`, not `leados` — would appear in `npm` tooling output, lockfile metadata, and any future `npm publish`/Docker labels derived from it. | `package.json` | Changed `name` to `leados`. Only the `name`/`scripts` fields were touched; no dependency versions were modified by hand (new dependency `tsx` was added via the package-install tool, not by hand-editing version strings). |
| C-5 | The Part 19 brief instructs reading `README.md`, `CHANGELOG.md`, `docs/*`, `AI-SESSION-LOG.md`, and several stale report files (`APP-STATUS-REPORT.txt`, `FEATURE-TRUTH-MATRIX.md`, `WHITEPAPER.md`, etc.) as pre-existing — none of them existed in this repository snapshot, nor did a `.git` history. This is itself a form of repo/process inconsistency (instructions assuming state that isn't there). | N/A — process-level, not code-level | Documented transparently in `docs/history/2026-part19-baseline-note.md` instead of fabricating plausible-sounding content for eighteen parts' worth of documents that cannot be verified against any code. All new documentation in this release describes only the real, small feature set in `FEATURES.md`. |
| C-6 | `/api/health` reported only `{ok}`, giving no version signal, while `docs/RELEASING.md` (written in this pass) needed a way to assert "the deployed version is X" during a release/rollback — a latent inconsistency between what release engineering requires and what the app exposed. | `src/app/api/health/route.ts` | Added `service` and `version` fields to the health response, and made `docs/RELEASING.md`/`docs/ROLLBACK.md` check them explicitly. |
| C-7 | No `CHANGELOG.md` existed, so "current version" was undefined — `package.json` had no `version` field in scripts/metadata actively used anywhere, and nothing enforced that a release required a changelog entry. | Repository root | Added `CHANGELOG.md` (Keep a Changelog format) starting at `v0.1.0`, and added a changelog-entry-exists check to `docs/RELEASING.md`'s checklist and to `.github/workflows/release.yml`. |
| C-8 | No `.env.example` existed, so the only record of the required `DATABASE_URL` shape was the live `.env` file (which must never be committed) and inline comments in `src/db/index.ts` — a new contributor had no safe template to copy. | Repository root | Added `.env.example`, referenced from `README.md`, `docs/tutorials.md`, and `CONTRIBUTING.md`. |

## What this sweep deliberately did not do

- It did not invent content for the eighteen prior parts' documents referenced by the brief
  (`AUDIT-2026`, `ARCHITECTURE.md`, `THREAT-MODEL.md`, `SLO.md`, etc.) because none of them exist in
  this repository and fabricating them would itself be the exact self-contradiction this sweep
  exists to prevent. Where this program's Part 19 brief required a topic those documents would have
  covered (architecture, security posture, fairness posture, release process), the real content was
  written fresh in `docs/explanation.md`, `docs/RELEASING.md`, `docs/DEPLOYMENT.md`, etc., scoped to
  what's actually built.
- It did not change `npm audit`-flagged transitive dependency versions, because doing so without
  verifying each one doesn't break the build is out of scope for a documentation/release-engineering
  pass; it is tracked instead in `docs/explanation.md` → "Security posture" as a known, disclosed
  item to re-check at each release per `docs/RELEASING.md`.
