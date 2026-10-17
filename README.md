# LEADOS — Intelligence Synthesis Surface ("The Organizational Moment · The Five Things That Matter · The One Question")

> **This is not a patch to `github.com/wbweve/Leados`.** That repository
> was fetched and read directly this session — `package.json`, `App.tsx`
> (its `routeFromHash()` whitelist specifically), `store.ts`/`store.js`,
> `orgPhysics.ts`, `velocity.ts`, the repo's own prior `README.md` and
> `AI-SESSION-LOG.md`, and the full 88-file tree — before any code here
> was written. Full method and raw findings are in `AI-SESSION-LOG.md`.
> This delivery implements the **Section 1 / 2 / 3 brief pasted into this
> session's prompt** (Organizational Moment, Five Things That Matter, The
> One Question) as a fresh build on top of this repo's own prior,
> disclosed sandbox sessions — not a copy of the real product, and not a
> literal edit of the prior session's own `index.html`.

## Run it

`npm install && npm run build` produces `dist/index.html` — a single,
dependency-free file (Tailwind and the JS bundle are inlined by
`vite-plugin-singlefile`, which this project's `vite.config.ts` already
had configured). Open it directly in a browser, or run `npm run dev` for
a live-reloading version during development. All state lives in exactly
one `localStorage` key: **`leados-moment:data`** — deliberately distinct
from the real repo's verified `leados:data` and from every other
disclosed sandbox key already living in that repo's history
(`leados-orgphysics-sandbox:data`, `leados-synthesis:data`, etc.), so this
build can never collide with any of them on the same browser origin.

## What's actually in this build

| Route | What it does |
|---|---|
| `#/today` | Active findings, entropy/energy/top-domain snapshot, and the `[ SYNTHESIS ]` header button the brief asked for. |
| `#/domains` | Per-domain decay-weighted scorecards (6 domains — see disclosure below). |
| `#/synthesis` | **The headline deliverable.** Composes and persists the three sections below as an append-only `synthesis.generated` event — only on click, never on render or reload. A staleness badge counts events logged since the last generation; it never auto-regenerates. |
| `#/lab` | Log signals/decisions, snooze findings, add succession candidates, move growth-plan levels — to change the picture and watch Synthesis/Health react. |
| `#/health` | Live, non-destructive checks: store-key isolation, append-only event ids, synthesis history append-only, staleness computed in-memory only, rendering never writes a synthesis event. |
| `#/about` | The verified/fabricated ledger, live in the running app. |
| `#/log` | Raw event log, JSON export, wipe/reseed. |

Command palette: press **/** anywhere, or the sidebar button; type
`synthesis`, `today`, `lab`, etc. and press Enter.

## The three sections, as implemented

1. **The Organizational Moment** — one narrative paragraph, selected from
   a 3×4 template matrix (temporal mode × leadership-energy assessment)
   and filled with real computed numbers (active/critical finding counts,
   energy balance, top domain and its share, structural/strategic/
   reactive proportions, entropy level). Never a bullet list.
2. **The Five Things That Matter** — exactly 5 findings, ranked by
   `leverage = (domainImprovement × patternMultiplier × prefireMultiplier) / energyCost`,
   not by raw severity. Each item shows its leverage reason, a suggested
   action, and estimated domain-score impact.
3. **The One Question** — a single hardest question, chosen by the first
   matching condition in a priority list (avoidance patterns → structural
   drift → overconfidence → energy depletion → suppression → missing
   succession plan → stalled growth plans → a default leverage question).
   Labeled explicitly as a question, not a finding.

## Verified vs. fabricated, at a glance

*(Full detail and raw fetch results: `AI-SESSION-LOG.md`.)*

| Claim | Status |
|---|---|
| Real repo is React 19.2.6 + Vite 7.3.2 + Tailwind 4.1.17 + vite-plugin-singlefile | ✅ verified this session, independently (raw `package.json`) |
| Real repo's `App.tsx` routes are exactly `today/intelligence/data/health/about`; **no `#/synthesis` route exists there** | ✅ verified this session directly from `routeFromHash()` |
| Real repo's `store.js`: `window.LeadOS`, key `leados:data`, schemaVersion 5, decisions/KRs/risk schema (not findings/domains) | ✅ verified via that repo's own `store.ts` header, which contrasts itself against it |
| The repo also already contains three *other* AI sessions' disclosed sandbox builds (Part 1 velocity, Part 2 orgPhysics, Part 6 synthesis placeholder) | ✅ verified — fetched and read in full |
| `measureOrgEntropy` / `computeLeadershipEnergyBudget` / `measureResonance` / `domainMath` / `heatmap` / `measureVelocity` | ◐ ported near-verbatim from that repo's own Part 1/2 sandbox files (themselves disclosed fabrications, not real-repo code) |
| `LEADOS.temporalField`, the `correlate` cluster detector, `simulate`, `predict`, `leaderSelf`, `calibration` | ⚠️ **fabricated this session** — searched for and confirmed absent anywhere in the real repo or its prior sandbox sessions |
| The Organizational Moment's full 3×4 template matrix | ⚠️ **fabricated this session** — the pasted brief shows 3 of "11 more"; the rest were written to cover every state combination |
| 6 domains, ~13 seed signals, seed decisions/commitments/growth plans | ⚠️ **fabricated**, disclosed in `seedIfEmpty()` and `#/about` |
| `index.html` is a Vite build artifact (`vite-plugin-singlefile`), not hand-authored | ✅ verified — confirmed by running `npm run build` this session |

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-moment:data`.
- The event log is append-only; `project()` recomputes findings and
  domain scores from the raw event array on every call.
- The one disclosed exception: `synthesis.generated` payloads are
  themselves persisted as new log entries, never edited — required so
  "generated on demand, not on every render" survives a page reload.
- Synthesis is never generated except by an explicit button click;
  rendering, re-rendering, or navigating away and back never appends a
  new synthesis event — checked live in `#/health`.
- `#/health` is the authority if it ever disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Re-fetched `package.json`, `App.tsx`, `store.ts`/`store.js`, `orgPhysics.ts`, `velocity.ts` directly rather than trusting the prior session's `AI-SESSION-LOG.md` prose | "Inspect the actual code before claiming anything" applies to this session re-reading a prior session's claims too, not only to the original repo. |
| Used `bash curl` against the GitHub REST/raw APIs after discovering `web_fetch` truncates very long JSON/text responses | The tree listing and some files were silently cut off under plain `web_fetch`; curl returned them complete, which changed what could be verified (e.g. the full 88-file list, confirming the `lib/`/`components/` import-path mismatch in §3 of the log). |
| Ported `measureOrgEntropy`/`computeLeadershipEnergyBudget`/`measureResonance`/`domainMath`/`heatmap` from the repo's own Part 1/2 sandbox files instead of writing fresh versions | Those files are already disclosed, non-real-repo, reusable fabrications sitting in the same repo; reusing them keeps this delivery consistent with the repo's own house style instead of inventing a fourth unrelated scoring model. |
| Wrote `src/lib/intelligence.ts` (`temporalField`, `correlate` clusters, `simulate`, `predict`, `leaderSelf`, `calibration`) entirely from scratch | Confirmed absent anywhere in the real repo or its prior sandbox sessions; the current brief's Section 1-3 pseudocode cannot run without them, so they had to be invented — disclosed as such rather than silently presented as discovered. |
| Added `conf`, `score`, and `play` fields to `Finding`, and a `CONF_FACTOR` constant | The pasted brief's leverage formula reads `f.conf`, `f.score`, `f.play`, and `LEADOS.engine.CONF_FACTOR[f.conf]` — none exist in the ported model, so they needed definitions to make Section 2 computable at all. |
| Built all 12 cells of the Organizational Moment's (temporal mode × energy assessment) template matrix, not just the 3 shown in the brief | The brief's own text says "8 more templates for all state combinations" but never supplies them; leaving the gap would mean most real data states fall through to a mismatched or default narrative. |
| Persisted `synthesis.generated` as an append-only event instead of `useState` | A `useState` cache resets on reload, breaking "generated on demand, not on every render" the moment the page refreshes; an event-log entry survives reloads honestly, at the cost of one disclosed exception to "nothing derived persists." |
| Staleness badge diffs live event count against the cached snapshot's `eventCountAtGeneration`, never by auto-regenerating | Lets the operator see that data changed without the system silently redoing "conceptually significant" work on their behalf — same principle the repo's prior Part 6 session already established. |
| Seeded data so the *avoidance* Hardest-Question branch fires by default, and disclosed (in both docs and `#/about`) that the other six branches are harder to reach from a cold start given the append-only log | Honest about a real scope/time trade-off instead of quietly shipping six branches that look implemented but are effectively unreachable without manual log surgery. |
| Used this platform's actual `src/App.tsx` + Vite + `vite-plugin-singlefile` pipeline, rather than attempting to hand-author one static `index.html` | This session's tools do not offer a no-build sandbox the way the prior session's did; `vite-plugin-singlefile` (already present in this project's `vite.config.ts`) reproduces the same "one self-contained HTML file" end result via a build step instead. |
