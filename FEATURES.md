# LEADOS — Feature Status

Honest status of what is actually implemented in this workspace.

> **Read this first.** The canonical, runnable product is the **zero-build static app** at
> `index.html` + `app/**` (start it with `npm run app`, open `#/today`; `npm test` runs **664 tests
> across 45 suites**). It covers: Today triage; people and roster; 1:1s, prep sheets and feedback;
> goals and execution tracking; delegations; DACI decisions; reviews and growth; onboarding and
> role transitions; conflict and pulse (private); cross-domain **Operational Cases** with
> FMEA/PERT/Mendelow/5-Whys analysis and an event-driven propagation engine; **Capacity, flow &
> portfolio allocation** (`#/capacity`); **Selection & hiring** (`#/hiring`); organizational design,
> team topologies and Shewhart XmR change control (`#/changes`); seeded Monte Carlo portfolio and
> J-curve simulation, counterfactual scenario sandboxing with Pareto/tornado analysis
> (`#/scenarios`); forecast calibration; the case-cost ledger; the **Negotiation Workbench**
> (`#/negotiations`); **budget envelopes and financial commitments** (`#/finance`); the
> **Stakeholder Influence Register** (`#/stakeholders`); the **Forecast Integrity Terminal**
> (`#/forecasts`); the **Natural-Language Intake Terminal** (`#/intake`); the **Decision Tempo &
> Timing Terminal** (`#/tempo`) — per-decision cost of delay with Reinertsen's four delay profiles,
> closed-form preposterior EVSI for the option to wait, an optimal decision date with a switch
> probability, value at stake derived from typed graph links with currencies never summed, measured
> decision latency with a split-conformal class band (counts-only below n=5), five post-commit rules
> (`RULE-DLY-01..05`), `DLY-01..06` signals and CSV scope #28; and, newest in **Schema v29**, the
> **Retention Intelligence & Talent Economics Terminal** (`#/retention`) — Kaplan–Meier survival of
> tenure with Greenwood log–log bands and explicit censoring, Lexis person-month tenure-band hazards
> with empirical-Bayes smoothing, a penalised Poisson hazard model that abstains below ten observed
> voluntary departures, six record-based risk factors behind the existing privacy wall, a relative
> risk index with the absolute probability and its interval beside it, recorded-cost replacement
> economics that never invent a salary and never sum currencies, a two-constraint allocation lab over
> money and leader attention that funds below-band pay gaps first, Harrell C / Brier calibration,
> four post-commit rules (`RULE-RET-01..04`), `RET-01..07` signals and CSV scope #29.
> 29 formula-safe CSV scopes, schema migrations from v1, and an append-only action log.
>
> Verified this session: **664 tests across 45 suites**, including 35 retention tests — survival
> maths against published χ² quantiles, a synthetic 400-person cohort whose hazard ratios are
> recovered, ridge-shrinkage and abstention behaviour, the privacy wall, priced-vs-blocked
> interventions, the fairness tier, Harrell C and Brier, all four rules, the v28→v29 migration,
> normalisation repairs, rewind, `clearDemo`, CSV minimisation, signals, and a JSDOM + axe-core UI
> workflow over all six tabs plus the plan dialog. `npm run lint`, the canonical boundary check
> (97 app modules, 0 leaks) and the docs-link check are clean; the standalone artifact rebuilds at
> schema v29. **Not** verified: real-browser rendering, screen-reader output, or manager
> comprehension — no browser engine or assistive technology can run in this container, so those
> remain **[UNVERIFIED]**; the proportional-hazards assumption has no Schoenfeld test at these
> sample sizes, the six published priors are unverified for any given team, the 50% replacement
> convention is a convention, and no workspace has yet crossed the evidence floor to calibrate the
> ordering out of sample.
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
