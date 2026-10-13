# LeadOS — Leadership Operating System · v6.1 (Session-7 build)

An offline-first operating system for a leader of teams. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v6`, record version `v:6`) in one browser profile. Web fonts and icon sprites are presentation-only; system fallbacks keep everything functional offline. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. Software that hands a new leader answers produces a compliant operator who collapses the first time reality deviates from script — and creates legal exposure when someone acts on generated advice about a person without judgment. The division of labor is explicit, enforced in the UI, and restated in-app on `#/about`:

| The app owns | You own |
| --- | --- |
| Detection (**46 executable rules**), scoring (**24 pure models**), sequencing, drafting of *structure*, record-keeping, cadence, escalation timing | The judgment call |
| Forcing decisions/outcomes to be recorded with rationale and a review gate | Living with the outcome |
| The review loop that turns experience into skill — the actual leadership-course substitute | Reading the loop honestly |
| Escalation timing (hard-stops to HR) | The humanity of that room |

The hard-stop: the case intake keyword-scans every registration (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threats, assault, accommodation). A hit **reclassifies the case to the HR domain before you commit**, names the words that tripped it (live, in the intake preview), and requires a deliberate double-commit. On commit the machine writes exactly three things: the case record, the verbatim evidence, and an **unsnoozable HR-contact task dated today**. Audit class `ethics-wires` fails loudly if an ethics case ever carries any other wire. PIP and separation scripts do not exist anywhere in the codebase. The mediation protocol halts in one write to an HR escalation case the moment protected-class content surfaces. Three advisory classes cannot be snoozed: **escalation-open · HR-task-due · integrity-fault.**

## The case spine (architectural core)

Register a case **once**, anywhere — the top-bar button, the quick-capture box, any person page, or `C`. The intake shows a live classification preview before you commit: Cynefin domain with move hint · Eisenhower priority · severity SLA runway · keyword reclassification with the hit words named · the exact list of writes · the lesson journaled at the last closed case of the same type. The engine then:

1. Selects the type's dated playbook (2–3 tasks) into the task stream.
2. Writes real, linked records into every routed module across **11 wire kinds** — evidence, 1:1 agenda injection, SBI draft, decision stub with gate, team note, goal at-risk flag, comms draft, HR hard-stop, closure verification, AAR arming, playbook tasks — every write trapped in the case's **propagation ledger** with click-through routes on the case page.
3. **Refuses identical open duplicates** (idempotent intake: type + scope + title) and routes you to the existing case.
4. **Cross-links related open cases** — two live cases on one scope is a pattern, surfaced on both cases and as an advisory.
5. Closure is **checked, not assumed**: outcome + lesson mandatory, orphaned playbook tasks cancelled with a count, lesson journaled to the weekly review, +30d verification armed (verify or re-open), AAR armed for sev ≥ 4, and the `tuition-unpaid` advisory holds until the AAR exists.

## Module map — 19 renderers (17 routes + 2 detail views)

| Route | Depth |
| --- | --- |
| #/today | Engine-ranked top-3 · sessions due with pre-built agendas · commitment debt (broken-by-you vs owed-to-you) · week strip · quick capture |
| #/inbox | 46 rules · severity order · 3 locked classes · dated snooze · positive-signals lane · full rule ledger |
| #/cases · #/case/:id | 10 types · SLA runway bars · playbooks · known failure modes inline · propagation ledger · cross-links · checked closure · verify/re-open |
| #/review | Auto 7d digest · 8-week case pressure spark · 60-second upward brief (copy) · guided ritual · lesson journal |
| #/people · #/person/:id | Flight risk (weighted drivers + reasons) · trust equation sliders · nine-box click-stamp with 120d expiry · evidence ledger with case backlinks · ramp gates 30/60/90 · dev plan · auto-agenda queue |
| #/oneonones | Cadence adapts to flight risk (high → 7d) · 6-source auto-agenda consumed on finish · pulse telemetry honesty (untouched sliders write *estimated*, never move slopes) · commitments → dated loops |
| #/coach | GROW runner · live quality score (specificity, rich reality, 3-option floor, owned+dated way-forward) · question bank · commitments → loops |
| #/feedback | SBI/AID/COIN composer with live lint · ageing clocks (praise 48h / corrections 72h) · deliver → evidence + +21d verification · a lapsed correction auto-opens an underperformance case · balance board 60–85% zone |
| #/delegation | SLII skill×will → suggested style/rung · mismatch warnings both directions · boundary + checkpoint enforced · debrief verdicts feed the bench |
| #/mediation | Six stages, order enforced · two locked gates (1 & 4) with required notes · halt-to-HR in one write · agreement writes evidence to *both* parties + arms +14d verification |
| #/goals | Direction-aware KR scoring (down is a direction) · check-ins with confidence (leading indicator) · trajectory sparks · expired goals graded with mandatory causal lesson |
| #/decisions | Type-1/2 doors · premortem ≥3 enforced for Type-1 at form layer *and* audit class · re-date requires recorded reason · outcomes grade calibration |
| #/health | Fortnight 6-dimension pulse w/ deltas · Edmondson 7-item scan (correct reverse-scoring on 2/4/6) · five dysfunctions sequential stepper · bus-factor capability map |
| #/aar | Expected-vs-happened **numbers** · 5-whys with causality-word validation · blameless stop checkbox · improvements → owned dated loops · live quality score · "tuition unpaid" lane |
| #/academy | 8 lessons in 4 arcs × 3 scored checks each + application note · the refusal card for PIP/separation scripts |
| #/about | The judgment contract in-app · the refusals · module map · storage reality · shortcuts · live counts |
| #/data | 14 executable audit classes · safe-repair only where mechanically unambiguous · export/import with deterministic id re-mint + post-import audit · prune with counts · example org load/erase |

## Mentor rule set — 46, live-counted

The Data page prints the live count; this number is code, not prose. 3 rules are locked (unsnoozable). 4 are positive signals — the mentor reinforces verified closures, brightening measured mood, lesson streaks, and clean delegation handoffs, because detection-only mentors produce risk-averse operators. All clear-conditions are computable: an advisory that cannot clear does not ship. Commitment debt is audited in both directions — `comm-debt-you` (sev 2) outranks `comm-debt-them` (sev 1), because a mentor that only audits downward trains its user to audit downward.

## Model library — 24 pure scoring functions

All in `FW`: no I/O, no mutation, every one consumed by a view or a rule. Flight risk with a weighted driver ledger (cadence breach, measured mood slope, recognition gap, lapsed corrections, open cases, growth signal, broken-by-you commitments) · direction-aware KR scoring · Edmondson reverse-scoring · SLII style suggestion · GROW/AAR/SBI quality · trust equation · feedback balance zone · decision calibration · Cynefin/Eisenhower classification · health composite · bus risk · load/pressure · case SLA · nine-box bands with 120d expiry · estimated-aware mood slope.

## Instrument honesty

1:1 pulse sliders are telemetry. Touch tracking flags untouched pulse writes as `estimated:true`; the flag is omitted on measured entries so legacy and seed data stay lean. Estimates render with an `≈` chip, never move a slope, never trigger or clear an advisory. Audit class `telemetry-honest` **executes a probe** — it runs `FW.moodSlope` on a synthetic series with estimated entries and asserts the result equals the same series without them — plus checks flag sanity at runtime.

## Storage reality (stated plainly, and in the UI)

* ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile. Cleared if you clear site data. No sync, no recovery.
* Contains notes about named individuals that may be disclosable in a grievance process — **write every note as if read aloud in that room.**
* Failed writes surface in the top bar, never silently (`saved HH:MM` → red `WRITE FAILED`).
* **Export weekly**; the `export-overdue` advisory nags past 14 days.
* Imports are `v:6`-only: wrong shapes fail loudly without touching state; merge mode deterministically re-mints ids and runs a post-import audit.

## Shortcuts

| Key | Action |
| --- | --- |
| / or Ctrl/Cmd-K | Command palette — modules, people, commands |
| C | Register a case (live classification + propagation preview) |
| 1 2 3 0 | today · inbox · cases · weekly review |
| 4 5 6 7 8 9 | people · 1:1s · feedback · coach · decisions · AAR |
| Esc | close modal / palette |

## Files

| File | Role |
| --- | --- |
| index.html | The entire application (shell, design system, store, FW models, content, engine, mentor, views, integrity, seed, boot) |
| README.md | This file |
| AI-SESSION-LOG.md | Session-7 engineering record: critique, positions, changelog, QA, honesty ledger |

First boot builds an **example org with the same field contracts the write paths produce** — six people (two of them leads with directs), five cases (SLA-breached underperformance, armed conflict with mediation at stage 2, closed crisis with unpaid AAR, stalled-goal wire, active ramp), an overdue delegation checkpoint with a rung mismatch, a rotting decision gate, stale KRs, dim-critical pulse dimensions, ageing drafts, and broken commitments in *both* directions — so the engine shows roughly twenty advisories on first paint. Set yourself (Data → You & org), then erase the example in `#/data` when your real org arrives.

## Honesty ledger (claims vs code)

* **Every count in this README is printed live on `#/data`.** 46 rules · 24 models · 19 renderers · 10 case types · 11 wire kinds · 14 audit classes · 8 lessons × 3 checks · 7 Edmondson items · 5 rungs · 6 mediation stages. If prose and code disagree, the Data page is the authority.
* **Session 7 is a reconstruction-continuation, not a byte-transplant of v6.** The v6 source could not pass whole through this tooling window; what was recovered verbatim is the design system, the full UTIL layer, 24 FW models (completed where the read truncated), the state contract (`leados.v6`, `v:6`, every collection array named by BOOT), and the doctrine embedded in the review/health/academy/about/data views. The middle layer — CONTENT, ENGINE, MENTOR, INTEGRITY, the operational views, SEED — was rebuilt against the README-as-contract *plus the field contracts provable from recovered consumers* (FW driver names, health/review view shapes, boot guards). Store key and record version were kept on purpose: an existing v6 store loads, degrades to empty states rather than crashes where a field differs, and is never silently migrated. See the session log for what this claims and what it does not.
* **The detector set was re-derived, not copied.** 46 was held as the contract number; the taxonomy under it (3 locked · 4 positive · 39 detectors, 13 categories) is this session's. Rule `no-1on1-ever` was consciously merged into `cadence-breach` (its null-session branch) to stay at 46 without redundancy.
* **Known limits held open:** dates are ISO-day strings (no timezone nuance); pressure is case-derived, not calendar-derived; nine-box staleness is view-time, not destructive; prompt/confirm dialogs appear in two protocols (mediation stage notes, decision re-dates) as deliberate friction, not polish debt; icon sprites and web fonts degrade gracefully offline.
