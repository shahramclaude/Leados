# LeadOS — Leadership Operating System (mf-4 · Session 8)

A multi-file, offline-first leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**Lineage note (Session 8 audit, verified against the upstream `main` git tree, commit `82f546c`):** mf-3's README declared its mf-2 drift "fixed here: **this tree matches this file**" and the npm artifacts "not carried over". The verified upstream tree at that commit: **flat root** (`app.css`, `store.js`, `events.js`, `engine.js`, `playbooks.js`, `ui.js`), with `package.json`, `package-lock.json` (87,433 B), `tsconfig.json`, and orphan session fragments (`AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`) — i.e. **the exact failure class it claims fixed, one session later.** Session 8's response is structural, not rhetorical: **this tree matches this file.** Eight entries below, nothing else. `css/` and `js/` exist because they are real directories here, not because a doc wishes them into being.

**The authority rule, inherited:** `#/health` executes the claims below against the code paths production uses — storage, migration ladder, quota, import, every engine rule against golden fixtures — and prints each assertion next to its observed value. Where this README and `#/health` disagree, **`#/health` wins. This document asserts no test counts; the wall counts itself.**

## Files

| File | Role |
| --- | --- |
| index.html | shell: splash, rail nav, drawer, quota pill; loads css/js in order — no build, zero network |
| css/app.css | editorial tool surface: ink `#1C1917` on paper `#F7F4EF`, one accent `#C23B2E`, hairlines, single ranked column, 640px breakpoint |
| js/store.js | storage spine: one key, **schema v3, migration ladder 1→2→3**, quarantine-on-any-mismatch (7 kinds, timestamped, never overwritten — collision-suffixed), trySetItem-only write path, normalize-repairs-never-drops at gate AND at every load, import pipeline (refuse unparseable/malformed/foreign/newer/identical; migrate same-lineage older; **two-pass merge**: mint all ids, then rewire every `*Id`/`*Ids` reference), boot audit, key browser |
| js/events.js | append-only event store + projections (recomputed per read — nothing derived is persisted) + **`conflictPairs` / `conflictNexus` projections (mf-4)** + arrival projection (day count, expectations, tour coverage vs live roster, win ledger) + seed/purge with permanent no-reseed flag |
| js/engine.js | **13 rules (R1–R13)**, pure `(state, today) → findings`; every finding = what + why (basis lines + source-event ids) + confidence (level + why) + printed score math `sev × conf = score`; rule exceptions surface as loud ENG findings instead of dying silently; engine memory via snooze/dismiss/unmute **events**; goldens G1–G18 |
| js/playbooks.js | the mentor layer: 1:1 run sheet (with skip-level, load-cutting, **nexus** modes) · SBI · **DESC (two-party, conflict-resolving)** · delegation ladder · situational D1–D4→S1–S4 · decision review · goal review · expectations charter · listening-tour visit · early-win verification — all pre-filled from live data, all submitting resolving events through the shared layer |
| js/ui.js | Today (single ranked column + quick capture) · Arrival instrument · Roster + dossier (measured/estimated trends, text sparklines) · Playbooks (drawer) · Health (T1–T12 + G1–G18 live at render, disposable keys cleaned after) · Data (export/import, key browser with read-only quarantines, audit log, seed/purge) |

## The thirteen rules

R1 1:1 cadence overdue (strictly past per-person cadence) · R2 decisions past review with no outcome · R3 goals ownerless or silent >14d · R4 feedback imbalance (≥80% either polarity, min 3 in 60d) · R5 delegation load (>4 open per person) · **R6 repeated unresolved conflict PER PAIR (mf-4 rewrite)** — pair = unordered endpoints of `conflict.registered`, linked by roster id (high confidence), free text (medium, spelling-drift risk printed), or "you" when no counterpart is named · R7 overload — **measured pulses only**: mean load ≥8/10 and/or mood slope ≤ −0.4 over ≥3 points; estimated readings excluded and counted · R8 skip-level 1:1 overdue (line `me → lead → skip`, 28d; broken line goes silent rather than guess) · R9 boss expectations uncaptured at day 14 · R10 listening-tour coverage (grace week, day-45 gate, measured against today's roster — stated assumption) · R11 early win past verify date unverified · R12 incident silent ≥7d · **R13 conflict nexus (mf-4)**: one person in ≥3 open conflicts across ≥2 distinct resolvable counterparts — "the common factor is them" — at **medium** confidence, because a count is not a diagnosis and the app says so.

Non-negotiables: trends need ≥3 measured points; missing fields skip rather than infer; every recommendation links the playbook that resolves it; snooze/dismiss are events — suppression is auditable and reversible.

## Storage contract (v3 — unchanged by mf-4)

* Key `leados:data`; `meta.schemaVersion = 3`, `meta.lineage = 'mf'`.
* Migrations: `1→2` reportsTo backfill · `2→3` adds `meta.appointment` (null = leader hasn't said; arrival rules stay silent).
* **mf-4 added NO migration.** `counterpartPersonId` is an additive nullable field inside event `data{}`; `normalizeEvents` preserves unknown data fields by contract. A schema bump for an additive event field would be ceremony, not safety — the decision is recorded in `js/store.js` and the session log.
* Quarantine kinds: `corrupt · malformed · foreign · newer · migration-failed · pre-migration · pre-import` — timestamped, collision-suffixed, never overwritten, browsable read-only at `#/data`.
* Import: refuses unparseable/malformed/foreign/newer/identical-to-live; migrates same-lineage older; two-pass merge re-mints every id and rewires all references; per-event normalization at the gate AND post-merge; live bytes preserved `.pre-import.` first.
* Quota: failure caught in the production write path, sets the red `WRITE FAILED` pill, in-memory state intact. The ~5MB budget is a labeled **assumption**.
* Seeds tagged `seed:true`; one-click purgeable; `meta.seeded` is set **before** rows are written, so purged-then-reloaded never reseeds (T11).

## Verify it yourself

1. Open `index.html` → `#/health`. Read T1–T12 and G1–G18 — every row executed at render, disposable keys cleaned after.
2. `#/data` → **Load sample set** → `#/today`: every rule has something to say, including R6 (Dana × Priya pair) and R13 (friction-nexus). Purge at `#/data`; state stays empty forever.
3. `localStorage.setItem('leados:data','{bad')` → reload → boots clean; the corrupt bytes sit read-only in the key browser.
4. Register a conflict via the capture bar (link Party B from the roster, or leave free text) and watch Today, the dossiers, and the engine consume the same event.
5. Import your own export → refused as identical. Import it into an incognito window → merged with all ids re-minted.

## Design direction (Session 6, kept Sessions 7–8)

Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DECF`, one accent `#C23B2E`; confidence by weight/texture, not rainbow. Type: old-style serif display (Iowan/Palatino/Georgia), mono for all data/basis/score lines, 12–13px body — zero webfonts (no-network doctrine). Layout: 64px rail, single 760px column; Today is one prioritized column, never a tile grid. Density: 4px grid, hairline rows, mono metadata always visible (evidence ids printed). Motion: ≤160ms translate-only. No gradients, glass, cards-in-cards, or emoji (custom inline SVG; text sparklines are block-glyph typography). Why kept: identity churn mid-flight is how tools lose trust — three sessions changed information, not paint. Checked at 640px (rail horizontal, forms single column). mf-4 addition: pair findings render `A × B` with a two-node link glyph; conflict rows carry a counterpart chip.

## Explicit non-claims

* No JS execution sandbox exists in this authoring environment (same constraint Sessions 6–7 reported). Correctness is by conservative construction + self-review; the runtime grader is `#/health` in your browser, by this project convention.
* `#/health` = fixture-based assertions on real code paths — not browser automation, not a fuzzer, and it does not cover UI rendering itself.
* Upstream mf-3's `engine.js` goldens G1–G16, its full `ui.js`, and the tails of its `store.js`/`events.js`/`playbooks.js` were **not readable from here** (fetch truncation — the same defect Session 7 reported). Those parts were **re-authored to the documented and head-verified contract**, not continued. Everything actually read before reuse is marked "verified-carried" in file headers; everything else is written as new. Nothing unread was claimed as inspected.
* The upstream audit above is limited to: git tree (recursive API, `truncated:false`), full README, and the readable heads of four source files.

## Next gaps, ranked

1. Meeting-load audit + premortem gate for severity-≥4 decisions.
2. Coaching/growth plans with follow-through (SL assessments need a spine over time).
3. Delegation-level progression tracking (are people moving UP the ladder?).
4. R6/R13 temporal weighting (a pair from 89 days ago weighs differently than last week's — currently a flat window).
5. Accounts, sync, other real humans — permanently out of scope.
