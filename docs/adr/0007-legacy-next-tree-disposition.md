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
   - Legacy scripts were originally left untouched (`dev`, `build`, `start`, `typecheck`,
     `audit:legacy`). **Amended in Session 115 — see "Amendment: the friction was documentation,
     not code" below.** They are now namespaced `legacy:*`, and `typecheck` refuses.

## Consequences

- **Positive:** Developers and CI get a fast (<10s), zero-ambiguity `npm run verify:canonical`
  gate (`lint` + `check:boundary` + `check:links` + `test`) that enforces zero-build,
  zero-network, zero-legacy-leakage invariants on every change.
- **Trade-off:** Legacy files remain present on disk in read-only quarantine; `tsc --noEmit`
  remains a non-canonical legacy command until a separate repository-extraction ADR is warranted.

## Amendment (Session 115, 2026-11-02): the friction was documentation, not code

This ADR's *decision* held up under audit. Its *implementation* was incomplete in a way that kept
producing the same confusion the ADR was meant to end: two app trees, and no reliable way for a
human to know which one they were standing in.

**What the audit actually found.** The automated half was already correct: `eslint.config.mjs`
ignores every quarantined path, CI runs only canonical gates, `npm run check:boundary` fails any
import into the quarantine, and the canonical suite is green. The failures were all
human-facing:

1. `CONTRIBUTING.md` — the one page a new contributor is told to read — was **entirely** legacy
   onboarding: create a PostgreSQL database, `npm run db:push`, `DATABASE_URL`, `npm run dev` on
   port 3000, "there is no automated test suite", `npm run verify`, and a CI workflow
   (`.github/workflows/ci.yml`) that does not exist. Every instruction was false. Rewritten.
2. `docs/INDEX.md` and `docs/README.md` indexed the legacy programme as if it were the product,
   and ~30 instruction pages (`TESTING.md`, `CONFIG.md`, `RUNBOOKS.md`, `RELEASING.md`, the
   tutorial and how-to sets, `reference/*`) told readers to run commands that cannot run here.
   `docs/INDEX.md` is now a canonical index with an explicit, labelled archive section, and every
   instructional legacy page opens with a "Historic — describes the frozen pre-ADR-0006 tree"
   banner that redirects to `CONTRIBUTING.md`.
3. `src/` had no in-tree marker, and `deprecated/README.md` still asserted "the canonical app is
   the Next.js app rooted at `src/`" — flatly contradicted by this ADR. Both now say what they
   are, and `src/README.md` redirects to `npm run app`.
4. `package.json` still gave `dev` / `build` / `start` / `typecheck` to Next.js and `tsc`. Those
   were the commands a reader would naturally type. Now `dev` / `start` serve the canonical app,
   `build` builds the standalone artefact, `typecheck` **refuses** with an explanation (exit 1,
   `scripts/typecheck-gate.mjs`), and the legacy toolchain survives only as `legacy:dev`,
   `legacy:build`, `legacy:start`, `legacy:typecheck`.
5. Nothing verified any of the above, so it could rot again silently. `auditContributorDocs()` in
   `scripts/check-canonical-boundary.mjs` now makes the prose a checked artefact: 23 assertions
   over `CONTRIBUTING.md`, `docs/LEGACY-TREES.md`, both quarantine markers and the `package.json`
   script contract, wired into `npm run check:boundary` and asserted again in
   `tests/app/canonical-boundary.test.mjs`.
6. `docs/LEGACY-TREES.md` was authored as the inventory and rationale page this ADR kept
   referencing informally, and `.gitattributes` now marks the quarantine `linguist-vendored` so
   language statistics and review surfaces stop presenting 3,300 frozen files as the product.

**Unchanged:** the quarantine itself, the Option C disposition, and the rejection of mass deletion
(§Decision 3 — `axe-core` arrives transitively through `eslint-config-next`). This amendment does
not authorise deletion; that still needs its own ADR, with `axe-core` promoted to an explicit
devDependency first.
