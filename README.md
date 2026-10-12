# LeadCore — Leadership Operating System

**An offline-first operating system for a new manager of managers.** Vanilla
JavaScript, no application framework, no backend, no accounts, no data APIs, no
credentials, no build step. The entire application is one `index.html` file;
all state lives in `localStorage` in one browser profile. Tailwind's browser CDN
and web fonts are presentation-only: custom CSS and system-font fallbacks keep
the application functional when those requests are unavailable. No leadership
data leaves the browser. That constraint is permanent.

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not** an oracle. Software that hands a new leader answers produces a
compliant operator who collapses the first time reality deviates from the script —
and it creates real legal exposure when someone acts on generated advice about a
termination without judgment. The division of labor is explicit and enforced in
the UI:

| The app owns                                                                          | You own                   |
| ------------------------------------------------------------------------------------- | ------------------------- |
| Detection, scoring, sequencing, drafting, record-keeping, escalation timing, cadence  | The judgment call         |
| Forcing decisions/outcomes to be recorded with rationale and a review date            | Living with the outcome   |
| The review loop that turns experience into skill — the actual leadership-course substitute | Reading the loop honestly |

The **escalation test** (`ethics_hr` cases, severity 5, keyword triggers:
harassment, discrimination, safety, medical, fraud, legal…) hard-stops automation
**in the write path**: only the case record, verbatim evidence, and an HR-contact
task dated today are created. Playbooks never drive legal-grade situations. The
corresponding advisory **cannot be snoozed** — a class that must be resolved
or owned openly, never deferred (integrity faults are the same class).

## The case spine (the architectural core)

Register a case **once**, anywhere — person page, team page, advisor action, top
bar, or the global `C` shortcut. The intake shows a live classification preview
(Cynefin domain · Eisenhower quadrant · severity-derived SLA · escalation check ·
the exact list of writes that will occur · **the lesson from the last closed case
of the same type**) **before you commit**. The engine then:

1. Dispatches the type's dated playbook (5–7 tasks) into the task stream.
2. Writes real, linked records into every routed module — evidence, a 1:1
   scheduled **or** an agenda item injected, a pre-filled SBI draft, a risk
   register entry, a comms draft, a decision with a review gate, a diagnosis
   record, an ADKAR record, person signal flags with stored priors — each write
   recorded in the case's **propagation ledger**. Departure cases additionally fan out **one
   knowledge-transfer task per `criticalFor` capability** of the leaver.
3. Refuses identical same-day duplicates (idempotent intake).
4. Closure is checked, not assumed: requires outcome + lesson, cancels orphaned
   tasks, restores signal priors, journals the lesson, and schedules a 30-day
   verification task that can re-open the case.

## Module map

| Route | Module | Depth |
| --- | --- | --- |
| #/today | Daily brief | Engine-ranked focus, **week-ahead strip (1:1s/skips/tasks per day)**, **welcome-back catch-up digest after 4+ days away** (cases, movers, throughput, hires, pressure delta — sequenced), today's 1:1s with auto-agendas, overdue tasks/commitments, load index, rep-of-the-day, Friday prompt |
| #/inbox | Mentor inbox | **45 detection rules** across every collection, weighted/ranked, executable actions, dated snoozing with visible Deferred lane |
| #/review | Weekly review | Auto digest (cases/SLA/1:1s/feedback/journal), persisted advisory-pressure trend (60d), **team-health sparklines (26-week snapshots)**, **quarterly rhythm panel (talent · skips · bench · goals · stakeholders · safety, one score, one due count)**, **upward brief generator** (weekly one-pager — copy/print, neutral by construction), case-type stats, repeat-pattern detection, cadence sweep, guided 4-field ritual |
| #/cases · #/case/:id | Case workspace | 16 types (incl. **departure/notice**), **aging buckets (0–3/4–7/8–14/15d+)**, playbooks, pitfalls, timeline + dated notes, click-through propagation ledger, verified closure with re-open |
| #/org | **Org map** | **Span structure view (you → leads → reports, built from the reporting tree)** · leader load, cadence coverage, flight exposure in money, open-case pressure; per-team health/stage/bus/safety/bench; per-lead trust, readiness, **lead signal**, skip coverage, delegation mismatches, next 1:1 |
| #/skips | **Skip-levels** | The manager-of-managers intelligence instrument. Quarterly cadence per report, 5-question runner, theme capture (de-identified), 4 signal dimensions, **lead signal model**, and doctrine enforced in code: actions inject into YOUR 1:1 with the lead, never around them |
| #/people · #/person/:id | Person workspace | Flight risk (8 drivers + history sparkline), trust equation, SL2, nine-box, evidence, replacement cost, **development plans**, **instrumentation coverage strip with one-click fixers**, HR packet (print/PDF), 30/60/90 ramp, leave mode (pauses nags, never cases), archive, **10-session mood trail** |
| #/teams · #/team/:id | Team workspace | Edmondson scan, five dysfunctions (sequential), Tuckman (+override), bus factor, composite health, goals, ADKAR, **succession bench (derived)**, **retro engine** — model-informed runner, STOP/START items become dated owned tasks, open items carried forward until closed or killed loudly, **working agreement** (decision rights, channels, urgency routing, conflict shape, sacred hours — stage-aware pressure for forming/storming teams), **30-day team intake for inherited teams (7 dated ritual tasks)** |
| #/oneonones | Session runner | **Since-last-session digest on open** (evidence, cases, feedback, flight delta, talent stamps), 7-source auto-agendas (commitments, mood, cases, drafts, risk drivers, ramp, dev-plan review), question bank, GROW, mood trend, carried-forward commitments **with owed-by ownership (me/them)** — Today splits broken-by-you from chase-list-owed-to-you, auto next-booking, print/copy agenda, first-session script offer |
| #/feedback | Feedback | SBI composer with live preview, draft ageing, delivery writes to evidence, **+21d correction verification with two artifact outcomes** (change seen → named evidence; not yet → next 1:1 agenda cites the first, dated), per-person praise/correction balance |
| #/delegation | Delegation | SL2 → L1–L7 wizard with mismatch warnings + **Re-level**, boundary conditions, checkpoint cadence with tasks, debrief classification, **ladder-depth read per lead (stalled-rung detection in org map + inbox)** |
| #/decisions | Decision journal | Type 1/2 doors, DACI, premortem gate (enforced), review gates, **explicit re-dating with reason on record**, calibration |
| #/performance | Performance | 4-cause diagnosis (system/clarity = **manager-owned, blocks coaching**), auto-offer of improvement plans, plans with checkpoints and verdicts, 9-box board, **quarterly talent ritual** — every direct re-stamped in one sitting (nine-box + change-note + optional case flag), 90-day cadence policed by the inbox |
| #/pipeline | **Hiring pipeline** | Sourced→screen→loop→offer with per-stage leak counters (stalls nagged at 14d) · scoring discipline (6 dims, score-alone-first, composite verdicts) · outcome log · **accept cascades: mint person + 30/60/90 ramp + first 1:1 in one write** |
| #/portfolio | Governance | OKR health **with confidence trajectory sparklines**, P×I risk register with review dates, meeting economics ($/decision, **one-click debt case, one-click decision capture into the journal**), power-interest grid, comms, ADKAR records |
| #/scripts | 12 scripts | Parameterized, live-assembled, guardrailed, copyable/printable; PIP & separation defer to HR |
| #/academy | Curriculum + simulator | 15 lessons in 4 arcs (persisted drills, scored checks) **with per-arc progress readout** (checks/drills/scenarios); 6 scenarios with two-tier consequence branching |
| #/self | Your leadership | **OS readiness checklist (14-artifact install verification with one-click fixers, including integrity-green)**, load index, time vs manager-of-managers targets, candour quadrant, TKI check, first-90-days plan, journal, **catch-me-up digest from any date** |
| #/data | Data & integrity | **Executable integrity audit** (schema, JSON round-trip, canonical ids, reporting cycles, references, ledger targets, retro/task sync, hiring cascade, content/route contracts, critical-model assertions, quota/runtime) · safe repair for mechanically unambiguous corruption · copyable diagnostics · telemetry, export/import, audit-preserving prune, example org |

## Mentor rule set (50)

SLA breach · escalation open · overdue tasks · cadence breach · repeat 1:1
cancels · draft ageing · feedback famine · balance off-zone · flight high · trust
fragile · trust unassessed · mood drop · ramp without plan · nine-box stale ·
delegation mismatch · checkpoint overdue · decision gate overdue · Type-1 without
premortem · calibration drift · risk rotting · manage-closely gone cold · OKR
slipping/abandoned · psych unsafe · psych unscanned · bus factor critical · load
overload · time drift · repeat-case pattern · weekly review overdue ·
verification due · plan checkpoint overdue · ADKAR blocked · case idle · decision
hoarding · export overdue · goals missing · dev plan missing/stale · bench empty ·
skip overdue · lead signal weak · talent ritual due · team health slipping ·
upward brief overdue · retro overdue · diagnosis pending · ladder stalled ·
pipeline stalled · record-integrity fault · quarterly rhythm overdue ·
uninstrumented direct (45d silence across every instrument) · one-way door aging ·
recognition clustering (favoritism detector) · goal expired-unjudged (zombie verdicts required).

## Model library (31 pure scoring functions)

OS readiness · Trust equation · SLI II (+ delegation mismatch) · Delegation L1–L7 · Weighted
flight risk (+ persisted history) · Psychological safety (Edmondson) · Five
dysfunctions (sequential) · Tuckman · Cynefin · Type 1/2 reversibility ·
Eisenhower · SLA derivation · Escalation test · Meeting economics · Leader load ·
Bus factor · Nine-box · OKR health · Feedback balance · Radical candour ·
Thomas-Kilmann · Performance diagnosis · Power-interest · Decision calibration ·
Replacement cost · ADKAR · Time-allocation targets · 1:1 cadence · Team-health
composite · **KR progress (direction-aware)** · **Lead signal (skip-level
aggregate)** · Skip coverage. Every function returns score, band, reasoning, and
prescribed actions.

### The reporting tree (round 6 — structure over inference)

`managerId` on each person is the org structure; everything derives from it.
Direct reports (no manager set) get your 1:1 cadence rules, trust assessments,
and feedback-balance nags. Indirect reports get the skip-level cadence and feed
the lead signal — coaching below your leads is their job, and the rules now
respect that boundary. The span structure view in the Org map renders the tree;
ambiguous structures (teams with several leads) stay user-directs until you set
"Reports to" on person pages. Loop creation is guarded in the editor, and legacy
data infers only deterministic shapes (teams with exactly one lead).

### A note on KR direction (correctness fix, round 5)

Earlier builds scored key results as `current / target`, which returns **100% for
any reduce-type KR** — "lead time 38 min against a 15 min target" read as
complete while failing. `FW.krProgress` now carries direction and an optional
baseline: with a baseline it measures true distance travelled, without one it
uses a monotonic ratio proxy. A failing KR can no longer read as complete.

## Architecture (single file, layered)

```
index.html
  <style>   design system (ink/amber; Fraunces / Inter / IBM Plex Mono)
  <script>
    1. STORE        blank() state, load/save with failed-write surfacing
    2. UTIL/DOM     uid/dates/esc, toast, modal, generic form builder
    3. FRAMEWORKS   FW.* — 31 pure scoring models
    4. CONTENT      CASE_TYPES (16), SCRIPTS (12), QBANK, LESSONS (15), SCENARIOS (6)
    5. ENGINE       createCase + ledger, closeCase, agendas, team health, ramp, HR packet
    6. MENTOR       RULES (45), mentorScan, dailyBrief + persisted trend snapshots
    7. VIEWS        Routes.* renderers + Actions.* delegated registry
    8. INTEGRITY    executable audits, safe repair, copyable diagnostics
    9. SEED+BOOT    example org via the real engine, shortcuts, init
```

## Storage reality (stated plainly, in the UI too)

- ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
- Cleared if you clear site data. No sync, no recovery.
- Contains notes about named individuals that may be disclosable in a grievance
  process — write every note as if read aloud in that room.
- Failed writes surface in the top bar and telemetry, never silently.
- **Export weekly** (Data & integrity → Export JSON). The `export-overdue`
  advisory tracks this and nags past 14 days.
- Print stylesheet included: 1:1 agendas, HR packets, and scripts print clean.

## Shortcuts

| Key | Action |
| --- | --- |
| / or Ctrl/Cmd-K | Command palette — jump to any person, team, open case, module, or action |
| C | Register a case (global intake with live classification + propagation preview) |
| 1–9 | Jump: today · inbox · cases · people · teams · 1:1s · feedback · decisions · academy |
| 0 | Jump: weekly review |
| Esc | Close modal |

## Files

| File | Role |
| --- | --- |
| index.html | The entire application (shell, styles, store, models, content, engine, views, boot) |
| AI-SESSION-LOG.md | Continuation-engineering session record: critique, positions, changelog, QA, watchlist |
| README.md | This file |

First boot loads an example organization **built through the production engine**
(two teams, eight people, two live cases with full propagation, goals, risks,
stakeholders, 1:1 history, an active delegation) so every module is alive on
first paint. Erase it in Data & integrity when you are ready for your real org.
