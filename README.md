# LeadOS — Leadership Operating System (mf-2 · Session 6)

> **Lineage note (Session 6 audit, measured against `main`):** the previous README's own §6 described an mf-1 build with files under `css/` + `js/`. The actual tree had them at **root** — doc verified wrong this session via GitHub Trees API. The drift notice in that README (index.html = 337,974 B monolith) was itself stale (actual: 1,920 B shell). mf-2 keeps the good spine, fixes the found defects, and **the tree now matches this file**. Full audit: `AI-SESSION-LOG.md`, Session 6.

A multi-file, offline-first leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**The authority rule, inherited:** `#/health` inside the app executes the claims below against the code paths production uses — storage, migration, quota, import, and every engine rule against golden fixtures — and prints each assertion next to its observed value. Where this README and `#/health` ever disagree, **`#/health` wins. This document asserts no test counts; the wall counts itself.**

## Files

| File | Role |
|---|---|
| `index.html` | shell, splash, rail nav; loads css/js in order — no build step, zero network |
| `css/app.css` | editorial tool surface: ink `#1C1917` on paper `#F7F4EF`, one accent `#C23B2E`, hairlines, single ranked column, 640px breakpoint |
| `js/store.js` | storage spine: one key, **schema v2 with a documented migration ladder (1→2)**, quarantine-on-any-mismatch, `trySetItem` only write path, per-event normalization (repairs, never drops), import pipeline (refuse newer/foreign/identical, merge re-mints ids + rewires FKs), boot audit |
| `js/events.js` | append-only event store + projections (recomputed per read — nothing derived is persisted) + seed/purge with permanent no-reseed flag |
| `js/engine.js` | **8 rules (R1–R8)**, pure `(state, today) → findings`; every finding = what + why (basis lines + source-event ids) + confidence (level + why) + **printed score math `sev × conf = score`**; engine memory via snooze/dismiss/unmute **events**; golden fixtures G1–G12 |
| `js/playbooks.js` | the mentor layer: 1:1 run sheet · SBI · DESC · delegation ladder · situational D1–D4→S1–S4 · decision review · goal review — all pre-filled from findings, all submitting **resolving events** through the shared layer |
| `js/ui.js` | Today (single ranked column), Roster + person dossier (measured/estimated trends), Playbooks, Health (T1–T10 + G1–G12 live at render), Data (export/import, key browser incl. read-only quarantines, audit log) |

## The eight rules

R1 1:1 cadence overdue (strictly past per-person cadence) · R2 decisions past review date with no outcome · R3 goals ownerless or silent >14d · R4 feedback imbalance (≥80% either polarity, min 3 in 60d) · R5 delegation load (>4 open per person) · R6 repeated unresolved conflict (≥2 in 90d) · R7 overload — **measured pulses only**: mean load ≥8/10 and/or negative mood slope over ≥3 points; estimated readings excluded and counted in the basis · **R8 skip-level 1:1 overdue** (reporting line `me → lead → skip`, cadence 28d, breaks silently if the reporting line is broken rather than guessing).

Non-negotiables: trends need ≥3 measured points; missing fields skip rather than infer; every action button pre-fills the playbook that resolves the finding; snooze/dismiss are events, so suppression is auditable and reversible.

## Storage contract (v2)

- Key `leados:data`; `meta.schemaVersion = 2`, `meta.lineage = 'mf'`.
- **Migration `1→2` (documented, tested by T10 with a byte-exact v1 fixture):** `reportsTo` default `'me'` backfilled on people; events normalized; pre-migration bytes preserved under `leados:data.pre-migration.<ts>` before any write.
- Quarantine kinds: `corrupt · malformed · foreign · newer · migration-failed · pre-migration · pre-import` — timestamped, never overwritten, browsable read-only at `#/data`.
- Foreign lineages (including the undocumented monolith `v3`) are **refused and preserved** — no migration is invented for code nobody has read.
- Export = full JSON. Import: refuses unparseable/malformed/newer/foreign/identical-to-live; migrates same-lineage older versions; merge re-mints every id and rewires `*Id`/`*Ids` references; per-event normalization at the gate.
- Quota: failure is caught in the production write path, sets a persistent red `WRITE FAILED` pill, in-memory state intact.
- Seeds tagged `seed:true`; one-click purgeable; `meta.seeded` is set **before** rows are written, so purged-then-reloaded never reseeds (T4).

## Verify it yourself

1. Open `index.html`. Go to `#/health`. Read T1–T10 and G1–G12 — every row executed at render, test keys cleaned after.
2. `#/data` → **Load sample set** → `#/today`: every rule has something to say, each with basis, confidence, and `sev × conf = score` printed. Purge samples; state stays empty forever.
3. `localStorage.setItem('leados:data','{bad')` → reload → boots clean; the corrupt bytes sit read-only in the key browser.
4. Register a case anywhere (Record event, or a playbook) and watch Today, the person dossier, and the engine all consume the same event stream.

## Design direction (decided Session 6)

Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DECF`, one accent `#C23B2E`; confidence by weight/texture, not rainbow. Type: old-style serif display stacks (Iowan/Palatino/Georgia), mono for all data/basis lines, 12–13px body — zero webfonts (standing no-network doctrine makes this a constraint, not a style). Layout: 64px rail, single 760px column; Today is one prioritized column, never a tile grid. Density: 4px grid, hairline rows, mono metadata always visible. Motion: ≤160ms translate-only. No gradients, glass, card-in-card, or emoji (inline SVG icons throughout).

## Explicit non-claims

- The ~5MB quota budget is an **assumption**, labeled as such in-app (real limits aren't JS-queryable).
- `#/health` = fixture-based assertions on real code paths — not browser automation, not a fuzzer. UI rendering itself is not covered by fixtures.
- This environment had **no JS execution sandbox** during authoring: correctness is by conservative construction + self-review (defects caught are listed in the session log); the runtime grader is `#/health` in your browser, by this repo's own convention.
- mf-1's unreadable internals (engine R2–R5 bodies, ui.js templates — truncated/stripped in two fetch modes, documented in the log) were **re-authored, not continued**. Divergences are labeled; nothing unread was claimed.

## What a multi-team leader still needs (next gaps, ranked)

1. **Arrival-90d instrument** (boss-expectations day-14 nudge, listening-tour coverage, early-win verification gate) — the "newly appointed" half of the persona is still underserved.
2. Conflict counterpart **graph** (counterpart is a string; recurrences across *pairs*, not just persons, would sharpen R6).
3. Playbook-drafted **mood-inferred pulses must never exist** — doctrine holds that only spoken numbers count; a UI affordance making "estimated" harder to forget than to check.
4. Meeting-load audit + decision premortem gate for S≥4 (both existed in older lineage sessions, unverifiable, worth rebuilding).
5. Anything requiring accounts, sync, or other real humans — permanently out of scope.
