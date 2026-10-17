# Leadership Intelligence Sandbox

A React + Vite + Tailwind app implementing three leadership-intelligence
modules — Shannon-entropy "Thermodynamics", a Complex Adaptive Systems (CAS)
engine, and a unified 8-category Risk Register — driven by one toggleable
**Signal Board** of 50 synthetic rule IDs. All data is synthetic and
generated in-browser; nothing describes real people.

> **Provenance, read first.** `github.com/wbweve/Leados` was inspected
> directly this session — GitHub's REST API for the full file tree, and raw
> fetches of its README, `AI-SESSION-LOG.md`, root `index.html`, `src/App.tsx`,
> `src/lib/core.ts`, `src/lib/intelligence.ts`, `src/lib/casEngine.ts`,
> `src/lib/riskIntelligence.ts`, `src/components/CasView.tsx`, and
> `src/components/ThermodynamicsView.tsx` — **before writing any code.**
>
> That repo's own README contains a "provenance ledger" narrative, written by
> an earlier session, claiming: *"Not found anywhere in the real repo, this
> session: any CAS engine, any risk register, any file named
> cas.ts/risk.ts/equivalent…"* **That claim was checked, not trusted, and
> found to be false against the repository's current `main` branch:**
> `src/lib/casEngine.ts` and `src/lib/riskIntelligence.ts` both exist, and the
> live `src/App.tsx` imports and routes to `CasView` and `RiskView`. Most
> likely explanation (unverified — no commit history was inspected): the
> README was written against an earlier commit and never updated after a
> later session added those files. Full ledger, including exactly what was
> and wasn't independently verified, is in `AI-SESSION-LOG.md` and in-app at
> **About / Provenance**.
>
> **This app does not fork, copy, or continue that repo's code or its
> session lineage.** It is a fresh build in this task's own tool environment
> (React + Vite + Tailwind, single `src/App.tsx` entry point, built with
> `npm run build`), implementing the same *functional ideas* — original code
> throughout, formulas aside (standard information theory, Shannon 1948).

## Run it

`npm install && npm run build`, then open `dist/index.html`. This project's
`vite.config.ts` includes the `vite-plugin-singlefile` plugin, which inlines
all JS/CSS into that one HTML file — **verified** by running the build and
grepping `dist/index.html` for external `src=`/`href=` references (none
found; `dist/` contains only `index.html`). Zero runtime network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-wargaming-sandbox:v1`. Use
**Reset synthetic data** (Today view) to clear it.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/today` | Overview: overall risk score, active finding count, entropy %, feedback-loop/bifurcation/attractor counts, cross-category amplifications, scenario presets, and an in-browser self-test runner. |
| `#/signals` | The **Signal Board**: 50 synthetic rule IDs across 8 categories, each toggleable with severity and optional person-link; a runway slider; scenario preset buttons; a per-rule "simulate 3x recurrence" control for testing attractor detection. |
| `#/thermodynamics` | Shannon entropy of the synthetic event log, mutual information between any two people's activity, information bottlenecks (<30% of mean event volume), and a signal-to-noise ratio. |
| `#/cas` | Feedback loops (reinforcing/balancing), bifurcation points, and attractors, computed live from the Signal Board + runway slider. |
| `#/risk` | The 8-category Risk Register (always shows all 8, even at zero) and cross-category amplification detection. |
| `#/about` | Full provenance ledger — what was checked against the real repo, what was found (including the contradiction above), and exactly what in this delivery is original, modeled, or a disclosed gap. |

## What's original, what's modeled on a verified pattern, what's a disclosed gap

- **Modeled on a verified real-repo pattern, reimplemented from scratch:**
  `src/lib/infoTheory.ts` (Shannon entropy, mutual information, SNR,
  bottlenecks). The real repo's own `infoTheory.ts` was confirmed to exist
  and be wired into a live `ThermodynamicsView.tsx`, rendering the same four
  metrics. This file's *internals* were written fresh from the standard
  textbook formulas, not copied line-by-line from the real file.
- **Built from scratch, modeled on the real repo's module boundaries (not
  its code):** `src/lib/casEngine.ts` (feedback loops, bifurcation points,
  attractors) and `src/lib/riskIntelligence.ts` (8-category register,
  cross-category amplification). The real repo's equivalents were confirmed
  to exist and be wired up, but their internal logic was not fetched or read
  for this delivery — only file names, exports used by components, and the
  import graph were checked. The rule-combination logic here is original.
- **A gap, left as a gap:** "cultural bifurcation" is not implemented. Its
  dependency, a hypothetical `scoreCulture()`, is not defined anywhere
  checked this session — inventing one would misattribute invented behavior
  to a "verified" source.
- **All UI, the 50-rule catalog, the synthetic roster/event generator, the
  self-test suite, and the storage layer:** original to this delivery.

## Project structure

```
src/
  lib/
    types.ts            — shared types (Category, Finding, AppState, ...)
    rules.ts             — 50-rule synthetic catalog, 8 categories (original)
    seed.ts               — synthetic roster + deterministic synthetic event log
    store.ts               — localStorage persistence
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

- **Fetched `github.com/wbweve/Leados` (rendered README), then independently
  re-verified every load-bearing claim in it via GitHub's REST API and raw
  file fetches, before writing any app code** — *why*: the task requires
  inspecting actual code, not trusting a fetched page's self-description,
  especially one that itself describes a chain of prior AI sessions.
- **Found and disclosed that the fetched README's central claim ("no CAS
  engine, no risk register exist in the repo") is false against the repo's
  current `main` branch** — *why disclosed prominently*: a confidently-worded
  but wrong provenance claim is more dangerous than an obviously-uncertain
  one; burying the correction would repeat the same failure mode being
  corrected.
- **Treated the repo's own `AI-SESSION-LOG.md` and `core.ts`/`intelligence.ts`
  "PROVENANCE" code comments as repo-internal claims to spot-check, not as
  settled fact** — *why*: those files are themselves prior AI output
  asserting their own verification; only claims re-confirmed by this
  session's own tool calls (listed in `AI-SESSION-LOG.md`) are presented here
  as verified.
- **Built as a React+Vite+Tailwind app with a single `src/App.tsx` entry
  point, per this task's required environment** — *why*: this tool
  environment's entry point is fixed; a hand-rolled single HTML file would
  misstate the environment. `vite-plugin-singlefile` is used so the build
  output still satisfies "open one file, zero network calls."
- **Designed an original 50-rule catalog with four named scenario presets
  (burnout loop, velocity death spiral, austerity trap, trust collapse)**
  — *why*: these are generic, well-known systems-thinking/leadership concepts
  used to give the CAS engine something concrete to detect, not IDs or names
  taken from any external, unverified spec.
- **Left "cultural bifurcation" unimplemented** — *why*: its dependency
  (`scoreCulture()`) is undefined in every source checked; inventing it would
  misattribute original work to a source that doesn't define it.
- **Used a new storage key (`leados-wargaming-sandbox:v1`)** — *why*: this
  workspace began from the default scaffold with no prior state; reusing
  another session's key would falsely imply shared history.
- **Wrote an original self-test suite (`selfTest.ts`) under its own test
  IDs (`T1`...`T10`)** — *why*: no external test-suite naming convention was
  verified anywhere, so inventing test bodies under someone else's IDs would
  imply false provenance. These tests check this build's own math only.
