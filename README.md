# LeadCore — Leadership Operating System · v4 (Session 4 build)

An offline-first operating system for a new manager-of-managers. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leadcore.v4`) in one browser profile. Web fonts are presentation-only; system-font fallbacks keep everything functional offline. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. Software that hands a new leader answers produces a compliant operator who collapses the first time reality deviates from script — and creates real legal exposure when someone acts on generated advice about a termination without judgment. The division of labor is explicit and enforced in the UI:

| The app owns | You own |
|---|---|
| Detection (60 rules), scoring (38 pure models), sequencing, drafting, record-keeping, escalation timing, cadence | The judgment call |
| Forcing decisions/outcomes to be recorded with rationale and a review date | Living with the outcome |
| The review loop that turns experience into skill — the actual leadership-course substitute | Reading the loop honestly |

The **escalation test** (`ethics_hr` type, keyword triggers: harassment, discrimination, safety, medical, fraud, legal, retaliation…) hard-stops automation **in the write path**: only the case record, verbatim evidence, and an HR-contact task dated today are created. PIP/separation scripts deliberately do not exist. The mediation protocol halts twice (stage 1 and stage 4) to force conversion to HR escalation when protected-class content surfaces. The unsnoozable advisories (escalation-open, HR-task-due, integrity-fault) cannot be deferred.

## The case spine (architectural core, unchanged from v2)

Register a case **once**, anywhere — person page, team page, advisory action, top bar, or `C`. The intake shows a live classification preview before you commit: Cynefin domain · Eisenhower quadrant · severity SLA · keyword/escalation check · the exact list of writes · the lesson from the last closed case of the same type. The engine then:

1. Dispatches the type's dated playbook (2–6 tasks) into the task stream.
2. Writes real, linked records into every routed module across **13 wire kinds** — evidence, mediation protocol, 1:1 + auto-agenda, SBI draft, P×I risk, decision + gate, 4-cause diagnosis (blocking), guardrailed comms draft, KT fan-out (one task per critical capability), succession-bench readout into timeline, backfill requisition, stakeholder pre-wires, goal-check — every write trapped in the case's **propagation ledger** with click-through routes.
3. Refuses identical open duplicates (idempotent intake).
4. Closure is checked, not assumed: outcome + lesson mandatory, orphaned tasks cancelled, lesson journaled, +30d re-openable verification armed, and AAR armed for sev ≥ 3.
5. **Cross-links related open cases** (same person/team): two live cases on one scope is surfaced as signal, never coincidence.

## Session 4 additions (what's new in v4)

| Module | Depth |
|---|---|
| `#/mediation` | Six-stage protocol (frame → stories → interests → options → agreement → follow-up), order enforced by the stepper, two mandatory HR hard-stop gates, agreements embedded into structure + +14d verification task + evidence write |
| `#/coach` | GROW runner (Goal/Reality/Options/Way forward) with live quality scoring (specificity, 3-option floor, dated Way-forward), a 40-question co-pilot bank per stage, commitments → dated owned tasks, quality-tagged session history, stale-coaching advisory per lead |
| `#/negotiate` | BATNA lab: reservation point forced BEFORE the room, their-interest probe, ZOPA read, concession ladder (give ⇄ get by-when), live prep-strength score, one-click comms draft with the floor redacted, review-date rotting rule |
| `#/meetings` | Decision-first designer (no owned decision = memo with lights), live annualized cost, mechanical verdicts (pays rent / kill-or-async / watch), recurring-hours factory flag, async conversion with journaled savings |
| `#/aar` | Expected-vs-happened (numbers required), 5-whys ladder validated for depth + causality words, blameless stop condition, quality score, improvements auto-converted to owned dated tasks, "tuition unpaid" gate against closed sev≥3 cases |
| `crisis` case type | 15th type, 48h SLA, phase playbook (stabilize/assess/communicate/recover/review), crisis-aging unsnoozable-adjacent advisory |
| Energy telemetry | `#/self` check-ins (focus/stamina/mood/clarity) — leading indicator rule fires below 45 |

Deltas deliberately **not** implemented (positions held): no cloud sync, no accounts, no AI text generation of advice, no anonymous peer comparison — each would weaken either the local-only constraint or the judgment contract.

## Module map (26 renderers — 23 nav routes + 3 workspaces)

| Route | Module | Depth |
|---|---|---|
| #/today | Daily brief | Engine-ranked top-3, week-ahead strip, welcome-back digest after 4+ days, sessions with pre-baked agendas, commitments **broken-by-you vs owed-to-you**, load index, pressure sparkline, Friday review prompt |
| #/inbox | Mentor inbox | **60 executable detection rules**, weighted/rank-ordered, dated snoozing with Deferred lane, 3 unsnoozable integrity-class rules, positive signals lane |
| #/review | Weekly review | Auto 7d digest, persisted 60d pressure trend (drops demand causal lessons too), team-health meters, 60-second upward-brief generator, guided 4-field ritual, lesson journal |
| #/cases · #/case/:id | Case workspace | 15 types, aging buckets (0–3/4–7/8–14/15d+), playbooks, known failure modes, timeline + dated notes, click-through ledger, automatic cross-links, verified closure with re-open, 4-cause diagnosis gate inline |
| #/people · #/person/:id | Person workspace | Flight risk (8 weighted drivers + history sparkline), trust equation, nine-box stamps with 120d expiry, evidence ledger, replacement economics, dev plans, **blended 4-question mood pulse**, re-armable 30/60/90 gates, under-instrumented strip with one-click fix, HR packet (copy/print), leave mode, archive |
| #/teams · #/team/:id | Team workspace | Edmondson scan (correct reverse-scoring on items 2/4/6), five dysfunctions (sequential), Tuckman + override, bus factor per capability, composite health, direction-aware KRs with trajectory sparklines, working agreement, retro engine (STOP/START → dated owned tasks), **derived succession bench** (nine-box × ladder depth × overlap × trust — readiness + exact next rep) |
| #/oneonones | Session runner | Since-last digest, auto-agendas from 6 sources, owedBy commitments ledger, blended pulse feeding flight slope, carried-forward items, auto next-booking at derived cadence, move-count trust telemetry, copy/print agenda |
| #/org | Org map | Span tree, flight exposure in money per node, case pressure, bus-factor-1 flag list |
| #/skips | Skip-levels | Quarterly cadence per report-of-lead, 5-question runner, 4-dim signal, doctrine enforced: themes inject de-identified into YOUR 1:1 with the lead — never around them |
| #/feedback | Feedback | SBI composer with live assembly, draft ageing clocks (praise 48h / corrections 72h), deliver → evidence, **+21d correction verification with two artifact outcomes**, per-direct balance board (60–85% zone) |
| #/coach | GROW coach | *(new — see above)* |
| #/mediation | Mediation protocol | *(new — see above)* |
| #/delegation | Delegation | SLII skill×will → L1–L7 with mismatch warnings, boundary conditions, checkpoints with overdue flags, debrief verdicts that raise/lower the ladder + journal lessons, ladder-depth read per lead |
| #/performance | Performance | 4-cause diagnosis enforced before coaching (system/clarity manager-owned, blocking), nine-box board, quarterly talent ritual panel with live staleness counts |
| #/decisions | Decision journal | Type 1/2 doors, DACI, **premortem enforced for Type 1** (engine refuses otherwise), premortem → dated P×I risk rows, review gates, explicit re-dating with reason, confidence stamped at log time → calibration drift grading |
| #/portfolio | Governance | OKRs with direction-aware KR scoring + trajectory sparklines, expired-goal grading ritual, P×I risk register with inline ADKAR change-walk (first-gap coaching), power-interest grid with stance plays, **comms drafts written by the case spine — send-or-kill lifecycle, dates logged** |
| #/negotiate | Negotiation lab | *(new — see above)* |
| #/pipeline | Hiring | 6-dimension score-alone-first scorecards, 14d stall flags, stage-leak telemetry, **accept cascade: person + 30/60/90 ramp + first 1:1 + day-1 contract in ONE write** |
| #/meetings | Meeting designer | *(new — see above)* |
| #/aar | After-action reviews | *(new — see above)* |
| #/academy | Curriculum + simulator | 12 lessons in 6 arcs with 4 scored checks each, **4 scenarios × 3 stages with two-tier consequence scoring** (brilliant-jerk, escalation-class, departure/bench, reorg-rumor crisis comms) |
| #/scripts | Scripts | 8 parameterized, live-assembled, guardrailed scripts; PIP/separation **deliberately defers to HR** |
| #/self | Your leadership | 13-artifact readiness checklist with one-click fixers, load breakdown, time-mix vs MoM targets, candour + TKI mirror, energy telemetry, catch-me-up digest from any date, first-90-days plan |
| #/data | Data & integrity | Executable integrity audit (**24 check classes**) · safe repair (mechanically unambiguous only) · export/import with import-time id dedupe (deterministic re-mint) · audit-preserving prune · example org (re)load/erase |

## Mentor rule set — 60, verified by count

The audit asserts `RULES.length === 60` and 3 unsnoozables at runtime; the Data page prints the live count. Highlights beyond the v2 set: mediation-overdue · AAR-pending · negotiation-review · coach-stale · meeting-no-decision · energy-low · ramp-gate-missed · crisis-aging, plus positive signals (mood brightening, closure verified).

## Model library — 38 pure scoring functions + keyword table

All in `FW`: no I/O, no mutation, unit-asserted by the audit (Edmondson reverse-scoring, direction-aware KRs, flight bounds). Session 4 added: coach quality, BATNA strength, AAR quality, why-chain validator, meeting cost/verdict, conflict temperature, blended energy score, span health, case pressure, commitment debt.

## Architecture

```
index.html
  <style>   design system (ink/amber; Fraunces / Inter / IBM Plex Mono) + print + mobile
  <script>
   1. STORE      blank() · load/save with failed-write surfacing · quota meter
   2. UTIL/DOM   dates · esc · toast/modal · form builders · inline icon set (50+)
   3. FW         38 pure scoring models — no I/O, no mutation
   4. CONTENT    CASE_TYPES (15) · SCRIPTS (8) · QBANK (GROW 40 / skip / mediation / crisis) · LESSONS (12, 6 arcs) · SCENARIOS (4)
   5. ENGINE     createCase + 13 wire kinds + ledger · close/reopen · agendas · delivery · accept cascade · premortemToRisks · catchUp · HR packet
   6. MENTOR     RULES (60) · scanMentor with daily pressure snapshot · dailyBrief
   7. VIEWS      26 renderers + delegated Actions registry + command palette
   8. INTEGRITY  executable audit (24 classes) · safe repair
   9. SEED+BOOT  example org via the production engine · shortcuts · init
```

## Storage reality (stated plainly, in the UI too)

* ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
* Cleared if you clear site data. No sync, no recovery.
* Contains notes about named individuals that may be disclosable in a grievance process — **write every note as if read aloud in that room.**
* Failed writes surface in the top bar, never silently.
* **Export weekly** (Data → Export JSON); the `export-overdue` advisory nags past 14 days.
* Imports are v4-only: wrong-shape files fail loudly without touching current state; duplicate ids are deterministically re-minted; an audit runs automatically post-import.

## Shortcuts

| Key | Action |
|---|---|
| / or Ctrl/Cmd-K | Command palette — people, teams, cases, modules, actions |
| C | Register a case (live classification + propagation preview) |
| 1–9 | today · inbox · cases · people · 1:1s · feedback · coach · decisions · academy |
| 0 | Weekly review |
| Esc | Close modal |

## Files

| File | Role |
|---|---|
| index.html | The entire application (shell, design system, store, models, content, engine, mentor, views, integrity, seed, boot) |
| README.md | This file |
| AI-SESSION-LOG.md | Session-4 engineering record: critique, positions, changelog, QA, watchlist |

First boot builds an **example organization through the production engine** (two teams, six people, three live cases with full propagation incl. an armed mediation, missed ramp gate, aged correction awaiting +21d verification, Type-1 decision past its gate with premortem-drafted risks, overdue delegation checkpoint, stalled pipeline candidate, skeptical manage-closely stakeholder, a negotiation past its review date, and a meeting-factory) so every module — and roughly two dozen advisories — are alive on first paint. Set yourself in **#/self**, then erase the example in **#/data** when your real org arrives.

## Honesty ledger (v4 vs v2, and claims vs code)

* **v1 migration**: still absent by design — import fails loudly on unmigratable shapes. No v1/v2 stores exist in the wild for this fork.
* **v2 SESSION-3 patch** (estimated-pulse hygiene, instrument-boundary annotation): the v4 rebuild of the pulse strip made those deltas moot; the blended pulse UI carries the annotation inline now.
* **Counts in this README are verified by the running audit**, not by prose: 23 collections · 26 renderers · 60 rules · 38 models · 15 case types · 13 wire kinds · 8 scripts · 12 lessons · 4 scenarios · 24 audit classes. If a number and the code ever disagree, the Data page is the authority — it counts live.
* **Known limits held open**: snoozes are date-based strings (no timezone nuances); the pressure metric is case-derived, not calendar-derived; nine-box board buckets at 3-point bands (documented on the board); the crisis type's playbook is a guide, and the SLA-clock advisory is intentionally loud.
