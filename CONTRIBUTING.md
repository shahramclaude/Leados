# Contributing to LeadOS

This is the single source of truth for setup, architecture, code style, tests and the PR
checklist. If something here is stale, fix it in the same PR that makes it stale — docs drift is a
bug here, not a chore (see `docs/CONSISTENCY-SWEEP.md`).

> **Read this first.** LeadOS has **one** application: `index.html` + `app/**` — plain browser ES
> modules, no build step, no backend, no database, no network calls. Everything under `src/**`, the
> root `*.ts` / `*.tsx` files and `deprecated/**` is a **frozen, non-building historical
> quarantine** (`FROZEN-NON-CANONICAL`). Nothing you change there reaches a user. See
> [`docs/LEGACY-TREES.md`](docs/LEGACY-TREES.md) for what is frozen, why, and how it is enforced.

## Dev setup

```bash
git clone https://github.com/shahramclaude/Leados.git
cd Leados
npm run app          # http://localhost:5173 — the actual product
```

That is the whole loop. `npm ci` is needed only for the **test and build tooling** (jsdom,
esbuild, ESLint), never to run the app:

```bash
npm ci --no-audit --no-fund
npm run verify:canonical    # lint + boundary + docs links + the full canonical test suite
```

Requirements: Node 22+ for the tooling (verified with Node 22.22.3). The application itself runs in
any modern browser; the static server only serves files.

## Architecture in one screen

```
index.html                the only entry point; loads ./app/main.js as a module
app/main.js               routes, nav, per-route render, badge counters
app/actions.js            EVERY mutation. Validates input, returns {ok:false,error}, logs an event
app/core/store.js         the store, the atomic transaction boundary, persistence, vault
app/core/schema.js        collections, defaults, fail-closed normalisers, SCHEMA_VERSION, MIGRATIONS
app/core/domain/*.js      pure engines + registries + normalisers + propagation rules
app/core/domain/postCommit.js   the post-commit spine: every rule runs here, once per event
app/core/csv.js           aggregate-only CSV export scopes
app/ui/*.js               dialogs, form primitives, DOM helpers
app/views/*.js            one render function per route
app/styles.css            the design system
tests/app/*.test.mjs      node:test + jsdom; the canonical suite
scripts/serve.mjs         the zero-dependency static server
scripts/build-standalone.mjs   inlines the whole app into LeadOS-standalone.html
```

Four rules follow from the zero-build, no-network contract, and a script enforces each of them
(`npm run check:boundary`):

1. Imports inside `app/**` are **relative and end in `.js`** — no bare npm specifiers, no
   TypeScript, no bundler.
2. `app/**` never calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or
   `sendBeacon`. Local-first means local: records live in `localStorage` and move by explicit
   export.
3. Nothing in `index.html`, `app/**`, `scripts/**` or `tests/app/**` imports from `src/**`,
   `deprecated/**` or any `.ts`/`.tsx` file.
4. Views never touch the store. Every write goes through an action; every action records an audit
   event.

## How a module is built (the house pattern)

Every terminal in this app since Schema v41 follows the same shape. Adding one is mechanical;
deviating from it is how a module ends up unable to propagate.

| File | Its one job | May import |
|---|---|---|
| `app/core/domain/<x>Registry.js` | leaf vocabulary: ids, labels, limits, sources, relations. The theory a module encodes goes in its header comment, **named** — not "best practice". | nothing |
| `app/core/domain/<x>Schema.js` | fail-closed normalisers: what a half-written, hand-edited or pre-migration record is allowed to become. Never invent history; drop the artefact and warn. | registry, `time.js` |
| `app/core/domain/<x>.js` | the pure engine. Derived on read, `now` passed in, no DOM, no storage, no `Math.random` without a seed. Returns values **and refusals**. | registry, schema, `time.js` |
| `app/core/domain/<x>Rules.js` | `RULE-X-01..05` on the shared spine: marker-idempotent, writes typed links/decisions/tasks inside the caller's transaction, pausable by `xAutoPropagate` (an explicit scan always runs). | engine, `automation.js`, `time.js` |
| `app/views/<x>.js` | panels, tables, refusals printed in the leader's language | `../ui/*`, engine, registry |
| `app/ui/<x>-modals.js` | dialogs that preview the effect before writing | `../ui/dom.js`, engine |

Then wire it. This is the list that a new module is easy to forget half of:

1. `schema.js` — `COLLECTIONS`, `DEFAULT_SETTINGS`, `createEmptyState` coverage, `normalizeState`,
   a `MIGRATIONS[v]` step, `SCHEMA_VERSION`.
2. `actions.js` — the mutating commands, each with an event type; export them on the API object.
3. `main.js` — `NAV` item, `RENDERERS` entry, route aliases (never shadow an existing route),
   badge counter, route help text.
4. `core/domain/insights.js` — a bucket in the domain list **and** a `signals()` call.
5. `core/domain/cases.js` — entity type, `LINK_ENTITY_COLLECTIONS`, any new `LINK_RELATIONS`,
   `LINK_RELATION_LABELS`, system-generated relations, and the resolver case.
6. `core/domain/propagationContracts.js` + `postCommit.js` — register the rule with its purpose and
   `writes` list, and put it in the execution order with a comment saying what it reads.
7. `core/csv.js` — an **aggregate-only** export scope (no ids, no names, no free text).
8. `core/demo.js` — seed data that makes the module say something on first load.
9. `tests/app/<x>.test.mjs` — the module's claims, one `test()` per claim, named as sentences.
10. `docs/adr/NNNN-*.md`, `AI-SESSION-LOG.md`, `ROADMAP.md`, `RESEARCH.md`, `FEATURES.md`,
    `CHANGELOG.md`, and the `index.html` meta note if the surface is headline work.

## Code style

- **Plain ES modules.** `const`/`let`, 2-space indent, single quotes, semicolons, trailing commas in
  multiline literals. Match the file you are editing; there is no formatter to appeal to.
- **No new runtime dependency.** A browser-loadable module has no `package.json` to resolve
  against. Build-time dev dependencies are acceptable when justified in an ADR.
- Comments explain **why**, especially the refusal: a line that says "withheld below the floor
  because 1 of 1 identifies a person" is worth ten that say "validate input".
- Every number the UI prints is one of: a dated record, a declared convention, or an explicit
  refusal. If you cannot name which, you have invented a fact.
- Never rate, rank or name a person as a subject of judgement. Aggregate, attribute, or refuse.
- Fix warnings before opening a PR. Do not add `eslint-disable` without a one-line justification.

## Test expectations

The canonical suite is real and large: `tests/app/*.test.mjs`, run with `npm test` (Node's built-in
runner; jsdom supplies the DOM, and the axe-core audit runs against every aggregate screen).

- Every new module ships with its own `tests/app/<x>.test.mjs`. State the claims at the top of the
  file and assert one claim per test, in order.
- Assert **refusals**, not just happy paths: a below-floor rate, a cycle in the reporting tree, a
  probability the record cannot support, a grading window that has not opened.
- Assert the wiring, not only the engine: entity type, relations, resolver, registration, CSV scope
  contains no person field, the demo seeds something.
- Time is injected. Never write a test that depends on the wall clock.
- `npm run verify:canonical` must pass before you open a PR. It runs ESLint, the boundary gate, the
  internal docs-link gate, and the full suite.

## Quarantined trees — do not touch

`src/**`, root `*.ts`/`*.tsx`, `deprecated/**`, `public/**`, `scripts/**/*.ts` and `tests/**/*.ts`
are frozen under [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md). They do not build; they
are kept only so historical references and the offline `axe-core` install keep resolving.

- Do not add features, fixes, migrations or tests there.
- Do not import from them, and do not make a canonical module depend on them.
- If you find something worth keeping, port the **idea** into `app/**` and say so in the PR.
- The `legacy:*` npm scripts reproduce the old Next.js/TypeScript commands for archaeology only.
  They are not gates, and `npm run typecheck` deliberately refuses to pretend it checked the
  product.

## When you need an ADR

Write one in `docs/adr/` (copy `0001-record-architecture-decisions.md`) before a PR that:

- adds a persisted collection or changes a schema migration;
- changes what a rule may write, or adds a rule to the shared spine;
- introduces a dependency, a build step, a server, a network call, or a second process;
- changes a scoring or statistical method rather than tuning a declared convention;
- changes role/altitude visibility, a privacy floor, or what may leave the workspace in an export.

Small fixes, doc updates and additive modules that fit the house pattern do not need one.

## Pull request checklist

- [ ] `npm run verify:canonical` passes locally (lint, boundary, links, full suite).
- [ ] New module: all ten wiring points above are covered, demo data included.
- [ ] `AI-SESSION-LOG.md` has this session's entry, including what was **not** verified.
- [ ] `ROADMAP.md` / `RESEARCH.md` updated if the backlog or the competitive read changed.
- [ ] `FEATURES.md` and `CHANGELOG.md` updated for any user-visible change.
- [ ] New architectural or statistical decisions have an ADR.
- [ ] No secrets, no network calls, no new runtime dependency, no files added under a quarantined
      path.
- [ ] Any claim you could not verify in this environment is marked **[UNVERIFIED]** rather than
      asserted.

## Release process

See `docs/RELEASING.md`. Only maintainers cut releases, but the gate list is the checklist above
plus `npm run build:standalone` and `npm run verify:standalone` for the single-file distribution.
