# LeadOS — Leadership Operating System (pt-1 · trust spine)

Offline leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**Lineage note (pt-1 audit of upstream `wbweve/Leados`, API tree sha `a2ff16e`, `truncated:false`):** the mf-5 README declares "this tree matches this file" and cites a 9-entry `css/ + js/` tree. The verified upstream tree at HEAD: **flat root, 14 entries, no `css/` or `js/` directories**, with `package.json` (a React/Vite/Tailwind manifest), `package-lock.json`, `tsconfig.json`, and both orphan fragments still present. `engine.js` is **22,676 B, not the claimed 43,626**; `ui.js` is **80,221 B, not 52,269**. That is the **fourth consecutive session of README⇄tree drift**, and it is why pt-1 does not continue upstream bytes: prose about code is not code.

**What pt-1 verified byte-level before re-authoring:** `index.html` title + six-view rail (script paths unverified — extraction strips tags); `package.json` full contents (React scaffold debris); `engine.js` head through R5 — R1–R4 match the documented contract (strictly-past cadence, severity-inheritance, polarity-exclusion counted-not-guessed); the file header's own "All code re-authored" contradicting upstream carry claims. **Not byte-readable:** `store.js` tail, `events.js`, `playbooks.js`, `ui.js` bodies, engine R5–R15. Everything downstream of those is re-authored to the verified contract and labeled.

**The authority rule, inherited:** `#/health` executes the claims below against the code paths production uses — storage funnel, quarantine, quota, import, seed/purge, every engine rule against fixtures — and prints each assertion next to its observed value. **Where this README and `#/health` disagree, `#/health` wins.** This document asserts no test counts; the wall counts itself.

## Files

Nine entries at delivery; anything else is not part of pt-1.

| File | Role |
|---|---|
| `index.html` | shell: rail nav, quota pill, **boot registry guard** (missing js → fatal banner naming the path, data untouched; plain synchronous scripts — no defer/async race), loads css + 5 js in order |
| `css/app.css` | editorial tool surface: ink `#1C1917` on paper `#F7F4EF`, accent `#C23B2E`, hairlines, single ranked column, 640px phone breakpoint |
| `js/store.js` | storage spine: one key, schema v1 lineage `pt` (genesis — ladder infrastructure present, zero steps), 6-status parse funnel, quarantine timestamped/collision-suffixed/never-overwritten, trySetItem-only writes, normalize-repairs-never-drops, import pipeline (refuse unparseable/malformed/foreign/newer/identical; **pure `mergeInto` two-pass**: mint every id, rewire `*Id`/`*Ids`/`reportsTo`, **unresolvable refs nulled+counted — an old id can collide with a live one**), read-only boot on newer schema, audit log capped at 300 with the cap leaving a row, read-only key browser |
| `js/events.js` | append-only event store + projections recomputed per read (nothing derived persists) + conflict pair fold (resolution clears until a NEWER conflict reopens) + suppression fold + **span-load projection (pt-1 addition)** + post-pass orphan checks (dangling outcome/close targets counted, dropped, never guessed) + seed/purge (flag set before rows; purge keeps the flag) |
| `js/engine.js` | **7 rules R1–R7** (the spec's required minimum), pure `(P, today) → findings`; every finding = what + why (basis + source ids) + confidence (level + its own why) + printed score math; rule exceptions surface as loud ENG findings; snooze/dismiss/unmute are events; **golden tests G1–G11 built against real code paths** |
| `js/playbooks.js` | the mentor layer: 1:1 run sheet (R7 load-cutting variant) · SBI · DESC · delegation ladder L1–L5 · situational D→S assessment · decision review · goal review — all pre-filled from live projections, all resolving through `events.append` |
| `js/ui.js` | Today (single ranked column + quick capture for 8 event types) · Roster + dossier (sparklines from measured pulses only, delegation closes, pulse log, SL panel) · Playbooks · Health (T1–T13 + G1–G11 at render, disposable `leados:t*` keys swept) · Data (export/import with verdict check, key browser, audit, mutes w/ unmute, rule registry, seed/purge, capacity settings) |
| `README.md` | this file |
| `AI-SESSION-LOG.md` | append-only engineering log (fresh pt lineage; upstream sessions were not continued and their log is not carried) |

## The seven rules

**R1** 1:1 cadence overdue — strictly past per-person cadence (default 14d, printed as assumption); never-logged fires MEDIUM from `createdAt`; no `createdAt` → skip · **R2** decisions past own review date, no outcome — severity inherits the decision's (clamped 3–5); no review date → skip · **R3** goals ownerless (HIGH — explicit null is data) or silent >14d (HIGH from last progress / MEDIUM from creation) · **R4** feedback imbalance — 60d window, ≥80% one polarity, min n=3 (HIGH at n≥5); missing polarity excluded + printed · **R5** delegation load — >4 open/person sev 3, >6 sev 4 · **R6** repeated unresolved conflict per pair — ≥2 in 60d; conf HIGH both ids / MEDIUM one / LOW text-only; resolution clears until a newer conflict reopens; flat window is a named gap printed in basis · **R7** burnout — **measured pulses only**, n≥3 in 45d; trigger A mean load ≥8/10, trigger B mood slope ≤−0.5/wk over span ≥7d; estimated readings and out-of-range values excluded + counted; **MEDIUM permanently: a trend is a signal, not a diagnosis**.

Non-negotiables: trends need ≥3 measured points · missing fields skip rather than infer · a count is never stated as certainty · suppression is auditable and reversible · every finding links the playbook that resolves it.

## Storage contract (v1 — genesis)

- Key `leados:data`; `meta.schemaVersion = 1`, `meta.lineage = 'pt'`.
- Migration ladder: infrastructure present (`MIGRATIONS`, `pre-migration` snapshot slot, `migration-failed` quarantine), zero steps — v1 is genesis. Additive fields inside rows/events will NOT get a version bump; the normalizer preserves them by contract.
- Quarantine kinds observed by the funnel: `corrupt · malformed · foreign · migration-failed · pre-import` (+ `pre-migration` reserved). Timestamped, collision-suffixed, never overwritten, browsable read-only at `#/data`.
- Import: refuses in order — unparseable / malformed / foreign / newer / identical; merges via `mergeInto` (pure, health-gradeable); live bytes snapshotted `pre-import` first. **Cross-lineage (`mf`) imports are refused — named consequence of the clean break.** Same-named duplicate people possible on merge: accepted gap, ranked.
- Newer schema in storage → **read-only boot**: live key untouched (T6 asserts byte-identical), banner shown, `save()` hard-blocked. An old build must never clobber a newer database.
- Quota: `setItem` failure caught in the production write path → red `WRITE FAILED` pill, in-memory state intact (T10 injects the fault through the real `save()`). ~5 MB budget is a labeled assumption.
- Audit log capped at 300; the cap itself leaves a row (T11).

## Verify it yourself

1. Open `index.html` → `#/health`. T1–T13 + G1–G11 execute at render; observed values printed; disposable keys swept.
2. **Registry check:** rename `js/engine.js`, reload → fatal banner names the path; your data untouched. Rename it back. T1 is this same check from the inside.
3. `#/data` → **Load sample set** → `#/today`: all seven rules fire at least once (T12 asserts exactly this) — Dana × Priya conflict pair, Anika's 5 open delegations, Marcus's measured pulses. Purge at `#/data`; the no-reseed flag stays.
4. `localStorage.setItem('leados:data','{bad')` → reload → clean boot; corrupt bytes sit read-only in the key browser.
5. Hand it a v99 blob → **read-only boot**, live bytes byte-identical after (T6).
6. Export → import the same file → refused as identical. Import it in an incognito window → merged, ids re-minted, reportsTo chains intact (T9).

## Design direction (pt-1)

Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DECF`, one accent `#C23B2E`; confidence by weight/texture, never a second hue. Type: old-style serif display, mono for all data/basis/score lines, 12–13px body, zero webfonts. Layout: 176px rail, single 720px column; Today is one ranked column, never tiles. Density: 4px grid, hairline rows, metadata always on; **score math printed inline on every finding** (`R1 · sev 3 × conf 1.0 = 3.0`) — ranking you can audit, not a number from a hole. Motion: ≤160ms opacity/translate only, none on data mutation; custom inline SVG, `prefers-reduced-motion` honored. Kept deliberately from the Session-6 direction: a mentoring tool that rebrands every session reads as unstable. Phone: rail collapses to a top bar at ≤640px; checked by construction, no visual sandbox here — labeled, not implied.

## What a new multi-team leader needs (beyond the spec's list)

Added in pt-1: **span-load** — implied weekly 1:1 minutes from per-person cadences vs stated capacity, printed on Roster with the over-commit line in accent. New leaders of leaders structurally overcommit 1:1s; without this, R1 punishes a promise the arithmetic said they couldn't keep. Next needs, ranked for future slices: (1) coaching/growth plans with follow-through — SL assessments need a spine over time; (2) skip-level cadence (R8) with verified reporting lines; (3) boss-expectations capture at day 14 (R9) + listening-tour coverage (R10); (4) early-win verification; (5) delegation-level progression tracking; (6) meeting-load rule from declared recurring minutes.

## Explicit non-claims

- **No JS execution sandbox exists in this authoring environment.** All pt-1 code is first-run code — verified by conservative construction + self-review only. The runtime grader is `#/health` in your browser, by project convention. This README asserts no test results.
- Upstream `store.js` tail / `events.js` / `playbooks.js` / `ui.js` and engine R5–R15 bodies were **not byte-readable** (fetch truncation). R1–R4 semantics were byte-verified and carried; everything else is re-authored to the documented contract. Upstream's `AI-SESSION-LOG.md` is not carried.
- T10 monkey-patches `localStorage.setItem`. Engines that make that property non-writable will fail T10 *visibly* — that is a graded limitation of the harness, not of the write path.
- `#/health` = fixture-based assertions on real code paths — not browser automation, not a fuzzer; UI rendering itself is not graded.
- Import merges people by re-minted append; same-named duplicates are possible (accepted, ranked).
- No visual check at 640px beyond construction: labeled, not implied.

## Next gaps, ranked

1. R8 skip-level cadence with cycle-guarded reporting lines (span-load already prices directs only — printed).
2. Coaching/growth plans over time; delegation-level progression tracking.
3. R6/R7 temporal weighting (flat windows currently — printed in basis lines).
4. People-merge dedupe on import (normalized name + role, opt-in).
5. Cross-lineage import bridge for `mf` exports, opt-in, if ever justified by a real user.
6. Accounts, sync, other real humans — permanently out of scope.
