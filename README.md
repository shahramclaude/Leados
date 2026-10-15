# LeadOS — Leadership Operating System (mf-3 · Session 7)

A multi-file, offline-first leadership mentor for someone newly put in charge
of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no
APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open
`index.html` — that is the install. All state lives in `localStorage` under
one key.

**Lineage note (Session 7 audit, verified against the mf-2 git tree):** mf-2's
README claimed `css/` + `js/` paths and "the tree now matches this file" —
its actual tree had everything at root plus undocumented npm artifacts
(`package-lock.json`, 87KB) and orphan session files. That drift is fixed here:
**this tree matches this file**, and the npm artifacts are not carried over
(why: a lockfile implies a dependency graph nobody audited, in a project whose
entire doctrine is zero dependencies). Full audit: `AI-SESSION-LOG.md`, Session 7.

**The authority rule, inherited:** `#/health` executes the claims below against
the code paths production uses — storage, migration ladder, quota, import, and
every engine rule against golden fixtures — and prints each assertion next to
its observed value. Where this README and `#/health` disagree, **`#/health`
wins. This document asserts no test counts; the wall counts itself.**

## Files

| File | Role |
|---|---|
| index.html | shell, splash, rail nav, drawer; loads css/js in order — no build, zero network |
| css/app.css | editorial tool surface: ink #1C1917 on paper #F7F4EF, one accent #C23B2E, hairlines, single ranked column, 640px breakpoint |
| js/store.js | storage spine: one key, **schema v3, migration ladder 1→2→3**, quarantine-on-any-mismatch (7 kinds, timestamped, never overwritten — collision-suffixed), trySetItem only write path, normalize-repairs-never-drops at gate AND at every load, import pipeline (refuse unparseable/malformed/newer/foreign/identical; migrate same-lineage older; **two-pass merge**: mint all ids, then rewire every `*Id`/`*Ids` reference), boot audit |
| js/events.js | append-only event store + projections (recomputed per read — nothing derived is persisted) + **arrival projection** (day count, expectations, tour coverage vs live roster, win ledger) + seed/purge with permanent no-reseed flag |
| js/engine.js | **12 rules (R1–R12)**, pure (state, today) → findings; every finding = what + why (basis lines + source-event ids) + confidence (level + why) + printed score math `sev × conf = score`; rule exceptions surface as loud findings instead of dying silently; engine memory via snooze/dismiss/unmute **events**; goldens G1–G16 |
| js/playbooks.js | the mentor layer: 1:1 run sheet · SBI · DESC · delegation ladder · situational D1–D4→S1–S4 · decision review · goal review · **expectations charter · listening-tour visit · early-win verification** — all pre-filled from live data, all submitting resolving events through the shared layer |
| js/ui.js | Today (single ranked column + quick-capture bar), Arrival instrument, Roster + person dossier (measured/estimated trends, text sparklines), Playbooks, Health (T1–T12 + G1–G16 live at render), Data (export/import, key browser with read-only quarantines, audit log, seed/purge) |

## The twelve rules

R1 1:1 cadence overdue (strictly past per-person cadence) · R2 decisions past
review date with no outcome · R3 goals ownerless or silent >14d · R4 feedback
imbalance (≥80% either polarity, min 3 in 60d) · R5 delegation load (>4 open
per person) · R6 repeated unresolved conflict (≥2 in 90d) · R7 overload —
**measured pulses only**: mean load ≥8/10 and/or mood slope ≤ −0.4 over ≥3
points; estimated readings excluded and counted in the basis · R8 skip-level
1:1 overdue (reporting line `me → lead → skip`, cadence 28d; a broken line
goes silent rather than guess) · **R9 boss expectations uncaptured at day 14**
· **R10 listening-tour coverage** (grace week, day-45 gate, measured against
today's roster — stated assumption) · **R11 early win past its verify date
unverified** (same shape as R2 by design: an open loop presented as progress,
to your boss this time) · **R12 incident silent ≥7d** (close it or move it —
quiet incidents teach the team that reporting changes nothing).

Non-negotiables: trends need ≥3 measured points; missing fields skip rather
than infer; every recommendation links the playbook that resolves it;
snooze/dismiss are events — suppression is auditable and reversible.

## Storage contract (v3)

* Key `leados:data`; `meta.schemaVersion = 3`, `meta.lineage = 'mf'`.
* Migrations: `1→2` reportsTo backfill `'me'` · `2→3` adds `meta.appointment`
  (null = leader hasn't said — the arrival rules stay silent rather than
  guess). Pre-migration bytes are preserved under a `.pre-migration.` key
  before any write.
* Quarantine kinds: `corrupt · malformed · foreign · newer · migration-failed
  · pre-migration · pre-import` — timestamped and collision-suffixed, never
  overwritten, browsable read-only at `#/data`.
* Export = full JSON. Import: refuses unparseable/malformed/newer/
  foreign/identical-to-live; migrates same-lineage older; two-pass merge
  re-mints every id and rewires all references; per-event normalization at the
  gate; live bytes preserved `.pre-import.` before merging.
* Quota: failure is caught in the production write path, sets a persistent red
  `WRITE FAILED` pill, in-memory state intact. The ~5MB budget is a labeled
  **assumption** (real limits aren't JS-queryable).
* Seeds tagged `seed:true`; one-click purgeable; `meta.seeded` is set **before**
  rows are written, so purged-then-reloaded never reseeds (T11).

## Verify it yourself

1. Open `index.html` → `#/health`. Read T1–T12 and G1–G16 — every row
   executed at render, disposable keys cleaned after.
2. `#/data` → **Load sample set** → `#/today`: every rule has something to
   say, basis + confidence + `sev × conf` printed. `#/arrival` shows the 90d
   instrument mid-flight (day 26, expectations missing, tour 1/3, a win past
   its gate). Purge at `#/data`; state stays empty forever.
3. `localStorage.setItem('leados:data','{bad')` → reload → boots clean; the
   corrupt bytes sit read-only in the key browser.
4. Register anything (capture bar, playbook, form) and watch Today, the
   Arrival view, the person dossier, and the engine consume the same stream.

## What a newly appointed multi-team leader needs (and got this slice)

The brief asked: what else does this persona need? Answer, built: **the
arrival instrument** — because new leaders of leaders don't fail at 1:1s, they
fail on three specific cliffs in the first 90 days: optimizing toward guessed
expectations (R9 + charter), changing things before finishing the listening
tour (R10 + tour visit), and trading on announced-but-unverified wins (R11 +
wincloser). Plus **incidents** as first-class cases (R12) — the shared-layer
spec always listed them; now they exist.

## Design direction (Session 6, kept Session 7)

Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DECF`, one accent
`#C23B2E`; confidence by weight/texture, not rainbow. Type: old-style serif
display (Iowan/Palatino/Georgia), mono for all data/basis lines, 12–13px body
— zero webfonts (no-network doctrine makes this a constraint, not a style).
Layout: 64px rail, single 760px column; Today is one prioritized column, never
a tile grid. Density: 4px grid, hairline rows, mono metadata always visible.
Motion: ≤160ms translate-only. No gradients, glass, cards-in-cards, or emoji
(custom inline SVG icons throughout; text sparklines are block-glyph
typography, not emoji). Why kept: identity churn mid-flight is how tools lose
trust — this session changed information, not paint. Checked at phone width
(640px: rail goes horizontal, forms go single-column).

## Explicit non-claims

* No JS execution sandbox existed in this authoring environment (same as
  Session 6 reported). Correctness is by conservative construction +
  self-review (defects caught are listed in the session log); the runtime
  grader is `#/health` in your browser, by this repo's own convention.
* `#/health` = fixture-based assertions on real code paths — not browser
  automation, not a fuzzer, and it does not cover UI rendering itself.
* mf-2's `ui.js` and the tails of its `store.js`/`engine.js` were not
  readable from here (truncated in two fetch modes). They were **re-authored,
  not continued**; nothing unread was claimed.

## Next gaps, ranked

1. Conflict **counterpart pairs** (R6 from per-person to per-pair).
2. Meeting-load audit + premortem gate for severity-≥4 decisions.
3. Coaching/growth plans with follow-through (SL assessments need a spine).
4. Delegation-level progression over time (are people moving UP the ladder?).
5. Accounts, sync, other real humans — permanently out of scope.
