# Manifest — Session 40

Every file created or modified this session, plus the two files that were
modified in place (not deleted — see note). There are **no deletions** in
this session: every file present in the starter template at session start
still exists, in a modified form where noted.

## Modified (existed in the starter template, content changed)

| Path | Change |
|---|---|
| `package.json` | Added `test`, `seed`, `ledger:check`, `gate:all`, `verify` scripts. Dependencies changed only via the `install_npm_packages` tool (`vitest` added). |
| `src/db/schema.ts` | Replaced the empty placeholder with 14 real tables across six seams. |
| `src/app/page.tsx` | Replaced the generic starter homepage with the live LEADOS dashboard. |
| `src/app/layout.tsx` | Updated page title/description metadata. |
| `tsconfig.json` | Auto-updated by `next typegen` (added `.next/dev/types/**/*.ts` to `include`, set `jsx: "react-jsx"`) — not hand-edited. |

`src/app/api/health/route.ts`, `src/db/index.ts`, `src/app/globals.css`,
`next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`,
`drizzle.config.json`, `.env` are unchanged from the starter template.

## Created — application code

| Path |
|---|
| `src/lib/fitness.ts`, `src/lib/fitness.test.ts` |
| `src/lib/assurance.ts`, `src/lib/assurance.test.ts` |
| `src/lib/assuranceData.ts` |
| `src/lib/chaos.ts`, `src/lib/chaos.test.ts` |
| `src/lib/consolidation.ts`, `src/lib/consolidation.test.ts` |
| `src/lib/voc.ts`, `src/lib/voc.test.ts` |
| `src/lib/automation.ts`, `src/lib/automation.test.ts` |
| `src/lib/dashboard.ts` |
| `src/components/ActionForm.tsx` |
| `src/app/api/domains/route.ts` |
| `src/app/api/metrics/route.ts` |
| `src/app/api/fitness/route.ts` |
| `src/app/api/engines/route.ts` |
| `src/app/api/assurance/route.ts` |
| `src/app/api/risks/route.ts` |
| `src/app/api/chaos/route.ts` |
| `src/app/api/entities/route.ts` |
| `src/app/api/consolidation/route.ts` |
| `src/app/api/strategy/route.ts` |
| `src/app/api/voc/route.ts` |
| `src/app/api/process-mining/route.ts` |
| `src/app/api/automation-score/route.ts` |

## Created — tooling / CI

| Path |
|---|
| `scripts/seed.mjs` |
| `scripts/ledger-check.mjs` |
| `scripts/gate-all.mjs` |
| `vitest.config.mts` |
| `vitest.setup.ts` |
| `.github/workflows/ci.yml` |
| `.gitignore` |

## Created — documentation

| Path |
|---|
| `docs/GLOSSARY.md` |
| `docs/SYSTEM-MAP.md` |
| `docs/EVIDENCE-LEDGER.md` |
| `docs/PART-DEPENDENCY.md` |
| `docs/LEADOS-ARCHITECTURE-2026.md` |
| `docs/LEADOS-VISION.md` |
| `docs/FEATURES.md` |
| `docs/RED-TEAM-FINAL.md` |
| `docs/VERIFICATION-LOG.md` |
| `docs/MANIFEST.md` (this file) |
| `AI-SESSION-LOG.md` (repository root) |

## Deletions

None. There was nothing to delete: the starter template's files are either
unchanged or extended in place, and every seam/doc described in this
delivery is additive. If a future session removes any of the above (e.g.
after replacing a heuristic with a real model), it must update this
manifest and `docs/EVIDENCE-LEDGER.md` in the same change.
