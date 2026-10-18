# LEADOS — Sandbox (Part 2: Multi-Agent Organizational Simulation)

A single-file (`index.html`) leadership-ops sandbox: a minimal org model
(roster, pulse check-ins, feedback, growth plans, 1:1 cadence, conflicts)
plus `LEADOS.simulation` — a discrete-event, weekly-step, Monte Carlo
simulation that projects your team 12 weeks (~90 days) forward under a
"status quo" scenario and under candidate manager interventions, with a
Simulation Playbook + View on top of it.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> That repo was inspected directly this session (GitHub REST API tree +
> contents listing, raw fetches of its root `index.html`, `README.md`, and
> `AI-SESSION-LOG.md`). Full ledger in `AI-SESSION-LOG.md`. Short version:
>
> - The real repo's root is currently a flat directory of ~35+ loose
>   `.tsx`/`.md` files, and its root `index.html` — fetched and read in full
>   this session — is a **9-line Vite entry stub** (`<div id="root">` +
>   `<script src="/src/main.tsx">`), with no inline application logic.
> - This **contradicts** the repo's own `README.md`/`AI-SESSION-LOG.md`,
>   which describe inspecting a 54KB hand-authored `index.html` full of rule
>   IDs and an `identifyAttractors()` function. That mismatch is surfaced
>   here, not silently resolved — the repo's own documentation about itself
>   is not fully reliable.
> - Whether a `src/lib/`/`src/components/` tree with the specific files the
>   repo's docs name (`infoTheory.ts`, `casEngine.ts`, etc.) currently exists
>   was **not independently confirmed** this session (no `contents/src` call
>   was made) — repeated here only as the repo's own, not fully trustworthy,
>   self-report, never as this session's verified fact.
> - The `LEADOS.simulation` code this app implements is **this task's own
>   pasted spec**. It was not found in anything actually fetched from the
>   real repo this session, and is treated as an unverified external
>   specification, not as repo history — the same convention the real
>   repo's own prior sessions used for their pasted briefs.
>
> This app does not fork, copy, or continue the real repo's code. It is a
> fresh, single-file build for this task's tool environment (plain HTML +
> Tailwind CDN + vanilla JS, no build step), implementing the *described
> behavior* of the pasted spec.

## Run it

Open `index.html` in a browser. No build step, no server, no external
dependency besides the Tailwind CDN `<script>` tag. State persists in
`localStorage` under `leados:v1`. Use **Reset synthetic data** (sidebar) to
regenerate the synthetic roster/history.

## Pages

| Tab | What it does |
|---|---|
| Today | Current (un-simulated) snapshot — team mood/load averages, overdue-1:1 count, people without a growth plan, and a roster table with a live flight-risk estimate. |
| People | Add/remove people (direct reports and skip-levels), set 1:1 cadence per person. |
| Pulses | Log mood/load check-ins per person (used by the simulation's `initAgents`). |
| Feedback | Log positive/corrective feedback per person. |
| Growth Plans | Open/close growth plans; flags people with none open. |
| 1:1 Cadence | Log 1:1s; shows days-since-last and overdue status per person. |
| Conflicts | Log conflicts between two people (feeds `recentConflicts` in the simulation). |
| **Simulation** | The Part 2 deliverable: run status-quo vs. a chosen intervention, or a "full playbook" comparing all six intervention types; ranked scenario table, weekly trajectory chart, per-agent final-state table, and a recommended best intervention. |
| About / Provenance | Full inspection ledger for `github.com/wbweve/Leados`, and what's verified vs. unverified in this delivery. |

## What's verbatim, what's added, what's a disclosed gap

- **Verbatim from the task's pasted spec:** `LEADOS.simulation.initAgents`,
  `.stepAgents`, `.run`, `._runScenario`, `._percentile` — unmodified
  behavior and coefficients, including the model's own self-disclosed
  "heuristic, not empirically validated" label.
- **Added in this delivery, clearly separated:** `LEADOS.simulation.weeklyTrajectory`
  (single-seed week-by-week series, for the chart) and `.estimateCurrent`
  (week-0 flight-risk estimate, for dashboards). Neither feeds the ranking
  table's headline numbers — those always come from the unmodified `run()`.
- **Built from scratch, synthetic:** the entire Part 1 data model (people,
  pulses, feedback, plans, 1:1s, conflicts) and a 9-person seed roster with
  invented mood/load/feedback/cadence profiles. Not real org data; not
  found in, or copied from, the real repo.
- **A disclosed simplification:** the "full playbook" run auto-targets each
  intervention type at the whole team or a simple heuristic subset
  (overdue people, no-plan people, overloaded people) for comparability —
  real interventions (especially `PROMOTE`) are normally targeted to one
  person; the manual run supports that.
- **A disclosed limitation:** "attrition probability" is a modeling proxy
  (share of Monte Carlo seeds with any agent's flight risk > 0.7) invented
  by the pasted spec, not a validated predictive metric.

## Project structure

Single file: `index.html`.
- `LEADOS.util` — small helpers (dates, clamping, formatting).
- `LEADOS.engine` — `_days()` date-diff helper + `buildProjection()` (raw
  store → the `P` shape `LEADOS.simulation` expects).
- `LEADOS.monteCarlo._prng` — seeded PRNG (mulberry32) for reproducible runs.
- `LEADOS.simulation` — the Part 2 spec (see above).
- `LEADOS.store` / `LEADOS.seed` — localStorage persistence + synthetic seed data.
- `LEADOS.charts.line` — minimal dependency-free canvas line chart.
- App shell: tab router + render functions + form handlers (`window.*`).

## Changelog

- **Inspected `github.com/wbweve/Leados` first** (tree + contents listing +
  raw `index.html`/`README.md`/`AI-SESSION-LOG.md`) **before writing any
  code** — *why*: required by the task; also because the repo's own
  prior-session docs turned out to describe a root `index.html` that no
  longer matches what's actually there, which is only catchable by fetching
  the real file directly instead of trusting the README.
- **Flagged a direct contradiction between the repo's own docs and its own
  current `index.html`**, rather than picking one version to believe —
  *why*: the task requires inspecting actual code before claiming anything;
  a stale self-report shouldn't be laundered into a confident claim either
  way.
- **Declared the pasted `LEADOS.simulation` code an unverified
  specification, not repo fact** — *why*: it does not appear in anything
  fetched from the real repo this session, and the real repo's own prior
  sessions already established the convention of treating pasted briefs
  this way.
- **Built Part 1 (org data model) from scratch in this delivery**, even
  though the task text only asked for Part 2 — *why*: `LEADOS.simulation`'s
  own code (`P.directs`, `P.pulsesByPerson`, `P.openPlans`, etc.) requires a
  populated org model to run against, and this project had no prior
  `index.html` (confirmed via a direct file read before any edits) to
  supply one.
- **Reproduced the Part 2 simulation code verbatim** instead of
  "improving" its coefficients — *why*: changing an admittedly heuristic,
  self-disclosed model's numbers would misrepresent it as calibrated when
  it isn't; the task's own spec already labels this.
- **Added `weeklyTrajectory`/`estimateCurrent` as separate, clearly-labeled
  helpers rather than editing the pasted functions** — *why*: keeps a clean
  provenance line between "exactly what was pasted" and "added for the
  View," per the task's inspect-before-claiming standard.
- **Used a new localStorage key (`leados:v1`)** — *why*: this project had
  no prior state; claiming continuity with any other session's key would
  assert a shared history that doesn't exist here.
- **Built as a single hand-authored `index.html` with Tailwind CDN**, no
  build step — *why*: this is this tool environment's required delivery
  format, unlike the real repo's current Vite/React stub; no attempt is
  made to imitate that stack here.
