# API Reference

Generated from the route handlers under `src/app/api/**/route.ts` and verified by hand against real
`curl` output on `npm run build && npm run start`. A machine-readable version of the same surface lives at
`openapi.yaml` (used by `.github/workflows/release.yml` to publish an API spec artifact).

All endpoints are scoped to a tenant via `?tenant=<slug>` (defaults to `demo`) or the
`x-leados-tenant: <slug>` header — see `src/lib/tenant.ts`. **There is no authentication**; see
`docs/SECURITY.md`.

## `GET /api/health`

Liveness/readiness check. Runs `select 1` against PostgreSQL.

```json
{ "ok": true, "service": "leados", "version": "0.1.0" }
```

Returns HTTP 500 with `{ "ok": false, ... }` if the database is unreachable.

## `GET /api/tenants` / `POST /api/tenants`

- `GET` returns all tenants: `{ "tenants": [...] }`.
- `POST { "slug": string, "name": string }` creates a tenant. 201 on success, 400 if fields are missing.

## `GET /api/rules` / `POST /api/rules`

Scoped by tenant.

- `GET` → `{ "tenant": "demo", "rules": [...] }`.
- `POST { "name": string, "field": string, "operator": "gte"|"lte"|"eq"|"truthy", "value": string, "weight": number }`
  creates a scoring rule. 201 on success, 400 if fields are missing/invalid, 404 if the tenant doesn't exist.

## `GET /api/leads` / `POST /api/leads`

Scoped by tenant.

- `GET` → `{ "tenant": "demo", "leads": [{ ...lead, "latestScore": {...} | null }] }`.
- `POST { "name": string, "company": string, "email": string, "source"?: string, "signals"?: object }`
  creates a lead (unscored). 201 on success, 400 if required fields are missing, 404 if the tenant doesn't
  exist.

## `POST /api/leads/:id/score`

Runs the deterministic scoring engine (`src/lib/scoring.ts`) against the lead's signals (merged with its
`source` column) using the tenant's active rules, persists a `lead_scores` row, and appends a `"scored"`
row to the evidence ledger (`decisions`).

Response:

```json
{
  "score": {
    "id": 2, "tenantId": 1, "leadId": 1, "score": 100, "band": "hot",
    "breakdown": [
      { "rule": "Large company", "field": "employeeCount", "weight": 35, "matched": true },
      { "rule": "Budget confirmed", "field": "budgetConfirmed", "weight": 30, "matched": true },
      { "rule": "High engagement", "field": "engagementScore", "weight": 25, "matched": true },
      { "rule": "Inbound source", "field": "source", "weight": 10, "matched": true }
    ],
    "computedAt": "2026-10-22T14:03:39.921Z"
  }
}
```

404 if the lead doesn't exist for the resolved tenant. 400 if `:id` is not an integer.

## `POST /api/rotations/assign`

Body: `{ "leadId": number }`. Assigns the lead to the next active rep in round-robin order
(`src/lib/rotation.ts`), updates `leads.rep_id` and `rotation_state`, and appends a `"rotated"` row to the
evidence ledger.

Response: `{ "lead": {...}, "rep": {...} }`. 409 if there are no active reps. 404 if the lead/tenant don't
match.

## `GET /api/decisions`

Returns the 50 most recent evidence-ledger rows for the tenant, newest first:
`{ "tenant": "demo", "decisions": [...] }`. See `docs/EVIDENCE-LEDGER.md` for the row shape.

## Error shape

Every error response is `{ "error": string }` with a `4xx`/`5xx` status — there is no structured error
code system yet (roadmap).
