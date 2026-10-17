# LEADOS — Sandbox Build: Thermodynamics, CAS Engine, Risk Intelligence

A React + Vite + Tailwind app implementing three leadership-intelligence
modules — information theory ("Thermodynamics"), a Complex Adaptive Systems
engine, and a unified 8-category Risk Register — driven by one toggleable
"Signal Board" of 50 synthetic rule IDs.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any prior "pt-K"/"pt-L" session:** `github.com/wbweve/Leados` was
> inspected directly this session (file tree via GitHub's REST API, the
> repo's own `AI-SESSION-LOG.md`, its root `index.html`, and several live
> `src/` files fetched and read in full). Full ledger in `AI-SESSION-LOG.md`
> and in-app at **About / Provenance**. Short version:
>
> - The real repo is **two different deliveries in one place**: loose
>   root-level files (including a single-file `index.html` demo) plus a
>   separate, live Vite+React+TypeScript app under `src/`.
> - **Verified live in the real repo:** `src/lib/infoTheory.ts` exists and is
>   genuinely wired into a `Thermodynamics.tsx` component rendered from
>   `IntelligenceView.tsx`, which is rendered from the live `src/App.tsx`.
> - **Verified orphaned/broken in the real repo:** `src/lib/core.ts`,
>   `intelligence.ts`, `physics.ts` exist but are not imported by the live
>   app; `intelligence.ts` imports `{ engine, run }` from `./core`, which
>   `core.ts` does not export.
> - **Not found anywhere in the real repo, this session:** any CAS engine,
>   any risk register, any file named `cas.ts`/`risk.ts`/equivalent, or the
>   "58/62-file", "144-rule", "T_L_\*/G_L_\*" test-suite history described in
>   this task's pasted "pt-L implementation summary." That summary is
>   therefore treated here as an **unverified external spec**, not as repo
>   fact — the same convention the real repo's own prior sessions already
>   established for their own pasted briefs.
>
> **This app does not fork, copy, or continue any of that unverified
> history.** It is a fresh build, in this task's own tool environment
> (React + Vite + Tailwind, single `src/App.tsx` entry point, built with
> `npm run build`), implementing only the *functional ideas* in the pasted
> brief — original code throughout.

## Run it

`npm install && npm run build`, then open `dist/index.html`. This project's
Vite config inlines all JS/CSS into that one HTML file (verified by grepping
the build output for external URLs — none found beyond inert XML/SVG
namespace strings and a baked-in React docs link in minified error text), so
the same "open one file, zero network calls" property the pasted brief
described is genuinely true here — just produced by a build step instead of
being hand-authored.

For development: `npm run dev`.

State lives in `localStorage` under `leados-sandbox:v1`. Use **Reset
synthetic data** (Today view) to clear it.

## Pages (hash routes)

| Route              | What it does |
|--------------------|--------------|
| `#/today`          | Overview: overall risk score, active finding count, entropy %, CAS signal counts, cross-category amplifications, scenario presets, and an in-browser self-test runner. |
| `#/signals`        | The **Signal Board**: 50 synthetic rule IDs across 8 categories, each toggleable with severity and optional person-link; a runway slider; scenario preset buttons; a per-rule "simulate 3x recurrence" control for testing attractor detection. |
| `#/thermodynamics` | Shannon entropy of the synthetic event log, mutual information between any two people's activity, information bottlenecks (<30% of mean "information in"), and signal-to-noise ratio. |
| `#/cas`            | Feedback loops (reinforcing/balancing), bifurcation points, and attractors, computed live from the Signal Board + runway slider. |
| `#/risk`           | The 8-category Risk Register (always shows all 8, even at zero) and cross-category amplification detection. |
| `#/about`          | Full provenance ledger — what was checked against the real repo, what was found, and how this delivery compares to the pasted "pt-L" brief. |

## What's original, what's modeled on a verified pattern, what's a disclosed gap

- **Modeled on a verified real-repo pattern, reimplemented from scratch:**
  `src/lib/infoTheory.ts` (Shannon entropy, mutual information, SNR,
  bottlenecks). The real repo's own `infoTheory.ts`/`Thermodynamics.tsx`
  pair was confirmed to exist and render these same four metrics; this
  file's *internals* were not copied (not read line-by-line against the
  real file), only the metric set and the standard textbook formulas
  (Shannon, 1948) they're named after.
- **Built from scratch because no verified source for them was found
  anywhere:** `src/lib/casEngine.ts` (feedback loops, bifurcation points,
  attractors) and `src/lib/riskIntelligence.ts` (8-category register,
  cross-category amplification). These satisfy the *described behavior* in
  the task's pasted brief (e.g. "R7+R4 same person → burnout loop"), not any
  verified prior implementation.
- **A gap, left as a gap:** "cultural bifurcation" is not implemented. Its
  dependency, `scoreCulture()`, is never defined in the pasted brief and was
  not found in the real repo either — inventing one here would misattribute
  original work to that brief, the same reasoning the real repo's own prior
  sessions used for their undefined dependencies.
- **All UI, the 50-rule catalog, the synthetic roster/event generator, and
  the self-test suite:** original to this delivery.

## Project structure

```
src/
  lib/
    types.ts            — shared types (Category, Finding, AppState, ...)
    rules.ts             — 50-rule synthetic catalog, 8 categories (original)
    seed.ts               — synthetic roster + deterministic synthetic event log
    store.ts               — localStorage persistence + state mutations
    engine.ts                — Signal Board -> Finding[] (disclosed-fabricated)
    infoTheory.ts              — Shannon entropy / mutual info / SNR / bottlenecks
    casEngine.ts                 — feedback loops / bifurcations / attractors
    riskIntelligence.ts            — 8-category register + cross-risk amplification
    selfTest.ts                      — original runtime self-tests
    useHashRoute.ts                   — tiny hash router
  components/
    Shell.tsx, ui.tsx                  — nav shell + shared UI primitives
    TodayView / SignalBoardView / ThermodynamicsView / CasView / RiskView / AboutView
  App.tsx                                 — route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first, via GitHub's REST API and
  direct raw-file fetches of `src/App.tsx`, `IntelligenceView.tsx`,
  `Thermodynamics.tsx`, `engine.ts`, `core.ts`, `intelligence.ts`, and the
  root `index.html`, before writing any code** — *why*: the task requires
  inspecting actual code, not trusting a README's self-framing or the task
  prompt's own pasted "pt-L summary" at face value.
- **Found that the real repo's info-theory layer is real and live, but its
  CAS/risk-register layer and the pasted brief's "58/62-file" history are
  not** — *why disclosed this way*: half-right claims are more dangerous
  than fully-wrong ones; the README and in-app About page spell out exactly
  which half is which.
- **Declared the pasted "pt-L" brief an unverified specification, not repo
  fact** — *why*: no string match for its named modules, file counts, or
  test IDs was found in anything fetched this session, and the real repo's
  own root `index.html` independently shows that "pt-L" has already been
  flagged as an unverified pasted-prompt narrative by an earlier session in
  this same lineage.
- **Built as a React+Vite+Tailwind app (this task's required stack) instead
  of a hand-authored single HTML file** — *why*: this tool environment's
  entry point is `src/App.tsx`; presenting a hand-rolled single-file demo
  here would misstate the environment. The build happens to inline
  everything into one `dist/index.html` with zero runtime network calls
  anyway (verified by grepping the build output), so the end-user property
  the pasted brief cared about ("open index.html") still holds.
- **Reused specific rule IDs from the pasted brief (R1, R4, R7, R17, R73,
  R88) inside an otherwise-original 50-rule catalog** — *why*: lets the
  brief's own named scenarios (burnout loop, velocity death spiral,
  austerity trap, trust collapse) be explored directly, without claiming
  those IDs came from a real rule engine.
- **Left "cultural bifurcation" unimplemented** — *why*: its dependency
  (`scoreCulture()`) is undefined in every source checked; inventing it
  would misattribute original work to an external spec.
- **Wrote an original self-test suite (`selfTest.ts`) instead of trying to
  reproduce the pasted brief's named `T_L_*`/`G_L_*` tests verbatim** —
  *why*: that test suite's existence/content could not be verified anywhere;
  presenting invented test bodies under its exact names would imply a false
  provenance. The self-tests here check this build's own math instead, under
  clearly original IDs.
- **Used a new storage key (`leados-sandbox:v1`)** — *why*: this workspace
  began with the default scaffold `App.tsx` and no prior state; claiming
  continuity with any other session's key would assert a shared history
  that doesn't exist here.
