# LeadOS — Leadership Operating System · v18.0 (Session-16 build)

A single-file, offline-first operating system for a leader **of team leads** — especially a new one. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step, **no network dependency at all** (icons are inline SVG; fonts are system fonts; it runs from a double-clicked file). The entire application is `index.html`; all state lives in `localStorage`.

Open `index.html` in a browser. That is the whole install. First boot seeds a tense example org so every instrument is visibly live; set yourself (`#/data` → identity), then erase the example when your real org arrives.

## Session 16 — what changed, and why (one line per non-obvious decision)

1. **Version is v18.0, record v:12 — not v17.** The on-disk file's `<title>` reads "v17.0" and its static DOM contains a boot-sequence splash, while README/log document v16.0: an undocumented WIP body no document owns — the exact anomaly class Session 15 already routed around once. *Why:* shipping another "v17" would collide with bytes we cannot attribute; v=12 accepts v1–v11 additively (unknown keys survive the migration spread — any WIP keys ride along untouched) and holds v>12 for decision.
2. **`#/up` — Managing up & sideways — is the v18 flagship.** Power × interest grid, per-stakeholder contact cadences, dated promises both directions, a **pre-meeting brief assembled from live instruments**, and the `stake-promise-hot` / `stake-contact` advisories. *Why:* the v16 module map covered the whole downward and inward game but had no upward surface — and "managing up" is the single biggest curriculum gap for a newly appointed leader-of-leads; bosses notice your absence before your team notices your presence.
3. **New capture verb: `ask: @stakeholder … by +Nd`** — logs a promise made TO you by a stakeholder, joins the same dated commitment ledger. *Why:* promises flow two ways upward too; an unpaid ledger in either direction teaches people your memory is decorative.
4. **The boot splash is now load-bearing doctrine, kept and extended.** Session 16's repo read (fourth consecutive session to hit the transport wall) discovered that the ONLY bytes of the on-disk file legible through this transport were the **static HTML of its splash** — everything inside `<script>` is stripped. *Why:* a richer static boot log is the one part of this file future sessions are guaranteed to be able to read; it now names lineage, record version, and engine stages even when nothing else survives the trip.
5. **Self-test wall raised to 24**, including three tests designed against failure modes this session's own seed exposed: seed-contaminated advisory assertions (t21 isolates `S.commitments`), lapse-count contamination (t15 isolates `S.feedback`), and no-disk-write during wall runs (t09 never re-saves). *Why:* a test that passes because the seed happens to arrange the world is an un-test wearing doctrine — Session 15 said this about their own t11; the same standard applied to mine caught two of mine.
6. **Wall-suppression flag on the BUS subscriber (`S._testing`).** Tests mutate `S` inside `runTestsIsolated` against a snapshot; the wildcard subscriber (persist → audit → render) must not chase them. *Why:* without it, `#/about` enters an infinite render loop — tests emit → render → tests re-run → emit. Found by trace before first boot, not by luck.
7. **`pruneExec` re-written as two plain filters.** The first draft chained a `keep`-set with a conditional operator so tangled a human re-read could not state its semantics. *Why:* code a reviewer cannot paraphrase is a defect that has not happened yet.
8. **No-verb capture routes to a prefilled case intake** (was an error toast in the first draft). *Why:* the doctrine says "no-verb text → a prefilled case intake, not a silent drop"; an error toast alone is the doctrine wearing lipstick.
9. **Agendas, readiness, team heat, NBM ranking are computed live at render — nothing precomputed is trusted.** The `agenda-fresh` audit survives, honestly scoped: it defends *imported* precomputed-agenda records. *Why:* stale derived state is the highest-frequency lie in apps like this; recomputation is cheap at this scale and never lies about *when* it was computed.
10. **Snooze governance unchanged:** dated snoozes wake themselves on expiry day (t08 executes the boundary); locked classes (escalation-open · hr-task-due · integrity-fault) cannot be snoozed at all, and a smuggled snooze is itself an audit fault with safe repair.

## The storage contract (unchanged lineage, extended)

- **Key: `leados.v6` — lineage key, deliberately never renamed.** The record carries the truth: `v:12`.
- **Migrations are additive and stepwise (v1…v11 → v12)** and announce themselves in the record's own migration trail and system log. No existing record is rewritten; unknown keys survive — including anything a v11-titled WIP body wrote.
- Newer records (`v>12`) and corrupt bytes are preserved at side keys (`leados.v6.superseded-<ts>` / `leados.v6.corrupt-<ts>`), main key untouched, in-memory blank **not saved** until you decide (`RECOVERY` mode gates `save()`; t19 executes the refusal).
- Quota: writes surface in the top bar (`saved HH:MM · N KB` → red `WRITE FAILED` with byte count and remedy). `quota-pressure` wakes past ~70% of the ~5MB estimate. `export-overdue` nags past 14 days. Imports: v12 direct, v1–v11 migrate in-memory; wrong shapes and newer records fail loudly **without touching state** (t12 executes both refusals). Merge re-mints every id and rewires the graph through one map — scalar refs, `linkIds`, `parties`, `slate`, `nine` — then re-runs the audits (t17 executes).

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), palette, or `C`. The intake shows a **live pre-commit preview** (Cynefin + move · Eisenhower · SLA runway · named trip-words · exact write list · duplicate detection · last lesson of this type from the academy). On commit the engine writes real, linked records into every routed module — evidence, playbook tasks, SBI draft (behavioral types), decision stub (sev≥4), goal at-risk flag (**bidirectional, owner-only**), cascade to the owning lead, cross-links on shared scope, mediation frame (two-party conflicts) — every write trapped in the case's **propagation ledger** with click-through routes.

- **Identical open duplicates are refused** and route you to the existing case.
- **Closure is checked, not assumed**: outcome + lesson mandatory, orphan playbook tasks cancelled _with a count_ (t06 executes that a foreign closure cannot clear a goal flag), lesson journaled to the academy, +30d verification armed, AAR owed for sev≥4.
- A delivered correction whose +21d verification lapses past the 7-day grace **auto-opens a feedback-gap case at boot** (idempotent via `lapsedCaseId`; t15 runs the sweep twice and requires 1 then 0).
- A **BUS event layer** carries every engine write; the wildcard subscriber persists → re-audits → re-renders (suppressed during the test wall). The per-case ledger remains the durable record; the bus is how modules *receive*.

## The hard stop (unchanged, non-negotiable)

Intake keyword-scans (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation, racism, sexual, abuse, violence). A hit re-classifies to a **sealed HR escalation before commit**, names the trip-words live, and requires two deliberate acknowledgments. The machine writes exactly four wires: case record, verbatim evidence, an unsnoozable HR-contact task dated today, and an agenda pin (t04 executes the wire count; audit class `ethics-wires` flags any deviation). PIP and separation templates do not exist in this codebase. Three advisory classes cannot be snoozed: **escalation-open · hr-task-due · integrity-fault**.

## Module map (24 nav routes + 2 detail routes)

| Route | Depth |
|---|---|
| #/today | Pace governor · **Next Best Move with its ranking printed** · dated work · commitment debt **both directions, yours first** · 7-day weight strip · positive lane · RECOVERY banner when bytes are quarantined |
| #/signal | Full rule ledger: locked / firing / positive / sleeping (dated snoozes). Every rule states **why it exists** and **when it clears**; quiet rows are earned by executable conditions |
| #/cases · #/case/:id | 11 intake types + sealed class · SLA runway bars · playbooks · checked closure · verify / honest re-open · AAR lane · propagation-ledger timeline · lesson recall from prior cases of the type |
| #/people · #/person/:id | Flight risk (weighted driver ledger, top-driver intervention) · trust equation (C+R+I)/S with weakest-numerator fix · clickable nine-box (staleness halves bench weight at 121d — t18 executes 120 vs 121) · morale telemetry with ≈ estimate chips · auto-agenda (regenerates live) · evidence ledger with case backlinks |
| #/oneonones | Cadence board · finish modal consumes the auto-agenda (discussed items get notes) · untouched sliders write estimated:true, enforced at write |
| #/feedback | SBI + live lint (**save blocks under 2/3 specificity**) · ageing clocks (praise 48h / corrections 72h) · +21d correction verification · balance board with sample size shown |
| #/goals | Direction-aware KR scoring (down-metrics) · check-ins with **confidence as the leading indicator** (≤2 auto-writes an unblock task) · trajectory-vs-waterfall printed · expired goals graded only with a causal lesson |
| #/decisions | Type-1/2 doors · premortem ≥3 (form gate + engine refusal) · decide writes choice+rationale · re-date requires a recorded reason, **rendered in history** · grading → calibration with sample-size honesty |
| #/handoffs | Cross-team debt · acceptance writes a dated commitment to the receiving lead · silence clock · "done" without acceptance refused as a **ledger lie** (t23 executes) |
| #/risks | RAID register: P×I exposure · trend · early-warning indicators in observable terms · owned dated mitigations · 14d review heartbeat · 5×5 heat map · materialize-into-case · graded retirement |
| #/talent | Succession seats: criticality, emergency cover, dated slates · readiness with **basis printed per row** (stale nine-box halves, HIGH flight −28) · assigned-vs-computed disagreement rendered as *your call, on the record* |
| #/promote | Evidence-first cases (≥2 ledger items to open) · sponsorship declared on the record · three bias recitals (recency · like-me · calibration) gate the verdict · +90d regret check armed on every decision |
| #/coach | GROW as a working document · one active skill per person (t22 executes the refusal) · reps become tasks **and** 1:1 agenda items automatically |
| #/delegation | Five-rung authority ladder · checkpoints auto-scheduled from the rung · boomerangs return work to _your_ desk with a task · average-rung ≤2.5 (n≥4) fires the micromanager advisory |
| #/mediation | Positions vs interests · session log · written agreements with owners+dates (become tasks for **both** parties at settle — t24 executes) · settle requires ≥1 agreement · +14d follow-through |
| #/health | Five dims per team · pulses with estimate marks · feeding signals printed (sev Σ, flight avg, silent handoffs) · weakest dim gets ONE concrete intervention |
| #/org | Spans/layers/vacancies + aggregate heat per team (formula printed) · span >8 named rumor-territory · **reorg sandbox** simulates a move (span deltas, succession gaps, flight resets) and commits only on apply |
| #/transition | 90-day clock off identity · three phases with doctrine · listening-tour coverage · early-win ledger (feeds `win:` capture) · drift advisory |
| #/ritual | Cadence clocks (lapsed says lapsed) · **agenda generated live from instruments**: NBM #1, top cases, ≥9 risks, silent handoffs, moved goals, firing advisories |
| #/review | Weekly brief with week-over-week deltas · "what I am avoiding looking at" scan · snapshots stored for trend · print stylesheet — the page is the brief |
| #/up **[v18]** | Power × interest grid · contact cadences · dated promises both directions · **pre-meeting brief assembled live** (their expectation, your owed promises, top cases by sev, a no-surprises prompt) · two advisories |
| #/academy | 12-competency model with **evidence-tied levels** (breakpoints printed, no self-rating) · searchable lesson journal (fed by closures, AARs, graded goals/decisions, retired risks, mediation settlements) · spaced drills resurface at matching case intake |
| #/data | Identity · storage meter · **12 audit classes** (8 with mechanical safe-repair; 4 flag-for-judgment) · export/import (replace / re-minting merge) · prune with double-confirm counts · example-org load/erase · system log · RECOVERY decisions |
| #/about | Judgment contract · hard refusals · **live counts computed from code** (incl. runtime zero-orphan cross-read of every data-a/data-f against ACT/FORMS) · **24 self-tests executed on open** · shortcuts · known limits |

## Live counts (grep-verified by Session 16 against the delivered file, in-session)

- **46 rules** (`grep -c "^R('" index.html` → 46: 3 locked · 37 advisory · 6 positive-lane)
- **12 audit classes** (`grep -c "^AUD(" index.html` → 12; 8 with safe repair)
- **24 self-tests** (`grep -c "^T('t" index.html` → 24)
- **0 forbidden-pattern hits** (`TODO|FIXME|XXX|lorem|coming soon|not implemented` → 0 matches)
- **44 form surfaces, zero orphans** (every `data-f="f-*"` in markup cross-read against `FORMS['f-*']` definitions by grep in-session; the runtime counter re-executes both form AND action sides against the live DOM on `#/about` and inside t20)
- **23 collections · 24 nav routes + 2 detail · 25 playbook entries across 11 case types** (computed live on `#/about` from `Object.keys`/array lengths, not author-claimed) · **dispatch surface ≈130 (actions + 44 forms)** — the 44-form side is grep-verified above; the action count is runtime-computed on `#/about` and the zero-orphan cross-read executes there against the live DOM

## Instrument honesty

Untouched 1:1 sliders and pulses write `estimated:true` (a pulse with NO touched slider auto-downgrades itself). Estimates render ≈ and dashed, **never move a slope, never clear an advisory**. Audit class `telemetry-honest` executes a probe (synthetic series with an injected estimate must equal the base series; t13 re-executes the same property). Advisory scores (flight / trust / readiness / calibration / heat) print their basis and sample sizes; their fixes are suggestions, never verdicts. *Write every note as if it will be read aloud in the grievance room* sits on every surface that writes about a person.

## Shortcuts & capture grammar

`/` or `Ctrl/⌘-K` palette · `C` register case · `1-9 0` jump (today · signal · cases · people · 1:1s · feedback · goals · decisions · handoffs · risks) · `Esc` close.

`case: …` · `commit: @name … by +3` · `owe: @name … by tomorrow` · `praise: @name …` · `note: @name …` · `win: …` · `risk: …` · **`ask: @stakeholder … by +Nd` [v18]** — dates: `today · tomorrow · +Nd · next week · YYYY-MM-DD`. Unparseable → **nothing written, said out loud**; unknown verb → said out loud with the verb list; no-verb text → a prefilled case intake, not a silent drop; first-name collisions resolve to the first match, audibly.

## Files

| File | Role |
|---|---|
| index.html | The entire application (~1,560 lines) |
| README.md | This file |
| AI-SESSION-LOG.md | Session-16 engineering record: repo verification, v17-title anomaly, transport-legibility finding, critique, v18 build record, QA ledger, defect ledger (9 items, all fixed), honesty ledger |

**Not in this delivery, on purpose (still live in the repo — flagged yet again, should be deleted tree-side):** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` (dead React/Vite scaffold, doctrine-forbidden, flagged four sessions running) and `SESSION-3.patch.md` (a stale patch against a pre-v12 architecture — a fuzzy-apply trap, flagged two sessions running).

## Known limits (held open, stated, not smoothed)

ISO-day strings, no timezone nuance · readiness/flight/trust/calibration/heat are advisory instruments with shown sample sizes, never verdicts · capture matches first names · the feedback-lapse arm runs at boot, idempotent via `lapsedCaseId` · audits repair only mechanics, never judgment · `agenda-fresh` audit mainly defends imported precomputed-agenda records (this build computes agendas live) · the seed is tense on purpose · the on-disk "v17.0"-titled WIP body was unreadable through this session's transport and is attributed **nothing** · **this session shipped without a browser**: the 24-test wall executes in-browser at every boot and on `#/about`, which is the shipped verification; everything claimed here is either grep-verified against the delivered file in-session or labeled a static trace · «decision stub» is a domain term (a pre-created decision shell), not a code stub.

**If any claim in this README disagrees with what `index.html` does, the file wins and the README is wrong.**
