# AI Session Log
## Part 1 — VANTA® studio site (rounds 0–6) — **discarded**
Built an animated React/Vite/Tailwind agency site over six rounds: preloader, kinetic
typography, horizontal case gallery with detail overlays, canvas gravity field, synthesized
Web Audio drone, brief composer, keyboard shortcuts.
**Outcome: rejected by the user and removed.** The brief changed to a vanilla-JS leadership
application. All 38 files from this phase (React components, lib, utils, generated imagery)
were deleted in Part 2. Retained here only as an accurate record.
---
## Part 2 — LeadCore (vanilla JS leadership OS)
### Brief
Production-grade leadership app for a new manager of managers. No framework, no paid APIs,
no OAuth, no credentials. Client-side only, localStorage. Every module maximally deep, all
tools interconnected, automatic propagation on case registration. No stubs, no placeholders.
### Positions taken against the brief (and held)
1. **"Trust the app 100% / sit back and relax" — refused as written.** An app that supplies
   judgement produces a leader who cannot operate when reality deviates, and manufactures
   legal exposure on HR matters. Implemented instead: the app owns 100% of bookkeeping,
   detection, sequencing and drafting; the human owns the call and the app *forces* it to be
   recorded with a rationale and a review date. That loop is what actually replaces a course.
2. **"More tools is better than enough" — satisfied differently.** Twenty disconnected
   widgets is worse than connected depth, because each one is another thing to remember to
   open. Resolved with a single case spine: one registration fans out into every module.
3. **localStorage risks named, not hidden.** ~5 MB, synchronous, unencrypted, single-device,
   silent quota failures. Answered with quota telemetry, versioned migrations, export/import
   as first-class, and plain-language warnings in the setup and data views.
### Build order
1. **Foundation** — `index.html` shell, `styles.css` design system (no framework),
   `core/dom.js` (escaping, dates, modal/toast, delegated action registry),
   `core/store.js` (normalised collections, schema v5 + migrations, quota telemetry,
   batch writes, activity log, export/import).
2. **Model library** — `core/frameworks.js`: 26 frameworks as pure functions returning
   score + band + reasoning + prescription. Includes the performance diagnosis that blocks
   coaching a system failure, and SL2 mismatch detection in both directions.
3. **Content library** — `core/content.js`: 15 case types with playbooks (goal, first move,
   dated steps, known pitfalls, models, script) and **routing rules**; 18 parameterised
   conversation scripts with guardrails; 15 lessons with drills and comprehension checks;
   6 two-round scored simulator scenarios; question banks; first-90-days plan.
4. **Engine + mentor** — `core/engine.js` (intake → classify → dispatch → write linked
   records in every routed module; derived metrics shared by all views; structured closure
   with verification task). `core/mentor.js` (20 detection rules, daily brief).
5. **Shell** — `main.js`: hash router with params, nav with live badges, load/quota
   telemetry, global case-intake modal, event delegation for click/submit/change, `C` shortcut.
6. **Views** — 14 modules: setup, today, inbox, cases, people, teams, 1:1s, feedback,
   delegation, decisions, performance, portfolio (goals/risks/meetings/stakeholders/comms),
   scripts, academy, self, data.
7. **Defects fixed before claiming completion** (found by reading my own code, not by the build):
   - `mentor.js` goals rule used a `globalThis` indirection that always returned null — the
     rule could never fire. Replaced with a direct import.
   - `academy.js` scenario runner queried only *incomplete* runs, so a finished scenario
     restarted at round 1 instead of showing the debrief. Now takes the latest run.
   - `engine.js` had an unused `link()` helper left from an earlier shape. Removed.
   - Dead `Math.random() > 1` branch in the learning rule. Removed.
8. **Cleanup** — deleted all 38 files from the discarded React phase.
### State
`npm run build` green: 23 modules → single-file `dist/index.html` (~353 kB, ~106 kB gzipped).
No framework in the bundle. No stubs, no TODOs.
### Known limits (honest)
- Single device, single browser profile. No sync by design.
- Scores are only as good as the inputs; the app says so where it matters.
- The example organisation is seeded through the real intake engine, so it exercises the
  same propagation path as live use.
