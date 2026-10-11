# LeadCore — Leadership Operating System
An offline-first operating system for a new manager of managers. Vanilla JavaScript,
no framework, no backend, no accounts, no external services. All state lives in
`localStorage` in one browser profile. That constraint is permanent.
---
## What this is, and what it refuses to be
It is **not** an oracle. A product that hands a new leader answers produces a compliant
operator who collapses the first time reality deviates from the script, and it creates real
legal exposure when someone acts on generated advice about a termination without judgement.
So the division of labour is explicit:
| The app owns | You own |
| --- | --- |
| Detection, scoring, sequencing, drafting, record-keeping, escalation timing, cadence tracking | The judgement call |
| Forcing the decision to be recorded with a rationale and a review date | Living with the outcome |
That review loop is the mechanism that turns experience into skill. It is the actual
substitute for a leadership course — not the lesson text.
## The case spine (the architectural core)
Register a case **once**, anywhere — person page, team page, mentor advisory, global `C`
shortcut. The intake engine then:
1. Classifies it — Cynefin domain, Eisenhower quadrant, severity-derived SLA, escalation test.
2. Dispatches the playbook for that case type.
3. **Writes real, linked records into every routed module**, each traceable back to the case.
A single `attrition` case produces: six dated playbook tasks, an evidence entry, a 1:1
scheduled or an agenda item injected into the next one, a pre-filled SBI feedback draft, a
risk-register entry, a comms draft, a decision record, person-state flags that immediately
change their flight-risk score, and a mentor advisory. You never file the same thing twice,
and the case detail view renders the full propagation graph.
Closing a case requires an outcome and a lesson, cancels its orphaned tasks, clears the flags
it set, writes to your journal, and schedules a 30-day verification task — closure is checked,
not assumed.
## Modules
| Route | Module | Depth |
| --- | --- | --- |
| `#/today` | Daily brief | Top-3 focus, today's 1:1s with auto-agendas, overdue commitments, load, lesson |
| `#/inbox` | Mentor inbox | 20 detection rules across every collection, ranked, with executable actions |
| `#/cases` | Case workspace | Intake, playbook, pitfalls, timeline, propagation graph, structured closure |
| `#/people` | Person workspace | Flight risk with weighted drivers, trust equation, SL2, 9-box, evidence, replacement cost |
| `#/teams` | Team workspace | Psych safety (7-item Edmondson), five dysfunctions, Tuckman, bus factor |
| `#/oneonones` | 1:1s | Auto-assembled agendas, carried-forward commitments, question banks, GROW |
| `#/feedback` | Feedback | SBI composer, draft ageing, delivery writes to evidence, balance per person |
| `#/delegation` | Delegation | SL2 → authority level calculator, generated handoff script, checkpoint cadence |
| `#/decisions` | Decision journal | Type 1/2 classification, DACI, premortem gate, outcome review, calibration |
| `#/performance` | Performance | Skill/will/system/clarity diagnosis, 9-box calibration, evidence log, improvement plans |
| `#/portfolio` | Goals, risk, meetings, stakeholders, comms | OKR health, P×I register, meeting economics, power/interest grid |
| `#/scripts` | 18 conversation scripts | Parameterised sections with guardrails, copyable |
| `#/academy` | Curriculum + simulator | 15 lessons with drills and checks; 6 two-round scored scenarios |
| `#/self` | Your leadership | Load index, time allocation vs target, candour quadrant, first 90 days, journal |
| `#/data` | Data & integrity | Usage telemetry, export/import, migrations, pruning, example org |
## Model library (`src/core/frameworks.js`)
26 frameworks implemented as pure scoring functions that return a score, a band, the
reasoning, and prescribed actions — not prose:
Trust equation · Situational Leadership II (+ mismatch detection) · Delegation levels 1–7 ·
Weighted flight risk · Psychological safety · Five dysfunctions (sequential) · Tuckman ·
Cynefin · Type 1/2 reversibility · Eisenhower · Meeting economics · Leader load / span of
control · Bus factor · Nine-box · OKR health · Feedback balance · Radical candour ·
Thomas-Kilmann · **Performance diagnosis (skill/will/system/clarity)** · Stakeholder
power-interest · Escalation test · Cadence recommendation · Decision calibration ·
Replacement cost · ADKAR · Time allocation targets.
The performance diagnosis is the most consequential: three of its four possible causes are
the manager's problem, and it actively blocks you from coaching a system failure.
## Architecture
```
index.html            shell
src/styles.css        design system, no framework
src/main.js           router, nav, delegated actions, global case intake
src/core/
  store.js            normalised collections, versioned migrations, quota telemetry, batch writes
  dom.js              escaping, dates, formatting, modal/toast, action registry
  frameworks.js       26 pure scoring models
  content.js          15 case types + playbooks, 18 scripts, 15 lessons, 6 scenarios, question banks
  engine.js           case intake + propagation, derived metrics for every module
  mentor.js           20 detection rules, daily brief
src/views/            14 view modules
```
No build-time framework. Vite is used only to bundle and inline into a single `dist/index.html`.
## Storage reality (stated plainly, in the UI too)
- ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
- Cleared if you clear site data. No sync, no recovery.
- It contains notes about named individuals that may be disclosable in a grievance process.
- Quota is monitored; writes that fail are counted and surfaced. **Export weekly.**
## Scripts
```bash
npm run dev      # dev server
npm run build    # single-file production build → dist/index.html
npm run preview  # preview the build
```
Press `C` anywhere to register a case.
