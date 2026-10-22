# Security Posture

## Current state (honest, as of v0.1.0)

- **No authentication.** No login, no session, no API key check exists anywhere in `src/app/api/**`.
- **No authorization.** The active tenant is whatever the caller names via `?tenant=` or the
  `x-leados-tenant` header (`src/lib/tenant.ts:16-20`). Any caller that knows or guesses a tenant slug can
  read and write that tenant's leads, rules, reps, and evidence ledger.
- **Secrets handling.** The only secret is `DATABASE_URL`, read from `.env` via `process.env` in
  `src/db/index.ts:4`. It is never sent to the client (no `NEXT_PUBLIC_` prefix) and is not logged.
- **Input validation.** Route handlers do shallow presence/type checks on request bodies (see e.g.
  `src/app/api/leads/route.ts`'s `CreateLeadBody` check) but do not validate email format, string length,
  or sanitize `signals`/`evidence` JSON payloads beyond what `jsonb` storage requires.
- **SQL injection.** All queries go through Drizzle's query builder with parameterized values; there is no
  raw string-interpolated SQL anywhere in the route handlers (the one raw `sql` usage, in
  `src/app/api/health/route.ts`, is a constant `select 1` with no interpolation).
- **Dependency posture.** `npm audit` reports vulnerabilities inherited from the starter template's
  dependency tree (dev-time tooling, not runtime code paths exercised by this app). Run `npm audit` for
  the current count before every release; this is tracked in `docs/RELEASING.md`'s checklist, not silently
  ignored.

## What this means for deployment

**Do not deploy this baseline to handle real customer data without adding authentication/authorization
first.** The current version is suitable for: local development, internal demos, and as the foundation
for the next part's auth work. It is explicitly not suitable for a multi-tenant production deployment
where tenants should not be able to see each other's data by guessing a slug.

## Roadmap (not implemented)

- Authenticated sessions / API tokens scoped to a single tenant.
- Role-based access control for who can create rules, score leads, or reassign reps.
- Per-tenant rate limiting.
- Audit logging of read access (the evidence ledger logs automated *decisions*, not raw read access — see
  `docs/EVIDENCE-LEDGER.md`).
- Secrets management beyond a flat `.env` file (e.g. a secrets manager) for production deployments.

See `docs/THREAT-MODEL.md` for a structured walk-through of the attack surface this implies.
