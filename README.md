# LEADOS

LEADOS is an autonomous leadership-intelligence operating system. This
repository is its Next.js (App Router) + PostgreSQL implementation.

**Read this before anything else:** this README describes the codebase
that actually exists in this working tree today, not an aspirational
future state. For the full list of what is implemented vs. planned, see
[`FEATURES.md`](./FEATURES.md). For the layer rules, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md). For environment variables, see
[`docs/CONFIG.md`](./docs/CONFIG.md). For why this README doesn't describe
a Signal Board / Thermodynamics / CAS engine / Risk Register yet, see the
"Scope of this build" section below and `AI-SESSION-LOG.md`.

## What LEADOS is

An operating system for leadership intelligence: an append-only,
versioned event log at its core, with pure domain engines layered on top
that turn raw events into signals, systemic-dynamics analysis, and risk
intelligence. Part 0 of this build establishes that core — the event log,
its schema registry, and the architectural layering — so that later parts
can add real engines without re-litigating where code belongs.

## Scope of this build (Part 0 — Ground Truth & Architecture Foundation)

This part's job was consolidation, not new features: one canonical app,
honest branding, one typed domain model, a repository layer, a feature
registry, and config hygiene. Concretely, in this working tree, that
meant:

- Confirming there is exactly **one app** in the repository — the Next.js
  App Router app under `src/` — and that there is no legacy
  Vite/vanilla-JS duplicate to remove. (A different artifact describing
  such a duplicate exists on GitHub; it is not part of this working tree.
  See `AI-SESSION-LOG.md` for the full provenance note.)
- Renaming the project from the generic `nextjs-postgresql-template` /
  "Arena Next.js PostgreSQL Starter" to **LEADOS** everywhere
  (`package.json`, `src/app/layout.tsx` metadata, this README).
- Introducing the layer architecture (`src/app` → `src/lib/app` →
  `src/lib/domain` → `src/lib/platform`) with a real repository layer
  (`src/lib/platform/db/eventsRepository.ts`) instead of routes calling
  Drizzle directly.
- Introducing one canonical domain model (`src/lib/domain/types.ts`) and a
  versioned event schema registry (`src/lib/domain/eventCatalog.ts` +
  `eventSchema.ts`, validated with `zod`) that every row written to the
  new `events` table must pass through.
- Fail-fast environment validation (`src/lib/platform/env.ts`) so a
  missing `DATABASE_URL` produces one clear error at boot, not a cryptic
  failure three layers down.
- `db:migrate` / `db:seed` / `db:studio` scripts so a fresh clone reaches
  a running, non-empty app in three commands (see "Run it" below).

## Route table

Source of truth: [`src/app/routes.ts`](./src/app/routes.ts).

| Path | Kind | Label | Status |
| --- | --- | --- | --- |
| `/` | page | System Status | live |
| `/api/health` | api | Health Check | live |
| `/api/events` | api | Event Ingestion & Log API | live |

## API surface

### Platform / infrastructure

- `GET /api/health` → `{ ok: boolean, service: "leados", database: "connected" \| "unreachable", error?: string }`
  Executes `select 1` against Postgres through Drizzle. Used by
  `build_and_start` and any external uptime monitor.

### Events (the shared backbone every future domain engine writes to)

- `GET /api/events?limit=20` → `{ total: number, recent: EventRecord[] }`
  Returns the most recent events (default 20, max 200) plus a total count.
- `POST /api/events` with JSON body `{ type: string, version: number, payload: unknown }`
  Validates `payload` against the schema registered for `type`/`version`
  in `src/lib/domain/eventSchema.ts` (backed by the catalog in
  `src/lib/domain/eventCatalog.ts`). Returns `201` with the persisted
  `EventRecord` on success, or `400` with `{ error: string }` if the type
  is unknown or the payload fails validation.

  Registered event types today:
  - `system.ping` v1 — `{ message: string }`
  - `system.annotation` v1 — `{ title: string, body: string, tags?: string[] }`

## Data model

One table exists today: `events` (`src/db/schema.ts`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `serial` primary key | |
| `type` | `varchar(255)` | Dot-namespaced, e.g. `system.ping`. Must exist in `eventCatalog.ts`. |
| `version` | `integer` | Schema version for `type`. Must exist in `eventCatalog.ts`. |
| `payload` | `jsonb` | Validated against the matching `zod` schema before insert. |
| `created_at` | `timestamptz` | Defaults to `now()`. |

This is intentionally the only table. Every future engine (Signal Board,
Thermodynamics, CAS, Risk Register — see `FEATURES.md` → Roadmap) gets its
own table(s) and its own repository file in `src/lib/platform/db/` when
it's actually built, not speculatively now.

## Run it

Three commands from a fresh clone (Postgres must be reachable at the
connection string in `.env` — see `docs/CONFIG.md`):

```bash
npm install
npm run db:migrate   # drizzle-kit push — creates the events table
npm run db:seed      # inserts 2 example events so the UI isn't empty
npm run dev           # http://localhost:3000
```

Other scripts:

```bash
npm run build         # production build
npm run start         # run the production build
npm run lint          # eslint
npm run typecheck      # tsc --noEmit
npm run db:studio     # drizzle-kit studio (visual DB browser)
```

## Current capabilities vs. roadmap

| Capability | Status | Evidence |
| --- | --- | --- |
| Next.js App Router app, single canonical entry point | live | `src/app/**`, no competing root app |
| Postgres via Drizzle, fail-fast config | live | `src/db/index.ts`, `src/lib/platform/env.ts` |
| Layered architecture + repository pattern | live | `ARCHITECTURE.md`, `src/lib/platform/db/eventsRepository.ts` |
| Versioned event schema registry | live | `src/lib/domain/eventCatalog.ts`, `eventSchema.ts` |
| Event ingestion + log API and UI | live | `src/app/api/events/route.ts`, `src/app/page.tsx` |
| Signal Board | not started | see `FEATURES.md` → Roadmap |
| Thermodynamics (entropy/SNR/bottlenecks) | not started | see `FEATURES.md` → Roadmap |
| CAS engine (loops/bifurcations/attractors) | not started | see `FEATURES.md` → Roadmap |
| Risk Register | not started | see `FEATURES.md` → Roadmap |
| Command palette | not started | see `FEATURES.md` → Roadmap |

## Project layout

```
src/
  app/                 Next.js App Router: pages + API routes (HTTP layer only)
    api/health/route.ts
    api/events/route.ts
    routes.ts           canonical route manifest
    page.tsx, layout.tsx
  lib/
    app/events/         use-cases (recordEvent, listEvents)
    domain/             pure types + event catalog + schema registry
    platform/           env config + Postgres repositories
  db/
    schema.ts           Drizzle table definitions
    index.ts             Drizzle client / connection pool
docs/CONFIG.md          environment variable reference
scripts/seed.mjs        idempotent local dev seed
ARCHITECTURE.md         layer diagram + dependency rules
FEATURES.md             feature registry (route/API/engine/status)
AI-SESSION-LOG.md       session-by-session change log
```
