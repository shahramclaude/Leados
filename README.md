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

The **escalation test** (`ethics_hr` type, keyword triggers: harassment, discrimination, safety, medical, fraud, legal, retaliation…) hard-stops automation **in the write path**: only the case record, verbatim evidence, and an HR-contact task dated today are created. Playbooks never drive legal-grade situations, and the corresponding advisories (escalation-open, HR-task-due, integrity-fault) **cannot be snoozed**.

## The case spine (the architectural core)

Register a case **once**, anywhere — person page, team page, advisory action, top bar, or `C`. The intake shows a live classification preview (Cynefin domain · Eisenhower quadrant · severity SLA · keyword/escalation check · the exact list of writes · **the lesson from the last closed case of the same type**) before you commit. The engine then:

1. Dispatches the type's dated playbook (2–6 tasks) into the task stream.
2. Writes real, linked records into every routed module — evidence, 1:1 scheduled + agenda injected, pre-created SBI draft, P×I risk entry, decision with review gate, 4-cause diagnosis record, ADKAR record, **guardrailed comms draft** (team-level routes), pipeline requisition, stakeholder prompts — every write trapped in the case's **propagation ledger** with click-through routes. Departure cases fan out **one knowledge-transfer task per critical capability**, and a leaver-lead gets a **derived succession-bench readout written into the case timeline**.
3. Refuses identical open duplicates (idempotent intake).
4. Closure is checked, not assumed: outcome + lesson mandatory, orphaned tasks cancelled, lesson journaled, and a **+30d re-openable verification task** armed.

## Module map (22 renderers, 19 nav routes + 3 workspaces)

| Route | Module | Depth |
| --- | --- | --- |
| #/today | Daily brief | Engine-ranked top-3 focus, week-ahead strip, **welcome-back digest after 4+ days away**, sessions with pre-baked agendas, commitments split **broken-by-you vs owed-to-you**, load index, pressure sparkline, Friday review prompt |
| #/inbox | Mentor inbox | **52 detection rules** across every collection, weighted/ranked/executable, dated snoozing with Deferred lane, 3 unsnoozable integrity-class rules |
| #/review | Weekly review | Auto digest, persisted 60d pressure trend (**drops demand causal lessons too**), team-health meters, quarterly rhythm panel, 60-second upward-brief generator, guided 4-field ritual, lesson journal |
| #/cases · #/case/:id | Case workspace | 14 types, aging buckets (0–3/4–7/8–14/15d+), playbooks, known failure modes, timeline + dated notes, click-through ledger, **automatic cross-links between related open cases** (same person/team — two live cases on one scope is surfaced as signal, never coincidence), verified closure with re-open |
| #/people · #/person/:id | Person workspace | Flight risk (8 weighted drivers + history sparkline), trust equation, nine-box stamps, evidence ledger, replacement economics, dev plans, **blended 4-question mood pulse** (overall × energy × load × support, with live chips), **re-armable 30/60/90 ramp gates**, under-instrumented strip with **one-click fix**, HR packet, leave mode, archive |
| #/teams · #/team/:id | Team workspace | Edmondson scan (correct reverse-scoring on items 2/4/6), five dysfunctions (sequential), Tuckman + override, bus factor per capability, composite health, direction-aware KRs with trajectory sparklines, working agreement, retro engine (STOP/START → dated owned tasks, carried forward), **derived succession bench** (nine-box × delegation ladder × capability overlap × trust — readiness + exact next rep) |
| #/oneonones | Session runner | Since-last digest, auto-agendas from 6 sources, commitments with owedBy ownership, 4-question pulse feeding the blended flight slope, carried-forward open items, auto next-booking at derived cadence, copy/print agenda |
| #/org | Org map | Span tree you → leads → reports, flight exposure in money per node, case pressure, bus-factor-1 flag list, live delegation levels |
| #/skips | Skip-levels | Quarterly cadence per report, 5-question runner, 4-dim signal, doctrine enforced: actions inject into YOUR 1:1 with the lead — de-identified, never around them |
| #/feedback | Feedback | SBI composer with live assembly, draft ageing nags (praise 48h / corrections 72h), delivery → evidence, **+21d correction verification with two artifact outcomes**, per-direct balance board (60–85% zone) |
| #/delegation | Delegation | SLII skill×will → L1–L7 with mismatch warnings + re-level, boundary conditions, checkpoints with overdue flags, debrief verdicts + journaled lessons, ladder-depth read per lead |
| #/decisions | Decision journal | Type 1/2 doors, DACI, **premortem enforced for Type 1**, **premortem auto-drafts dated P×I risk rows**, review gates, explicit re-dating with reason, **confidence stamped at log time → calibration drift (overconfidence / sandbagging)**, one-way-door aging |
| #/performance | Performance | **4-cause diagnosis enforced before coaching** (system/clarity manager-owned and blocking), 30/60/90 checkpoints, verdicts (exit defers to escalation path), nine-box board, quarterly talent ritual |
| #/pipeline | Hiring pipeline | 6-dim score-alone-first scorecards, 14d stall flags, stage-leak telemetry, **accept cascade: person + 30/60/90 ramp + first 1:1 in ONE write** |
| #/portfolio | Governance | OKRs with direction-aware KR scoring + trajectory sparklines, expired-goal grading, P×I risk register with review dates and inline ADKAR walk, power-interest grid with stance plays, meeting economics, **comms drafts written by the case spine (send-or-kill lifecycle, dates logged)** |
| #/scripts | Scripts | 6 parameterized, live-assembled, guardrailed scripts; PIP/separation **deliberately defers to HR** |
| #/academy | Curriculum + simulator | 12 lessons in 6 arcs with 4 scored checks, **3 scenarios × 3 stages with two-tier consequence scoring** (brilliant-jerk, escalation-class, departure/bench discipline) |
| #/self | Your leadership | OS readiness checklist (13 artifacts, one-click fixers incl. integrity-green), load breakdown, time mix vs MoM targets, candour + TKI checks, catch-me-up digest from any date, first-90-days plan |
| #/data | Data & integrity | Executable integrity audit (20 check classes incl. cross-link resolution) · safe repair (mechanically unambiguous only, incl. dangling-link prune) · export/import with **import-time id dedupe (deterministic re-mint)** · audit-preserving prune · example org (re)load/erase |

## Mentor rule set (52 — count them in `RULES`)

Escalation open (unsnoozable) · HR contact due (unsnoozable) · **record integrity fault (unsnoozable)** · SLA breach · overdue tasks · 1:1 cadence breach · repeat cancels · draft ageing · feedback famine · balance off-zone · flight high · trust fragile · trust unassessed · mood slope · nine-box stale · delegation mismatch · checkpoint overdue · decision gate passed · Type 1 without premortem · one-way-door aging · risk rotting · manage-closely cold · OKR slipping · goal expired-unjudged · psych unscanned · bus factor critical · load overload · repeat-case pattern · weekly review due · closure verification due · correction verification due · export overdue · dev plan missing/stale · skip overdue · lead signal weak · under-instrumented direct · pipeline stalled · meeting factory · recognition clustering · retro overdue · diagnosis pending · team without goals · case idle · upward brief stale · pressure fortnight jump · **succession bench empty** · **confidence calibration drift** · **ADKAR stalled at first gap** · **time mix off targets** · mood brightening (positive signal) · closure verified (positive signal) · example-org-first-run.

## Model library (27 pure scoring functions — no I/O, no mutation)

Escalation keyword test · Cynefin domain · SLA derivation · Eisenhower · trust equation · weighted flight risk (8 drivers) · mood slope · Edmondson (reverse-scored correctly) · five dysfunctions (sequential) · Tuckman · bus factor · nine-box · direction-aware KR progress · goal roll-up · leader load · team health composite · power-interest · stance plays · **confidence-calibration drift** · ADKAR first-gap · derived 1:1 cadence · SLII delegation mismatch · replacement cost · **succession bench derivation** · praise/correction balance · time-mix targets · **blended mood pulse valuation** (feeds slope + flight driver).

## Architecture (single file, layered)

```
index.html
  <style>   design system (ink/amber; Fraunces / Inter / IBM Plex Mono) + print + mobile
  <script>
   1. STORE      blank() · load/save with failed-write surfacing · quota meter
   2. UTIL/DOM   dates/esc · toast · modal · form builder · inline icon set (60+)
   3. FW         27 pure scoring models — no I/O, no mutation
   4. CONTENT    CASE_TYPES (14) · SCRIPTS (6) · QBANK · LESSONS (12) · SCENARIOS (3)
   5. ENGINE     createCase + ledger · close/reopen · agendas · delivery · accept cascade · premortemToRisks · catchUp · HR packet
   6. MENTOR     RULES (52) · mentorScan w/ daily pressure snapshot · dailyBrief
   7. VIEWS      22 renderers + delegated Actions registry + command palette
   8. INTEGRITY  executable audit (20 check classes) · safe repair
   9. SEED+BOOT  example org via the production engine · shortcuts · init
```

## Storage reality (stated plainly, in the UI too)

* ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
* Cleared if you clear site data. No sync, no recovery.
* Contains notes about named individuals that may be disclosable in a grievance process — write every note as if read aloud in that room.
* Failed writes surface in the top bar and telemetry, never silently.
* **Export weekly** (Data & integrity → Export JSON); the `export-overdue` advisory nags past 14 days.
* Imports: wrong-shape files fail loudly without touching current state; duplicate ids are deterministically re-minted; an audit runs automatically post-import.

## Shortcuts

| Key | Action |
| --- | --- |
| / or Ctrl/Cmd-K | Command palette — people, teams, cases, modules, actions |
| C | Register a case (live classification + propagation preview) |
| 1–9 | today · inbox · cases · people · teams · 1:1s · feedback · decisions · academy |
| 0 | Weekly review |
| Esc | Close modal |

## Files

| File | Role |
| --- | --- |
| index.html | The entire application (shell, design system, store, models, content, engine, mentor, views, integrity, seed, boot) |
| AI-SESSION-LOG.md | Continuation-engineering session record: critique, positions, changelog, QA, watchlist |
| SESSION-3.patch.md | Anchored, additive in-place edits (estimated-pulse hygiene · instrument-boundary annotation) pending application to `index.html`; ships with stop-if-mismatch verification |
| README.md | This file |

First boot builds an **example organization through the production engine** (two teams, six people, three live cases with full propagation incl. a Type-1 decision with premortem-drafted risks, goals with slipping KRs, a live delegation checkpoint overdue, delivered feedback with evidence, a stalled pipeline candidate, a skeptical manage-closely stakeholder) so every module — and a dozen advisories — are alive on first paint. Erase it in Data & integrity when you're ready for your real org.

## Known deltas vs the predecessor README (honesty ledger)

The original repo's README claimed 49 rules / 22 routes / 28 models / 16 case types / 4 scenarios + features (legacy v1 migration, ADKAR as standalone record, 30/60/90 ramp from v1 shape) that this build implements differently: **52 / 22 / 27 / 14 / 3** here, and ADKAR lives as a first-class field on risk records with a dedicated stalled-gap rule rather than a separate collection. Legacy v1 auto-migration is not recreated (no v1 store exists in the wild for this build); import fails loudly on unmigratable shapes instead. Everything else in the mission spec — spine, ledger, escalation hard-stop, verified closure, unsnoozables, seed-through-engine — is implemented as specified. Every number above matches the code; count them.

Session 3 ledger line: `SCENARIOS (2)` in the architecture block was stale from before scenario 3 shipped — corrected to `(3)`. Everywhere else already said 3. Session-3 patch work (`SESSION-3.patch.md`) adds no rules, models, renderers, case types, or audit classes, so every other number above stands — verified by count, not memory, by this session too.
