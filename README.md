# Leados Sandbox — single-file build (Thermodynamics, CAS Engine, Risk Intelligence)

A single, hand-authored `index.html` (vanilla JS + Tailwind CDN, no build step)
implementing three leadership-intelligence modules — Shannon-entropy-based
"Thermodynamics", a small Complex Adaptive Systems (CAS) engine, and an
8-category Risk Register — driven by one toggleable 50-rule "Signal Board".

> **Provenance — read before assuming this is a copy of `github.com/wbweve/Leados`:**
> that repo was inspected directly this session (GitHub REST API directory
> listings, `git/trees`, and raw-file fetches of its `README.md`,
> `AI-SESSION-LOG.md`, root `index.html`, `src/App.tsx`, `src/lib/infoTheory.ts`,
> and a `src/lib` directory listing). Full ledger: `AI-SESSION-LOG.md` and the
> in-app **About / Provenance** page. Short version:
>
> - The real repo is a **React + Vite + TypeScript** app (`src/App.tsx` →
>   `src/components/*` → `src/lib/*`), plus ~40 unrelated loose `.tsx`/`.md`
>   files sitting at the repo root. It is **not** a single hand-authored HTML
>   file — this tool environment is (no `npm`/build step available here), so
>   nothing here is "the same file," only the same functional ideas,
>   re-implemented from scratch.
> - **Verified directly:** `src/lib/infoTheory.ts` is real and implements
>   Shannon entropy / mutual information / SNR / a 30%-of-mean bottleneck
>   rule, wired into the live `src/App.tsx` route tree.
> - **Verified directly:** `src/lib/casEngine.ts` (6,628 bytes) exists in
>   `src/lib` alongside 20+ other files (`core.ts`, `engine.ts`,
>   `intelligence.ts`, `physics.ts`, `monteCarlo.ts`, `health.ts`, …).
> - **Found and disclosed, not resolved:** the repo's own `AI-SESSION-LOG.md`
>   claims a prior session's `curl` of the root `index.html` returned 54,081
>   bytes containing `identifyAttractors()`, ~61 rule IDs, and the string
>   `pt-L`. Fetching that same file directly **this session** returns **352
>   bytes** — a stock Vite `<div id="root">` scaffold with none of that
>   content. That is a direct contradiction inside the real repo's own
>   documentation. It was not chased through full commit history (out of
>   scope/budget here); it is reported as an **open, verified discrepancy**,
>   not quietly repeated as fact. See the in-app About page for the full
>   writeup.
> - This conversation was **never given** the external "pt-L implementation
>   summary" that the real repo's README references. Nothing here claims to
>   implement that brief's specific named scenarios/IDs — only the general,
>   common leadership-risk *concepts* it would plausibly describe (burnout,
>   austerity, trust erosion), built independently under this file's own
>   rule IDs.

**This app does not fork, copy, or continue `github.com/wbweve/Leados`.** It
is a fresh, original single-file build, written for this tool environment
(static HTML/CSS/JS only — Tailwind via CDN, no React, no build step).

## Run it

Open `index.html` in any browser. No install, no server, no network calls
after the one-time Tailwind CDN `<script>` load. State lives in
`localStorage` under `leados-singlefile:v1`. Use **Reset synthetic data**
(Today view) to clear it.

## Pages (hash routes)

| Route              | What it does |
|--------------------|--------------|
| `#/today`          | Overview: overall risk score, active finding count, entropy %, CAS signal count, cross-category amplifications, scenario presets, and an in-browser self-test runner. |
| `#/signals`        | The **Signal Board**: 50 synthetic rule IDs (R1–R50) across 8 categories, each toggleable with severity and optional person-link; a runway slider; a per-rule "×3 recurrence" button for testing attractor detection. |
| `#/thermodynamics` | Shannon entropy of the synthetic event log, mutual information between any two people's weekly activity, an information-bottleneck list (<30% of mean inbound events), and signal-to-noise ratio. |
| `#/cas`            | Feedback loops (reinforcing/balancing), bifurcation points, and attractors, computed live from the Signal Board + runway slider. |
| `#/risk`           | The 8-category Risk Register (always shows all 8, even at zero) and cross-category amplification detection. |
| `#/about`          | Full provenance write-up — what was checked against the real repo, what was found, the index.html byte-count contradiction, and exactly what's original vs. disclosed-gap here. |

## What's original, what's a disclosed gap

- **All code in `index.html` is original to this delivery** — data model,
  50-rule catalog, synthetic roster/event generator, info-theory functions,
  CAS engine, risk register, self-tests, and UI. Shannon entropy and mutual
  information are standard 1948 textbook formulas (not copied code);
  everything else (rule catalog, loop/bifurcation/attractor definitions,
  thresholds) is this build's own invented-and-disclosed convention.
- **Disclosed gap:** no "cultural bifurcation" / `scoreCulture()`-style
  metric is implemented — no verified definition for it exists anywhere
  checked, so inventing one would misattribute it to a source that doesn't
  exist.
- **Disclosed convention, not validated science:** the 30%-of-mean
  bottleneck threshold, the recurrence-≥3 attractor threshold, the <6-month
  runway bifurcation threshold, and the ≥3-category cross-amplification
  threshold are all illustrative choices made for this build, labeled as
  such in the UI and in `#/about`.

## Project structure

Single file: `index.html`. Internally organized as:

```
1. DATA MODEL        — categories, 50-rule catalog, synthetic roster, PRNG + event generator
2. STORE             — localStorage load/save (key: leados-singlefile:v1)
3. ENGINE            — Signal Board -> Finding[]
4. THERMODYNAMICS    — shannonEntropy / mutualInformation / signalToNoise / identifyBottlenecks
5. CAS ENGINE        — identifyFeedbackLoops / identifyBifurcations / identifyAttractors
6. RISK INTELLIGENCE — buildRiskRegister / crossCategoryAmplification
7. SELF-TESTS        — runSelfTests(), rendered on Today
8. ROUTER + RENDER   — hash router, render*() functions, event handlers
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first, via GitHub's REST API
  (`contents/`, `git/trees`) and raw-file fetches of its README, session log,
  root `index.html`, `src/App.tsx`, `src/lib/infoTheory.ts`, and a
  `src/lib` directory listing, before writing any code** — *why*: the task
  requires inspecting actual code, not trusting the repo's own README/log
  prose at face value.
- **Found and disclosed a direct contradiction inside the real repo's own
  `AI-SESSION-LOG.md`** (claimed 54,081-byte root `index.html` with specific
  content vs. the actual 352-byte Vite scaffold found this session) — *why
  disclosed this way*: the task asked to label anything unverified; a
  concrete, checkable contradiction is stronger and more useful than a vague
  disclaimer, and it's a caution against trusting that repo's own
  provenance narrative uncritically.
- **Built as a hand-authored single `index.html` (vanilla JS + Tailwind CDN)
  instead of attempting to mirror the real repo's React+Vite stack** —
  *why*: this tool environment only supports a static HTML/CSS/JS file with
  no build step; presenting anything else here would misstate the
  environment.
- **Did not reuse any specific rule IDs/scenario names from the "pt-L"
  brief referenced inside the real repo's README** — *why*: that brief's
  text was never supplied in this conversation, so reusing its specific IDs
  (e.g. "R7+R4") would fabricate a provenance link to a document never seen.
  This build's R1–R50 catalog and loop/bifurcation definitions are
  independently authored.
- **Left "cultural bifurcation" unimplemented** — *why*: its dependency is
  undefined in every source checked this session; inventing one would
  misattribute original work to an external spec that doesn't exist.
- **Used a new storage key (`leados-singlefile:v1`)** — *why*: no prior
  session's state exists in this environment; claiming continuity with any
  other key would assert a shared history that doesn't exist here.
