# Reference: event / decision types

LEADOS does not have an event bus or pub/sub system (see `docs/REALTIME.md`). The closest thing to an
"event type" is the `decisions.type` column in the evidence ledger (`src/db/schema.ts:94-107`). This page
is generated from the literal string values actually written by the two call sites that insert decisions.

| `type` | Written by | `evidence` shape | `summary` example |
|---|---|---|---|
| `"scored"` | `src/app/api/leads/[id]/score/route.ts` | `{ rulesEvaluated: number, breakdown: ScoreBreakdownEntry[] }` | `Scored "Priya Shah" (Northwind Robotics) at 100/100 — hot.` |
| `"rotated"` | `src/app/api/rotations/assign/route.ts` | `{ candidateRepIds: number[], chosenRepId: number }` | `Assigned "Priya Shah" (Northwind Robotics) to Avery Chen via round-robin rotation.` |

`actor` is always `"system"` for both types today — there is no authenticated human actor yet
(`docs/SECURITY.md`).

## Adding a new decision type

If you add a new automated action, append a new literal `type` value (don't reuse `"scored"`/`"rotated"`
for something unrelated) and add it to this table and to `docs/EVIDENCE-LEDGER.md`'s schema description in
the same change — this file is meant to be kept in sync with the actual insert call sites, not aspirational.
