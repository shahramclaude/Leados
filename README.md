# LeadOS — Leadership Operating System (Session 2 of the rebuilt lineage)

> ## DRIFT NOTICE — Session 4 audit, measured against `main`, February 2026
>
> **Everything below this notice is the Session-2 document, reproduced unchanged.** Its §0 table was accurate *when Session 2 measured it*. It is no longer accurate as a description of the present. Verified this session via GitHub Contents API + raw/CDN fetches:
>
> | Claim below (Session 2 era) | Measured this session | Verdict |
> |---|---|---|
> | `index.html` = **102,031 B** (sha `016ad463…`) | `index.html` = **337,974 B** (sha `963f7dad…`) | **STALE — build grew 3.3×** |
> | schema **2**, migrations `0→1→2` | shipped splash: **"session 3 build · schema v3 · migrations 0→1→2→3 armed"** | **STALE — an undocumented migration exists** |
> | self-test wall **T1–T14** | shipped splash: **T1–T18** | **STALE — four undocumented tests** |
> | jsDelivr ≠ raw (v19 splash vs Session-1 splash) | jsDelivr now serves the **Session-2** splash ("schema v2 · T1–T14") while raw serves **Session-3** | **DRIFT PERSISTS, advanced one build.** Cause still *inference* (CDN cache), labeled as such |
> | script body unreadable via this channel | re-confirmed in **two** fetch modes (text, html); only splash DOM survives | 4th confirmation across repo history |
>
> **Consequences, ranked:**
> 1. **Blocker:** the shipped engine (v3, T18) has no session log and no README contract. Nobody — human or AI — can state what migration `2→3` changes. Any live `leados:data` v2 store upgrades through an undocumented code path.
> 2. **Blocker (standing, unresolved):** `package.json` / `tsconfig.json` / 87,433 B `package-lock.json` describe a React 19 + Vite 7 + TS build with gsap, lenis, lucide-react and **zero source files**. Delete the scaffold; it contradicts the permanent constraint and invites a `npm run build` catastrophe.
> 3. **Real risk:** whether `SESSION-3.patch.md` (patches A/B) is actually applied to the shipped bytes is **UNVERIFIABLE** from outside a browser — its anchors target code no session has ever read, including this one.
> 4. **Nitpick:** five distinct byte sizes for "the" index.html now exist across repo docs (169,534 / 201,051 / 251,817 / 102,031 / 337,974). New rule adopted this session: **every measurement carries a measured-at date.**
>
> **Unverified by this session (labeled, not assumed):** existence and content of T1–T18; the rules engine; the case-spine fan-out; whether pulses carry `estimated`; SLA ladder values; quarantine behavior; whether the app boots clean. The Session-4 entries in `AI-SESSION-LOG.md` list exactly which two artifacts upgrade each of these from *unverified* to *verified*. The authority rule below stands — but it cannot substitute for docs that match the shipped build.
>
> ---

A single-file, offline-first leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**The authority rule, inherited and tightened:** `#/health` inside the app executes the claims below against the code paths production uses, and prints each assertion next to its observed value. Where this README and `#/health` ever disagree, `#/health` wins.

---

## 0. What this session verified about the repo itself, with sources

*(Session-2-era measurements — see DRIFT NOTICE above for current values. Retained unchanged for provenance.)*

Everything in this table was checked via API/HTTP this session, not repeated from any doc:

| Claim | Source | Verified result |
|---|---|---|
| `index.html` byte size on `main` | GitHub Contents API, this session | **102,031 B** (sha `016ad463…`) |
| Prior-README size claim for the old build | Session-1 README | 169,534 B — does not match 201,051 B it “verified,” neither matches 251,817 B in `SESSION-3.patch.md`. Three docs, three sizes. |
| What jsDelivr serves for `@main` | cdn.jsdelivr.net fetch this session | A **v19.0 splash**: storage lineage `leados.v6`, “contract v:13”, flagship `#/skip` |
| What raw.githubusercontent serves for `main` | raw fetch this session | The Session-1 rebuild splash (`#/health`, “of 5MB” vocabulary) |
| Why jsDelivr ≠ raw | — | **Unverified inference:** jsDelivr cache staleness. The mismatch is fact; the cause is not. |
| npm scaffold | `package.json` read this session | React 19 + Vite + Tailwind + lucide-react + `vite-plugin-singlefile`, plus `tsconfig.json` and 87,433 B `package-lock.json` — with **zero source files** in the repo listing. Dead tooling that contradicts the “no framework, no build step” contract. |
| Contents of the prior `index.html` script body | two fetches (raw + CDN) | **UNVERIFIED.** DOM extraction strips `<script>` content in this environment — the same transport wall the Session-1 log documents. No internal claim of that build (RULES array, T1–T10, `applyRegisterCase`, migration logic) could be independently confirmed by this session. |

**Blockers found and how Session 2 resolves them:**
1. **Dead build tooling vs “single file, no build”** → Session 2 is again one file; the scaffold should be deleted from the repo (advisory — this session ships the three deliverables only).
2. **Apparent flagship regression:** jsDelivr’s v19 splash advertises `#/skip` (skip-level instrument); the Session-1 README’s module list does not contain it → **skip-levels are rebuilt as a first-class module** (`#/skip`), feeding the narrative radar.
3. **Unverifiable inheritance** → Session 2 keeps the storage key and documented v1 shape, but upgrades only through validating migrations (`0→1→2`) that refuse and quarantine on any mismatch (T1, T2). `leados.v6`-era keys are surfaced read-only on `#/data`.

## 1. What it does, and how you verify it yourself

| Capability | Verify at |
|---|---|
| Schema versioning + guarded migrations (`0→1→2`) | `#/health` → **T1** |
| Corrupted/malformed/superseded storage quarantined, live key never overwritten | `localStorage.setItem('leados:data','{bad')` + reload; **T2** re-runs it against real localStorage and restores your key |
| Quota failure caught in the exact production write path (`trySetItem`) | **T3** (patches `setItem` to throw QuotaExceededError) |
| Second-run reseed bug impossible (`meta.seeded` permanent, not an emptiness check) | **T4**, plus: delete everyone after seeding, reload — roster stays empty |
| Case spine: one registration fans out atomically (escalation+SLA, risk on incident S≥4, party events, append-only log) | Register a case at `#/cases`, open it, read “Everywhere this case touched”; **T5** on a fixture |
| Close-case orphan refusal + logged override | Try closing a case with an open escalation; **T6** |
| Severity≥4 decisions force a premortem | **T7**, or try it on the seeded S4 case |
| Delegation decay at exact 11d/10d boundary | **T8** |
| SLA math: S5 breached at 2d, due-soon at exactly 1d, computed live never cached | **T9**, or `#/escalations` |
| Trends never claimed on <3 measured points; estimated pulses permanently excluded | **T10**, plus hollow dots + dashed “instrument begins” line on person pages |
| Goal dependency cycles refused with the full path named | **T11**, or try A→B then B→A at `#/goals` |
| Calibration lock requires named evidence (goal / delivered SBI / verified win) + nine-box | **T12**, or try locking the seeded draft |
| Import merge re-mints every id and rewires foreign keys; byte-identical-to-live refused | **T13**, or export and re-import at `#/data` |
| Integrity audit repairs dangling references (nulls, never drops) and logs each repair | **T14**, live at every boot, log on `#/data` |
| Every recommendation prints basis + confidence label with the rule that produced it | `#/home` — the “basis” monospace line under each finding |

*(Session-4 note: the shipped build advertises T15–T18. Their assertions are undocumented and unverified by any session with readable source.)*

## 2. Modules (all functional, all cross-wired through `STATE` + the event layer)

Home/R13-rule findings engine · Roster & person dossier (everything rolls up: 1:1s, pulses w/ provenance, cases, SBI, nine-box, bench, goals, delegations) · 1:1s (cadence math; closing writes a pulse, **untouched sliders → `estimated:true`, excluded from all trends** — doctrine adopted from `SESSION-3.patch.md`, reimplemented fresh since that file’s anchors target a build not on `main`) · Pulse (measured/estimated/legacy provenance, instrument-boundary tick on sparklines) · Goals (ownerless = visible defect; **cross-team dependency edges + cycle refusal**) · Cases (the spine) · Decisions (options+rationale+premortem gate+review dates+outcomes) · Escalations (fixed SLA ladder S5=1d…S1=30d, breach computed from today) · Risks (L×I, review nudges) · Delegation (5-level ladder, decay) · Rituals (cadence lapse) · Talent & bench (nine-box + named-successor seats) · Meetings (load audit + **design studio** that commits redesigns as reviewable Decisions) · Arrival 90d (boss-expectations day-14 nudge, listening-tour 60%-by-day-60, early wins that **refuse to count unverified**) · **Skip-levels** (restored flagship) · **Calibration** (narratives gated on linked evidence) · **Narrative radar** (stated themes via fixed lexicon vs instruments; confidence printed) · **Succession rehearsal** (game-day exposure computed from live goals/cases/delegations; committable as a case) · Data & backup · System health.

New this session: skip-levels, calibration, goal dependency map, narrative radar, meeting studio, succession rehearsal. Justification for each is the repo’s own ranked gap list plus the v19 flagship regression — citations in Session 2 of `AI-SESSION-LOG.md`.

*(Session-4 note: this list describes the Session-2 build. Whatever the Session-3 build added beyond it is not documented anywhere in this repo.)*

## 3. Storage contract

- Key `leados:data`; `meta.schemaVersion` = **2** is the source of truth. *(Session-4 note: shipped splash says **3** with `2→3` armed. The delta is undocumented — this is Blocker 1 of the drift notice.)*
- Parse/shape/version-quarantine keys: `leados:data.<corrupt|malformed|superseded|migration-failed|pre-import>.<ts>` — never overwritten, browsable (with legacy keys, read-only) at `#/data`.
- `trySetItem` is the only write path; quota errors set a persistent red `WRITE FAILED` pill and in-memory state is preserved.
- Export = full JSON. Import validates → refuses newer → migrates older → refuses byte-identical-to-live → snapshots current state → merge (id re-mint + FK rewiring) or replace.
- Seed rows are tagged `seed:true` and one-click purgeable; purging can never trigger reseeding.

## 4. Explicit non-claims

- “5MB” quota floor is an assumption, labeled as such in-app (real limits aren’t JS-queryable).
- `#/health` = fixture-based self-assertions run by the app — real code paths, but not browser automation, not a fuzzer.
- Prior-build internals remain unverified by this session (see §0).
- This session had **no JS execution sandbox** for authoring; correctness was engineered by conservative construction and self-review (five self-introduced defects were caught and fixed that way, listed in the log), and the runtime grader is `#/health` in your browser — same honest standard the project set for itself, stated rather than implied.

## 5. What a multi-team leader still needs (next gaps, ranked)

1. Calibration **history across cycles** (locked narratives are snapshots; trend-of-judgment isn’t modeled).
2. Peer/360 input capture for calibration evidence.
3. Meeting-load **time series** (weeks exist; trend view doesn’t).
4. Cross-cycle goal dependency **aging** (edge exists; per-edge latency doesn’t).
5. Anything requiring accounts, sync, or coordination with real other humans — permanently out of scope by the product’s own constraints.

*(Session-4 additions, from the standing engine spec, not yet evidenced in any documented test list:)*
6. **Per-rule golden test cases** — the current wall tests storage/logic paths; the mandated engine rules (cadence overdue, decision review lapse, goal stall/no-owner, feedback imbalance, delegation load, conflict recurrence, burnout) need one labeled fixture each: input events in → expected finding + basis + confidence out.
7. **Structured playbooks pre-filling from live data** — Situational Leadership (D1–D4 → S1–S4 matching), SBI/DESC scaffolding, delegation-level guidance. SBI exists as an evidence type; the *scaffolded playbook* layer is not documented as existing.

---

## 6. Session 5 — mf-1: re-platform to the mandated multi-file architecture

*(Session 5, February 2026. New lineage `mf` — the standing brief has always required `index.html` + `css/` + `js/` via plain script tags; every prior lineage shipped a monolith, so this is the first build on the specified architecture. Code is byte-authored, self-reviewed, and grepped — **but this environment has no JS runtime**, so the grading authority is `#/health` in your browser, per this repo's own convention.)*

### Files

| File | Role |
|---|---|
| `index.html` | shell, splash, nav; loads css/js in order — no build step, no network calls |
| `css/app.css` | editorial tool surface: ink `#1C1917` on paper `#F7F4EF`, one accent `#C23B2E`, hairlines, single 46rem column, 640px breakpoint |
| `js/store.js` | storage spine: one key, schema v1 (`lineage:"mf"`), quarantine-on-any-mismatch, `trySetItem` only write path, import pipeline (refuse newer/foreign/identical, merge re-mints ids + rewires FKs), self-audit |
| `js/events.js` | append-only event store + projections (open decisions/goals/delegations/conflicts recomputed per read — nothing derived is persisted) + seed/purge |
| `js/engine.js` | 7 mandated rules, pure `(state, today) → findings`; every finding = what + basis lines + confidence (level + why); doctrine constants named; golden fixtures G1–G9 |
| `js/ui.js` | Today (ranked findings, actions pre-fill the resolving event), Roster, Health (T1–T8 live-path + G1–G9 golden walls), Data (export/import, key browser, audit log, quarantined bytes read-only) |

### Claims added by mf-1 and where to verify

| Claim | Verify |
|---|---|
| All 7 mandated rules with basis + confidence; none states certainty it lacks (trends need ≥3 measured points; estimates excluded; missing fields skip, never infer) | `#/health` G1–G9, or seed samples and read `#/today` |
| Rules fire on exact boundaries only (`>` cadence, `<` review date, `>` 14d stall) | G9 |
| Malformed events (null FKs, string numbers, bad timestamps) never crash the engine | G8 |
| Live-path storage claims: cold boot, corrupt quarantine byte-exact, quota caught in production write path, reseed impossible, newer/foreign quarantined, identical-import refused, audit repairs without dropping rows | T1–T8, executed at each `#/health` render, test keys `leados:test*` cleaned after |
| Every engine-consumed event type is writable from the UI (quick-capture), closing the observe→act→recompute loop | `#/today` → Log event; finding action buttons pre-fill the resolving form |

### mf-1 non-claims (stated, not implied)

- **Monolith `schema v3` stores are quarantined as `foreign`, not migrated.** Nobody has read the 2→3 delta; inventing a migration would fake certainty. Bytes are preserved and browsable at `#/data`.
- Event types without writer UI in prior builds (decisions, goals, feedback, delegations, conflicts, pulses) **are** writable here via quick-capture; structured playbooks (Situational Leadership matching, SBI/DESC scaffolds, delegation-level guidance) are **not yet built** — Part 3 slice, stated ahead of time.
- T/G counts are measured at runtime by the wall itself; no count is asserted in this document.
- Authoring environment had no JS execution: correctness rests on conservative construction, self-review (four defects caught and logged), static grep audits, and your browser's `#/health`.
