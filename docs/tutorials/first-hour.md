# Tutorial: your first hour with LEADOS

This tutorial was walked step-by-step during Part 21 of this project, on a fresh checkout. Every command
and every piece of output below is real — copied from an actual terminal session, not written from memory.
If a step doesn't work for you exactly as shown, that's a documentation bug; please file it.

## 0. Prerequisites

- Node.js 22+, npm 10+
- A reachable PostgreSQL instance and a `DATABASE_URL` in `.env` (already provided in this repo for local
  development: `postgresql://postgres:postgres@127.0.0.1:5432/app_db`)

## 1. Install

```
$ npm install
```

## 2. Create the schema

```
$ npx drizzle-kit push --config=drizzle.config.json
...
[✓] Pulling schema from database...
[✓] Changes applied
```

This creates `tenants`, `reps`, `rules`, `leads`, `lead_scores`, `decisions`, and `rotation_state` (see
`src/db/schema.ts`).

## 3. Seed the demo tenant

```
$ npm run seed

> leados@0.1.0 seed
> tsx scripts/seed.ts

Tenant ready: demo (id=1)
Seeded 2 reps.
Seeded 4 scoring rules.
Seeded 3 leads (unscored — score them via POST /api/leads/:id/score).
Seed complete. Next: npm run dev, then open http://localhost:3000
```

The seed script is idempotent — re-running it reuses the existing demo tenant instead of duplicating data.

## 4. Build and start

```
$ npm run build
$ npm run start
```

Confirm the app is alive:

```
$ curl -s localhost:3000/api/health
{"ok":true,"service":"leados","version":"0.1.0"}
```

## 5. Your first insight: see the unscored leads

```
$ curl -s "localhost:3000/api/leads?tenant=demo" | python3 -m json.tool
```

You'll see three seeded leads (Priya Shah / Northwind Robotics, Marco Rossi / Rossi Freight, Lena Fischer /
Fischer Analytics), each with `"latestScore": null` — they exist, but nothing has scored them yet. Open
`http://localhost:3000` in a browser and you'll see the same three leads in the dashboard, each showing
"not scored".

## 6. Your first decision: score a lead

```
$ curl -s -X POST "localhost:3000/api/leads/1/score?tenant=demo"
{"score":{"id":2,"tenantId":1,"leadId":1,"score":100,"band":"hot","breakdown":[
  {"rule":"Large company","field":"employeeCount","weight":35,"matched":true},
  {"rule":"Budget confirmed","field":"budgetConfirmed","weight":30,"matched":true},
  {"rule":"High engagement","field":"engagementScore","weight":25,"matched":true},
  {"rule":"Inbound source","field":"source","weight":10,"matched":true}
],"computedAt":"2026-10-22T14:03:39.921Z"}}
```

Priya Shah scores 100/100 ("hot") — she matches all four demo rules (big company, confirmed budget, high
engagement, inbound source). This is the system's first real, automated decision.

Confirm it was recorded in the evidence ledger, not just returned once and forgotten:

```
$ curl -s "localhost:3000/api/decisions?tenant=demo"
{"tenant":"demo","decisions":[{"id":3,"tenantId":1,"leadId":1,"type":"scored","actor":"system",
  "summary":"Scored \"Priya Shah\" (Northwind Robotics) at 100/100 — hot.", "evidence": {...}, ...}]}
```

Reload `http://localhost:3000` — the dashboard now shows Priya Shah's score (100, "hot") and the evidence
ledger entry explaining why.

## 7. Bonus: assign Priya to a rep

```
$ curl -s -X POST -H 'Content-Type: application/json' -d '{"leadId":1}' \
    "localhost:3000/api/rotations/assign?tenant=demo"
{"lead":{...,"repId":1},"rep":{"id":1,"name":"Avery Chen",...}}
```

A second evidence-ledger entry now explains the rotation decision too.

## What you just did, in LEADOS terms

- **Install → seed** gave you a tenant, reps, rules, and unscored leads.
- **First insight** was seeing that leads exist but have no score yet — there is nothing to act on until a
  decision is made.
- **First decision** was triggering the scoring engine, which is deterministic and fully explained by its
  breakdown, and is permanently recorded in the evidence ledger.

## Where a new contributor might get stuck (and the fix)

While re-walking this tutorial for this part, scoring lead #1 the *first* time only produced a score of 90,
not 100 — the "Inbound source" rule did not match even though the lead's `source` is `"inbound"`. That was
a real bug: the scorer was only given the lead's `signals` JSON blob, not its `source` column. It is fixed
in `src/app/api/leads/[id]/score/route.ts` (see `docs/AUDIT-2026.md`, finding #8) and the output above
reflects the fixed behavior. This is left in the tutorial deliberately as an example of what "tested
honestly" means for this project.
