# ADR-0006: The zero-build, local-first root application is canonical LeadOS

## Status

Accepted — 2026-10-24. Supersedes the canonical-entry choice in
[ADR-0001](./0001-canonical-app.md). This records an earlier session's architecture decision;
session 4 extends that existing app incrementally and performs **no new rewrite**.

> **Correction — 2026-10-24, session 4:** the original rationale incorrectly said `src/db`
> was absent. It exists, including a PostgreSQL/Drizzle client, schema and repositories.
> Historical claims of 6,879 TypeScript errors/352 missing modules have **not** been rerun
> and remain **[UNVERIFIED]** for the current tree. This ADR is not evidence that repairing
> the legacy app is impossible, that it was fully audited, or that local storage guarantees
> confidentiality. See [the current audit](../AUDIT-2026-10-24-session-4.md).

## Context

The repository contains several historical entry points: a Next.js/PostgreSQL tree, React/
Vite console files, a synthetic-data HTML console and a CLI companion. Documentation has
made contradictory canonical-product claims. The earlier session selected a browser-native
application, and subsequent sessions already evolved it through reviews, feedback latency,
goal authorship and delegation.

Current source-confirmed facts:

- `index.html` imports `app/main.js`, which uses relative native ES modules and local storage.
- `src/db/index.ts` creates a `pg` pool/Drizzle client and requires `DATABASE_URL`.
  `src/app/page.tsx` performs a query and displays the PostgreSQL starter page.
- The starting session-4 inventory found 262 Next pages and 903 files importing `@/db` or
  subpaths. Counts do not demonstrate working integrations or security.
- Session 4 did not compile, execute or personally line-review the entire legacy tree.
  Older blanket “none of them ran”/missing-data-layer assertions are withdrawn as current facts.
- The canonical baseline passed 113 tests before session-4 edits. It is a working product
  to improve, not a pretext for another framework replacement.

The owner is a first-time leader, not an engineer. Architecture work must not be transferred
to them as a request to provision a database, choose a framework or design feature specs.

## Decision

**`index.html` + `app/**` is the one supported canonical application.** It is plain ES
modules and CSS, with no build step or runtime package dependency. The standard-library
`scripts/serve.mjs` serves files over HTTP; ES modules are not a `file://` application.

- `app/core/domain/` — DOM-free domain rules; callers pass the evaluation clock.
- `app/core/schema.js`, `conflict-schema.js` — additive migrations and normalization;
  the store injects normalization time.
- `app/core/store.js` — injected storage, persistence errors, append-oriented events,
  export/import/demo safety and incompatible-schema write protection.
- `app/actions.js`, `app/conflict-actions.js` — validated DOM-free mutations returning results.
- `app/ui/`, `app/views/` — shared rendering/forms/dialogs and route-level views.
- `app/main.js` — router, context, shell and rendering error boundary.
- `tests/app/` — Node domain/store tests plus jsdom workflow tests. Current counts and actual
  browser evidence belong in `README.md`/the dated audit, not an immutable ADR baseline.

Legacy trees remain in place as non-canonical history. The old Vite entry is preserved at
`deprecated/vite-index.html`. Any future rewrite/backend/framework change requires a fresh
source audit and explicit justification **before** the change, not this historical ADR.

## Rationale and limits

Retaining the already-working canonical app avoids a new framework/backend dependency and
keeps leadership workflow changes testable in isolation. It does **not** establish that
all historical implementations are unsalvageable. The original rewrite decision is recorded
in the historical session log; this correction does not retrospectively prove its premises
or substitute for owner approval.

Local-only execution minimizes automatic transmission and setup. It does **not** guarantee
privacy: notes and full JSON backups are unencrypted, browser-profile access grants access
to the records, and there are no user accounts/access controls. A sensitive conflict working
record is not a confidential HR system merely because it has no backend.

## Consequences

**Benefits**

- One entry point, clear supported runtime, no application backend/database setup.
- Pure domain rules and explicit mutation boundaries allow incremental regression tests.
- No automatic outbound application requests or employee-data integrations.
- Static-file deployment; test-only browser tools stay separate from runtime dependencies.

**Accepted costs / unresolved work**

- `localStorage` is not a backup; clearing site data destroys records. Writes may fail and
  remain in memory with warnings. Corrupt-blob quarantine is best effort, not assured recovery.
- One leader/browser profile; no employee submission, sharing, organization hierarchy or
  independent raters. Accounts, integrations and background reminders require a separate ADR.
- UI accessibility needs real-browser, keyboard and assistive-technology checks, not only
  source intent. Current automated checks cover selected states, not all users/devices.
- Historical comparisons cannot reconstruct edited fields that have no dated history.
- Legacy dependencies retain critical/high advisories. Canonical tests do not certify them;
  upgrade and validate before any legacy deployment.

## Alternatives retained for future decisions

| Alternative | Present disposition |
|---|---|
| Repair/promote `src/**` | Requires its own fresh build/data/security audit, environment and an explicit migration/architecture decision. Current feasibility is **[UNVERIFIED]**, not “missing DB code.” |
| Promote `public/index.html` | Historical synthetic-data console, not the supported real-record workspace. |
| Add Vite/React to the canonical app | Not needed for the current increment; adds tooling/runtime dependencies without a demonstrated requirement. |
| Collapse into a single giant HTML file | Weakens separately testable domain, persistence and rendering boundaries. |
| Support every historical entry point | Creates contradictory product and verification claims; do not ask the owner to choose. |
