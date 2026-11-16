# AGENTS.md — permanent instructions for AI coding agents

Read this file first, every session. It describes the **actual** repository state. Where this file
and older docs disagree, this file and [`CONTRIBUTING.md`](CONTRIBUTING.md) win; docs marked
"Historic" describe a frozen legacy tree whose commands do **not** work.

---

## A. PROJECT OVERVIEW

**LeadOS** is a local-first leadership workspace: an operational-management app for leaders
(decisions, reviews, delegation, evidence, governance registers). It is **one** application:

- **Canonical product** (per [ADR-0006](docs/adr/0006-canonical-zero-build-app.md)):
  `index.html` + `app/**` — plain browser **native ES modules** (JavaScript), CSS, no build step,
  no backend, no database, no network calls. Records live in `localStorage` and move only by
  explicit export. A zero-dependency static server (`scripts/serve.mjs`) serves it; ES modules
  do not run from `file://`.
- **Single-file offline distribution**: `LeadOS-standalone.html` (committed; regenerated with
  `npm run build:standalone`) — the whole app inlined, double-clickable, separate localStorage
  key, `connect-src 'none'` CSP.
- **Frozen quarantine** (per [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md),
  `FROZEN-NON-CANONICAL`): `src/**`, root `*.ts`/`*.tsx`, `deprecated/**`, `public/**`,
  `scripts/**/*.ts`, `tests/**/*.ts` — historical Next.js 16 / React 19 / Vite / PostgreSQL
  (Drizzle + `pg`) prototypes of an unrelated product domain. They do not build and did not
  before quarantine. Nothing changed there reaches a user. Do not touch them.

### Technology stack (verified from the repository)

| Layer | Technology |
|---|---|
| Canonical app | Plain JavaScript (native ES modules), HTML, CSS (`app/styles.css`) |
| Runtime deps of the app | **None** — zero runtime packages, zero network |
| Dev tooling | Node.js **22+** (CI pins 22.x; verified with 22.22.3), npm |
| Tests | Node built-in runner (`node --test`) + jsdom + axe-core (transitive via `eslint-config-next`) |
| Lint | ESLint 9 flat config (`eslint.config.mjs`), `eslint-config-next/core-web-vitals` scoped to the canonical tree |
| Standalone build | esbuild (build-time only) via `scripts/build-standalone.mjs` |
| Legacy (frozen) | Next.js 16.4.3, React 19.2.6, TypeScript 5.9.3, Tailwind 4, Drizzle 0.45.2, `pg` |

### Directory structure

```
index.html                 the only entry point; loads ./app/main.js as a module
app/main.js                router, nav, per-route renderers, badge counters
app/actions.js             EVERY mutation: validates input, returns {ok:false,error}, logs an event
app/conflict-actions.js    conflict-resolution mutations
app/core/store.js          store, atomic transaction boundary, persistence, vault
app/core/schema.js         collections, defaults, fail-closed normalisers, SCHEMA_VERSION, MIGRATIONS
app/core/domain/*.js       pure engines + <x>Registry/<x>Schema/<x>Rules + postCommit.js spine (~740 files)
app/core/csv.js            aggregate-only CSV export scopes
app/services/*.js          rehearsal workers (web workers)
app/ui/*.js                dialogs, form primitives, DOM helpers
app/views/*.js             one render function per route
app/styles.css             the design system
tests/app/*.test.mjs       the canonical suite (~283 files, node:test + jsdom)
scripts/*.mjs              current dev/build/gate tooling (serve, build-standalone, boundary, links…)
docs/adr/                  architecture decision records (numbered, INDEX.md)
docs/INDEX.md              documentation map — read this, not the raw file list
LeadOS-standalone.html     committed single-file offline distribution
```

Root-level `*.ts`/`*.tsx`, `src/**`, `deprecated/**` etc. are the frozen quarantine (above).
Large root docs: `README.md` (product vision; dated historical sections below the top),
`CONTRIBUTING.md` (**the onboarding source of truth**), `ARCHITECTURE.md`, `ROADMAP.md`,
`RESEARCH.md`, `FEATURES.md`, `CHANGELOG.md`, `AI-SESSION-LOG.md`, `NORTH_STAR.md`.

### Entry points

- Development: `npm run app` → `scripts/serve.mjs` → `http://localhost:5173` (binds 0.0.0.0).
- Offline: `LeadOS-standalone.html` (no server).
- Bundle entry for the standalone build: `app/standalone-entry.js`.

---

## B. DEVELOPMENT ENVIRONMENT

The owner's local machine runs **Windows 11** with Node.js, npm, Git, pnpm, TypeScript, Python,
PowerShell 7, Visual Studio Code and GitHub CLI.

**Agents must detect the tools actually available in their current execution environment** — do
not assume the owner's Windows machine, PowerShell, global CLIs, or GUI editors are reachable:

- Probe with `node --version`, `npm --version`, `git --version`, `gh --version`, `python3
  --version` before relying on them; fall back or report if something is missing.
- Write portable commands (POSIX shell in CI/sandboxes). Do not write PowerShell-only scripts
  into the repository's automation.
- Required to develop/test: **Node.js 22+** and npm. The application itself needs only a modern
  browser — `npm ci` is required only for the test/build tooling, never to run the app.

---

## C. PACKAGE MANAGEMENT

- **npm is the only package manager.** `package-lock.json` (lockfileVersion 3) is the source of
  truth. Even where pnpm is installed, **never** introduce `pnpm-lock.yaml`, `yarn.lock`, or a
  second lockfile.
- Install with `npm ci --no-audit --no-fund` (or `npm ci`) — exactly what CI runs. Do not
  regenerate the lockfile casually (`npm install` rewrites it).
- **No new runtime dependency.** Browser-loaded `app/**` modules have no package resolution; a
  runtime dep would break the zero-build contract. Build-time devDependencies are acceptable
  only with a written ADR (see section E).
- Reuse what is already installed before adding anything (e.g. axe-core resolves transitively
  through `eslint-config-next` — that is deliberate).
- No unnecessary global installs; no dependency upgrades that the task does not require.

---

## D. CODING STANDARDS

- **The canonical product is plain JavaScript ES modules — not TypeScript.** TypeScript exists in
  this repo only inside the frozen quarantine. Never add `.ts`/`.tsx` to `app/**`, and never add
  new code of any kind to the quarantined trees. If the task says "prefer TypeScript", note that
  here the established convention (and the boundary gate) requires JS ES modules for product code.
- **Follow the house module pattern** (see CONTRIBUTING.md "How a module is built"):
  `app/core/domain/<x>Registry.js` (vocabulary) → `<x>Schema.js` (fail-closed normalisers) →
  `<x>.js` (pure engine; derived on read; `now` injected; no DOM/storage/`Math.random`) →
  `<x>Rules.js` (post-commit spine rules) → `app/views/<x>.js` + `app/ui/<x>-modals.js`. New
  modules have ten wiring points (schema, actions, main.js, insights, cases/links, postCommit,
  csv, demo, tests, docs) — cover them all.
- **Layer boundaries**: views never touch the store; every write goes through an action; every
  action records an audit event. Imports in `app/**` are relative and end in `.js` — no bare npm
  specifiers, no TypeScript, no bundler.
- **Style**: `const`/`let`, 2-space indent, single quotes, semicolons, trailing commas in
  multiline literals. Match the file you are editing — there is no formatter. No `eslint-disable`
  without a one-line justification.
- **Comments explain why**, especially refusals. Every number the UI prints is a dated record, a
  declared convention, or an explicit refusal — never an invented fact.
- **Privacy posture**: never rate, rank or name a person as a subject of judgement; CSV exports
  are aggregate-only (no ids, no names, no free text). No `fetch`/`XMLHttpRequest`/
  `WebSocket`/`EventSource`/`sendBeacon` in `app/**` — local-first means local.
- Modular, maintainable, reusable code; avoid duplicated logic **and** unnecessary abstractions.
  Preserve existing functionality; **no rewrites** (the app is a working product to improve, not
  a pretext for a framework replacement). Schema changes are additive with a `MIGRATIONS[v]`
  step; normalisers are fail-closed (drop the artefact and warn — never invent history).

---

## E. AI AGENT EXECUTION RULES

1. **Inspect the relevant code before modifying it** — including the registry, schema, rules and
   tests of the module you touch, and the wiring list above for anything new.
2. **Understand dependencies and side effects.** Post-commit rules run on the shared spine
   (`postCommit.js`); know what a rule reads and what it may write before changing either.
3. **Plan complex tasks before implementation.** For non-trivial work, state the plan first.
4. **Make focused, minimal changes.** Do not reformat, restructure or "clean up" unrelated code.
5. **Parallelize independent operations when safe.**
6. **Reuse available development tools** — the npm scripts and `scripts/*.mjs` already exist.
7. **Never invent commands, scripts or capabilities.** Every supported command is listed in
   `package.json` and in section F. In particular, `npm run typecheck` **deliberately exits 1**
   with a refusal message (no type checker covers the canonical app) — that is designed
   behaviour, not a failure to fix.
8. **Never claim success without verifying it** — run the gate and read its output. Mark any
   claim you cannot verify in the current environment as **[UNVERIFIED]** rather than asserting
   it (this repository's standing culture).
9. **ADR required before** a PR that: adds a persisted collection or schema migration; changes
   what a rule may write or adds to the spine; introduces a dependency, build step, server,
   network call or second process; changes a scoring/statistical method; changes role/altitude
   visibility, a privacy floor, or export contents. Small fixes, doc updates and additive modules
   fitting the house pattern need none. Write ADRs in `docs/adr/` (copy the template pattern).
10. Per CONTRIBUTING.md's PR checklist, user-visible changes also update `FEATURES.md` and
    `CHANGELOG.md`, and each session logs its work (including what was **not** verified) in
    `AI-SESSION-LOG.md`.

---

## F. QUALITY ASSURANCE

Use the real scripts from `package.json` — nothing else:

| Command | What it does |
|---|---|
| `npm run lint` | ESLint over the canonical tree (quarantine excluded by design) |
| `npm run check:boundary` | ADR-0006/0007 gate: module graph, quarantine leaks, network calls, onboarding docs truth |
| `npm run check:links` | Internal documentation link audit |
| `npm run check:a11y` | Heading-order accessibility audit across declared routes |
| `npm test` | Full canonical suite: `node --test "tests/app/*.test.mjs"` |
| `npm run verify:canonical` | **The PR gate**: lint + boundary + links + full suite — what CI runs |
| `npm run build:standalone` | Regenerate `LeadOS-standalone.html` (commit when the app changes) |
| `npm run verify:standalone` | Build the standalone file and run `tests/app/standalone.test.mjs` |
| `npm run app` / `dev` / `start` | Serve the app (`scripts/serve.mjs`, port 5173) |
| `npm run eval:app` | Reproducible app evaluation (jsdom walk of every route; `--json` for machine output) |
| `npm run audit:legacy` | Smoke of the frozen legacy `public/index.html` — archaeology only |
| `npm run typecheck` | **Deliberate refusal (exit 1)** — see section E.7 |
| `npm run legacy:typecheck` | `tsc --noEmit` over the frozen legacy TS — never a product gate |
| `npm run legacy:dev` / `legacy:build` / `legacy:start` | Legacy Next.js commands — archaeology only |

- When a full run is too slow while iterating, run targeted tests first
  (`node --test tests/app/<x>.test.mjs`), then the full gates before finishing.
- After modifications: run `npm run verify:canonical` (or at minimum the gates covering what you
  changed). Production "build" for distribution is `npm run build:standalone` / `verify:standalone`.
- **Report pre-existing failures separately from newly introduced ones.** A clean tree passes
  lint, boundary, links and the full suite — if something fails before your change, say so and
  do not paper over it. If you introduce a regression, fix it before delivering.

---

## G. GIT AND GITHUB WORKFLOW

- Inspect `git status` / `git diff` before modifying files; **preserve existing user changes** —
  never discard, revert or overwrite work you did not create.
- Avoid destructive git commands (`reset --hard`, `clean -f`, forced checkouts). **Never
  force-push.**
- Make focused, well-described commits; **do not modify or commit unrelated files** (in
  particular, never commit anything under the quarantined paths). Review `git diff` before
  committing.
- Only `git add` the files your task changed (documentation/config tasks: only those files).
- Do not commit secrets, `.env` files, `node_modules/`, or build caches (see `.gitignore`).
- CI (`.github/workflows/node.js.yml`) runs `npm ci` + `check:boundary` + `check:links` + `lint`
  + `npm test` on pushes and PRs to `main`, on Node 22.x only. Keep the tree green against those.
- The GitHub remote is `https://github.com/shahramclaude/Leados.git`. Use `git` for local
  operations and `gh` for PRs/checks; work only on the branch the session was given.

---

## H. PERFORMANCE

- Minimize terminal operations; batch independent shell checks in one call where possible.
- Avoid redundant file reads — read a file once, keep the facts, edit precisely.
- Never reinstall dependencies that are already present (`node_modules/` is gitignored; run
  `npm ci` only when it is missing or the lockfile changed).
- Use the fastest sufficient validation: targeted `node --test tests/app/<x>.test.mjs` while
  iterating; the full `npm run verify:canonical` before declaring done. `tsc` over the legacy
  tree is slow **and** irrelevant — do not run it as a product check.
- Do not sacrifice correctness for speed — a green gate you did not run is not a green gate.

---

## I. SESSION CONTINUITY

Every new AI coding session must:

1. **Read this `AGENTS.md`** (and `CONTRIBUTING.md` before any code change).
2. **Inspect the current Git branch and working tree** (`git status`, recent `git log`) — never
   assume state from a previous conversation.
3. **Understand the latest repository state** — the top of `README.md` and `CHANGELOG.md`, plus
   the latest `AI-SESSION-LOG.md` entries, show what just changed.
4. **Review relevant existing documentation** via `docs/INDEX.md`; treat any doc with a
   "Historic" banner as frozen legacy material whose commands do not work.
5. **Follow all applicable instructions** in this file, CONTRIBUTING.md and the ADRs
   (`docs/adr/INDEX.md`) that govern the code you touch.
6. **Continue from the actual codebase**, not from remembered or assumed architecture.

---

*This file is the agent-facing map. `CONTRIBUTING.md` remains the contributor-facing source of
truth for setup, the module pattern and the PR checklist. If the repository changes in a way
that makes this file wrong, fix this file in the same change — docs drift is a bug here.*
