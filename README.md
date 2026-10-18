# LeadOS Sandbox — Leadership Risk & Health Dashboard

A small, **original** React + Vite + Tailwind app: a local-only leadership
dashboard that tracks 1:1 cadence, feedback, decisions, goals, vendor
renewals, and three synthetic business metrics, and turns them into a live
risk register across 6 domains (People, Finance, Ops, Strategy, Legal,
Product).

> **Provenance, read first:** this build was produced after directly
> inspecting `github.com/wbweve/Leados` via the GitHub REST API and raw file
> fetches (not by trusting its rendered README or the task's own pasted
> "pt-R implementation summary"). Full ledger below and in-app at
> **Provenance** (`#/about`). Short version: **that repo is real, but it is
> being overwritten every few minutes and currently contains three
> incompatible, overlapping deliveries in one tree. The specific "pt-R"
> claims pasted into this task (89 files, `js/attention.js`,
> `js/layout_engine.js`, rules R176–R185, etc.) do not exist anywhere in it**
> — verified by full recursive tree listing, not assumed. This app does not
> continue or copy that unverified history; it's a fresh, honestly-scoped
> build.

## Run it

```
npm install
npm run build   # outputs dist/index.html — everything inlined, zero runtime network calls
npm run dev     # local development
```

State lives in `localStorage` under `leados-honest-build:v1`. Use **Data →
Reset to seed data / Wipe localStorage** to clear it.

## Pages (hash routes)

| Route         | What it does |
|---------------|--------------|
| `#/today`     | Overall score, per-domain score cards, most-overdue findings, scenario presets (all clear / busy quarter / crisis). |
| `#/roster`    | People list: log 1:1s, log feedback, add/remove people; shows each person's active findings inline. |
| `#/workspace` | Decisions (mark validated/reversed), goals (assign owner, touch), vendor renewals (log response), and sliders for the 3 synthetic metrics. |
| `#/risk`      | The 6-domain Risk Register (always shows all 6, even at zero) plus cross-domain amplification findings. |
| `#/health`    | Runs 6 original self-tests live, in the browser, against the real rule-engine functions. |
| `#/data`      | Export/import JSON, reset/wipe, and a read-only raw-state viewer. |
| `#/about`     | Full provenance ledger — what was checked in the real repo, what was found, and how this build relates to the pasted "pt-R" brief. |

## Verification ledger — what was actually checked in `github.com/wbweve/Leados`

This session fetched, directly:

1. `GET https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1`
   — **verified**: 148 entries, `truncated: false`. The tree contains three
   overlapping deliveries: a flat vanilla-JS app at the repo root
   (`index.html`, `app.css`, `engine.js`, `events.js`, `health.js`,
   `playbooks.js`, `store.js`, `ui.js`, `rules.js`), ~50 additional loose
   root-level `.tsx`/`.ts` files (a second `App.tsx`, dashboards like
   `FinanceDashboard.tsx`/`MaintenanceView.tsx`, chart primitives like
   `LineChart.tsx`/`Heatmap.tsx`/`Network.tsx`), and a properly-nested
   `src/` Vite+React+TypeScript app (`src/App.tsx`, `src/main.tsx`,
   23 files under `src/components/`, 26 files under `src/lib/`).
2. `GET https://api.github.com/repos/wbweve/Leados/commits?per_page=5`
   — **verified**: 5 commits in roughly one hour, all titled "Add files via
   upload" by the same author. This repo is being repeatedly, wholesale
   overwritten, not incrementally edited — any "current state" claim about it
   is only true for the moment it was fetched.
3. `GET raw.githubusercontent.com/.../main/README.md` — **verified** fetched
   in full. Describes only the `src/` app, and explicitly disclaims
   continuity with any prior "pt-K"/"pt-L" pasted brief. Its own described
   file list (10 `src/lib` files, 8 `src/components` files) **does not
   match** the actual tree fetched in step 1 (26 and 23 files respectively)
   — i.e. the repo's own README is already stale against its own current
   tree, independent of anything this task pasted.
4. `GET raw.githubusercontent.com/.../main/index.html` — **verified**: a Vite
   dev-shell HTML file (`<script type="module" src="/src/main.tsx">`),
   requiring a build step — which contradicts a separately-surfaced
   description of this same repo as a hand-authored, zero-build-step,
   "open index.html, that is the install" vanilla-JS app. Both descriptions
   trace to real content that has existed in this repo at different moments;
   neither is "the" repo, because the repo does not hold still.
5. `GET raw.githubusercontent.com/.../main/src/lib/core.ts` and
   `.../src/lib/intelligence.ts` — **verified** fetched in full.
   `intelligence.ts` imports `{ engine, run }` from `./core`; `core.ts`, as
   fetched, does not export anything named `engine` or `run`. This specific
   broken-import claim (made by an earlier generation's own session log) was
   independently reproduced by inspection, not taken on faith.
6. `GET raw.githubusercontent.com/.../main/AI-SESSION-LOG.md` (partial) —
   **verified** fetched. Documents yet another prior session's own
   verification pass, with its own (different again) claims about
   `src/App.tsx`'s imports. Those specific claims were **not** independently
   re-checked against `src/App.tsx` this session (only the duplicate,
   root-level `App.tsx` was fetched) — flagged here as **unverified by this
   session**, not asserted as fact.
7. The task prompt's own pasted **"pt-R implementation summary"** (89 files,
   `js/attention.js`, `js/layout_engine.js`, `js/proactive.js`,
   `js/command_intel.js`, `js/notifications.js`, `js/health_score.js`, rules
   R176–R185, tests T_R_1…T_R_10) — **checked against all of the above and
   not found anywhere**. Treated as an unverified narrative pasted into the
   task, not as repo fact, and not continued by this build.

## What's original vs. modeled vs. a disclosed gap

- **100% original to this delivery:** every file under `src/`. No file was
  copied from `wbweve/Leados`; the storage key (`leados-honest-build:v1`),
  rule catalog (11 rules), domain list, and self-test suite (6 tests) are
  all new, not ported.
- **Modeled on a widely-used, not-repo-specific pattern:** "recompute
  findings/scores live from state on every render, store nothing derived"
  and "decay a severity weight by age in days" are common, sensible designs
  for small local-state tools — used here as independent engineering
  choices, not because they were copied from a specific inspected file.
- **Disclosed gap:** this build intentionally does **not** attempt an
  "89-file" / "175-rule" scope to match the pasted pt-R brief. Inflating
  scope to match an unverified external narrative would itself be a false
  claim about what was built.

## Project structure

```
src/
  lib/
    types.ts       — shared types (Domain, Severity, Finding, AppState, ...)
    store.ts        — localStorage persistence + 3 seed scenarios (clear/seed/crisis)
    engine.ts         — 11-rule catalog + live projection (findings → domain scores)
    selfTest.ts         — 6 original self-tests, run against the real engine functions
  components/
    Shell.tsx            — nav rail + shared UI primitives (Card, Button, badges)
    TodayView.tsx          — overview + scenario presets
    RosterView.tsx           — people management
    WorkspaceView.tsx         — decisions / goals / vendors / metrics
    RiskView.tsx                — 6-domain risk register + amplification
    HealthView.tsx                — self-test runner
    DataView.tsx                   — export / import / reset / raw state
    ProvenanceView.tsx               — the verification ledger, in-app
  App.tsx                             — hash router, entry point
```

## The 11 rules

`R1` 1:1 overdue (strictly past cadence) · `R2` feedback gap (>30d or never)
· `R3` burnout risk — composite: R1 + recent negative feedback for the same
person (disclosed heuristic) · `R4` decision stale (review date passed, no
outcome) · `R5` goal ownerless · `R6` goal stale (quiet >21d) · `R7` vendor
renewal at risk (<14d out, no response) · `R8` budget overrun (>+10%) · `R9`
deploy frequency drop (<-25%) · `R10` churn uptick (>+15pp) · `R11` domain
concentration — meta-rule: ≥2 high/critical findings in one domain at once.

## Changelog

- **Inspected `github.com/wbweve/Leados` via GitHub's REST API and raw file
  fetches before writing any code** — *why*: the task requires checking
  actual code, not a README's self-description or the task's own pasted
  summary.
- **Found and disclosed that the repo is mid-flux and self-contradictory**
  (3 overlapping deliveries, 5 overwrite-commits in an hour, README stale
  against its own tree) — *why disclosed this way*: a repo that won't hold
  still can't be honestly summarized as one fixed state; saying so is more
  useful than picking whichever fetch looks most authoritative.
- **Declared the pasted "pt-R" summary unverified, not repo fact** — *why*:
  none of its named files, rule IDs, or test IDs matched the real,
  recursively-listed tree.
- **Built fresh in `src/App.tsx` (this environment's required entry point)
  instead of trying to reproduce any single-file hand-authored demo** —
  *why*: matches the actual tool environment; the build step (Vite +
  `vite-plugin-singlefile`) still inlines everything into one
  zero-network-call `dist/index.html`, so the end-user property survives.
- **Used a new, unused storage key** (`leados-honest-build:v1`) — *why*:
  claiming any other session's key would assert a shared history this build
  doesn't have.
- **Kept scope to 11 rules / 6 domains / 6 self-tests** instead of matching
  the pasted brief's escalating counts — *why*: matching an unverified
  number would itself become a false claim; this count is exactly what
  exists in `src/lib/engine.ts` and `src/lib/selfTest.ts`, checkable by
  reading those two files.
