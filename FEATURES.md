# LEADOS — Feature Status

Honest status of what is actually implemented in this workspace.

## Canonical app — Session 110 (Schema v78)

- **Coupling Ledger (`#/deferral?panel=coupling`)** — reads a leader-declared pairwise correlation ρ back against the realised joint timing of the calls that declaration coupled. The Deferral Portfolio has priced a correlated joint tail on a typed ρ since Schema v69; this panel is the only place the record answers back. Estimand: among declared pairs where **both** calls carry a decision date, how often did the two resolutions land in the same 30-day calendar block — co-resolution *given that both resolved*, never co-movement of value, never a probability that either resolves. A pair with an open member is refused with its reason and never counted as a non-coincidence; a pair whose whole common window fits in one block is refused because a coincidence there is arithmetically certain. The null is a structure-preserving cyclic rotation of each call's resolution block inside its own at-risk window, so marginals survive, a call in several pairs keeps one placement across all of them, and the family is deterministic — the p-value never moves between machines. Both tails are read: with zero coincidences the upper test returns p = 1 forever, so the deficit tail is the only one that can report an over-declaration. Declared ρ is mapped to a coincidence reference through a bivariate-normal copula and printed under **both** τ = ρ and τ = 2·sin(πρ/6) conventions, with a mapping-dependent magnitude flagged and no work opened on it. Six verdicts (insufficient / unidentifiable / inconclusive / independent / coupled / hedged) and six assessments; a band below the pair floor prints **no assessment at all** — a thin band reads *unresolved*, never *independent*. Materiality `max(5 pp, 20% of the model figure)` gates every size claim; the implied ρ is advisory with an explicit `identified` flag. Frozen reviews store band aggregates, the rotation summary and member ids only, carry one prospective probability from a Laplace-smoothed commitment hazard re-based to the review's own window, and grade exactly once — a later contradicted declaration appends a challenge note and never rewrites a frozen figure. `RULE-CPL-01..03` write `calibrates-coupling` / `measures-coupling` edges, open at most one owned reconciliation task per contradicted band, at most one governed re-declaration decision per ISO week, and at most one advisory task per band per week. Five signals, a Coupling ledger insights bucket, a nav badge, route aliases, six axe-clean panels, an identity-free brief and CSV scope #68 (band aggregates only — no decision id, no band label, no title). **No person field is read anywhere**, and the module has no write path to `correlationDeclarations`: the leader declares, the record comments. Real-browser walkthrough [UNVERIFIED].
- **Measurement Reliability Terminal (`#/reliability`)** — Schema v77, ADR-0069. See the session entry below.

## Canonical app — Session 100 (Schema v71)

- **Borrowed Evidence Engine (`#/credibility`)** — partial pooling for every small sample the workspace keeps: signal families (actionable precision vs the Signal Integrity Board's floor), assumption criticality classes (settled hold rate) and delegation authority classes (on-time delivery with censoring). Beta-binomial hierarchy by full Bayes on a deterministic grid (BDA3 hyperprior); per-unit borrowed estimate, 90% interval, own weight Z, exact P(below floor), graduation dates, exact what-if and break-even counts; χ²/I² heterogeneity and SD-relative influence. `RULE-CRE-01..03` open outside-view decisions at premise registration, checkpoint tasks for late-running authority classes and re-tune tasks for thin families, govern exchangeability by written ruling, and grade every frozen borrowed claim against the unit's own record by Brier. Six panels, CSV scope #61, Insights bucket *Credibility*. No person is a unit; refused groups are never pooled. Real-browser walkthrough [UNVERIFIED].

## Canonical app — Session 97 (Schema v68)

- **Deferral Option Terminal (`#/deferral`)** — prices one open decision's American option to wait from the leader's own records: stake from typed decision value terms, commitment cost from budget lines pointed at the call (reversible calls pinned to `K = 0`), carry from the workspace's 12-week erosion price charged as a cash outflow, and σ from the robust log-scale dispersion of settled realised ÷ assessed ratios (withheld below the observation and σ floors; a declared σ is accepted only when labelled). Cox–Ross–Rubinstein lattice with an exercise boundary, flexibility premium, commit probability, expected wait, and break-even carry / break-even σ solved by bisection. Verdicts: commit now, waiting pays, indifferent, act or drop, withheld. Frozen frames carry one prospective `P(commit by deadline)` claim, graded once against the recorded decision date; `RULE-DRO-01..03` write typed links, one boundary watch, weekly expired-window decisions and blameless process tasks on the shared spine. CSV scope #58 is aggregate-only. The premium is never added to EVSI or to the cost of waiting, and the numbers are decision-analysis values on a real-world measure, not market prices.
- The sections below this point describe the **quarantined legacy `src/**` tree** and its Next.js API, not the canonical zero-build app in `index.html` + `app/**`; `LEADOS-STATE.md` is the current inventory.

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

Schema v63 adds `survivalReadings` and `survivalMarkers`: the Delivery Survival Terminal (`#/survival`) estimates how long work of a given kind actually takes from records the workspace already holds across six modules — funded portfolio work, cases, requisitions, change programmes, delegations and decisions — with no new data entry to get a first reading. Kaplan–Meier (Greenwood variance, log–log band) keeps open items in the risk set instead of dropping them; the Aalen–Johansen cumulative incidence treats abandonment as a competing risk, so the page prints both the naive "eventually completes" figure and the corrected incidence and says why they differ; Nelson–Aalen hazard by elapsed-time bucket, Mantel–Cox log-rank between two classes, conditional completion over a forward window and an age percentile (a share of past exits, explicitly not a probability) complete the read model. A reading freezes per-item probabilities, the at-risk counts they were conditioned on, the curve digest and a review date, and is graded once afterwards with Brier against the class's own base rate — a skill score, withheld below five settled items. `RULE-SURV-01..05` run on the shared spine: typed `endangers` edges plus one owned task per doomed item (recorded owner only, maximum five), one repair task when a graded reading lost to its base rate, exactly one DACI decision per class per week when abandonment reaches the declared share of exits, one task per returned delegation with no recorded reason, and one grading task per stale reading. The module asserts no person-level claim, refuses a probability below the at-risk floor, never extrapolates a median or a tail, and states its own assumptions — independence of censoring, exchangeability within a class, no Fine–Gray subdistribution model. CSV scope #53 exports 34 aggregate columns with every figure blanked below the evidence floor. Two later additions (no schema change) guard the curve's transportability: a fixed-cohort calendar-drift check on time to any exit (RULE-SURV-06), and its **competing-risk decomposition** (Session 94, ADR-0057, RULE-SURV-07), which differences each cause's day-30 Aalen–Johansen incidence between the cohorts — so a slowdown is attributed to finishing less or giving up more, a silent one-for-one substitution of abandonments for completions at unchanged speed is named instead of staying invisible, and the week's drift decision is framed as an intake review or a completion review accordingly.


Schema v64 adds `waitPrices`, `waitExposures` and `waitCostMarkers`: the Cost of Waiting Terminal (`#/wait`) prices the open queue in money. A leader declares one weekly price per class of work across the same six modules the survival terminal harvests (cap 24, fail-closed); a decision with linked committed money is priced derived (value at stake ÷ 12-week erosion window, linear CD3); anything unpriced is reported as unpriced, never zero. Each open item is multiplied by the censoring-aware still-open probability S(age+w)/S(age) from the leader's own closed records, refused below the at-risk floor and flagged past the longest observation, and wait-horizon scenarios (1/2/4/8 weeks) print probability plus expected additional cost per row. Totals are per currency and never pooled; rows are ranked priced-overdue first. Weekly exposure certificates freeze the priced queue and are navigable through SYSTEM_GENERATED `prices-delay` edges. `RULE-WAIT-01..05` run on the shared spine before decision tempo: stale-edge reconciliation, the certificate, ≤40 links, exactly one triage DACI decision per currency per week, ≤5 owned delegations and ≤3 declare-a-price tasks. Signals WAIT-01..06, CSV scope #54 (aggregate per class × currency, opaque codes, scenario figures blanked below the evidence floor). The module prices classes of work, never people, and cannot reorder or close anything itself.
