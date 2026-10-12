# LeadCore — Leadership Operating System

**An offline-first operating system for a new manager of managers.** Vanilla JavaScript, no framework, no backend, no accounts, no APIs, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leadcore.v2`) in one browser profile. Web fonts are presentation-only; system-font fallbacks keep everything functional offline. No leadership data ever leaves the browser. That constraint is permanent and non-negotiable.

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. Software that hands a new leader answers produces a compliant operator who collapses the first time reality deviates from the script — and creates real legal exposure when someone acts on generated advice about a termination without judgment. The division of labor is explicit and enforced in the UI:

| The app owns | You own |
| --- | --- |
| Detection, scoring, sequencing, drafting, record-keeping, escalation timing, cadence | The judgment call |
| Forcing decisions/outcomes to be recorded with rationale and a review date | Living with the outcome |
| The review loop that turns experience into skill — the actual leadership-course substitute | Reading the loop honestly |

The **escalation test** (`ethics_hr` type, severity 5, keyword triggers: harassment, discrimination, safety, medical, fraud, legal, retaliation…) hard-stops automation **in the write path**: only the case record, verbatim evidence, and an HR-contact task dated today are created. Playbooks never drive legal-grade situations, and the corresponding advisories (escalation-open, HR-task-due, integrity-fault) **cannot be snoozed**.

## The case spine (the architectural core)

Register a case **once**, anywhere — person page, team page, advisory action, top bar, or `C`. The intake shows a live classification preview (Cynefin domain · Eisenhower quadrant · severity SLA · escalation check · the exact list of writes · **the lesson from the last closed case of the same type**) **before you commit**. The engine then:

1. Dispatches the type's dated playbook (4–6 tasks) into the task stream.
2. Writes real, linked records into every routed module — evidence, 1:1 scheduled + agenda injected, pre-created SBI draft, P×I risk entry, decision with review gate, diagnosis record, ADKAR record, **guardrailed comms draft** (team-level routes), signal flags with stored priors — every write trapped in the case's **propagation ledger** with click-through routes. Departure cases fan out **one KT task per `criticalFor` capability — naming the derived trainee** — and a leaver-lead gets a **derived succession-bench readout written into the case timeline**.
3. Refuses identical same-day duplicates (idempotent intake).
4. Closure is checked, not assumed: outcome + lesson mandatory, orphaned tasks cancelled, signal priors restored, lesson journaled, and a **+30d re-openable verification task** armed.

## Module map (22 routes)

| Route | Module | Depth |
| --- | --- | --- |
| #/today | Daily brief | Engine-ranked focus, week-ahead strip, **welcome-back digest after 4+ days away**, today's 1:1s with pre-baked agendas, commitments split **broken-by-you vs owed-to-you**, load index, rep-of-the-day, Friday review prompt |
| #/inbox | Mentor inbox | **50 detection rules** across every collection, weighted/ranked/executable, dated snoozing with Deferred lane, 3 unsnoozable integrity-class rules |
| #/review | Weekly review | Auto digest, persisted 60d pressure trend, **win annotations — pressure drops demand a causal lesson too**, team-health sparklines, quarterly rhythm panel, upward-brief generator, case-type stats, guided 4-field ritual, lesson journal |
| #/cases · #/case/:id | Case workspace | 16 types, aging buckets (0–3/4–7/8–14/15d+), playbooks, pits, timeline + dated notes, click-through ledger, verified closure with re-open |
| #/people · #/person/:id | Person workspace | Flight risk (8 drivers + history sparkline), trust equation, nine-box stamps, evidence ledger, replacement economics, dev plans, mood trail, **30/60/90 ramp panel with re-armable dated gates**, instrumentation strip with one-click fix, HR packet, leave mode, archive |
| #/teams · #/team/:id | Team workspace | Edmondson scan (correct reverse-scoring), five dysfunctions (sequential), Tuckman + override, bus factor with **derived backups per single-point capability**, composite health, direction-aware KRs, working agreement, retro engine (carried forward), **derived succession bench**, **30-day intake generator (8 dated ritual tasks policing the sequence; detectors police the artifacts)** |
| #/oneonones | Session runner | Since-last digest, 7-source auto-agendas, **GROW framework strip (dates computed live)**, commitments with owedBy ownership, mood capture, carried-forward items, auto next-booking, print/copy agenda, first-session script |
| #/org | Org map | Span tree you → leads → reports, per-node load, flight exposure in money, case pressure, skip coverage, lead signal, delegation mismatches |
| #/skips | Skip-levels | Quarterly cadence per report, 5-question runner, lead signal (4 dims, de-identified), doctrine enforced: actions inject into YOUR 1:1 with the lead — never around them |
| #/feedback | Feedback | SBI composer with live assembly, draft ageing, delivery → evidence, **+21d correction verification with two artifact outcomes**, per-person balance board (60–85% zone) |
| #/delegation | Delegation | SL2 → L1–L7, mismatch warnings + Re-level, boundary conditions, checkpoints as dated tasks, debrief verdicts + journaled lessons, ladder-depth read per lead |
| #/decisions | Decision journal | Type 1/2 doors, DACI, **premortem enforced for Type 1 — and confidence ≥5 raises the premortem floor to real prose**, **premortem auto-drafts dated P×I risk rows**, review gates, explicit re-dating with reason, **confidence stamped at log time → calibration-drift model**, one-way-door aging |
| #/performance | Performance | **4-cause diagnosis enforced before coaching** (system/clarity manager-owned and blocking), improvement plans with 30/60/90 checkpoints, verdicts, nine-box board, quarterly talent ritual with case flags — **bench delta journaled on completion** |
| #/pipeline | Hiring pipeline | Stage-leak counters, 14d stall nags, score-alone-first 6-dim scorecards, outcome log, **accept cascade: person + 30/60/90 ramp + first 1:1 in ONE write** |
| #/portfolio | Governance | OKRs with direction-aware KR scoring + trajectory sparklines, P×I risk register with review dates, power-interest grid with stances, meeting economics, ADKAR change records, **comms drafts written by the case spine (send-or-kill lifecycle)** |
| #/scripts | Scripts | 6 parameterized, live-assembled, guardrailed scripts; PIP/separation defers to HR by design |
| #/academy | Curriculum + simulator | 12 lessons in 4 arcs with scored checks and per-arc progress, **5 scenarios with two-tier consequence branching** — brilliant-jerk, inherited team, **escalation-class**, **departure/bench discipline**, **the reversed-Type-2 trap** |
| #/self | Your leadership | OS readiness checklist (14 artifacts, one-click fixers incl. integrity-green), load breakdown, time mix vs MoM targets, candour + TKI checks, catch-me-up digest from any date, first-90-days plan |
| #/data | Data & integrity | Executable integrity audit (~20 checks) · safe repair · copyable diagnostics · export/import with **legacy v1 auto-migration + deterministic id-normalization** · audit-preserving prune · example org |

## Mentor rule set (50)

SLA breach · escalation open (unsnoozable) · HR contact due (unsnoozable) · record integrity fault (unsnoozable) · overdue tasks · cadence breach · repeat cancels · draft ageing · feedback famine · balance off-zone · flight high · trust fragile · trust unassessed · mood slope · nine-box stale · delegation mismatch · checkpoint overdue · decision gate passed · Type 1 without premortem · risk rotting · manage-closely cold · OKR slipping · goal expired-unjudged · psych unscanned · bus factor critical · load overload · repeat-case pattern · weekly review due · closure verification due · correction verification due · export overdue · dev plan missing/stale · skip overdue · lead signal weak · under-instrumented direct · pipeline stalled · meeting factory/no product · recognition clustering · retro overdue · diagnosis pending · team without goals · case idle · upward brief stale · team health weekly drop · one-way door aging · succession bench empty · confidence calibration drift · ADKAR stalled at first gap · time mix off targets · **knowledge transfer behind**.

## Model library (29 pure scoring functions)

Cynefin · SLA derivation · Eisenhower · escalation test · trust equation · weighted flight risk (8 drivers) · SLII → delegation level · L1–L7 mismatch · Edmondson (reverse-scored correctly) · five dysfunctions (sequential) · Tuckman · bus factor · nine-box · direction-aware KR progress · leader load · team health composite · replacement cost · power-interest · decision calibration · ADKAR first-gap · praise/correction balance · time-mix targets · derived 1:1 cadence · skip coverage · lead signal aggregate · succession bench derivation · confidence-calibration drift · **per-capability backup derivation**.

## Architecture (single file, layered)

```
index.html
  <style>   design system (ink/amber; Fraunces / Inter / IBM Plex Mono) + print + mobile
  <script>
   1. STORE      blank() state · load/save with failed-write surfacing · migrateShape() + id-normalization
   2. UTIL/DOM   uid/dates/esc · toast · modal · form builder · inline icon set
   3. FW         29 pure scoring models — no I/O, no mutation
   4. CONTENT    CASE_TYPES (16) · SCRIPTS (6) · QBANK · LESSONS (12) · SCENARIOS (5)
   5. ENGINE     createCase + ledger · close/reopen · agendas · delivery · accept cascade · premortemToRisks · comm-drafts · catchUp · HR packet
   6. MENTOR     RULES (50) · mentorScan · dailyBrief · persisted trend snapshots
   7. VIEWS      22 Routes.* renderers + delegated Actions.* registry
   8. INTEGRITY  executable audit · safe repair · diagnostics
   9. SEED+BOOT  example org via the production engine · legacy-key detection · shortcuts · init
```

## Storage reality (stated plainly, in the UI too)

- ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
- Cleared if you clear site data. No sync, no recovery.
- Contains notes about named individuals that may be disclosable in a grievance process — write every note as if read aloud in that room.
- Failed writes surface in the top bar and telemetry, never silently.
- **Export weekly** (Data & integrity → Export JSON); the `export-overdue` advisory nags past 14 days.
- Legacy `leadcore.v1` stores and v1-shaped exports **auto-migrate**; duplicate ids are deterministically re-minted at import; unmigratable shapes fail loudly without touching current state.

## Shortcuts

| Key | Action |
| --- | --- |
| `/` or `Ctrl/Cmd-K` | Command palette — people, teams, cases, modules, actions |
| `C` | Register a case (live classification + propagation preview) |
| `1–9` | today · inbox · cases · people · teams · 1:1s · feedback · decisions · academy |
| `0` | Weekly review |
| `Esc` | Close modal |

## Files

| File | Role |
| --- | --- |
| `index.html` | The entire application (shell, design system, store, models, content, engine, mentor, views, integrity, seed, boot) |
| `AI-SESSION-LOG.md` | Continuation-engineering session record: critique, positions, changelog, QA, watchlist |
| `README.md` | This file |

First boot builds an **example organization through the production engine** (two teams, eight people, two live cases with full propagation, goals with KRs, an active delegation, delivered feedback with evidence, decisions, stakeholders, skips) so every module is alive on first paint. Erase it in Data & integrity when you're ready for your real org.
