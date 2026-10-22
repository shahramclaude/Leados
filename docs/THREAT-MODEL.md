# Threat Model (STRIDE-lite pass, v0.1.0)

Scope: the LEADOS v0.1.0 baseline described in `docs/LEADOS-ARCHITECTURE-2026.md` — a single Next.js
process and one PostgreSQL database, no auth layer.

| Threat | Applies today? | Notes |
|---|---|---|
| **Spoofing** (pretending to be another tenant) | **Yes — unmitigated.** | Tenant identity is a client-supplied string (`?tenant=` or header), not a verified credential. Any caller can act as any tenant slug they can guess. See `src/lib/tenant.ts`. |
| **Tampering** (modifying data you shouldn't) | **Yes — unmitigated**, same root cause. | There is no write authorization check beyond "you named a valid tenant slug". |
| **Repudiation** (denying an action happened) | **Partially mitigated** for automated actions. | The evidence ledger (`decisions` table) records every automated scoring/rotation decision with evidence, append-only. It does **not** record manual API calls that don't result in a scoring/rotation decision (e.g. a plain `GET /api/leads`), and `actor` is always `"system"` since there is no authenticated human actor yet. |
| **Information disclosure** (seeing data you shouldn't) | **Yes — unmitigated.** | Same root cause as spoofing: no access control between tenants. |
| **Denial of service** | **Yes — unmitigated.** | No rate limiting, no request size limits beyond Next.js/Node defaults, no per-tenant quota. |
| **Elevation of privilege** | **N/A today** | There are no privilege levels yet (no roles) — this will become relevant once auth/RBAC is added. |

## Highest-priority mitigation (not yet built)

Adding tenant-scoped authentication (verifying the caller is allowed to act as the tenant they name) would
close the Spoofing/Tampering/Information Disclosure rows in one change, since they all share the same root
cause. This is the single most important security gap in the current baseline and is flagged as the
top roadmap item in `FEATURES.md` and `docs/SECURITY.md`.

## Out of scope for this document

This threat model does not cover infrastructure-level concerns (hosting provider security, network
segmentation, TLS termination) because this repository does not define or control deployment
infrastructure — see `docs/RELEASING.md` for what the release pipeline does and does not assume about the
deployment target.
