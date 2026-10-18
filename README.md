# LeadOS pt-S — Bayesian Belief Network Engine (Part 1)

A React + Vite + Tailwind app implementing **Part 1** of the task's pasted
"LeadOS pt-S" brief: a Bayesian Belief Network over five organizational
hypotheses, updated live from a toggleable Signal Board of synthetic
evidence.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> that repo was inspected directly this session (GitHub's REST tree API, its
> own `AI-SESSION-LOG.md`, raw `src/App.tsx`, raw root `index.html`), per the
> task's instruction to inspect actual code before claiming anything about
> it. Full ledger in `AI-SESSION-LOG.md` and in-app at **About / Provenance**.
> Short version:
>
> * A case-insensitive grep of the **entire 148-file tree**, plus the raw
>   contents of `src/App.tsx` and the root `index.html`, found **zero**
>   matches for `bayes*` or `belief*` anywhere in the real repo. Nothing in
>   this delivery is a port of real-repo code — there is no Bayesian code
>   there to port.
> * The real repo's live `src/App.tsx` currently renders a **different**
>   build (Thermodynamics + CAS Engine + Risk Register, per its own
>   README's route table) — a later session's work than the Bayesian-free
>   state described in an even earlier log file also present in the repo.
> * This app is a **fresh build**, in this task's own tool environment
>   (React + Vite + Tailwind, single `src/App.tsx` entry point, built with
>   `npm run build`), implementing only the *functional ideas* in the
>   pasted "pt-S, Part 1" brief — original code throughout.
> * The brief's own **numeric priors and likelihood ratios** (SHRM,
>   Bessemer, Lattice, Gallup, Leiter & Maslach, Doerr, Reichheld, LinkedIn
>   Talent Trends) are reproduced **verbatim** from the pasted text and are
>   **not independently verified** against the original publications this
>   session. Labeled "unverified citation" everywhere they appear.

## Run it

`npm install && npm run build`, then open `dist/index.html`. This project's
`vite.config.ts` already includes `vite-plugin-singlefile`, so the build
inlines all JS/CSS into that one HTML file (verified by grepping the build
output for external URLs — none found beyond inert XML/SVG namespace
strings, a baked-in React-docs error link, and one inert display string
quoting a URL inside the in-app provenance text). Zero runtime network
calls.

For development: `npm run dev`.

State (which synthetic rules/evidence are toggled on) lives in
`localStorage` under `leados-pts-bayesian:v1`.

## Pages (in-app tabs)

| Tab | What it does |
|---|---|
| **Today** | Overview: active finding count, high-risk belief count, mood-trend slope, and a compact bar for all five tracked beliefs. |
| **Signal Board** | Toggle 8 synthetic rule-based findings, pick a mood-trajectory scenario (declining/stable/improving), set the goal/OKR hit rate (synthetic or manual), and toggle 5 "manual-only" evidence signals the source spec defines but never actually wires up (see disclosed gap below). |
| **Belief Network** | The five hypotheses (`attrition.next60d`, `revenue.miss.next_quarter`, `crisis.next30d`, `okr.on_track`, `key_hire.success`), each showing prior vs. posterior probability, every applied evidence signal with its likelihood ratio/source/effect, and the full Bayesian-update label. |
| **About / Provenance** | The full fetch-by-fetch ledger of what was checked against the real GitHub repo, what was verified, and every disclosed gap — both in the real repo and in the pasted brief's own code. |

## What's original, what's a reused pattern, what's a disclosed gap

* **Original, built from scratch (no verified source found anywhere):**
  `src/lib/bayesian.ts` (priors, likelihood tables, `updateBelief`,
  `computeAllBeliefs`), `src/lib/engine.ts` (evidence-signal extraction),
  `src/lib/rules.ts` (8-rule synthetic catalog), `src/lib/seed.ts`
  (synthetic mood/goal data), `src/lib/store.ts`, all UI components.
* **Reused rule IDs, invented everything else about them:** `R1`, `R6`,
  `R7`, `R10`, `R14`, `R73`, `R104`, `R157` are the exact IDs the pasted
  brief references in `_extractEvidenceSignals()`. Reusing them lets the
  brief's own named evidence-mapping logic be explored directly, matching
  the convention the real repo's own prior session used for its own reused
  IDs. Titles, descriptions, and categories for these rules are invented
  for this delivery.
* **Numeric priors/likelihood ratios/citations:** reproduced verbatim from
  the pasted brief. **Unverified** — not checked against the named sources
  this session. Treat as illustrative, not validated research.
* **Disclosed gaps found in the pasted spec's own code** (applying "inspect
  before claiming" to the brief's text, not just to GitHub):
  1. `crisis.next30d` and `key_hire.success` have prior entries but **no**
     matching likelihood-ratio table in the brief — so, per the brief's own
     `update()` logic (`if (!likelihoodFn) return prior;`), these two
     hypotheses can never move away from their prior. Reproduced faithfully
     (shown as a "static prior" badge) rather than inventing ratios the
     brief never specified.
  2. Five likelihood keys (`comp.at_market`, `promotion.recent`,
     `pipeline.shrinking`, `nps.high`, `velocity.stable`) are *defined* in
     the brief's `LIKELIHOODS` table but its own `_extractEvidenceSignals()`
     never actually emits any of them — dead code in the source spec.
     Surfaced here as explicit "manual-only" toggles, clearly labeled,
     rather than silently wiring them into the automatic rule mapping.
  3. The brief declares a `beliefs: {}` running cache and reads it as the
     "prior" on each `update()` call, but nothing in the brief ever writes
     to that cache (it persists posteriors to a *different* object,
     `state.meta.beliefs`). Net effect: every recompute always restarts
     from the original base prior, not from a previous posterior. This
     build replicates that behavior intentionally — every belief
     recomputation is a full, stateless re-derivation from the base prior
     over the *current* evidence snapshot — and discloses it rather than
     silently "fixing" a design the brief doesn't actually specify.
* **Scope limit, left as a gap:** only "Part 1: The Bayesian Belief Network
  Engine" was pasted into this conversation. The brief's own framing
  describes further capability (a forward 30/60/90-day scenario simulator;
  an always-on background process that proactively composes and delivers
  insights). Neither is implemented — not found anywhere in this part's
  text, and inventing it would misattribute unseen future-part content to
  this delivery.

## Project structure

```
src/
  lib/
    types.ts            — shared types (HypothesisId, RuleId, AppState, ...)
    rules.ts             — 8-rule synthetic catalog (original; IDs reused per above)
    bayesian.ts            — PRIORS, LIKELIHOODS, updateBelief, computeAllBeliefs, computeMoodTrend
    engine.ts                — Signal Board state -> evidence-signal arrays
    seed.ts                    — synthetic mood-trajectory series + goal ledger
    store.ts                     — localStorage persistence
  components/
    Shell.tsx, ui.tsx              — nav shell + shared UI primitives
    TodayView / SignalBoardView / BeliefsView / AboutView
  App.tsx                           — tab composition (entry point)
```

## Changelog

* **Fetched `github.com/wbweve/Leados` (README, full recursive file tree via
  GitHub's REST API, raw `AI-SESSION-LOG.md`, raw `src/App.tsx`, raw root
  `index.html`) before writing any code** — *why*: the task requires
  inspecting actual code, not trusting a README's self-framing or the
  pasted brief at face value.
* **Grepped the entire 148-file tree and the two fetched raw files for
  `bayes*`/`belief*`; found zero matches** — *why disclosed this
  explicitly*: the single highest-value fact to confirm before building
  anything "Bayesian" is whether that word exists in the real repo at all.
  It doesn't.
* **Noticed the real repo's live app has moved on to a different build
  (Thermodynamics + CAS + Risk Register) since an earlier session's log was
  written** — *why mentioned*: an AI-SESSION-LOG.md file being present
  doesn't mean it describes the repo's *current* state; this delivery dates
  every claim to the specific fetch that produced it instead of treating
  any one file as permanently authoritative.
* **Built as a React+Vite+Tailwind app instead of a hand-authored
  single-file HTML demo** — *why*: this tool environment's entry point is
  `src/App.tsx`; `vite-plugin-singlefile` (already present in
  `vite.config.ts`) still produces a single inlined `dist/index.html` with
  zero runtime network calls, so the end-user property the brief's framing
  implies ("one file, thinks for you") still holds.
* **Reused rule IDs R1/R6/R7/R10/R14/R73/R104/R157 inside an otherwise
  original 8-rule catalog** — *why*: lets the brief's own named evidence
  mappings be explored directly without claiming those IDs came from a real
  rule engine.
* **Exposed `comp.at_market` / `promotion.recent` / `pipeline.shrinking` /
  `nps.high` / `velocity.stable` as separate "manual-only" toggles instead
  of wiring them into the automatic Signal Board rules** — *why*: the
  brief's own evidence-extraction function never emits these signals even
  though it defines likelihood ratios for them; silently wiring them in
  would imply a connection the source spec doesn't actually make.
  Surfacing this as a labeled gap matters more than making the demo feel
  "more complete" than its source material.
  * **Made `crisis.next30d` and `key_hire.success` visibly "static"
  (non-updating) in the UI instead of inventing likelihood ratios for
  them** — *why*: the brief defines priors for both but no likelihood
  table — inventing ratios would misattribute original guesswork to an
  external spec that doesn't contain it.
* **Replicated the brief's "always recompute from the base prior, not from
  a running posterior" behavior rather than fixing it into a true
  sequential Bayesian updater** — *why*: the brief's own `beliefs: {}` cache
  is dead code (never written to), so a stateless full recompute is what
  its logic actually does, not a bug this build should silently patch.
* **New `localStorage` key `leados-pts-bayesian:v1`** — *why*: this
  workspace began from the default Vite scaffold with no prior `App.tsx`,
  so no other session's key or state is continued here.
* **Did not implement the forward 30/60/90-day simulator or the always-on
  background insight process mentioned in the brief's framing text** —
  *why*: that text describes capability, but no implementation spec for it
  was pasted in this part of the conversation; per the delivery
  instruction ("after every part"), only what was actually provided is
  built.
