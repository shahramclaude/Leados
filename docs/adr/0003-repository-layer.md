# ADR-0003: All Postgres access goes through `src/lib/platform/repositories/`

## Status
Accepted — Part 00.

## Context
`src/db/index.ts` exports a raw Drizzle client (`db`) and a `pg` `Pool`. Without a boundary, every
route handler, server component, and use case tends to import `db` directly and write its own
Drizzle query, which means: (a) query logic for the same table is duplicated and drifts, (b) there
is no single place to add caching, tenancy filters, or soft-delete semantics later, and (c) the
`import/no-restricted-paths` lint rule in `eslint.config.mjs` has nothing precise to restrict — "no
one may import `@/db`" is too strong (someone has to), and "anyone may import `@/db`" enforces
nothing.

## Decision
Introduce `src/lib/platform/repositories/`, one file per table (`organizationRepository.ts`,
`leaderRepository.ts`, `eventRepository.ts` today), each exporting a plain object of async functions
(`create`, `list`, `findById`, `count`, etc.) that are the only call sites in the codebase allowed to
import `@/db` and the Drizzle table objects from `@/db/schema`, with one documented exception
(`src/app/api/health/route.ts`, a liveness probe — see `ARCHITECTURE.md` rule 5). This is enforced,
not just documented: `eslint.config.mjs`'s `import/no-restricted-paths` zone blocks `@/db` imports
from `src/lib/app/**` and `src/lib/domain/**`.

## Consequences
- Every use case in `src/lib/app/useCases/**` reads/writes Postgres by calling a repository function,
  never by importing `db` or a table object itself.
- Adding a column, a cache, or a tenancy filter to how `leaders` are read means editing
  `leaderRepository.ts` once, not auditing every call site.
- This part wraps existing Drizzle calls (there were none before Part 00) rather than rewriting
  engines, matching the standing order's explicit instruction to not rewrite engines in this part —
  there were no pre-existing engines to preserve, so the repositories here are new, minimal, and
  table-shaped, not a refactor of legacy query code.

## Alternatives considered
- **A single generic repository/DAO with a `table` parameter.** Rejected: it would type-erase the
  Drizzle schema and push every caller back to writing raw `where`/`orderBy` clauses, defeating the
  purpose.
- **An ORM-agnostic repository interface (ports-and-adapters) in case Drizzle is replaced later.**
  Deferred, not rejected: at 3 tables and 1 database driver, an abstraction over the abstraction is
  premature. If a second datastore (e.g. a vector store for the agent loop in later parts) is added,
  revisit this ADR rather than generalizing today against a requirement that doesn't exist yet.
