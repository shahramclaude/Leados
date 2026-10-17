# Leados Sandbox — Inference, Autonomous Monitoring & Leadership Science

A React + Vite + Tailwind app implementing ten requested leadership-intelligence
modules — inference, autonomous monitoring, leadership science, rule
calibration, response protocols, decision trees, docs export, institutional
memory, self-improvement, and onboarding — over one shared, toggleable
**Signal Board** of 144 synthetic rule IDs across 8 categories.

> **Provenance — read before assuming this continues any other session or repo:**
> `github.com/wbweve/Leados` was fetched and read directly this session (its
> README, via GitHub). It is a **different codebase**: a Thermodynamics / CAS
> engine / Risk Register app, not the inference/autonomous/leadership-science
> stack requested here. Its own README already documents that a prior
> "58/62-file, 144-rule, T_L_*/G_L_* test suite" brief could **not** be
> verified anywhere in that repo and was treated as an unverified external
> spec, not fact.
>
> This workspace is a **separate, fresh sandbox**: it started from the default
> Vite/React/Tailwind scaffold (verified by reading `src/App.tsx` before
> writing any code — it was the placeholder "Ready to build" screen). There is
> no `js/` directory, no prior rule catalog, and no prior file count in this
> workspace's history.
>
> The task prompt's closing line — *"Total files: 72. Total rules: 144. The
> contract holds."* — describes a state this sandbox did not have. Per the
> same standard the external repo applied to its own pasted briefs, that line
> is treated here as an **unverified claim about a different session**, not as
> a build spec to silently reproduce. What's independently true of **this**
> delivery, and how to check it, is in `AI-SESSION-LOG.md` and in-app at
> **About / Provenance**. Short version: **144 rules — true, and asserted by a
> runtime self-test. 72 files — not reproduced; this delivery uses ~35 source
> files**, because a Vite/TypeScript app wires features together as imported
> modules, and padding to a specific file count with code nothing imports is
> the exact "orphaned file" problem the external repo's own README flagged in
> its `core.ts`/`intelligence.ts`.

## Run it

`npm install && npm run build`, then open `dist/index.html`. The Vite config
(`vite-plugin-singlefile`, already present in this scaffold) inlines all JS/CSS
into that one file — verified by grepping the build output for external URLs:
none found beyond inert XML/SVG namespace strings and a baked-in React error
docs link in minified error text. Zero runtime network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-sandbox:v2`. Use **Reset synthetic
data** (Today view) to clear it.

## Pages (hash routes)

| Route                  | Module                        | What it does |
| ----------------------| ------------------------------ | ------------ |
| `#/today`              | —                               | Overview: active findings, active signal count, runway slider, self-test pass count, reset. |
| `#/signals`            | —                               | The Signal Board: 144 rules across 8 categories, toggle + severity + person link + recurrence counter. |
| `#/inference`          | `inference.ts`                  | Forward-chaining engine: active signals → one finding per category, plus a cross-category "overload + eroding trust" amplification. |
| `#/autonomous`         | `autonomous.ts`                 | Starts/stops a client-side timer that re-runs inference every 5s and logs new/escalated findings per tick. |
| `#/leadership-science` | `leadershipScience.ts`          | Tuckman-stage estimate, psychological-safety risk index, span-of-control table, Dunbar load tier — all disclosed as original heuristics named after public concepts, not validated instruments. |
| `#/protocol`           | `protocol.ts`                   | Response playbook lookup by category + severity. |
| `#/decision-trees`     | `decisionTrees.ts`              | Interactive yes/no decision tree per category, ending in a concrete recommendation. |
| `#/memory`             | `institutionalMemory.ts`        | Persisted incident log + similarity matching against current findings. |
| `#/self-improve`       | `selfImprove.ts`, `calibrateRules.ts` | Confirm/false-positive voting on triggered rules; calibration weight + recalibration suggestions. |
| `#/docs`               | `docs.ts`                       | Exports the current session as Markdown or JSON, downloadable, no network call. |
| `#/onboarding`         | `onboarding.ts`                 | 4-step baseline wizard (team size, manager span, team age, runway) feeding Leadership Science. |
| `#/about`              | —                                | Full provenance ledger + a live, re-runnable self-test panel. |

## Module name mapping (requested `js/*.js` → actual files in this project)

This is a TypeScript/Vite project with a single `src/App.tsx` entry point, not
a plain-script site, so the ten requested modules are implemented as
`src/lib/*.ts` files — each one's file header states its requested `js/*.js`
name explicitly, and each is actually `import`ed by a view component (verified
by `npm run build` succeeding and by the self-test suite exercising each
module's exported functions):

```
js/inference.js             -> src/lib/inference.ts
js/autonomous.js            -> src/lib/autonomous.ts
js/leadership_science.js    -> src/lib/leadershipScience.ts
js/calibrate_rules.js       -> src/lib/calibrateRules.ts
js/protocol.js              -> src/lib/protocol.ts
js/decision_trees.js        -> src/lib/decisionTrees.ts
js/docs.js                  -> src/lib/docs.ts
js/institutional_memory.js  -> src/lib/institutionalMemory.ts
js/selfImprove.js           -> src/lib/selfImprove.ts
js/onboarding.js            -> src/lib/onboarding.ts
```

## Project structure

```
src/
  lib/
    types.ts               — shared types (Category, Rule, Finding, AppState, ...)
    rules.ts                — 144-rule catalog, 8 categories x 18 (original, deterministic generator + 6 anchor rules)
    seed.ts                   — synthetic 12-person roster (seeded LCG, no Math.random)
    store.ts                   — localStorage persistence + state mutations
    AppContext.tsx               — React context wrapping store.ts for all views
    inference.ts                  — Signal Board -> Finding[] forward-chaining engine
    autonomous.ts                  — client-timer monitor loop over inference.ts
    leadershipScience.ts             — Tuckman/psych-safety/span-of-control/Dunbar heuristics
    calibrateRules.ts                 — feedback -> per-rule calibration weight (EMA)
    protocol.ts                        — category+severity -> response playbook
    decisionTrees.ts                    — yes/no decision trees per category
    docs.ts                              — Markdown/JSON export + file download
    institutionalMemory.ts                — incident log + similarity search
    selfImprove.ts                         — feedback-loop summary over calibrateRules + memory
    onboarding.ts                           — 4-step baseline wizard data/validation
    selfTest.ts                              — original runtime self-tests (11 checks)
    useHashRoute.ts                           — tiny hash router
  components/
    Shell.tsx, ui.tsx                         — nav shell + shared UI primitives
  views/
    TodayView, SignalBoardView, InferenceView, AutonomousView,
    LeadershipScienceView, ProtocolView, DecisionTreesView, MemoryView,
    SelfImproveView, DocsView, OnboardingView, AboutView
  App.tsx                                      — route composition (entry point)
```

## What's verified, what's original, what's a disclosed approximation

* **Verified this session, about the external repo:** `github.com/wbweve/Leados`'s
  own README (fetched via `web_fetch`) states its info-theory layer is real
  and wired in, its CAS/risk-register layer and a "pt-L" 58/62-file/144-rule
  brief were not found anywhere in that repo, and six specific rule IDs
  (R1/R4/R7/R17/R73/R88) were reused there only as scenario anchors inside an
  otherwise original 50-rule catalog.
* **Original to this delivery:** the entire 144-rule catalog and its 6 anchor
  rules (`R1`/`R2` burnout-loop, `R19` velocity-death-spiral, `R37`
  austerity-trap, `R55`/`R56` trust-collapse — renumbered from the external
  repo's R1/R4/R7/R17/R73/R88 so the IDs fit this catalog's own deterministic
  per-category numbering without collisions), all ten requested modules, the
  roster/event generator, the self-test suite, and all UI.
* **Modeled on public, named concepts but not a validated instrument:**
  `leadershipScience.ts`'s Tuckman-stage/psychological-safety/span-of-control/
  Dunbar functions. Disclosed in the file header and in-app.
  "5-9 direct reports is healthy span of control" and "Dunbar layers at
  ~5/15/50/150" are widely cited rules of thumb, not pinned to one verified
  source here.
* **A disclosed limitation, not a hidden one:** the "autonomous" monitor is a
  browser `setInterval` loop that runs only while its page is mounted and the
  tab is open — not a background/server process.

## Changelog

* **Fetched and read `github.com/wbweve/Leados`'s README before writing any
  code** — _why_: the task requires inspecting actual code/claims before
  trusting them, and the prompt's "Total files: 72. Total rules: 144. The
  contract holds." line reads exactly like the kind of pasted-brief claim that
  repo's own README already teaches not to accept at face value.
* **Confirmed this sandbox started from the default scaffold, with no `js/`
  directory and no prior Leados state, before building anything** — _why_:
  establishes the actual starting point so the delivery's changelog doesn't
  imply false continuity with another session.
* **Implemented all ten requested modules as real, imported `src/lib/*.ts`
  files instead of inert `js/*.js` files** — _why_: this environment's entry
  point is `src/App.tsx` in a TypeScript/Vite project; dropping plain `.js`
  files next to it would leave them unimported dead code, the same failure
  mode flagged in the external repo's own `core.ts`/`intelligence.ts`.
* **Generated the 144-rule catalog deterministically from phrase banks (8
  categories × 18 rules) instead of hand-writing 144 one-off strings or using
  `Math.random()`** — _why_: keeps every rule inspectable and reproducible in
  source, and makes the "144" claim independently checkable by a unit test
  rather than asserted by comment.
* **Caught and fixed a real calibration bug via direct execution, not
  inspection alone**: an EMA-based calibration test (`CALIBRATE-001/002`)
  initially failed because 3 "confirmed" votes only reached weight 0.829
  against an 0.85 escalation threshold — fixed by using 4 votes in the test
  (weight 0.880) rather than loosening the threshold, since 0.85 was the
  deliberate "needs sustained confirmation" bar — _why disclosed_: this is the
  concrete evidence that modules here were actually run (via `npx tsx`), not
  just read for plausibility.
* **Renumbered the six "anchor" rule IDs to `R1/R2/R19/R37/R55/R56`** instead
  of reusing the external repo's `R1/R4/R7/R17/R73/R88` verbatim — _why_: this
  catalog's ID space is sequential per-category (`CATEGORIES` order ×
  `RULES_PER_CATEGORY=18`), so those exact numbers don't fall inside the
  categories they'd need to anchor; reusing them as strings without fixing the
  numbering would have produced ID collisions (caught by `RULES-003` before
  shipping).
* **Used a new `localStorage` key (`leados-sandbox:v2`)** — _why_: no prior
  session's key exists in this workspace to be compatible with; `v2` (not
  `v1`) leaves room to distinguish this schema (which adds onboarding,
  feedback, incidents, autonomous log) from any earlier scaffold state without
  a silent migration.
* **Left out Thermodynamics/CAS/Risk-Register pages from the external repo**
  — _why_: those belong to a different codebase (`github.com/wbweve/Leados`'s
  own `src/`), not to this task's ten requested modules; including them here
  would misstate which app they came from.
