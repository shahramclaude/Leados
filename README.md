# LeadOS — Leadership Operating System · v7.0 (Session-8 build)

An offline-first operating system for a leader **of team leads**. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v6`, record version `v:6`) in one browser profile. Web fonts and icon sprites are presentation-only; system fallbacks keep everything functional offline. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. "Sit back and trust the app 100%" is not a feature request this build accepts — confidence is how you get a compliant operator who collapses the first time reality deviates from script. Trust here is **auditability**: every count this README claims is printed live from code on `#/data`, the telemetry probe proves instruments honest, and the audit classes execute on every commit, not on request. The division of labor is explicit, enforced in the UI, and restated in-app on `#/about`:

| The app owns | You own |
| --- | --- |
| Detection (**50 executable rules**), scoring (**26 pure models**), sequencing, drafting of *structure*, record-keeping, cadence, pace, escalation timing | The judgment call |
| Forcing decisions/outcomes to be recorded with rationale and a review gate | Living with the outcome |
| The review loop that turns experience into skill — the actual course substitute | Reading the loop honestly |
| Escalation timing (hard-stops to HR) | The humanity of that room |

The hard-stop: case intake keyword-scans every registration (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation). A hit **reclassifies the case to the HR domain before you commit**, names the words that tripped it (live, in the intake preview), and requires a deliberate double-commit. On commit the machine writes exactly three things: the case record, the verbatim evidence, and an **unsnoozable HR-contact task dated today**. Audit class `ethics-wires` fails loudly if an ethics case ever carries any other wire, and its safe-repair revokes the wire records, not just the ledger entries. PIP and separation scripts do not exist anywhere in the codebase. The mediation protocol halts in one write to an HR escalation case the moment protected-class content surfaces. Three advisory classes cannot be snoozed: **escalation-open · HR-task-due · integrity-fault.**

## The org layer (new in Session 8 — the actual user)

v6 modeled people as a flat list; its stated user leads **other leads**. Session 8 makes that a first-class structure:

- **`managerId` on every person**, a `#/org` route with per-lead rollup cards (tier, open-severity subtree, elevated flight risks, cadence breaches, team-scoped pulse, nine-box distribution), and span pressure.
- **Cascade — the 12th wire kind.** A case on anyone with a manager writes into that manager's 1:1 auto-agenda. Context travels through the loop, not the hallway. Conflict cases cascade to *both* managers.
- **Skip-level cadence** per grandchild (45-day freshness, logged in one click, the lead kept in the loop by design — never a bypass).
- **Four org rules**: `skip-level-due · cascade-quiet · lead-overload · org-span`, and `FW.orgRollup` as the pure model behind all of it.
- **The pace governor** (`FW.pace`, on `#/today`): the app regulates its user's load — open severity, SLA breaches, commitment debt, due verifications, stalled protocols — and says REDLINE when starting more is the failure mode. Ambition unchecked is a load fault, not a virtue.

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), any person page, or `C`. The intake shows a live pre-commit preview: Cynefin domain with move hint · Eisenhower priority · severity SLA runway · keyword reclassification with hit words named · the **exact list of writes** · duplicate warning · the lesson journaled at the last closed case of the same type. The engine then:

1. Selects the type's dated playbook (2–3 tasks) into the task stream.
2. Writes real, linked records into every routed module across **12 wire kinds** — evidence, 1:1 agenda injection, SBI draft, decision stub with gate, team note, goal at-risk flag, comms draft, HR hard-stop, closure verification, AAR arming, **cascade to manager**, playbook tasks — every write trapped in the case's **propagation ledger** with click-through routes.
3. **Refuses identical open duplicates** (type + scope + person + title) and routes you to the existing case. Audit class `dup-cases` watches it hold.
4. **Cross-links related open cases** on a shared scope — two live cases on one person or team is a pattern, surfaced as `case-crosslink`.
5. Closure is **checked, not assumed**: outcome + lesson mandatory, orphaned playbook/comms tasks cancelled with a count, goal at-risk flags cleared by the closure that owns them, lesson journaled, +30d verification armed (verify or re-open — and re-open restarts the SLA clock, on the record), AAR armed for sev ≥ 4, `tuition-unpaid` holds until the AAR exists.
6. A correction whose +21d verification lapses past 7 days **auto-opens an underperformance case** (sweep, idempotent, toast-announced) — the machine's arm, on the record.

## Module map — 20 renderers (18 routes + 2 detail views)

| Route | Depth |
| --- | --- |
| #/today | Pace governor (FW.pace) · engine-ranked stack · conduits due with cadence · commitment debt (both directions) · week strip · quick capture |
| #/inbox | 50 rules · severity order · 3 locked classes · dated snooze · positive-signals lane · full live rule ledger |
| #/cases · #/case/:id | 11 types · SLA runway bars · playbooks · known failure modes inline · propagation ledger · cross-links · checked closure · verify/re-open |
| #/review | Auto 7d digest · 8-week pressure spark · 60-second upward brief (copy) · ritual · lesson journal |
| #/people · #/person/:id | Flight risk (weighted drivers + reasons) · trust equation sliders · nine-box stamp w/ 120d expiry · evidence ledger w/ case backlinks · ramp gates 30/60/90 · dev plan · auto-agenda · skip-levels · manager/directs |
| #/org | Lead rollup cards (FW.orgRollup) · span pressure · team-scoped pulse · cascade doctrine |
| #/oneonones | Cadence board (HIGH risk → 7d) · 6-source auto-agenda consumed on finish · pulse telemetry honesty (untouched → `estimated:true`, never moves slopes) · commitments → dated loops |
| #/coach | GROW runner · live quality score (specifics / rich reality / 3-option floor / owned+dated way-forward) · question bank |
| #/feedback | SBI/AID/COIN composer + live lint · ageing clocks (praise 48h / corrections 72h) · deliver → +21d verification · lapsed → auto-case · balance board 60–85% zone |
| #/delegation | SLII skill×will → style + suggested rung · mismatch warnings **both directions** · boundary + enforced checkpoint · verdicts feed the bench |
| #/mediation | Six stages, order enforced · locked gates (1 & 4) requiring notes · halt-to-HR in one write · agreement files evidence to both parties + arms +14d verification |
| #/goals | Direction-aware KR scoring (down is a direction) · check-ins with confidence (leading indicator) · trajectory sparks · expired goals graded with mandatory causal lesson |
| #/decisions | Type-1/2 doors · premortem ≥3 enforced at form layer *and* audit class · re-date requires recorded reason · outcome grading → calibration |
| #/health | Fortnight 6-dimension pulse w/ deltas and team scoping · Edmondson 7-item scan (correct reverse-scoring on 2/4/6) · five dysfunctions sequential stepper · bus-factor capability map |
| #/aar | Expected-vs-happened **numbers** · 5-whys causality-word validation · blameless stop checkbox · improvements → owned dated loops · live quality score · tuition-unpaid lane |
| #/academy | 8 lessons in 4 arcs × 3 scored checks + application note · the refusal card |
| #/about | The judgment contract in-app · the refusals · live counts · storage reality · shortcuts |
| #/data | 14 executable audit classes · safe-repair only where mechanically unambiguous · export/import (merge re-mints ids + rewires person graph, post-import audit) · prune with counts · example org load/erase · system log |

## Mentor rule set — 50, live-counted

3 locked (unsnoozable) · 4 positive signals (detection-only mentors produce risk-averse operators) · 43 detectors across 15 categories (cadence, people, org, feedback, commitments, cases, delegation, goals, decisions, health, dysfunctions, mediation, coach, rhythm, system). Every clear-condition is computable: an advisory that cannot clear does not ship. Commitment debt is audited in both directions — `comm-debt-you` (sev 2) outranks `comm-debt-them` (sev 1), because a mentor that only audits downward trains its user to audit downward. Snooze is **dated** (3d/7d), never amnesia.

## Model library — 26 pure scoring functions

All in `FW`: no I/O, no mutation, every one consumed by a view or a rule. Flight risk with weighted driver ledger · direction-aware KR scoring · Edmondson reverse-scoring · SLII style suggestion · GROW/AAR/SBI quality · trust equation + band · feedback balance zone · decision calibration · Cynefin / Eisenhower · health composite · bus risk · load pressure · case SLA · goal status · nine-box band + expiry · estimated-aware mood slope · five-dysfunctions sequencer · commitment debt · **pace governor** · **org rollup**.

## Instrument honesty

1:1 pulse sliders are telemetry. Untouched sliders write `estimated:true` entries (flag omitted on measured entries so legacy and seed data stay lean). Estimates render with an `≈` chip, never move a slope, never trigger or clear an advisory. Audit class `telemetry-honest` **executes a probe** — runs `FW.moodSlope` on a synthetic series with estimated entries and asserts equality with the same series minus them — plus runtime bounds checks.

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
| 1 2 3 4 | today · inbox · cases · people |
| 5 6 7 8 9 0 | 1:1s · feedback · coach · decisions · AAR · review |
| Esc | close modal / palette |

## Files

| File | Role |
| --- | --- |
| index.html | The entire application (shell, design system, UTIL, FW, CONTENT, STORE, ENGINE, MENTOR, INTEGRITY, SHELL, VIEWS, ACTIONS, SEED, BOOT) |
| README.md | This file |
| AI-SESSION-LOG.md | Session-8 engineering record: critique, positions, changelog, QA ledger, honesty ledger |

First boot builds an **example org with the same field contracts the write paths produce** — two leads (Mara: Priya + Jonas; Tomás: Leo + Aiko), five cases with full propagation ledgers (SLA-breached underperformance with cascade, cross-team conflict with mediation at stage 3 cascaded to *both* managers, closed crisis with tuition unpaid, stalled goal with the flag wired, active ramp), an overdue delegation checkpoint with a live rung mismatch, a rotten decision gate, stale and expired KRs, critical-and-slipping pulse dimensions, ageing drafts, a lapsed correction inside its 7-day grace, and commitment debt in both directions — roughly thirty advisories on first paint, plus the pace governor reading LOADED. Set yourself (Data → You & org), then erase the example in `#/data` when your real org arrives.

## Honesty ledger (claims vs code)

- **Every count in this README resolves to a live computation.** 50 rules · 26 models · 20 renderers (18 ROUTES + 2 detail) · 11 case types · 12 wire kinds · 14 audit classes · 8 lessons × 3 checks · 7 Edmondson items · 5 rungs · 6 mediation stages · 6 pulse dimensions. If prose and code disagree, the Data page is the authority.
- **Session 8 is a reconstruction-continuation, not a byte-transplant of v6.1.** The v6.1 source could not pass whole through this tooling window (the fetch truncates mid-file — the middle layer is unrecoverable in-session), the same wall Session 7 logged. Recovered verbatim: the design system CSS, the UTIL contract, 21 FW model signatures and partial bodies, the state contract (`leados.v6`, `v:6`, BOOT collection names), the seed narrative, and the README-as-contract. Everything else was re-derived against that contract. Store key and record version were kept deliberately: an existing `leados.v6` store loads into v7.0 with additive fields (`managerId`, `skipAt`, pulse `leadId`, feedback `verifyDone`/`autoCase`, session `mood`/`kind`) defaulted by boot guards — no silent migration, no destructive rewrite.
- **The upstream type-count lie is corrected.** v6.1's README claimed 10 case types while its own recovered `FW.caseSla` carried 11 keys (`leave_return`). Code is authority: this build ships and prints 11.
- **Detector taxonomy under 50 is this session's.** The 4 org rules and `cascade-quiet` are net-new; upstream's 46 are preserved as a subset by design intent, not by text.
- **Known limits held open:** dates are ISO-day strings (no timezone nuance); pressure is case-derived, not calendar-derived; nine-box staleness is view-time, not destructive; org rollup attributes org-wide pulse to a team only when no team-scoped pulse exists (stated on the card); import-merge is append-only (no per-record dedupe beyond id re-minting); icon sprites and web fonts degrade gracefully offline.
