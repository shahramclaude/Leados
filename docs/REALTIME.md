> **Historic — describes the frozen pre-ADR-0006 tree.** This page documents the Next.js/PostgreSQL application that is now
> quarantined in `src/` ([why](LEGACY-TREES.md), [ADR-0007](adr/0007-legacy-next-tree-disposition.md)).
> Its commands — `db:push`, `DATABASE_URL`, `npm run dev` on port 3000, `npm run verify` — do not
> work in this repository. The LeadOS app is `index.html` + `app/**`: start with
> [CONTRIBUTING.md](../CONTRIBUTING.md) and `npm run app`.

# Realtime

**Status: not implemented.** LEADOS v0.1.0 is entirely request/response. There is no WebSocket server,
Server-Sent Events endpoint, polling convention, or message broker anywhere in this codebase.

## What this means concretely

- The dashboard (`src/app/page.tsx`) is a server component — it reflects the database state at the moment
  the page is rendered. It does not update live when a lead is scored or rotated elsewhere; reload the
  page to see new data.
- `GET /api/decisions` and `GET /api/leads` are pull-only. There is no subscription or webhook mechanism
  for consumers who want to react to new evidence-ledger entries as they happen.
- There is no "sensing" layer (ingesting external real-time signals about a lead, e.g. website visits or
  email opens) — all lead `signals` are set at creation time via `POST /api/leads` or during seeding
  (`scripts/seed.ts`).

## Roadmap intent (not built, not scheduled)

A future realtime layer would most plausibly add either polling-friendly `updated_at` cursors on
`decisions`/`lead_scores`, or a Postgres `LISTEN/NOTIFY`-based SSE endpoint, given the current
single-process, single-database architecture (`docs/LEADOS-ARCHITECTURE-2026.md`). Neither has been
designed in detail, and no part number has formally committed to delivering it.
