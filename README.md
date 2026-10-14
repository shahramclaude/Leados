# LeadOS — Leadership Operating System · v24.0 (Session-22 build)

A single-file, offline-first operating system for a leader **of team leads** — especially a new one. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step, **no network dependency at all** (icons are inline SVG strokes; fonts are system fonts; styling is an inline `<style>` tag; it runs from a double-clicked file). The entire application is `index.html`; all state lives in `localStorage`.

Open `index.html` in a browser. That is the whole install. First boot seeds a deliberately tense example org so every instrument is visibly live; set yourself (`#/data` → identity, including your **arrival date** — it is day zero of the flagship), then erase the example when your real org arrives.

---

## READ FIRST — the estate-honesty statement for v24 (survives truncation)

**Session 22 verified by direct read (this session, via git-trees API + raw fetches + blob base64):**

| Item | Result |
|---|---|
| Tree listing: `index.html` **169,534 B** sha `1850d8d3` · README 18,348 B · Session-21 log 11,666 B · dead scaffold files | **VERIFIED** |
| README v23 (full) · AI-SESSION-LOG Session 21 (full, cross-checked raw vs blob base64) | **VERIFIED in full** |
| index.html splash + first ~4 KB CSS bytes (`v23.0 · leados.v6 · v:17 · #/cap`, root palette) | **VERIFIED** — v24 reuses the palette verbatim |
| The v23 **script body** (~160 KB) | **UNVERIFIED — tenth consecutive session at the transport wall.** Raw/Readability/blob/Sourcegraph all strip or truncate. v23 engine counts remain _specification-of-intent_. |
| **New finding:** v23 README's "61 rule classes" vs its own engine-reference | **DOC DEFECT, proven by arithmetic — the named list enumerates exactly 60** (3+6+1+50). Published here so the lineage's next session cannot unknow it. |

**Consequence:** v24.0 is **authored whole** over the documented v23 contract — the mechanism Sessions 19–21 used. What is new this session: the authoring session **re-read and grep-verified its own delivered file** before publishing any count, and statically re-executed all 48 test specs against it (four own-defects found and fixed pre-delivery; one own miscount caught). Runtime `#/about` recomputes the same counts from the live registries. Runtime wins disagreements.

---

## The machine contract, compressed

* **Storage:** key `leados.v6` (lineage, never renamed). Record carries truth: `meta.v:18`. Migrations v1–v17 → v18 are additive ensure-steps (per-version introduction table `INTRODUCED`); unknown keys survive the guard-spread and are enumerated by the `foreign-keys` audit; every migration stamps `meta.trail` + `meta.syslog`.
* **Quarantine:** corrupt bytes → `leados.v6.corrupt-<ts>`; newer records (`v>18`) → `leados.v6.superseded-<ts>`; pre-import dump → `leados.v6.preimport-<ts>`. Main key untouched until quarantine succeeds; in-memory blank **never saved** over quarantine — `RECOVERY` mode gates `save()`. Side keys retention-pruned (5/3/3 by kind).
* **Quota:** top bar shows `saved · N KB` plus a live `% of 5MB floor` pill; red `WRITE FAILED` on quota error (memory keeps state; disk lags — export never depends on the store). `quota-pressure` (locked) wakes at ≥70% metered over **all** lineage bytes; `export-overdue` (locked) nags at 14d.
* **Collections (v18 enumeration):** `people seats oneon pulse self meet goals cases feed dec hand risk rit nbm skip briefs commit sig snap aar purgeRuns infl del bench escp cap arr` (**27**) + `meta identity settings snooze playbook seeded`. **v18 adds `arr` — the arrival ledger.**
* **Engine counts at ship (grep-verified against the delivered file; `#/about` recomputes at runtime — runtime wins):** **69 rule classes** (3 locked · 7 positive · 3 info · 56 advisory) · **23 audit classes** (19 safe-repair · 4 flag-for-judgment) · **48 self-test slots t01–t48** (t09's verdict is harness-computed byte-equality) · **29 forms** · **25 views** (24 routes + person dossier) · **28 action handlers** · **15 capture verbs** · **27 collections**.
* **Boot order:** load/guard/migrate → audits (safe repairs, persisted once) → rule engine → self-test wall (isolated: state held and restored key-for-key, `WALLMODE` suppresses+counts write attempts; t09 proves `bytesBefore === bytesAfter` over all lineage bytes) → render. Wall verdict is a topbar pill on every screen; wall failures banner on every route. Views render inside try/isolation with an honest defect banner. **Renders never write disk.**
* **Case spine:** register once anywhere (top bar `case:` verb or dialog wizard). Live pre-commit preview recomputes on every keystroke: Cynefin + first move (labeled heuristic), Eisenhower quadrant, SLA runway (S5→1d · S4→3d · S3→7d · S2→14d · S1→30d), named trip-words, exact write routes, duplicate detection (14d, shared party), delegation below-ceiling hit, last playbook lesson of that type. Commit writes real linked records to every routed module in **one store transaction**: mediation frame (conflict) · SBI draft (behavior/performance) · decision stub at sev≥4 · owner+party commitments · person feed timelines · sig edges · trip-wire escalation · delegation decay events when a lead escalates below their ladder ceiling. Checked close refuses over orphan commitments (refusal printed, t22); closes set +30d verification; failed verify re-opens honestly with fresh SLA and a visible reopen counter.
* **Ethics machine:** trip-words arm **exactly four wires**: `sealed · sla-1d · no-aggregate · escalate-pinned` (t04). `ethics-open` is pinned and **cannot be snoozed** — not by the handler, not by rule logic (t08 proves both directions). `case-wires` audit (flag-for-judgment) polices integrity.
* **Estimate honesty:** estimated points store `estimated:true`, render hollow with a `·est` marker, and **never move slopes** (t21/t31 prove equality with/without extreme estimated points).
* **Live-at-render:** slopes, runways, coverage, meeting burn, ladder decay, bench cover, SLO breaches, capital balances, arrival posture — all recomputed at render; nothing derived is persisted (`agenda-fresh` flag audit polices this).
* **Flagship v24: `#/arrive` — the first-90-days contract** (details below).

---

## The v24 flagship: `#/arrive` — the first-90-days contract

The leader's own arrival instrument. A new leader-of-leaders is evaluated twice — once by the org, once by each team — on a rubric nobody hands them. `arr` entries are `{kind: exp|win|listen, …}`, day zero is `identity.startDate`, and every number on the page prints its formula:

* **Expectations exchange** — an explicit written trade with the boss (what they expect / what you need / how you'll both know). Fires `arr-exp-overdue` at day 14 without one. Re-read at day 30/60/90, then quarterly — cadence math proven exact (t48).
* **Listening tour** — required set = boss + seat holders + skips; coverage printed as an exact fraction (t46: 3/5 = 60% silent, 2/5 = 40% fires before day 60); stops unacted 21d fire `arr-stale-stop`; `acted` stamps the person's timeline.
* **Early-win ledger** — landed vs **verified**; verified requires someone other than you to say it mattered; unverified wins rot at 14d (t47); `arr-win-none` fires at day 45. *A win only you believe is a story, not a win.*
* **Phase** = days since start (t45, ±0.1d buffers named): `<30 Diagnose · <60 Align · <90 Commit · else Operate`.
* **Wire-in:** `arr:` capture verb · feed entries · person-dossier listening history · `arr-pos` says "on track" out loud when exp exchanged ∧ coverage ≥60% ∧ ≥1 verified win.

## What else a new multi-team leader needs (the staffing answer, updated)

Already instrumented: contact (1:1), telemetry (pulse/self, estimate-honest), ground truth (skip, n≥3 no-ambush gate), traction (goals, owner-gated flags), the case spine (wires, verified closes), decisions + decision-debt (premortems, AAR→playbook), risks, rituals, talent (nine-box + bench with printed cover), load economics (meeting purge with receipts, chair question), influence, delegation ladder (printed decay), escalation protocol (live SLO breaches, silence detection), political capital — and now **the arrival contract**. Ranked honest next gaps:

1. **Meeting-design studio** — purge economics exist; purpose/outcome/ritual-fit design does not. Medium depth. Candidate for v25.
2. **Narrative radar** — what the org believes vs what instruments show (skip themes × pulse divergence × decision outcomes). Primitives all live.
3. **Succession rehearsal** — bench names exist; a drilled "holder is gone for 30 days" game-day mode does not.

## Engine reference (names at ship — runtime `#/about` wins)

* **Locked (3):** `export-overdue` · `quota-pressure` · `recovery-active`.
* **Positive (7):** `oo-pos` · `pulse-pos` · `goal-pos` · `dec-pos` · `bench-pos` · `cap-pos` · **`arr-pos`**.
* **Info (3):** `case-verify-failed` · `load-chair-question` · `arr-no-start`.
* **Advisory families (56):** 1:1 (`oo-never`, `oo-overdue`) · `seat-vacant` · pulse (`pulse-stale`, `mood-slope-neg`, `team-pulse-low`) · cases (`ethics-open` pinned, `case-sla`, `case-due24`, `case-stale`, `case-verify-due`) · goals (`goal-no-owner`, `goal-overdue`, `goal-due7`, `goal-ungraded`, `goal-flag`) · decisions (`dec-review-due`, `dec-no-premortem`, `dec-stub-dormant`) · `commit-overdue`, `commit-due48` · skip (`skip-overdue`, `theme-echo`) · load (`load-meeting-cap`, `meet-unreviewed`, `load-focus-floor`, `load-energy-slope`, `self-stale`) · delegation (`del-none`, `del-decay`, `del-overdue`, `del-stuck`, `del-hoard`) · bench (`bench-empty`, `bench-stale`) · escalation (`esc-breach`, `esc-silent`) · influence (`infl-none`, `infl-overdue`, `infl-power-blind`) · capital (`cap-none`, `cap-overdraw`, `cap-concentrate`, `cap-oneway`, `cap-stale-ask`, `cap-dormant`) · risks (`risk-review`, `risk-s5`) · `ritual-lapsed` · `nbm-empty` · **arrival (`arr-exp-overdue`, `arr-listen-thin`, `arr-win-none`, `arr-win-unverified`, `arr-stale-stop`, `arr-review-due`)**.
* **Audits (23):** safe — `shape-core`, `dup-ids`, `refs-intact`, `links-symmetric`, `date-sane`, `commitment-shape`, `goal-flags`, `ledger-bounds`, `skip-integrity`, `case-integrity`, `telemetry-scale`, `load-integrity`, `infl-integrity`, `del-integrity`, `bench-integrity`, `esc-integrity`, `escp-integrity`, `cap-integrity`, **`arr-integrity`** · flag-for-judgment — `agenda-fresh`, `telemetry-honest`, `case-wires`, `foreign-keys`.
* **Tests t01–t48:** lineage-documented slots keep number and meaning (t04 wires, t08 snooze immunity, t09 byte-equality, t12 import refusal, t15 idempotency, t16 unknown verb, t17 merge rewire, t20 handler coverage, t21/t31 estimate honesty, t22 orphan-gated close, t24 SLA runway, t25/t32/t35 buffered boundaries, t37 import fuzz, t40 corrected ceiling, t43/t44 capital arithmetic); unpublished specs were session-assigned honestly (see Session-22 log §3). **New: t45 arrival phase boundaries · t46 coverage fraction exact · t47 win aging buffered · t48 review cadence across the 90-day boundary.**
* **Verbs (15):** `case:` · `oo:` · `fb:` · `goal:` · `risk:` · `dec:` · `hand:` · `skip:` · `meet:` · `me:` · `inf:` · `del:` · `esc:` · `cap:` · **`arr:`** (unknown verb → verb list, nothing written, t16).

## The storage contract (full)

* **One lineage key, forever:** `leados.v6`. The record's `meta.v` is the truth; v:18 today.
* **Migrations:** additive ensure-steps keyed off `INTRODUCED[2..18]`, non-destructive, trail-stamped. v1–v16 mechanisms inherited from the documented contract (never from legible bytes); v17 (`cap`) and v18 (`arr`) authored with the same ensure-step mechanism.
* **RECOVERY:** on corrupt bytes or a newer record, offending bytes quarantine to a side key, the main key is left untouched, the in-memory blank is **not saved**, and every route banners until the human decides at `#/data` (download the quarantine, or start clean — quarantine keys survive either choice).
* **Export/Import/Merge:** export is a full JSON dump, stamps `lastExport`. Import validates shape → migrates v1–v17 up → audits the candidate **before** acceptance → refuses junk and byte-identical payloads (t12/t37) → parks pre-import bytes. Merge re-mints every id and rewires every reference (`parties` plus `personId/ownerId/holderId/whoId/who/fromId/toId/seatId/caseId/fromCaseId/goalId/srcId`) through one map, then re-runs the audits (t17).

## Ownership notes for the human

* `package.json`, `package-lock.json`, `tsconfig.json` — **dead scaffold, tenth session flagged** (React 19 / Vite 7 / Tailwind 4 / GSAP). This app has no build; a tired future session will `npm install` and inherit a framework supply chain for a localStorage file. Delete tree-side (sessions can't do it for you).
* `SESSION-3.patch.md` — intents absorbed long ago; **delete tree-side**. Anchored patches against unreadable files are fuzzy-apply traps (its own header says so).
* The session logs are the project's only real history. Keep the chain unbroken: Session 22's log follows Session 21's (11,666 B, sha `2f60f683`).
* **First browser boot of v24 is this build's self-test wall's first execution** — as with every build in this lineage. It is, however, the first wall whose authoring session re-read its own bytes, grep-verified every published count, and statically re-executed all 48 specs before shipping. Read the splash verdict, then `#/about`, then export once — the export is your recovery image.
