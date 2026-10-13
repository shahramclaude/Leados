# LeadOS — Leadership Operating System · v10.0 (Session-10 build)

An offline-first operating system for a leader **of team leads** — especially one who is new in the seat. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v6`, record version `v:6`) in one browser profile. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. "Sit back and trust the app 100%" is refused in this build as in every build — confidence delegated wholesale produces a compliant operator who collapses the first time reality deviates from script. Trust here is **auditability**: every count in this README is printed live from code on `#/about` and `#/data`, the telemetry probe executes on every audit run, and the audit classes run on demand, not on request. The division of labor is enforced in the UI:

| The app owns                                                                                                                              | You own                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Detection (**54 executable rules**), scoring (**32 pure models**), sequencing, drafting of *structure*, record-keeping, cadence, pace, escalation timing | The judgment call         |
| Forcing decisions/outcomes/gates to be recorded with rationale and a review gate                                                          | Living with the outcome   |
| The review loop that turns experience into skill — the actual course substitute                                                            | Reading the loop honestly |
| Escalation timing (hard-stops to HR)                                                                                                      | The humanity of that room |

The hard-stop stands: case intake keyword-scans every registration (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation). A hit **reclassifies the case to an HR escalation before commit**, names the trip-words live in the intake preview, and requires a deliberate double-commit plus acknowledgment. On commit the machine writes exactly three things: the case record, the verbatim evidence, and an **unsnoozable HR contact task dated today**. Audit class `ethics-wires` fails loudly if an ethics case ever carries any other wire, and its safe-repair revokes the wire *records*, not just the ledger entries. PIP and separation scripts do not exist anywhere in the codebase. The mediation protocol halts in one write to an HR escalation case the moment protected-class content surfaces. Three advisory classes cannot be snoozed: **escalation-open · HR-task-due · integrity-fault**.

## New in Session 10 — the capture layer, and the single answer

v8.0's failure mode was not detection; it was **input friction**. A new leader drowning in meetings will not open forms, and an unfed mentor is a screensaver. Session 10 closes the loop between "the app watches" and "the app gets told":

* **Quick-capture command line** on `#/today`, one field, zero navigation:
  `case: Priya/Jonas clashed over deploys` · `commit: @jonas migration plan by +3` · `praise: @aiko blocked the drift release` · `note: @leo short answers again` · `win: freeze authority ratified`.
  Person resolution (`@firstname`), date grammar (`today / tomorrow / +Nd / next week`), and verb routing are all parsed locally; each verb writes the real record — commitment with a date, praise into the composer, note onto an evidence ledger, win onto the transition ledger. No prefix falls forward into a case draft instead of dying silent.
* **Next Best Move** — the machine's single answer, top of `#/today`: locked advisories outrank sev-3+ outrank the oldest dated task outrank positive moves. It names *why* it holds the top slot. Judgment stays yours; ordering is the machine's job.
* **Positive signals lane** is now first-class in the nav contract (`cadence-green · praise-flow · autonomy-trend · win-banked`) — a detection-only mentor produces a risk-averse operator, so the engine is required to also notice when you are *winning*.
* Everything from v8.0 carried and re-hardened: the case spine with 12 wire kinds, checked closure, the +30d verify/re-open loop, the machine's arm (lapsed correction → auto-case, idempotent, toast-announced), the 90-day transition protocol, and the bench.

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), command palette, any person page, or `C`. The intake shows a live pre-commit preview: Cynefin domain with move hint · Eisenhower quadrant with hint · severity SLA runway · keyword reclassification with trip-words named · the **exact list of writes** · duplicate refusal · the lesson journaled at the last closed case of the same type. The engine then:

1. Selects the type's dated playbook (1–3 tasks) into the task stream.
2. Writes real, linked records into every routed module across **12 wire kinds** — evidence, 1:1 agenda injection, SBI draft, decision stub with gate, team note, goal at-risk flag, comms draft, HR hard-stop, closure verification, AAR arming, **cascade to manager**, playbook tasks — every write trapped in the case's **propagation ledger** with click-through routes.
3. **Refuses identical open duplicates** and routes you to the existing case. Audit class `dup-cases` watches it hold.
4. **Cross-links related open cases** on shared scope — two live cases on one person or team is a pattern.
5. Closure is **checked, not assumed**: outcome + lesson mandatory, orphaned playbook/comms tasks cancelled with a count, goal at-risk flags cleared by the closure that owns them, lesson journaled, +30d verification armed (verify or re-open — re-open restarts the SLA clock, on the record), AAR armed for sev ≥ 4, `tuition-unpaid` holds until the AAR exists.
6. A correction whose +21d verification lapses past 7 days **auto-opens a feedback-breakdown case** (boot sweep, idempotent via `lapsedCaseId`, toast-announced) — the machine's arm, on the record.

## Module map — 21 renderers (19 routes + 2 detail views)

| Route                   | Depth |
| ----------------------- | ----- |
| #/today                 | Pace governor · **Next Best Move** · engine-ranked stack · **quick capture** · conduits due · commitment debt both directions · next-7-days strip · positive signals |
| #/signal                | 54 rules · locked lane · severity order · dated snooze (3d/7d) · positive-signals lane · full live rule ledger with per-rule state |
| #/transition            | 90-day protocol · 3 phases · 12 evidence-gated gates (signal live/pending + mandatory note; closing against pending is allowed and **visible**) · stakeholder map (influence × stance) · tour lane · win ledger |
| #/cases · #/case/:id    | 11 types · SLA runway bars · playbooks · failure modes inline · propagation ledger · cross-links · comms drawer · checked closure · verify/re-open |
| #/org                   | Lead rollup cards · span pressure · team-scoped pulse with stated fallback · **bench per lead** (`READY NOW / READY IN 6M / GAP` with reason ledger) · cascade doctrine |
| #/people · #/person/:id | Flight risk (weighted drivers + intervention menu) · trust equation + weakest-numerator fix · nine-box with 120d expiry (staleness halves bench value) · evidence ledger with case backlinks · ramp gates · auto-agenda · skip-levels · succession rank |
| #/oneonones             | Cadence board (HIGH risk → 7d automatically) · 6-source auto-agenda consumed on finish · skip-level booking · pulse telemetry honesty (untouched → `estimated:true`, ≈ chip, never moves slopes) |
| #/feedback              | SBI/AID/COIN composer + live lint · ageing clocks (praise 48h / corrections 72h) · deliver → +21d verification · lapsed → auto-case · balance board 60–85% zone |
| #/coach                 | GROW runner · live quality score · 12-question bank · arc history with trend |
| #/delegation            | SLII skill×will → style + suggested rung · mismatch warnings **both directions** · mandatory boundary + checkpoint · verdicts (autonomous / supported / bounced) feed the bench; bounced → re-contract task |
| #/mediation             | Six stages, order enforced · gates 1 & 4 require written notes · halt-to-HR in one write · agreement files evidence to **both** parties + arms +14d verification |
| #/goals                 | Direction-aware KR scoring (up/down/cap) · check-ins with confidence delta (leading indicator) · trajectory sparks · expired goals graded with mandatory **causal** lesson |
| #/decisions             | Type-1/2 doors · premortem ≥3 enforced at form layer *and* audit class · re-date requires recorded reason (history rendered) · outcome grading → calibration with sample-size honesty |
| #/health                | Fortnight 6-dimension pulse with deltas and team scoping · Edmondson 7-item scan (reverse-scored 2/4/6) · five dysfunctions sequential ladder (advances only on written evidence) · bus-factor capability map |
| #/aar                   | Expected-vs-happened **numbers** (quality/time/cost) · 5-whys chain validation · blameless stop · improvements → owned dated loops (written as commitments) · live quality score · tuition-unpaid lane |
| #/review                | Auto 7d digest · 8-week pressure spark · 60-second upward brief (copy; brackets are yours) · stamped ritual · lesson journal |
| #/academy               | 8 lessons in 4 arcs × 3 scored checks + mandatory application note (journaled) · the refusal card |
| #/about                 | The judgment contract in-app · the refusals · **live counts** · storage reality · shortcuts · capture grammar |
| #/data                  | You & org identity (drives the 90-day clock) · storage meter · 15 executable audit classes · safe-repair only where mechanically unambiguous · export/import (merge re-mints ids + rewires the person graph + post-import audit) · prune with counts · example-org erase · system log |

## Mentor rule set — 54, live-counted

3 locked (unsnoozable) · 4 positive signals · 47 detectors across 15 categories (cadence, people, org, transition, feedback, commitments, cases, delegation, goals, decisions, health, dysfunctions, mediation, coach, rhythm/system). Every clear-condition is computable: an advisory that cannot clear does not ship. `comm-debt-you` (sev 2) outranks `comm-debt-them` (sev 1) — a mentor that only audits downward trains its user to audit downward. Snooze is **dated** (3d/7d), never amnesia.

## Model library — 32 pure scoring functions

All in `FW`: no I/O, no mutation, every one consumed by a view or a rule. Flight risk with weighted driver ledger · direction-aware KR scoring + current · **confidence slope** · goal status · Edmondson reverse-scoring · SLII style · rung mismatch check · GROW quality · AAR quality · SBI/AID/COIN lint · trust equation + band · feedback balance zone · decision calibration (with sample-size honesty) · Cynefin · Eisenhower · health composite · bus risk · load pressure · case SLA · nine-box band + expiry · estimated-aware mood slope · five-dysfunctions sequencer · commitment debt · pace governor · org rollup · team pulse w/ fallback · **bench score** · team bench · transition signals · transition score · pressure series. Upstream contract said 28; the live count on `#/about` is the authority.

## Instrument honesty

1:1 pulse sliders are telemetry. Untouched sliders write `estimated:true` entries; estimates render with an `≈` chip, never move a slope, never trigger or clear an advisory. Audit class `telemetry-honest` **executes a probe** — runs `FW.moodSlope` on a synthetic series with estimated entries and asserts equality with the same series minus them — plus runtime bounds checks and per-session shape checks.

## Storage reality (stated plainly, and in the UI)

* ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile. Cleared with site data. No sync, no recovery. A live meter on `#/data` shows KB used against the cap.
* Notes concern named individuals and may be disclosable — **write every note as if read aloud in the grievance room.**
* Failed writes surface in the top bar (`saved HH:MM` → red `WRITE FAILED`), never silently.
* **Export weekly**; `export-overdue` nags past 14 days.
* Imports are `v:6`-only: wrong shapes fail loudly without touching state; merge mode re-mints ids, rewires `managerId` and all person references (including ids embedded in ledger routes), then runs a post-import audit.

## Shortcuts

| Key             | Action                                             |
| --------------- | -------------------------------------------------- |
| / or Ctrl/Cmd-K | Command palette — modules, people, commands        |
| C               | Register a case (live pre-commit classification)   |
| 1 2 3 4         | today · signal · cases · people                    |
| 5 6 7 8 9 0     | 1:1s · feedback · coach · decisions · AAR · review |
| Esc             | close modal / palette                              |

## Files

| File              | Role                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| index.html        | The entire application (shell, design system, UTIL, FW, CONTENT, STORE, ENGINE, MENTOR, INTEGRITY, SHELL, MODALS, VIEWS, ACTIONS, FORMS, IMPORT, SEED, BOOT)        |
| README.md         | This file                                                                                                                                                            |
| AI-SESSION-LOG.md | Session-10 engineering record: critique, positions held, changelog, QA ledger, honesty ledger                                                                        |

First boot builds an **example org with the same field contracts the write paths produce** — two leads (Mara: Priya + Jonas; Tomás: Leo + Aiko), five cases with full propagation ledgers (SLA-breached underperformance with cascade, cross-team conflict with a mediation stalled at stage 3, closed crisis with tuition unpaid, stalled goal with the flag wired, active ramp), an overdue delegation checkpoint, a live rung mismatch, a rotting decision stubbed from the crisis, stale and expired KRs, a slipping org pulse with two critical dimensions, ageing drafts, a lapsed correction inside its 7-day grace, commitment debt in both directions, and a day-24 transition (map drawn, 3 of 4 stakeholders toured, a hostile VP still unheard). The pace governor reads REDLINE on first paint, by design — every instrument is visibly live. Set yourself (#/data → You & org), then erase the example when your real org arrives.

## Honesty ledger (claims vs code)

* **Every count resolves to a live computation.** Rule count is `RULES.length`; model count is `Object.keys(FW).length`; renderer/route/case-type/wire/audit/lesson/gate/item counts print from their source tables on `#/about`. If prose and code disagree, `#/about` is the authority.
* **Session 10 is a reconstruction-continuation.** The upstream source could not pass whole through this tooling window (the same wall Sessions 9, 7, and 8 logged). Recovered verbatim: the doctrine, the state contract (`leados.v6`, `v:6`), the seed narrative, and the README-as-contract. Everything else was re-derived against that contract. Record version kept deliberately: existing `leados.v6` stores load with additive fields defaulted by boot guards — no silent migration, no destructive rewrite.
* **The seed is tense on purpose.** The exact advisory count on first paint is whatever Signal prints — that is the point of live counting.
* **Known limits held open:** ISO-day strings, no timezone nuance · pressure is case-derived, not calendar-derived · nine-box staleness is view-time, not destructive · org rollup attributes org-wide pulse to a team when no team-scoped pulse exists (stated on the card) · import-merge is append-only (no per-record dedupe beyond id re-minting) · transition gate signals compute from LeadOS state only — the machine cannot verify what happened in a room, which is exactly why the note is mandatory and the signal is only ever a hint · the quick-capture person parser matches first names — duplicate first names resolve to the first match (evidence stays auditable either way).
