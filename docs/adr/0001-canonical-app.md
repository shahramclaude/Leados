# ADR-0001: The Next.js app under `src/` is the single canonical LEADOS application

## Status
Accepted — Part 00.

## Context
The standing order for this transformation program assumes a repository with a legacy Vite-era
single-file build at the root (`App.tsx`, `main.tsx`, `vite.config.ts`, `index.html`, `engine.ts`,
`store.ts`, `ui.tsx`, `leados-cli.html`) competing with a Next.js app under `src/`, and directs this
part to pick one canonical app and retire the other. `docs/AUDIT-2026.md` §B documents the actual
search performed against the real repository: `ls -la` at the root and a `find` for every filename
named in the standing order, both run before any file in this delivery was created. Neither found
anything — the repository as received was the generic `nextjs-postgresql-template` starter, with a
single application already living under `src/`.

## Decision
The Next.js 16 (App Router) application rooted at `src/app/`, using `src/db` for persistence via
Drizzle, is the one and only canonical LEADOS application. There is no second app to retire because
none exists. `deprecated/README.md` documents the search so a future session does not repeat it or
assume one was missed.

## Consequences
- All 21 parts of this program build exclusively inside `src/` (routes in `src/app/**`, logic in
  `src/lib/**`, schema in `src/db/schema.ts`).
- If a legacy artifact matching the standing order's description ever appears (e.g. via a branch
  merge from a different history), the default action is: move it to `deprecated/` with a
  one-paragraph README per file, do not merge it into `src/`, and re-open this ADR rather than
  silently accepting a second app.
- The root of the repository has exactly one obvious entry point: `npm run dev` / `npm run build` /
  `npm run start`, all defined in `package.json` and all operating on `src/`.

## Alternatives considered
- **Wait and re-audit in a later part, in case the legacy files appear later.** Rejected: the
  standing order requires a decision now, and the audit is exact and reproducible (see the commands
  in `docs/AUDIT-2026.md` §B) — there is nothing to gain by deferring a decision with no competing
  evidence.
- **Scaffold a placeholder Vite app to "migrate away from" so the exercise matches the brief
  literally.** Rejected outright: this would be fabricating history to satisfy a template, which
  directly violates the honesty rules governing this program.
