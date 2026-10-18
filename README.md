# LEADOS pt-U — Talent Architecture, Financial OS, Regulatory, Narrative & Org Physics

A React + Vite + Tailwind app implementing five leadership-intelligence modules
from the task's pasted "Part 4–8" brief: **Talent Architecture** (succession,
bench strength, capability gaps, headcount recommendations), a **Financial
Intelligence OS** (unit economics, capital allocation heuristic, scenario-weighted
MRR projection), **Regulatory Intelligence** (jurisdiction exposure scoring,
cross-jurisdiction conflict detection), **Predictive Narrative Intelligence**
(communication effectiveness, auto-generated strategy), and an **Organizational
Physics ODE system** (RK4 numerical integration of a 5-variable state vector) —
all driven by one synthetic, regenerable event log.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> `github.com/wbweve/Leados` was inspected directly this session (GitHub's Trees
> API for the full 148-file tree, raw fetches of `package.json`, `vite.config.ts`,
> root `index.html`, `src/App.tsx`, the rendered README, and the repo's own prior
> `AI-SESSION-LOG*.md`/`SESSION-3.patch.md`). Full ledger in `AI-SESSION-LOG.md`
> and in-app at **About / Provenance**. Short version:
>
> * The real repo mixes ~90 loose root-level files (several duplicated as both
>   `.js` and `.ts`/`.tsx`, e.g. `engine.js` + `engine.ts`) with a separate, live
>   `src/` Vite+React+TypeScript app.
> * **Verified directly, this session:** the live `src/App.tsx` routes to
>   `TodayView`/`SignalBoardView`/`ThermodynamicsView`/`CasView`/`RiskView`/`AboutView`
>   — matching the rendered README's own page table.
> * **Verified directly, this session:** the root `index.html` is the 352-byte
>   default Vite scaffold — **not** a large hand-authored demo, which directly
>   contradicts other sessions' logged byte counts for the same file (1,920 B /
>   54,081 B / 251,817 B / 337,974 B at different points). File state in this repo
>   is volatile between sessions; no historical claim was trusted without a fresh
>   read.
> * **Not found anywhere in the real repo, this session:** any file, export, or
>   path containing `talent`, `financial_os`, `regulatory`, `narrative`,
>   `org_ode`, `attention_opt`, `living_docs`, or `scenarios`. The task's pasted
>   "Part 4–8" brief and its "pt-U Implementation Summary" (105 files, 220 rules,
>   `T_U_1…T_U_20` tests) is therefore treated as an **unverified external
>   specification**, not repo fact — the same convention the real repo's own
>   sessions applied to their own pasted "pt-L" brief.
>
> **This app does not fork, copy, or continue any of that history.** It is a
> fresh build, implementing only the *functional ideas* in the pasted brief —
> original code throughout, with fabricated demo data clearly labeled as such.

## Run it

`npm install && npm run build`, then open `dist/index.html`. The Vite config
(`vite-plugin-singlefile`) inlines all JS/CSS into that one file — confirmed by
inspecting the build output — so it opens with zero runtime network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-ptU:v1`. Use **Regenerate synthetic
data** (Today view) to reseed it.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/today` | Overview: people/event counts, active findings (rules R208–R215, R217–R219), and an in-browser self-test runner (ST-01…ST-13). |
| `#/talent` | Succession depth map per critical role, bench-strength %, capability-gap analysis vs. headcount plans, and autonomous headcount recommendations with runway-aware financial constraints. |
| `#/financial` | Complete unit economics (LTV:CAC, payback period, Rule of 40, Quick Ratio) against labeled external benchmarks; a capital-allocation heuristic; a 12-month scenario-weighted MRR projection. |
| `#/regulatory` | Jurisdiction obligation registry with an exposure score (coverage × review × recency), and cross-jurisdiction interpretation-conflict detection. |
| `#/narrative` | Communication effectiveness by audience (alignment/confusion/resistance rates from logged reactions) and an on-demand communication-strategy generator. |
| `#/physics` | A 5-variable (Engagement/Velocity/Trust/Capacity/Momentum) organizational ODE system, integrated forward with RK4, with interactive intervention sliders and an attractor-type prediction. |
| `#/about` | Full provenance ledger — what was checked against the real repo, what was found, and exactly what in this delivery is original vs. a reused idea vs. a disclosed gap. |

## What's original, what's a reused idea, what's a disclosed gap

- **Original, this delivery:** every file in `src/lib/*.ts` and every component
  in `src/components/*.tsx`, including the synthetic roster/event generator
  (`seed.ts`), the five domain engines, the rule engine (`engine.ts`), and the
  self-test suite (`selfTest.ts`).
- **Reused idea, not code:** the event-type shapes (e.g. `talent.succession.candidate`,
  `reg.interpretation`, `narrative.outcome`) and named formulas (LTV:CAC, Rule of
  40, Quick Ratio, RK4 integration of the organizational ODE) come from the
  task's pasted brief. No source for any of it exists in the real repo, so this
  is "implemented to match a description," not "ported from verified code."
- **A gap, left as a gap:** rules R206/R207/R220 (living strategy documents) and
  R216 (simulated-annealing attention optimizer) require Parts 1–3 modules not
  pasted into this session — not implemented, not invented. `LEADOS.scenarios`
  (federated scenario planning) is replaced by a small, clearly-labeled local
  stand-in inside `financialOS.ts`.
- **A mechanical note on the brief itself:** the pasted ODE derivative formulas
  have no exact all-zero fixed point for generic states (e.g. `dC` never
  references `C`). Disclosed in `About / Provenance`; self-tests check
  directional/boundary behavior instead of asserting a false equilibrium.

## Project structure

```
src/
  lib/
    types.ts            — shared types (Person, Evt, EventType, Finding, ...)
    prng.ts              — seeded PRNG (mulberry32) for reproducible synthetic data
    seed.ts               — synthetic roster + event log across all 5 domains
    store.ts               — localStorage persistence + state mutations
    talent.ts                — succession map, capability gaps, headcount recs
    financialOS.ts             — unit economics, capital allocation, scenario projection
    regulatory.ts                — jurisdiction registry, cross-jurisdiction conflicts
    narrativeIntel.ts              — communication effectiveness + strategy generator
    orgODE.ts                        — RK4 integration of the 5-variable org state vector
    engine.ts                         — rule engine (R208–R215, R217–R219) over all domains
    selfTest.ts                       — original ST-01…ST-13 runtime self-tests
    useHashRoute.ts                    — tiny hash router
  components/
    Shell.tsx, ui.tsx                   — nav shell + shared UI primitives
    TodayView / TalentView / FinancialView / RegulatoryView / NarrativeView / PhysicsView / AboutView
  App.tsx                                 — route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's Trees API, raw
  fetches of `package.json`/`vite.config.ts`/root `index.html`/`src/App.tsx`, and
  the repo's own session logs — before writing any code. *Why:* the task
  requires inspecting actual code, not trusting a README's self-framing or the
  prompt's own pasted brief at face value.
- **Found the real repo's file-state claims are internally inconsistent across
  its own prior sessions** (four different byte counts logged for the same root
  `index.html` across different sessions) and re-verified from scratch instead of
  trusting the most recent-looking log. *Why:* half-right or stale claims are
  more dangerous than fully-wrong ones when presented with confidence.
- **Declared the pasted "Part 4–8" brief / "pt-U Implementation Summary" an
  unverified specification, not repo fact.** *Why:* no string match for its named
  files, module counts, or test IDs exists anywhere in the real repo's 148-file
  tree, checked by direct substring search.
- **Built a 5-domain, single-entry-point React+Vite+TS+Tailwind app
  (`src/App.tsx`) instead of a vanilla single HTML file.** *Why:* this task
  environment's required entry point is `src/App.tsx`, built via `npm run
  build`; the build's own `vite-plugin-singlefile` config still produces a
  single-file `dist/index.html` with zero runtime network calls, so the
  "open one file" property survives even though it's produced by a build step.
- **Implemented rules R208–R215 and R217–R219, and explicitly skipped
  R206/R207/R216/R220.** *Why:* the skipped rules depend on Parts 1–3 modules
  (living strategy docs, simulated-annealing attention optimizer) that were not
  pasted into this session — implementing them would require inventing an
  unseen spec.
- **Replaced `LEADOS.scenarios` with a small local 3-scenario stand-in inside
  `financialOS.ts`.** *Why:* same reasoning — the real federated scenario module
  wasn't pasted this session; a labeled simplification is more honest than a
  silent full reconstruction.
- **Wrote an original self-test suite (`ST-01…ST-13`) instead of reproducing the
  brief's named `T_U_1…T_U_20` tests verbatim.** *Why:* those test bodies
  couldn't be verified anywhere and mostly require unpasted modules; inventing
  test bodies under their exact names would imply false provenance.
- **Disclosed that the pasted ODE formulas admit no exact zero-derivative fixed
  point for generic states**, and wrote self-tests that check directional and
  boundary behavior instead. *Why:* asserting the brief's implied equilibrium
  property without checking it first would repeat the exact mistake this task
  asks to avoid.
- **Used a new storage key (`leados-ptU:v1`).** *Why:* this workspace began from
  the default Vite scaffold with no prior state; claiming continuity with any
  other session's key would assert a shared history that doesn't exist here.
