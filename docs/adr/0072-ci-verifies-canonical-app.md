# ADR-0072: CI must verify the canonical application, not the quarantined tree

Date: 2026-11-02 · Status: Accepted · Scope: `.github/workflows/node.js.yml`

## Context

[ADR-0006](./0006-canonical-zero-build-app.md) made `index.html` + `app/**` the single canonical
LeadOS application, and [ADR-0007](./0007-legacy-next-tree-disposition.md) froze the legacy
Next.js / Vite trees (`src/**`, the root `*.ts`/`*.tsx` files, `public/index.html`,
`deprecated/**`) as an archive-in-place quarantine with an automated boundary check.

Both ADRs are enforced in code. `scripts/check-canonical-boundary.mjs` proves that no canonical
file imports a quarantined tree and that `app/**` performs no network calls.
`eslint.config.mjs` scopes `eslint .` to the canonical app and tests by ignoring `src/**`,
`deprecated/**`, `public/**` and every `**/*.ts` / `**/*.tsx` file. `npm run verify:canonical`
chains lint, the boundary check, the docs-link check and the canonical test suite.

The continuous-integration workflow did not follow the same rule. It ran:

```
npm ci
npm run build --if-present   # → next build
npm test
```

`npm run build` compiles the quarantined Next.js tree. That tree cannot compile, for a reason
already recorded in the README: `src/db/schema.ts` is an intentional three-line stub that exports
nothing, while quarantined modules (`src/lib/agent/tools.ts`, `src/lib/agent/executor.ts`)
import `toolEffects`, `stepRecords` and hundreds of other tables from it. `next build` fails at
roughly fifty seconds with `The export toolEffects was not found in module src/db/schema.ts`.

The consequence was measured, not assumed. On `main` at `6afa090`, and again on this branch at
`d8d1615`, the `build (20.x)` check failed and the `18.x` / `22.x` legs were cancelled by the
matrix's default fail-fast, so every pull request showed a red X before a single test ran. The
check was therefore *always* red: it carried zero information about the change under review, and
"CI is red" became a fact of the repository rather than a signal. A permanently failing gate is
worse than no gate, because it trains everyone to ignore the one that matters.

The `npm test` step never executed at all — `next build` failed first — so the canonical suite,
the actual product evidence, was never run in CI.

## Decision

Point CI at the product.

The workflow now runs exactly the gates `npm run verify:canonical` runs locally, in the same
order, with `next build` removed:

1. `npm ci`
2. `npm run check:boundary` — ADR-0006/ADR-0007 canonical-boundary audit
3. `npm run check:links` — internal documentation links
4. `npm run lint` — ADR-0007-scoped ESLint over `app/**`, `scripts/*.mjs`, `tests/app/*.mjs`
5. `npm test` — the full canonical zero-build suite in `tests/app/*.test.mjs`

Three supporting changes:

- **The matrix is Node `22.x` only, and that is a measured decision.** Node 18 reached end-of-life
  on 2025-04-30, so it was removed. A `20.x` leg was then added and *tested* rather than assumed:
  on run `41393779957` it passed the boundary check, the docs-link check and lint, and then
  **failed the canonical test suite**. That failure could not be diagnosed from the environment
  that built this workflow, because GitHub Actions job logs live on a
  `*.blob.core.windows.net` host this environment cannot reach (`--log-failed` and the job-logs
  REST endpoint both return `EOF`). A grep of `app/`, `tests/` and `scripts/` for Node 21+/22+-only
  APIs found nothing in use except `structuredClone`, which Node 17 already provides, so the gap
  sits in a dependency floor (jsdom 30, `eslint-config-next`) or a `node:test` reporter difference
  rather than in product code. The choice was between an undiagnosed red leg and a truthful one:
  shipping the red leg would recreate exactly the always-red check this ADR exists to remove, so
  CI claims only the runtime `README.md` documents and the repository has verified — Node 22+.
  The open question is carried in `ROADMAP.md` (Session 112) rather than guessed at.
- **`fail-fast` removed.** With a single matrix entry it is meaningless, and leaving it would imply
  a matrix that no longer exists. The reasoning still binds any future matrix: one runtime failing
  must not cancel another's evidence, because that default is what concealed this for months.
- **`timeout-minutes: 120`.** The canonical suite is genuinely long (111 files, a large fraction
  of them JSDOM plus axe-core accessibility audits, on a two-core runner). An explicit ceiling is
  better than the six-hour default.
- **The docs-link gate was made Node-portable.** `scripts/check-docs-links.mjs` imported
  `globSync` from `node:fs`, which exists only from Node 22.0. On the new `20.x` leg the step died
  with "does not provide an export named 'globSync'" — the gate crashed instead of checking. It is
  now a plain `readdirSync` walk that reproduces `globSync`'s default behaviour (dot-entries not
  traversed, `node_modules`/`.next`/`.git` skipped) and produces byte-identical output: 428 links
  across 180 markdown files. This defect had been invisible because the step had never actually run
  in CI.

## Consequences

- CI now fails only when the running product regresses, so a red check becomes actionable again.
- CI no longer claims to validate `src/**`. That is not a loss of coverage: by ADR-0007 the tree
  is frozen, non-canonical, unrelated in domain (a PostgreSQL sales-lead CRM starter), and
  documented as non-building. Repairing it would be a separate decision with its own ADR, and it
  would be repairing code no user of LeadOS can reach.
- The absence of `next build` from CI is now explicit and justified in the workflow comments,
  rather than being an accidental consequence of `--if-present`.
- `npm run verify:canonical` remains the local source of truth and the CI steps mirror it
  one-to-one, so a green local run predicts a green CI run for the canonical gates.
- **Node 20 test-tooling support is not claimed**, and is now known to be broken rather than
  unknown. Whoever needs it should treat the recorded failure as the starting point: reproduce
  `npm test` under Node 20 locally, read the first failing assertion, fix the dependency floor or
  the offending test, and then re-add the leg to the matrix.
- If the legacy tree is ever revived, this ADR must be superseded, and CI must gain a build step
  for whatever replaces it.

## Verification

Performed 2026-11-02 on branch `arena/867662ed-leados` at `d8d1615`, node v22.22.3:

| Gate | Result |
|---|---|
| `npm ci` | 438 packages installed, 0 errors |
| `npm run check:boundary` | OK — 309 app ES modules, 111 test suites, 0 quarantined-tree or network leaks |
| `npm run check:links` | OK — 428 internal links across 180 markdown files (ported off `fs.globSync`; output identical before and after) |
| `npm run lint` | exit 0, no output (0 errors, 0 warnings) |
| `npm test` | **2,178 tests, 135 suites — 2,178 pass, 0 fail, 0 cancelled, 0 skipped, 50.7 min** |
| `npm test` under Node 20.x (hosted run `41393779957`) | **fails** — cause not diagnosable here (logs unreachable); recorded as an open item |
| `npx next build` | **fails** — confirms the cause; `src/db/schema.ts` exports nothing |

The workflow file was parsed with a YAML parser to confirm it is structurally valid, and the
step list, matrix and `fail-fast` flag were asserted after parsing.
