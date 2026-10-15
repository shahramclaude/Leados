# LeadOS — Leadership Operating System (pt-3 · growth slice)

Offline leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key (`leados:data`).

**Lineage note (pt-3 audit of upstream `wbweve/Leados` at HEAD, verified this session via the git tree API with `recursive=1`, `truncated:false`, plus raw fetches):** the tree is **flat — 14 entries, no `css/` or `js/` directories** — while the pt-2 README at HEAD documents a nine-entry `css/+js/` tree and claims the npm debris "in this tree does not exist by construction." Observed at HEAD: `package.json`, 87 KB `package-lock.json`, `tsconfig.json` **all present**. **That is README⇄tree drift #6, in the lineage whose thesis was ending drift.** HEAD's `index.html` script srcs could not be extracted (fetcher strips `<script>` tags, three sessions running): whether upstream HEAD boots or dies in its own registry guard remains **unverified, labeled**.

**Carried (byte-verified this session):** storage doctrine (one key · quarantine-never-overwrite · try/catch-only writes · normalize-repairs-never-drops · parse funnel · read-only boot on newer · volatile vault · audit cap 300) · the full body of `MIGRATIONS['1>2']` (near-verbatim) · event registry + projection contract (`pairKeyOf` ids/one/txt, resolution-clears-until-newer, `_skipped` counters, suppression fold, span pricing, lines/skips) · `fin()` shape + `CONF_FACTOR {high:1, medium:.7, low:.45}` + printed score math · **R1–R4 near-verbatim** · R5–R9 to the pt-2 documented contract (upstream bodies never byte-readable — labeled, not hidden) · seed-once flag doctrine.

**Re-authored:** playbooks + ui (upstream bodies never byte-readable in any session — labeled), now as **data-driven descriptors** rendered generically, so the next playbook is data, not a screen.

**New in pt-3 (the slice):** schema **v3** with the ladder's second real step `MIGRATIONS['2>3']` · event types `plan.created / plan.checkin / plan.closed` with per-plan **D-spine** projection · rule **R10** (growth-plan follow-through) + golden **G13** · playbooks **growth-plan** and **growth-review** (SL-prefilled, style-derived review windows, printed sources) · `nextReviewBy` re-arm fold wired playbook→projection→engine (a check-in re-arms R10; G13 grades it) · dossier growth section with D-spine sparkline · T-suite extended to T13 (plan/goal/conflictIds rewiring, merge-collision uniqueness).

## Files

Ten entries at delivery; anything else is not pt-3. A future README that names an eleventh file without a matching entry on disk is drift — treat it as such.

| File | Role |
| --- | --- |
| `index.html` | shell: rail nav, inline boot registry guard (missing js → fatal banner naming the path, data untouched; plain synchronous scripts — no defer/async race) |
| `css/app.css` | editorial surface: paper `#F7F4EF` · ink `#1C1917` · hairline `#E3DED0` · one accent `#C23B2E` · severity by weight/texture, never a second hue · ≤160ms motion, `prefers-reduced-motion` honored · 640px rail collapse |
| `js/store.js` | storage spine: schema v3 · `MIGRATIONS['1>2']` carried + `['2>3']` new · 5-status parse funnel · read-only boot on newer + failed migration · memory vault · `importInto`/`mergeInto` pure (every id re-minted, every ref rewired, unresolvable → null+counted, dup-names flagged) · `buildSeed()` extracted so T12 grades the real seed without burning the once-ever flag |
| `js/events.js` | append-only event store (24 known types; strict live append, imported unknowns inert) + projections recomputed per read (nothing derived persists) + plans fold with D-spine + `nextReviewBy` re-arm + lines/skips/span |
| `js/engine.js` | **10 rules R1–R10**, pure `(P, today) → findings`; every finding = what + why (basis + source ids) + confidence with its own why + printed score math; rule exceptions surface as loud ENG findings; expired snoozes **resurface** |
| `js/playbooks.js` | mentor layer: 1:1 run sheet (+skip) · SBI · DESC · delegation ladder L1–L5 · situational D→S (printed heuristic, per-task) · decision-review · goal-review · **growth-plan** · **growth-review** — all descriptors pre-filled from live projections, all saving as events |
| `js/ui.js` | Today (ranked column + quick capture for 13 event types) · Roster + dossier (line editor with cycle refusal, measured/estimated sparkline, trend withheld under 3 measured points, D-spine) · Playbooks (generic renderer) · Health · Data (export/import verdicts, quarantine browser, mutes, settings, seed/purge, audit tail) |
| `js/health.js` | the authority wall: **T1–T13 + G1–G13** executed against production code paths; disposable `leados:t*` keys swept before and after |
| `README.md` | this file |
| `AI-SESSION-LOG.md` | append-only engineering log |

## The ten rules

**R1** 1:1 cadence overdue — strictly past per-person cadence (default 14d, printed); never-logged fires MEDIUM from `createdAt`; no `createdAt` → skip · **R2** decisions past own review date, no outcome — severity inherits (clamped 3–5) · **R3** ownerless goals (HIGH — explicit null is data) or silent >14d strictly (exactly 14d stays quiet, G11) · **R4** feedback imbalance — 60d window, ≥80% one polarity, min n=3 (HIGH at n≥5); missing polarity excluded + printed · **R5** delegation load — >4 open → sev 3, >6 → sev 4 · **R6** repeated conflict per pair — ≥2 in 60d; resolution clears until a NEWER conflict reopens; conf priced by linkage (ids HIGH / one MEDIUM / text LOW) · **R7** burnout — ≥3 **measured** pulses in 45d; trigger A mean load ≥8/10, trigger B mood slope ≤−0.5/wk (least-squares, printed); sev 3 permanently: a trend is a signal, not a diagnosis · **R8** skip-level cadence — exactly one live lead below; broken lines stay silent here by design · **R9** line integrity — dangling/archived/cycled `reportsTo`, **transitive dependents included** (G12) · **R10 (new)** growth plan with `reviewBy` strictly past and no `plan.checkin` on/after that day → sev 2 (>14d → 3), conf HIGH; resolved by a check-in, not a dismissal; a check-in *before* the review date does not count (G13).

Non-negotiables (carried): trends need ≥3 measured points · missing fields skip rather than infer · a count is never stated as certainty · suppression is auditable and reversible · every finding links the playbook that resolves it (R9/ENG excepted, and they print why).

## Storage contract (v3)

- Key `leados:data`; `meta.schemaVersion = 3`, `meta.lineage = 'pt'`.
- `MIGRATIONS['2>3']`: backfills `settings.coachingReviewDefaultDays = 14`, counted in `meta.migrationRepairs`. Older payloads (v1/v2) climb the full ladder — at boot *and* at the import gate (T6/T11).
- Quarantine kinds: `corrupt · malformed · foreign · migration-failed · pre-migration · pre-import`. Timestamped, collision-suffixed, never overwritten, browsable read-only at `#/data`. A boot that finds its own main store unreadable quarantines it and starts clean rather than guessing — the banner says so, with the key.
- Import refuses in order: corrupt → malformed → foreign → newer → **identical**. Then: pre-import snapshot → ladder if older → whole-store merge, every id re-minted, every `*Id`/`*Ids`/`reportsTo` rewired (recursive — future event types rewire automatically), unresolvable → null + counted. Same-named duplicate people on merge: possible, flagged, ranked as an accepted gap (T4 asserts the flag, not the fantasy).
- Newer schema in storage → read-only boot; failed migration → read-only boot. An old build must never clobber a newer database; a half-migrated write is the one thing worse than no migration.
- localStorage unusable → session-memory vault, loud banner; quarantine copies die with the tab (stated there).
- Quota: `setItem` failure caught in the production `save()` → `meta.writeFailed` + failure counter + red banner; the next successful save writes a recovery audit row (T8 injects the fault through the real `save()`).

## Verify it yourself

1. Open `index.html` → `#/health`. T1–T13 + G1–G13 execute at render; observed values printed next to expectations. **Where this README and `#/health` disagree, `#/health` wins.** This document asserts no test counts.
2. **Registry check:** rename `js/engine.js`, reload → fatal banner names the path; data untouched. Rename it back. T1 is this check from the inside.
3. `#/data` → **load sample set** → `#/today`: all of R1–R10 fire (T12 asserts exactly that on the same builder). Purge at `#/data`; the once-ever flag stays by design.
4. `localStorage.setItem('leados:data','{bad')` → reload → clean boot + banner; original bytes sit read-only in the quarantine browser.
5. Hand the import box a v99 blob → refused `newer`; your own export back unchanged → refused `identical`; hand it a v1 store → it climbs 1>2>3, then merges (T11).
6. Migration, proven: `#/health` T6 builds a byte-exact v1 store with a `pa↔pb` cycle and a dangling line, and asserts the break target (lexicographic-min `pa`), the nulling, both backfills, the snapshot key.
7. The growth loop, end to end: Playbooks → *Situational read* on a person+task → *Growth plan* (watch the review default follow the style) → advance dates or wait → R10 fires on Today → *Growth review* re-assesses D, extends the spine, re-arms the next review. G13 grades every edge of that loop, including "early check-in doesn't satisfy a review."

## Design direction (pt-3)

Carried deliberately — a mentoring tool that rebrands every session reads as unstable; only defects get fixed. Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DED0`, one accent `#C23B2E`; confidence and severity by weight/texture, never a second hue. Type: old-style serif display stack for prose; ui-monospace for every datum, basis line, and score; zero webfonts (offline outranks a face). Layout: 176px rail, single 720px column; Today is one ranked column with the score math printed on every row, never tiles. Density: 4px grid, hairline rows, metadata always on. Motion: ≤160ms opacity/translate only, none on data mutation; `prefers-reduced-motion` honored. Phone: rail collapses to a top bar ≤640px; checked by construction, not by visual sandbox — labeled, not implied.

## What a new multi-team leader still needs (beyond this slice)

Delivered this slice: **coaching follow-through** — an SL read used to be written and then die; now it becomes a plan whose review date the engine guards, whose re-assessments form a visible spine, and whose style windows are derived, printed, and changeable. Ranked next: (1) **delegation-level progression** — L1→L5 movement as a coached artifact (is relief being earned?); (2) `reportsTo` **changes as events** (lines have history; rows lose it); (3) people-merge dedupe on import (T4 flags dup names; it does not resolve them); (4) boss-expectations capture at day 14 + listening-tour coverage; (5) meeting-load from declared recurring minutes; (6) R6/R7 temporal weighting (flat windows, printed).

## Explicit non-claims

- **No JS execution exists in this authoring environment.** All pt-3 code is first-run code — verified by conservative construction, fixture tracing, and self-review (catches logged in AI-SESSION-LOG §4, including two fixtures that graded correct code as broken). The runtime grader is `#/health` in your browser, by project convention. This README asserts no executed test results.
- Upstream R5–R9 bodies, and all of upstream `playbooks.js`/`ui.js`, were never byte-readable in three sessions (fetch truncation) — re-authored to the byte-verified + documented contract, labeled as such.
- T8 monkey-patches `localStorage.setItem`. Engines making that property non-writable fail T8 *visibly* — a graded harness limitation, not a write-path defect. In vault mode T8/T9 report SKIP rather than faking a pass.
- `#/health` = fixture assertions on real code paths — not browser automation, not a fuzzer; UI rendering itself is not graded.
- No visual check at 640px beyond construction: labeled, not implied.
- Accounts, sync, other real humans: permanently out of scope.
