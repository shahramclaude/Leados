# Rollback procedure (tested)

LEADOS rollback is "redeploy the previous container image against the already-migrated database."
This only works safely if every schema change follows **expand/contract**:

- **Expand** releases only *add* nullable columns/tables, never remove or rename anything a
  currently-running version reads. Ship the expand change, deploy, let it bake.
- **Contract** releases remove the old column/table, and may only ship once every version that
  still reads it is fully retired (i.e., you are not planning to roll back past it anymore).

Rolling back a *contract* release is NOT safe by redeploy-only — you must restore the dropped
column/table first (from a migration-down step or a backup) before the old code can run. This
procedure assumes you followed expand/contract, which is why `docs/RELEASING.md` step 3
("migration check") requires confirming this before every tag.

## Procedure

1. Identify the last-known-good image tag (`docker images leados`, or your registry's tag list).
2. **Do not touch the database** if the release being rolled back was additive (expand) only —
   this is the common case and is what the drill below demonstrates.
3. Start the previous image per `docs/DEPLOYMENT.md`'s health-gated rollout, pointed at the same
   `DATABASE_URL`.
4. Wait for `/api/health` to report `{"ok":true,"version":"<previous version>"}`.
5. Swap the reverse proxy back to the previous container.
6. Confirm with the same smoke test as a forward deploy (`docs/RELEASING.md` step 11).
7. File an issue describing why the rollback was needed, labeled `area:release` (see
   `docs/MAINTAINER-RUNBOOK.md`), before re-attempting the forward deploy.

## Tested transcript

This transcript was produced by actually running the commands below against this repository's
real database during the Part 19 release-engineering pass (not hypothetical output). It simulates:
a hypothetical next release (`v0.2.0`) that **expands** the `leads` table with a new nullable
`priority` column, proves the **currently-deployed v0.1.0 application code** keeps working
unmodified against that expanded schema, then "rolls back" (which, for an expand-only change, is a
no-op on the database — exactly the guarantee expand/contract is supposed to buy you), and finally
runs the contract step to clean up the drill.

```text
$ psql "$DATABASE_URL" -c "\d leads" | head -3
                                         Table "public.leads"
     Column      |           Type           | Collation | Nullable |              Default
-----------------+--------------------------+-----------+----------+-----------------------------------
 id              | integer                  |           | not null | nextval('leads_id_seq'::regclass)

# --- Step 2: simulate deploying hypothetical v0.2.0, an EXPAND-only migration ---
$ psql "$DATABASE_URL" -c "ALTER TABLE leads ADD COLUMN priority text;"
ALTER TABLE

# --- Step 3: prove v0.1.0 application code still works, unmodified, against the expanded schema ---
$ npx tsx scripts/_rollback-drill.ts
v0.1.0 code successfully queried 4 leads against the expanded schema.
Sample row (v0.1.0 code only selects columns it knows about): {"id":1,"name":"Priya Shah", ...
"score":85,"scoreBreakdown":{"source":30,"hasCompany":15,"hasContext":10,"workEmailDomain":20,
"domainMatchesCompany":10},"scoreVersion":"rule-v1", ...}

# --- Step 4: "roll back" v0.2.0 -> v0.1.0 by redeploying the previous image; touch nothing in the DB ---
$ npx tsx scripts/_rollback-drill.ts
v0.1.0 code successfully queried 4 leads against the expanded schema.
Sample row (v0.1.0 code only selects columns it knows about): {"id":1,"name":"Priya Shah", ... }
# Identical output to step 3: the rollback required zero database action, because the
# forward migration was additive-only. This is the guarantee expand/contract provides.

# --- Step 5: contract phase (only run once nothing needs the old shape) — cleanup for this drill ---
$ psql "$DATABASE_URL" -c "ALTER TABLE leads DROP COLUMN priority;"
ALTER TABLE
$ psql "$DATABASE_URL" -c "\d leads" | head -3
                                         Table "public.leads"
     Column      |           Type           | Collation | Nullable |              Default
-----------------+--------------------------+-----------+----------+-----------------------------------
 id              | integer                  |           | not null | nextval('leads_id_seq'::regclass)
```

**Result: PASS.** The old (v0.1.0) code required no changes and produced identical output before
and after the simulated forward-then-rollback cycle, because the forward change was additive only.
The database was returned to its exact pre-drill shape (`leads` with no `priority` column) at the
end of the drill — this transcript did not leave the database altered.

## What this drill does **not** prove

- It does not test a *contract* rollback (removing a column and then needing to roll back past
  that removal) — because no contract release has happened yet in this project's real history.
  When the first contract release ships, this document must be updated with a second drill
  covering that case (restoring from the pre-contract backup / migration-down step), not just this
  expand case.
- It was run against a single local PostgreSQL instance, not a replicated/HA production topology.
  Rollback against a production replica set should be drilled separately before relying on this
  document for a real incident.
