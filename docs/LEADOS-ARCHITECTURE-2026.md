# LEADOS Architecture (2026 baseline)

This document describes the system as built in this session. It supersedes
no prior architecture document because none existed in this repository
(see `docs/PART-DEPENDENCY.md`).

## Stack

- **Next.js 16 (App Router)**, React 19 server components for all reads,
  one shared client component (`src/components/ActionForm.tsx`) for all
  writes.
- **PostgreSQL** via **Drizzle ORM** (`src/db/schema.ts`, `src/db/index.ts`).
  A single connection pool, reused across requests.
- **Vitest** for unit tests of business logic (`src/lib/*.test.ts`).
- **Tailwind CSS v4** for styling, no component library.
- No external services, queues, or background workers in this build.

## Layering

```
src/app/api/*/route.ts    <- HTTP boundary: validates input, calls db + lib, returns JSON
src/lib/*.ts (pure)        <- business logic: computeFitnessScore, summarizeAssurance,
                              applyChaosToRisk, runConsolidation, rankVocThemes,
                              computeAutomationScore — no I/O, 100% unit-testable
src/lib/assuranceData.ts   <- the one exception: a thin DB-reading orchestrator shared
src/lib/dashboard.ts          by the dashboard and the assurance API route, so there is
                              exactly one implementation of "latest check per engine"
                              and one of "read everything for the dashboard"
src/db/schema.ts            <- the one source of truth for every table
src/app/page.tsx            <- the one dashboard, reads via lib/dashboard.ts,
                              writes via ActionForm -> the same API routes
```

## Why business logic is pure

Every seam's core calculation (`computeFitnessScore`, `summarizeAssurance`,
`applyChaosToRisk`, `runConsolidation` + `buildBoardPackSummary`,
`rankVocThemes` + `suggestStrategyLink`, `computeAutomationScore`) takes
plain data in and returns plain data out. This means:

- Unit tests run in milliseconds with no database, in CI without a Postgres
  container if needed (though CI here does run one, to also exercise the
  routes end-to-end via `build_and_start`).
- The same function can be reused by an API route, a background job (not
  yet built), or a CLI script without duplication.
- The "gaming" surface (see `docs/RED-TEAM-FINAL.md`) is isolated to a
  single, auditable function per seam.

## Data model (six seam tables + supporting tables)

See `src/db/schema.ts` for the authoritative definitions. Grouped by seam:

1. `domains`, `metrics`, `fitness_scores`
2. `engines`, `assurance_checks`
3. `risks`, `chaos_experiments`
4. `entities`, `consolidation_runs`, `board_packs`
5. `strategy_items`, `voc_feedback`
6. `process_events`, `automation_scores`

## Deliberate non-goals of this architecture (see vision doc for the full list)

- No auth/identity layer yet — every route is open. This is the top
  pre-production blocker (`docs/RED-TEAM-FINAL.md` #4).
- No background scheduler — every seam is triggered by an explicit API call
  (human via the dashboard, or a script/external caller).
- No real ML models behind "engines" — the engine/assurance tables model the
  *governance contract* a real model would need to satisfy, not an actual
  inference pipeline.
- No multi-tenant boundary — this is a single-organization data model.

## Request flow example (Seam 4, end to end)

1. Seed or a caller `POST /api/entities` for several entities in a period.
2. A human clicks "Run consolidation" on the dashboard (`ActionForm` →
   `POST /api/consolidation` with `{ period }`).
3. The route loads all entities for that period, calls the pure
   `runConsolidation()` function, persists a `consolidationRuns` row, calls
   `buildBoardPackSummary()`, persists a `boardPacks` row, and returns both.
4. `router.refresh()` re-renders the server component, which re-reads the
   latest board pack from the database and displays it — including its own
   FX/elimination disclosure and, if applicable, an un-softened loss
   warning.
