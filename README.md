# LEADOS — Organizational Intelligence Platform (pt-O / pt-P delivery)

A React + Vite + Tailwind app implementing ten leadership-intelligence modules
— life-stage maturity profiling, compound-intelligence effect detection,
strategic wargaming, organizational design simulation, stakeholder
intelligence with game theory, Black-Scholes real options valuation,
executive presence measurement, three-horizons innovation portfolio
management, ADKAR+Kotter change management, and a competitive intelligence
aggregator — unified behind one "Today" dashboard and a compound-intelligence
cross-module detector.

> **Provenance — read before assuming this continues any prior "pt-" session:**
> `github.com/wbweve/Leados` was inspected directly this session (full
> recursive file tree via GitHub's REST API — 148 entries, confirmed not
> truncated — plus the repo's own raw `AI-SESSION-LOG.md`, root `index.html`,
> `package.json`, and `src/App.tsx`). Full ledger in `AI-SESSION-LOG.md` and
> in-app at **About / Provenance**. Short version:
>
> * The real repo's root `index.html` is a **352-byte Vite dev stub**
>   (`<div id="root">` + a script tag to `/src/main.tsx`), not a hand-authored
>   single-file app — verified by direct fetch, not assumed from a README.
> * The real repo's live `src/` app (confirmed: `App.tsx` → `TodayView` /
>   `SignalBoardView` / `ThermodynamicsView` / `CasView` / `RiskView` /
>   `AboutView`) already has a working Shannon-entropy/CAS/risk-register layer
>   from a prior session — consistent with that prior session's own
>   `AI-SESSION-LOG.md`.
> * **Not found anywhere in the repo, this session:** any `js/` directory, or
>   any file named `life_stage.js`, `compound_intel.js`, `wargame.js`,
>   `org_design.js`, `stakeholders.js`, `real_options.js`,
>   `executive_presence.js`, `innovation_portfolio.js`,
>   `change_management.js`, or `competitive_intel.js`.
>
> **This app does not fork, copy, or continue any of that unverified
> history.** The task's pasted "pt-O"/"pt-P" module list is treated as an
> **unverified external specification**, exactly the way the real repo's own
> prior sessions already treated an earlier pasted "pt-L" brief (see the
> repo's own `AI-SESSION-LOG.md`, which cites "pt-K"/"pt-L" the same way).
> What follows is a fresh build, in this task's own tool environment, that
> implements the *functional ideas* named in the brief as original code.

## Run it

`npm install && npm run build`, then open `dist/index.html`. This project's
Vite config (`vite-plugin-singlefile`) inlines all JS/CSS into that one HTML
file — verified this session by grepping the build output for any
`http`-prefixed `<script src>`/`<link href>`: none found. So "open one file,
zero network calls" is genuinely true here, the same way it's true of the
real repo's current `src/`-based build.

For development: `npm run dev`.

State lives in `localStorage` under `leados-oip:v1`. Use **Reset synthetic
data** (left sidebar) to clear it.

## Pages (hash routes)

| Route | Part | What it does |
|---|---|---|
| `#/today` | — | Composite index across all 9 scored dimensions, compound/fragility pair counts, and an in-browser self-test runner (OIP_01..OIP_13). |
| `#/compound` | **pt-P** | `compound_intel` — every pairwise interaction between the platform's 9 intelligence signals, flagged compounding / fragility / neutral. |
| `#/lifestage` | **pt-P** | `life_stage` — 12-dimension maturity radar, editable sliders, stage classification (Seed→Mature), weakest-link / strongest-asset lists. |
| `#/wargame` | pt-O | `wargame` — 4-posture payoff matrix vs. 4 competitor archetypes, 5-round volatility-shocked simulation, recommended posture. |
| `#/orgdesign` | pt-O | `org_design` — headcount/layers/span inputs, Graicunas (1933) relationship count, coordination cost, decision latency, efficiency score. |
| `#/stakeholders` | pt-O | `stakeholders` — Mendelow power/interest grid, per-stakeholder 2×2 cooperate/compete game with live Nash-equilibrium check. |
| `#/realoptions` | pt-O | `real_options` — real Black-Scholes (1973) call valuation applied to a strategic investment, with exercise/hold/expire recommendation. |
| `#/execpresence` | pt-O | `executive_presence` — Gravitas/Communication/Appearance composite (Hewlett/CTI-style weighting), radar + band classification. |
| `#/innovation` | pt-O | `innovation_portfolio` — Three Horizons (McKinsey) allocation vs. a 70/20/10 reference band, blended ROI, initiative catalog. |
| `#/change` | pt-O | `change_management` — ADKAR sliders, barrier-point detection (lowest dimension gates the change), mapped Kotter 8-step stage. |
| `#/competitive` | pt-O | `competitive_intel` — synthetic competitor roster ranked by threat score, trend (rising/stable/cooling), aggregate market heat. |
| `#/about` | — | Full provenance ledger — what was checked against the real repo, what was found, and how this delivery compares to the pasted "pt-O"/"pt-P" brief. |

## What's real theory, what's an original heuristic, what's a disclosed gap

* **Real, citable frameworks used as-is, with original application code:**
  Black-Scholes option pricing (Black & Scholes, 1973) in `realOptions.ts`;
  Graicunas' span-of-control relationship formula (1933) in `orgDesign.ts`;
  the power/interest stakeholder grid (Mendelow, 1981) in `stakeholders.ts`;
  ADKAR (Hiatt) and Kotter's 8-Step Process (1996) in `changeManagement.ts`;
  the Three Horizons framework (Baghai, Coley & White, 2000) in
  `innovationPortfolio.ts`; the Gravitas/Communication/Appearance structure
  (Hewlett / Center for Talent Innovation) in `executivePresence.ts`.
* **Original, disclosed-fabricated heuristics (not claimed as validated
  science):** the 12 Life Stage dimensions and stage thresholds; the
  compound/fragility detection thresholds (≥68 "strong", ≤35 "weak"); the
  Wargame payoff matrix; Org Design's coordination-cost/decision-latency
  formulas; the stakeholder game's payoff numbers; the ADKAR→Kotter mapping;
  Competitive Intel's threat-score weighting.
* **A gap, left as a gap:** no attempt was made to reconcile this app's nine
  intelligence signals with the real repo's own CAS/risk-register layer
  (`casEngine.ts`/`riskIntelligence.ts`) — they are different sessions' work
  in different sandboxes with no shared state, and merging them would imply a
  continuity that doesn't exist.
* **All UI, the synthetic roster/competitor/initiative data, and the
  self-test suite:** original to this delivery.

## Project structure

```
src/
  lib/
    types.ts                 — shared types (AppState, Stakeholder, Initiative, ...)
    prng.ts                  — seeded PRNG + numeric helpers
    seed.ts                  — synthetic org/stakeholder/competitor/initiative defaults
    store.ts                 — localStorage persistence
    useHashRoute.ts           — tiny hash router
    lifeStage.ts              — pt-P: 12-dimension maturity profiling
    compoundIntel.ts           — pt-P: compound intelligence effect detection
    wargame.ts                 — pt-O: strategic wargaming engine
    orgDesign.ts                — pt-O: organizational design simulation
    stakeholders.ts              — pt-O: stakeholder intelligence + game theory
    realOptions.ts                — pt-O: Black-Scholes real options valuation
    executivePresence.ts           — pt-O: executive presence measurement
    innovationPortfolio.ts          — pt-O: three-horizons innovation management
    changeManagement.ts              — pt-O: ADKAR + Kotter frameworks
    competitiveIntel.ts               — pt-O: competitive intelligence aggregator
    selfTest.ts                        — original runtime self-tests (OIP_01..OIP_13)
  components/
    Shell.tsx, ui.tsx                  — nav shell + shared UI primitives (Card, Slider, RadarChart, ...)
    TodayView / CompoundIntelView / LifeStageView / WargameView / OrgDesignView /
    StakeholdersView / RealOptionsView / ExecutivePresenceView /
    InnovationPortfolioView / ChangeManagementView / CompetitiveIntelView / AboutView
  App.tsx                                 — route composition (entry point)
```

## Changelog

**Part pt-P**
* **Inspected `github.com/wbweve/Leados` first** — via GitHub's REST tree API (confirmed complete, 148 entries, `truncated: false`) and raw fetches of `AI-SESSION-LOG.md`, `README.md`, `index.html`, `package.json`, `src/App.tsx` — before writing any code. *Why*: the task requires inspecting actual code, not trusting a README's self-framing or the task prompt's own pasted module list at face value.
* **Found the real root `index.html` is a 352-byte Vite stub, not a feature-complete single-file app** — *why disclosed*: a prior session's log described a 54KB hand-authored `index.html`; this session's direct fetch shows that file has since been replaced by the Vite scaffold entry point. Stating the current byte count avoids silently inheriting a stale claim.
* **Declared the pasted "pt-P" (and "pt-O") module list an unverified specification, not repo fact** — *why*: no string match for `life_stage`, `compound_intel`, or a `js/` directory was found anywhere in the tree or in the fetched files. This mirrors how the real repo's own `AI-SESSION-LOG.md` already treats an earlier pasted "pt-L" brief.
* **Implemented `life_stage` as `src/lib/lifeStage.ts` (TypeScript) rather than `js/life_stage.js`** — *why*: this sandbox's required stack (React+Vite+TS, confirmed identical to the real repo's own `package.json`/`vite.config.ts`) has no vanilla-JS runtime path; naming it `.ts` under `src/lib/` instead of silently claiming a `.js` file would misrepresent the environment.
* **Invented 12 original maturity dimensions rather than citing a named external 12-dimension framework** — *why*: no such framework was specified in the brief or found in the repo; presenting invented dimension names under a borrowed framework's authority would be a false citation.
* **Built `compound_intel` as a disclosed threshold heuristic (≥68 "strong", ≤35 "weak") instead of a statistical correlation/interaction-term model** — *why*: a real correlation measure needs a time series of repeated observations, which a single-snapshot synthetic dataset doesn't have; a transparent, documented threshold rule was chosen over implying unearned statistical rigor.

**Part pt-O**
* **Reused two verifiable, citable frameworks as-is (Black-Scholes for `real_options`, Graicunas for `org_design`)** — *why*: where real, textbook-standard math exists for the named module, using it (with original application code) is stronger and more honest than inventing a parallel heuristic from scratch.
* **Left the `casEngine.ts`/`riskIntelligence.ts` modules from the real repo's prior session untouched/unreferenced** — *why*: they live in a different repository and session with no accessible state from this sandbox; merging them here would fabricate a continuity that doesn't exist.
* **Added a "pt-O"/"pt-P" grouping label in the sidebar** — *why*: purely for traceability back to the task's own pasted spec sections, not a claim that those labels exist in the real repo (the About page states this explicitly).
* **Wrote an original self-test suite (`OIP_01`..`OIP_13`) instead of any externally-named test IDs** — *why*: no `T_L_*`/`G_L_*`-style test suite for these ten modules was specified or found; inventing test bodies under borrowed names would misstate their provenance.
* **Used a new storage key (`leados-oip:v1`)** — *why*: this sandbox began from the default scaffold `App.tsx` with no prior state; a new key avoids implying continuity with any other session.
