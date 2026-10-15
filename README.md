# LeadOS — Leadership Operating System (pt-2 · org slice)

Offline leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**Lineage note (pt-2 audit of upstream `wbweve/Leados` at HEAD, verified via API tree listing + raw fetches this session):** the tree is **flat** — `app.css`, `store.js`, `events.js`, `engine.js` (28,853 B), `playbooks.js`, `index.html` (3,128 B) at root, **no `css/` or `js/` directories** (alphabetical ordering of the contents API proves absence), while the pt-1 README there claims a 9-entry `css/+js/` tree and says "anything else is not part of pt-1". **That is the fifth consecutive README⇄tree drift — this time inside the lineage whose thesis was ending drift.** Upstream `index.html` script srcs could not be extracted (fetcher strips script tags): whether HEAD boots or dies in its own registry guard is **unverified**. The mf-2 append log prescribes `MIGRATIONS[1→2]` + R8 as *future actions* — never delivered; pt-1's ladder is byte-verified empty (`MIGRATIONS = {}`). The React/Vite `package.json`/lockfile/tsconfig debris still ships at HEAD; in this tree it does not exist by construction. Upstream files were **not modified** (no write path); this tree is the pt-2 artifact and replaces them.

**Carried (byte-verified this session):** storage doctrine (one key, quarantine-never-overwrite, trySetItem-only, normalize-repairs-never-drops, parse funnel, read-only boot on newer, audit cap 300) · event registry + projection contract (`pairKeyOf` ids/one/txt, resolution-clears-until-newer) · `fin()` shape + `CONF_FACTOR {high:1, medium:.7, low:.45}` + printed score math · R1–R4 semantics · seed-once flag doctrine. **Re-authored to the documented contract (upstream bodies never byte-readable — labeled, not hidden):** engine R5–R7, store import pipeline tail, all of playbooks/ui. **New in pt-2:** the ladder's first real step `MIGRATIONS['1>2']` (T6/T7/T11 prove it), cycle-guarded reporting lines, R8 skip-level cadence, R9 line integrity, span-load priced on directs **and** skips, skip/load-cut playbook modes, memory vault for storage-unavailable environments.

**The authority rule, inherited:** `#/health` executes the claims below against the code paths production uses — the parse funnel, quarantine, quota, migrations, merge, seed/purge, every engine rule against fixtures — printing each assertion next to its observed value. **Where this README and `#/health` disagree, `#/health` wins.** This document asserts no test counts; the wall counts itself.

## Files

Nine entries at delivery; anything else is not pt-2.

| File | Role |
|---|---|
| `index.html` | shell: rail nav, boot registry guard (missing js → fatal banner naming the path, data untouched; plain synchronous scripts — no defer/async race) |
| `css/app.css` | editorial tool surface: ink #1C1917 on paper #F7F4EF, accent #C23B2E, hairlines, single ranked column, 640px phone breakpoint, ≤160ms motion, `prefers-reduced-motion` |
| `js/store.js` | storage spine: one key · schema v2 · **real `MIGRATIONS['1>2']`** (dangling/self/archived `reportsTo` → nulled+counted, cycles broken at the lexicographic-min member+counted, `skipCadenceDays` backfilled) with `pre-migration` snapshot + `migration-failed` quarantine · 5-status parse funnel (+ `migration-failed` verdict) · read-only boot on newer · **volatile memory vault when localStorage is unusable, with loud banner** · pure `importInto` / live `importJson` (refuse corrupt·malformed·foreign·newer·identical, two-pass `mergeInto` re-minting every id and rewiring `*Id`/`*Ids`/`reportsTo`, unresolvable → null+counted) · write-time cycle guard · audit cap 300 |
| `js/events.js` | append-only event store (strict live append, imported unknowns inert) + projections recomputed per read (nothing derived persists) + conflict pair fold + suppression fold + **`skips`/`lines.broken` projection (defensive cycle detection)** + span-load pricing (directs + skips vs capacity) + seed/purge |
| `js/engine.js` | **9 rules R1–R9**, pure (P, today) → findings; every finding = what + why (basis + source ids) + confidence (with its own why) + printed score math; rule exceptions surface as loud ENG findings; snooze/dismiss/unmute are events; **goldens G1–G12 built against real code paths** |
| `js/playbooks.js` | mentor layer: 1:1 run sheet (**skip-level + load-cutting variants**) · SBI · DESC · delegation ladder L1–L5 · situational D→S (printed heuristic mapping, per-task) · decision review · goal review — all pre-filled from live projections via `forFinding`, all resolving through `events.append` |
| `js/ui.js` | Today (single ranked column + quick capture for 12 event types) · Roster + dossier (line editor with cycle refusal, measured/estimated sparkline, trend withheld under 3 measured points) · Playbooks · Health (T1–T14 + G1–G12 at render, disposable `leados:t*` keys swept) · Data (export/import with verdict, quarantine browser, mutes + unmute, settings, seed/purge, audit) |
| `README.md` | this file |
| `AI-SESSION-LOG.md` | append-only engineering log |

## The nine rules

**R1** 1:1 cadence overdue — strictly past per-person cadence (default 14d, printed as assumption); never-logged fires MEDIUM conf from `createdAt`; no `createdAt` → skip · **R2** decisions past own review date, no outcome — severity inherits the decision's (clamped 3–5) · **R3** goals ownerless (conf HIGH — explicit null is data) or silent >14d (HIGH from last progress / MEDIUM from creation) · **R4** feedback imbalance — 60d window, ≥80% one polarity, min n=3 (conf HIGH at n≥5); missing polarity excluded + printed · **R5** delegation load — >4 open/person sev 3, >6 sev 4 · **R6** repeated conflict per pair — ≥2 in 60d; conf HIGH both ids / MEDIUM one / LOW text-only; resolution clears until a newer conflict reopens; flat window named in basis · **R7** burnout — measured pulses only, n≥3 in 45d; trigger A mean load ≥8/10, trigger B mood slope ≤−0.5/wk over span ≥7d; estimated + out-of-range excluded + counted; **sev 3 permanently: a trend is a signal, not a diagnosis** · **R8 (new)** skip-level cadence — people exactly one live lead below you; strictly past skip cadence (row value, else settings default 60d, printed); never-logged MEDIUM conf from `createdAt`; broken lines stay silent here · **R9 (new)** line integrity — dangling/archived/cycled `reportsTo` → sev 3, conf HIGH (stored ref is explicit data; the fix is judgment), resolving on the Roster, not in a playbook.

Non-negotiables: trends need ≥3 measured points · missing fields skip rather than infer · a count is never stated as certainty · suppression is auditable and reversible · every finding links the playbook that resolves it (R9/ENG excepted, and say why).

## Storage contract (v2)

- Key `leados:data`; `meta.schemaVersion = 2`, `meta.lineage = 'pt'`.
- `MIGRATIONS['1>2']`: nulls dangling/archived/self `reportsTo` (+counted in `meta.migrationRepairs`), breaks reporting cycles deterministically at the lexicographic-min member (+counted, with the cycle named), backfills `skipCadenceDays: null`, sets `settings.skipCadenceDefaultDays = 60`. `loadFromText` snapshots `pre-migration` **before** the ladder runs; a throwing step (e.g. no step registered for v0) quarantines as `migration-failed` and boots **read-only** — never a half-write.
- Quarantine kinds: `corrupt · malformed · foreign · migration-failed · pre-migration · pre-import`. Timestamped, collision-suffixed, never overwritten, browsable read-only at `#/data`.
- Import: refuses in order — corrupt/malformed/foreign/newer/identical; **older-schema (v1) payloads migrate through the same ladder before merge** (T11); live bytes snapshotted `pre-import`; merge is pure (`importInto`/`mergeInto` are health-gradeable without touching the live store). Cross-lineage (`mf`) imports refused as `foreign`, carried contract. Same-named duplicate people possible on merge: accepted gap, ranked below.
- Newer schema in storage → **read-only boot**: live key untouched, writes hard-blocked, banner shown. An old build must never clobber a newer database.
- **Storage-unavailable mode (new):** a failed boot probe switches to a session-memory vault; everything works, nothing persists, the banner says exactly that (quarantine copies die with the tab — stated). T8 reports honestly rather than faking a pass there.
- Quota: `setItem` failure caught in the production write path → red `WRITE FAILED` pill + a recovery write on the next successful save (T8 injects the fault through the real `save()`); audit log capped at 300, the cap leaves a row (T9).

## Verify it yourself

1. Open `index.html` → `#/health`. T1–T14 + G1–G12 execute at render; observed values printed; disposable keys swept.
2. **Registry check:** rename `js/engine.js`, reload → fatal banner names the path; data untouched. Rename it back. T1 is this check from the inside.
3. `#/data` → **load sample set** → `#/today`: all of R1–R8 fire (T12 asserts exactly that). Purge at `#/data`; the once-ever flag stays by design.
4. `localStorage.setItem('leados:data','{bad')` → reload → clean boot; corrupt bytes sit read-only in the quarantine browser.
5. Hand the import box a v99 blob → refused `newer`; write one into storage → read-only boot (T3 covers the funnel end).
6. Migration, proven: `#/health` T6 builds a byte-exact v1 store (with a `pa↔pb` cycle and a dangling line) and asserts the break target, the nulling, the backfill, the snapshot key. T7 feeds v0 and demands a clean `migration-failed`.
7. Export → import the same file → refused `identical` (T4). Import a foreign-lineage blob → refused `foreign` (T3).

## Design direction (pt-2)

Kept deliberately from the pt-1/session-6 direction — a mentoring tool that rebrands every session reads as unstable. Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DED0`, one accent `#C23B2E`; confidence by weight/texture, never a second hue. Type: old-style serif display stack, ui-monospace for all data/basis/score lines, zero webfonts (offline outranks a downloaded face). Layout: 176px rail, single 720px column; Today is one ranked column with the score math printed on every row, never tiles. Density: 4px grid, hairline rows, metadata always on. Motion: ≤160ms opacity/translate only, none on data mutation; custom inline SVG, `prefers-reduced-motion` honored. Phone: rail collapses to a top bar ≤640px; checked by construction, not by visual sandbox — labeled, not implied.

## What a new multi-team leader needs (beyond the spec's list)

Delivered this slice: **span-load** now prices directs **and** skip-levels against stated weekly capacity — new leaders of leads overcommit structurally, and R1/R8 without pricing punishes arithmetic, not behavior (the over-commit line is accent on Today and Roster). **Line integrity (R9)** — a skip you can't see is a skip you drop; broken lines now surface instead of silently excluding people. Next needs, ranked for future slices: (1) coaching/growth plans — `sl.assessed` history needs follow-through tracking; (2) delegation-level progression (are check-ins earning L4/L5?); (3) boss-expectations capture at day 14 + listening-tour coverage; (4) R6/R7 temporal weighting (flat windows, printed); (5) meeting-load from declared recurring minutes; (6) `reportsTo` changes as events (lines have history; rows lose it).

## Explicit non-claims

- **No JS execution sandbox exists in this authoring environment.** All pt-2 code is first-run code — verified by conservative construction + dual self-review (catches are in the session log). The runtime grader is `#/health` in your browser, by project convention. This README asserts no test results.
- Upstream `store.js` tail, `engine.js` R5–R7 bodies, `playbooks.js`, `ui.js` were **never byte-readable** (fetch truncation, two sessions). They are re-authored to the documented contract — labeled here because prose about code is not code. Upstream `index.html` script srcs: unverified, as stated above.
- T8 monkey-patches `localStorage.setItem`. Engines that make that property non-writable will fail T8 _visibly_ — a graded limitation of the harness, not of the write path.
- `#/health` = fixture-based assertions on real code paths — not browser automation, not a fuzzer; UI rendering itself is not graded.
- Import merges people by re-minted append; same-named duplicates possible (accepted, ranked).
- No visual check at 640px beyond construction: labeled, not implied.

## Next gaps, ranked

1. Coaching/growth plans with follow-through — the SL spine over time, per task.
2. Delegation-level progression tracking (L1→L5 movement as a coached artifact).
3. Boss-expectations capture (day 14) + listening-tour coverage counters.
4. `reportsTo` history as events (migration-safe, projection-folded).
5. People-merge dedupe on import (normalized name + role, opt-in).
6. Accounts, sync, other real humans — permanently out of scope.
