# LeadOS Lite — Circadian, Fatigue & Monte Carlo Decision Support

A small React + Vite + Tailwind app that logs leadership decisions and runs
a reproducible Monte Carlo simulation over them, while surfacing a few
disclosed, labeled heuristics about *when* and *in what state* those
decisions are being made (time-of-day capacity, session decision fatigue,
a simple behavioral "plans vs. directs" ratio).

> **Provenance note — read before trusting any claim about
> `github.com/wbweve/Leados`:** this build does **not** copy, fork, or
> continue that repository's code. This session fetched that repo directly
> (GitHub REST Contents + Trees + repo-metadata APIs) and found its root
> contains at least two incompatible project shapes side by side — a
> standalone 66,718‑byte `index.html` (vanilla JS/Tailwind‑CDN, matching its
> own README's description) *and* a separate, full Vite+React+TypeScript
> project, *and* ~45 loose duplicate-named files at the repo root — with no
> `js/circadian.js`, `js/fatigue.js`, `js/genome.js`, `js/monte_carlo.js`,
> `js/workers.js`, etc. (the module list given in this task's prompt)
> anywhere in it. None of that module list was found to exist there, so it
> is treated here as an **unverified specification**, not real code, and
> nothing in this app is presented as a port of it. Full ledger in
> [`AI-SESSION-LOG.md`](./AI-SESSION-LOG.md) and in-app at **About /
> Provenance**.

## Run it

```
npm install
npm run dev       # local dev server
npm run build     # production build → dist/index.html (single file, inlined JS/CSS)
npm run preview   # preview the production build
```

This project's `vite.config.ts` uses `vite-plugin-singlefile`, so
`npm run build` emits exactly one self-contained `dist/index.html` — the
closest honest parallel this React/Vite-constrained environment can offer
to the "it's just an index.html" idea in the pasted brief. A build step is
still required; this is disclosed, not hidden.

All data lives in **this browser's `localStorage`** under
`leados-lite:events`. There are no network calls, accounts, or servers.

## Views

| Route (sidebar tab) | What it does |
|---|---|
| **Today** | Current circadian-phase readout, event counters, quick "plan vs. direct" behavioral tagging. |
| **Decisions (Monte Carlo)** | Build a decision with weighted scenarios; run a seeded Monte Carlo simulation (mean/median/P10/P90/P(positive)/histogram) via a real Web Worker, with a button to simulate worker failure and prove the main-thread fallback works. |
| **Energy & Fatigue** | Session decision-fatigue meter (resets each session), per-decision-type fatigue weights, a fatigue-adjusted-confidence slider demo, circadian phase detail, and real haptic/audio feedback buttons. |
| **Memory & Genome** | Short-term (this session) vs. long-term (all localStorage) event counts, an hour-of-day activity histogram, and the "organizational genome" plans/directs ratio label. |
| **Accessibility** | Live `matchMedia` signal detection (reduced motion / dark mode / high contrast), manual screen-reader self-report, dyslexia-friendly and cognitive-reduction toggles, an `aria-live` announcer demo, and a focus-trapped modal demo. |
| **Event Log** | Raw JSON event log, export, and wipe. |
| **About / Provenance** | The verified / contradicted / original ledger for this task, condensed from `AI-SESSION-LOG.md`. |

## What's real vs. heuristic vs. disclosed-as-a-gap

- **Real, working code:** the event log, the seeded Monte Carlo engine, the
  real Web Worker + timeout fallback (toggleable live in the UI), the
  `matchMedia`-based accessibility detection, the focus trap, the
  `navigator.vibrate()` / Web Audio feedback (feature-detected).
- **Heuristic, labeled as such everywhere it appears:** the circadian
  "analytical capacity" / "working memory" percentages, the session fatigue
  score and its per-decision-type weights, the fatigue-adjusted-confidence
  decay, and the "organizational genome" plans/directs ratio. None of these
  are validated instruments, personalized models, or diagnoses.
- **Explicitly not implemented:** a 144-rule findings engine, a "search /
  correlate / synthesis" engine, and anything from the pasted pt-K module
  list that could not be found in the real `wbweve/Leados` repository.
  Building fake versions of those to match a number in a prompt would be
  fabrication, so they are omitted rather than invented.

## Project structure

```
src/
  App.tsx                     — routing + state + event wiring
  components/
    Shell.tsx, Card.tsx       — layout primitives
    TodayView.tsx
    DecisionsView.tsx         — Monte Carlo UI
    EnergyView.tsx            — circadian + fatigue + sensory
    MemoryGenomeView.tsx
    AccessibilityView.tsx
    LogView.tsx
    AboutView.tsx             — provenance ledger
  lib/
    types.ts, storage.ts
    circadian.ts, fatigue.ts, sensory.ts
    memory.ts, genome.ts
    monteCarlo.ts, workers.ts
    a11y.ts
```

## Changelog

- **Investigated the real `wbweve/Leados` repo via GitHub's REST API before
  writing any code** — *why*: the task required inspecting actual code, not
  assuming it from the prompt's description.
- **Disclosed the repo's internal structural contradiction instead of
  picking a "winning" version of it** — *why*: the tree genuinely contains
  multiple incompatible project shapes; declaring one authoritative without
  diffing every commit would overstate what was confirmed.
- **Did not treat the prompt's pt-K module list as verified** — *why*: a
  direct search of the fetched repository tree found none of those files.
- **Implemented the app in React/Vite/TypeScript against `src/App.tsx`**
  — *why*: that is this task's fixed execution environment and cannot be
  swapped for a hand-written single HTML file.
- **Kept the existing `vite-plugin-singlefile` setup** — *why*: it is the
  one honest way to approximate "it's just an `index.html`" inside this
  environment's constraints.
- **Used a seeded PRNG (`mulberry32`) for Monte Carlo** — *why*:
  reproducibility (same seed ⇒ same result) was an explicit requirement.
- **Built the worker from an in-memory Blob instead of a separate file** —
  *why*: this reuses the same disclosed technique from wbweve/Leados's own
  README for the same underlying reason (a single-file build target), not
  because any worker source was found to copy.
- **Labeled every biological/behavioral claim as heuristic/non-diagnostic
  directly in the UI** — *why*: matches the standard the pasted brief itself
  asks for ("every heuristic labeled as a heuristic").
