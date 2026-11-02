> **Historic — describes the frozen pre-ADR-0006 tree.** This page documents the Next.js/PostgreSQL application that is now
> quarantined in `src/` ([why](../LEGACY-TREES.md), [ADR-0007](../adr/0007-legacy-next-tree-disposition.md)).
> Its commands — `db:push`, `DATABASE_URL`, `npm run dev` on port 3000, `npm run verify` — do not
> work in this repository. The LeadOS app is `index.html` + `app/**`: start with
> [CONTRIBUTING.md](../../CONTRIBUTING.md) and `npm run app`.

# Reference: API

The full API reference lives at [`docs/API.md`](../API.md) (kept at the docs root rather than nested, so
it sits next to the machine-readable [`openapi.yaml`](../../openapi.yaml) it mirrors). It documents every
route under `src/app/api/**/route.ts`, request/response shapes, and status codes, with real `curl` output.
