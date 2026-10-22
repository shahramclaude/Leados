# Rollback Drill (executed transcript)

This drill was actually run, in order, against the live migrated database during this part — not written
from memory or simulated. It demonstrates the expand/contract guarantee referenced in
`docs/RUNBOOKS.md`: an additive ("expand") schema change is safe to apply ahead of application code, and
reversing it ("contract") is safe as long as no shipped application code has started depending on it.

## Setup: baseline schema, before the drill

```
$ psql "$DATABASE_URL" -c "\d decisions"
                                       Table "public.decisions"
   Column   |           Type           | Collation | Nullable |                Default
------------+--------------------------+-----------+----------+---------------------------------------
 id         | integer                  |           | not null | nextval('decisions_id_seq'::regclass)
 tenant_id  | integer                  |           | not null |
 lead_id    | integer                  |           |          |
 type       | text                     |           | not null |
 actor      | text                     |           | not null | 'system'::text
 summary    | text                     |           | not null |
 evidence   | jsonb                    |           | not null |
 created_at | timestamp with time zone |           | not null | now()
Indexes:
    "decisions_pkey" PRIMARY KEY, btree (id)
Foreign-key constraints:
    "decisions_lead_id_leads_id_fk" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    "decisions_tenant_id_tenants_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE

$ curl -s localhost:3000/api/health
{"ok":true,"service":"leados","version":"0.1.0"}
```

## Step 1 — EXPAND: apply an additive migration the running app doesn't know about

```
$ psql "$DATABASE_URL" -c "ALTER TABLE decisions ADD COLUMN severity text;"
ALTER TABLE
```

Confirm the already-running application (whose `src/db/schema.ts` does **not** declare `severity`) is
unaffected:

```
$ curl -s localhost:3000/api/health
{"ok":true,"service":"leados","version":"0.1.0"}

$ curl -s "localhost:3000/api/decisions?tenant=demo" | head -c 400
{"tenant":"demo","decisions":[{"id":3,"tenantId":1,"leadId":1,"type":"scored","actor":"system",
"summary":"Scored \"Priya Shah\" (Northwind Robotics) at 100/100 — hot.","evidence":{"breakdown":[
{"rule":"Large company","field":"employeeCount","weight":35,"matched":true},...
```

The app keeps serving correctly. This proves the "expand" half of the guarantee: Drizzle's generated SQL
selects/inserts only the columns declared in `src/db/schema.ts`, so an extra, undeclared column is
invisible to — and harmless for — the running application.

## Step 2 — simulate a partially-rolled-forward writer using the new column

```
$ psql "$DATABASE_URL" -c "INSERT INTO decisions (tenant_id, lead_id, type, actor, summary, evidence, severity)
    VALUES (1, 1, 'scored', 'drill', 'rollback drill row', '{}'::jsonb, 'info');"
INSERT 0 1

$ curl -s "localhost:3000/api/decisions?tenant=demo" | head -c 300
{"tenant":"demo","decisions":[{"id":4,"tenantId":1,"leadId":1,"type":"scored","actor":"drill",
"summary":"rollback drill row","evidence":{},"createdAt":"2026-10-22T14:05:20.812Z"},...
```

The app reads the new row fine — it just doesn't surface the `severity` value, because it never asked for
it. This is exactly the state a deploy would be in mid-rollout: new data arriving with a column the
currently-running code doesn't use yet.

## Step 3 — CONTRACT: roll back the migration

```
$ psql "$DATABASE_URL" -c "ALTER TABLE decisions DROP COLUMN severity;"
ALTER TABLE

$ curl -s localhost:3000/api/health
{"ok":true,"service":"leados","version":"0.1.0"}

$ psql "$DATABASE_URL" -c "\d decisions"
                                       Table "public.decisions"
   Column   |           Type           | Collation | Nullable |                Default
------------+--------------------------+-----------+----------+---------------------------------------
 id         | integer                  |           | not null | nextval('decisions_id_seq'::regclass)
 tenant_id  | integer                  |           | not null |
 lead_id    | integer                  |           |          |
 type       | text                     |           | not null |
 actor      | text                     |           | not null | 'system'::text
 summary    | text                     |           | not null |
 evidence   | jsonb                    |           | not null |
 created_at | timestamp with time zone |           | not null | now()
...
```

The schema is back to baseline, the app never stopped responding, and `/api/health` stayed green through
the entire add→use→drop cycle.

## Step 4 — clean up the drill artifact

```
$ psql "$DATABASE_URL" -c "DELETE FROM decisions WHERE actor = 'drill';"
DELETE 1

$ curl -s "localhost:3000/api/decisions?tenant=demo" | head -c 300
{"tenant":"demo","decisions":[{"id":3,"tenantId":1,"leadId":1,"type":"scored","actor":"system",
"summary":"Scored \"Priya Shah\" (Northwind Robotics) at 100/100 — hot.",...
```

The ledger is back to only real, seeded-and-scored demo data.

## What this drill proves, and what it doesn't

**Proves:** an additive column can be added and removed around a running, unmodified application without
downtime or errors, which is the core expand/contract guarantee this project relies on for safe rollbacks
(`docs/RUNBOOKS.md`).

**Does not prove:** safety of a `NOT NULL` addition, a column rename, a type change, or a column drop that
application code *is* actively reading from — those are the migrations the expand/contract discipline
exists specifically to avoid attempting in a single step. Always expand in one deploy, migrate reads/writes
in the next, and only contract once nothing depends on the old shape.
