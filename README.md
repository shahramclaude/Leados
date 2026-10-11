# LeadCore — Leadership Operating System

**An offline-first operating system for a new manager of managers.** Vanilla JavaScript, no framework, no backend, no accounts, no external services, no build step. The entire application is one `index.html` file; all state lives in `localStorage` in one browser profile. That constraint is permanent.

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not** an oracle. Software that hands a new leader answers produces a compliant operator who collapses the first time reality deviates from the script — and it creates real legal exposure when someone acts on generated advice about a termination without judgement. The division of labour is explicit and enforced in the UI:

| The app owns | You own |
| --- | --- |
| Detection, scoring, sequencing, drafting, record-keeping, escalation timing, cadence tracking | The judgement call |
| Forcing decisions/outcomes to be recorded with a rationale and a review date | Living with the outcome |
| The review loop that turns experience into skill — the actual substitute for a leadership course | Reading the loop honestly |

The **escalation test** (`ethics_hr` cases, severity 5, keyword triggers: harassment, discrimination, safety, medical, fraud, legal…) hard-stops the automation and tells the user the app's limits are reached. Playbooks never drive legal-grade situations.

## The case spine (the architectural core)

Register a case **once**, anywhere — person page, team page, mentor advisory, top bar, or the global `C` shortcut. The intake engine then:

1. **Classifies** — Cynefin domain (keyword + type default), Eisenhower quadrant, severity-derived SLA, escalation check. All visible live in the intake preview before you commit.
2. **Dispatches the playbook** for that case type (5–7 dated tasks).
3. **Writes real, linked records into every routed module**, each traceable in a **propagation ledger** on the case. A single `attrition` case produces: dated playbook tasks, an evidence entry, a 1:1 scheduled **or** an agenda item injected into the next one, a pre-filled SBI feedback draft, a risk-register entry, a comms draft (where routed), a decision record with a review gate, person signal-flags that immediately re-score flight risk, and a ranked mentor advisory. You never file the same thing twice.
4. **Closure is checked, not assumed**: closing requires an outcome and a lesson, cancels orphaned playbook tasks, restores the signal flags it raised (prior values are stored), writes to your journal, and schedules a 30-day verification task. Verification can re-open the case.

## Module map

| Route | Module | Depth |
| --- | --- | --- |
| `#/today` | Daily brief | Engine-ranked top focus, today's 1:1s with auto-agendas, overdue commitments, load index, rep-of-the-day, Friday review prompt |
| `#/inbox` | Mentor inbox | 24 detection rules across every collection, weighted and ranked, with executable actions and dated snoozing (deferral, never silent dismissal) |
| `#/review` | Weekly review | Auto-assembled digest (cases, SLA adherence, 1:1s, feedback balance, journal), **persisted advisory-pressure trend** (daily snapshots, 3 sparklines, 60-day retention), case-type statistics incl. 60d repeat-case pattern detection, verdict narrative, one-click cadence sweep, guided 4-field commitment ritual that writes the journal and dates your top-3 |
| `#/cases` · `#/case/:id` | Case workspace | 15 case types, playbooks, pitfalls, timeline, propagation ledger, structured closure |
| `#/people` · `#/person/:id` | Person workspace | Flight risk (8 weighted drivers) with persisted score-history sparkline, trust equation, SL2, 9-box, evidence log, replacement cost, **HR-request packet** (neutral dated document: evidence, delivered feedback, diagnoses, plans, case register — print/PDF from browser), **30/60/90 ramp generator**, leave mode (pauses cadence/feedback/flight nags, never cases) |
| `#/teams` · `#/team/:id` | Team workspace | Psychological safety (7-item Edmondson), five dysfunctions (sequential), Tuckman, bus factor, composite health |
| `#/oneonones` | 1:1 session runner | Auto-assembled agendas from 6 signal sources, carried-forward commitments, GROW, mood, question banks, auto-scheduled next session |
| `#/feedback` | Feedback | SBI composer with live preview, draft ageing, delivery writes to evidence, per-person praise/correction balance |
| `#/delegation` | Delegation | SL2 → authority level L1–7 wizard with mismatch warnings, generated handoff script, checkpoint cadence with tasks, debrief classification |
| `#/decisions` | Decision journal | Type 1/2 doors, DACI, premortem gate for one-way decisions, forced review gates, calibration (predicted vs outcome) |
| `#/performance` | Performance | 4-cause diagnosis wizard (skill/will/system/clarity — **manager-owned causes block the coaching path**), 9-box board, improvement plans with verdicts |
| `#/portfolio` | Governance | OKR health, P×I risk register, meeting economics ($/decision), power-interest stakeholder grid, comms drafts |
| `#/scripts` | 12 scripts | Parameterized, live-assembled, guardrailed, copyable — including separation and PIP scripts that defer to HR |
| `#/academy` | Curriculum + simulator | 15 lessons in 4 arcs with persisted drills and scored checks; 6 scenarios with two-tier **consequence branching**: a poor round-1 drops you into a damaged round-2, and specific mishandlings route to option-scoped branches (the counter-offer auction, the quarantine dodge) with their own option sets |
| `#/self` | Your leadership | Load index, time allocation vs manager-of-managers targets, candour quadrant, Thomas-Kilmann check, generated first-90-days plan, journal |
| `#/data` | Data & integrity | Telemetry (writes, failed writes, rule runs), quota meter, export/import JSON, pruning, example org, storage-reality statement |

## Model library (26 pure scoring functions)

Trust equation · Situational Leadership II (+ delegation mismatch) · Delegation levels 1–7 · Weighted flight risk · Psychological safety · Five dysfunctions · Tuckman · Cynefin · Type 1/2 reversibility · Eisenhower · Meeting economics · Leader load / span pressure · Bus factor · Nine-box · OKR health · Feedback balance · Radical candour · Thomas-Kilmann · **Performance diagnosis (skill/will/system/clarity)** · Stakeholder power-interest · Escalation test · 1:1 cadence · Decision calibration · Replacement cost · ADKAR · Time-allocation targets. Every function returns score, band, reasoning, and prescribed actions — never verdicts and never bare prose.

## Architecture (single file, layered)

```
index.html
  <style>         design system (ink/amber, Fraunces/Inter/Plex Mono, components)
  <script>
    1. STORE      blank() state, load/save with failed-write surfacing, quota meter
    2. UTIL/DOM   uid/dates/esc, toast, modal, generic form builder (powers ~every mutation)
    3. FRAMEWORKS FW.* — 26 pure scoring models
    4. CONTENT    CASE_TYPES (15, with playbooks/pitfalls/routing), SCRIPTS (12),
                  QBANK, LESSONS (15), SCENARIOS (6)
    5. ENGINE     createCase + propagation ledger, closeCase, 1:1 agenda assembly,
                  teamHealth composite
    6. MENTOR     RULES (24), mentorScan, dailyBrief
    7. VIEWS      Routes.* renderers + Actions.* registry (delegated data-action clicks)
    8. SEED+BOOT  example org built through the real engine, init, shortcuts
```

Design decisions worth knowing:

- **One generic form builder** (`openForm`) drives nearly every mutation in the app — consistent UX, live model previews via `live(values)`, validation, range/select/person/team field types.
- **Propagation ledger**: every downstream record a case creates is recorded on the case with module, kind, id, label; closure restores prior person-signal values. The ledger is what makes "every related module receives it automatically" auditable instead of aspirational.
- **Deferred re-render**: state mutations re-render after the call stack settles (modal submit mutates, `closeModal` schedules `render`) so views never paint stale state.
- **Content→presentation sanitizing**: lesson bodies carry typographic shorthand (`1️⃣`, `🔹`) that the Academy renderer converts to styled markup; no emoji glyphs reach the UI (Lucide icons only).

## Storage reality (stated plainly, in the UI too)

- ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
- Cleared if you clear site data. No sync, no recovery.
- Contains notes about named individuals that may be disclosable in a grievance process — write every note as if read aloud in that room.
- Quota and **failed writes** are monitored in the top bar; failures are surfaced, never silent. **Export weekly** (Data & integrity → Export JSON).
- Import offers **merge mode** (append-only, local ids win) in addition to replace.
- Print stylesheet included: 1:1 agendas, person dossiers, and scripts print clean (browser print; buttons on the session and dossier views).

## Shortcuts

| Key | Action |
| --- | --- |
| `C` | Register a case (global intake with live classification + propagation preview) |
| `1–9` | Jump: today · inbox · cases · people · teams · 1:1s · feedback · decisions · academy |
| `0` | Jump: weekly review |
| `Esc` | Close modal |

## Files

| File | Role |
| --- | --- |
| `index.html` | The entire application (shell, styles, store, models, content, engine, views, boot) |
| `AI-SESSION-LOG.md` | Continuation-engineering session record: critique, decisions, changelog, QA fixes |
| `README.md` | This file |

First boot loads an example organization **built through the production engine** (two teams, eight people, two live cases with full propagation, goals, risks, stakeholders, 1:1 history) so every module is alive on first paint. Erase it in Data & integrity when you are ready for your real org.
