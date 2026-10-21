# Contributing to LEADOS

Thanks for working on LEADOS. This document is the single source of truth for dev setup, code
style, test expectations, and the PR checklist. If something here is stale, fix it in the same PR
that makes it stale — docs drift is treated as a bug (see `docs/CONSISTENCY-SWEEP.md`).

## Dev setup

```bash
git clone https://github.com/shahramclaude/Leados.git
cd Leados
cp .env.example .env            # point DATABASE_URL at a local PostgreSQL instance
npm install
npm run db:push                 # applies src/db/schema.ts to the database
npm run seed                    # optional: sample data
npm run dev                     # http://localhost:3000
```

Requirements: Node.js 20+ (CI and `Dockerfile` use Node 22), a reachable PostgreSQL 14+ instance.

## Code style

- TypeScript, strict mode (`tsconfig.json`). No `any` without a comment explaining why.
- Format/lint with the project's ESLint config: `npm run lint`. Fix warnings before opening a PR;
  do not add `eslint-disable` without a one-line justification comment next to it.
- Server-side data access goes through `@/db` (Drizzle) — no raw `pg` client usage outside
  `src/db/index.ts`.
- API routes validate their input and return `{ error: string }` with a 4xx status for bad input,
  matching the existing routes in `src/app/api/leads/`. Follow that shape for new routes.
- Keep business logic (e.g. scoring rules) in `src/lib/`, not inline in route handlers, so it can
  be unit-tested independently of Next.js.

## Test expectations

**Current state, stated honestly:** this repository does not yet have an automated test suite.
That is tracked as roadmap milestone M3 in `README.md` and is the single most important gap to
close. Until it exists:

- If you add a new pure function (e.g. a new scoring rule in `src/lib/scoring.ts`), add inline
  comments showing example inputs/outputs so a reviewer can verify logic by hand.
- If you add or change an API route, document the request/response shape in
  `docs/reference.md` in the same PR.
- `npm run verify` (lint + typecheck + docs link check + production build) must pass locally
  before you open a PR. CI runs the same command (`.github/workflows/ci.yml`).

If you are the contributor who adds the first real test framework, do it as its own PR with an
ADR (see below) — that is an architectural decision, not a drive-by change.

## When you need an ADR

Open a new file in `docs/adr/` (copy the format of `docs/adr/0001-record-architecture-decisions.md`)
before making a pull request that:

- Adds or removes a persisted table, or changes how schema migrations are applied.
- Introduces a new runtime dependency that the app cannot run without (e.g. a queue, cache, auth
  provider).
- Changes the deployment topology (e.g. adding a second service/process).
- Changes how scores are computed in a way that is not just "tune a weight" (e.g. replacing
  `computeScore()` with a trained model).

Small bug fixes, doc updates, and additive API endpoints that fit the existing patterns do not
need an ADR.

## Pull request checklist

- [ ] `npm run verify` passes locally.
- [ ] `FEATURES.md` updated if you changed a capability's status (🟢/🟡/⚪).
- [ ] `CHANGELOG.md` has an `[Unreleased]` entry describing the user-visible change.
- [ ] `docs/reference.md` updated if you changed an API route, config var, or event type.
- [ ] New architectural decisions have an ADR in `docs/adr/`.
- [ ] No new secrets committed; `.env.example` updated if you added a new environment variable.

## Release process

See `docs/RELEASING.md`. Only maintainers cut releases, but contributors should know the gate
list so they understand what "ready to merge" implies for "ready to release".
