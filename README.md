# LeadOS — Leadership Operating System · v8.0 (Session-9 build)

An offline-first operating system for a leader **of team leads** — especially one who is new in the seat. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v6`, record version `v:6`) in one browser profile. Web fonts and icon sprites are presentation-only; system fallbacks keep everything functional offline. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. "Sit back and trust the app 100%" is not a feature request this build accepts — confidence is how you get a compliant operator who collapses the first time reality deviates from script. Trust here is **auditability**: every count this README claims is printed live from code on `#/about` and `#/data`, the telemetry probe executes, and the audit classes run on every commit, not on request. The division of labor is enforced in the UI:

| The app owns | You own |
| --- | --- |
| Detection (**54 executable rules**), scoring (**28 pure models**), sequencing, drafting of *structure*, record-keeping, cadence, pace, escalation timing | The judgment call |
| Forcing decisions/outcomes/gates to be recorded with rationale and a review gate | Living with the outcome |
| The review loop that turns experience into skill — the actual course substitute | Reading the loop honestly |
| Escalation timing (hard-stops to HR) | The humanity of that room |

The hard-stop stands: case intake keyword-scans every registration (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation). A hit **reclassifies the case to HR escalation before commit**, names the trip-words live in the intake preview, and requires a deliberate double-commit. On commit the machine writes exactly three things: the case record, the verbatim evidence, and an **unsnoozable HR contact task dated today**. Audit class `ethics-wires` fails loudly if an ethics case ever carries any other wire, and its safe-repair revokes the wire *records*, not just the ledger entries. PIP and separation scripts do not exist anywhere in the codebase. The mediation protocol halts in one write to an HR escalation case the moment protected-class content surfaces. Three advisory classes cannot be snoozed: **escalation-open · HR-task-due · integrity-fault**.

## The transition layer (new in Session 9 — the operator's own first 90 days)

v7.x onboarded everyone except its own user. The stated user is *new in the position*; the first 90 days decide the tenure, and the app was silent on them. Session 9 makes the user's own transition a governed protocol, `#/transition`:

- **Three evidence-gated phases** (Diagnose d0–30 · Align d31–60 · Execute d61–90), **12 gates**. Every gate carries a machine-computed signal (map drawn, tour ≥60%/100%, cadence installed, wins on record, bench coverage) shown as `signal live/pending` — and still requires the user's **written evidence note** to close. Closing against a pending signal is allowed, and visible. That is the contract in miniature: the machine computes, the human commits.
- **Stakeholder map** — influence × stance grid. Stakeholders link to org-chart people when they are on it; hostile-and-heard beats friendly-and-assumed.
- **Listening tour** — a five-question bank wired into the 1:1 engine: logging a tour writes a real `kind:'tour'` session, stamps the stakeholder, and pushes a follow-through item onto the linked person's agenda. Tour sessions with no linked person are tolerated by the audit (off-chart stakeholders exist), and the audit was fixed to say so.
- **Early-win ledger** — wins must come from the tour, not from your luggage. They feed the day-90 review and the `win`/`win2` gate signals.
- **Three rules**: `tour-cap` (high-influence stakeholder unheard past day 21), `stake-cold` (skeptic untoured past day 14), `transition-stalled` (phase window closing with gates open).

## The bench (new in Session 9 — succession made visible)

"Verdicts feed the bench" was a v6 claim with no surface. Now it has one. `FW.benchScore` computes succession readiness per person from nine-box stamp (staleness halves it), autonomous delegation verdicts, coaching arcs, flight risk, and live case load. Every lead rollup card on `#/org` answers one question out loud: **if this lead left Monday, who takes the team?** — `READY NOW / READY IN 6M / GAP`, with the reason ledger. The `bench-thin` rule fires when a whole team is a single point of failure, and the org dashboard prints bench coverage as a first-class stat. Person pages show where you rank on your manager's bench and why.

## The case spine (architectural core — carried, unchanged doctrine)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), any person page, or `C`. The intake shows a live pre-commit preview: Cynefin domain with move hint · Eisenhower priority · severity SLA runway · keyword reclassification with trip-words named · the **exact list of writes** · duplicate warning · the lesson journaled at the last closed case of the same type. The engine then:

1. Selects the type's dated playbook (1–3 tasks) into the task stream.
2. Writes real, linked records into every routed module across **12 wire kinds** — evidence, 1:1 agenda injection, SBI draft, decision stub with gate, team note, goal at-risk flag, comms draft, HR hard-stop, closure verification, AAR arming, **cascade to manager**, playbook tasks — every write trapped in the case's **propagation ledger** with click-through routes.
3. **Refuses identical open duplicates** and routes you to the existing case. Audit class `dup-cases` watches it hold.
4. **Cross-links related open cases** on shared scope — two live cases on one person or team is a pattern.
5. Closure is **checked, not assumed**: outcome + lesson mandatory, orphaned playbook/comms tasks cancelled with a count, goal at-risk flags cleared by the closure that owns them, lesson journaled, +30d verification armed (verify or re-open — re-open restarts the SLA clock, on the record), AAR armed for sev ≥ 4, `tuition-unpaid` holds until the AAR exists.
6. A correction whose +21d verification lapses past 7 days **auto-opens an underperformance case** (sweep, idempotent, toast-announced) — the machine's arm, on the record. Never a paper-trail generator.

## Module map — 21 renderers (19 routes + 2 detail views)

| Route | Depth |
| --- | --- |
| #/today | Pace governor (FW.pace) · engine-ranked stack · conduits due · commitment debt (both directions) · week strip · quick capture |
| #/inbox | 54 rules · severity order · 3 locked classes · dated snooze · positive-signals lane · full live rule ledger |
| #/transition | 90-day protocol · phase stepper · 12 evidence-gated gates · stakeholder grid · tour lane · win ledger |
| #/cases · #/case/:id | 11 types · SLA runway bars · playbooks · failure modes inline · propagation ledger · cross-links · checked closure · verify/re-open |
| #/org | Lead rollup cards (FW.orgRollup) · span pressure · team-scoped pulse with stated fallback · **bench per lead** · cascade doctrine |
| #/people · #/person/:id | Flight risk (weighted drivers + reasons) · trust equation · nine-box with 120d expiry · evidence ledger with case backlinks · ramp gates · dev plan · auto-agenda · skip-levels · succession rank |
| #/oneonones | Cadence board (HIGH risk → 7d) · 6-source auto-agenda consumed on finish · pulse telemetry honesty (untouched → estimated:true, ≈ chip, never moves slopes) · commitments → dated loops |
| #/feedback | SBI/AID/COIN composer + live lint · ageing clocks (praise 48h / corrections 72h) · deliver → +21d verification · lapsed → auto-case · balance board 60–85% zone |
| #/coach | GROW runner · live quality score · question bank |
| #/delegation | SLII skill×will → style + suggested rung · mismatch warnings **both directions** · boundary + enforced checkpoint · verdicts feed the bench |
| #/mediation | Six stages, order enforced · locked gates (1 & 4) require notes · halt-to-HR in one write · agreement files evidence to both parties + arms +14d verification |
| #/goals | Direction-aware KR scoring · check-ins with confidence (leading indicator) · trajectory sparks · expired goals graded with mandatory causal lesson |
| #/decisions | Type-1/2 doors · premortem ≥3 enforced at form layer *and* audit class · re-date requires recorded reason · outcome grading → calibration |
| #/health | Fortnight 6-dimension pulse w/ deltas and team scoping · Edmondson 7-item scan (reverse-scoring 2/4/6) · five dysfunctions sequential stepper · bus-factor capability map |
| #/aar | Expected-vs-happened **numbers** · 5-whys causality validation · blameless stop · improvements → owned dated loops · live quality score · tuition-unpaid lane |
| #/review | Auto 7d digest · 8-week pressure spark · 60-second upward brief (copy) · ritual · lesson journal |
| #/academy | 8 lessons in 4 arcs × 3 scored checks + application note · the refusal card |
| #/about | The judgment contract in-app · the refusals · live counts · storage reality · shortcuts |
| #/data | 15 executable audit classes · safe-repair only where mechanically unambiguous · export/import (merge re-mints ids + rewires person graph, post-import audit) · prune with counts · example org load/erase · system log |

## Mentor rule set — 54, live-counted

3 locked (unsnoozable) · 4 positive signals (detection-only mentors produce risk-averse operators) · 47 detectors across 15 categories (cadence, people, org, transition, feedback, commitments, cases, delegation, goals, decisions, health, dysfunctions, mediation, coach, rhythm/system). Every clear-condition is computable: an advisory that cannot clear does not ship. `comm-debt-you` (sev 2) outranks `comm-debt-them` (sev 1) — a mentor that only audits downward trains its user to audit downward. Snooze is **dated** (3d/7d), never amnesia.

## Model library — 28 pure scoring functions

All in `FW`: no I/O, no mutation, every one consumed by a view or a rule. Flight risk with weighted driver ledger · direction-aware KR scoring · **confidence slope** · Edmondson reverse-scoring · SLII style suggestion · GROW/AAR/SBI quality · trust equation + band · feedback balance zone · decision calibration · Cynefin / Eisenhower · health composite · bus risk · load pressure · case SLA · goal status · nine-box band + expiry · estimated-aware mood slope · five-dysfunctions sequencer · commitment debt · pace governor · org rollup · **bench score** · **transition score**.

## Instrument honesty

1:1 pulse sliders are telemetry. Untouched sliders write `estimated:true` entries; estimates render with an `≈` chip, never move a slope, never trigger or clear an advisory. Audit class `telemetry-honest` **executes a probe** — runs `FW.moodSlope` on a synthetic series with estimated entries and asserts equality with the same series minus them — plus runtime bounds checks.

## Storage reality (stated plainly, and in the UI)

- ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile. Cleared with site data. No sync, no recovery.
- Notes concern named individuals and may be disclosable — **write every note as if read aloud in the grievance room.**
- Failed writes surface in the top bar (`saved HH:MM` → red `WRITE FAILED`), never silently.
- **Export weekly**; `export-overdue` nags past 14 days.
- Imports are `v:6`-only: wrong shapes fail loudly without touching state; merge mode re-mints ids, rewires `managerId` and all person references, then runs a post-import audit.

## Shortcuts

| Key | Action |
| --- | --- |
| / or Ctrl/Cmd-K | Command palette — modules, people, commands |
| C | Register a case (live pre-commit classification) |
| 1 2 3 4 | today · signal · cases · people |
| 5 6 7 8 9 0 | 1:1s · feedback · coach · decisions · AAR · review |
| Esc | close modal / palette |

## Files

| File | Role |
| --- | --- |
| index.html | The entire application (shell, design system, UTIL, FW, CONTENT, STORE, ENGINE, MENTOR, INTEGRITY, SHELL, VIEWS, MODALS, ACTIONS, FORMS, IMPORT, SEED, EVENTS, BOOT) |
| README.md | This file |
| AI-SESSION-LOG.md | Session-9 engineering record: critique, positions, changelog, QA ledger, honesty ledger |

First boot builds an **example org with the same field contracts the write paths produce** — two leads (Mara: Priya + Jonas; Tomás: Leo + Aiko), five cases with full propagation ledgers (SLA-breached underperformance with cascade, cross-team conflict with mediation at stage 3 cascaded to *both* managers, closed crisis with tuition unpaid, stalled goal with the flag wired, active ramp), an overdue delegation checkpoint with a live rung mismatch, a rotten decision gate, stale and expired KRs, critical-and-slipping pulse dimensions, ageing drafts, a lapsed correction inside its 7-day grace, commitment debt in both directions, and a day-24 transition in flight (map drawn, 3 of 4 stakeholders toured, a hostile VP still unheard). The pace governor reads REDLINE on first paint, by design — every instrument is visibly live. Set yourself (Data → You & org), then erase the example in `#/data` when your real org arrives.

## Honesty ledger (claims vs code)

- **Every count resolves to a live computation.** 54 rules · 28 models · 21 renderers (19 routes + 2 detail) · 11 case types · 12 wire kinds · 15 audit classes · 8 lessons × 3 checks · 12 transition gates · 7 Edmondson items · 5 rungs · 6 mediation stages · 6 pulse dimensions. If prose and code disagree, the About/Data pages are the authority.
- **Session 9 is a reconstruction-continuation, not a byte-transplant of v7.0.** The upstream source could not pass whole through this tooling window (raw fetch truncates mid-file — the same wall Sessions 7 and 8 logged). Recovered verbatim: the design-system CSS, the UTIL contract, FW model signatures and partial bodies, the state contract (`leados.v6`, `v:6`, boot collection names, boot guards), the BOOT/EVENTS tail, the seed narrative, and the README-as-contract. Everything else was re-derived against that contract. Store key and record version kept deliberately: existing `leados.v6` stores load into v8.0 with additive fields (`transition`, `skipAt`, tour/skip session kinds) defaulted by boot guards — no silent migration, no destructive rewrite.
- **Advisory counts are live, not promised in prose.** The seed builds a deliberately tense org; the exact advisory count on first paint is whatever Signal prints — that is the point of live counting.
- **Detector taxonomy is this session's.** The 4 transition/bench rules are net-new; upstream's 50 are preserved as a design-intent subset, not by text.
- **Known limits held open:** ISO-day strings, no timezone nuance · pressure is case-derived, not calendar-derived · nine-box staleness is view-time, not destructive · org rollup attributes org-wide pulse to a team when no team-scoped pulse exists (stated on the card) · import-merge is append-only (no per-record dedupe beyond id re-minting) · icon sprites and web fonts degrade gracefully offline · transition gate signals are computed from LeadOS state only — the machine cannot verify what happened in a room, which is exactly why the note is mandatory and the signal is only ever a hint.
