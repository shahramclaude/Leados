# `deprecated/` — quarantine placeholder (empty by design)

This directory is a **holding area for retired surfaces**, not an application directory. It is
`FROZEN-NON-CANONICAL` under [ADR-0007](../docs/adr/0007-legacy-next-tree-disposition.md) and
nothing here is built, served or tested.

**Current contents: this README only.** Nothing has been moved in.

## History of this file, corrected

An earlier version of this README said the canonical application was "the Next.js app rooted at
`src/`". **That is no longer true and was already stale when it was written.**
[ADR-0006](../docs/adr/0006-canonical-zero-build-app.md) (2026-10-24) established the zero-build
root app — `index.html` + `app/**`, served by `scripts/serve.mjs` — as the single canonical LeadOS
application, superseding the Next.js canonical-entry choice in ADR-0001.
[ADR-0007](../docs/adr/0007-legacy-next-tree-disposition.md) (2026-10-25) then formally quarantined
`src/**`, the root `*.ts`/`*.tsx` files and this directory.

The original note also recorded that the repository, as received, was a generic
`nextjs-postgresql-template` starter rather than a legacy Vite app, and that a search found no Vite
era files to retire. That part is accurate and stays on the record.

## The rule if this ever fills up

If a future session retires a surface, move it here with a one-paragraph README explaining what it
was, when it stopped being canonical, what replaced it (with the ADR), and why the code was worth
keeping instead of deleting. Anything that still runs belongs in `app/**`, not here.

For the full inventory of quarantined paths, why they were kept, and how the boundary is enforced,
see [`docs/LEGACY-TREES.md`](../docs/LEGACY-TREES.md).
