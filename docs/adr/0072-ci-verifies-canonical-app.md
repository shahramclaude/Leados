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

- **Node 18 dropped from the matrix.** Node 18 reached end-of-life on 2025-04-30 and is not a
  supported runtime. The matrix is now `20.x` and `22.x`.
- **`fail-fast: false`.** One Node version failing must not cancel the evidence from the other;
  the default fail-forward cancellation is precisely what hid this problem for months.
- **`timeout-minutes: 120`.** The canonical suite is genuinely long (111 files, a large fraction
  of them JSDOM plus axe-core accessibility audits, on a two-core runner). An explicit ceiling is
  better than the six-hour default.

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
- If the legacy tree is ever revived, this ADR must be superseded, and CI must gain a build step
  for whatever replaces it.

## Verification

Performed 2026-11-02 on branch `arena/867662ed-leados` at `d8d1615`, node v22.22.3:

| Gate | Result |
|---|---|
| `npm ci` | 438 packages installed, 0 errors |
| `npm run check:boundary` | OK — 309 app ES modules, 111 test suites, 0 quarantined-tree or network leaks |
| `npm run check:links` | OK — 416 internal links across 179 markdown files |
| `npm run lint` | exit 0, no output (0 errors, 0 warnings) |
| `npm test` | see AI-SESSION-LOG.md for the recorded result of this run |
| `npx next build` | **fails** — confirms the cause; `src/db/schema.ts` exports nothing |

The workflow file was parsed with a YAML parser to confirm it is structurally valid, and the
step list, matrix and `fail-fast` flag were asserted after parsing.
