# LEADOS Feature Contract

One row per user-facing capability. This table is the contract every later part moves rows on —
a part that changes a route's status must update this file in the same change, and the status here
must always equal the `status` field for the same route in `src/app/routes.ts`
(`docs/AUDIT-2026.md` §2 shows the cross-check for the current state: 0 mismatches).

| Route | Backing API route(s) | Backing engine(s) | Status | Owner part |
|---|---|---|---|---|
| `/` (dashboard) | — (reads via server component) | `getDashboardSummary()` → `organizationRepository`, `leaderRepository`, `eventRepository` | live | Part 00 |
| `/organizations` | `GET/POST /api/organizations` | `createOrganization()`, `listOrganizations()` → `organizationRepository` | live | Part 00 |
| `/leaders` | `GET /api/leaders` | `listLeaders()` → `leaderRepository` | live | Part 00 |
| `/leaders/new` | `POST /api/leaders` | `registerLeader()` → `computeReadiness()` (pure) + `leaderRepository` + `eventRepository` | live | Part 00 |
| `GET /api/health` | itself | `validateConfig()` + raw `select 1` (documented exception, see `ARCHITECTURE.md` rule 5) | live | Part 00 |

Capabilities explicitly **not yet built** (so later parts know what they own, not what they're
inventing from scratch):

| Planned capability | Status | Likely owner part |
|---|---|---|
| Autonomous agent loop consuming `event_log` | not started | Part 06–08 per `ARCHITECTURE.md` migration order |
| Leadership readiness engine v2 (beyond the 3-input linear model in `readinessEngine.ts`) | not started | Part 03–05 |
| Authentication / multi-tenant organization access | not started | unassigned — flag for program planning |
| Committed Drizzle migration files (`drizzle/`) replacing `db:push` | not started | triggered by first real deploy pipeline, see ADR-0004 |
| CI wiring for `routes.ts` vs. filesystem drift check (`findMismatches()` exists, not yet run in CI) | not started | Part 01 (see Adversarial self-review Q5) |
