# ADR-0006: A zero-build, local-first application at the repository root is the canonical LeadOS

## Status

Accepted — 2026-10-24. Supersedes [ADR-0001](./0001-canonical-app.md) ("the Next.js app under
`src/` is the single canonical application"), which was written before anyone attempted to run
that app.

## Context

The repository contained four applications and none of them ran.

Measured on 2026-10-24 (see `docs/AUDIT-2026-10-24.md` for the full transcript):

| Tree | What it claims to be | What it does |
|---|---|---|
| `src/**` + root `App.tsx`/`main.tsx` (Next.js 16, Drizzle, Postgres, 262 pages) | The product | `npx tsc --noEmit`: **6,879 errors, 352 missing modules**. `src/db` — imported by 200+ files — does not exist. `vite` is not installed. No `DATABASE_URL`. |
| root Vite entry (`index.html` → `src/main.tsx`) | A second console | References a module graph that is not present; cannot be served. |
| `public/index.html` (single file, ~70 KB) | A self-contained console | Loads. One syntax error (a `T_T_*/G_L_*` inside a block comment) made it a blank page; fixed this session. Synthetic data only, no data entry. |
| `deprecated/`, `leados-cli.html`, `docs/` (53 files), `openapi.yaml` | Documentation of all of the above | Describes products that do not exist here, in some cases in the present tense. |

The owner of this repository is a first-time leader, not an engineer. Being asked to choose a
framework, provision Postgres or debug a type graph is a failure of the product, not a task for the
user. Meanwhile the leadership content that exists in these trees is genuinely good: a rule engine
with severity and evidence, agenda generation, readiness gating, a decision log with rationale and
review. The problem is not the ideas. The problem is that no one can open it.

Two further constraints came from the standing brief: no new dependencies or framework swaps
without explicit justification, and no rewrite without an explicit, flagged justification.

## Decision

**`index.html` + `app/**` at the repository root is the canonical LeadOS application.** It is plain
ES modules, plain CSS and zero runtime dependencies. `scripts/serve.mjs` (Node standard library
only) serves it over HTTP because ES modules do not load from `file://`.

Structure:

- `app/core/` — pure domain: `time`, `schema`, `store`, `demo`, `domain/*`. No DOM, no implicit
  clock, no hidden storage. Testable in Node with no browser.
- `app/actions.js` — every write returns `{ok, error, field}`; no DOM.
- `app/ui/` — rendering primitives, charts, dialogs, option lists.
- `app/views/` — one renderer per route.
- `app/main.js` — router, context, shell, error boundary.
- `tests/app/` — `node --test` with jsdom for integration. 82 tests.

The legacy trees are **left in place and documented as non-canonical**, not deleted. The old root
Vite entry is preserved at `deprecated/vite-index.html`.

## Why this is a rewrite and why it is justified

The brief permits a rewrite only with explicit justification flagged before doing it. This is that
flag, written after the audit and before the build, and it is repeated in the session log.

The justification is not "the old code is bad". It is:

1. **Nothing in the repository could execute.** A product whose entry point throws is not a product
   with bugs; it has no surface to improve.
2. **The repair cost is a rewrite anyway.** Restoring `src/**` requires recreating an absent data
   layer, a database, 352 modules and 6,879 type errors — then still doing the product work. That
   is a rewrite with extra steps and higher risk.
3. **The domain logic was salvageable without the framework.** Rule evaluation, agenda generation,
   readiness gating and decision review are pure functions over records. They were re-expressed as
   pure modules and now have tests, which they never had before.
4. **The constraints point this way.** "No new dependencies, no backend, no network" is exactly a
   static app with `localStorage`. It is also the only architecture that guarantees the privacy
   claim a first-time leader needs in order to type honest notes about their team.

## Consequences

**Good**

- One entry point, one test command, no install step, no build step, no database.
- The domain is testable in isolation: 36 domain tests run in milliseconds.
- Data stays on the device; there is no server to leak it and no account to create.
- Deployable as static files anywhere.

**Bad / accepted costs**

- `localStorage` is not durable: clearing site data destroys the workspace. Mitigated with export,
  a visible storage footprint, and a quarantine path for corrupt blobs — not solved.
- No multi-user, no org hierarchy, no upward feedback. These need a backend, which needs an ADR of
  its own.
- Hand-rolled UI primitives instead of a component library. Deliberate: a dependency would need a
  build step, and the accessibility work here (focus trap, focus return, `aria-live`, AA contrast)
  is small enough to own outright.
- The repository still *contains* two dead trees, which is confusing for anyone who reads the tree
  before the README. The README and this ADR are the mitigation.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Repair `src/**` | Requires the missing data layer, a Postgres instance and a full type repair before any product work. Not achievable in a session, and it would leave the owner unable to run anything in the meantime. |
| Promote `public/index.html` | Real renderer, good content, but synthetic-only data and no write path: it is a demo, not a workspace. Kept as a sandbox. |
| Add Vite/React | A build step, a toolchain and `node_modules` to get what plain ES modules already do at this scale. Also a dependency, which the brief forbids without justification. |
| Single-file app (one giant `index.html`) | Easiest to open, impossible to test in parts and hostile to the separation-of-concerns requirement. |
| Keep four apps and let the owner choose | Transfers an engineering decision to someone who explicitly must not be asked for technical choices. |
