# LEADOS — Feature Status

Honest status of what is actually implemented in this workspace.

> **Read this first.** The canonical, runnable product is the **zero-build static app** at
> `index.html` + `app/**` (start it with `npm run app`, open `#/today`; `npm test` runs **1038 tests
> across 64 suites**). It covers: Today triage; people and roster; 1:1s, prep sheets and feedback;
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
> **Schema v41**: **Evidence governance** (`#/models`) — the Claim & Counterfactual Registry.
> Every quantitative statement the product makes is *derived* from the records its source
> module already reads and registered with one trust grade on a single shared ladder
> (`unvalidated → refuted → provisional → backtested → validated`, only Backtested+ is
> *actionable*), its provenance (measured/estimated/assumed), the counterfactual it gives up,
> and the records it consumed. Three **declared conflict criteria** report where the records
> genuinely disagree — a fragile load-bearing assumption under an open decision, a commitment
> adopted on a refuted model, a signal from a detector that lost to persistence — and are never
> auto-resolved. A dated **challenge** with a declared likelihood ratio (0.05–20, explicitly not
> a confidence score) moves the claim's posterior by Bayes in log-odds from an append-only
> ledger, with a 50% neutral prior labelled as a convention, and fans out in one transaction
> into a DACI re-decision, an owned verification delegation and a blameless 1:1 prompt
> (`RULE-MODEL-01..04`, `MODEL-01..03` signals, CSV scope #41). Claims are never stored, so
> they cannot drift; a deterministic board brief composes the whole register.
> 41 formula-safe CSV scopes, schema migrations from v1, and an append-only action log.
>
> Verified this session: **1038 tests across 64 suites**, including the 34-test evidence-governance
> suite with hand-checked Bayes, declared conflict criteria asserted to fire *and* not fire, the
> real-store challenge cascade asserted by provenance, and a JSDOM + axe-core UI workflow over all
> five tabs plus the live challenge dialog; `npx eslint app/ tests/app/`, the canonical boundary
> check (141 app modules / 64 suites, 0 leaks) and the docs-link check (149 links) are clean; the
> standalone artifact rebuilds at schema v41.
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
