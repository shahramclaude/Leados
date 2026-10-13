# LeadOS — Leadership Operating System · v16.0 (Session-15 build)

A single-file, offline-first operating system for a leader **of team leads** — especially a new one.
Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no
build step, **no network dependency at all** (icons are inline SVG; fonts are system fonts; it runs
from a double-clicked file). The entire application is `index.html`; all state lives in
`localStorage`.

Open `index.html` in a browser. That is the whole install. First boot seeds a tense example org so
every instrument is visibly live; set yourself (`#/data` → identity), then erase the example when
your real org arrives.

## Session 15 — what changed, and why (one line per non-obvious decision)

1. **The ten routes v14 deferred are re-authored at full depth [v16 flagship]:** `#/promote`,
   `#/coach`, `#/delegation`, `#/mediation`, `#/health`, `#/org`, `#/transition`, `#/ritual`,
   `#/review`, `#/academy`. _Why:_ a leader of leads lives or dies on exactly these surfaces; a
   README that says "deferred" ten times is a product with ten holes, not a product.
2. **A real shared event layer now exists (`BUS` + propagation ledger).** v14 declared "no pub/sub
   by design — the ledger IS the event log." Position held against it: a ledger does not *notify*.
   Every engine op now emits a typed event; a wildcard subscriber persists, re-runs all audits, and
   re-renders. The ledger stays as the _durable_ record of what was written. _Why:_ the standing
   product rule is that when a case is registered anywhere, every related module receives it
   automatically — reception requires a bus, not just a log.
3. **Version is v16, record v:10 — not v15.** The on-disk file's `<title>` reads "v15.0" while
   README/log document v14.0: an undocumented WIP edit whose body this transport cannot read.
   _Why:_ shipping another "v15" would collide with bytes we cannot attribute; v=10 accepts v1–v9
   additively (unknown keys survive the migration spread) and holds v>10 for decision, so whatever
   the WIP wrote imports safely.
4. **`parseRecord(raw)` extracted as a pure function; self-test t11 executes it.** The old load path
   was untestable without touching real storage. _Why:_ "corrupt bytes → recovery, not silent blank"
   is now executed at every boot, not asserted in a comment.
5. **Self-test wall raised to 20, including:** foreign-closure goal-flag protection (executes the
   v14 t18 doctrine), idempotent feedback-lapse machine arm (fires once via `lapsedCaseId`), merge
   re-mint + rewiring, nine-box 121d staleness, SBI-lint save-gate, ledger-lie refusal, ethics
   4-wire count, recovery-gate save refusal.
6. **Live counts on `#/about` are computed from the app's own stringified source** (functions
   `.toString()`), including a runtime orphan check: every `data-f` surface must resolve in `FORMS`,
   every `data-a` in `ACT`. _Why:_ sessions 13–15 each found docs claiming counts their bodies
   could not be read to verify; the fix is counts that execute.
7. **Intake preview kept and sharpened:** Cynefin + move, Eisenhower, SLA runway, named trip-words,
   exact write list, duplicate detection, and the last lesson of this case type from the academy.
   _Why:_ trust is transparent reasoning shown *before* commit, not explanatory prose after.
8. **Three modal pseudo-forms rebuilt** (`f-close-modal`, `f-fb-modal`, `f-person-x`) after a trace
   found `data-f` orphans whose default-submit buttons would both act and trip the strict dispatcher.
   _Why:_ "the form must be its own evidence" policy is only as strong as its orphan rule — now
   enforced by the runtime counter, not by vigilance.
9. **Rule `session-planned` implemented for real** (was a never-firing placeholder in the first
   v16 draft — found on re-read, not by luck). _Why:_ a rule that cannot fire is theater; quiet
   rows must be *earned*.
10. **Snooze governance unchanged, extended:** dated snoozes wake themselves; locked classes
    (escalation-open · hr-task-due · integrity-fault) cannot be snoozed at all.

## The storage contract (unchanged lineage, extended)

- **Key: `leados.v6` — lineage key, deliberately never renamed.** The record carries the truth: `v:10`.
- **Migrations are additive and stepwise (v1…v9 → v10)** and announce themselves in the record's own
  system log. No existing record is rewritten; unknown keys survive.
- Newer records (`v>10`) are held for a decision; a silent downgrade is refused. Corrupt bytes are
  preserved at a side key (`leados.v6.corrupt-<ts>`), main key untouched, in-memory blank **not
  saved** until you decide (download-damaged / start-clean / import).
- Quota: writes surface in the top bar (`saved HH:MM · N KB` → red `WRITE FAILED` with byte count
  and remedy). `quota-pressure` wakes past ~70% of the ~5MB estimate. `export-overdue` nags past
  14 days. Imports: v10 direct, v1–v9 migrate in-memory; wrong shapes fail loudly without touching
  state. Merge re-mints every id and rewires the graph through one map, then re-runs the audits.

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), palette, any person page,
or `C`. The intake shows a **live pre-commit preview** (Cynefin + move · Eisenhower · SLA runway ·
keyword reclassification with trip-words named · exact writes · duplicate detection · lesson recall).
On commit the engine writes real, linked records into every routed module — evidence, playbook
tasks, SBI draft (behavioral types), decision stub (sev≥4), goal at-risk flag (bidirectional,
owner-only), cascade to the owning lead, cross-links on shared scope, mediation frame for two-party
conflicts — every write trapped in the case's **propagation ledger** with click-through routes.

- **Identical open duplicates are refused** and route you to the existing case.
- **Closure is checked, not assumed**: outcome + lesson mandatory, orphan playbook tasks cancelled
  _with a count_, goal flags cleared only by the closure that owns them (t6 executes a foreign
  closure), lesson journaled to the academy, +30d verification armed, AAR owed for sev≥4.
- A delivered correction whose +21d verification lapses past the 7-day grace **auto-opens a
  feedback-gap case at boot** (idempotent via `lapsedCaseId`, executed by t15).

## The hard stop (unchanged, non-negotiable)

Intake keyword-scans (harassment, discrimination, safety, medical, fraud, legal, retaliation,
self-harm, threat, assault, accommodation, racism, sexual, abuse, violence). A hit re-classifies to
a **sealed HR escalation before commit**, names the trip-words live, and requires two deliberate
acknowledgments. The machine writes exactly four wires: case record, verbatim evidence, an
unsnoozable HR-contact task dated today, and an agenda pin. Audit class `ethics-wires` flags any
fifth wire. PIP and separation templates do not exist in this codebase. Three advisory classes
cannot be snoozed: **escalation-open · hr-task-due · integrity-fault**.

## Module map (23 nav routes + 2 detail routes)

| Route | Depth |
|---|---|
| #/today | Pace governor · **Next Best Move with its ranking printed** · dated work · conduits due (HIGH flight compresses to 7d) · commitment debt **both directions, yours first** · 7-day weight strip · positive lane |
| #/signal | Full rule ledger: locked / firing / positive / sleeping (dated snoozes). Every rule states **why it exists** and **when it clears**; quiet rows are earned by executable conditions |
| #/cases · #/case/:id | 11 intake types + sealed class · SLA runway bars · playbooks · checked closure · verify / honest re-open · AAR lane · propagation-ledger timeline · lesson recall from prior cases of the type |
| #/people · #/person/:id | Flight risk (weighted driver ledger, top-driver intervention) · trust equation (C+R+I)/S with weakest-numerator fix · clickable nine-box (staleness halves bench weight past 120d) · morale telemetry with ≈ estimate chips · auto-agenda (regenerates from live state) · evidence ledger with case backlinks |
| #/oneonones | Cadence board · finish modal consumes the auto-agenda (discussed cases get notes) · untouched sliders write `estimated:true`, enforced at write |
| #/feedback | SBI + live lint (**save blocks under 2/3 specificity**) · ageing clocks (praise 48h / corrections 72h) · +21d correction verification · balance board with sample size shown |
| #/goals | Direction-aware KR scoring (down-metrics) · check-ins with **confidence as the leading indicator** (≤2 auto-writes an unblock task) · trajectory-vs-waterfall printed · expired goals graded only with a causal lesson |
| #/decisions | Type-1/2 doors · premortem ≥3 (form + audit) · decide writes choice+rationale · re-date requires a recorded reason, **rendered in history** · grading → calibration with sample-size honesty |
| #/handoffs | Cross-team debt · acceptance writes a dated commitment to the receiving lead · silence clock · "done" without acceptance refused as a **ledger lie** |
| #/risks | RAID register: P×I exposure · trend · early-warning indicators in observable terms · owned dated mitigations · 14d review heartbeat · 5×5 heat map · materialize-into-case · graded retirement |
| #/talent | Succession seats: criticality, emergency cover, dated slates (now/<1yr/1–2yr) · readiness with **basis printed per row** (stale nine-box halves, HIGH flight −28) · assigned-vs-computed disagreement rendered as _your call, on the record_ |
| #/promote **[v16]** | Evidence-first cases (≥2 ledger items to open) · sponsorship map declared on the record · bias recitals (recency · like-me · calibration) gate the verdict · +90d regret check armed on every decision |
| #/coach **[v16]** | GROW as a working document · one active skill per person · reps become tasks **and** 1:1 agenda items automatically |
| #/delegation **[v16]** | Five-rung authority ladder · checkpoints auto-scheduled · boomerang returns work to _your_ desk with a task · average-rung ≤2.5 (n≥4) fires the micromanager advisory |
| #/mediation **[v16]** | Positions vs interests · session log · written agreements with owners+dates (become tasks for both parties) · settle requires ≥1 agreement · +14d follow-through check |
| #/health **[v16]** | Five dims per team (trust/conflict/commitment/accountability/results) · manual pulses with estimate marks · feeding signals printed (sev Σ, flight avg, silent handoffs) · weakest dim gets a concrete intervention |
| #/org **[v16]** | Spans/layers/vacancies + aggregate heat per team · span >8 named as rumor-territory · reorg sandbox simulates a move (span deltas, succession gaps, flight resets) and commits only on apply |
| #/transition **[v16]** | 90-day clock off identity · four phases with doctrine · listening-tour coverage · early-win ledger (feeds `win:` capture) · drift advisory |
| #/ritual **[v16]** | Cadence clocks (lapsed says lapsed) · **agenda generated from live instruments**, not memory (top cases, ≥9 risks, silent handoffs, moved goals, advisories, NBM) |
| #/review **[v16]** | Weekly brief auto-compiled with week-over-week deltas · "what I am avoiding looking at" scan · snapshots stored for trend · print stylesheet — the page is the brief |
| #/academy **[v16]** | 12-competency model with **evidence-tied levels** (breakpoints printed, no self-rating) · lesson journal (searchable; fed by closures, AARs, graded goals/decisions, retired risks) · spaced drills resurface at matching case types |
| #/data | Identity · storage meter · **12 audit classes** with safe-repair only where mechanical · export/import (replace / re-minting merge) · prune with double-confirm counts · example-org load/erase · system log |
| #/about | Judgment contract · hard refusals · **live counts computed from code** (incl. zero-orphan cross-read of every action/form) · **20 self-tests executed on open** · shortcuts · known limits |

## Live counts (grep-verified against this file)

- **41 rules** (`grep -c "^  R\('" index.html` → 41: 3 locked, 32 advisory, 6 positive-lane)
- **12 audit classes** (`grep -c "AUD\('" index.html` → 12; 6 with safe-repair)
- **20 self-tests** (`grep -c "T\('t[0-9]*,'" index.html` → 20)
- **107 dispatched click actions + 10 form surfaces** (`^ '[a-z-]*':function` → 116 = 107 ACT + 9
  FORMS-literal, plus `f-grow` assigned by reference; runtime zero-orphan cross-read executes on
  `#/about` and reports any data-f/data-a without a handler)
- **22 pure FW models · 21 collections · 23 nav routes + 2 detail · 37 playbook entries across 11 case types**
  (printed live on `#/about` from `Object.keys`/array lengths, not author-claimed)

## Instrument honesty

Untouched 1:1 sliders write `estimated:true`. Estimates render ≈ and dashed, **never move a slope,
never clear an advisory**. Audit class `telemetry-honest` executes a probe (synthetic series with an
injected estimate must equal the base series) and flags malformed estimate flags. Advisory scores
(flight / trust / readiness / calibration) print their basis and sample sizes; their fixes are
suggestions, never verdicts. _Write every note as if it will be read aloud in the grievance room_
sits on every surface that writes about a person.

## Shortcuts & capture grammar

`/` or `Ctrl/⌘-K` palette · `C` register case · `1-9 0` jump (today · signal · cases · people ·
1:1s · feedback · goals · decisions · handoffs · risks) · `Esc` close.

`case: …` · `commit: @name … by +3` · `owe: @name … by tomorrow` · `praise: @name …` ·
`note: @name …` · `win: …` · `risk: …` — dates: `today · tomorrow · +Nd · next week · YYYY-MM-DD`.
Unparseable → **nothing written, said out loud**; unknown verb → said out loud with the verb list;
no-verb text → a prefilled case intake, not a silent drop. First-name collisions resolve to the
first match, audibly.

## Files

| File | Role |
|---|---|
| index.html | The entire application |
| README.md | This file |
| AI-SESSION-LOG.md | Session-15 engineering record: repo verification, anomaly report, critique, v16 build record, QA ledger, defect ledger, honesty ledger |

**Not in this delivery, on purpose (still live in the repo — flagged, should be deleted
tree-side):** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` (dead
React/Vite scaffold, doctrine-forbidden) and `SESSION-3.patch.md` (a stale patch against a pre-v12
architecture — a fuzzy-apply trap).

## Known limits (held open, stated, not smoothed)

ISO-day strings, no timezone nuance · readiness/flight/trust/calibration are advisory instruments
with shown sample sizes · capture matches first names · the feedback-lapse arm runs at boot,
idempotent via `lapsedCaseId` · audits repair only mechanics, never judgment · `agenda-fresh` audit
mainly defends imported precomputed-agenda records (agendas in this build are computed live, so
staleness is an import concern) · the seed is tense on purpose · the on-disk "v15.0"-titled WIP
body was unreadable through this session's transport and is attributed **nothing** · **this session
shipped without a browser**: the 20-test wall executes in-browser at every boot and on `#/about`,
which is the shipped verification; everything claimed here is grep-verified against the delivered
file, and `«decision stub»` is a domain term (a pre-created decision shell), not a code stub.

**If any claim in this README disagrees with what `index.html` does, the file wins and the README
is wrong.**
