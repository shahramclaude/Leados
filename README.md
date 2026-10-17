# LeadOS pt-H demo — Emergent Intelligence Architecture (single-file, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session (GitHub Trees API for the full file
> list, plus raw fetches of `package.json`, `store.js`, `store.ts`,
> `index.html`, and `AI-SESSION-LOG.md`) before any code here was written.
> It is a **React 19 + Vite 7 + Tailwind 4** project (`vite-plugin-singlefile`)
> with 60+ files flat at the repo root — no `js/` or `src/` directory — not
> the vanilla-JS, no-build-step architecture the pasted pt-H brief assumes.
> The repo root also currently holds **two unrelated prior single-file demo
> artifacts** (`store.ts` labeled "pt-E demo", and a committed `index.html`
> rendering a "pt-G demo" page) alongside the real app files — evidence this
> repo accumulates layered AI-assistant deliveries rather than being patched
> in place. Full method and raw findings, including everything above, are in
> `AI-SESSION-LOG.md` §0. This delivery is a **fresh, self-contained,
> single-file reinterpretation** of the pasted pt-H brief's Parts 1–3,
> continuing the same disclosed practice as the prior pt-G delivery: label
> fabricated/stubbed/incomplete content instead of silently asserting it.

## Run it

Open `index.html` in a browser. That is the install. One disclosed
exception: it loads `@tailwindcss/browser` from `cdn.jsdelivr.net`, required
by this assistant's delivery template — a contradiction of this problem
family's own repeated "no CDN" rule, same as every prior delivery in it.

## Files in this delivery

| File | Role |
|---|---|
| `index.html` | Everything: 3 themes, an append-only event store, a 6-rule finding engine, the generative layout engine (Part 1), the semantic relationship graph (Part 2), the predictive pre-fire calendar (Part 3), a command palette, and a live health suite — all in one file. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-only log of what was verified about the real `wbweve/Leados` repo, and every disclosed decision/deviation in this delivery. |

## What this is / isn't

- **Is**: a working single-file demo of the pasted pt-H brief's three parts:
  a usage-topology analyzer and rail/layout generator that picks between 5
  named configurations (A–E) from real computed domain scores; a live
  entity-relationship graph (co-occurrence edges, a simplified PageRank,
  connected-component clusters, and a mean/std lead-lag detector) run
  against a seeded event log; and a "pre-fire calendar" that projects, from
  pure arithmetic on each threshold rule, when a finding will next fire —
  always labeled "projected from current trends," never a forecast.
- **Is not**: the brief's full system (it only specifies Parts 1–3 anyway,
  and Part 3's text was truncated mid-spec in the prompt — see
  `AI-SESSION-LOG.md` §1.6), a PWA, or a drop-in replacement for anything in
  the real `wbweve/Leados` repo (different global — `LEADOS` here, vs. the
  real repo's `window.LeadOS` in `store.js` and a third, different global
  implied by its own `store.ts` — and a storage key, `leados-pth-demo:data`,
  distinct from both real-repo keys and the prior pt-G delivery's key).

## Verified vs. fabricated, at a glance

| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; 60+ files, all at repo root, no `js/`/`src/` subdirectory | ✅ verified this session (GitHub Trees API) |
| Real stack is React 19 + Vite 7 + Tailwind 4 + `vite-plugin-singlefile` | ✅ verified (read `package.json` directly) |
| Real `store.js` uses `window.LeadOS`, key `'leados:data'`, `SCHEMA_VERSION = 5`, `LINEAGE_TAG 'pt-6'`, a real append-only migration chain | ✅ verified (read `store.js` directly) |
| Repo root **also** holds `store.ts`, an unrelated "pt-E demo" artifact (`leados-pte-demo:data`, schema 1) | ✅ verified (read `store.ts` directly) — named as a discrepancy, not resolved |
| Repo's committed root `index.html` currently renders a prior "pt-G demo" single-file page, not a Vite entry point | ✅ verified this session (raw fetch) — confirms, does not just repeat, the prior session's own disclosure |
| Real rule set is R1–R40, 92 event types, routes `#/today #/roster #/insights #/patterns #/cadences #/data #/playbooks` | ⚠️ reported by the repo's own README/logs — **not independently re-verified this session** (would require diffing 60+ files) |
| Pasted pt-H brief's generative layout engine / entity graph / predictive engine | ❌ matches nothing verified in the real repo — a hypothetical spec pasted into this session |
| This delivery's 6 computed rules, 6 people, 4 goals, 3 plans, 2 risks, 2 deals, ~140 seeded events | ⚠️ fabricated for this demo, seeded once on first load |

## Implemented from the pasted brief (this delivery)

- **Part 1 — Generative Layout Engine**: `analyzeTopology()` (domain
  finding/activity/attention weights, 0.4/0.3/0.3; feature-usage vector;
  temporal pattern by session hour-bucket) and `generateLayout()`
  (configurations A–E, the brief's own >25%-share and ≥50-events/≥3-domains
  rules, fold-under-"N more", Today-page domain spotlights, suggested
  quick-log default, command-palette recency reweighting, right-click +
  `#/data`-table pin-to-position, and the "Layout updated..." banner on
  session-start change).
- **Part 2 — Semantic Relationship Graph**: `buildEntityGraph`,
  `extractRefs`, `pageRankSimple`, connected-component clustering (edge
  weight ≥3), `detectLeadLag` (±21d window) — all copied **structurally**
  from the brief's own pseudocode and run live, plus the `@person`
  semantic-search enrichment (dossier + findings + cluster + co-occurrence +
  patterns) in `#/intelligence`.
- **Part 3 — Predictive Signal Engine**: `projectFireDate` for R1/R7/R20/R40
  (each printing its arithmetic basis), `buildPrefireCalendar` bucketed into
  NOW / THIS WEEK / NEXT 2 WEEKS / NEXT MONTH / LATER / UNCERTAIN — the
  bucket scheme is this session's own completion of the brief's truncated
  spec, labeled as such.
- **6-rule finding engine** computed from the append-only log: R1 (1:1
  cadence), R7 (burnout slope), R20 (goal silent), R30 (plan stalled), R40
  (deal stalled), R50 (risk open too long).
- **Command palette** (`Cmd/Ctrl+K`): `>` commands (recency-weighted from
  real usage counts), `@person`, `#domain`.
- **3 themes** (Obsidian / Parchment / Terminal), instant-swap, persisted in
  `localStorage['leados-pth-demo:theme']` — this session's own palette,
  unverified against any real or prior-delivery file.
- **Health suite** (`#/health`): `T_STORE`, `T_APPEND_ONLY`, `T_ENGINE`,
  `T_TOPOLOGY`, `T_GRAPH`, `T_PREDICT` — live, in-browser, no external
  runner.

## Disclosed gaps (named, not hidden)

- **Attention/session-timing reconciliation**: the brief's "read attention
  from `sessionStorage`" and "regenerate layout on session start only" rules
  are in tension (session start = before any attention exists). This build
  persists a decayed rolling copy of each session's attention into
  `localStorage` so it shapes the *next* session, not its own — see
  `AI-SESSION-LOG.md` §1.4.
- Today-page domain spotlight sparklines are a deterministic placeholder
  pattern, not a real stored 7-day heatmap series.
- `@person` semantic search covers people only, not goals/plans/risks/deals
  as independent search targets.
- No snooze/mute/dismiss, no settings editing, no typed destructive-action
  confirmation, no accessibility self-test suite, no print stylesheet, no
  manifest/service-worker — all present in different form in the prior
  pt-G delivery's doctrine, cut here to fit this session's scope and tool
  budget, named rather than silently dropped.
- `R30` and `R50` are intentionally excluded from the pre-fire calendar
  (non-projectable, per the brief's own `default` case) rather than given a
  fabricated date.

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-pth-demo:data` —
  deliberately distinct from the real repo's two keys and the prior pt-G
  delivery's key, so this demo can never collide with any of them on the
  same origin.
- The event log (`events[]`) is append-only; nothing is rewritten in place.
- Every projected date in `#/forecast` prints the formula (`basis`) used to
  compute it. Every temporal pattern in `#/intelligence` prints its real
  computed `n`/`std`/`lag`, including when no pattern was found.
- `#/health` runs live checks in the browser and is the authority if it
  ever disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via GitHub Trees API + raw fetches of `package.json`, `store.js`, `store.ts`, `index.html`, `AI-SESSION-LOG.md` before writing anything | The task explicitly requires inspecting actual code before claiming anything about it. |
| Named `store.ts` ("pt-E demo") as a second, unrelated artifact at repo root, distinct from the real `store.js` | Read-before-claiming surfaced a genuine discrepancy (two different globals/keys/schemas at root); reporting it is more honest than silently reconciling or ignoring it. |
| Built a fresh single-file reinterpretation instead of attempting to patch the pasted brief into the real repo | The real repo is a 60+-file React/Vite SPA with its own two different storage contracts; this assistant delivers one `index.html`. Claiming to patch files that don't exist here would misrepresent what was done. |
| Used `LEADOS` and storage key `leados-pth-demo:data`, distinct from all three other keys/globals found in or claimed about the real repo | Prevents this demo from ever colliding with a real install or a prior delivery opened in the same browser profile. |
| Implemented exactly 6 rules across 5 domains instead of the brief's implicit full rule set | A small, fully computed set is more inspectable than a table that only looks like a rules engine; matches this lineage's own prior stated preference. |
| Persisted a decayed rolling copy of session attention into `localStorage`, rather than reading only the current session's (always-empty-at-start) `sessionStorage` | The brief's own two rules ("attention from sessionStorage" + "layout regenerates at session start only") are mutually exclusive if taken literally; this is the minimal change that makes "grows more capable the more you use it" actually true. |
| Rendered both outcomes of `detectLeadLag` (detected pattern, or "no reliable pattern" with real std/n) in `#/intelligence`, instead of only showing success cases | The brief's own doctrine is to never assert a pattern the data doesn't support; cherry-picking only positive detections would violate the exact rule this feature exists to demonstrate. |
| Labeled `buildPrefireCalendar`'s bucket scheme as this session's own completion of a truncated spec | The pasted brief's Part 3 text cuts off mid-function; shipping a bucketing scheme without flagging its origin would misrepresent it as recovered/verified when it is this session's own design choice. |
| Dropped snooze/mute/dismiss, settings editing, typed destructive confirm, accessibility suite, print stylesheet from this delivery (present in the prior pt-G delivery) | Pt-H's brief is about layout generation, the entity graph, and prediction; reimplementing pt-G's full feature set as well would not fit this session's tool-call budget — named explicitly rather than silently omitted. |
| Pin-to-position exposed both via right-click context menu *and* a plain table in `#/data` | A context-menu-only affordance is not discoverable without being told about it, which conflicts with "the interface never hides capability." |
