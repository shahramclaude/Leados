# LEADOS — Feature Status

Honest status of what is actually implemented in this workspace.

> **Read this first.** The canonical, runnable product is the **zero-build static app** at
> `index.html` + `app/**` (start it with `npm run app`, open `#/today`; `npm test` runs **1,623 tests
> across 91 test files**). It covers: Today triage; people and roster; 1:1s, prep sheets and feedback;
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
> Timing Terminal** (`#/tempo`) — per-decision cost of
> delay with Reinertsen's four delay profiles, closed-form preposterior EVSI for the option to
> wait, an optimal decision date with a switch probability, value at stake derived from typed
> graph links with currencies never summed, measured decision latency with a split-conformal
> class band (counts-only below n=5), five post-commit rules (`RULE-DLY-01..05`) that settle,
> escalate, propose, refresh and govern but never arm a timebox, `DLY-01..06` signals, a
> deterministic board brief and a data-minimised CSV scope #28; and, newest in **Schema v38**, the **Structural Capital Allocation** terminal (`#/capital`) —
> a fixed effort-week budget allocated across six structural levers by marginal return with
> budget feasibility, exact Shapley attribution over every coalition of the funded levers, a
> substitute/complement pair table, seeded Savage minimax regret against the named playbooks and
> doing nothing, and a trust ladder (`unvalidated → refuted → provisional → backtested → validated`)
> that only calls a recommendation *actionable* after out-of-sample validation; RULE-SCA-01..04
> propagate a priced DACI commitment decision, an owned checkpoint delegation, typed scoring lineage
> and a re-baselining decision, with `SCA-01..05` signals and CSV scope #39.
> 39 formula-safe CSV scopes, schema migrations from v1, and an append-only action log.
>
> Verified this session: **1,580 tests across 90 test files, 0 failing**, including the 39-test capital suite with a
> JSDOM + axe-core UI workflow over all four tabs and the adopt-from-terminal path; `npx eslint
> app/ tests/app/`, the canonical boundary check (222 app modules / 90 suites, 0 leaks) and the
> docs-link check are clean; the standalone artifact rebuilds at schema v38 (2,741,516 bytes).
> **Not** verified: real-browser rendering, screen-reader output, or manager comprehension — no
> browser engine or assistive technology can run in this container, so those remain
> **[UNVERIFIED]**; capital effort costs are declared conventions, the objective weights are a
> leader-declared value function, and lognormal parameter stress is not a calibrated posterior.
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

Schema v63 adds `survivalReadings` and `survivalMarkers`: the Delivery Survival Terminal (`#/survival`) estimates how long work of a given kind actually takes from records the workspace already holds across six modules — funded portfolio work, cases, requisitions, change programmes, delegations and decisions — with no new data entry to get a first reading. Kaplan–Meier (Greenwood variance, log–log band) keeps open items in the risk set instead of dropping them; the Aalen–Johansen cumulative incidence treats abandonment as a competing risk, so the page prints both the naive "eventually completes" figure and the corrected incidence and says why they differ; Nelson–Aalen hazard by elapsed-time bucket, Mantel–Cox log-rank between two classes, conditional completion over a forward window and an age percentile (a share of past exits, explicitly not a probability) complete the read model. A reading freezes per-item probabilities, the at-risk counts they were conditioned on, the curve digest and a review date, and is graded once afterwards with Brier against the class's own base rate — a skill score, withheld below five settled items. `RULE-SURV-01..05` run on the shared spine: typed `endangers` edges plus one owned task per doomed item (recorded owner only, maximum five), one repair task when a graded reading lost to its base rate, exactly one DACI decision per class per week when abandonment reaches the declared share of exits, one task per returned delegation with no recorded reason, and one grading task per stale reading. The module asserts no person-level claim, refuses a probability below the at-risk floor, never extrapolates a median or a tail, and states its own assumptions — independence of censoring, exchangeability within a class, no Fine–Gray subdistribution model. CSV scope #53 exports 22 aggregate columns with every figure blanked below the evidence floor.


Schema v64 adds `waitPrices`, `waitExposures` and `waitCostMarkers`: the Cost of Waiting Terminal (`#/wait`) prices the open queue in money. A leader declares one weekly price per class of work across the same six modules the survival terminal harvests (cap 24, fail-closed); a decision with linked committed money is priced derived (value at stake ÷ 12-week erosion window, linear CD3); anything unpriced is reported as unpriced, never zero. Each open item is multiplied by the censoring-aware still-open probability S(age+w)/S(age) from the leader's own closed records, refused below the at-risk floor and flagged past the longest observation, and wait-horizon scenarios (1/2/4/8 weeks) print probability plus expected additional cost per row. Totals are per currency and never pooled; rows are ranked priced-overdue first. Weekly exposure certificates freeze the priced queue and are navigable through SYSTEM_GENERATED `prices-delay` edges. `RULE-WAIT-01..05` run on the shared spine before decision tempo: stale-edge reconciliation, the certificate, ≤40 links, exactly one triage DACI decision per currency per week, ≤5 owned delegations and ≤3 declare-a-price tasks. Signals WAIT-01..06, CSV scope #54 (aggregate per class × currency, opaque codes, scenario figures blanked below the evidence floor). The module prices classes of work, never people, and cannot reorder or close anything itself.
