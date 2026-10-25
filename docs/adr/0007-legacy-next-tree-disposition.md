# ADR-0007: Explicit Disposition & Automated Quarantine Boundary for Legacy Non-Canonical Next.js / Vite Trees

## Status

Accepted — 2026-10-25. Complements [ADR-0006](./0006-canonical-zero-build-app.md) without
superseding it. Resolves the open disposition item on the legacy `src/**`, root `*.tsx`/`*.ts`,
and `deprecated/**` trees.

## Context

[ADR-0006](./0006-canonical-zero-build-app.md) established `index.html` + `app/**` (served by
`scripts/serve.mjs` and verified by `tests/app/*.test.mjs`) as the single canonical LeadOS
application, while leaving historical trees in place pending an explicit disposition decision
between **archive-in-place quarantine**, **mass physical deletion**, or **isolated remediation**.

A direct source and runtime audit conducted on 2026-10-25 established the following verified
facts in the repository:

1. **`src/**` (9 files)** — `src/app/{layout.tsx,page.tsx,globals.css}`, `src/config/env.ts`,
   `src/db/{index.ts,schema.ts}`, `src/domain/lead-scoring.ts`, and
   `src/repositories/{leads.ts,notes.ts}`. This is a server-rendered Next.js 16 + PostgreSQL
   (`pg` / `drizzle-orm`) sales-lead-scoring starter requiring `DATABASE_URL`. It is an
   unrelated product domain (inbound CRM lead scoring vs local-first leadership & operational
   management).
2. **Root `*.tsx` / `*.ts` (~60 files), `deprecated/**`, `public/index.html`, and legacy
   `tests/**/*.ts` / `scripts/**/*.ts`** — orphaned historical Vite/React console prototypes
   importing uninstalled packages (`lucide-react`, `@google/genai`, missing `./components/*`
   paths). Because `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, `npm run typecheck`
   (`tsc --noEmit`) fails immediately on these orphaned root `.tsx` files, and an unscoped
   `eslint .` (`npm run lint`) stalls for >55 seconds traversing unmaintained TypeScript trees.
3. **Transitive test-tooling coupling in `package.json`** — `eslint-config-next@16.4.3`
   transitively provides `axe-core@4.14.0` (`eslint-config-next` → `eslint-plugin-jsx-a11y` →
   `axe-core`), which `tests/app/access-audit.test.mjs` imports directly for offline WCAG
   accessibility testing without adding extra npm dependencies.
4. **Canonical application scale (`index.html` + `app/**`)** — 71 native ES modules, Schema
   v20, 21 normalized collections, 20 cross-module automation rules, 20 OWASP-hardened CSV
   export scopes, AES-256-GCM optional vault encryption, seeded Monte Carlo simulation, and
   pre-export retention/contextual-integrity governance, with zero build step and zero runtime
   package or network dependencies.

## Options Considered

### Option A — Mass physical deletion of `src/**`, root `*.tsx`/`*.ts`, and Next/Drizzle dependencies

- **Pros:** Removes dead files from directory listings.
- **Cons (Rejected):** Removing `eslint-config-next` breaks offline `axe-core` resolution in
  `tests/app/access-audit.test.mjs` unless new devDependencies are added; deleting ~80+
  historical files creates high-churn diffs, risks breaking historical audit references, and
  adds zero capability to the canonical leadership workspace.

### Option B — Isolated remediation of `src/**` and root `*.tsx` into a parallel supported build

- **Pros:** Makes `tsc --noEmit` and `next build` pass on a secondary app.
- **Cons (Rejected):** Directly violates ADR-0006’s single-canonical-product rule, splits
  engineering maintenance across two incompatible architectures and domains (PostgreSQL CRM
  starter vs zero-build local-first leadership OS), and re-introduces server/`DATABASE_URL`
  operational burden for non-engineer leaders.

### Option C — Frozen Archive-in-Place Quarantine + Automated Canonical Boundary Gate (Selected)

- **Pros:** Zero destructive churn; preserves `axe-core` offline test availability; makes
  `npm run lint` fast (~5s) and deterministic on canonical code; mechanically prevents
  accidental cross-imports, bare npm specifiers, or outbound network calls in `app/**`.
- **Cons:** Legacy directories remain visible in the repository root until a future major
  repository-template cleanup ADR explicitly authorizes archival branch extraction.

## Decision

We adopt **Option C — Frozen Archive-in-Place Quarantine with Automated Boundary Enforcement**:

1. **Formal Quarantine Status (`FROZEN-NON-CANONICAL`):**
   - `src/**`, root `*.tsx` and `*.ts`, `deprecated/**`, `public/**`, `scripts/**/*.ts`, and
     `tests/**/*.ts` are formally classified as **frozen historical artifacts**.
   - No new features, bugfixes, or schema work may target these paths, and no canonical module
     may import from or link to them.
2. **Automated Canonical Boundary Gate (`scripts/check-canonical-boundary.mjs`):**
   - Exposed via `npm run check:boundary` and enforced inside the canonical test suite
     (`tests/app/canonical-boundary.test.mjs`).
   - Statically verifies across `index.html`, `app/**`, `scripts/serve.mjs`, and
     `tests/app/*.test.mjs` that:
     1. `index.html` and `app/**` contain **zero imports or path references** to `src/`,
        `deprecated/`, `.next/`, or `.ts`/`.tsx` files;
     2. `app/**` contains **zero bare npm module specifiers** (all ES `import` / `export ... from`
        specifiers in `app/**` must be relative `./` or `../` `.js` paths so browser native
        ES module loading works without a bundler);
     3. `app/**` contains **zero outbound network primitives** (`fetch(`, `XMLHttpRequest`,
        `WebSocket`, `EventSource`, `navigator.sendBeacon`), preserving the local-first,
        zero-telemetry architecture.
3. **Scoped Canonical ESLint Configuration (`eslint.config.mjs`):**
   - `eslint.config.mjs` explicitly ignores quarantined non-canonical trees (`src/**`,
     `deprecated/**`, `public/**`, `**/*.ts`, `**/*.tsx`) while keeping `eslint-config-next`
     installed so `axe-core` remains available offline to `tests/app/access-audit.test.mjs`.
   - As a result, `npm run lint` (`eslint .`) deterministically lints the canonical JavaScript
     codebase (`app/**`, `scripts/*.mjs`, `tests/app/*.mjs`) in seconds rather than timing out
     on quarantined TypeScript prototypes.
4. **Honest Script Classification (`package.json`):**
   - Canonical scripts: `npm run app` (`scripts/serve.mjs`), `npm test` (`tests/app/*.test.mjs`),
     `npm run lint` (canonical JS/MJS), `npm run check:boundary`, `npm run check:links`, and
     `npm run verify:canonical`.
   - Legacy scripts (`dev`, `build`, `start`, `typecheck`, `audit:legacy`) remain untouched for
     historical reproducibility only and are not release gates for canonical LeadOS.

## Consequences

- **Positive:** Developers and CI get a fast (<10s), zero-ambiguity `npm run verify:canonical`
  gate (`lint` + `check:boundary` + `check:links` + `test`) that enforces zero-build,
  zero-network, zero-legacy-leakage invariants on every change.
- **Trade-off:** Legacy files remain present on disk in read-only quarantine; `tsc --noEmit`
  remains a non-canonical legacy command until a separate repository-extraction ADR is warranted.
