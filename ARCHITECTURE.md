# LEADOS Architecture

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ src/app                                                          │
│   Next.js App Router: pages, layouts, API route handlers.        │
│   Owns HTTP concerns (parsing requests, status codes, Metadata). │
│   May import from src/lib/app only.                              │
└───────────────────────────┬───────────────────────────────────────┘
                             │ imports
┌───────────────────────────▼───────────────────────────────────────┐
│ src/lib/app                                                        │
│   Use-cases / application services. Orchestrates domain engines    │
│   and platform repositories to fulfil one request. No HTTP-shaped  │
│   types (no `Request`/`Response`) and no direct Drizzle imports.   │
│   May import from src/lib/domain and src/lib/platform.             │
└───────────────────────────┬───────────────────────────────────────┘
                 ┌───────────┴───────────┐
                 │ imports               │ imports
┌────────────────▼────────────────┐   ┌──▼──────────────────────────┐
│ src/lib/domain                  │   │ src/lib/platform             │
│   Pure, server-agnostic engines │   │ Postgres (Drizzle), storage, │
│   and types. No I/O. No Next.js │   │ events, env/config. The only │
│   imports. No Drizzle imports.  │   │ layer allowed to import      │
│   Fully unit-testable with no   │   │ `src/db/*` or `pg`.          │
│   environment/mocking needed.   │   │                               │
└──────────────────────────────────┘   └───────────────────────────────┘
```

## Dependency rule

`src/app` → `src/lib/app` → `src/lib/domain` → `src/lib/platform`

- **`src/lib/domain` must never import from `src/lib/platform` or `src/app`.**
  Domain engines (future Signal Board scoring, Thermodynamics/entropy math,
  CAS feedback-loop detection, Risk Register amplification — see
  `FEATURES.md` for current status) are pure functions over plain data.
  They must be testable without a database connection.
- **`src/lib/platform` must never import from `src/lib/domain` or
  `src/lib/app`.** It depends only on `src/db` (Drizzle), Node built-ins,
  and third-party infra SDKs. It exposes narrow repository functions
  (e.g. `insertEvent`, `listEvents` in
  `src/lib/platform/db/eventsRepository.ts`) that return domain types
  (`src/lib/domain/types.ts`), not Drizzle row types directly.
- **`src/lib/app` is the only layer allowed to import from both `domain`
  and `platform`.** This is where validation (domain) and persistence
  (platform) get wired together into one use-case
  (`src/lib/app/events/recordEvent.ts` is the reference example).
- **`src/app` only talks to `src/lib/app`.** Route handlers and pages do
  not import `@/db`, `drizzle-orm`, or anything under `src/lib/domain`
  directly. (The one intentional exception today: `src/app/page.tsx` and
  `src/app/api/health/route.ts` call `db.execute(sql\`select 1\`)` directly
  as an infrastructure liveness check — this is deliberate and documented,
  not a violation of the rule for business logic.)

## Repository layer

`src/lib/platform/db/eventsRepository.ts` is the first (and, as of Part 0,
only) repository. It wraps the existing Drizzle client exported from
`src/db/index.ts` — the Drizzle client itself was not rewritten, only
isolated behind a narrow function-based API:

- `insertEvent(input): Promise<EventRecord>`
- `listEvents(limit): Promise<EventRecord[]>`
- `getEventById(id): Promise<EventRecord | undefined>`
- `countEvents(): Promise<number>`

Every future table (Signals, Findings, RiskRegisterEntries, AuditLog
entries, etc.) should get its own `*Repository.ts` file in
`src/lib/platform/db/` following this exact shape: plain async functions,
no leaking of Drizzle's query builder types past the function boundary.

## Versioned event schema registry

- `src/lib/domain/eventCatalog.ts` — the list of known `{type, version,
  description}` triples. This is the registry of record.
- `src/lib/domain/eventSchema.ts` — a `zod` schema for every catalog entry,
  keyed by `"type:version"`, plus `validateEventPayload()` which the
  `recordEvent` use-case calls before anything touches Postgres. The module
  throws at load time if the catalog and the schema map ever drift apart,
  so an un-implemented catalog entry cannot ship silently.
- `src/db/schema.ts` defines the `events` table itself: `id`, `type`,
  `version`, `payload` (`jsonb`), `createdAt`. The database layer trusts
  that validation already happened; it does not re-validate JSON shape.

## One typed domain model

`src/lib/domain/types.ts` is the single canonical domain model file. There
is no pre-existing `src/lib/types.ts` / `clientTypes.ts` pair to
consolidate in this codebase today (see the provenance note in
`AI-SESSION-LOG.md` for why), so there are no re-export shims yet — but
this is the file future parts must extend, and it is the only acceptable
home for new domain types. Do not create a second "types.ts" anywhere
else in the tree.

## Where modules belong (decision table for future parts)

| Kind of code | Lives in | Example today |
| --- | --- | --- |
| HTTP route handlers, pages, layouts | `src/app/**` | `src/app/api/events/route.ts` |
| Route manifest (for docs + nav) | `src/app/routes.ts` | — |
| Use-cases (one per user action) | `src/lib/app/<domain>/<verb>.ts` | `src/lib/app/events/recordEvent.ts` |
| Pure engines & calculations | `src/lib/domain/<engine>.ts` | *(none yet — Parts 1-14)* |
| Shared domain types | `src/lib/domain/types.ts` | `EventRecord`, `Result<T, E>` |
| Event catalog / schema registry | `src/lib/domain/eventCatalog.ts`, `eventSchema.ts` | `system.ping`, `system.annotation` |
| Postgres repositories | `src/lib/platform/db/<name>Repository.ts` | `eventsRepository.ts` |
| Drizzle schema (tables) | `src/db/schema.ts` | `events` |
| Drizzle client / connection pool | `src/db/index.ts` | `db`, `pool` |
| Environment/config loading | `src/lib/platform/env.ts` | `env` |
| Cross-cutting infra (future: event bus, object storage, queues) | `src/lib/platform/<concern>/` | *(none yet)* |

## On the "duality" this part was asked to resolve

Part 0's brief describes a pre-existing codebase with a root-level
Vite/vanilla single-file build (`App.tsx`, `main.tsx`, `vite.config.ts`,
`index.html`, `engine.ts`, `store.ts`, `leados-cli.html`) duplicating a
`src/` Next.js App Router app, plus roughly 200 existing `src/lib`
modules, `src/app/lib/eventSchema.ts`/`eventCatalog.ts`, and a
`scripts/seed_financial.sql`.

**None of that exists in the repository this session actually has write
access to.** The working tree started as the bare `nextjs-postgresql-template`
starter: `package.json`, `src/db/{index,schema}.ts`,
`src/app/{layout,page,globals.css}`, `src/app/api/health/route.ts`,
`drizzle.config.json`, `tsconfig.json`, `next.config.ts`,
`eslint.config.mjs`, `postcss.config.mjs`, `.env`. There was no root
`App.tsx`/`index.html`/`vite.config.ts` to remove, no compiled `.js` twins
of `.ts` sources, and no `deprecated/` quarantine was needed because there
was nothing to quarantine — this is recorded in full in
`AI-SESSION-LOG.md` so nobody re-derives a different story from the repo
history later.

Given that, this part did the part of the mission that is still
meaningful against the real tree: establish the layer boundaries, the
repository pattern, the versioned event registry, and the documentation
contract (`README.md`, `FEATURES.md`, `docs/CONFIG.md`, this file) that
every later part is measured against — so that if/when the larger
LEADOS codebase described in the brief is merged into this tree, it has
exactly one place to land in each layer instead of recreating the
duality described in the brief.
