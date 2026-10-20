# History / provenance notes

This folder holds superseded or stale material that's kept for provenance
rather than silently deleted, per the project convention that the repo
should never contradict itself.

## 2026-10-20 — Provenance note on the upstream `shahramclaude/Leados` repository

This working tree did not start from an export of the live
`shahramclaude/Leados` GitHub repository's `main` branch. It started from a
blank Next.js + Drizzle + PostgreSQL starter template. The upstream `main`
branch was read (cloned and inspected) for context before this part's work
began, per the standing "read before write" order, but was **not** used as
a base because, as verified directly (not assumed):

- `npx tsc --noEmit` against that branch reports 2,863 TypeScript errors
  (2,343 of them inside `src/`).
- `src/db/schema.ts` on that branch defines 6 tables, while ~150 files
  under `src/app/api/**` import dozens of tables/columns/helpers that do
  not exist anywhere in the branch (e.g. `events`, `decisions`, `findings`,
  `comments`, `agentCycleRuns`, `lib/seed.ts#ensureBaselineData`,
  `lib/api.ts#withErrorHandling`).
- The repository root also contains a full, separate, pre-Next.js (Vite)
  application (`App.tsx`, `Shell.tsx`, `index.html`, `vite.config.ts`, and
  ~35 more files) that branch's own `README.md` explicitly claims is "not
  part of this working tree" — a claim contradicted by the files actually
  present in the clone.
- No `Dockerfile`, `docker-compose*.yml`, `deploy-production.sh`, or
  `CHANGELOG.md` exist anywhere in that repository.

Full reasoning and the decision this session made in response is recorded
as an ADR: see `docs/adr/0001-scope-given-upstream-repo-state.md`. No files
from the upstream `main` branch are reproduced here — this note exists so
a future reader of this repository's history understands why its
`README.md`/`CHANGELOG.md`/`FEATURES.md` describe a different (smaller,
but real and verified) feature set than a casual GitHub browse of
`shahramclaude/Leados` might suggest, and so nobody re-derives the same
2,863 errors from a cold start before finding this note.

There are no other legacy session logs or status reports in this working
tree to migrate here — this tree's own prior history is exactly what's in
`AI-SESSION-LOG.md`.
