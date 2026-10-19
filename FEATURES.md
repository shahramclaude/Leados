# LEADOS Feature Registry

One row per user-facing capability. This is the contract every later part
(1-14) moves rows on — when a capability goes from `partial`/`stub` to
`live`, update this table in the same change that ships the code, and keep
it in sync with `src/app/routes.ts`.

Status definitions:
- **live** — fully implemented, reads/writes real data, no placeholder UI.
- **partial** — implemented but intentionally narrow (narrowness explained
  in the Notes column).
- **stub** — renders but does not do real work yet.
- **deprecated** — superseded, kept only for reference.

There are currently **no `ComingSoon.tsx` placeholders or stub views
anywhere in this codebase** — grep confirms it (`grep -r "ComingSoon"
src/` returns nothing). Every route below does exactly what its
description says and nothing more.

| Route | Backing API | Backing modules | Status | Notes |
| --- | --- | --- | --- | --- |
| `/` — System Status | `GET /api/health` (indirectly, via direct `db.execute`), `GET /api/events` (via `getEventsOverview`) | `src/app/page.tsx`, `src/lib/app/events/listEvents.ts`, `src/lib/platform/db/eventsRepository.ts` | **live** | Server component. Proves Postgres connectivity by executing a real query at render time and lists the real event log (empty state included, not faked data). |
| Health check | `GET /api/health` | `src/app/api/health/route.ts` | **live** | Used by `build_and_start`/deployment platforms. Returns `{ok, service, database}` and a real error message on failure. |
| Event ingestion & log | `GET /api/events`, `POST /api/events` | `src/app/api/events/route.ts`, `src/lib/app/events/{recordEvent,listEvents}.ts`, `src/lib/domain/{eventCatalog,eventSchema}.ts`, `src/lib/platform/db/eventsRepository.ts` | **live** | Platform infrastructure, not a leadership-intelligence feature in itself. This is the backbone (versioned schema registry + append-only log) that Parts 1-14's engines (Signal Board, Thermodynamics, CAS, Risk Register, Audit Log) will write to. Currently only two generic event types are registered (`system.ping`, `system.annotation`) because no domain engine exists yet to emit domain-specific events. |

## Capabilities described in the Part 0 brief that do not exist in this codebase

The brief referenced a Signal Board (50 rules / 8 domains), a
Thermodynamics panel (entropy/SNR/bottlenecks), a CAS engine (feedback
loops/bifurcations/attractors), an 8-category Risk Register, an audit log,
and a command palette. **None of these are implemented here.** They are
explicitly out of scope for Part 0 ("no new features, no new engines") and
are not claimed as "stub" rows above because there is no route, API, or
module for them at all yet — not even a placeholder component. When a
later part implements one of these, add it to this table pointing at real
files, not before.

## Roadmap (honest, not aspirational)

| Capability | Target part | Depends on |
| --- | --- | --- |
| Signal Board (rule catalog, domains, toggles) | Part 1+ | `src/lib/domain/signals.ts` (new), new `signals`/`signal_events` tables, new event catalog entries |
| Thermodynamics (entropy/SNR/bottlenecks) | Part 2+ | Signal Board data as input; pure functions in `src/lib/domain` |
| CAS engine (loops/bifurcations/attractors) | Part 3+ | Signal Board recurrence history |
| Risk Register (8 categories, amplification) | Part 4+ | Signal Board + CAS outputs |
| Audit log UI | Part 5+ | Already has a data backbone today: every mutation already goes through the `events` table; this just needs a read-only UI route |
| Command palette | Part 6+ | `src/app/routes.ts` already gives it a real route manifest to search over |
