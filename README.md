# LeadOS pt-M, Part 1 — Inference Chain Engine

A React + Vite + Tailwind app implementing **Part 1** of the pt-M
"Autonomous Reasoning Engine" brief: a small deductive **forward-chaining**
engine, an **abductive (backward-chaining)** root-cause analyzer, and one
**temporal** prediction pattern — all computed live over a toggleable
17-rule Signal Board. Not ML. No network calls. All state lives in
`localStorage`.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> `github.com/wbweve/Leados` was inspected directly this session (GitHub's
> REST API for the file tree, and full raw fetches of `src/App.tsx`,
> `src/lib/core.ts`, `src/lib/intelligence.ts`, `src/lib/physics.ts`, and
> the root `README.md`) before any code here was written. Short version:
>
> * The real repo is **two deliveries in one place**: ~60 loose files at
>   repo root (an older, larger build) plus a separate, live
>   Vite+React+TypeScript app under `src/`.
> * **Verified broken in the real repo, by reading the files directly:**
>   `src/lib/intelligence.ts` and `src/lib/physics.ts` both
>   `import { engine, run } from "./core"`, but the real `src/lib/core.ts`
>   exports neither `engine` nor any `run` function. Its actual exports
>   (`loadState`, `saveState`, `project`, …) are a different, incompatible
>   shape.
> * **The real repo's own documentation disagrees with itself** about this:
>   the top-level `README.md` flags the break; `intelligence.ts`'s own
>   in-file disclosure comment (from an earlier session) does not, and
>   describes a different file-count/lineage story. Both are reported here;
>   neither is taken at face value. Full ledger in `AI-SESSION-LOG.md`.
> * This app **does not** reuse `core.ts`, `intelligence.ts`, or
>   `physics.ts` — their data model never resolves in the real repo, and
>   the pasted pt-M brief's own pseudocode assumes that same unverified
>   shape. A fresh, minimal, self-contained model was written instead.
>
> **This build does not fork, copy, or continue any unverified history.**
> It's a new implementation in this task's own environment (React + Vite +
> Tailwind, `src/App.tsx` entry point, built with `npm run build`),
> reusing only specific rule IDs from the pasted brief so its named
> scenarios are explorable — original code throughout.

## Run it

`npm install && npm run build`, then open `dist/index.html`. The build
(via `vite-plugin-singlefile`) inlines all JS/CSS into that one file, so
it opens with zero runtime network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-ptm:v1`. Use **Reset to empty
board** (Today view) to clear it.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/today` | Overview: active finding count, how many inferences are currently firing, historical-attrition count, a one-click demo preset that fires all three forward patterns at once, and an in-browser self-test runner (`ST-001`..`ST-008`). |
| `#/signals` | The Signal Board: 17 synthetic rule IDs across 5 categories (People, Revenue, Engineering, Crisis, Strategy), each toggleable; counter rules (like R1, missed 1:1s) accumulate occurrences; a `crisisCount` metric stepper; an attrition-history log (log a departure today, or seed deterministic synthetic past departures). |
| `#/inference` | The **Inference Engine**: three forward-chaining patterns (premises shown met/unmet live), one abductive backward-chaining analysis (ranked hypotheses with evidence scores), and one temporal pattern (departure-cascade rate computed from your logged attrition history). |
| `#/about` | Full provenance ledger — what was checked against the real repo, what was found (including the repo's internal self-contradiction), and what's explicitly out of scope for this delivery. |

## The five inference patterns

- **INF-001 — Leadership Absence Cascade** (forward): fires when R1 (missed
  1:1s) ≥ 2, R3 (ownerless goal), and R10 (growth plan missed) are all
  active.
- **INF-002 — Revenue Model Validity Collapse** (forward): fires when R104
  (LTV:CAC < 3), R109 (cohort retention declining), and R87 (win/loss
  concentration) are all active.
- **INF-003 — Organizational Immune Response Failure** (forward): fires
  when R133 (recurring crisis root cause), R128 (postmortem action
  ghosted), and a separate `crisisCount` metric ≥ 2 are all true.
- **INF-004 — Velocity Decline Root Cause Analysis** (backward/abductive):
  triggered by R73 (velocity declining); ranks four hypotheses — capacity
  reduction, technical-debt drag, morale degradation, scope creep — by
  evidence for/against, and surfaces the best-scoring one with its
  intervention while keeping the rest visible.
- **INF-005 — Departure Cascade Prediction** (temporal): needs ≥ 3
  historical attrition dates; computes the fraction of past departures
  that were followed by another within 60 days, from *your own* logged
  history, not a fixed rule.

## What's original, what's modeled on the pasted brief, what's explicitly cut

- **Modeled closely on the pasted pt-M "Part 1" brief, reimplemented as
  real TypeScript:** the five `INF-00x` patterns, their premises/
  hypotheses/interventions text, and the forward/backward/temporal
  chaining algorithms. The brief's pseudocode referenced undefined helpers
  (`LEADOS.engine._days`, `P.state.events`) that don't exist in any
  verified source, so a self-contained `AppState` model replaces them —
  same logic, new plumbing.
- **Built from scratch, original to this delivery:** the 17-rule catalog,
  the Signal Board UI, the attrition-history log, the demo preset, and the
  self-test suite.
- **A gap, left as a gap:** pt-M's introduction describes a full autonomous
  layer (continuous reasoning, bounded autonomous action, self-maintenance,
  learning from outcomes, approvable work products). Only "Part 1" had a
  complete spec in this message, so only Part 1 is built. See
  `AI-SESSION-LOG.md` §4.

## Project structure

```
src/
  lib/
    types.ts       — shared types (Rule, Finding, AppState, pattern types)
    rules.ts        — 17-rule synthetic catalog, 5 categories (original)
    engine.ts         — Signal Board -> Finding[] projection + crisisCount metric
    inference.ts        — INF-001..INF-005: forward / backward / temporal chaining
    selfTest.ts           — original runtime self-tests (ST-001..ST-008)
    store.ts                — localStorage persistence, demo preset, history seeder
  components/
    Shell.tsx                 — nav shell + shared UI primitives (SectionCard, Pill)
    Views.tsx                   — TodayView / SignalsView / InferenceView / AboutView
  App.tsx                         — hash router + route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first — file tree via the GitHub
  REST API, then full raw fetches of `src/App.tsx`, `src/lib/core.ts`,
  `src/lib/intelligence.ts`, `src/lib/physics.ts`, and the root
  `README.md` — before writing any code.** *Why:* the task requires
  inspecting actual code, not trusting a README's self-framing (or this
  session's own prose) at face value.
- **Confirmed, by reading both files directly, that `intelligence.ts` and
  `physics.ts` import `{ engine, run }` from a `core.ts` that exports
  neither.** *Why this matters:* it means those two files cannot run in
  the real app as committed — a concrete, checkable fact, not a vibe.
- **Flagged that the repo's own documentation is internally
  inconsistent** (`intelligence.ts`'s in-file disclosure vs. the top-level
  `README.md` tell different provenance stories). *Why disclosed this
  way:* an AI-authored repo accumulating sessions that each trust the
  previous session's self-report, without re-checking it, is exactly how
  false claims compound — surfacing the contradiction is more useful than
  silently picking one side.
- **Declared the pasted "pt-M" brief's autonomous-layer framing a roadmap
  statement, not a spec, beyond Part 1.** *Why:* only Part 1 (the
  Inference Chain Engine) was given with implementable detail in this
  message; building the rest would mean inventing unspecified mechanisms
  under the pt-M name.
- **Replaced the brief's pseudocode event-log helpers with a small typed
  `AppState`, instead of trying to resurrect `core.ts`/`intelligence.ts`
  from the real repo.** *Why:* those real files' dependency never
  resolves (see above); building on a broken import would just move the
  breakage here.
- **Reused specific rule IDs from the pasted brief (R1, R3, R7, R10, R19,
  R20, R38, R68, R73, R74, R79, R81, R87, R104, R109, R128, R133) inside an
  otherwise-original 17-rule catalog.** *Why:* lets the brief's own named
  scenarios (leadership absence cascade, revenue model collapse, immune
  response failure, velocity root-cause, departure cascade) be explored
  directly, without claiming those IDs came from a real rule engine.
- **Added a demo preset and attrition-history seeder.** *Why:* with 17
  independently togglable rules plus a 3-event minimum for the temporal
  pattern, manually reconstructing all five firing conditions is tedious;
  the preset/seeder make the full engine demonstrable in two clicks
  without hiding how it was triggered.
- **Wrote an original self-test suite (`ST-001`..`ST-008`) instead of the
  pasted brief's named `T_L_*`/`G_L_*` test IDs.** *Why:* that suite's
  existence/content could not be verified anywhere this session; new IDs
  avoid implying a false provenance, and the tests pin down the exact
  threshold edge cases (R1 ≥ 2 vs ≥ 1; `crisisCount` gating INF-003
  independently of its two findings) that are easy to get subtly wrong.
- **Used a new storage key (`leados-ptm:v1`).** *Why:* this workspace
  began with the default scaffold `App.tsx` and no prior state; reusing
  another session's or another repo's key would assert a shared history
  that doesn't exist here.
