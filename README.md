# LEADOS — Federated Scenario Planning & Living Strategy

A React + Vite + Tailwind app implementing two leadership-intelligence
modules from a pasted specification — a **Federated Scenario Planning
Engine** (Part 2) and **Living Strategy Documents** (Part 3) — on top of a
minimal, original event-log / Bayesian-belief / findings substrate built
from scratch to make them real rather than mocked.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> `github.com/wbweve/Leados` was inspected this session via a direct fetch of
> its own README (which documents a prior, separate AI session's own
> file-by-file inspection of that repo). Full ledger in `AI-SESSION-LOG.md`
> and in-app at **About / Provenance**. Short version:
>
> * The real repo is a different app — information theory ("Thermodynamics"),
>   a CAS engine, and an 8-category Risk Register, driven by a 50-rule
>   "Signal Board." **Verified absent from it:** any `bayesian.ts`,
>   `wargame.ts`, `finIntel.ts`, `healthScore.ts`, `performance.ts`,
>   `scenarios.ts`, `livingDocs.ts`, or `strategy.doc` event type.
> * **This sandbox started empty** (verified: default scaffold `App.tsx`, no
>   prior session files) — there is no shared code or state with that repo.
> * The pasted "Part 2 / Part 3" brief in this task is therefore treated as
>   an **unverified external specification of desired behavior**, the same
>   convention the real repo's own prior session used for its own pasted
>   "pt-L" brief — not as proof any of its named modules exist, and not
>   copied verbatim.
> * One likely **bug in the pasted spec was found and fixed, disclosed**:
>   its scenario-axis sort claims to pick "highest uncertainty" first but its
>   comparator actually picks the *most confident* belief first. Fixed to
>   sort by ascending distance from 0.5 so axis selection matches its stated
>   intent. Details in `AI-SESSION-LOG.md`.

## Run it

`npm install && npm run build`, then open `dist/index.html`. This project's
Vite config (`vite-plugin-singlefile`, already present before this session)
inlines all JS/CSS into that one HTML file — verified by grepping the build
output for external URLs: none found beyond inert XML/SVG namespace strings
and a baked-in React docs link inside minified error text. Zero runtime
network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-federated:v1`. Use **Reset
synthetic data** (top-right, any tab) to regenerate the deterministic seed
dataset.

## Pages (tabs)

| Tab | What it does |
|---|---|
| **Overview** | Health score, runway, active findings, and the three Bayesian "uncertainty axis" beliefs the scenario engine is built from. |
| **Scenario Planning** (Part 2) | `LEADOS.scenarios` — a 2×2 matrix (`BEST_CASE` / `RISK_A` / `RISK_B` / `WORST_CASE`) built from your two highest-uncertainty beliefs. Each quadrant is **fully simulated**: synthetic future events for its adverse axes are injected into a cloned event log, then run back through the findings engine and health score, so each scenario shows its own finding count, critical-finding count, health score, and top finding — plus required actions and leading indicators to watch. |
| **Living Strategy** (Part 3) | `LEADOS.livingDocs` — strategy documents (`strategy.doc` events) whose assumptions (metric + threshold + operator) are re-tested against the live event log on every render. Each doc is marked `VALID` / `DEGRADED` / `INVALIDATED`, never silently assumed true; assumptions with no logged data show as `UNKNOWN` rather than passing by default. Includes a form to author new strategy documents. |
| **Signal Console** | Inject real events (attrition, pulse mood, deal won/lost, financial KPIs) and watch Overview, Scenario Planning, and Living Strategy all recompute live — nothing is cached per tab. |
| **About / Provenance** | Full provenance ledger: what was checked against the real repo, what was found, and the disclosed spec-bug fix. |

## What's original, what's a faithful translation of the pasted spec, what's a disclosed fix

* **Faithful TypeScript translation of the pasted spec:** `src/lib/livingDocs.ts` (Part 3) — logic matches the pasted `LEADOS.livingDocs` module 1:1, adapted only for types and wired to this build's own metric sources.
* **Translation + one disclosed correction:** `src/lib/scenarios.ts` (Part 2) — matches the pasted `LEADOS.scenarios` module's structure and behavior, except the axis-selection sort is fixed to actually pick the highest-uncertainty belief first (the pasted comparator didn't, contradicting its own comment — see `AI-SESSION-LOG.md`).
* **Built from scratch because no verified source for them was found anywhere** (not in the real repo, not pre-existing in this sandbox): `src/lib/bayesian.ts` (simplified log-odds belief scoring — disclosed as a heuristic, not a calibrated forecast), `src/lib/wargame.ts`, `src/lib/finIntel.ts`, `src/lib/performance.ts`, `src/lib/healthScore.ts`, `src/lib/engine.ts` (`project`/`run`/`_days`). These exist only because the pasted Part 2/3 spec calls them as if an earlier "Part 1" had already built them, and no such Part 1 exists anywhere verified.
* **All UI, the synthetic roster/event generator, and the Signal Console:** original to this delivery.

## Project structure

```
src/
  lib/
    types.ts            — shared types (Event, Person, AppState, Assumption, ...)
    prng.ts              — deterministic seed RNG
    seed.ts               — synthetic roster + ~9 months of synthetic events (original)
    engine.ts              — LEADOS.events.project / LEADOS.engine.run+_days (original, minimal)
    wargame.ts               — win rate / velocity / competitive landscape (original, minimal)
    finIntel.ts                — runway status (original, minimal)
    performance.ts               — team engagement (original, minimal)
    healthScore.ts                — composite org health heuristic (original)
    bayesian.ts                    — simplified log-odds belief scoring (original)
    scenarios.ts                     — PART 2: federated scenario planning
    livingDocs.ts                     — PART 3: living strategy documents
  components/
    Shell.tsx, ui.tsx                  — nav shell + shared UI primitives
    OverviewView / ScenariosView / LivingDocsView / ConsoleView / AboutView
  App.tsx                                 — tab routing + state wiring (entry point)
```

## Changelog

* **Fetched `github.com/wbweve/Leados`'s README directly and inspected this sandbox's own files before writing any code** — *why*: the task requires inspecting actual code, not trusting either the real repo's self-framing or the task prompt's pasted spec at face value.
* **Confirmed this sandbox started as an untouched default scaffold with no LEADOS history** — *why disclosed*: makes explicit that this delivery has zero shared code/state with `github.com/wbweve/Leados`, so nothing here should be read as "continuing" that repo's lineage.
* **Declared the pasted "Part 2 / Part 3" brief an unverified external specification, not repo fact** — *why*: no match for `LEADOS.bayesian`, `LEADOS.wargame`, `LEADOS.finIntel`, `LEADOS.engine`, `LEADOS.healthScore`, `LEADOS.performance`, or `strategy.doc` was found in anything fetched from the real repo.
* **Built original `bayesian.ts`, `wargame.ts`, `finIntel.ts`, `performance.ts`, `healthScore.ts`, `engine.ts` modules** — *why*: the pasted spec calls these as pre-existing dependencies; without them Part 2/3 would be non-functional mockups instead of a working app.
* **Fixed the scenario axis-selection sort in `scenarios.ts` and disclosed the fix** — *why*: the pasted comparator's own comment ("highest uncertainty first") contradicts what the comparator actually computes (most-confident first); shipping it unfixed would silently invert the feature's stated purpose.
* **Added a seeded `strategy.doc` with 5 assumptions and a synthetic event log engineered to violate some of them** — *why*: so Living Strategy shows a real `DEGRADED`/`INVALIDATED` state on first load, not an empty or trivially-passing screen.
* **Added a Signal Console tab for live event injection** — *why*: makes "strategy checks itself against reality" and "a distribution of futures" demonstrable interactively, not just a static snapshot of seed data.
* **Used a new storage key (`leados-federated:v1`)** — *why*: this sandbox began with the default scaffold and no prior state; reusing another session's key (e.g. the real repo's `leados-sandbox:v1`) would falsely imply shared history.
* **Kept `vite-plugin-singlefile`** (already present in the scaffold before this session) — *why*: preserves the "open one file, zero network calls" property without needing a hand-authored single HTML file, verified by grepping the actual build output.
