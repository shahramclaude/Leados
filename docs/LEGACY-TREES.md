# Legacy trees: what is frozen, why, and how it is enforced

LeadOS contains **one** application — `index.html` + `app/**` — and a large **frozen historical
quarantine** from the project's earlier Next.js / PostgreSQL lineage. This page exists so nobody
has to reconstruct that from an ADR, a lint config and a CI file.

Decisions: [ADR-0006](adr/0006-canonical-zero-build-app.md) (the root app is canonical),
[ADR-0007](adr/0007-legacy-next-tree-disposition.md) (the quarantine and its automated boundary).

## Inventory

| Path | Files | What it is | Status |
|---|---|---|---|
| `index.html`, `app/**` | 327 `.js` modules, ~229k LOC | **The product.** Browser ES modules, no build step, no backend, no network. | Canonical |
| `tests/app/*.test.mjs` | 338 suites | The canonical suite (`npm test`). | Canonical |
| `scripts/*.mjs` | 7 | Static server, standalone build, and the three gates. | Canonical |
| `src/**` | 3,093 `.ts/.tsx` in 262 page routes | Abandoned Next.js 16 + React 19 + Drizzle/PostgreSQL application. Does not build. | `FROZEN-NON-CANONICAL` |
| root `*.ts` / `*.tsx` | 78 | Vite-era components from the same lineage (`App.tsx`, `store.ts`, `ui.tsx`, …). Their names collide with canonical modules on purpose — they are not imports of them. | `FROZEN-NON-CANONICAL` |
| `scripts/**/*.ts` | 95 | Legacy codegen, contract and audit scripts driven by `ts-node`/`tsx`. | `FROZEN-NON-CANONICAL` |
| `tests/**/*.ts` | 111 | Legacy contract/API tests that import the Next app. Not run by `npm test`. | `FROZEN-NON-CANONICAL` |
| `public/**` | 7 | Static assets for the Next app. | `FROZEN-NON-CANONICAL` |
| `deprecated/**` | 1 README | Retirement placeholder. Empty by design. | `FROZEN-NON-CANONICAL` |

## How the boundary is enforced

| Gate | What it proves |
|---|---|
| `npm run check:boundary` (`scripts/check-canonical-boundary.mjs`) | `index.html` loads `./app/main.js`; every `app/**` import is relative, ends in `.js`, resolves on disk and stays inside `app/`; no `fetch`/`XHR`/`WebSocket`/`EventSource`/`sendBeacon`; no file under the canonical entry points imports a quarantined path; the quarantine markers and script classification are intact. |
| `tests/app/canonical-boundary.test.mjs` | The same audit, run inside the suite, so it fails on a PR, not just on a maintainer's machine. |
| `eslint.config.mjs` | `globalIgnores` covers `src/**`, `deprecated/**`, `public/**`, `**/*.ts`, `**/*.tsx` — which is why `npm run lint` runs in seconds on the real codebase instead of timing out on prototypes. |
| `.github/workflows/node.js.yml` | Runs boundary, docs links, lint and `npm test`. It deliberately does **not** run `next build`: building a tree no user can reach held the check permanently red and meant the canonical suite never ran in CI ([ADR-0072](adr/0072-ci-verifies-canonical-app.md)). |
| `.gitattributes` | Marks the quarantined trees `linguist-vendored` and the standalone artefact `linguist-generated`, so GitHub language stats and review surfaces describe the product rather than the archive. |
| `package.json` | Canonical names (`app`, `dev`, `start`, `build`, `test`, `lint`, `verify:canonical`) point at the real app. The old toolchain survives only behind `legacy:*`, and `npm run typecheck` refuses to pretend it checked anything. |

## Three checks if you are not sure which tree you are in

1. **Path.** If it starts with `src/`, a root `*.tsx`, or `scripts/*.ts`, it is not the product.
2. **Extension.** The canonical app has no `.ts` or `.tsx` files at all.
3. **Imports.** The canonical app never imports a bare package name. `import { h } from '../ui/dom.js'`
   is canonical; `import { desc } from 'drizzle-orm'` is quarantine.

## Why not delete it? (the honest answer)

[ADR-0007](adr/0007-legacy-next-tree-disposition.md) rejected mass deletion for three stated
reasons, and they still hold:

- **A dependency is load-bearing.** `tests/app/access-audit.test.mjs` reads
  `node_modules/axe-core/axe.min.js` directly. `axe-core` arrives as a transitive dependency of
  `eslint-config-next`. Removing the Next toolchain without first adding `axe-core` as an explicit
  devDependency silently breaks the accessibility audit.
- **Historical references.** Audits, ADRs and session logs cite files in these trees by path.
  Removing them turns a resolvable reference into a dead end.
- **Churn without capability.** Deleting ~3,300 files adds no capability to a leader's workspace,
  and a diff that large is unreviewable.

Deletion remains available — it is just a decision that needs its own ADR rather than a drive-by
clean-up. The order that would work:

```
1. npm i -D axe-core            # make the a11y audit's dependency explicit first
2. write the extraction ADR      # authorises the removal, lists what is kept
3. delete src/ root *.ts(x) scripts/**/*.ts tests/**/*.ts public/ deprecated/
4. drop next, react, react-dom, drizzle-* , pg, @types/*, tailwind, postcss, eslint-config-next
5. simplify eslint.config.mjs and tsconfig.json (or delete tsconfig.json)
6. npm run verify:canonical && npm run verify:standalone
```

**[UNVERIFIED]** — this extraction has not been attempted in this environment.

## Where the numbers on this page come from

`find . -type f | wc -l` style counts of the checkout at Session 115, and
`find app -name '*.js' -exec cat {} + | wc -l` for LOC. They drift as the app grows; the gates do
not depend on them.
