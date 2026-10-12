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

The **escalation test** (`ethics_hr` type, severity 5, keyword triggers: harassment, discrimination, safety, medical, fraud, legal, retaliation…) hard-stops automation **in the write path**: only the case record, verbatim evidence, and an HR-contact task dated today are created. Playbooks never drive legal-grade situations, and the corresponding advisory **cannot be snoozed** — resolve it or own the delay openly, never defer it.

## The case spine (the architectural core)

Register a case **once**, anywhere — person page, team page, advisory action, top bar, or `C`. The intake shows a live classification preview (Cynefin domain · Eisenhower quadrant · severity SLA · escalation check · the exact list of writes · **the lesson from the last closed case of the same type**) **before you commit**. The engine then:

1. Dispatches the type's dated playbook (4–6 tasks) into the task stream.
2. Writes real, linked records into every routed module — evidence, 1:1 scheduled + agenda injected, pre-created SBI draft, P×I risk entry, decision with review gate, diagnosis record, ADKAR record, signal flags with stored priors — every write recorded in the case's **propagation ledger** with click-through routes. Departure cases fan out **one knowledge-transfer task per `criticalFor` capability**.
3. Refuses identical same-day duplicates (idempotent intake).
4. Closure is checked, not assumed: outcome + lesson mandatory, orphaned tasks cancelled, signal priors restored, lesson journaled, and a **+30d verification task** armed — it can re-open the case and raise the response level.

## Module map (22 routes)

| Route | Module | Depth |
| --- | --- | --- |
| #/today | Daily brief | Engine-ranked focus, **week-ahead strip**, **welcome-back digest after 4+ days away** (cases, movers, throughput, hires, pressure — sequenced), today's 1:1s with pre-baked agendas, overdue commitments split **broken-by-you vs owed-to-you**, load index, rep-of-the-day, Friday review prompt |
| #/inbox | Mentor inbox | **41 detection rules** across every collection, weighted/ranked, executable actions, dated snoozing with a Deferred lane, 3 unsnoozable integrity-class rules |
| #/review | Weekly review | Auto digest, **persisted 60d pressure trend**, **26-week team-health sparklines**, quarterly rhythm panel, **upward brief generator** (copy/print, neutral by construction), case-type stats, guided 4-field ritual, lesson journal |
| #/cases · #/case/:id | Case workspace | **16 types**, **aging buckets (0–3/4–7/8–14/15d+)**, playbooks, pits, timeline + dated notes, click-through ledger, verified closure with re-open |
| #/people · #/person/:id | Person workspace | Flight risk (8 weighted drivers + history sparkline), trust equation (C+R+I)/S, nine-box stamps, evidence ledger, replacement economics, dev plans, mood trail (10 sessions), instrumentation strip with **one-click fix**, HR packet (copy/print), leave mode (pauses nags — never cases), archive |
| #/teams · #/team/:id | Team workspace | Edmondson scan (correct reverse-scoring), five dysfunctions (sequential), Tuckman + override, bus factor, composite health, direction-aware KRs, **working agreement**, **retro engine** (STOP/START → dated owned tasks, carried forward until closed or killed loudly) |
| #/oneonones | Session runner | **Since-last digest**, 7-source auto-agendas, commitments with **owedBy (me/them)**, mood capture feeding the trail, carried-forward open items, **auto next-booking at derived cadence**, print/copy agenda, first-session script |
| #/org | Org map | Span tree you → leads → reports, per-node load, flight exposure in money, open-case pressure, skip coverage, lead signal, delegation mismatches, next 1:1 |
| #/skips | Skip-levels | Quarterly cadence per report, 5-question runner, **lead signal (4 dims, de-identified)**, doctrine enforced in code: actions inject into YOUR 1:1 with the lead — never around them |
| #/feedback | Feedback | SBI composer with live assembly, draft ageing, delivery → evidence write, **+21d correction verification with two artifact outcomes** (change seen → named evidence · not yet → next 1:1 agenda cites the original SBI, dated), per-person balance board (60–85% zone) |
| #/delegation | Delegation | SL2 competence/commitment → suggested **L1–L7**, mismatch warnings + Re-level, boundary conditions, checkpoints as dated tasks, debrief verdicts + journaled lessons, **ladder-depth read per lead** |
| #/decisions | Decision journal | Type 1/2 doors, DACI, **premortem enforced for Type 1** (execution unblocks only when one exists), review gates, explicit re-dating with reason on record, calibration % |
| #/performance | Performance | **4-cause diagnosis enforced before coaching** (system/clarity are manager-owned and block coaching until your fix is dated), improvement plans with 30/60/90 checkpoints, verdicts, nine-box board, **quarterly talent ritual** (one sitting, every direct re-stamped with change-note, optional case flags) |
| #/pipeline | Hiring pipeline | Sourced→screen→loop→offer with stage-leak counters, 14d stall nags, score-alone-first 6-dim scorecards, outcome log, **accept cascade: mint person + 30/60/90 ramp + first 1:1 in ONE write** |
| #/portfolio | Governance | OKRs with **direction-aware KR scoring** and trajectory sparklines, P×I risk register with review dates, **power-interest grid** with stance dots, meeting economics ($/decision, one-click debt→case, one-click decision capture), ADKAR change records |
| #/scripts | Scripts | 6 parameterized, live-assembled, guardrailed scripts (first 1:1, SBI correction, praise, delegation brief, skip opener, PIP/separation → defers to HR) |
| #/academy | Curriculum + simulator | 12 lessons in 4 arcs with scored checks, per-arc progress (lessons/checks), 2 scenarios with two-tier consequence branching and persisted scores |
| #/self | Your leadership | **OS readiness checklist (14 artifacts, one-click fixers, incl. integrity-green)**, load-index breakdown, time mix vs manager-of-managers targets, radical candour + TKI checks, catch-me-up digest from any date, first-90-days plan |
| #/data | Data & integrity | **Executable integrity audit** (schema, JSON round-trip, id uniqueness, reporting cycles, 12 reference classes, ledger targets, retro/task sync, hiring cascade, route/content contracts, 3 model assertions, quota, runtime) · safe repair for mechanically unambiguous corruption · copyable diagnostics · export/import · audit-preserving prune · example org load/erase |

## Mentor rule set (41)

SLA breach · escalation open (unsnoozable) · overdue tasks · cadence breach · repeat cancels · draft ageing · feedback famine · balance off-zone · flight high · trust fragile · trust unassessed · mood slope · nine-box stale · delegation mismatch · checkpoint overdue · decision gate passed · Type 1 without premortem · risk rotting · manage-closely cold · OKR slipping · goal expired-unjudged · psych unscanned · bus factor critical · load overload · repeat-case pattern · weekly review due · closure verification due · correction verification due · export overdue · dev plan missing/stale · skip overdue · lead signal weak · under-instrumented direct · pipeline stalled · meeting factory/no product · recognition clustering · retro overdue · diagnosis pending · team without goals · case idle · HR contact due (unsnoozable).

## Model library (26 pure scoring functions)

Cynefin · SLA derivation · Eisenhower · escalation test · trust equation · weighted flight risk (8 drivers) · SLII → delegation level · L1–L7 mismatch · Edmondson (reverse-scored correctly) · five dysfunctions (sequential) · Tuckman · bus factor · nine-box · direction-aware KR progress (a failing reduce-KR cannot read 100%) · leader load · team health composite · replacement cost · power-interest · decision calibration · ADKAR first-gap · praise/correction balance · time-mix targets · derived 1:1 cadence · skip coverage · **lead signal aggregate**.

## Architecture (single file, layered)

```
index.html
  <style>   design system (ink/amber; Fraunces / Inter / IBM Plex Mono) + print + mobile
  <script>
   1. STORE      blank() state, load/save with failed-write surfacing, quota
   2. UTIL/DOM   uid/dates/esc, toast, modal, form builder, inline icon set
   3. FW         26 pure scoring models — no I/O, no mutation
   4. CONTENT    CASE_TYPES (16) · SCRIPTS (6) · QBANK · LESSONS (12) · SCENARIOS (2)
   5. ENGINE     createCase + propagation ledger · closeCase/reopen · agendas · delivery · accept cascade · catchUp · HR packet
   6. MENTOR     RULES (41) · mentorScan · dailyBrief · persisted trend snapshots
   7. VIEWS      22 Routes.* renderers + delegated Actions.* registry
   8. INTEGRITY  executable audits · safe repair · diagnostics
   9. SEED+BOOT  example org built through the production engine · shortcuts · init
```

## Storage reality (stated plainly, in the UI too)

- ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
- Cleared if you clear site data. No sync, no recovery.
- Contains notes about named individuals that may be disclosable in a grievance process — write every note as if read aloud in that room.
- Failed writes surface in the top bar and telemetry, never silently.
- **Export weekly** (Data & integrity → Export JSON); the `export-overdue` advisory nags past 14 days.

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

First boot builds an **example organization through the production engine** (two teams, seven people + one ramping hire, two live cases with full propagation, goals with KRs, an active delegation, delivered feedback with evidence, decisions, stakeholders, skips) so every module is alive on first paint. Erase it in Data & integrity when you're ready for your real org.
