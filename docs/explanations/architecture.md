> **Historic — describes the frozen pre-ADR-0006 tree.** This page documents the Next.js/PostgreSQL application that is now
> quarantined in `src/` ([why](../LEGACY-TREES.md), [ADR-0007](../adr/0007-legacy-next-tree-disposition.md)).
> Its commands — `db:push`, `DATABASE_URL`, `npm run dev` on port 3000, `npm run verify` — do not
> work in this repository. The LeadOS app is `index.html` + `app/**`: start with
> [CONTRIBUTING.md](../../CONTRIBUTING.md) and `npm run app`.

# Architecture (explanation)

The canonical architecture document, including the system diagram, is
[`docs/LEADOS-ARCHITECTURE-2026.md`](../LEADOS-ARCHITECTURE-2026.md). It lives at the repo-docs root
rather than under `explanations/` to match the naming other parts of this project reference, but it is
written in the same explanation voice (why the system is shaped this way, not how to operate it — for
that, see `docs/RUNBOOKS.md`).

Short version: one Next.js process, one PostgreSQL database, four real subsystems (scoring, rotation,
evidence ledger, tenancy), no auth yet. Read the linked document for the diagram and the full list of
known gaps.
