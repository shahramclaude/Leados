# How to: rotate (assign) leads to reps

Rotation is a deterministic round-robin over a tenant's active reps (`src/lib/rotation.ts`).

## Assign a lead

```
$ curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"leadId": 2}' "localhost:3000/api/rotations/assign?tenant=demo"
{"lead":{...,"repId":2},"rep":{"id":2,"name":"Jordan Patel",...}}
```

## How the "next" rep is chosen

1. All reps for the tenant are fetched, filtered to `active: true`, and sorted by `id` ascending
   (`src/lib/rotation.ts`'s `nextRepInRotation`) — this ordering is stable and does not depend on how reps
   were returned from the database.
2. The tenant's `rotation_state.last_rep_id` (one row per tenant) is looked up.
3. The next rep after `last_rep_id` in that sorted list is chosen, wrapping around to the first rep if
   `last_rep_id` was the last one (or no longer exists/is inactive).
4. `rotation_state.last_rep_id` is updated, the lead's `rep_id` is set, and a `"rotated"` row is appended
   to the evidence ledger with the full candidate list and the chosen rep id.

This logic is fully covered by `tests/rotation.test.ts` (5 cases: first assignment, cycling, skipping
inactive reps, no active reps, and recovering from an unknown/removed last rep).

## What rotation does NOT do (yet)

- **No capacity awareness.** A rep with 200 open leads gets the next lead exactly the same as a rep with
  zero.
- **No skill/territory matching.** Rotation is pure round-robin; it does not look at the lead's signals at
  all.
- **No manual override endpoint.** To manually assign a lead to a specific rep (bypassing rotation), update
  `leads.rep_id` directly via `psql` — there's no API for it, and doing so will not write an evidence
  ledger entry (only `/api/rotations/assign` does).
- **No re-assignment on rep deactivation.** If a rep is marked `active = false`, leads already assigned to
  them are not reassigned automatically.

These are real, acknowledged gaps — see `FEATURES.md` for the live/partial/stub classification.
