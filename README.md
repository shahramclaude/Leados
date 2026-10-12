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
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LeadCore — Leadership Operating System</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#0A0B0E;--ink2:#0E1014;--panel:#13161C;--panel2:#171B22;--panel3:#1D222B;--line:#242A34;--line2:#2E3542;--txt:#E9E6DF;--dim:#9B968B;--faint:#6B675E;--acc:#E2A63D;--acc2:#F2C569;--acc-dim:rgba(226,166,61,.13);--ok:#63B98B;--ok-dim:rgba(99,185,139,.13);--risk:#DE6B54;--risk-dim:rgba(222,107,84,.14);--warn:#E2A63D;--warn-dim:rgba(226,166,61,.13);--info:#7C9CC9;--info-dim:rgba(124,156,201,.14);--vio:#A78BDB;--vio-dim:rgba(167,139,219,.13);--r:12px;--rl:16px;--fu:'Inter',system-ui,sans-serif;--fd:'Fraunces',Georgia,serif;--fm:'IBM Plex Mono',ui-monospace,monospace}
*{box-sizing:border-box}html{scrollbar-color:var(--line2) var(--ink)}
body{background:var(--ink);color:var(--txt);font-family:var(--fu);font-size:14px;line-height:1.55;margin:0;-webkit-font-smoothing:antialiased;overflow-x:hidden}
::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:var(--line2);border-radius:9px;border:2px solid var(--ink)}::-webkit-scrollbar-track{background:transparent}
::selection{background:rgba(226,166,61,.28)}a{color:var(--acc);text-decoration:none}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:4px}
.app{display:grid;grid-template-columns:236px 1fr;min-height:100vh}
.side{position:sticky;top:0;height:100vh;overflow-y:auto;background:linear-gradient(180deg,var(--ink2),var(--ink));border-right:1px solid var(--line);padding:20px 14px 30px;display:flex;flex-direction:column;z-index:40}
.brand{display:flex;align-items:center;gap:10px;padding:2px 10px 18px;border-bottom:1px solid var(--line);margin-bottom:14px;cursor:pointer}
.brand-mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--acc),#8f6415);display:grid;place-items:center;color:#161207;font-weight:700;font-family:var(--fd);font-size:16px;box-shadow:0 0 0 1px rgba(226,166,61,.35),0 4px 14px rgba(226,166,61,.22);flex:none}
.brand-name{font-family:var(--fd);font-weight:600;font-size:17px;letter-spacing:.02em}
.brand-sub{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);font-family:var(--fm)}
.navgroup{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);padding:14px 12px 6px;font-family:var(--fm)}
.navlink{display:flex;align-items:center;gap:10px;padding:7.5px 12px;border-radius:9px;color:var(--dim);cursor:pointer;font-size:13px;font-weight:500;position:relative;transition:background .15s,color .15s;user-select:none}
.navlink:hover{background:var(--panel2);color:var(--txt)}
.navlink.on{background:var(--acc-dim);color:var(--acc2)}
.navlink.on::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px;background:var(--acc)}
.navlink svg{width:15px;height:15px;flex:none;opacity:.85}
.nbadge{margin-left:auto;min-width:18px;height:17px;padding:0 5px;border-radius:9px;background:var(--risk);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;font-family:var(--fm)}
.nbadge.amber{background:var(--acc);color:#161207}
.side-foot{margin-top:auto;padding-top:16px;border-top:1px solid var(--line);font-size:11px;color:var(--faint);padding-left:12px}
.quota{height:4px;border-radius:4px;background:var(--panel3);margin-top:6px;overflow:hidden}
.quota i{display:block;height:100%;background:var(--ok);border-radius:4px;transition:width .4s}
.quota.hot i{background:var(--risk)}
.main{min-width:0;display:flex;flex-direction:column}
.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;padding:13px 28px;background:rgba(10,11,14,.82);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.crumb{font-family:var(--fd);font-size:19px;font-weight:600;letter-spacing:.01em;line-height:1.2}
.crumb small{font-family:var(--fm);font-size:10.5px;color:var(--faint);letter-spacing:.14em;text-transform:uppercase;display:block;font-weight:400}
.topbar .sp{flex:1}
.savefail{display:flex;align-items:center;gap:6px;color:var(--risk);font-size:11px;font-family:var(--fm);border:1px solid rgba(222,107,84,.4);border-radius:8px;padding:4px 9px;background:var(--risk-dim)}
.view{padding:26px 28px 80px;max-width:1240px;width:100%;margin:0 auto;animation:vin .38s cubic-bezier(.22,.8,.3,1)}
@keyframes vin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;border:1px solid var(--line2);background:var(--panel2);color:var(--txt);font-size:12.5px;font-weight:600;cursor:pointer;font-family:var(--fu);transition:transform .12s,box-shadow .15s,background .15s,border-color .15s;white-space:nowrap}
.btn:hover{background:var(--panel3);border-color:#3a4252;transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn svg{width:14px;height:14px}
.btn-acc{background:linear-gradient(135deg,var(--acc),#c68c25);border-color:#d29a30;color:#171204;box-shadow:0 3px 14px rgba(226,166,61,.25)}
.btn-acc:hover{background:linear-gradient(135deg,var(--acc2),var(--acc));box-shadow:0 5px 18px rgba(226,166,61,.35)}
.btn-danger{border-color:rgba(222,107,84,.5);color:var(--risk);background:var(--risk-dim)}
.btn-danger:hover{background:rgba(222,107,84,.22);border-color:var(--risk)}
.btn-ghost{background:transparent;border-color:transparent;color:var(--dim)}
.btn-ghost:hover{background:var(--panel2);color:var(--txt)}
.btn-sm{padding:5px 10px;font-size:11.5px;border-radius:8px}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
kbd{font-family:var(--fm);font-size:10px;border:1px solid var(--line2);border-bottom-width:2px;border-radius:5px;padding:1px 5px;color:var(--dim);background:var(--panel)}
.card{background:linear-gradient(180deg,var(--panel),var(--ink2));border:1px solid var(--line);border-radius:var(--rl);padding:18px 20px;position:relative;transition:border-color .2s}
.card:hover{border-color:var(--line2)}
.card.hl{border-color:rgba(226,166,61,.4);background:linear-gradient(180deg,rgba(226,166,61,.06),var(--ink2))}
.card.stop{border-color:rgba(222,107,84,.45);background:linear-gradient(180deg,rgba(222,107,84,.07),var(--ink2))}
.card-title{font-family:var(--fd);font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:12px}
.card-title svg{width:15px;height:15px;color:var(--acc)}
.card-title .sub{font-family:var(--fu);font-size:11px;color:var(--faint);font-weight:400;margin-left:auto}
.h-sec{font-family:var(--fd);font-size:22px;font-weight:600;letter-spacing:.01em;margin:30px 0 14px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.h-sec small{font-family:var(--fm);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--faint);font-weight:400}
.h-sub{color:var(--faint);font-size:12px;margin:-8px 0 14px;max-width:80ch}
.stat{padding:14px 16px}
.stat b{font-family:var(--fd);font-size:26px;font-weight:600;display:block;line-height:1.1}
.stat span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);font-family:var(--fm)}
.stat em{font-style:normal;font-size:11px;color:var(--dim);display:block;margin-top:3px}
.grid{display:grid;gap:14px}
.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2.5px 9px;border-radius:20px;font-size:10.5px;font-weight:600;letter-spacing:.02em;border:1px solid var(--line2);color:var(--dim);font-family:var(--fm);white-space:nowrap}
.chip svg{width:11px;height:11px}
.chip.ok{background:var(--ok-dim);color:var(--ok);border-color:rgba(99,185,139,.3)}
.chip.risk{background:var(--risk-dim);color:var(--risk);border-color:rgba(222,107,84,.32)}
.chip.warn{background:var(--warn-dim);color:var(--warn);border-color:rgba(226,166,61,.32)}
.chip.info{background:var(--info-dim);color:var(--info);border-color:rgba(124,156,201,.32)}
.chip.vio{background:var(--vio-dim);color:var(--vio);border-color:rgba(167,139,219,.32)}
.chip.acc{background:var(--acc-dim);color:var(--acc2);border-color:rgba(226,166,61,.35)}
.chip.hard{background:var(--risk);color:#fff;border-color:var(--risk)}
.meter{height:6px;border-radius:6px;background:var(--panel3);overflow:hidden;position:relative}
.meter i{display:block;height:100%;border-radius:6px;background:var(--ok);transition:width .5s cubic-bezier(.22,.8,.3,1)}
.meter.warn i{background:var(--warn)}.meter.risk i{background:var(--risk)}.meter.info i{background:var(--info)}.meter.acc i{background:var(--acc)}.meter.vio i{background:var(--vio)}
.meter-row{display:flex;align-items:center;gap:10px;font-size:12px;padding:3px 0}
.meter-row .meter{flex:1}.meter-row b{font-family:var(--fm);font-weight:600;font-size:12px;min-width:36px;text-align:right}
.meter-row>span{width:150px;color:var(--dim);font-size:11.5px;flex:none}
table.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tbl th{text-align:left;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-family:var(--fm);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line)}
.tbl td{padding:9px 10px;border-bottom:1px solid rgba(36,42,52,.6);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tbody tr{transition:background .12s}.tbl tbody tr:hover{background:rgba(29,34,43,.4)}
.tbl .rowlink{cursor:pointer}
.tl{position:relative;padding-left:22px}
.tl::before{content:'';position:absolute;left:6px;top:6px;bottom:6px;width:2px;background:var(--line2);border-radius:2px}
.tl-item{position:relative;padding-bottom:16px}
.tl-item::before{content:'';position:absolute;left:-21px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--panel3);border:2px solid var(--line2)}
.tl-item.acc::before{background:var(--acc);border-color:var(--acc);box-shadow:0 0 8px rgba(226,166,61,.5)}
.tl-item.risk::before{background:var(--risk);border-color:var(--risk)}
.tl-item.ok::before{background:var(--ok);border-color:var(--ok)}
.tl-item.info::before{background:var(--info);border-color:var(--info)}
.tl-date{font-family:var(--fm);font-size:10.5px;color:var(--faint);letter-spacing:.05em}
.overlay{position:fixed;inset:0;background:rgba(4,5,7,.72);backdrop-filter:blur(6px);z-index:100;display:grid;place-items:center;padding:24px;animation:fin .18s ease}
@keyframes fin{from{opacity:0}to{opacity:1}}
.modal{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line2);border-radius:18px;width:min(680px,100%);max-height:88vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:mup .25s cubic-bezier(.22,.8,.3,1)}
.modal.wide{width:min(940px,100%)}
@keyframes mup{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
.modal-head{display:flex;align-items:center;gap:10px;padding:18px 22px 0}
.modal-head h3{font-family:var(--fd);font-size:20px;font-weight:600;margin:0}
.modal-body{padding:14px 22px 22px}
.x{margin-left:auto;background:none;border:none;color:var(--faint);cursor:pointer;padding:6px;border-radius:8px}
.x:hover{color:var(--txt);background:var(--panel3)}
.field{margin-bottom:13px}
.field label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-family:var(--fm);margin-bottom:5px}
.field .help{font-size:11px;color:var(--faint);margin-top:4px;line-height:1.45}
.in,select.in,textarea.in{width:100%;background:var(--ink2);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;color:var(--txt);font-size:13px;font-family:var(--fu);transition:border-color .15s,box-shadow .15s}
.in:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(226,166,61,.15);outline:none}
textarea.in{min-height:84px;resize:vertical;line-height:1.5}
select.in{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239B968B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px}
input[type=range].in{padding:0;height:26px;background:transparent;border:none;box-shadow:none}
input[type=range]{-webkit-appearance:none;width:100%;height:6px;border-radius:6px;background:linear-gradient(to right,var(--acc) var(--fill,50%),var(--panel3) var(--fill,50%));outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--acc2);border:3px solid var(--ink);box-shadow:0 0 0 1.5px var(--acc),0 2px 8px rgba(0,0,0,.5);cursor:grab}
input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--acc2);border:3px solid var(--ink);box-shadow:0 0 0 1.5px var(--acc);cursor:grab}
.range-wrap{display:flex;align-items:center;gap:12px}
.range-wrap .rv{font-family:var(--fm);font-size:13px;font-weight:600;min-width:44px;text-align:right;color:var(--acc2)}
.range-wrap .rl{font-size:10px;color:var(--faint);font-family:var(--fm);white-space:nowrap}
.livezone{border:1px dashed rgba(226,166,61,.35);border-radius:12px;padding:12px 14px;margin:4px 0 14px;background:rgba(226,166,61,.04);font-size:12px;line-height:1.6}
.livezone.stop{border-color:rgba(222,107,84,.5);background:rgba(222,107,84,.05)}
.livezone:empty{display:none}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.frow3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 14px}
.toasts{position:fixed;bottom:22px;right:22px;z-index:200;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.toast{background:var(--panel3);border:1px solid var(--line2);border-left:3px solid var(--acc);border-radius:11px;padding:11px 16px;font-size:12.5px;box-shadow:0 12px 34px rgba(0,0,0,.5);animation:tin .3s cubic-bezier(.22,.8,.3,1);max-width:420px;display:flex;gap:9px;align-items:center}
.toast.ok{border-left-color:var(--ok)}.toast.risk{border-left-color:var(--risk)}
.toast svg{width:15px;height:15px;flex:none}
@keyframes tin{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
.toast.out{animation:tout .25s ease forwards}
@keyframes tout{to{opacity:0;transform:translateY(8px)}}
.empty{padding:36px 20px;text-align:center;color:var(--faint)}
.empty svg{width:34px;height:34px;margin-bottom:10px;opacity:.4}
.empty b{display:block;font-family:var(--fd);font-size:16px;color:var(--dim);font-weight:600;margin-bottom:4px}
.pillrow{display:flex;flex-wrap:wrap;gap:6px}
.score-ring{position:relative;width:74px;height:74px;flex:none}
.score-ring svg{width:74px;height:74px;transform:rotate(-90deg)}
.score-ring circle{fill:none;stroke-width:6;stroke-linecap:round}
.score-ring .bgr{stroke:var(--panel3)}
.score-ring .val{stroke:var(--acc);transition:stroke-dashoffset .8s cubic-bezier(.22,.8,.3,1)}
.score-ring b{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--fd);font-size:19px}
.reco{border-left:3px solid var(--acc);background:rgba(226,166,61,.05);border-radius:0 10px 10px 0;padding:10px 14px;font-size:12.5px;color:var(--txt);margin-bottom:8px}
.reco.ok{border-color:var(--ok);background:var(--ok-dim)}
.reco.risk{border-color:var(--risk);background:var(--risk-dim)}
.reco.info{border-color:var(--info);background:var(--info-dim)}
.reco.vio{border-color:var(--vio);background:var(--vio-dim)}
.reco b{font-weight:600}
.adv{display:flex;gap:14px;align-items:flex-start;padding:14px 16px}
.adv .w{font-family:var(--fm);font-size:10px;color:var(--faint);white-space:nowrap;padding-top:3px}
.adv-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.divider{height:1px;background:var(--line);margin:18px 0}
.kv{display:grid;grid-template-columns:160px 1fr;gap:6px 14px;font-size:12.5px}
.kv dt{color:var(--faint);font-family:var(--fm);font-size:11px}.kv dd{margin:0}
.checkline{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:9px;cursor:pointer;transition:background .12s;font-size:13px}
.checkline:hover{background:var(--panel2)}
.checkline.done span{text-decoration:line-through;color:var(--faint)}
.cbox{width:17px;height:17px;border-radius:5px;border:1.5px solid var(--line2);display:grid;place-items:center;flex:none;transition:all .15s}
.checkline.done .cbox{background:var(--ok);border-color:var(--ok);color:#0c1a12}
.cbox svg{width:11px;height:11px}
.script-out{background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:16px 18px;font-size:13px;line-height:1.75;white-space:pre-wrap;font-family:var(--fu)}
.script-out h5{font-family:var(--fd);color:var(--acc2);font-size:14px;margin:14px 0 4px}
.script-out .guard{color:var(--risk);font-size:12px;border-left:2px solid var(--risk);padding-left:10px;margin:8px 0;display:block}
.focus-num{font-family:var(--fd);font-size:30px;color:var(--acc);font-weight:600;line-height:1}
.lesson-body{font-size:13.5px;line-height:1.75;color:var(--dim)}
.lesson-body h4{font-family:var(--fd);color:var(--txt);font-size:15px;margin:18px 0 6px}
.lesson-body blockquote{border-left:3px solid var(--acc);margin:12px 0;padding:6px 14px;background:var(--acc-dim);border-radius:0 10px 10px 0;color:var(--txt);font-size:12.5px}
.lesson-body ul{color:var(--dim);padding-left:20px}.lesson-body li{margin-bottom:4px}
.simopt{display:block;width:100%;text-align:left;padding:11px 14px;border:1px solid var(--line2);border-radius:11px;background:var(--ink2);color:var(--txt);font-size:13px;cursor:pointer;margin-bottom:8px;transition:all .15s;font-family:var(--fu)}
.simopt:hover{border-color:var(--acc);background:var(--acc-dim)}
.simopt.picked{border-color:var(--acc);background:var(--acc-dim)}
.opt-fb{font-size:11.5px;color:var(--dim);padding:6px 10px;border-left:2px solid var(--line2);margin:-2px 0 10px 8px}
.spark{display:block;height:34px;width:100%}
.spark polyline{fill:none;stroke:var(--acc);stroke-width:1.6}
.spark polyline.ok{stroke:var(--ok)}.spark polyline.risk{stroke:var(--risk)}.spark polyline.info{stroke:var(--info)}
.grid9{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.grid9 .cell{aspect-ratio:1.7;border:1px solid var(--line);border-radius:10px;padding:6px 8px;font-size:9.5px;color:var(--faint);background:var(--ink2);line-height:1.3;cursor:pointer;position:relative;transition:all .15s}
.grid9 .cell:hover{border-color:var(--acc)}
.grid9 .cell.lit{border-color:rgba(226,166,61,.45);background:var(--acc-dim);color:var(--acc2)}
.grid9 .cell .n{position:absolute;top:5px;right:7px;font-family:var(--fm);font-size:10px;color:var(--acc);font-weight:700}
.pigrid{position:relative;height:300px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(to right,transparent calc(50% - 1px),var(--line2) 50%,transparent calc(50% + 1px)),linear-gradient(to bottom,transparent calc(50% - 1px),var(--line2) 50%,transparent calc(50% + 1px))}
.pigrid .qlab{position:absolute;font-size:10px;font-family:var(--fm);letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.pdot{position:absolute;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:700;transform:translate(-50%,-50%);cursor:pointer;box-shadow:0 0 0 3px var(--ink);z-index:2;background:var(--info);color:#0d1420;font-family:var(--fm)}
.pdot.blocker{background:var(--risk)}.pdot.skeptic{background:var(--warn)}.pdot.champion{background:var(--ok)}.pdot.supporter{background:var(--vio)}
.tag{font-size:10px;font-family:var(--fm);color:var(--faint);border:1px solid var(--line2);padding:2px 7px;border-radius:6px;white-space:nowrap}
.strip{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.strip .d{background:var(--ink2);border:1px solid var(--line);border-radius:10px;padding:9px 10px;font-size:11px;position:relative}
.strip .d.today{border-color:var(--acc)}
.strip .d b{font-family:var(--fd);font-size:16px;display:block}
.strip .d span{color:var(--faint);font-size:10px;display:block;line-height:1.6}
.hamb{display:none}
@media(max-width:900px){
 .app{grid-template-columns:1fr}
 .side{position:fixed;left:0;width:236px;transform:translateX(-100%);transition:transform .25s}
 .side.open{transform:none;box-shadow:0 0 60px rgba(0,0,0,.7)}
 .hamb{display:inline-flex}
 .g2,.g3,.g4,.frow,.frow3{grid-template-columns:1fr}
 .strip{grid-template-columns:repeat(3,1fr)}
 .view{padding:18px 14px 80px}
}
@media print{
 .side,.topbar,.toasts,.no-print{display:none!important}
 .app{display:block}.view{padding:0;max-width:none}
 body{background:#fff;color:#111;font-size:12px}
 .card{border:1px solid #ccc;background:#fff;break-inside:avoid}
 .card-title,.h-sec,.crumb{color:#111}
}
</style>
</head>
<body>
<div id="app-root" class="app">
 <aside class="side" id="side"></aside>
 <div class="main">
  <div class="topbar" id="topbar"></div>
  <main class="view" id="view"></main>
 </div>
</div>
<div class="toasts" id="toasts"></div>
<div id="modal-root"></div>
<script>
'use strict';
/* ════════════════ 1. STORE ════════════════
   One key, one browser profile, ~5MB, synchronous, not encrypted.
   Failed writes surface in the top bar and telemetry — never silently. */
const LS_KEY='leadcore.v2';
const COLL=['people','teams','cases','tasks','oneonones','feedback','decisions','delegations','goals','risks','stakeholders','meetings','evidence','retros','journal','skips','pipeline','comms','plans'];
function blank(){const s={v:2,createdAt:todayStr(),telemetry:{writes:0,ruleRuns:0,viewErrors:0,lastViewError:null,failWrites:0,saves:0},settings:{lastTrendDay:null,lastExportAt:null,lastUpwardAt:null,lastSeen:todayStr()},snoozes:{},trends:{},academy:{done:{},checks:{},sim:{}},self:{timeActual:{},candour:null,tki:null,plan90:{}};COLL.forEach(c=>s[c]=[]);return s;}
let S=null,SAVE_FAIL=null;
function load(){try{const raw=localStorage.getItem(LS_KEY);if(!raw){S=blank();return false;}const p=JSON.parse(raw);if(!p||p.v!==2)throw new Error('schema');S=p;COLL.forEach(c=>{if(!Array.isArray(S[c]))S[c]=[];});return true;}catch(e){console.warn('load fault',e);S=blank();S.telemetry.lastViewError='load: '+e.message;return false;}}
function save(){S.telemetry.writes++;COLL.forEach(c=>S[c]=S[c].map(o=>o&&o.__tmp===undefined?o:(delete o.__tmp,o)));try{localStorage.setItem(LS_KEY,JSON.stringify(S));SAVE_FAIL=null;}catch(e){SAVE_FAIL=String(e&&e.message||e);S.telemetry.failWrites++;console.error('SAVE FAILED',e);}}
function mut(f){f();save();render();}
function list(c){return S[c]||[];}
function get(c,id){return list(c).find(x=>x.id===id)||null;}
function upsert(c,o){const i=list(c).findIndex(x=>x.id===o.id);if(i>=0)S[c][i]=o;else S[c].push(o);return o;}
function drop(c,ids){const set=new Set(Array.isArray(ids)?ids:[ids]);S[c]=list(c).filter(x=>!set.has(x.id));}
function quotaInfo(){try{const raw=localStorage.getItem(LS_KEY)||'';const bytes=raw.length*2;return{bytes,pct:bytes/(5*1024*1024)};}catch(e){return{bytes:0,pct:0};}}
/* ════════════════ 2. UTIL / DOM ════════════════ */
function uid(p){return (p||'x')+'_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);}
function todayStr(){const d=new Date();return isoDate(d);}
function isoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dparse(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function addDays(s,n){const d=dparse(s);d.setDate(d.getDate()+n);return isoDate(d);}
function db(a,b){return Math.round((dparse(b)-dparse(a))/86400000);}
function od(d){return db(d,todayStr());}
function age(d){return db(d,todayStr());}
function rel(d){const n=db(todayStr(),d);if(n<0)return Math.abs(n)+'d over';if(n===0)return 'today';if(n===1)return 'tomorrow';return 'in '+n+'d';}
function fmt(s){if(!s)return'—';return dparse(s).toLocaleDateString('en',{month:'short',day:'numeric'});}
function fmtF(s){return dparse(s).toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'});}
function weekKey(s){const d=dparse(s||todayStr());const onejan=new Date(d.getFullYear(),0,1);return d.getFullYear()+'w'+String(Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7)).padStart(2,'0');}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initials(n){return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}
function money(n){if(n==null)return'—';return '$'+(Math.abs(n)>=1000?(n/1000).toFixed(0)+'k':n);}
function first(n){return (n||'').split(' ')[0];}
const el=id=>document.getElementById(id);
function on(sel,ev,fn){document.querySelectorAll(sel).forEach(x=>x[ev]=fn);}
/* icons — inline lucide-style paths, no dependency */
const IC={menu:'M4 6h16M4 12h16M4 18h16',search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',plus:'M12 5v14M5 12h14',x:'M18 6 6 18M6 6l12 12',check:'M20 6 9 17l-5-5',alert:'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14v6l4 2',chev:'m9 18 6-6-6-6',down:'m6 9 6 6 6-6',today:'M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',inbox:'M22 12h-6l-2 3h-4l-2-3H2m5.5-9.5L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-5.5-9.5A2 2 0 0 0 14.7 2H9.3a2 2 0 0 0-1.8 1.5z',review:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',cases:'M20 7h-9m11 0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',person:'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',teams:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',oneonones:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',org:'M12 3v4m-7 14v-3a2 2 0 0 1 2-2h2m8 5v-3a2 2 0 0 0-2-2h-2m-1-9a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM4 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-8-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',skips:'m12 2 10 5-10 5L2 7zm10 10-10 5-10-5',feedback:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',delegation:'M14 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-4M9 12h12m-3-3 3 3-3 3',decisions:'M16 3h5v5M8 21H3v-5m18-13L10 14M3 21l7-7',performance:'m12 14 4-4M3.3 19a10 10 0 1 1 17.4 0',pipeline:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7',portfolio:'M20 7h-9m-7 0H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',scripts:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M16 13H8m8 4H8m2-8H8',academy:'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',self:'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',data:'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zm9 2c0 1.66-4.03 3-9 3s-9-1.34-9-3m18 0v5c0 1.66-4.03 3-9 3s-9-1.34-9-3v-5m18 0v5',zap:'M13 2 3 14h7l-1 8 10-12h-7z',flag:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7',star:'m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',refresh:'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5m0 4a9 9 0 0 1-15 6.7L3 16m0 5v-5h5',printer:'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12-4h12v6H6z',download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5m-5 5V3',upload:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5m5-5v12',listc:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',spark:'m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z',batt:'M22 12h-4l-3 9L9 3l-3 9H2',sprout:'M7 20h10M12 20v-9m0 0c0-4.4 3.6-8 8-8 0 4.4-3.6 8-8 8zm0 0c0-3.3-2.7-6-6-6 0 3.3 2.7 6 6 6z',play:'m6 3 14 9-14 9z',compass:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm4-14-2.7 5.3L8 16l2.7-5.3z',link:'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',target:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-4h.01',heart:'M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z',trash:'M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',edit:'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',copy:'M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2zm0 0V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2',eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',scale:'M12 3v18m-7-3 3-9 3 9a5.2 5.2 0 0 1-6 0zm10 0 3-9 3 9a5.2 5.2 0 0 1-6 0zM5 21h14',gauge:'m12 15 3.5-3.5M20.2 17A9 9 0 1 0 4 18',grid:'M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z',mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm7 10a7 7 0 0 1-14 0M12 19v3',book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5',send:'m22 2-7 20-4-9-9-4zm0 0L11 13',ban:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',grad:'M22 10 12 5 2 10l10 5 10-5zm0 0v4M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5',ladder:'M9 3v18M15 3v18M9 8h6M9 13h6M9 18h6'};
function ic(n,st){const p=IC[n]||IC.compass;return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="'+(st||'')+'"><path d="'+p+'"/></svg>';}
/* feedback */
function toast(msg,kind){const t=document.createElement('div');t.className='toast '+(kind||'');t.innerHTML=ic(kind==='ok'?'check':kind==='risk'?'alert':'spark')+'<span>'+msg+'</span>';el('toasts').appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),260);},3600);}
/* modal — one at a time, Esc closes */
function modal(html,wide){el('modal-root').innerHTML='<div class="overlay" id="ov"><div class="modal'+(wide?' wide':'')+'" role="dialog">'+html+'</div></div>';el('ov').addEventListener('mousedown',e=>{if(e.target.id==='ov')closeModal();});}
function modalHead(t,sub){return '<div class="modal-head"><h3>'+esc(t)+'</h3>'+(sub?'<span class="tag">'+esc(sub)+'</span>':'')+'<button class="x" data-a="close">'+ic('x')+'</button></div>';}
function closeModal(){el('modal-root').innerHTML='';}
/* generic form builder */
function field(label,inner,help){return '<div class="field"><label>'+label+'</label>'+inner+(help?'<div class="help">'+help+'</div>':'')+'</div>';}
function fin(id,val,ph,type){return '<input class="in" id="'+id+'" type="'+(type||'text')+'" value="'+esc(val==null?'':val)+'" placeholder="'+esc(ph||'')+'">';}
function fta(id,val,ph){return '<textarea class="in" id="'+id+'" placeholder="'+esc(ph||'')+'">'+esc(val||'')+'</textarea>';}
function fsel(id,opts,val){return '<select class="in" id="'+id+'">'+opts.map(o=>'<option value="'+esc(o[0])+'"'+(String(o[0])===String(val)?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';}
function fdate(id,val){return '<input class="in" id="'+id+'" type="date" value="'+esc(val||todayStr())+'">';}
function frange(id,val,min,max,lab){min=min==null?1:min;max=max==null?10:max;val=val==null?Math.round((min+max)/2):val;const pct=(val-min)/(max-min)*100;return '<div class="range-wrap">'+(lab?'<span class="rl">'+lab+'</span>':'')+'<input type="range" class="in" id="'+id+'" min="'+min+'" max="'+max+'" value="'+val+'" style="--fill:'+pct+'%" oninput="this.style.setProperty(\'--fill\',((this.value-'+min+')/('+(max-min)+')*100)+\'%\');var v=document.getElementById(\''+id+'-v\');if(v)v.textContent=this.value;"><span class="rv" id="'+id+'-v">'+val+'</span></div>';}
function val(id){const e=el(id);return e?e.value.trim():'';}
function num(id){const n=Number(val(id));return isNaN(n)?0:n;}
/* partials */
function pageHead(t,sub,actions){return '<div class="h-sec" style="margin-top:6px"><span style="font-size:26px">'+t+'</span>'+(actions?'<span style="margin-left:auto;display:flex;gap:8px" class="no-print">'+actions+'</span>':'')+'</div>'+(sub?'<div class="h-sub">'+sub+'</div>':'');}
function btn(act,arg,label,icn,cls,extra){return '<button class="btn '+(cls||'')+'" data-a="'+act+'"'+(arg?(' data-arg="'+esc(arg)+'"'):'')+(extra||'')+'>'+(icn?ic(icn):'')+esc(label)+'</button>';}
function card(icn,title,inner,cls,sub){return '<div class="card '+(cls||'')+'"><div class="card-title">'+ic(icn)+esc(title)+(sub?'<span class="sub">'+sub+'</span>':'')+'</div>'+inner+'</div>';}
function stat(b,s,em){return '<div class="card stat"><b>'+b+'</b><span>'+s+'</span>'+(em?'<em>'+em+'</em>':'')+'</div>';}
function chip(t,cls,icn){return '<span class="chip '+(cls||'')+'">'+(icn?ic(icn):'')+esc(t)+'</span>';}
function bandChip(b){return chip(b.label,b.cls);}
function meter(label,v,max,cls){const pct=Math.max(0,Math.min(100,v/(max||100)*100));return '<div class="meter-row"><span>'+label+'</span><div class="meter '+(cls||(pct>=70?'':pct>=40?'warn':'risk'))+'"><i style="width:'+pct+'%"></i></div><b>'+Math.round(v)+'</b></div>';}
function ring(v,cls){const c=2*Math.PI*30;const off=c-(Math.max(0,Math.min(100,v))/100)*c;return '<div class="score-ring"><svg viewBox="0 0 74 74"><circle class="bgr" cx="37" cy="37" r="30"/><circle class="val" cx="37" cy="37" r="30" stroke-dasharray="'+c+'" stroke-dashoffset="'+off+'" style="stroke:var(--'+(cls||'acc')+')"/></svg><b>'+Math.round(v)+'</b></div>';}
function spark(vals,cls,w,h){if(!vals||!vals.length)return '<div class="tag">no history</div>';if(vals.length===1)vals=[vals[0],vals[0]];const W=w||120,H=h||34,mn=Math.min.apply(0,vals),mx=Math.max.apply(0,vals),rg=(mx-mn)||1;const pts=vals.map((v,i)=>((i/(vals.length-1))*(W-4)+2).toFixed(1)+','+(H-4-((v-mn)/rg)*(H-8)).toFixed(1)).join(' ');return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" style="'+(w?'width:'+w+'px':'')+'"><polyline class="'+(cls||'')+'" points="'+pts+'"/></svg>';}
function reco(cls,inner){return '<div class="reco '+(cls||'')+'">'+inner+'</div>';}
function empty(icn,t,sub,act){return '<div class="empty">'+ic(icn)+'<b>'+t+'</b>'+(sub||'')+(act?'<div style="margin-top:14px">'+act+'</div>':'')+'</div>';}
function grid(cls,inner){return '<div class="grid '+(cls||'')+'">'+inner+'</div>';}
/* domain helpers */
function activePeople(){return list('people').filter(p=>!p.archived);}
function teamOf(p){return p&&p.teamId?get('teams',p.teamId):null;}
function directs(){return activePeople().filter(p=>!p.managerId);}
function reportsOf(pid){return activePeople().filter(p=>p.managerId===pid);}
function openCases(){return list('cases').filter(c=>c.status==='open');}
function openTasks(){return list('tasks').filter(t=>!t.done);}
function caseTypesOpen(pid){return openCases().filter(c=>c.personId===pid);}
function lastX(arr,n){return arr.slice(Math.max(0,arr.length-n));}
function onLeave(p){return p.leaveUntil&&p.leaveUntil>=todayStr();}
/* ════════════════ 3. FRAMEWORKS — pure scoring models ════════════════
   Every function returns {score|band|reasoning[]|actions[]}. No I/O, no mutation. */
const FW={
bands:v=>v>=70?{label:'strong',cls:'ok'}:v>=45?{label:'watch',cls:'warn'}:{label:'at risk',cls:'risk'},
/* Cynefin — where does this case live */
cynefin(type,sev){const t=(CASE_TYPES[type]||{});let d=t.cynefin||'complex';if(sev>=5)d='chaotic';else if(sev>=4&&d==='obvious')d='complicated';const rationale={obvious:'Known knowns — apply the playbook exactly, do not improvise.',complicated:'Known unknowns — diagnose before acting; bring expertise to bear.',complex:'Unknown unknowns — probe with small safe-to-fail moves, then sense.',chaotic:'Act first to stabilize, contain blast radius, then convert to complex.'};return{domain:d,reasoning:[rationale[d]],actions:d==='chaotic'?['Stabilize today','Time-box your first move to 24h']:d==='complex'?['Run one probe before any big commitment','Review in 7 days']:d==='complicated'?['Diagnose with the performance module before coaching','Consult someone who has seen this before']:['Follow the playbook to the letter','Close on a lesson, not a vibe']} },
sla(sev){const d={1:21,2:14,3:7,4:3,5:1}[sev]||7;return{days:d,band:sev>=4?{label:'hot',cls:'risk'}:sev===3?{label:'soon',cls:'warn'}:{label:'steady',cls:'info'},reasoning:['Severity '+sev+' maps to a '+d+'-day SLA. SLAs exist so discomfort cannot quietly outlive urgency.']}},
eisenhower(sev,systemic){const q=sev>=4?1:systemic?2:sev===3?3:4;return{q:q,label:['','Do now','Schedule (this is the leadership quadrant)','Delegate','Drop'][q],reasoning:q===2?['Important, not urgent — precisely the work new managers skip until it becomes Q1.']:q===1?['Urgent and important — clear the calendar, not just the morning.']:[]}},
/* escalation test — hard-stops automation in the write path */
ESCALATE_RE:/harass|discriminat|assault|violen|threat|safety injur|injur|medical|disab|mental health|suicid|self-harm|fraud|theft|embezzl|brib|retaliat|whistle|legal|lawsuit|subpoena|pregnan|religio|ethnic|raci|sexual/i,
escalate(type,text,sev){const hits=[];if(type==='ethics_hr')hits.push('case type is HR/legal class');if(sev>=5)hits.push('severity 5');const m=String(text||'').match(FW.ESCALATE_RE);if(m)hits.push('keyword: “'+m[0].toLowerCase()+'”');return{escalate:hits.length>0,why:hits,reasoning:hits.length?['Hard-stop: the record, verbatim evidence, and an HR-contact task are the ONLY writes allowed. Playbooks never drive legal-grade situations.']:['No escalation triggers. Standard propagation applies.']}},
/* trust equation (Maister): (C+R+I)/S */
trustEq(t){if(!t)return{score:null,band:{label:'unassessed',cls:'info'},reasoning:['No assessment on file. Trust assumptions made without data are just hope.'],actions:['Run the 4-signal assessment']};const s=(t.c+t.r+t.i)/Math.max(1,t.s);const score=Math.round(s/27*100);return{score,band:score>=70?{label:'strong',cls:'ok'}:score>=45?{label:'fragile',cls:'warn'}:{label:'broken',cls:'risk'},reasoning:['(credibility '+t.c+' + reliability '+t.r+' + intimacy '+t.i+') ÷ self-orientation '+t.s+' = '+s.toFixed(1)+' of 27.','The denominator is the lever nobody pulls: demonstrate whose agenda you serve.'],actions:score<45?['Repair reliability first — one visible kept promise per week','Name your own miss before addressing theirs']:['Keep a visible kept-promise cadence']}},
/* flight risk — 8 weighted drivers */
flightRisk(p){const D=[];const push=(k,w,on,note)=>{if(on)D.push({k,w,note});};const tr=p.trust?FW.trustEq(p.trust).score:null;const last11=list('oneonones').filter(o=>o.personId===p.id&&o.status==='done').sort((a,b)=>b.date<a.date?-1:1)[0];const cad=FW.cadenceFor(p);push('trust',24,tr!==null&&tr<45,'trust score '+(tr===null?'—':tr)+' — fragile or broken');push('trust-unassessed',8,tr===null,'trust never assessed — blind spot');push('growth',16,!p.dev||!p.dev.at||age(p.dev.at)>90,!p.dev||!p.dev.at?'no development plan on file':'development plan stale ('+age(p.dev.at)+'d)');const lastPraise=list('feedback').filter(f=>f.personId===p.id&&f.kind==='praise'&&f.status==='delivered').sort((a,b)=>b.deliveredAt<a.deliveredAt?-1:1)[0];push('recognition',12,!lastPraise||age(lastPraise.deliveredAt)>45,lastPraise?'no praise recorded in '+age(lastPraise.deliveredAt)+'d':'no praise ever recorded');push('cadence',12,!last11||age(last11.date)>cad.days+7,last11?'last 1:1 '+age(last11.date)+'d ago (cadence '+cad.days+'d)':'no completed 1:1 on record');const moods=lastX((p.mood||[]),5);if(moods.length>=3){const slope=(moods[moods.length-1].v-moods[0].v);push('mood-slope',12,slope<=-1.5,'mood slid '+slope.toFixed(1)+' over last '+moods.length+' sessions');}push('conflict',10,caseTypesOpen(p.id).some(c=>['conflict','underperformance'].includes(c.type)),'open conflict/performance case running');const ots=openTasks().filter(t=>t.personId===p.id);push('workload',6,ots.length>=6,ots.length+' open work items pinned on them');const ten=p.startDate?age(p.startDate):0;push('tenure-cliff',6,ten>0&&ten>240&&(!p.nineBox||!p.nineBox.at||age(p.nineBox.at)>180),ten>240?'8+ months in, no recent talent stamp':'');const score=Math.min(100,D.reduce((a,d)=>a+d.w,0));const band=score>=55?{label:'HIGH',cls:'risk'}:score>=30?{label:'watch',cls:'warn'}:{label:'low',cls:'ok'};return{score,band,drivers:D.sort((a,b)=>b.w-a.w),reasoning:D.length?D.slice(0,3).map(d=>d.note).filter(Boolean):['No active drivers. Flight risk is low because the instruments say so — keep them fed.'],actions:score>=55?['Retention conversation this week — career, not counter-offer'],['Keep the cadence; watch the drivers']}},
/* SLII — development level → leadership style */
sl2(comp,com){const d=comp>=7&&com>=7?'D4':comp>=5&&com<7?'D3':comp>=5?'D2':'D1';const style={D1:'S1 Directing',D2:'S2 Coaching',D3:'S3 Supporting',D4:'S4 Delegating'}[d];const lvl={D1:2,D2:4,D3:5,D4:6}[d];return{d,style,level:lvl,reasoning:['Competence '+comp+'/10 × commitment '+com+'/10 → '+d+' — lead with '+style.split(' ')[0]+' behaviors here.','SLII is task-specific: '+d+' on THIS task, not a label on the person.'],actions:['Match delegation to L'+lvl+' — not your default level, theirs on this task']}},
/* delegation ladder L1-L7 */
LADDER:[null,'Tell — I decide, you execute exactly','Sell — I decide, I explain why','Consult — I decide after your input','Agree — we decide together','Advise — you decide after my input','Inquire — you decide, report to me','Delegate — you decide, full ownership'],
delegMismatch(dg,p){const rec=FW.sl2(dg.comp,dg.com).level;if(Math.abs(dg.level-rec)>=2)return{mismatch:true,reasoning:['Assigned L'+dg.level+' but SLII suggests ~L'+rec+' on this task — '+(dg.level>rec?'you are off-loading risk without guardrails':'you are hovering over a ready person')],actions:dg.level>rec?['Re-level down or add boundary conditions']:['Re-level up; hovering teaches dependence']};return{mismatch:false,reasoning:['L'+dg.level+' fits the SLII read (L'+rec+').'],actions:[]}},
/* Edmondson psychological safety — 7 items, 1-7 */
edmondson(scan){if(!scan||!scan.length)return{score:null,band:{label:'unscanned',cls:'info'},reasoning:['No scan on file for this team.'],actions:['Run the 7-question scan']};const raw=scan.map((v,i)=>[2,4,6].includes(i)?8-v:v);const mean=raw.reduce((a,b)=>a+b,0)/raw.length;const score=Math.round((mean-1)/6*100);const weakest=raw.indexOf(Math.min.apply(0,raw));return{score,band:score>=70?{label:'safe',cls:'ok'}:score>=50?{label:'guarded',cls:'warn'}:{label:'unsafe',cls:'risk'},weakest,reasoning:['Mean '+mean.toFixed(1)+'/7 across 7 items. Item '+(weakest+1)+' is the floor — safety is set by the weakest plank, not the average.'],actions:['Run a retro on item '+(weakest+1)+' this sprint','Model fallibility in the next 1:1: name one of your own errors']}},
/* five dysfunctions — sequential, first failing layer */
fiveDys(a){const names=['Absence of trust','Fear of conflict','Lack of commitment','Avoidance of accountability','Inattention to results'];for(let i=0;i<5;i++){if(a[i]<3)return{layer:i,name:names[i],reasoning:['Pyramid breaks at layer '+(i+1)+': '+names[i]+'. Fixing a higher layer while this one fails is decoration.'],actions:i===0?['Personal histories round in the retro. Vulnerability-first — yours.']:i===1?['Mine for conflict: assign a dissenter in the next decision meeting']:i===2?['Force clarity-and-commit closes: end every meeting with "what exactly did we decide"']:i===3?['Make commitments public in the team page; review them, not the people']:['Publish the scoreboard the team actually cares about']};}return{layer:-1,name:'intact',reasoning:['All five layers above threshold. Guard it — dysfunction creeps back by silence.'],actions:['Re-scan quarterly']}},
tuckman(team){const opts=[['forming','Politeness, unclear roles, dependence on you'],['storming','Friction, factions, status contests'],['norming','Working agreements hold without you'],['performing','Self-correcting, roles fluid by task']];return{stage:team.stage||'forming',options:opts,reasoning:['Declared stage: '+(team.stage||'forming')+'. Override on the team page after observing 2+ meetings.'],actions:team.stage==='storming'?['Storming is progress, not failure — name it out loud or it goes underground']:team.stage==='forming'?['Over-structure: charter, roles, decision rights — structure is kindness here']:['Protect norms; audit quarterly']}},
busFactor(team){const caps={};activePeople().filter(p=>p.teamId===team.id).forEach(p=>(p.criticalFor||[]).forEach(c=>{(caps[c]=caps[c]||[]).push(p.name);}));const singles=Object.entries(caps).filter(e=>e[1].length===1);return{singles:caps,atRisk:singles.map(e=>({cap:e[0],who:e[1][0]})),band:singles.length>=2?{label:'critical',cls:'risk'}:singles.length===1?{label:'exposed',cls:'warn'}:Object.keys(caps).length?{label:'covered',cls:'ok'}:{label:'unmapped',cls:'info'},reasoning:singles.length?['Single points of failure: '+singles.map(e=>e[0]+' ('+e[1][0]+')').join(', ')]:Object.keys(caps).length?['Every critical capability has ≥2 owners.']:['No criticalFor tags set — you cannot manage exposure you have not mapped.'],actions:this.singles?[]:[]}},
nineBox(p){if(!p.nineBox)return null;const{p:perf,po}=p.nineBox;const cell=(perf>2?0:perf>1?1:2)+(po>2?0:po>1?1:2)*3;const names=[['Star','Growth engine','Solid pro'],['High impact','Core strong','Workhorse'],['Growth risk','Inconsistent','Underperformer']];const lbl=['high potential','mid potential','emerging'];return{cell,label:names[po>2?0:po>1?1:2][perf>2?0:perf>1?1:2]+' · perf '+perf+'/3 pot '+po+'/3',cls:cell===0?'ok':cell>=7?'risk':'warn'}},
krProgress(kr){const dir=kr.dir||'inc';const cur=+kr.current||0,tgt=+kr.target||0,base=kr.baseline==null?null:+kr.baseline;let p;if(base!=null&&tgt!==base){p=(cur-base)/(tgt-base);}else{if(tgt===0)p=dir==='inc'?(cur>0?1:0):1;p=dir==='inc'?cur/tgt:(cur===0&&tgt===0?1:tgt/Math.max(cur,1e-9));if(dir==='dec'&&base==null)p=cur<=tgt?1:Math.max(0,tgt/cur);}return{pct:Math.round(Math.max(0,Math.min(1,p))*100),band:p>=0.7?{label:'on track',cls:'ok'}:p>=0.4?{label:'slipping',cls:'warn'}:{label:'off track',cls:'risk'},reasoning:['Direction-aware: a reduce-type KR ('+(dir==='dec'?'lower is better':'')+') can no longer read 100% while failing.']}},
/* leader load index */
leaderLoad(){const dr=directs().length,ind=activePeople().length-dr;const oc=openCases();const ots=openTasks().filter(t=>od(t.due)>0);const mt=list('meetings').filter(m=>db(todayStr(),m.date||todayStr())<=7);const mtHrs=mt.reduce((a,m)=>a+(+m.hrs||1),0);let v=dr*5+ind*1.2+oc.reduce((a,c)=>a+ +c.severity*5,0)+ots.length*2.5+mtHrs*1.4;const score=Math.min(100,Math.round(v));return{score,band:score>=75?{label:'overload',cls:'risk'}:score>=50?{label:'heavy',cls:'warn'}:{label:'sustainable',cls:'ok'},parts:{'direct reports':dr*5,'indirect layer':Math.round(ind*1.2),'case pressure':Math.round(oc.reduce((a,c)=>a+ +c.severity*5,0)),'overdue debt':Math.round(ots.length*2.5),'meeting hours':Math.round(mtHrs*1.4)},reasoning:['Load = span ('+dr+' direct, '+ind+' indirect) + open-case severity + overdue debt + meeting hours. Above 75 you become the bottleneck you are paid to remove.'],actions:score>=75?['Delegate one Q3 item at L5+ this week, drop one Q4','Audit every recurring meeting you attend without a decision in it']:['Hold the mix; protect Q2 time']}},
teamHealth(team){const mem=activePeople().filter(p=>p.teamId===team.id);const ed=FW.edmondson(team.psychScan);const saf=ed.score==null?50:ed.score;const tgoals=list('goals').filter(g=>g.teamId===team.id&&(!g.status||g.status==='open'));let del=50;if(tgoals.length){const all=tgoals.flatMap(g=>(g.krs||[]));del=all.length?Math.round(all.reduce((a,k)=>a+FW.krProgress(k).pct,0)/all.length):50;}const moods=mem.flatMap(p=>lastX(p.mood||[],3).map(m=>m.v));const mor=moods.length?Math.round((moods.reduce((a,b)=>a+b,0)/moods.length-1)/4*100):50;const pressure=openCases().filter(c=>c.teamId===team.id).reduce((a,c)=>a+ +c.severity*8,0);const deliv=Math.max(0,100-pressure);const lead=mem.find(p=>p.lead)||null;const cad=lead?min(last11Ago(lead.id),30):30;const score=Math.round(saf*0.3+del*0.25+mor*0.2+deliv*0.15+Math.max(0,100-cad*4)*0.10);return{score,band:score>=70?{label:'healthy',cls:'ok'}:score>=50?{label:'strained',cls:'warn'}:{label:'unwell',cls:'risk'},parts:{safety:saf,delivery:del,morale:mor,pressure:Math.max(0,deliv),cadence:Math.max(0,Math.round(100-cad*4))},reasoning:['safety '+saf+' · delivery '+del+' · morale '+mor+' · case pressure → '+Math.max(0,deliv)+' · cadence '+(lead?('1:1 age '+cad+'d'):'no lead')],actions:[]}},
replaceCost(p){const sal=+p.salary||90000;const months=p.lead?6:4;const cost=Math.round(sal*1.25/12*months);return{cost,months,reasoning:['~1.25× salary annualized across '+months+' months of vacancy + ramp — industry rule of thumb, stated so retention conversations carry a number, not a fear.']}},
powerInterest(st){const p=+st.power||0,i=+st.interest||0;const q=p>=3&&i>=3?'manage-closely':p>=3?'keep-satisfied':i>=3?'keep-informed':'monitor';return{q,reasoning:['Power '+p+'/5 × interest '+i+'/5 → '+q.replace('-',' ')+'. Re-map after every reorg or missed commitment.'],actions:q==='manage-closely'?['Weekly touch, pre-wire every decision they can block']:q==='keep-satisfied'?['Brief them before they ask, not after']:q==='keep-informed'?['Monthly written update']:['Quarterly check; do not spend cycles here']}},
decisionCal(){const done=list('decisions').filter(d=>d.status==='reviewed');if(!done.length)return{score:null,pct:null,reasoning:['No decisions reviewed yet — calibration needs outcomes, and outcomes need review gates you actually honor.'],bands:{label:'n/a',cls:'info'}};const hits=done.filter(d=>d.outcome==='good').length;return{pct:Math.round(hits/done.length*100),n:done.length,band:hits/done.length>=0.6?{label:'calibrated',cls:'ok'}:{label:'miscalibrated',cls:'warn'},reasoning:[hits+' of '+done.length+' reviewed decisions judged good at their gates.','Judgment is the product; the journal is the factory.'],actions:['Bias check on the misses: which assumption died first?']}},
adkar(rec){const order=['awareness','desire','knowledge','ability','reinforcement'];for(const k of order){if((+rec[k]||0)<3)return{gap:k,reasoning:['Change stalls at the FIRST gap, and later investment cannot skip it. Earliest weak letter: '+k+'.'],actions:[{awareness:'Communicate the WHY with a number they already feel',desire:'Surface the WIFM in 1:1s; resistance is information',knowledge:'Train and document — pair, not pdf',ability:'Practice reps with fast feedback; shrink the first mile',reinforcement:'Celebrate early adopters publicly in week 1'}[k]]};}return{gap:null,reasoning:['All five letters ≥3 — change is holding.'],actions:['Reinforce at day 30, 60, 90']}},
feedbackBalance(pid){const fb=list('feedback').filter(f=>f.personId===pid&&f.status==='delivered');const pr=fb.filter(f=>f.kind==='praise').length,co=fb.filter(f=>f.kind!=='praise').length;const tot=pr+co;const ratio=tot?pr/tot:null;return{praise:pr,correct:co,ratio,band:ratio==null?{label:'no data',cls:'info'}:ratio>=0.6&&ratio<=0.85?{label:'balanced',cls:'ok'}:ratio>0.85?{label:'comfort-only',cls:'warn'}:{label:'criticism-heavy',cls:'risk'},reasoning:ratio==null?['No delivered feedback on file. Silence teaches nothing.']:['Praise:correction '+pr+':'+co+'. 3:1 to 5:1 holds motivation AND truth; outside 60–85% praise share you are either avoiding or judging.'],actions:ratio!=null&&ratio<0.6?['Catch them doing something right — specifically — this week']:ratio>0.85?['You are hoarding corrections; one honest SBI beats five withheld ones']:['Hold the zone']}},
timeTargets(a){const sugg={'Coaching your leads':25,'Skip-levels & IC time':15,'Strategy & thinking':20,'Cross-functional & upward':15,'Execution & reviews':15,'Admin & comms':10};const keys=Object.keys(sugg);const tot=keys.reduce((x,k)=>x+(+a[k]||0),0);const worst=keys.map(k=>({k,d:Math.round(((+a[k]||0)/(tot||100)*100)-sugg[k])})).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));return{sugg,worst:worst.filter(w=>Math.abs(w.d)>=8),reasoning:['Manager-of-managers mix targets vs your actuals ('+(tot||100)+'% entered). A ±8pt gap is a structural problem: fix the calendar, not the intention.'],actions:['Block the underweight category on the calendar as recurring']}},
cadenceFor(p){const tr=p.trust?FW.trustEq(p.trust).score:null;const fr=FW.flightRisk(p).score;let days=14;if(tr!==null&&tr<45)days=7;if(fr>=55)days=7;if(p.rampOn)days=7;return{days,reasoning:['Cadence is derived: base 14d, tightened to 7d by fragile trust, high flight risk, or an active ramp. It is a floor, not a ceiling.']}},
skipCoverage(leadId){const reps=reportsOf(leadId);const missing=reps.filter(r=>{const s=list('skips').filter(k=>k.personId===r.id&&k.status==='done').sort((a,b)=>b.date<a.date?-1:1)[0];return !s||age(s.date)>90;});return{missing,total:reps.length,reasoning:['Quarterly skip cadence per indirect report. '+missing.length+' of '+reps.length+' overdue or never held.']}},
leadSignal(leadId){const reps=reportsOf(leadId);const done=reps.flatMap(r=>list('skips').filter(k=>k.personId===r.id&&k.status==='done'));const dims={clarity:0,support:0,fairness:0,growth:0};let n=0;done.forEach(s=>{['clarity','support','fairness','growth'].forEach(d=>{if(s.dims&&s.dims[d]){dims[d]+=s.dims[d];}});n++;});if(!n)return{score:null,band:{label:'no data',cls:'info'},reasoning:['No completed skip-levels under this lead. Lead signal is a function of skip data — run the cadence.'],actions:['Schedule skips with their reports']};let tot=0;Object.keys(dims).forEach(d=>{dims[d]=Math.round(dims[d]/n*20);tot+=dims[d];});const score=Math.round(tot/4);return{score,dims,n,band:score>=70?{label:'strong',cls:'ok'}:score>=50?{label:'mixed',cls:'warn'}:{label:'weak',cls:'risk'},reasoning:['Aggregate of '+n+' skip-levels across '+reps.length+' reports (de-identified themes only — never relay quotes). Weakest: '+Object.entries(dims).sort((a,b)=>a[1]-b[1])[0][0]+'.'],actions:['Coach the lead on the weakest dimension — in YOUR 1:1 with them, never around them']}}
};
function last11Ago(pid){const s=list('oneonones').filter(o=>o.personId===pid&&o.status==='done').sort((a,b)=>b.date<a.date?-1:1)[0];return s?age(s.date):999;}
/* ════════════════ 4. CONTENT ════════════════ */
const CASE_TYPES={
underperformance:{l:'Underperformance',ic:'performance',cynefin:'complicated',sys:true,pitfalls:['Coaching before diagnosis — if the cause is system or clarity, coaching is cruelty with extra steps','Vague bar: "do better" is not a bar','Solving it in the hallway instead of on the record'],
 playbook:[[0,'Run the 4-cause diagnosis before any coaching conversation','diagnose'],[1,'Deliver one precise SBI on the clearest instance','sbi'],[2,'Agree the observable bar + revisit date in the next 1:1','oneonone'],[9,'Mid-check: is the metric moving? Name evidence either way','review'],[20,'Decide: trajectory holds → close with lesson; not → performance plan offer','decide']]},
conflict:{l:'Interpersonal conflict',ic:'people',cynefin:'complex',sys:false,pitfalls:['Picking a winner before hearing both sides separately','Mediating content when the fight is about status or respect','Letting "they just clash" become a permanent tax on the team'],
 playbook:[[0,'1:1 with each party separately — facts and impact, not verdicts','oneonone'],[1,'Write the shared-goal frame: what do BOTH want that conflict blocks?','task'],[3,'Joint conversation scripted around the impact, not personalities','sbi'],[7,'Working agreement addendum: how disagreement will surface next time','team'],[14,'Verify the behavior change in both parties, on the record','review']]},
feedback_resistance:{l:'Feedback resistance',ic:'feedback',cynefin:'complex',sys:false,pitfalls:['Stacking evidence until it feels like a prosecution','Arguing about the feedback instead of exploring the reaction','Softening the message until it means nothing'],
 playbook:[[0,'Check the balance — if history is criticism-heavy, the resistance has a cause','task'],[2,'Ask-first delivery: "Can I share an observation?" then one SBI, stop','sbi'],[3,'Explore the reaction: "What did you hear me say just now?"','oneonone'],[10,'Look for any movement; praise the receptive behavior specifically','sbi']]},
flight_signal:{l:'Flight-risk signal',ic:'flag',cynefin:'complicated',sys:true,pitfalls:['Counter-offer as strategy — it buys months, not retention','Panicking into promises you cannot keep','Telling the team why you are suddenly attentive'],
 playbook:[[0,'Re-read the top flight drivers on their profile — act on the top one','task'],[1,'Retention conversation: career path and friction, not "are you leaving"','oneonone'],[3,'One visible correction against the top driver, dated','task'],[14,'Re-score drivers; if stale trust is the cause, repair cadence starts','review']]},
morale_dip:{l:'Morale dip',ic:'heart',cynefin:'complex',sys:true,pitfalls:['Pizza as treatment for a workload or meaning problem','"Everything OK?" once, then moving on','Broadcasting concern about an individual to the group'],
 playbook:[[0,'Check inputs first: workload, wins-visible, feedback famine, mood trail','task'],[1,'Unhurried 1:1 — listen 80%, probe energy drains specifically','oneonone'],[4,'Remove or shrink one named drain within your power, tell them when','task'],[11,'Re-read mood trail; if flat, escalate your own attention, not process','review']]},
missed_commitment:{l:'Missed commitment',ic:'clock',cynefin:'obvious',sys:false,pitfalls:['Letting it slide once — that is how standards actually get set','Public call-outs; correct in private, always','Accepting excuses you would not accept from yourself'],
 playbook:[[0,'Name it within 48h, SBI form, curiosity-first: what happened?','sbi'],[1,'Restate the standard and the impact of the miss on specific people','task'],[5,'Confirm system vs will: was the commitment realistic when made?','review'],[12,'If pattern (2nd miss): shift level — this is now a pattern case','decide']]},
new_lead:{l:'New-lead wobble',ic:'ladder',cynefin:'complicated',sys:false,pitfalls:['Letting them keep doing their old IC job — the classic first-lead failure','Abdicating: "you manage it" with no cadence behind you','Hearing about their team only from their team'],
 playbook:[[0,'Define their new job in one sentence; schedule the delegation-level talk','oneonone'],[2,'Set their operating rhythm: 1:1s with their reports, weekly with you','task'],[7,'Skip-level one of their reports — listen for early signals','skip'],[21,'Review their delegation ladder depth; spot hover or abdication','review']]},
team_dysfunction:{l:'Team dysfunction',ic:'teams',cynefin:'complex',sys:true,pitfalls:['Treating storming as failure and crushing it','Workshop theater: one offsite, zero behavior change','Attacking layer 3+ while trust (layer 1) is broken'],
 playbook:[[0,'Run the five-dysfunctions scan; find the FIRST broken layer','survey'],[2,'Team session on that layer only — facilitation, not lecture','team'],[6,'Retro with STOP/START converted to dated owned tasks','retro'],[20,'Re-scan the layer; movement or honest no-change stated','review']]},
psych_safety:{l:'Psych-safety breach',ic:'shield',cynefin:'complex',sys:false,pitfalls:['Defending the person who caused the chill because they are senior','Apology theater with no behavior follow-through','Surveying again without acting on the last survey'],
 playbook:[[0,'Acknowledge to the person affected, same day, no minimizing','oneonone'],[1,'Address the causing behavior directly and privately','sbi'],[5,'Team-level norm restated as forward-looking standard, not blame','team'],[14,'Check with the affected person: is it actually over?','review']]},
workload_burnout:{l:'Workload / burnout',ic:'batt',cynefin:'complicated',sys:true,pitfalls:['Telling a drowning person to manage time better','Subtracting nothing when you add "priorities"','Rewarding the heroics that caused the burnout'],
 playbook:[[0,'Inventory the real load with them — hours, commitments, hidden work','oneonone'],[1,'Subtract or reassign at least one item; say what will NOT be done','task'],[3,'Set a visible boundary you honor yourself (no 11pm sends)','task'],[10,'Re-check energy; adjust the plan, not the person','review']]},
ethics_hr:{l:'HR / legal class',ic:'scale',cynefin:'chaotic',sys:false,sev5:true,pitfalls:['Investigating yourself — you are not equipped or authorized','Confidentiality leaks that create retaliation exposure','Advice that sounds like legal or medical guidance'],
 playbook:[]},
departure:{l:'Departure / notice',ic:'send',cynefin:'complicated',sys:true,pitfalls:['Guilt-tripping the leaver — the team is watching how you treat exits','Knowledge transfer as a single 1h meeting the final week','Leaving the backfill conversation until after they are gone'],
 playbook:[[0,'Thank them, confirm last day, agree the telling-story together','oneonone'],[1,'Knowledge-transfer plan: one task per criticalFor capability','docs'],[2,'Backfill decision: internal move vs hire — register it','decide'],[5,'Team communication — leaver speaks first, you second','team'],[9,'Exit interview notes filed; the lesson, not the gossip','review']]},
stakeholder_friction:{l:'Stakeholder friction',ic:'portfolio',cynefin:'complex',sys:false,pitfalls:['Complying loudly or resisting silently — both read as politics','Debating content when the real issue is not being consulted early','Solving it via their boss (you get one of those, ever)'],
 playbook:[[0,'Re-map power-interest; when did you last touch them?','stake'],[1,'Direct 1:1 outside the firing line: their win first, then yours','task'],[6,'Agree an operating interface: what they get, when, before decisions','comms'],[14,'Warmth check: did the next interaction soften?','review']]},
decision_reversal:{l:'Decision reversal',ic:'decisions',cynefin:'complicated',sys:false,pitfalls:['Defending the old call because YOU made it — sunk cost with a title','Reversing silently, so the org learns nothing','Blaming data that was available all along'],
 playbook:[[0,'Name the reversal openly: what we believed, what changed','comms'],[1,'Log the reversal in the journal with a review gate','decide'],[3,'Stakeholder sweep: pre-wire the people affected','stake'],[10,'Premortem the NEW direction before execution resumes','task']]},
hiring_gap:{l:'Hiring gap',ic:'pipeline',cynefin:'complicated',sys:true,pitfalls:['Absorbing the gap silently into someone else\'s workload','Lowering the bar under pressure — the costliest hire is the warm body','Pipeline treated as HR\'s problem'],
 playbook:[[0,'Score coverage: which capabilities are exposed while the seat is empty?','task'],[2,'Pipeline review: source, screen, loop — where is the leak?','pipeline'],[4,'Interim load-sharing plan, explicit and timeboxed','team'],[12,'If pipeline is dry: widen the funnel, then re-cut the role briefly','review']]},
personal_circumstance:{l:'Personal circumstance',ic:'heart',cynefin:'complex',sys:false,pitfalls:['Prying for details — support does not require the story','Lowering the bar silently instead of renegotiating it','Forgetting to follow up after the first week'],
 playbook:[[0,'Acknowledge, ask what (if anything) they want known, offer flexibility','oneonone'],[1,'Agree a temporary, REVERSIBLE plan with dates, in writing','task'],[7,'Quiet check-in — support continues after the news cycle','oneonone'],[21,'Revisit the plan: restore, extend, or refer to formal leave','review']]}
};
const SCRIPTS=[
 {id:'first11',name:'First 1:1 with a new report',ic:'oneonones',params:[['them','Their name'],['role','Their role']],build:p=>`Before you sit down
Decide your intent: this meeting is theirs. You are buying three things — trust, their operating manual, and one honest answer.

Opening (verbatim-ish)
"Thanks for the time, ${p.them}. A few things about how I run 1:1s, then it's yours. This meeting is your agenda first — I'll always have questions, but it exists for what matters to you. Cadence will be regular and I'll protect it. Nothing you raise here gets shared without us agreeing it first."

Three questions that work
1. "What should I know about how you do your best work?" (operating manual)
2. "What did your last manager do that I should keep — and stop?" (expectation transfer)
3. "What's one thing about this team's status quo you think I'll eventually see through?" (honesty probe)

Close
"I'll send a short note of what I heard, and our next one is already booked. Anything I should do this week as a result of today?"

Guardrails
· Do NOT promise anything you have not verified you can deliver.
· Do NOT ask about the former manager's failures beyond question 2 — you are their leader now, not the coroner.`},
 {id:'correction',name:'Correction — SBI conversation',ic:'feedback',params:[['them','Their name'],['situation','The situation'],['behavior','The behavior'],['impact','The impact']],build:p=>`Frame
"This is about one behavior, ${p.them}, not about you as a professional. Two minutes of talking, then I mostly want to listen."

The delivery (SBI, verbatim skeleton)
"In ${p.situation||'the meeting Tuesday'}, I saw ${p.behavior||'the behavior'}. The impact was ${p.impact||'the impact on the team/result'}."

Then stop talking
· The silence is where they process. Count to five internally.
· "What's your read on that?" — diagnostic, not rhetorical.

If they dispute facts → "Let's both go look at the record and come back tomorrow."
If they get emotional → acknowledge: "I can see this lands hard. Take the space you need. We'll pick this up in 20 minutes / tomorrow."
If they agree too fast → "What will you do differently on Thursday?" Convert agreement into behavior.

Close
"I appreciate you hearing this straight. I'll watch for the change and I'll name it when I see it."

Guardrails
<span class="guard">One SBI per conversation. Stacking turns feedback into a verdict.</span>
<span class="guard">Never in public. Never by chat unless it arrived by chat.</span>`},
 {id:'praise',name:'Praise that lands (SBI+)',ic:'star',params:[['them','Their name'],['situation','The situation'],['behavior','What they did'],['strength','The strength it shows']],build:p=>`Why shape matters: "great job" is applause for the ego; shaped praise is fuel for a repeat.

The form
"In ${p.situation||'the launch review'}, you ${p.behavior||'did the thing'}. That shows ${p.strength||'real ownership'} — and it changed the outcome because [be specific]."

Delivery rules
· Same week as the behavior or it expires.
· Specific enough that a third party could recognize the moment.
· Public ONLY if you know they like public recognition — otherwise private, in writing.

The follow-through
Log it. If they are not growing despite strength, their next development plan should weaponize this strength rather than only patch weaknesses.`},
 {id:'delegation',name:'Delegation brief (any level)',ic:'delegation',params:[['them','Their name'],['task','The task'],['level','L Level (1-7)']],build:p=>`The five sentences
1. The outcome: "${p.task||'This'} is yours. Success looks like ___ by ___."
2. The level: "You have L${p.level||'4'} — ${FW.LADDER[+p.level||4]||''}. That means specifically: [what you decide, what they decide, what needs you first]."
3. The boundaries: "Two non-negotiables: [budget/comms/legal]. Inside those, your call."
4. The checkpoints: "We'll touch [cadence]. The agenda is yours: progress, risk, decisions you want from me."
5. The support: "What do you need from me this week that you would otherwise come get at the deadline?"

Guardrails
<span class="guard">A task is not delegated until THEY can repeat the outcome, the level, and the first checkpoint date back to you.</span>`},
 {id:'skip',name:'Skip-level opener (their manager\'s report)',ic:'skips',params:[['them','Their name'],['lead','Their manager']],build:p=>`Purpose first — out loud
"This isn't a review of ${p.lead||'your manager'}, ${p.them}, and it isn't a channel around them. I hold these with everyone in my extended org to learn what my layer is getting right and wrong."

The five questions
1. "What's the clearest thing your team is trying to do — in your own words?" (clarity)
2. "When did you last get useful feedback, and what was it?" (feedback health)
3. "What's one thing slowing you down that leadership could remove?" (friction)
4. "If you ran my job for a day, what would you look at first?" (upward intelligence)
5. "Anything you hoped I'd ask that I didn't?"

Close
"If anything here needs action, I'll route it through your manager as coaching, or fix it at my level. I won't quote you. The pattern I act on is across all the sessions, never one person's words."

Guardrails
<span class="guard">Doctrine, enforced in code: actions from a skip-level inject into YOUR 1:1 with their manager — never around them.</span>`},
 {id:'pip',name:'Formal warnings, PIPs, separation',ic:'scale',params:[],'build':p=>`STOP — this is the escalation class.

The app does not script formal performance actions, because a script is exactly what fails under legal scrutiny and human complexity. What the OS does instead:

1. Register an HR/legal class case (severity 5). The write path hard-stops: case record, verbatim evidence, HR-contact task for today. Nothing else.
2. Bring the evidence record — the app has kept it clean, dated, and factual. That is its job, and it has done it.
3. Your job is judgment and process integrity, done WITH your HR partner, not instead of them.

If you proceed without HR for a formal action, you are proceeding without this app's support. It will keep the record either way.`}
];
const QBANK={
opening:['What’s on your mind that we haven’t made time for?','What are you avoiding telling me because you assume I know?','What’s the smallest thing that would make this week materially better?'],
growth:['Which part of the current work is growing you, and which is just consuming you?','What skill would double your impact in six months?','Who in the org do you want to learn from this quarter?'],
frictions:['What did I do last month that made your job harder?','Where are we slow in a way you’ve stopped mentioning?','What decision of mine would you reverse if you could?'],
expectations:['What do you think I expect from you in the next 30 days — say it back to me.','Where are my standards unclear enough that you’re guessing?','What’s the one thing you’d want graded on if performance were measured tomorrow?']
};
const LESSONS=[
 {id:'ls1',arc:'Foundations',title:'You are not the star anymore',body:`<h4>The identity swap</h4>Your output is no longer your output. It is the volume of correct, unblocked, growing work your people produce. Every hour you spend being excellent at your old job is an hour stolen from your new one.<h4>The test</h4>End of week: how many decisions did you make that someone on your team could have made at their level? Each one is a training debt you chose to keep.<blockquote>Do the math: 8 people × even 10% more capability beats your personal 60-hour week by an order of magnitude.</blockquote>`,check:{q:'It is Friday. You personally shipped three great things and coached nobody. That week was…',opts:['A good week — output is output','A bad week — you withdrew from the team’s development account','A wash — it depends on deadlines'],a:1,why:'A manager of managers with zero coaching reps spent the week doing IC work with a manager title. A bad week.'}},
 {id:'ls2',arc:'Foundations',title:'The loop is the course',body:`<h4>Why this app exists</h4>Leadership courses fail because learning requires reps + feedback + reflection on YOUR cases. The OS manufactures that loop: register → propagate → score → review → lesson → better priors.<h4>The non-negotiable</h4>The loop only turns if you record honestly. A case closed with a fake lesson teaches the model to lie back to you. Garbage in the journal = garbage in the mentor.<blockquote>The app owns detection, scoring, sequencing, record-keeping. You own the judgment call — and living with the outcome.</blockquote>`,check:{q:'What actually substitutes for the leadership course?',opts:['The frameworks library','The rep-review-lesson loop on your own real cases','The scripts'],a:1,why:'Models and scripts are vocabulary. The loop on your own cases is the curriculum.'}},
 {id:'ls3',arc:'Foundations',title:'Standards are set by what you walk past',body:`<h4>The hallway principle</h4>Every team has two standards: the written one and the lowest behavior you have personally witnessed and not addressed. The second one is real. Missed commitment walked past once = new standard.<h4>Fast, private, specific</h4>Address within 48h, privately, in SBI form. The speed is the message; the privacy is the respect; the specificity is the learning.`,check:{q:'You see a recurring 10-minute late start to the team standup. You say nothing for three weeks because it seems small. You have just…',opts:['Avoided pettiness','Set the standard: standup starts when people arrive','Reserved judgment appropriately'],a:1,why:'Silence is communication. Everyone in the room now knows the real start time is flexible.'}},
 {id:'ls4',arc:'People',title:'Diagnose before you coach',body:`<h4>The four causes</h4>Underperformance has exactly four causes: <b>Skill</b> (can\'t), <b>Will</b> (won\'t), <b>Clarity</b> (doesn\'t know the bar), <b>System</b> (the environment blocks them). Coaching a system problem is malpractice; two of the four causes are YOURS.<h4>The order</h4>Rule out system and clarity first — check your own side of the street before touching theirs. Then skill (train) vs will (confront). The performance module enforces this order in code.`,check:{q:'A report misses deadlines. Your FIRST diagnostic stop is…',opts:['Their motivation','Whether the priority and bar were actually clear and unblocked','Their skill level'],a:1,why:'Skill/will before system/clarity is the classic error — you coach the person for your own management failure.'}},
 {id:'ls5',arc:'People',title:'Feedback is a balance sheet',body:`<h4>Assets and withdrawals</h4>Praise deposits trust; corrections withdraw it. Below a 3:1 ratio you are overdrawn and your corrections get discounted. But comfort-only praise (above ~85%) means you are hoarding corrections — and withholding truth is a betrayal with good manners.<h4>The instrument</h4>The app shows the ratio per person. Outside the 60–85% praise band, the mentor side-loads a nag until you fix it.`,check:{q:'A report’s praise:correction ratio is 1:4. Your next correction will…',opts:['Land the same as the others','Be discounted or read as "he’s building a file on me"','Sting more, so use it now'],a:1,why:'Overdrawn accounts get every withdrawal audited. Rebuild the balance before the next withdrawal.'}},
 {id:'ls6',arc:'People',title:'Truss the trust equation',body:`<h4>(C + R + I) / S</h4>Credibility: do you know? Reliability: do you do? Intimacy: are you safe to tell? Divided by Self-orientation: whose agenda do you serve? The denominator is the killer — brilliant, reliable, open leaders still fail if people smell self-interest.<h4>Repair order</h4>When trust breaks: reliability first (small visible kept promises weekly), then intimacy (one honest self-reveal), credibility last (it is earned in the work). The trust module tracks all four separately for exactly this reason.`,check:{q:'The highest-leverage trust repair move is usually…',opts:['A big credibility display','A week of small, visible, kept promises','A heartfelt apology'],a:1,why:'Trust is rebuilt by evidence pattern, not by peak moments. Reliability compounds fastest and is fully in your control.'}},
 {id:'ls7',arc:'Decisions',title:'Type 1 and Type 2 doors',body:`<h4>Bezos\'s doors</h4>Type 1: irreversible, walk through slowly, premortem first. Type 2: reversible, walk through fast, judge by reversible—iterate. The organizational disease is treating Type 2 as Type 1: slow committees for reversible calls. The startup disease is the reverse.<h4>The journal enforces it</h4>Type 1 decisions cannot be logged without a premortem in this app. The gate is a form of care: for the decision and for your future self reviewing it.`,check:{q:'A reversible vendor choice has been "under discussion" for three weeks. The failure is…',opts:['Insufficient data gathering','Type 2 treated as Type 1 — the cost of delay now beats the cost of a wrong call','Poor facilitation'],a:1,why:'Reversible decisions optimize for SPEED and learning rate. A three-week reversible decision has already failed.'}},
 {id:'ls8',arc:'Decisions',title:'Disagree and commit, in writing',body:`<h4>After the debate</h4>Once the call is made — by the decider per DACI — the debate is closed. Continuing to litigate in hallways is sabotage, and the decider who tolerates it owns the sabotage. But the dissent is valuable data: log it in the decision record as a premortem item.<h4>The reviewing standard</h4>The review gate asks one question: given what we knew THEN, was the process sound? Judging by outcome alone teaches the org to hide risk.`,check:{q:'A decision your report disagrees with is made. They comply but keep arguing it in side channels. That is…',opts:['Healthy dissent','Undermining — address it as a behavior, fast','Fine as long as delivery continues'],a:1,why:'Disagree-and-commit is binary. Debate inside the room, solidarity outside. Side-channel litigation is a trust and standard failure.'}},
 {id:'ls9',arc:'Teams',title:'Storming is a phase, not a crime',body:`<h4>Tuckman, correctly used</h4>Forming → storming → norming → performing is a sequence, not a menu. New leaders panic at storming and crush it — producing permanent polite mediocrity. The conflict was the sound of real roles being negotiated.<h4>Your job in storming</h4>Name it ("this friction is the team finding its shape"), protect dissenters, and keep the arguing about work, not worth. The team module tracks stage and pressure accordingly.`,check:{q:'Two strong voices clash openly in week 2 of a new team. The healthiest read is…',opts:['A pairing problem to fix with an org change','Storming — protect the conflict about ideas, police the conflict about people','Immediate mediation to end it'],a:1,why:'Suppressing storming freezes the team below performing. Guard ideas-conflict; kill personal conflict.'}},
 {id:'ls10',arc:'Teams',title:'The skip-level doctrine',body:`<h4>Why skip at all</h4>Your leads edit reality upward — everyone does. Skip-levels are the only unedited channel to what your filter is costing you. Run them quarterly per indirect report.<h4>The doctrine (enforced in code)</h4>Everything that surfaces routes back THROUGH the lead as coaching — never around them. A skip that bypasses the lead teaches the org that hierarchy is a rumor. The module literally will not create an action that skips them.`,check:{q:'A skip-level surfaces that a lead never holds 1:1s. You…',opts:['Tell the report you’ll fix it','Bring it as coaching in YOUR 1:1 with the lead','Mention it casually to the lead’s peers'],a:1,why:'Around-the-lead action makes the lead insecure and the report a spy. Coach through the chain you are paid to maintain.'}},
 {id:'ls11',arc:'Systems',title:'Meetings are factories, audit them',body:`<h4>The unit economics</h4>A meeting\'s price is (attendees × hours × loaded hourly rate) and its product is decisions. $/decision is the metric. A weekly status meeting with zero decisions in two consecutive weeks is waste with a calendar invite.<h4>The two valid kinds</h4>Decision meetings (small, prep required, DACI visible) and sense-making meetings (rare, curated). Everything else is an email. Governance tracks economics and offers one-click conversion of debt into a case.`,check:{q:'Your weekly 9-person sync produced zero decisions for the second week running. The honest move is…',opts:['Tighten the agenda','Kill or split it — it is a factory with no product','Shorten to 30 min and keep it'],a:1,why:'Zero-product factories die by audit, not by optimization. Log the saving; buy the hours back for Q2 work.'}},
 {id:'ls12',arc:'Systems',title:'You cannot talk a team into safety',body:`<h4>Edmondson\'s finding</h4>Psychological safety is not a vibe you declare; it is an emergent property of small, repeated leader behaviors: thanking the messenger, admitting your own errors, punishing no one for bad news delivered honestly.<h4>Measure, don\'t hope</h4>The 7-item scan, run quarterly, is the instrument. Safety is set by the weakest item, not the average — and the fastest destroyer is a senior person mocking a question in a meeting you chaired and let pass.`,check:{q:'The scan says the team is unsafe. Your first intervention is…',opts:['A workshop on speaking up','Your own visible fallibility + punishing a messenger-shooter even if they are your best performer','Re-survey in a month'],a:1,why:'Safety shifts when the dominant behavior pattern shifts. The messenger-shooter sets the ceiling; your response sets the floor.'}}
];
const SCENARIOS=[
 {id:'sc1',title:'The star who belittles',ic:'star',setup:'Mirek is your strongest engineer by output. Twice this week he publicly dismantled a colleague\'s proposal with a sneer the room felt. The colleague has gone quiet. A delivery deadline is Friday and Mirek is load-bearing for it.',steps:[
  {q:'What is your first move?',opts:[{t:'Address Mirek privately today, SBI on the behavior, separate from the deadline',fb:'Correct. Behavior corrections are fastest when fresh, and private delivery keeps it about the behavior. The deadline does not buy him a code-of-conduct exemption.',score:2},{t:'Get through Friday\'s deadline first, then address it',fb:'Understandable and wrong. The room watches what you walk past; "after Friday" tells everyone the standard is negotiable under load. The team you keep is the behaviors you tolerate under pressure.',score:0},{t:'Praise the colleague publicly to rebalance the room',fb:'This treats the symptom and humiliates Mirek by indirection — he will read it, and now you have politics instead of a correction.',score:0}]},
  {q:'Mirek says: "I\'m direct because the work matters more than feelings." The room needs him. You…',opts:[{t:'Hold the line: directness is the claim, belittling is the behavior — name the difference and set the expectation',fb:'Correct. His frame is the classic confusion of candor with cruelty. Candor targets ideas; his impact targeted a person. Great correction keeps that distinction.',score:2},{t:'Concede partial truth but soften the ask',fb:'You just taught him the standard bends for output. The colleague watching learned the same lesson.',score:0},{t:'Suggest he apologize and move on',fb:'Apology theater without behavior change is a ritual. You need the behavior in the NEXT disagreement, observed.',score:1}]},
  {q:'Three weeks later, Mirek\'s peer reviews now name trade-offs instead of people. You…',opts:[{t:'Name the change specifically and privately, then watch',fb:'Correct — praise the corrected behavior precisely ("In Tuesday\'s review you attacked the plan, not the planner"). Correction verification closes the loop and the case.',score:2},{t:'Consider it resolved and archive it mentally',fb:'Unverified change regresses. The +21d check is what converts a conversation into a standard.',score:0},{t:'Mention his improvement in a team meeting',fb:'Public credit for a private correction re-exposes the wound and embarrasses both parties. Private in, private out.',score:0}]}]},
 {id:'sc2',title:'The inherited mess',ic:'teams',setup:'You inherit a team mid-reorg. Their last manager left abruptly. In week one you learn: two people stopped having 1:1s months ago, a senior engineer is interviewing elsewhere, and the roadmap is a stack of promises made to stakeholders nobody has renegotiated.',steps:[
  {q:'Week one priority one is…',opts:[{t:'Re-establish the 1:1 cadence with every person, listening-first, no changes promised',fb:'Correct. The trust vacuum is the root; everything else (retention, roadmap truth) is downstream of whether they can tell you reality. Listen 80%.',score:2},{t:'Renegotiate the roadmap with stakeholders immediately',fb:'Stakeholders matter but you don\'t yet know what you can credibly promise — you haven\'t heard your own team yet. Sequence matters:',score:1},{t:'Fight to retain the interviewer with a counter-offer',fb:'Counter-offers buy months and signal to the team that leaving is how you get investment. Fix the reasons, per-person, after you\'ve heard them.',score:0}]},
  {q:'The senior engineer\'s 1:1 reveals the core issue: eight months of invisible work, praise going to louder peers. You…',opts:[{t:'Acknowledge plainly, rebalance recognition this week, and map what they actually want next',fb:'Correct. Recognition famine is fixable fast and costs you nothing but attention — the highest-leverage retention move available.',score:2},{t:'Explain that you can\'t speak for your predecessor',fb:'True and useless. You own the relationship now; "not my fault" is a downgrade of trust at the exact moment you needed to build it.',score:0},{t:'Promise a promotion case to close the gap',fb:'Never promise what you have not verified you can deliver. Promise attention and fairness audits — those are in your control.',score:0}]},
  {q:'Two months in: cadence holds, the engineer stayed, but the team still hedges every status update. You…',opts:[{t:'Run the psych-safety scan and name the hedging pattern you observe, as data, in a team session',fb:'Correct. Hedging is a learned defense from the old regime. Naming it as data — not accusation — plus your own consistent no-shooting-the-messenger behavior, unwinds it.',score:2},{t:'Accept it as team culture',fb:'Hedging costs you your early-warning system; a team that softens bad news makes you the last to know, always.',score:0},{t:'Call out hedgers individually in meetings',fb:'Publicly punishing the symptom of unsafety manufactures more of it.',score:0}]}]}
];
/*@@MORE@@*/

