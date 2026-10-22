# Evidence Ledger

## What it is

The `decisions` table (`src/db/schema.ts:94`) is an append-only log of every automated action LEADOS has
taken. Nothing updates or deletes rows in this table from application code — only inserts, from exactly
two call sites today:

- `src/app/api/leads/[id]/score/route.ts` — inserts a row with `type: "scored"` whenever a lead is scored,
  including the full rule-by-rule breakdown (`evidence.breakdown`) that produced the score.
- `src/app/api/rotations/assign/route.ts` — inserts a row with `type: "rotated"` whenever a lead is
  assigned to a rep, including which reps were eligible candidates and which one was chosen
  (`evidence.candidateRepIds`, `evidence.chosenRepId`).

## Schema

| Column | Type | Meaning |
|---|---|---|
| `id` | serial | Primary key. |
| `tenant_id` | integer, FK → `tenants.id` | Which tenant this decision belongs to. |
| `lead_id` | integer, FK → `leads.id`, nullable | Which lead the decision is about (nullable so a future tenant-level decision isn't forced to reference a lead). |
| `type` | text | `"scored"` or `"rotated"` today. New types should be added as new literal values, not overload existing ones. |
| `actor` | text | Who/what made the decision. Always `"system"` today — there is no human-initiated action yet. |
| `summary` | text | One-sentence, human-readable description of what happened. Shown directly in the dashboard (`src/app/page.tsx`). |
| `evidence` | jsonb | The raw data that justifies the decision — e.g. the full rule breakdown, or the candidate/chosen rep ids. |
| `created_at` | timestamptz | When the decision was recorded. |

## Why append-only matters

Because nothing in the codebase updates or deletes a `decisions` row, the ledger for a given lead is a
complete, ordered history of every automated action taken on it. `GET /api/decisions` returns the most
recent 50 rows for a tenant, newest first (`src/app/api/decisions/route.ts`).

## What is honestly NOT part of the evidence ledger today

- **No human actor support.** There is no login, so every row's `actor` is `"system"`. A future
  authenticated write path (e.g. a rep manually overriding a score) should populate `actor` with a real
  user identifier — this is roadmap, not implemented.
- **No retention policy or archival.** The table grows unbounded; there is no partitioning or TTL.
- **No tamper-evidence (hashing/signing).** Rows can be deleted by direct database access (e.g. by anyone
  with `DATABASE_URL`); the ledger is an audit trail for application-level mistakes and transparency, not
  a cryptographically tamper-evident log.
- **No export/webhook delivery.** Reading the ledger requires calling `GET /api/decisions`; there is no
  push mechanism (see `docs/REALTIME.md`).

## Verifying it yourself

```
$ curl -s -X POST "http://localhost:3000/api/leads/1/score?tenant=demo"
$ curl -s "http://localhost:3000/api/decisions?tenant=demo"
```

The second call returns a `"scored"` decision whose `evidence.breakdown` matches exactly what the first
call returned — the ledger is not a summary, it is the actual evidence.
