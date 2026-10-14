# LeadOS — Leadership Operating System (Session 2 of the rebuilt lineage)

A single-file, offline-first leadership mentor for someone newly put in charge of **other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs, no OAuth, no build step, **no network calls (not even fonts)**. Open `index.html` — that is the install. All state lives in `localStorage` under one key.

**The authority rule, inherited and tightened:** `#/health` inside the app executes the claims below against the code paths production uses, and prints each assertion next to its observed value. Where this README and `#/health` ever disagree, `#/health` wins.

---

## 0. What this session verified about the repo itself, with sources

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

## 2. Modules (all functional, all cross-wired through `STATE` + the event layer)

Home/R13-rule findings engine · Roster & person dossier (everything rolls up: 1:1s, pulses w/ provenance, cases, SBI, nine-box, bench, goals, delegations) · 1:1s (cadence math; closing writes a pulse, **untouched sliders → `estimated:true`, excluded from all trends** — doctrine adopted from `SESSION-3.patch.md`, reimplemented fresh since that file’s anchors target a build not on `main`) · Pulse (measured/estimated/legacy provenance, instrument-boundary tick on sparklines) · Goals (ownerless = visible defect; **cross-team dependency edges + cycle refusal**) · Cases (the spine) · Decisions (options+rationale+premortem gate+review dates+outcomes) · Escalations (fixed SLA ladder S5=1d…S1=30d, breach computed from today) · Risks (L×I, review nudges) · Delegation (5-level ladder, decay) · Rituals (cadence lapse) · Talent & bench (nine-box + named-successor seats) · Meetings (load audit + **design studio** that commits redesigns as reviewable Decisions) · Arrival 90d (boss-expectations day-14 nudge, listening-tour 60%-by-day-60, early wins that **refuse to count unverified**) · **Skip-levels** (restored flagship) · **Calibration** (narratives gated on linked evidence) · **Narrative radar** (stated themes via fixed lexicon vs instruments; confidence printed) · **Succession rehearsal** (game-day exposure computed from live goals/cases/delegations; committable as a case) · Data & backup · System health.

New this session: skip-levels, calibration, goal dependency map, narrative radar, meeting studio, succession rehearsal. Justification for each is the repo’s own ranked gap list plus the v19 flagship regression — citations in Session 2 of `AI-SESSION-LOG.md`.

## 3. Storage contract

- Key `leados:data`; `meta.schemaVersion` = **2** is the source of truth.
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
