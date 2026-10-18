# LeadOS pt-U — Attention Optimizer (Part 1)

A React + Vite + Tailwind app implementing **Part 1** of the pasted "pt-U"
brief: a simulated-annealing optimizer that sequences a week of leadership
attention across synthetic findings, under time and cognitive-load
constraints, with dependencies and urgency windows.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any other "pt-" session:** the real repo was inspected directly this
> session (GitHub REST API file trees, raw fetches of `src/App.tsx`,
> `src/lib/core.ts`, `src/lib/circadian.ts`, `src/lib/engine.ts`, the repo's
> own `AI-SESSION-LOG.md`, and its `README.md`) **before** any code here was
> written. Full ledger in `AI-SESSION-LOG.md` and in-app at **About /
> Provenance**. Short version:
>
> - The real repo mixes two deliveries: ~40 loose root-level files (incl. a
>   single-file `index.html` demo) plus a separate, live
>   Vite+React+TypeScript app under `src/`.
> - **Verified directly, this session:** `src/App.tsx` is live and imports a
>   Signal Board / Thermodynamics / CAS / Risk route set; `src/lib/` holds 29
>   files including `circadian.ts`, `core.ts`, `intelligence.ts`,
>   `physics.ts`, `casEngine.ts`, `infoTheory.ts`, `riskIntelligence.ts`.
>   `core.ts` and `intelligence.ts` are present but **not wired into** the
>   live app, and `intelligence.ts`'s import from `core.ts` is broken
>   (confirmed by reading both files directly) — this matches what the real
>   repo's own `AI-SESSION-LOG.md` already documents from an earlier
>   session's inspection.
> - **Not found anywhere in the real repo, this session:** any file, export,
>   or global object named `attentionOpt`, `buildAttentionItems`,
>   `optimizeSequence`, `buildWeeklyAttentionPlan`, `playbooks`, or any global
>   `LEADOS.*` namespace object. The real repo's verified live code is
>   consistently ES-module named exports per file, never a single global
>   `LEADOS` object.
>
> **This app does not fork, copy, or continue that history.** It is a fresh
> build in this task's own tool environment (React + Vite + Tailwind, single
> `src/App.tsx` entry point, built with `npm run build`), implementing only
> the *described algorithm* from the pasted "pt-U" brief — original code
> throughout. The brief's own `LEADOS.attentionOpt = {...}` code sample is
> treated as an **unverified external specification**, the same convention
> the real repo's own prior sessions already applied to earlier pasted
> briefs (see their `AI-SESSION-LOG.md`).

## Run it

`npm install && npm run build`, then open `dist/index.html`. The Vite config
inlines all JS/CSS into that one HTML file via `vite-plugin-singlefile`
(already present in `package.json`), so it opens with zero runtime network
calls.

For development: `npm run dev`.

State (the Signal Board toggles) lives in `localStorage` under
`leados-pt-u:v1`. Use **Clear all** (Signal Board view) to reset, or **Load
busy-week preset** to restore a demo scenario.

## Pages (hash routes)

| Route         | What it does |
|---------------|--------------|
| `#/today`     | Overview: active finding count, aggregate score, current circadian phase, findings by category. |
| `#/signals`   | The **Signal Board**: 24 synthetic rule IDs across 6 categories, each toggleable with a severity override and a runway slider that pulls finance urgency forward below 6 months. |
| `#/attention` | The **Attention Optimizer**: builds cost/benefit/urgency/dependency items from active findings, runs simulated annealing to pick the sequence that maximizes benefit within your hours/cognitive-load budget, shows a Mon–Fri schedule, the ranked sequence, and what got deferred and why. |
| `#/about`     | Provenance ledger — what was checked against the real repo, what was found, and how this delivery compares to the pasted "pt-U" brief. |

## What's original, what's modeled on a verified pattern, what's a disclosed gap

- **Modeled on a verified real-repo pattern, reimplemented independently:**
  `src/lib/circadian.ts`. A real, same-purpose file was confirmed to exist in
  the repo (a 7-phase chronobiology heuristic); this file's *numbers* were
  not copied from it (only its general shape — phase → analytical/working-
  memory multiplier — was reused), because copying undisclosed internal
  values would overstate what was actually verified.
- **Built from scratch because no verified source exists anywhere:**
  `src/lib/attentionOpt.ts` (the simulated-annealing optimizer itself),
  `src/lib/playbooks.ts` (cost/load proxy per intervention type), and
  `src/lib/engine.ts` (Signal Board → Finding[]). These implement the
  *described behavior* in the pasted brief, not any verified prior
  implementation — none was found to port.
- **Reused specific rule IDs from the pasted brief** (`R1`, `R4`, `R7`,
  `R10`, `R17`, `R73`, `R88`, `R103`, `R104`) inside an otherwise-original
  24-rule catalog — *why*: keeps the brief's own named dependency examples
  (R10 depends on R1; R104 depends on R103) explorable, without claiming
  those IDs came from a real rule engine.
- **A disclosed simplification:** the optimizer's "downstream blocked"
  leverage proxy uses a synthetic `sources` overlap (category + linked
  person) rather than a real cross-finding signal graph, because no such
  graph exists in this sandbox's data model. Labeled in code comments.

## Project structure

```
src/
  lib/
    types.ts           — shared types (Category, Finding, AttentionItem, ...)
    rules.ts            — 24-rule synthetic catalog, 6 categories (original)
    store.ts             — localStorage persistence for the Signal Board
    engine.ts              — Signal Board -> Finding[] (disclosed-fabricated)
    playbooks.ts             — cost/cognitive-load proxy per intervention type
    circadian.ts               — heuristic time-of-day capacity model
    attentionOpt.ts               — simulated annealing attention optimizer
    useHashRoute.ts                 — tiny hash router
  components/
    Shell.tsx, TodayView.tsx, SignalBoardView.tsx, AttentionView.tsx,
    AboutView.tsx                     — route views + shared UI primitives
  App.tsx                                — route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's REST API
  (file trees, contents listings) and direct raw-file fetches of
  `src/App.tsx`, `src/lib/core.ts`, `src/lib/circadian.ts`,
  `src/lib/engine.ts`, the repo's `README.md`, and its `AI-SESSION-LOG.md` —
  *why*: the task requires inspecting actual code before claiming anything
  about it, not trusting the pasted brief's framing at face value.
- **Confirmed the repo's own README's claims largely hold, but its
  "Project structure" section is stale** — it lists 10 `src/lib` files;
  the real `src/lib` directory has 29, including `circadian.ts`, `core.ts`,
  `intelligence.ts`, `physics.ts`, `memory.ts`, `monteCarlo.ts`, `health.ts`,
  `genome.ts`, `fatigue.ts`, `familiarity.ts`, `sensory.ts`, `synthesis.ts`,
  `workers.ts` — *why flagged*: a stale "project structure" section is an
  easy way to under- or over-claim scope; disclosing the mismatch here keeps
  this delivery honest about what it did and didn't re-verify line-by-line.
- **Declared the pasted "pt-U" brief's `LEADOS.attentionOpt` code sample an
  unverified specification, not repo fact** — *why*: no string match for
  `attentionOpt`, `buildAttentionItems`, `optimizeSequence`,
  `buildWeeklyAttentionPlan`, `playbooks`, or a global `LEADOS` object was
  found in any file fetched this session, and the real repo's verified code
  is consistently per-file ES-module exports, never a global namespace
  object.
- **Built as a React+Vite+Tailwind app with `src/App.tsx` as the entry
  point** (this task's required stack) rather than a hand-authored
  single-file demo — *why*: this tool environment's contract requires it;
  `vite-plugin-singlefile` (already in `package.json`) still produces a
  single `dist/index.html` with zero runtime network calls, preserving the
  "open one file" property the brief cares about.
- **Reused R1/R4/R7/R10/R17/R73/R88/R103/R104 inside an original 24-rule
  catalog** — *why*: lets the brief's own named dependency chains stay
  explorable without claiming those IDs came from a real rule engine.
- **Scoped this delivery to Part 1 only (Attention Optimizer)** — *why*:
  the pasted brief's Parts 2–8 (scenario planning, narrative intelligence,
  living strategy documents, organizational physics, talent architecture,
  regulatory intelligence, financial intelligence OS) were described only as
  section headers with no algorithmic detail in this task; implementing them
  without a concrete spec to verify or faithfully reimplement would mean
  inventing significant behavior and presenting it as if it answered the
  brief. Flagged here as a scope limit, not glossed over.
- **Used a new storage key (`leados-pt-u:v1`)** — *why*: this workspace
  began with the default Vite scaffold and no prior app state; claiming
  continuity with any other session's key would assert a shared history
  that doesn't exist in this workspace.
