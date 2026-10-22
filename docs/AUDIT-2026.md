# AUDIT-2026 — Consistency Sweep (Part 21)

**Status:** first edition. No prior `AUDIT-2026.md`, `docs/`, `README.md`, `CHANGELOG.md`,
`CONTRIBUTING.md`, or `AI-SESSION-LOG.md` existed in this working copy before this part. See
`docs/PART-DEPENDENCY.md` for the full honesty note on what "Parts 00–20" means for this repository
snapshot.

## Phase 0 — what was actually in the repository before this part

The working copy contained exactly 13 files: a bare Next.js 16 + Drizzle ORM + PostgreSQL starter
template (`package.json` name: `nextjs-postgresql-template`), an empty schema module, one `/api/health`
route, and a placeholder landing page titled "Arena Next.js PostgreSQL Starter". There was no `docs/`
directory, no product code (no leads, scoring, rules, tenancy, or rotation), no tests, no CI, no
CHANGELOG, no CONTRIBUTING guide, and no prior session log.

This means the large surface implied by the Part 21 brief — intelligence/causal/retrieval/sensing/
fairness/LLM subsystems, prior audits, a design system, a threat model, SLOs, runbooks, a realtime
layer — **does not exist in code or history in this repository**. Per the standing honesty rule, this
audit does not invent that history. It records what was found, and Phase 1–3 of this part build a small,
real, fully-tested v0.1.0 baseline (deterministic lead scoring, round-robin rotation, an append-only
evidence ledger, multi-tenant storage) so that every claim in `README.md` and `FEATURES.md` can point at
a real file, line, or command output.

## Consistency sweep: findings table

| # | Inconsistency found | Where | Resolution taken in this part |
|---|---|---|---|
| 1 | Product branded "Arena Next.js PostgreSQL Starter", not LEADOS | `src/app/page.tsx`, `src/app/layout.tsx` (titles/metadata) | Renamed to LEADOS; copy now describes the real scoring/ledger/rotation baseline instead of a generic starter message. |
| 2 | `package.json` name was the generic template name (`nextjs-postgresql-template`), no version | `package.json` | Renamed to `leados`, set `version: 0.1.0` (first tagged baseline, see `CHANGELOG.md`). |
| 3 | Global DB pool cache key used an `__arena...` prefix, a leftover from the starter template brand | `src/db/index.ts` | Renamed to `__leadosPostgresqlPool`. |
| 4 | `src/db/schema.ts` exported nothing (`export {}`) — no product data model existed | `src/db/schema.ts` | Added the real baseline schema: `tenants`, `reps`, `rules`, `leads`, `lead_scores`, `decisions`, `rotation_state`. |
| 5 | No tests, no CI, no verify pipeline existed to back any claim | repo root | Added `tests/*.test.ts` (11 passing cases, Node's built-in test runner), `npm run verify`, `.github/workflows/ci.yml`. |
| 6 | No docs existed in any voice (tutorial/how-to/reference/explanation), so no claim in any README could be checked | — | Authored the full Diátaxis set under `docs/` (this part), cross-linked from `docs/INDEX.md`. |
| 7 | No `FEATURES.md`/capability matrix existed to separate live vs. stub vs. roadmap claims | — | Added `FEATURES.md` with an honest live/partial/stub/roadmap matrix. |
| 8 | A scoring rule referencing the lead's `source` field silently never matched, because the scorer was only given the `signals` JSON blob, not the lead's first-class `source` column | `src/app/api/leads/[id]/score/route.ts` (discovered while writing the tutorial walkthrough in this part, see git history / `CHANGELOG.md` v0.1.0 entry) | Fixed by merging `{ source: lead.source, ...lead.signals }` before scoring; covered by the tutorial's worked example and re-verified via `curl` transcript in `docs/tutorials/first-hour.md`. |
| 9 | No release process, rollback drill, SBOM, or API spec existed | — | Added `docs/RELEASING.md`, `docs/ROLLBACK-DRILL.md` (real transcript), `.github/workflows/release.yml` (SBOM via `npm sbom`, OpenAPI spec, container image), `openapi.yaml`. |
| 10 | No security/threat-model/SLO/runbook documentation existed to check against the "no auth yet" reality of the API | — | Added `docs/SECURITY.md`, `docs/THREAT-MODEL.md`, `docs/SLO.md`, `docs/RUNBOOKS.md`, all describing the actual (unauthenticated, tenant-slug-scoped) state, not an aspirational one. |
| 11 | No mentions of "Arena" branding should remain anywhere once renamed | repo-wide grep | Searched for `Arena`/`arena` across the tree post-rename; only remaining occurrence is this audit entry itself, documenting the rename. |

## Grep evidence (run during this part)

```
$ grep -ril "arena" --include="*.ts" --include="*.tsx" src/
(no matches after rename)
```

No other stale product names, route-count claims, or abandoned feature names ("Arena", old package name,
etc.) were found remaining in the codebase after the fixes above.
