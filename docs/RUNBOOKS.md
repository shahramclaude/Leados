# Runbooks

Operational procedures that are real and have been executed during this part (not aspirational).

## Start from zero (fresh environment)

```
$ npm install
$ npx drizzle-kit push --config=drizzle.config.json   # creates all tables from src/db/schema.ts
$ npm run seed                                        # creates the "demo" tenant, reps, rules, leads
$ npm run build && npm run start                      # or: npm run dev
$ curl -s localhost:3000/api/health                   # expect {"ok":true,...}
```

## Score a lead / verify the evidence ledger

```
$ curl -s -X POST "http://localhost:3000/api/leads/1/score?tenant=demo"
$ curl -s "http://localhost:3000/api/decisions?tenant=demo"
```

## Rotate (assign) a lead to a rep

```
$ curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"leadId":1}' "http://localhost:3000/api/rotations/assign?tenant=demo"
```

## Database schema change (expand/contract)

1. **Expand**: add new nullable columns or new tables to `src/db/schema.ts`, run
   `npx drizzle-kit push --config=drizzle.config.json`. Never ship a migration that makes a column
   `NOT NULL` or drops a column in the same step application code is deployed — see
   `docs/ROLLBACK-DRILL.md` for a tested example of why this is safe.
2. Deploy application code that uses the new column(s).
3. **Contract** (later release, once old code paths are retired): remove any now-unused columns/tables
   from `src/db/schema.ts` and push again.

## Rollback a bad deploy

If a deploy must be rolled back **after** an expand migration already ran:

1. Redeploy the previous application version/container tag.
2. Leave the expanded schema in place — it is additive, so the previous application version, which never
   referenced the new column(s), continues to work unmodified (Drizzle only selects/writes columns it
   knows about, see `docs/ROLLBACK-DRILL.md`).
3. Only drop the new column(s) once you are certain no version of the application (old or new) still
   needs them.

## Reset the demo tenant's decisions/scores (for a clean demo)

```
$ psql "$DATABASE_URL" -c "delete from lead_scores; delete from decisions; update leads set rep_id=null; delete from rotation_state;"
```

## Check for stale "Arena"/legacy branding after any merge

```
$ grep -ril "arena" --include="*.ts" --include="*.tsx" src/
```

Expected: no output. This is the same check performed in `docs/AUDIT-2026.md`.
