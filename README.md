# LeadOS pt-V — Self-Sovereign Intelligence (sandbox build)

A React + Vite + Tailwind app implementing four parts of the task's pasted
"pt-V" specification as original, runnable code over a synthetic event log:
a **Hypothesis Engine**, an **Emergent Pattern Detector**, a three-level
**Autonomous Agent Loop**, and a working slice of the **Cognitive Load
Architecture**.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> that repo was inspected directly this session via GitHub's REST API and raw
> file fetches (commit history, trees, and specific file contents) *before*
> any code here was written. Full call-by-call ledger in
> [`AI-SESSION-LOG.md`](./AI-SESSION-LOG.md) and in-app at **About /
> Provenance**. Short version:
>
> - At inspection time, HEAD (`5c84566`, 2026-10-17 14:03 UTC) was the
>   **5th bulk "Add files via upload" commit in under an hour** — repeated
>   overwrites, not incremental development.
> - **That commit's own README/AI-SESSION-LOG describe a 6-route
>   Thermodynamics/CAS/Risk app** (`#/today #/signals #/thermodynamics #/cas
>   #/risk #/about`, `src/lib/{casEngine,riskIntelligence,...}.ts`) — but the
>   **same commit's actual `src/App.tsx`** imports a completely different,
>   5-route set (`today/intelligence/data/health/about`) with no
>   `casEngine`/`riskIntelligence` anywhere in its import chain. The repo's
>   own description of itself doesn't match its own live entry point, at the
>   same commit.
> - A separate pile of ~30 loose `.tsx` files sits at repo root (including a
>   second, byte-distinct `App.tsx`) with names like `FinanceDashboard.tsx`,
>   `ContractView.tsx`, `RosterView.tsx`, `BundlesView.tsx`, `Catalog.tsx` —
>   matching neither the README nor the live app. Reads as debris from an
>   unrelated delivery, not part of LeadOS.
> - **Nothing resembling this task's pasted "pt-V" brief** (`LEADOS.hypothesis`,
>   `LEADOS.emergent`, `LEADOS.agent`, `LEADOS.layout`, the 20-step boot
>   sequence) was found anywhere fetched this session. It is treated here as
>   an **unverified external specification**, not repo fact.
>
> **This delivery does not fork, copy, or continue any of that history.** It
> is a fresh build in this task's own tool environment (React + Vite +
> Tailwind, `src/App.tsx` entry point, `npm run build`), implementing
> original code for the *functional ideas* in four parts of the pasted brief.

## Run it

```
npm install
npm run build
```

Then open `dist/index.html` directly — `vite-plugin-singlefile` inlines all
JS/CSS into that one file, so it opens with zero network calls (verified by
inspecting the build output: the only external-looking strings are inert
SVG/XML namespace URLs and a React docs link baked into minified error
text).

For development: `npm run dev`.

State lives entirely in `localStorage` under `leados-ptv:v1`. Use **Reset
synthetic data** on the Event Log tab to regenerate it.

## What's actually in this build

| Tab | What it does |
|---|---|
| **Today** | Live-computed snapshot: 30-day velocity/engagement, decision velocity, and a cognitive-load badge that actually changes the header's color/pulse based on how much is currently queued for your attention. |
| **Hypothesis Engine** | Scans the event log for four kinds of anomaly (velocity/engagement divergence, feedback-volume-without-engagement-lift, decision-overload, conflict concentration), lets you "track" a candidate (logs a `hypothesis.generated` event with a stated test window), and lets you confirm/refute/mark inconclusive once that window expires — producing an "organizational model update" line when confirmed. |
| **Emergent Patterns** | Three statistical detectors that don't depend on any predefined rule: Poisson z-score frequency anomalies (30d vs. prior-90d baseline per event type), 7-day co-occurrence clustering between event-type pairs, and a CUSUM control chart that finds per-person behavioral change points from the synthetic roster's event frequency. |
| **Autonomous Agent** | Builds a prioritized task queue from current data and runs it against a three-level authority model: Level 1 tasks execute and show results immediately; Level 2 tasks (e.g. proposing a 1:1 cadence change) are queued and require an explicit Accept/Reject; Level 3 (personnel decisions) always escalates and is never attempted. |
| **Event Log** | The ~150-day, 8-person synthetic log every other tab computes from, with per-type counts, a filterable table, and a reset button. |
| **About / Provenance** | The full verified-vs-unverified ledger from the real-repo inspection, in-app. |

Every number shown is computed live from the event log in `localStorage` —
nothing is hard-coded or pre-rendered for the demo.

## Project structure

```
src/
  lib/
    types.ts          — shared types (events, hypotheses, agent tasks, cognitive load)
    seed.ts            — deterministic synthetic roster + ~150-day event log, with injected anomalies
    store.ts             — localStorage persistence (key leados-ptv:v1)
    metrics.ts             — shared numeric helpers (velocity/engagement/decision metrics)
    hypothesis.ts            — THE HYPOTHESIS ENGINE (Part 1)
    emergent.ts                — THE EMERGENT PATTERN DETECTOR (Part 2)
    agent.ts                     — THE AUTONOMOUS AGENT LOOP (Part 3)
    cognitiveLoad.ts                — cognitive-load scoring (slice of Part 4)
  components/
    Shell.tsx, TodayView.tsx, HypothesisView.tsx, EmergentView.tsx,
    AgentView.tsx, EventLogView.tsx, AboutView.tsx
  App.tsx              — route composition (entry point)
```

## What's original, what's a disclosed gap

- **Original, built from scratch:** everything under `src/lib` and
  `src/components`. No file, formula name, or identifier from the pasted
  brief's `LEADOS.*` namespace was found in the real repo to model against
  — these satisfy the brief's *described behavior* (e.g. "generate
  hypotheses from anomalies," "CUSUM-detect behavioral change points,"
  "three-level agent authority"), not any verified prior implementation.
- **A disclosed gap:** the brief's full 20-step session boot sequence
  (workers, haptics, voice/gamepad input, a protocol server, circadian
  adaptation, a "living stylesheet") and its complete keyboard map are not
  implemented. Neither exists in the real repo either; inventing them here
  would misattribute speculative scope as delivered capability.
- **A disclosed simplification:** "cognitive load" is recomputed on each
  render from current counts (open findings, hypotheses, anomalies, pending
  agent proposals) rather than continuously tracked by a background timer —
  this is a static, client-only build with no server process to run one.

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's REST API
  (commits, trees, contents) and raw-file fetches of `README.md`,
  `AI-SESSION-LOG.md`, root `index.html`/`App.tsx`, and `src/App.tsx` —
  before writing any code. *Why:* the task requires inspecting actual code,
  not trusting a README's self-framing, a search index's stale cache, or
  the task prompt's own pasted brief at face value.
- **Found and disclosed that the repo's own README contradicts its own live
  `src/App.tsx` at the same commit** (6 documented routes vs. 5 actually
  imported; a CAS/risk-register module documented but not referenced
  anywhere in the live import chain). *Why disclosed this prominently:* a
  half-right self-description is more misleading than an obviously-wrong
  one — burying this would make the "provenance" claim worthless.
  *(Unverified beyond what was fetched: the contents of `src/lib/*.ts`
  files themselves were not re-read byte-for-byte this session — see
  AI-SESSION-LOG.md §1 call #9 and §2 V6.)*
- **Declared the pasted "pt-V" brief an unverified specification, not repo
  fact.** *Why:* no string match for `LEADOS.hypothesis`, `LEADOS.emergent`,
  `LEADOS.agent`, or `LEADOS.layout` was found in anything fetched this
  session.
- **Built only 4 of the brief's parts (Hypothesis Engine, Emergent Pattern
  Detector, Autonomous Agent Loop, a slice of Cognitive Load), not the full
  20-step boot sequence or keyboard map.** *Why:* those four have precise,
  testable contracts implementable as pure functions over an event log; the
  rest (workers, haptics, voice, a protocol server) would be unverifiable
  theater in a static, client-only sandbox with no backend.
- **Injected deliberate anomalies into the synthetic seed data** (a
  velocity/engagement divergence, a feedback-volume spike, a
  decision-overload window, a conflict concentration, a CUSUM-detectable
  behavioral change point) instead of pure random noise. *Why:* otherwise
  the Hypothesis Engine and Emergent Pattern Detector would have nothing
  real to find, and the demo would silently rely on you not checking.
- **Used a new storage key (`leados-ptv:v1`).** *Why:* this workspace began
  from the default scaffold `App.tsx` with no prior LeadOS state — claiming
  continuity with any other session's key would assert a shared history
  that doesn't exist here.
- **Did not implement a command palette, voice input, or the brief's
  keyboard map.** *Why:* out of scope per the gap above; left out rather
  than stubbed, so no unimplemented control is visible to click.
