# LEADOS — Feature Status

Honest status of what is actually implemented in this workspace.

> **Read this first.** The canonical, runnable product is the **zero-build static app** at
> `index.html` + `app/**` (start it with `npm run app`, open `#/today`; `npm test` runs 475 tests
> across 38 suites). It covers: Today triage; people and roster; 1:1s, prep sheets and feedback;
> goals and execution tracking; delegations; DACI decisions; reviews and growth; onboarding and
> role transitions; conflict and pulse (private); a cross-domain **Operational Cases** module with
> FMEA/PERT/Mendelow/5-Whys analysis and an event-driven propagation engine (Schema v15); and, new
> in Schema v16, **Capacity, flow & portfolio allocation** at `#/capacity` — Little's Law and
> Kingman queue-delay modelling, WIP limits, value-density funding decisions, cumulative P50/P80/P90
> forecasts, and capacity reserves maintained automatically from cases (`RULE-CAP-01`..`04`); and,
> newest in Schema v17, **Selection & hiring** at `#/hiring` — structured competency evidence weighted
> by method validity, correlated-evidence discounting, a falsification test, funnel and
> cost-of-vacancy arithmetic, and three automation rules (`RULE-HIRE-01`..`03`) that reserve
> interview capacity, turn an accepted offer into a roster record plus a 30-60-90 plan, and escalate
> a stalled role into a full operational case. Schema v18 adds a **candidate retention reminder**
> (`HIRE-08`, `#/hiring`) that lists records past a configurable window and never deletes anything by
> itself. Later schemas (see ROADMAP.md for the verified inventory): v19 organizational design,
> team topologies & change execution with Shewhart XmR SPC; v20 seeded Monte Carlo portfolio/J-curve
> simulation, export governance, and counterfactual scenario sandboxing with Pareto dominance and
> tornado sensitivity; v21 forecast calibration (Brier-scored decision forecasts, funding-time
> estimate snapshots, reference-class uplifts); v22 the case-cost calibration ledger (settled case
> actuals scored as FAIR frequency × magnitude against opening forecasts); v23 the **Negotiation
> Workbench** at `#/negotiations` — Fisher & Ury BATNA discipline with a weighted preparation
> checklist, Raiffa reservation-price/ZOPA geometry per measurable issue, Lax & Sebenius package
> options, agreement term ownership, and three automation rules (`RULE-NEG-01`..`03`) that fan out
> mandate DACI decisions, coaching edges and goal links in parallel, turn an impasse into an
> operational escalation case, and convert owned agreed terms into tracked delegations.
> 23 formula-safe CSV scopes, schema migrations from v1, and an append-only action log.
>
> Verified this session: 475 tests across 38 suites (including 18 Negotiation Workbench tests with a
> JSDOM + axe-core UI workflow); `npm run lint`, the canonical boundary check and the docs-link check
> are clean; a 120-person/300-case/40-role workspace normalizes in ~35 ms. **Not** verified:
> real-browser, screen-reader or manager-comprehension behaviour — no browser engine or assistive
> technology can run in this container (see `docs/VALIDATION-2026-10-25-session-27.md`), so those
> remain **[UNVERIFIED]**.
>
> The sections below describe the **legacy Next.js/Drizzle experiment** (`src/**`, root `*.tsx`),
> which is kept for history only and has not been executed or verified this session
> (**[UNVERIFIED]**). See `LEADOS-STATE.md` for the full continuity record.

## Live
- **Multi-tenant storage** — every business table (`leads`, `decisions`, `knowledge_entries`, `entities`, `events`, `users`) carries `tenant_id`; queries are scoped per tenant via `src/lib/tenant.ts`.
- **Deterministic, explainable lead scoring** — `src/lib/scoring.ts` computes a 0–100 score from named, weighted criteria and returns the full contribution breakdown with every score.
- **Append-only, hash-chained evidence ledger** — `src/lib/ledger.ts` writes every scoring and stage-change decision to the `decisions` table with a SHA-256 hash chained to the previous entry. `/api/decisions/verify` recomputes the chain and reports whether it is intact.
- **Knowledge substrate with honesty labels** — every knowledge entry and every ledger entry carries a `confidenceLabel` of `measured`, `estimated`, `association`, or `effect` — nothing is asserted more strongly than its evidence supports.
- **REST API** — `/api/leads`, `/api/leads/[id]`, `/api/decisions`, `/api/decisions/verify`, `/api/knowledge`, `/api/stats`, `/api/health`.
- **Executive dashboard UI** — overview KPIs, top-scoring leads, recent ledger entries, full leads board with inline score breakdown, ledger explorer with chain verification, knowledge board.

## Absent
- Authentication / authorization (no login, no RBAC, no session).
- Event-sourcing is seeded (`events` table exists) but not yet the system of record for every mutation — reads still go through normal table queries.
- Automated test suite (vitest/playwright) — not present in this workspace yet.
- Multi-tenant switching UI (schema supports it; no tenant picker exists).
- Everything described in Parts 02–139 of the supplied LEADOS Integration
  Master beyond what is listed above (causal engines, agent orchestration,
  design bible, workflow engine, etc.) — none of that is built in this
  workspace. Do not assume otherwise; see `LEADOS-STATE.md`.

## Roadmap (natural next extensions of this exact codebase)
- Wire `entities`/`events` as the actual source of truth, with `leads` as a projection.
- Add auth (e.g. email/password or OAuth) and tenant-scoped sessions.
- Add a vitest suite for `src/lib/scoring.ts` and `src/lib/ledger.ts` (pure functions, easy to test).
- Add a tenant switcher once a second tenant is needed.
