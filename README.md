# LeadOS — Leadership Operating System · v14.0 (Session-14 build)

A single-file, offline-first operating system for a leader **of team leads** — especially a new
one. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials,
no build step, **no network dependency at all** (icons are inline SVG; fonts are system fonts; it
runs from a double-clicked file). The entire application is `index.html`; all state lives in
`localStorage`.

Open `index.html` in a browser. That is the whole install. First boot seeds a tense example org so
every instrument is visibly live; set yourself (`#/data` → identity), then erase the example when
your real org arrives.

## Session 14 — what changed, and why (one line per non-obvious decision)

1. **`#/risks` — cross-team risk register (RAID) [v14 flagship].** Probability × impact,
   early-warning indicator in observable terms, owned dated mitigations, review heartbeat, trend
   (↓→↑), 5×5 exposure heat map, materialize-into-case, graded retirement. *Why:* v13 owned people
   (talent/promote) and debt (handoffs), but the one unowned sentence for a leader of leads is
   *what breaks between the teams while everyone is busy inside them*. This module owns it.
2. **Record v7 → v8, additive.** Migration adds `risks[]` (+ `auditFaults[]`); no existing record
   is rewritten; the chain announces itself in the record's own system log. *Why:* the storage
   contract is the product's spine — lineage key `leados.v6` is deliberately never renamed.
3. **`V.handoffs` added** (missing from the first v14 draft) with the ledger-lie doctrine enforced
   at the button: *done* requires *accepted* first. *Why:* a reviewer's own grep caught the route
   falling through to `/today` silently.
4. **Case intake now has the goal-link select.** The bidirectional at-risk flag existed in the
   engine but had **no UI path** — only seeds could set it. *Why:* a write with no reachable
   surface is a stub wearing doctrine.
5. **Slate management is now reachable** (button on each seat + inside the seat modal). The modal
   existed; nothing dispatched it. *Why:* found by the data-a cross-read, not by luck.
6. **All form reads go through FormData.** *Why:* `form.title` resolves to `HTMLElement.title`,
   not the control — a real crash class in the first draft, fixed by policy, not by patch.
7. **Boot self-tests run behind a write-guard (`__TM`), so fixtures can't clobber real storage.**
   *Why:* test t18 exercises `ENG.registerCase` against a swapped-in fixture; without the guard it
   would persist fixture data over your org at every boot.
8. **Palette keyboard selection is rendered inline (background + inset marker).** *Why:* it was
   invisible in v12 (defect C1); this build renders it on every draw, structurally.
9. **v13 routes not re-authored — labeled, not silently dropped.** `#/promote`, `#/coach`,
   `#/delegation`, `#/mediation`, `#/health`, `#/org`, `#/transition`, `#/ritual`, `#/review`,
   `#/academy`. *Why:* this session could not read v13's 284 KB body through its transport
   (sanitized on four channels), and cargo-culting modules from a README violates the depth rule.
   The migration keeps all v7 collections intact, so those modules' data survives for a session
   that re-implements them against the real file.

## The storage contract (unchanged, deliberately)

- **Key: `leados.v6` — lineage key, intentionally not renamed.** The record carries the truth:
  `v:8`.
- **Migrations are additive and stepwise (v1…v7 → v8)** and announce themselves in the record's
  own system log. No existing record is rewritten.
- Newer records (`v>8`) are held for a decision; a silent downgrade is refused. Corrupt bytes are
  preserved at a side key (`leados.v6.corrupt-<ts>`), main key untouched, in-memory blank **not
  saved** until you decide (download-damaged / start-clean / import).
- Quota: writes surface in the top bar (`saved HH:MM · N KB` → red `WRITE FAILED` with byte count
  and remedy). `quota-pressure` wakes past ~70% of the ~5MB estimate. `export-overdue` nags past
  14 days. Imports: v8 direct, v1–v7 migrate in-memory; wrong shapes fail loudly without touching
  state. Merge re-mints every id, rewires the whole graph
  (people/teams/cases/goals/risks/seats/tasks/sessions/feedback/evidence/decisions/handoffs/AARs)
  through one map, then re-runs the audits.

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), palette, any person page,
or `C`. The intake shows a **live pre-commit preview**: Cynefin domain with move hint · Eisenhower
quadrant · severity SLA runway (5→1d, 4→2d, 3→4d, ≤2→14d) · keyword reclassification with
trip-words named · the **exact list of writes** · duplicate detection · the lesson journaled at the
last closed case of the same type. On commit the engine writes real, linked records into every
routed module — evidence, playbook tasks, SBI draft, decision stub (sev≥4), goal at-risk flag
(bidirectional, owned), cascade to the owning lead, cross-links on shared scope — every write
trapped in the case's **propagation ledger** with click-through routes.

- **Identical open duplicates are refused** and route you to the existing case (audit class
  `dup-cases` watches it hold).
- **Closure is checked, not assumed**: outcome + lesson mandatory, orphan playbook tasks cancelled
  *with a count*, goal flags cleared only by the closure that owns them (self-test t18 executes
  this against a foreign closure), lesson journaled, +30d verification armed (held, or honest
  re-open — SLA clock restarts, on the record), AAR owed for sev≥4 (`aar-due` holds until it
  exists).
- A delivered correction whose +21d verification lapses past the 7-day grace **auto-opens a
  feedback-breakdown case at boot** (idempotent via `lapsedCaseId`, toast-announced) — the
  machine's arm, on the record.

## The hard stop (unchanged, non-negotiable)

Case intake keyword-scans (harassment, discrimination, safety, medical, fraud, legal, retaliation,
self-harm, threat, assault, accommodation, racism, sexual, abuse, violence). A hit re-classifies to
a **sealed HR escalation before commit**, names the trip-words live, and requires two deliberate
acknowledgments. The machine writes exactly four wires: case record, verbatim evidence, an
unsnoozable HR-contact task dated today, and an agenda pin. Audit class `ethics-wires` fails loudly
on any fifth wire; safe-repair revokes the wire records. PIP and separation templates do not exist
in this codebase. Three advisory classes cannot be snoozed: **escalation-open · hr-task-due ·
integrity-fault**.

## Module map (13 nav routes + 2 detail routes)

| Route                  | Depth |
| ---------------------- | ----- |
| `#/today`              | Pace governor · **Next Best Move with its ranking printed** (locked > SLA breach > your debt > risk exposure > oldest dated > positive > signal) · dated work · conduits due (HIGH flight compresses window to 7d) · commitment debt **both directions, yours first** · 7-day weight strip · positive lane |
| `#/signal`             | Full rule ledger: locked / firing / positive / sleeping (dated snoozes). Every rule states **why it exists** and **when it clears** |
| `#/cases` · `#/case/:id` | 11 intake types + sealed class · SLA runway bars · playbooks · checked closure · verify / honest re-open · AAR lane · propagation-ledger timeline |
| `#/people` · `#/person/:id` | Flight risk (weighted driver ledger + written intervention for the top driver) · trust equation (C+R+I)/S with weakest-numerator fix · clickable nine-box (view-time staleness halves bench weight past 120d) · morale telemetry with ≈ estimate chips and dashed estimate segments · auto-agenda · evidence ledger with backlinks |
| `#/oneonones`          | Cadence board · finish modal consumes the auto-agenda (discussed cases get notes) · untouched sliders write `estimated:true`, enforced at write |
| `#/feedback`           | SBI + live lint (**save blocks under 2/3 specificity**) · ageing clocks (praise 48h / corrections 72h) · +21d correction verification · balance board with sample size shown |
| `#/goals`              | Direction-aware KR scoring (down-metrics) · check-ins with **confidence as the leading indicator** · trajectory-vs-waterfall reasoning printed · expired goals graded only with a causal lesson |
| `#/decisions`          | Type-1/2 doors · premortem ≥3 (form + audit) · decide writes choice+rationale · re-date requires a recorded reason, **rendered in history** · grading → calibration with sample-size honesty |
| `#/handoffs`           | Cross-team debt · acceptance commitments auto-written to the receiving lead · silence clock · "done" without acceptance is refused and labeled a ledger lie |
| `#/risks`              | **v14** — RAID register: P×I exposure, trend, early-warning indicators, owned dated mitigations, review heartbeat, heat map, materialize-into-case, graded retirement |
| `#/talent`             | Succession seats: criticality, emergency cover, dated slates (now/<1yr/1–2yr) · advisory readiness with **basis printed per row** (stale nine-box halves, HIGH flight −28) · assigned-vs-computed disagreement rendered as *your call, on the record* |
| `#/data`               | Identity (drives the 90-day clock) · storage meter · **12 executable audit classes** with safe-repair only where mechanically unambiguous · export/import (replace / re-minting merge) · prune with counts · example-org load/erase · system log |
| `#/about`              | Judgment contract · refusals · **live counts** · storage reality · shortcuts · **18 self-tests executed on open** |

## v14 — deferred, labeled, not silently dropped

Not re-authored this session: `#/promote`, `#/coach`, `#/delegation`, `#/mediation`, `#/health`,
`#/org`, `#/transition`, `#/ritual`, `#/review`, `#/academy`. Reason: v13's 284 KB body could not
be moved through this session's transport (four channels attempted; script content sanitized each
time), and the standing rule against shipping docs-shaped code applies. All v7 data those routes
used is preserved by the migration; the evidence ledger, decisions, goals, sessions, and telemetry
they consume are all still being written here.

## Live counts (printed from code on `#/about`; grep-verified against this file)

- **34 rules** (`grep ^R\('` → 34: 3 locked, 6 positive-lane)
- **12 audit classes** (`grep \{id:'[a-z-]+',name:'[^']+',run:` → 12; 6 with safe-repair)
- **18 self-tests** (`grep \{id:'t\d+',t:` → 18)
- **27 form surfaces, all handled** (`grep data-f="` cross-read against `FORMS` — zero orphans)
- **every `data-a` value dispatched** (cross-read against `ACT` — zero orphans)
- **18 pure FW models** (`Object.keys(FW).length`, live on `#/about`)

## Instrument honesty

Untouched 1:1 sliders write `estimated:true`. Estimates render ≈ and dashed, **never move a slope,
never clear an advisory**. Audit class `telemetry-honest` executes a probe (synthetic series with
an injected estimate must equal the base series) and flags malformed estimate flags. **Write every
note as if it will be read aloud in the grievance room** sits on every surface that writes about a
person.

## Shortcuts & capture grammar

`/` or `Ctrl/⌘-K` palette · `C` register case · `1-9 0` jump (today · signal · cases · people ·
1:1s · feedback · goals · decisions · handoffs · risks) · `Esc` close.

`case: …` · `commit: @name … by +3` · `owe: @name … by tomorrow` · `praise: @name …` ·
`note: @name …` · `win: …` · `risk: …` — dates: `today · tomorrow · +Nd · next week · YYYY-MM-DD`.
Unparseable → **nothing written, said out loud**; unknown verb → a prefilled case intake, not a
silent drop. First-name collisions resolve to the first match, audibly.

## Files

| File              | Role |
| ----------------- | ---- |
| index.html        | The entire application |
| README.md         | This file |
| AI-SESSION-LOG.md | Session-14 engineering record: repo verification, critique, findings, v14 build record, QA ledger, defect ledger, honesty ledger |

**Not in this delivery, on purpose:** `package.json`, `package-lock.json`, `tsconfig.json`,
`vite.config.ts` (dead React/Vite scaffold — flagged in session 13's log, still present in the
repo, removed from this file set) and `SESSION-3.patch.md` (a stale patch document against a
pre-v12 architecture — a fuzzy-apply trap for future sessions).

## Known limits (held open, stated, not smoothed)

ISO-day strings, no timezone nuance · readiness/flight/trust/calibration are advisory instruments
with shown sample sizes · capture matches first names · the feedback-breakdown auto-open runs at
boot, idempotent via `lapsedCaseId` · audits repair only mechanics, never judgment · no pub/sub
event bus by design — the propagation ledger *is* the event log · the seed is tense on purpose and
the first-paint advisory count is whatever `#/signal` prints · **this session shipped without a
browser**: the 18-test wall executes in-browser at every boot, which is the shipped verification.

**If any claim in this README disagrees with what `index.html` does, the file wins and the README
is wrong.**
