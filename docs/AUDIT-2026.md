# LEADOS Baseline Audit — 2026 (Part 00)

This document is a measurement, not an estimate. Every number below has the exact command that
produced it next to it, run against the repository state at the end of Part 00
(commit: this delivery). Re-run the commands to reproduce.

## 0. Ground-truth finding (read this first)

The standing order for this program describes a repository with a legacy Vite-era single-file
build at the root (`App.tsx`, `main.tsx`, `vite.config.ts`, `index.html`, `engine.ts`, `store.ts`,
`ui.tsx`, `leados-cli.html`), an existing `src/app/routes.ts`, an existing `AI-SESSION-LOG.md`, and
a populated `src/lib` with competing engine implementations (`engine.ts` / `rulesEngine.ts` /
`ruleEngine.ts`, `agentLoop` / `agentCycle` / `autonomousRunner`, compiled `*.js` twins of `*.ts`
sources).

**I read the actual repository before writing anything** (`package.json`, `tsconfig.json`,
`next.config.ts`, `src/db/schema.ts`, `src/db/index.ts`, `eslint.config.mjs`,
`drizzle.config.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`,
`src/app/globals.css`, `postcss.config.mjs`, `.env`) and confirmed: **none of that history exists
in this codebase.** There is no root Vite app, no `routes.ts`, no `AI-SESSION-LOG.md`, no `src/lib`
directory, and no duplicate engine clusters. The repository as found was the generic
`nextjs-postgresql-template` starter: five source files (`src/db/index.ts`, `src/db/schema.ts`
(empty), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`) plus config.

This absence **is** the Part 00 finding and is reported rather than papered over, per the honesty
rules. Section B ("Kill the duality") below documents what was searched for and not found. Every
other section of this audit measures the codebase as it stands after Part 00's changes, which
introduce the layering, repository pattern, governance docs, and first vertical slice (`organizations`
→ `leaders` → readiness scoring) that this program's architecture law (`ARCHITECTURE.md`) requires
going forward.

## 1. LOC per layer, file counts

Command:
```bash
find src/app -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs cat | grep -cve '^\s*$'
find src/lib/app -type f -name "*.ts" | xargs cat | grep -cve '^\s*$'
find src/lib/domain -type f -name "*.ts" | xargs cat | grep -cve '^\s*$'
find src/lib/platform -type f -name "*.ts" | xargs cat | grep -cve '^\s*$'
find src/db -type f -name "*.ts" | xargs cat | grep -cve '^\s*$'
find scripts -type f | xargs cat | grep -cve '^\s*$'
```

| Layer | Files | Non-blank LOC |
|---|---:|---:|
| `src/app/**` (routes/UI, incl. `routes.ts`) | 10 | 541 |
| `src/lib/app/**` (use-cases) | 5 | 99 |
| `src/lib/domain/**` (pure engines) | 1 | 52 |
| `src/lib/platform/**` (db/events/clock/id/config + repositories) | 6 | 207 |
| `src/db/**` (Drizzle client + schema) | 2 | 55 |
| `scripts/**` (seed/reset SQL + Node) | 3 | 82 |
| **Total (`src/` + `scripts/`)** | **28** (`find src scripts -type f \| wc -l`) | **1175 incl. blank lines** (`find src scripts -type f \| xargs wc -l \| tail -1`) |

There are currently **zero** `components/` files as a distinct layer — all UI is inline in route
`page.tsx` files because there is, as yet, only one vertical slice. Flag for Part 01+: once a second
UI surface needs shared markup, extract `src/components/` and add it to the layering diagram before
it accretes ad hoc.

### 15 largest files (by line count)

Command: `find src scripts -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.sql" -o -name "*.mjs" \) -exec wc -l {} \; | sort -rn | head -15`

| Lines | File |
|---:|---|
| 135 | `src/app/leaders/new/page.tsx` |
| 113 | `src/app/routes.ts` |
| 79 | `src/app/page.tsx` |
| 74 | `src/app/leaders/page.tsx` |
| 65 | `src/lib/platform/config.ts` |
| 63 | `src/lib/domain/leadership/readinessEngine.ts` |
| 59 | `src/lib/app/useCases/leaders/registerLeader.ts` |
| 58 | `src/lib/platform/repositories/leaderRepository.ts` |
| 57 | `src/app/organizations/page.tsx` |
| 54 | `src/lib/platform/repositories/eventRepository.ts` |
| 48 | `src/app/layout.tsx` |
| 40 | `src/db/schema.ts` |
| 40 | `src/app/api/leaders/route.ts` |
| 36 | `src/lib/platform/repositories/organizationRepository.ts` |
| 35 | `scripts/seed.mjs` |

No file exceeds 135 lines. There is no file-size problem to manage at this stage; this baseline
exists so later parts can watch for files crossing, say, 300 lines without a corresponding split.

## 2. Route inventory, cross-checked against `src/app/routes.ts`

Command: `find src/app -name "page.tsx" -o -name "route.ts" | sort`, compared field-by-field against
`routes` exported from `src/app/routes.ts`.

| Path | Kind | File | Domain | Status | Backing engine |
|---|---|---|---|---|---|
| `/` | page | `src/app/page.tsx` | dashboard | **live** | `getDashboardSummary()` → 3 repositories |
| `/organizations` | page | `src/app/organizations/page.tsx` | organizations | **live** | `createOrganization()`, `listOrganizations()` |
| `/leaders` | page | `src/app/leaders/page.tsx` | leaders | **live** | `listLeaders()` |
| `/leaders/new` | page | `src/app/leaders/new/page.tsx` | leaders | **live** | `registerLeader()` → `computeReadiness()` |
| `/api/health` | api (GET) | `src/app/api/health/route.ts` | platform | **live** | `validateConfig()` + `select 1` |
| `/api/organizations` | api (GET, POST) | `src/app/api/organizations/route.ts` | organizations | **live** | same use cases as the page |
| `/api/leaders` | api (GET, POST) | `src/app/api/leaders/route.ts` | leaders | **live** | same use cases as the page |

**Mismatch check result: 0 mismatches.** Every file on disk under `src/app/**/page.tsx` and
`src/app/**/route.ts` has exactly one row in `routes.ts`, and vice versa. There are no `stub` or
`partial` routes in this baseline — Part 00 only ships what it can back with a real repository and,
where relevant, a real domain engine, per the no-stub rule in the standing order. `src/app/routes.ts`
exports `findMismatches()` so this check is mechanical, not a one-time manual claim: any future PR
can call it against a list of files found by `find` in a script and fail CI on drift. That wiring
into CI itself is **not yet done** (see Adversarial self-review, Q5) — today it is a function that
exists and was exercised manually for this audit, not an automated gate.

## 3. Engine inventory (`src/lib/**`)

| Module | Exports | Consumers | Role |
|---|---|---|---|
| `src/lib/domain/leadership/readinessEngine.ts` | `computeReadiness`, `ReadinessInputs`, `ReadinessResult`, `ReadinessBand` | `src/lib/app/useCases/leaders/registerLeader.ts` | Pure scoring engine: 3 observable inputs → score + band + rationale. Zero I/O, verified by the lint boundary rule (see §5). |
| `src/lib/app/useCases/organizations/createOrganization.ts` | `createOrganization` | `src/app/organizations/page.tsx`, `src/app/api/organizations/route.ts` | Orchestration: validates, persists via repository, appends event. |
| `src/lib/app/useCases/organizations/listOrganizations.ts` | `listOrganizations` | `src/app/organizations/page.tsx`, `src/app/api/organizations/route.ts`, `src/app/leaders/new/page.tsx` | Read-only orchestration. |
| `src/lib/app/useCases/leaders/registerLeader.ts` | `registerLeader` | `src/app/leaders/new/page.tsx`, `src/app/api/leaders/route.ts` | Orchestration: validates, calls the pure engine, persists, appends event. |
| `src/lib/app/useCases/leaders/listLeaders.ts` | `listLeaders` | `src/app/leaders/page.tsx`, `src/app/api/leaders/route.ts` | Read-only orchestration. |
| `src/lib/app/useCases/dashboard/getDashboardSummary.ts` | `getDashboardSummary`, `DashboardSummary` | `src/app/page.tsx` | Aggregates 3 repositories for the dashboard. |
| `src/lib/platform/repositories/organizationRepository.ts` | `organizationRepository` | `createOrganization`, `listOrganizations`, `registerLeader`, `getDashboardSummary` | Only module (with its peers) allowed to import `@/db` for `organizations`. |
| `src/lib/platform/repositories/leaderRepository.ts` | `leaderRepository` | `registerLeader`, `listLeaders`, `getDashboardSummary` | Only module allowed to import `@/db` for `leaders`. |
| `src/lib/platform/repositories/eventRepository.ts` | `eventRepository` | `createOrganization`, `registerLeader`, `getDashboardSummary` | Only module allowed to import `@/db` for `event_log`. |
| `src/lib/platform/clock.ts` | `systemClock`, `Clock` | *orphan today* — introduced so domain/app code never calls `Date.now()` directly; first real consumer lands when a part needs time-based business logic (e.g. decision-latency windows). | Time seam. |
| `src/lib/platform/id.ts` | `systemIdGenerator`, `IdGenerator` | `createOrganization`, `registerLeader` | Identity seam used by both mutating use cases. |
| `src/lib/platform/config.ts` | `validateConfig`, `ConfigValidationError`, `ValidatedConfig` | `src/instrumentation.ts`, `src/app/api/health/route.ts` | Boot-time env validation. |

**Duplicated/competing implementations found: none.** There is exactly one module per
responsibility (one readiness engine, one of each repository, one config validator). This is
expected for a from-scratch Part 00 baseline; it is the opposite problem the standing order
anticipated (several competing `engine.ts`/`rulesEngine.ts` clusters) and is reported honestly
rather than invented to match the brief.

**Orphan flagged:** `src/lib/platform/clock.ts`'s `systemClock` has no consumer yet. It is kept
because `eventRepository`/`leaderRepository` rows already have `createdAt` defaults supplied by
Postgres (`defaultNow()`), not by this seam — the first domain engine that needs "now" as an input
(e.g. a time-decaying readiness score) should inject `systemClock.now()` from its calling use case.
Recommendation: do not delete; it is 6 lines and documents the intended pattern for ADR-0002.

## 4. Measured baseline numbers

| Metric | Command | Result |
|---|---|---|
| TypeScript errors | `npm exec tsc -- --noEmit --pretty false 2>&1 \| tee /tmp/tsc.log; grep -c 'error TS' /tmp/tsc.log` | **0** |
| ESLint errors | `npx eslint . --format json` then summed `errorCount` across all files | **0** |
| ESLint warnings | same command, summed `warningCount` | **0** |
| Files linted | same command, `.length` of the report array | **29** |
| `next build` wall time | `date +%s%N` before/after `npm run build` | **≈6.8s** (6806 ms, Turbopack, this sandbox; expect variance across machines — see Adversarial self-review Q1) |
| `.next` total output size | `du -sh .next` | **11M** |
| `.next/static` size | `du -sh .next/static` | **669K** |
| Postgres tables | `psql ... -c "select table_name from information_schema.tables where table_schema='public' order by 1;"` | **3**: `event_log`, `leaders`, `organizations` |
| Seeded rows | `select count(*) from organizations/leaders/event_log` after `npm run db:seed` | organizations=2, leaders=2, event_log=1 |

## 5. Lint boundary enforcement proof

Command used to prove the rule actually fires (not just exists in config), run during this audit
and reverted immediately after:
```bash
# temporarily prepend a forbidden import to the pure engine
echo 'import { db } from "@/db";' | cat - src/lib/domain/leadership/readinessEngine.ts > /tmp/t.ts \
  && mv /tmp/t.ts src/lib/domain/leadership/readinessEngine.ts
npx eslint src/lib/domain/leadership/readinessEngine.ts
```
Result: 2 errors from `import/no-restricted-paths`, both naming the exact rule text configured in
`eslint.config.mjs`. The file was restored immediately afterward and `npx eslint .` confirmed clean
(0 errors, 0 warnings) in the delivered state.

## B. Legacy duality search (explicit, so this claim is checkable)

Commands run against the repository root before any file was created:
```bash
ls -la                      # only: .env, drizzle.config.json, eslint.config.mjs, next.config.ts,
                             # node_modules, package-lock.json, package.json, postcss.config.mjs, src, tsconfig.json
find . -maxdepth 2 -iname "App.tsx" -o -iname "main.tsx" -o -iname "vite.config.ts" \
  -o -iname "index.html" -o -iname "engine.ts" -o -iname "store.ts" -o -iname "ui.tsx" \
  -o -iname "leados-cli.html"
```
No matches. **Conclusion: there is no legacy Vite-era app to migrate away from in this repository.**
The canonical app is, and remains, the Next.js app rooted at `src/`. No files were moved to
`deprecated/`; `deprecated/README.md` documents this search so a future session does not waste time
looking for files that were never there.
