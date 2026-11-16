# AGENTS.md — Development instructions for AI coding agents

These instructions apply to every AI coding session in this repository. Read them first, then follow
them alongside the human documentation in [`CONTRIBUTING.md`](CONTRIBUTING.md) (the single source of
truth for setup, architecture, style, tests and the PR checklist). If this file and `CONTRIBUTING.md`
ever disagree, stop and report the conflict instead of guessing.

---

## 0. Session continuity (do this every session)

1. Read this file.
2. Inspect the current branch and working tree: `git status` and `git branch --show-current`.
   Preserve any uncommitted changes you did not make.
3. Read the sections of `CONTRIBUTING.md` and `docs/LEGACY-TREES.md` relevant to your task.
4. Work from the code as it is now. Do not rely on assumptions carried over from earlier sessions,
   and do not trust counts or claims in documentation without checking them (see §1.6).

---

## A. Project overview

### A.1 What this is

**LeadOS** is a *local-first leadership workspace* for a first-time leader. It is a zero-build,
browser-only single-page app: no backend, no database, no network calls, no user accounts. Records
live in the browser's `localStorage`, move between machines only through explicit export/import, and
are protected by an audit/event log and a post-commit rule engine. The package is `private`.

### A.2 The canonical application (the only product)

- **Entry point:** `index.html` loads `./app/main.js` as a native ES module.
- **Modules:** `app/**` — plain browser JavaScript (`.js`), relative imports ending in `.js`.
  There are no TypeScript files, no bundler and no bare npm imports inside `app/**`.
- **Key layout:**
  - `app/main.js` — routes, navigation, per-route rendering, badge counters.
  - `app/actions.js` — every mutation. Validates input, returns `{ ok: false, error }` on refusal,
    records an audit event.
  - `app/core/store.js` — store, atomic transaction boundary, persistence, vault.
  - `app/core/schema.js` — collections, defaults, fail-closed normalisers, `SCHEMA_VERSION`, `MIGRATIONS`.
  - `app/core/domain/*.js` — pure engines, registries, normalisers and propagation rules.
    `postCommit.js` is the post-commit spine where every rule runs once per event.
  - `app/core/csv.js` — aggregate-only CSV export scopes.
  - `app/services/*` — rehearsal services (some run as Web Workers).
  - `app/ui/*.js` — dialogs, form primitives, DOM helpers. `app/views/*.js` — one render function per route.
  - `app/styles.css` — the design system. `app/assets/` — images.
  - `app/standalone-entry.js` — entry used only by the standalone build (§A.4).
- **Tests:** `tests/app/*.test.mjs` — Node's built-in `node:test` runner with jsdom and axe-core.
  About 280 suites. The full run is slow (well over 15 minutes in the cloud sandbox).
- **Scripts:** `scripts/*.mjs` — the static server, the standalone builder and the gates.
  `scripts/*.sh` are Bash helpers that are not wired into `package.json`.

### A.3 Architectural rules (enforced by `npm run check:boundary`)

1. `app/**` imports are relative and end in `.js`. No bare package specifiers, no TypeScript.
2. `app/**` never calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`.
3. Nothing in `index.html`, `app/**`, `scripts/**` or `tests/app/**` imports from the quarantined
   legacy trees (§A.5) or from any `.ts`/`.tsx` file.
4. Views never write to the store directly. Every write goes through an action, and every action
   records an audit event.
5. Modules follow the house pattern in `CONTRIBUTING.md` ("How a module is built"). A new module
   needs all ten wiring points listed there, including schema migration, actions, navigation,
   post-commit registration, aggregate-only CSV scope, demo data and tests.
6. The app must not rate, rank or name a person as a subject of judgement. Aggregate, attribute, or
   refuse.

### A.4 Other build outputs

- **`LeadOS-standalone.html`** (tracked, ~18 MB, marked `linguist-generated`) is a single-file build
  made by `scripts/build-standalone.mjs` (esbuild bundles `app/standalone-entry.js`). Never hand-edit
  it. It is regenerated only when a task explicitly calls for a distribution rebuild (see §D.3).

### A.5 Quarantined legacy trees — do not touch

These are frozen under ADR-0007 and do not build. They are not the product. Details are in
[`docs/LEGACY-TREES.md`](docs/LEGACY-TREES.md).

- `src/**` — an abandoned Next.js 16 / React 19 / Drizzle / PostgreSQL app.
- Root `*.ts` / `*.tsx` files (for example `App.tsx`, `store.ts`, `ui.tsx`). Their names collide with
  canonical modules on purpose; they are not the same code.
- `scripts/**/*.ts`, `tests/**/*.ts`, `public/**`, `deprecated/**`.
- Do not add features, fixes, migrations or tests there. Do not import from them. If something in
  them is worth keeping, port the idea into `app/**` and say so.

Quick checks: a path under `src/`, a root `.tsx`, or a `scripts/*.ts` file is legacy. The canonical
app has no `.ts` or `.tsx` files at all.

### A.6 Stack and versions (from `package.json` and `package-lock.json`)

| Area | Detail |
|---|---|
| Canonical runtime | Browser-native ES modules (`app/**`), `localStorage`, Web Workers for some services. No framework. |
| Language | JavaScript (ES modules) for the product. TypeScript 5.9.3 is a devDependency used only by the legacy typecheck. |
| Node.js | 22.x for tooling. CI uses `22.x`; README says verified with 22.22.3; `Dockerfile` pins `node:22.23.2-bookworm-slim`. Node 20 is not supported by CI. |
| Package manager | **npm** (`package-lock.json`, lockfileVersion 3). No pnpm or yarn lockfile exists. |
| Dev tooling | ESLint 9.39.4 (flat config `eslint.config.mjs`), `eslint-config-next` 16.4.3, jsdom ^30.1.3, esbuild ^0.25.12, `axe-core` (transitive, via `eslint-config-next`; used by tests). |
| Legacy-only dependencies | `next` 16.4.3, `react`/`react-dom` 19.2.6, `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.11, `pg` 8.20.0, `dotenv` 17.3.1, Tailwind 4.1.17, `@types/*`. Canonical `app/**` must not import these. |
| Database / backend | None for the canonical app. `DATABASE_URL`/PostgreSQL belong to the legacy tree only. |

### A.7 Entry points and how to run the app

- `npm run app` (also `npm run dev` and `npm start`) starts `scripts/serve.mjs`, a zero-dependency
  static server on `http://localhost:5173` by default. It binds `0.0.0.0`; the port can be set with
  `PORT=<n>` or `--port <n>`. Opening `index.html` directly from disk does not work, because browsers
  block ES modules on `file://`.

---

## B. Development environment

The developer's own machine is **Windows 10** with Node.js, npm, Git, pnpm, TypeScript, Python,
PowerShell 7, Visual Studio Code and GitHub CLI. **That machine is not reachable from an AI agent
session.** Do not assume any local path, installed program, editor setting or PowerShell profile
from it.

- **Detect before you use.** Check what exists in the current execution environment before relying on
  it, for example `node --version`, `npm --version`, `git --version`, `gh --version`, `python3 --version`.
  If a tool is missing, say so and use an alternative. Do not claim a tool was used if it was not.
- **Cloud sandbox facts at the time of writing (verify again):** Node 22.22.3, npm 10.x, git 2.39,
  gh 2.23, Python 3.11. pnpm, TypeScript (`tsc`) and PowerShell were **not** on `PATH`. Do not install
  them globally just to run a command. Use the project's own scripts and `npx` only when a task needs them.
- **Cross-platform commands.** The `npm` scripts call Node `.mjs` files, so they run the same on
  Windows PowerShell 7 and on Linux. Keep new scripts cross-platform too. Do not add Bash-only syntax
  to `package.json` scripts. The `scripts/*.sh` helpers are Bash and are not part of the gates.
- **Windows-facing instructions.** If you write setup instructions for the developer, give them in
  PowerShell 7 form (`npm ci`, `npm run app`, `git ...`) and do not require WSL or Git Bash.
- **Editors.** There is no committed editor configuration for VS Code; `.vscode/` is git-ignored.
- **Python is not used.** The repository contains no Python code. Do not add Python tooling unless a
  task explicitly requires it.
- **GitHub CLI** (`gh`) and `git` are used for GitHub operations (§G).

---

## C. Package management

- **npm is the only package manager.** Do not run `pnpm`, `yarn` or `bun`, and do not create a second
  lockfile.
- Install with `npm ci --no-audit --no-fund`, which reproduces `package-lock.json` exactly. Use
  `npm install <pkg>` only when a change genuinely requires a new package, and commit the updated
  lockfile with it.
- **Reuse installed dependencies.** If `node_modules/` already exists and matches the lockfile, do not
  reinstall. You do not need `npm ci` to run the app; you need it only for tests, lint and the
  standalone build (per `CONTRIBUTING.md`).
- **No new runtime dependency** in the canonical app. Build-time dev dependencies need an ADR (`docs/adr/`).
- **No dependency upgrades, removals or reorganisation** unless the task is explicitly about that.
  Changing `next`, `react`, `eslint`, `typescript`, `drizzle`, `pg` or Node versions is a
  project-level decision, not a drive-by fix.
- Avoid global installs (`npm i -g`). Prefer `npx <local-bin>` or the existing `npm run` scripts.
- Do not commit `node_modules/`, `.env` files or build caches. `.gitignore` already covers them.

---

## D. Coding standards

### D.1 General

- **Match the existing architecture and naming** in the file you edit. There is no formatter; match
  surrounding style: 2-space indent, single quotes, semicolons, trailing commas in multiline literals
  (see `CONTRIBUTING.md`, "Code style").
- **Language.** For the canonical app, new code is plain ES modules (`.js`). TypeScript is **not** used
  there: the app is served without a build step, and the boundary, lint and test gates all assume
  plain JS. Do not add `.ts`/`.tsx` files to `app/**`. If you believe TypeScript is needed, write an
  ADR first.
- **Modular, reusable, no duplication.** Reuse existing helpers in `app/ui/dom.js`, `app/core/time.js`,
  `app/core/schema.js` and the domain registries before writing new ones. Do not create abstractions
  for a single use.
- **Performance without sacrificing reliability.** Keep work inside the existing post-commit spine and
  transaction boundary. Do not add a second write path that bypasses actions, and do not add
  `setInterval` polling without a reason.
- **Preserve existing behaviour.** Do not change unrelated code, rename exports used elsewhere, or
  reformat whole files. Avoid unnecessary rewrites.

### D.2 Domain-specific rules (from `CONTRIBUTING.md` and the existing code)

- Time is injected: pass `now` into engines. Tests must not depend on the wall clock.
- Money is integer cents parsed once, typically with `BigInt`. Never use floats for currency.
- Every number the UI prints must be a dated record, a declared convention, or an explicit refusal.
- Assert **refusals** in tests, not only happy paths. Refusals are a core product behaviour.
- Views must not expose identities in aggregate CSV exports.

### D.3 Generated and frozen artefacts

- Do not hand-edit `LeadOS-standalone.html`. `npm run build` and `npm run build:standalone` **overwrite
  it** in place (it embeds the current source commit). After a build you must run
  `git checkout -- LeadOS-standalone.html` unless the task is specifically to ship a new distribution.
- Do not edit files under `docs/` as a side effect of unrelated work. Documentation updates belong to
  the change that makes them stale (`CONTRIBUTING.md`).

---

## E. AI agent execution rules

1. **Inspect before editing.** Read the module, its tests, its callers (`grep` the symbol), and the ADR
   it cites if any. Know what imports it and what it writes.
2. **Understand side effects.** Check whether the change affects the post-commit spine, the schema
   version, the CSV scope, or the standalone build. A schema change requires a migration step.
3. **Plan complex work** (new modules, cross-cutting changes) before writing code: list the files to
   change and the tests to add.
4. **Keep changes focused.** One concern per commit; no drive-by refactors.
5. **Parallelize safely.** Independent reads, greps and read-only checks can run together. Do not run
   two writers on the same file, and do not run `npm test` and `npm run build` concurrently against the
   same tree if either writes files.
6. **Reuse existing tools.** Use the `npm run` scripts in §F rather than ad hoc commands.
7. **Never invent commands, scripts or capabilities.** Only use names that appear in `package.json`
   or in files you have read. Example: `npm run typecheck` **always exits 1** (it refuses by design);
   it is not a gate. `npm run legacy:typecheck` only checks the frozen legacy TypeScript.
8. **Verify, then claim.** Run the check and read its output before saying it passed. If a check was
   not run, say so; do not write "tests pass" from memory. Mark anything you could not verify as
   **[UNVERIFIED]**.
9. **Report honestly.** Separate pre-existing failures from failures your change introduced (§F.4).
10. **Ask only when blocked.** If a requirement is ambiguous and the answer changes the outcome, ask
    the user with a short question. Otherwise make the smallest reasonable choice and state it.

---

## F. Quality assurance

Only the scripts below exist in `package.json` at the time of writing. All of them are safe to run in
the sandbox.

### F.1 Commands

| Purpose | Command | Notes |
|---|---|---|
| Run the app | `npm run app` | Static server, `http://localhost:5173`. No build step. |
| Architecture / boundary gate | `npm run check:boundary` | Import graph, network calls, quarantine leaks, onboarding docs. Fast. |
| Internal docs links | `npm run check:links` | Checks relative markdown links in the repo's `.md` files. Fast. |
| Lint | `npm run lint` | `eslint .` over `app/`, `scripts/*.mjs`, `tests/app/*.mjs`. Ignores `**/*.ts(x)`, `src/**`, `deprecated/**`. |
| Heading-order / a11y | `npm run check:a11y` | Runs axe `heading-order` on every declared route. Needs `node_modules`. |
| Canonical tests | `npm test` | Runs every `tests/app/*.test.mjs`. **Slow** (many minutes). |
| One test file | `node --test tests/app/<name>.test.mjs` | Use for focused iteration. |
| Canonical gate | `npm run verify:canonical` | `lint` + `check:boundary` + `check:links` + `npm test`. Run before a PR. |
| Standalone build | `npm run build:standalone` (alias `npm run build`) | **Rewrites** `LeadOS-standalone.html` (§D.3). |
| Standalone verify | `npm run verify:standalone` | Rebuilds the standalone file, then runs its test. Also rewrites the file. |
| Smoke/eval scripts | `npm run eval:app`, `npm run audit:legacy` | Exist; run only when the task concerns them. |

Not gates, do not use as checks: `npm run typecheck` (always exits 1 by design) and
`npm run legacy:*` (archaeology of the frozen tree). `scripts/gate-all.mjs` is a legacy runner that
is not wired into `package.json`; do not use it.

### F.2 Recommended sequence

1. Focused test file for the module you changed (`node --test tests/app/<name>.test.mjs`).
2. `npm run lint` and `npm run check:boundary`.
3. `npm run check:links` if you touched any `.md` file.
4. `npm run check:a11y` if you changed views or CSS (it is quick and narrow).
5. `npm test` (full suite) before committing a change that affects shared code.
6. `npm run verify:canonical` before opening a PR.
7. `npm run build:standalone` and `npm run verify:standalone` only when the task needs a rebuilt
   distribution. Then restore or keep the file deliberately, and say which you did.

### F.3 Type checking

There is no type checker for the canonical app. Do not claim type-safety for `app/**`. The legacy
`legacy:typecheck` is not a product gate.

### F.4 Reporting failures

- Before you start, record the baseline: run the relevant check on a clean tree, or note the failing
  test names.
- Report failures separately: **pre-existing** (fail on the base commit) and **newly introduced**
  (your change). Do not mask a failure to get a green result.
- **Known pre-existing failure at commit `f5b9ee1`:** `tests/app/aar-corroboration.test.mjs`
  ("registration: schema v149, CSV #141, RULE-AAC-01…", line ~289) expects schema v179 while the code
  is at v184. Confirm it still fails before reporting it, and do not change it unless the task is about it.
- Known documentation/config drift (do not "fix" unless asked; mention it if relevant):
  - `Dockerfile` and `docker-compose.production.yml` still describe the legacy Next.js build
    (`npm run build` → `.next/standalone`). `npm run build` is now the standalone builder.
  - `playwright.config.ts` and `tests/e2e/*.spec.ts` exist, but `@playwright/test` is not in
    `package.json` and there is no npm script for them. Do not invent a command for them.
  - Some older docs and session logs cite counts (files, suites, modules) that no longer match the tree.
    Verify counts with a command before repeating them.

---

## G. Git and GitHub rules

- **Inspect first:** `git status` and `git branch --show-current`, before editing.
- **Work on the current branch only.** Commit to it and push only to it: `git push origin <branch>`.
  Do not create, switch to or push to other branches.
- **Preserve user changes.** Never discard, reset or overwrite uncommitted work you did not make.
- **Forbidden:** `git push --force`, `git reset --hard` on shared history, `git clean -fd` on user
  files, rewriting published commits, deleting branches you did not create.
- **Focused commits.** Stage only the files for the change (`git add <paths>`, not `git add .`). Use a
  clear subject line that says what changed and why.
- **Review the diff before committing:** `git diff --staged`. Confirm no unrelated files, no
  `node_modules/`, no `.env`, and no regenerated `LeadOS-standalone.html` unless intended.
- **Pull requests:** use `gh pr create` from the working branch, targeting `main`. Use `gh` for PR
  status, reviews and checks. Do not use `--auto` when merging. Merge or close only with an explicit
  PR number, and only when the user asks.
- **Authentication:** `git` and `gh` are already configured in the sandbox. If you see an auth error,
  tell the user that the GitHub connection needs attention. Never ask for or store tokens or passwords.
- **Docs drift is a bug.** If your change makes a document false, update it in the same PR (per
  `CONTRIBUTING.md`).
- **PR checklist** (from `CONTRIBUTING.md`): `npm run verify:canonical` passes; new modules have all
  wiring points; `AI-SESSION-LOG.md` has an entry for the session, including what was **not** verified;
  `FEATURES.md` and `CHANGELOG.md` are updated for user-visible changes; ADR added for architectural,
  schema, statistical or privacy-relevant changes; no secrets, no network calls, no new runtime
  dependency, nothing added under a quarantined path.

---

## H. Performance (for the agent's own work)

- Do not run the full `npm test` repeatedly while iterating. Run the focused test file first, then the
  full suite once before committing.
- Run long commands in the background (`start_process`) and wait on them, rather than re-running them.
- Avoid repeated reads of the same large files. The repo has very large markdown files
  (`README.md`, `CHANGELOG.md`, `ROADMAP.md`, `AI-SESSION-LOG.md`, `RESEARCH.md`): use `grep` or
  `read_file` with `offset`/`limit`.
- Do not reinstall dependencies that already exist. Do not regenerate the standalone build unless needed.
- Efficiency never overrides correctness: do not skip a gate that the change requires.

---

## I. Known limitations and open items

- The canonical CI workflow (`.github/workflows/node.js.yml`) runs on push and pull request to `main`.
  It runs `check:boundary`, `check:links`, `lint` and `npm test` on Node 22.x. It deliberately does not
  run `next build`. Node 20 is not tested because of a failure documented in that file (see ADR-0072).
- `npm run typecheck` is intentionally a failing refusal. Do not treat it as a gate, and do not remove
  the refusal without an ADR.
- Recorded decisions live in `docs/adr/` (index: `docs/adr/INDEX.md`). The current product scope is in
  `NORTH_STAR.md`, `ROADMAP.md`, `FEATURES.md` and `CHANGELOG.md`. Read them when a change touches scope.
