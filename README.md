# LeadOS — Leadership Operating System (mf-5 · Session 9)

A multi-file, offline-first leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**Lineage note (Session 9 audit, verified against the upstream `main` git tree, commit `e70ca24`, API `truncated:false`):** mf-4's README declared its drift structurally fixed — "this tree matches this file… `css/` and `js/` exist because they are real directories here." The verified upstream tree at that commit: **flat root, 14 entries, no `css/` or `js/` directories** — `app.css`, `store.js`, `events.js`, `engine.js` (43,626 B), `playbooks.js` (35,071 B), `ui.js` (52,269 B) at root, plus `package.json` (a **React/Vite/Tailwind manifest**, deps incl. gsap/lenis/lucide-react), `package-lock.json` (87,433 B — the exact size mf-4 cites as evidence of the sin it claims fixed), `tsconfig.json`, and both orphan fragments (`SESSION-3.patch.md`, `AI-SESSION-LOG.append.md`). **Third consecutive session with README⇄tree drift.** mf-5's response is executable, not rhetorical: **this tree matches this file**, and the app now *knows its own file list* — every module registers itself, and a missing file renders a fatal banner naming the path instead of a live-looking dead app (T13).

**The authority rule, inherited:** `#/health` executes the claims below against the code paths production uses — storage, migrations, quota, import, every engine rule against fixtures — and prints each assertion next to its observed value. Where this README and `#/health` disagree, **`#/health` wins. This document asserts no test counts; the wall counts itself.**

## Files

Nine entries at delivery; anything else is not part of mf-5. To sync upstream: `git rm` the six flat code files, `package.json`, `package-lock.json`, `tsconfig.json`, and both `.patch.md`/`.append.md` fragments.

| File | Role |
|------|------|
| index.html | shell: rail nav, quota pill, **boot module-registry guard** (missing js → fatal banner naming the path; no splash — a tool that hesitates looks broken), loads css + 5 js in order |
| css/app.css | editorial tool surface: ink #1C1917 on paper #F7F4EF, accent #C23B2E, hairlines, single ranked column, 640px breakpoint; meeting load = mono minutes + 1px ink bar |
| js/store.js | storage spine: one key, **schema v3, migration ladder 1→2→3**, quarantine-on-any-mismatch (7 kinds, timestamped, collision-suffixed, never overwritten), trySetItem-only write path, normalize-repairs-never-drops (events **and** people, mf-5), import pipeline (refuse unparseable/malformed/foreign/newer/identical; migrate same-lineage older; two-pass merge: mint all ids, rewire every reference **incl. reportsTo — mf-5 fix**), read-only boot on newer schema (mf-5), **log capped at 300 (mf-5)**, key browser |
| js/events.js | append-only event store + projections (recomputed per read — nothing derived is persisted) + conflict pair/nexus projections + **meetings projection (weekly min/person, mf-5)** + premortem projection (mf-5) + `lineToMe` with **cycle guard (mf-5)** + arrival projection + seed/purge (parameterizable — the health wall seeds a disposable store) |
| js/engine.js | **15 rules (R1–R15)**, pure (P, today) → findings; every finding = what + why (basis + source ids) + confidence (level + why) + printed score math sev × conf; rule exceptions surface as loud ENG findings; engine memory via snooze/dismiss/unmute **events** |
| js/playbooks.js | the mentor layer: 1:1 run sheet (standard / skip-level / load-cutting / nexus modes) · SBI · DESC · delegation ladder L1–L5 · situational D→S matching · decision review · goal review · **premortem (mf-5)** · **meeting-audit (mf-5)** · incident update · expectations charter · listening tour · early-win verification — all pre-filled from live data, all writing resolving events |
| js/ui.js | Today (single ranked column + quick capture + premortem nudge on sev≥4 decisions) · Roster + dossier (measured-only sparklines, meeting load, SL panel) · Arrival instrument · Playbooks drawer · Health (T1–T13 + G1–G17 live at render, disposable keys swept) · Data (export/import, key browser, audit log, muted findings w/ unmute, rule registry, seed/purge) |
| README.md | this file |
| AI-SESSION-LOG.md | append-only engineering log |

## The fifteen rules

R1 1:1 cadence overdue (strictly past per-person cadence; never-logged fires MEDIUM from `createdAt`) · R2 decisions past review with no outcome (severity inherits the decision's) · R3 goals ownerless or silent >14d · R4 feedback imbalance (≥80% either polarity, min 3 in 60d; missing polarity excluded and printed) · R5 delegation load (>4 open/person) · R6 repeated unresolved conflict **per pair** (linked = high, text = medium with drift priced, unnamed = low) · R7 overload — **measured pulses only**: mean load ≥8/10 and/or mood slope ≤ −0.4 over ≥3 points in 45d; estimated readings excluded and counted · R8 skip-level 1:1 overdue (verified line you → lead → skip, 28d; broken/cyclic lines silent) · R9 boss expectations uncaptured at day 14 · R10 listening-tour coverage (grace day 14, gate day 45, vs today's roster — stated assumption) · R11 early win past verify date · R12 incident silent ≥7d · R13 conflict nexus (≥3 open across ≥2 distinct resolvable counterparts — MEDIUM permanently: a count is not a diagnosis) · **R14 meeting load (mf-5): ≥480 declared recurring min/wk per person (8h = 20% of a 40h week — stated assumption); ad-hoc uncaptured, real load ≥ computed** · **R15 premortem gate (mf-5): open decision severity ≥4, age ≥2d (grace), no `premortem.held` linked — missing severity skips, never inferred.**

Non-negotiables: trends need ≥3 measured points; missing fields skip rather than infer; broken reporting lines go silent rather than guess; snooze/dismiss are events — suppression is auditable and reversible; every finding links the playbook that resolves it.

## Storage contract (v3 — unchanged by mf-5)

- Key `leados:data`; `meta.schemaVersion = 3`, `meta.lineage = 'mf'`.
- Migrations: `1→2` reportsTo backfill · `2→3` adds `meta.appointment`.
- **mf-5 added NO migration.** `meeting.series`, `premortem.held`, `goal.assigned`, `decision.severity`, person `createdAt` are additive fields inside rows/events the normalizer preserves by contract. Ceremony ≠ safety; recorded in `js/store.js`.
- Quarantine kinds: `corrupt · malformed · foreign · newer · migration-failed · pre-migration · pre-import` — timestamped, collision-suffixed, never overwritten, browsable read-only at `#/data`.
- Import: refuses unparseable/malformed/foreign/newer/identical-to-live; migrates same-lineage older; two-pass merge re-mints every id and rewires every `*Id`/`*Ids` reference **and `reportsTo`** (mf-5 fix: upstream regexes missed it — imported skip-level chains silently broke). Live bytes preserved `.pre-import.` first. People are appended re-minted; **same-named duplicates are possible — documented non-claim, ranked gap.**
- Quota: failure caught in the production write path → red `WRITE FAILED` pill, in-memory state intact. The ~5 MB budget is a labeled **assumption**.
- **Newer schema in storage → read-only boot**: live key untouched forever, banner shown, writes blocked. An old build must never clobber a newer database.
- Audit log **capped at 300 rows (mf-5)**; the cap itself leaves a row. Unbounded audit growth in a one-key store is how the store dies.
- Seeds tagged `seed:true`; `meta.seeded` set **before** rows; purge clears rows, keeps the flag.

## Verify it yourself

1. Open `index.html` → `#/health`. T1–T13 and G1–G17 executed at render, observed values printed, disposable `leados:t*` keys swept.
2. **Registry check:** rename `js/engine.js`, reload → fatal banner names the missing file and your data sits untouched. Rename it back. T13 is this same check, from the inside.
3. `#/data` → **Load sample set** → `#/today`: every rule fires at least once — R6 (Dana × Priya), R13 (Marcus), **R14 (Anika, 630 min/wk)** and **R15 (CI-vendor decision, sev 4, ungated 4d; the sev-4 re-seating at 1d is the deliberate grace contrast)**. Purge at `#/data`; the no-reseed flag stays.
4. `localStorage.setItem('leados:data','{bad')` → reload → boots clean; the corrupt bytes sit read-only in the key browser.
5. Hand `leados:data` a v99 schema blob → **read-only boot**, live bytes byte-identical after (T5 asserts it).
6. Import your own export → refused as identical. Import into an incognito window → merged, every id re-minted, skip-level chains intact (T9).

## Design direction (Session 6, kept Sessions 7–9)

Palette: paper `#F7F4EF`, ink `#1C1917`, hairline `#E3DECF`, one accent `#C23B2E`; confidence by weight/texture, not rainbow. Type: old-style serif display (Iowan/Palatino/Georgia), mono for all data/basis/score lines, 12–13px body — zero webfonts (no-network doctrine). Layout: 64px rail, single 760px column; Today is one prioritized column, never a tile grid. Density: 4px grid, hairline rows, mono metadata always visible. Motion: ≤160ms translate-only; custom inline SVG; text sparklines are block-glyph typography. Why kept a fourth session: identity churn mid-flight is how tools lose trust. mf-5 deltas: meeting load renders as mono minutes + 1px ink bar (glyph, not a new color); **the timed splash is deleted** — the fatal banner owns the dead case, so the live case should be instant. Checked at 640px by construction (rail horizontal, forms single column) — no visual sandbox exists here; labeled, not implied.

## Explicit non-claims

- No JS execution sandbox exists in this authoring environment (same constraint Sessions 6–8 reported). Correctness is by conservative construction + self-review; the runtime grader is `#/health` in your browser, by project convention. **All Session-9 code is first-run code — no session before you has executed it.**
- `#/health` = fixture-based assertions on real code paths — not browser automation, not a fuzzer; UI rendering itself is not graded.
- Upstream `engine.js`/`playbooks.js`/`ui.js`/`app.css` bodies were **not byte-readable** (fetch truncation, the defect S7/S8 also reported). They are **re-authored to the documented contract** (README rule parameters, storage contract, design tokens), not continued. `store.js` head was verified-carried; its import/load tail is re-authored, marked REV in the file. The mf-4 README's own "verified upstream tree" claim is verified **false** for mf-4 — see the lineage note.
- Whether upstream `index.html` points at flat or `css|js/` paths is **unverified** (tag extraction fails remotely); if it points at dirs, the upstream app boots to a rail and nothing else.
- Import merges people by re-minted append; same-named duplicates are possible. Accepted this session (ranked gap), not hidden.

## Next gaps, ranked

1. Coaching/growth plans with follow-through (SL assessments need a spine over time).
2. Delegation-level progression tracking — are people moving UP the ladder?
3. R6/R13 temporal weighting (flat 60d window currently; printed in the basis lines).
4. Premortem tripwire escalation: tripwires are stored text; a rule that asks "tripwire date passed — did you check the metric?" is the natural R16.
5. People-merge dedupe on import (by normalized name + role, opt-in).
6. Accounts, sync, other real humans — permanently out of scope.
