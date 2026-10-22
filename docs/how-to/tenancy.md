# How to: work with tenants

LEADOS isolates data by `tenant_id` on every table (`src/db/schema.ts`). There is no authentication yet —
see `docs/SECURITY.md` before using this in anything beyond local development.

## Create a new tenant

```
$ curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"slug":"acme","name":"Acme Corp"}' localhost:3000/api/tenants
{"tenant":{"id":2,"slug":"acme","name":"Acme Corp","createdAt":"..."}}
```

## Address a tenant in any request

Every scoped endpoint (`/api/rules`, `/api/leads`, `/api/leads/:id/score`, `/api/rotations/assign`,
`/api/decisions`) accepts either:

- a `?tenant=acme` query parameter, or
- an `x-leados-tenant: acme` header.

If neither is supplied, the tenant defaults to `demo` (`src/lib/tenant.ts`, `DEFAULT_TENANT_SLUG`).

```
$ curl -s "localhost:3000/api/leads?tenant=acme"
{"tenant":"acme","leads":[]}
```

## Data isolation guarantee (and its limit)

Every query is filtered by `tenant_id` server-side (e.g. `src/app/api/leads/route.ts`'s
`.where(eq(leads.tenantId, tenant.id))`), so one tenant's data is never mixed into another's response.
**What is not guaranteed** is that only authorized callers can name a given tenant slug — anyone who can
reach the API and knows (or guesses) `acme` can read/write `acme`'s data. This is tracked in
`docs/SECURITY.md` and `docs/THREAT-MODEL.md`, not hidden.

## There is no tenant deletion/archival endpoint

Deleting a tenant row directly (`DELETE FROM tenants WHERE slug = '...'`) cascades to its reps, rules,
leads, scores, decisions, and rotation state via `ON DELETE CASCADE` foreign keys defined in
`src/db/schema.ts` — but there is no API route for this yet. Use `psql` directly if you need it locally.
