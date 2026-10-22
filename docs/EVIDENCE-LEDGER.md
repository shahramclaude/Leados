# Evidence Ledger — LEADOS

**This is the honesty backbone of the product.** Every claim this product (or
its documentation, or a salesperson, or a future AI session) makes about
itself must appear here with a true, current status and a real, checkable
proof. `npm run ledger:check` parses this file and fails the build if any row
marked **Verified** does not cite a proof path that actually exists in the
repository. It cannot check that the proof is *good*, only that it *exists*
— human review is still required.

## How to read this table

- **Verified** — there is an automated test or a reproducible command that
  proves the claim, and it currently passes.
- **Partial** — part of the claim is proven; the rest is a named, scoped gap.
- **Planned** — designed and scoped, not built.
- **Not implemented** — explicitly out of scope for this build; see
  `docs/LEADOS-VISION.md` §2 ("what LEADOS is not").
- **Accepted risk** — a real gap that we are consciously not closing right
  now, with a written rationale (see `docs/RED-TEAM-FINAL.md`).

## Session 40 starting condition (read this first)

Before any other claim: at the start of this session, the repository
contained **only** the unmodified `nextjs-postgresql-template` starter — one
page, one health route, an empty `schema.ts`, no `docs/` directory, no prior
`AI-SESSION-LOG.md`. None of the artifacts that Parts 1–39 are described as
having produced (`FEATURES.md`, `PART-DEPENDENCY.md`,
`LEADOS-ARCHITECTURE-2026.md`, `RED-TEAM-2026.md`, prior evidence ledgers)
existed in this checkout. This is recorded as `RED-TEAM-FINAL.md` finding
**#1 (Critical)**. Rather than inventing the missing history, this session
re-baselines LEADOS honestly: everything below was built, tested, and
measured in this one session. See `docs/PART-DEPENDENCY.md` for the full
account.

## Core seam claims

| Claim | Status | Proof |
|---|---|---|
| Seam 1 — Fitness reads every domain's metrics and never fabricates a score for a domain with no data | Verified | `src/lib/fitness.ts`, `src/lib/fitness.test.ts`, `src/app/api/fitness/route.ts` |
| Seam 2 — Assurance monitors every engine, distinguishes pass/warn/fail/unmonitored/stale | Verified | `src/lib/assurance.ts`, `src/lib/assurance.test.ts`, `src/lib/assuranceData.ts`, `src/app/api/assurance/route.ts` |
| Seam 3 — Chaos experiment outcomes update the target risk's belief score | Verified | `src/lib/chaos.ts`, `src/lib/chaos.test.ts`, `src/app/api/chaos/route.ts` |
| Seam 4 — Global entities flow into a consolidation run, which generates a board pack | Verified | `src/lib/consolidation.ts`, `src/lib/consolidation.test.ts`, `src/app/api/consolidation/route.ts` |
| Seam 5 — Voice-of-customer feedback is ranked by theme urgency and linked to an existing strategy item when one matches | Verified | `src/lib/voc.ts`, `src/lib/voc.test.ts`, `src/app/api/voc/route.ts` |
| Seam 6 — Process mining events feed an automation score per process | Verified | `src/lib/automation.ts`, `src/lib/automation.test.ts`, `src/app/api/automation-score/route.ts` |
| `/api/health` reports real DB connectivity, not a hardcoded 200 | Verified | `src/app/api/health/route.ts` |
| Dashboard renders live, read-only aggregates for all six seams in one view | Verified | `src/app/page.tsx`, `src/lib/dashboard.ts` |
| Board pack discloses its own FX and intercompany-elimination limitations instead of presenting a statutory-looking number | Verified | `src/lib/consolidation.ts` (`buildBoardPackSummary`), `src/lib/consolidation.test.ts` |
| Board pack never softens or hides a negative net result | Verified | `src/lib/consolidation.test.ts` (`surfaces a loss plainly...`) |
| Assurance treats an engine whose last check is older than 90 days as stale, not as a standing pass | Verified | `src/lib/assurance.test.ts` (`a stale check...`) |
| Mutation endpoints reject invalid enum values (assurance result/severity, VoC sentiment, chaos outcome, non-positive process durations) | Verified | `src/app/api/assurance/route.ts`, `src/app/api/voc/route.ts`, `src/app/api/chaos/route.ts`, `src/app/api/process-mining/route.ts` |
| `npm run gate:all` runs lint, typecheck, all seam tests, and ledger:check as one fast-tier command | Verified | `scripts/gate-all.mjs`, `package.json` |
| CI wires the fast and slow tiers to run on every push/PR | Partial | `.github/workflows/ci.yml` exists and is reviewed, but has not been executed by an actual GitHub Actions runner in this sandbox — only the locally-equivalent command sequence has been run and is logged in `docs/VERIFICATION-LOG.md`. |

## Explicitly not implemented (see vision doc for the full list)

| Claim | Status | Notes |
|---|---|---|
| Authentication / authorization / multi-tenant org boundaries | Not implemented | Every API route is open. This is the single largest pre-production blocker. See `docs/RED-TEAM-FINAL.md` #4. |
| Real ML/AI models behind the "engines" table | Not implemented | `engines` and `assuranceChecks` model the *governance contract* (something must be checked, on a schedule, with a severity) — there is no inference code behind any engine. See `docs/RED-TEAM-FINAL.md` #27. |
| Live FX feed / intercompany elimination in consolidation | Not implemented | `fxRateToUsd` is a manually entered snapshot. See `docs/RED-TEAM-FINAL.md` #17–18. |
| External/independent ESG assurance | Not implemented | ESG metrics are self-reported with no evidence attachment. Seeded with a `fail/critical` assurance check on purpose, to not overstate confidence. See `docs/RED-TEAM-FINAL.md` #30–31. |
| Autonomous closed-loop action (sensing → ... → learning without a human in the loop) | Partial | All six seams require a human (or a scheduled job that does not yet exist) to trigger the POST action; nothing runs itself. See `docs/SYSTEM-MAP.md`. |
| Audit log of who changed what | Not implemented | See `docs/RED-TEAM-FINAL.md` #26. |
| 39 prior "parts" of product history | Not present in repository | See "Session 40 starting condition" above and `docs/PART-DEPENDENCY.md`. |

## Quality claims

| Claim | Status | Proof |
|---|---|---|
| Zero duplicated business-logic implementations across API routes and the dashboard | Verified | `src/lib/assuranceData.ts`, `docs/VERIFICATION-LOG.md` |
| All 24 unit tests pass | Verified | `docs/VERIFICATION-LOG.md` |
| TypeScript strict mode compiles with zero errors | Verified | `docs/VERIFICATION-LOG.md` |
| Production build succeeds | Verified | `docs/VERIFICATION-LOG.md` |
