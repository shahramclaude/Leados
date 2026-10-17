# AI Session Log

## Session: pt-M, Part 1 — Inference Chain Engine

### 0. Environment note
This sandbox (the one these tools operate on) began as the **default
React+Vite+Tailwind scaffold** — `src/App.tsx` was the stock placeholder,
there was no `README.md`, no `AI-SESSION-LOG.md`, and no `src/lib`. It is
**not** a checkout of `github.com/wbweve/Leados`; it is a separate task
environment. Any continuity with that repo's history is therefore a
*narrative* choice (continuing the "pt-" naming and the brief's own rule
IDs), not a shared filesystem, shared build, or shared commit history.

### 1. What was actually checked against `github.com/wbweve/Leados`, this session

All of the following were fetched live this session (GitHub REST API for
the file tree + `contents` endpoints, `raw.githubusercontent.com` for file
bodies) before any code was written here:

| Fetched | Result |
|---|---|
| Git tree (recursive) | Repo root has **two deliveries**: ~60 loose files at repo root (`App.tsx`, `Catalog.tsx`, `FinanceDashboard.tsx`, `Heatmap.tsx`, `LineChart.tsx`, `RosterView.tsx`, `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`, `README.md`, etc. — an older/larger build) **plus** a live `src/` Vite+React+TypeScript app. |
| `src/App.tsx` | Real. Composes `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`, `RiskView`, `AboutView` behind a hash router, reading state via `loadState()`. |
| `src/lib` directory listing | Contains `a11y.ts`, `aesthetics.ts`, `casEngine.ts`, `circadian.ts`, `core.ts`, `cssolver.ts`, `engine.ts`, `familiarity.ts`, `fatigue.ts`, `genome.ts`, `health.ts`, `intelligence.ts`, `physics.ts`, and more. |
| `src/components` directory listing | Contains `AboutView.tsx`, `AccessibilityView.tsx`, `AestheticsView.tsx`, `CasView.tsx`, `CommandPalette.tsx`, `DecisionsView.tsx`, `DomainsView.tsx`, `EnergyView.tsx`, `EventLogView.tsx`, and more. |
| `src/lib/core.ts` (full body) | Real, working projection layer: `DOMAINS`, `loadState`/`saveState` (key `leados-pt-j:data`), `project(state)` returning `{findings, domainScores, decisions, synthesisCount}`. Its own header comment discloses that only a handful of constants (`DECAY`, `CORRELATION_WINDOW_DAYS`, `DECISION_MAX_OPEN_DAYS`, the storage key) were copied from a prior verification pass against the real repo's root `index.html`; the rest is that earlier session's fresh TypeScript, not a line-by-line port. |
| `src/lib/intelligence.ts` (full body) | **Imports `{ engine, run }` from `./core`.** The real `core.ts` (above) exports neither `engine` nor any function named `run`. This is a directly confirmed broken import — verified by reading both files' full text, not inferred from prose. |
| `src/lib/physics.ts` (full body) | Also imports `{ DECAY, engine, run }` from `./core`, same broken dependency. Its own header comment says it was "ported... from `orgPhysics.ts`," itself labeled by a still-earlier session as "implemented from the pasted brief," i.e. disclosed fabrication layered on disclosed fabrication. |
| Root `README.md` (full body) | Independently states the same conclusion (`core.ts`/`intelligence.ts`/`physics.ts` mismatch), and additionally claims that no CAS engine, risk register, or the pasted task's "58/62-file," "144-rule," `T_L_*`/`G_L_*` test-suite history was found anywhere in the repo. **That additional claim is reported here as README-reported, not independently re-walked file-by-file this session** — the full ~88-file enumeration was not repeated. |

### 2. A finding worth flagging on its own: the repo's self-documentation disagrees with itself

`src/lib/intelligence.ts`'s own in-file disclosure comment (written by
whichever session authored it) says it searched "the real wbweve/Leados
repo this session (full recursive file tree, **88 files**, fetched and
enumerated)" and frames `core.ts`/`physics.ts` as working dependencies it
builds on top of — it does not flag the broken `{ engine, run }` import
itself. The top-level `README.md`, fetched the same session, *does* flag
exactly that break. Both documents live in the same repo. They cannot both
be the last word on its state. This session does not attempt to adjudicate
which prior session was "right" — it only reports that the repo's internal
provenance trail is not self-consistent, which matters more than any single
claim inside it.

**Practical conclusion for this delivery:** nothing from `src/lib/core.ts`,
`intelligence.ts`, or `physics.ts` was reused here. Their data model
(`Projection`, `P.state.events`, `engine.iso()`, `engine._days()`) does not
exist in a working form anywhere confirmed this session, and the pasted
pt-M brief's own pseudocode assumes that same unverified shape
(`LEADOS.engine._days`, `P.state.events`). Reusing it would have meant
building on top of a dependency that does not resolve.

### 3. What this session built instead

A **minimal, self-contained, original** data model and inference engine,
written fresh for this task's own sandbox:

- `src/lib/types.ts` — `Rule`, `Finding`, `AppState`, forward/backward
  pattern types.
- `src/lib/rules.ts` — 17-rule catalog. Rule IDs (R1, R3, R7, R10, R19,
  R20, R38, R68, R73, R74, R79, R81, R87, R104, R109, R128, R133) are
  reused from the pasted brief so its named scenarios are explorable; the
  catalog itself, severities, and descriptions are original.
- `src/lib/engine.ts` — Signal Board → `Finding[]` projection, plus the one
  metric (`crisisCount`) the brief's patterns reference.
- `src/lib/inference.ts` — direct TypeScript implementation of the brief's
  `INFERENCE_PATTERNS` (INF-001..INF-005): `forwardChain()`,
  `backwardChain()` (abductive, scored by evidence-for minus half
  evidence-against), and `computeDepartureCascade()` (temporal, mirrors the
  brief's `compute()` for INF-005 against a user-editable attrition date
  log).
- `src/lib/selfTest.ts` — 8 original tests (`ST-001`..`ST-008`) pinning
  down edge cases: INF-001's R1≥2 threshold (not ≥1), INF-003's
  independent `crisisCount` gate, the backward chain's hypothesis ranking,
  and the departure-cascade math on fixed date fixtures. New IDs, not a
  reproduction of the pasted brief's unverified `T_L_*`/`G_L_*` suite.
- `src/lib/store.ts` — localStorage persistence under a **new** key
  (`leados-ptm:v1`), a demo preset that fires all three forward patterns at
  once, and a deterministic synthetic attrition-history seeder for the
  temporal pattern.
- `src/components/Shell.tsx`, `src/components/Views.tsx`, `src/App.tsx` —
  hash-routed UI: Today, Signal Board, Inference Engine, About/Provenance.

### 4. Explicit scope cut

The pasted brief's introduction frames pt-M as a full **autonomous** layer
(continuous reasoning without being asked, bounded autonomous action,
self-maintenance, learning from outcomes, one-click-approvable work
products). Only "Part 1: The Inference Chain Engine" was provided with a
complete, implementable specification in this message. No autonomous
action loop, maintenance routine, learning/retraining loop, or
work-product generator is implemented — building any of those now would be
inventing unspecified behavior under the pt-M name. The in-app About page
and this log both say so.

### 5. Verification performed this session (self-check on this delivery, not the external repo)

- `npm run build` succeeds (Vite + `vite-plugin-singlefile`; output
  inlines JS/CSS into one `dist/index.html`, consistent with the project's
  existing config — not a claim invented for this delivery).
- `runSelfTests()` (ST-001..ST-008) exercises the forward chain's threshold
  and metric-gating logic, the backward chain's hypothesis selection, and
  the departure-cascade math; runnable from the Today view at any time.
