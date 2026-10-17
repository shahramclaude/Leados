# LEADOS — Organizational Physics Engine (sandbox build, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was fetched and read directly
> this session — GitHub Trees API for the file list, plus raw fetches of `package.json`, `README.md`,
> `store.js`, and `engine.js` — before any code here was written. Full method, exact raw findings, and
> everything explicitly **not** found or **not** re-verified are in `AI-SESSION-LOG.md`. This delivery is a
> fresh, self-contained implementation of the two pasted briefs — **Part 1, "Temporal Velocity
> Measurement"** and **Part 2, "Organizational Physics Engine"** — built inside *this sandbox's* required
> React + Vite + Tailwind architecture, which is a different environment than the real repo's accumulating
> single-file demos (see the log for why those two things are not the same project).

## Run it

This sandbox's rules are different from the real repo's "open `index.html`" convention, and that
difference is disclosed, not glossed over:

- **Dev:** `npm run dev` (hot-reloading React app, entry at `src/App.tsx`).
- **Production artifact:** `npm run build` → `dist/index.html`. This sandbox already ships
  `vite-plugin-singlefile` in `vite.config.ts` (confirmed by reading that file directly, not assumed), so
  the build output is one self-contained HTML file with JS/CSS inlined — the same end shape as the real
  repo's single-file convention, just produced by a build step instead of hand-authored.
- The root `index.html` you can read in this project **is not** the full application — it is Vite's
  minimal mount file (`<div id="root">` + a `<script type="module" src="/src/main.tsx">`). The real
  application code lives in `src/App.tsx` and `src/lib/*.ts` / `src/components/*.tsx`, per this platform's
  own non-negotiable ("replace the `App` component in `src/App.tsx`; do not edit `vite.config.ts` or
  `package.json` directly"). This is a disclosed structural difference from the real repo's single-file
  habit, not a silent one.
- All state lives in exactly one `localStorage` key: `leados-orgphysics-sandbox:data` — deliberately
  distinct from the real repo's verified `leados:data` and from every prior pt-letter demo key named in its
  own history, so this build can never collide with any of them on the same origin.

## Files in this delivery

| File | Role |
| --- | --- |
| `src/App.tsx` | Entry point. Loads/seeds the event log, projects it, hash-routes between five views. |
| `src/lib/types.ts` | Shared types: `LeadosEvent`, `Person`, `Goal`, `Decision`, `Commitment`, `Finding`, `Projection`. |
| `src/lib/store.ts` | `LEADOS.store` — append-only localStorage event log. One write path for "now" events; a separate, clearly-marked path for seed backdating. |
| `src/lib/engine.ts` | `LEADOS.engine` — `project(events)` folds the log into read state; `run(P, today)` derives findings. |
| `src/lib/velocity.ts` | Part 1 — `heatmap`, `domainMath`, `measureVelocity`. |
| `src/lib/orgPhysics.ts` | Part 2 — `computeChangePhysics`, `measureOrgEntropy`, `computeLeadershipEnergyBudget`, `measureResonance`. |
| `src/lib/seed.ts` | Hand-placed, disclosed-fabricated seed event log (people, goals, decisions, commitments, pipelines, domain signals). |
| `src/lib/health.ts` | 8 live, non-destructive self-checks, surfaced at `#/health`. |
| `src/components/*.tsx` | Shell/nav, the velocity widget, and the five views (Today, Intelligence, Data, Health, About). |
| `AI-SESSION-LOG.md` | Append-only record of exactly what was fetched and read from the real repo this session, and what was not. |
| `README.md` | This file. |

## What's implemented

### Part 1 — Temporal Velocity Measurement

- `heatmap(P, asOf)` / `domainMath(domain, P, asOf)`: each of 5 domains (`people, finance, ops, strategy,
  legal`) scores 0–10 as a decay-weighted sum of that domain's `signal.raised` events, clamped to `[0,10]`.
  Decay constant **0.85** is the real repo's own verified `heatmapDecayFactor` (see log) — reused on
  purpose, not invented.
- `measureVelocity(domain, P, today, lookbackDays=30)`: re-scores the same domain 30 days earlier and
  reports `velocity` (score points/day), a `WORSENING / IMPROVING / STABLE` direction, and a labeled linear
  `projectedIn30d`. **The dashboard surfaces direction and rate, not just current state** — the
  Intelligence view's alarm banner is driven by whichever domain has the *highest velocity*, not the
  highest score, by design.
- The seeded `legal` domain is tuned so this plays out exactly as described in this task's own prompt: a
  medium current score with an accelerating trend. Live in this build it computes to **score ≈5.2,
  velocity ≈+0.069/d (shown rounded as "+0.070/d" in the illustrative framing), 30-day projection ≈7.3** —
  independently recomputed in Node during this session (see `AI-SESSION-LOG.md` for the exact numbers).
  Every card has a "Show score math" expander that prints the exact per-event arithmetic live — nothing is
  hard-coded to produce those numbers, and because they're computed from `Date.now()`, they drift slightly
  day to day. That drift is disclosed in the UI, not hidden behind a frozen snapshot.

### Part 2 — Organizational Physics Engine

All four laws from the pasted brief, implemented against this build's own `Projection` shape (the brief's
`P.peopleById` / `P.lines.broken` / `P.openGoals` / `P.decisionById` / `P.openDecisions` / `P.state.events`
/ `LEADOS.engine._days` / `LEADOS.engine.run` are not literal names found in the real repo — see log — so
this delivery defines them itself):

- **Law 1, Inertia — `computeChangePhysics`.** Interactive calculator on `#/intelligence`: pick affected
  people and a process count, get `mass`, `weeksToEmbed`, and the brief's own `confidence: 'low'` /
  planning-heuristic label, verbatim.
- **Law 2, Entropy — `measureOrgEntropy`.** Structural (broken reporting lines), goal (ownerless + silent),
  decision (unresolved share), and information (blocked pipelines) indicators, averaged into a composite
  0–100 with the brief's own LOW/MEDIUM/HIGH/CRITICAL bands.
- **Law 3, Energy Conservation — `computeLeadershipEnergyBudget`.** Sources = wins × 3 + positive culture
  signals × 1 (30d window); drains = active sev≥4 findings × 2 + overdue commitments × 1.5 + blocked
  pipelines × 1 (30d window); balance and the brief's own assessment bands.
- **Law 4, Resonance — `measureResonance` + Resonance Dashboard.** First-half-vs-second-half weekly
  frequency per event type, `AMPLIFYING / FADING / STABLE`, "insufficient data" below 6 events. The seeded
  log deliberately demonstrates all three outcomes plus the insufficient-data case (`goal.progress`
  amplifying, `commitment.made` fading, `culture.signal` and `info.pipeline.check` stable,
  `decision.logged` / `conflict.resolved` insufficient) — verified by independently re-running the
  first/second-half math in Node during this session.

### `#/health` — live, non-destructive self-checks

Store round-trip, append-only immutability (proven on throwaway keys, never the live store), heatmap score
bounds, independently-re-derived velocity arithmetic, projection purity/determinism, seed-event marking,
the 0.85 decay constant's value, and finding-severity range.

## Verified vs. fabricated, at a glance

*(Full detail and raw fetch results: `AI-SESSION-LOG.md`. Same table is rendered live at `#/about`.)*

| Claim | Status |
| --- | --- |
| `github.com/wbweve/Leados` exists; root is a React 19 + Vite 7 + Tailwind 4 project with `vite-plugin-singlefile` | ✅ verified this session (raw fetch of `package.json`) |
| A separate vanilla `store.js` (key `leados:data`, schema v5) and `engine.js` (`project()`, per-module folds) exist at repo root | ✅ verified this session (raw fetch of both files, in full / near-full) |
| `heatmapDecayFactor: 0.85`, `correlationWindowDays: 90`, `decisionMaxOpenDays: 21` are real settings there | ✅ verified this session (read directly from `store.js`) — reused here as `DECAY`, the correlation window, and the decision-staleness gate |
| `engine.js` contains a decay-weighted per-domain severity rollup concept (`sev * decay^ageDays`) | ✅ verified this session (fragment independently located in the fetched source) |
| A function literally named `LEADOS.correlate.heatmap` / `LEADOS.correlate.measureVelocity`, or a `P.state.events` shape, exists in the real repo | ⚠️ **not found** this session — this build's `velocity.ts` / `orgPhysics.ts` are fresh code, not recovered from the real engine |
| `LEADOS.orgPhysics` (the four laws) exists in the real repo | ⚠️ **not found** this session — implemented fresh per the pasted brief |
| This sandbox's 5 domains, seeded people/goals/decisions/commitments/pipelines, and the LEGAL domain's calibrated trajectory | ⚠️ **fabricated**, disclosed in `src/lib/seed.ts` and above |
| `rules.js`'s exact tombstone text; full contents of `Heatmap.tsx` / `DomainViews.tsx` / `store.ts` | ⚠️ **not re-verified this session** — carried over from a prior session's claim, not re-fetched here |

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-orgphysics-sandbox:data`.
- The event log is append-only: `store.append()` always stamps real "now"; only `store.appendAt()` — used
  exclusively by the one-time seed path — may backdate, and every event it writes is marked
  `meta.seeded: true` (checked live by `#/health`'s T6).
- Nothing derived is ever persisted: `project()` and every Part 1/Part 2 function recompute from the raw
  event list on every call — proven live by `#/health`'s T5 (projection purity).
- Every heatmap score and every velocity number shows its exact arithmetic in an expandable "Show score
  math" panel.
- `#/health` runs live, non-destructive checks in the browser and is the authority if it ever disagrees
  with this document.

---

## Changelog (this delivery)

| Change | Why |
| --- | --- |
| Verified the real repo via GitHub Trees API + raw fetches of `package.json`, `README.md`, `store.js`, `engine.js` before writing any app code | The task requires inspecting actual code before claiming anything about it. |
| Disclosed that `LEADOS.correlate.heatmap` / `P.state.events` / `LEADOS.orgPhysics` as named in the pasted briefs were not found anywhere in the real repo's fetched source | Reporting "not found" honestly is better than assuming the pasted brief is a verbatim quote of real code. |
| Reused the real repo's verified `heatmapDecayFactor: 0.85`, `correlationWindowDays: 90`, and `decisionMaxOpenDays: 21` as this build's own constants | Ties the fresh implementation back to concrete verified facts instead of inventing arbitrary numbers. |
| Built a fresh `Projection` shape (`people/peopleById/lines.broken/openGoals/decisionById/openDecisions/state.events`) rather than guessing at the real engine's actual entity shapes | The real shapes are per-module and domain-specific (`finRisks`, `legalRisks`, `deals`, …); the brief's generic `P` needed a concrete, documented definition to be runnable at all. |
| Implemented the app as a React + Vite + Tailwind project under `src/App.tsx`, not a single hand-authored `index.html` | This sandbox's own platform rules require it (`App.tsx` is the entry point; `vite.config.ts`/`package.json` must not be hand-edited) — a disclosed, structural departure from the real repo's single-file habit, not a silent one. |
| Hand-calibrated the LEGAL domain's 6 seed events so current score / velocity / 30-day projection land close to this task's own illustrative numbers (≈5.2, ≈+0.070/d, ≈7.3) | Makes the "surfaces direction and rate, not just state" claim concretely checkable against the prompt's own example, with the arithmetic shown live rather than hard-coded. |
| Made the Intelligence view's alarm banner trigger on **highest velocity**, not highest score | Directly implements the brief's thesis ("not the current score … but the velocity") as an actual UI decision, not just a sentence in a dashboard. |
| Built a small custom hash router instead of installing `react-router-dom` | Keeps the dependency surface identical to the sandbox's starting `package.json`, matching the real repo's own minimal-dependency instinct (verified: only `clsx`/`react`/`react-dom`/`tailwind-merge`). |
| Added `signal.resolved` as an event type so domain findings can be explicitly closed out, instead of every historical signal counting as "active" forever | The brief's energy-budget law needs a notion of "currently active" sev≥4 finding; an unbounded log of all-time signals would never stop draining energy. |
| Gated domain findings to the verified 90-day `correlationWindowDays` instead of all-time | Reuses a verified real-repo constant for a purpose (bounding "currently relevant") consistent with its own documented intent ("prices recency"). |
| Added `#/health` with 8 live, non-destructive checks, including one that independently re-derives velocity arithmetic and diffs it against the function's own output | Mirrors the real repo's own verified "nothing claimed without being checkable" discipline (its `store.js`/`engine.js` comments reference test suites like `T18`/`T42`/`G4`/`G7`/`G10`/`G32`) without reusing any of its actual test code, which was not fetched this session. |
| Added an in-app `#/about` view duplicating the verified/fabricated ledger | So the disclosure travels with the running app, not only with the delivery documents. |
