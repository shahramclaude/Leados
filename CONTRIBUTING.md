# Contributing

## Before you start

Read `ARCHITECTURE.md` (layer rules) and `FEATURES.md` (what's actually
live vs. planned — don't build on top of something listed as "not
started" without adding it to this repo for real first).

## Local setup

```bash
npm install
npm run db:migrate   # drizzle-kit push, then records the schema version
npm run db:seed       # a few sample automation_runs rows
npm run dev            # http://localhost:3000
```

## Before opening a PR

Run the same sequence `docs/RELEASING.md`'s checklist and CI run:

```bash
npx next typegen
npm run typecheck
npm run lint
npm run build
npm run security:scan
```

All four must pass. If you touched `src/db/schema.ts`, also:
- bump `src/db/schemaVersion.json`,
- note whether the change is "expand" or "contract" per
  `docs/RELEASING.md`, and
- run `npx drizzle-kit push` locally and check the generated SQL before
  committing.

## Documentation discipline

- If you change behavior, update the doc that describes it in the **same**
  change. A stale doc is a bug — see `docs/README.md` for the index of
  what exists and `docs/history/` for why that rule exists here.
- If you make a decision that's hard to reverse or genuinely ambiguous,
  write it up as an ADR using `docs/adr/TEMPLATE.md` instead of only
  explaining it in a PR description that will get lost.
- Never describe a capability as "live" in `README.md`/`FEATURES.md`
  unless you've run it against a real database and seen it work.

## Commit/PR scope

Keep PRs scoped to one capability or fix. If you're tempted to also "fix"
something unrelated you noticed along the way, open a separate PR — this
keeps `git blame`/rollback meaningful (see `docs/RELEASING.md` → rollback
procedure, which assumes a release maps cleanly to a set of related
changes).

## Code of conduct

Be direct and specific in reviews; prefer "this will break X because Y" to
vague stylistic pushback. No conduct policy beyond basic professionalism
is in force in this repository at this stage.
