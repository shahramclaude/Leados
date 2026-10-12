# AI-SESSION-LOG — LeadCore continuation engineering

Context: continuation of the wbweve/Leados project. The repo's `index.html` was
recoverable only with ~60k tokens truncated from the middle. Stitching a file
around an unverifiable hole would have shipped silent corruption, so the call was
made to **rebuild the application whole, to the spec the README commits to**, and
extend depth beyond the advertised surface. This log is written so the next
session (human or machine) can audit intent instead of guessing it.

Standing constraints (permanent, non-negotiable): vanilla JS, no framework, no
backend, no APIs, no OAuth, no credentials, no build step. One `index.html`.
All state in `localStorage` under one key (`leadcore.v2`). Lucide-style icons as
inline SVG (no CDN runtime dependency — offline-first is a real constraint, not a
marketing line).

## Design positions held (and why)

1. **Automation bias is the primary enemy.** Every framework function returns
   `{score, band, reasoning[], actions[]}` — never bare prose, never verdicts.
   A "mentor" that emits answers trains a compliant operator who collapses on
   first contact with reality; the app argues, the user judges.
2. **Escalation is enforced in the write path, not the docs.** `FW.escalate`
   (ethics type, severity 5, trigger words) hard-stops `Engine.createCase`:
   no playbook, no feedback draft, no risk spin-up. Only the case record,
   verbatim evidence, and an HR-contact task dated today. Separation/PIP scripts
   carry HR-deferral guardrails in the renderer.
3. **Propagation is auditable or it doesn't count.** Every downstream write a
   case causes is recorded in its propagation ledger (module, kind, id, label,
   date). Closure cancels orphaned playbook tasks and restores person signal
   values — possible only because priors were stored at intake.
4. **Idempotency.** Identical open case (type+person+title+same-day) is refused
   as a duplicate. Double-submit cannot fan out phantom records.
5. **Deferred re-render.** All mutations flow through `mut()` → save → render on
   stack settle. Views never paint pre-mutation state; views are also wrapped in
   try/catch so one bad renderer degrades to an error card, not a white screen.
6. **Deferral, never dismissal.** Mentor advisories snooze for 3/7/14/30 days and
   sit visibly in a Deferred lane with return dates. A queue of silent dismissals
   is a queue of avoided judgment.

## What exists (current build)

Layers in file order: STORE (blank/load/save with failed-write surfacing, quota
meter) → UTIL/DOM (dates, esc, toast, modal, one generic `openForm` powering
nearly every mutation, live previews) → FRAMEWORKS (27 pure models incl. flight
risk with persisted history, trust equation, SL2, delegation match L1–L7, Edmondson
7-item, five dysfunctions sequential, Tuckman, bus factor, Cynefin, Eisenhower,
SLA, escalation test, meeting economics, leader load, nine-box, OKR health,
feedback balance, candour, Thomas-Kilmann, 4-cause diagnosis with manager-owned
blocking, power-interest, calibration, replacement cost, ADKAR, time targets,
cadence) → CONTENT (15 case types with playbooks/pitfalls/routing, 12 scripts
with guardrails, 1:1 question bank, 15 lessons in 4 arcs, 6 branching simulators)
→ ENGINE (createCase + ledger, closeCase + verification loop, agenda assembly from
6 signal sources, team health composite, 30/60/90 ramp generator, HR packet) →
MENTOR (35 detection rules, ranked, executable, dated snoozing) → VIEWS (19
routes) → SEED through the production engine → BOOT (delegated actions, shortcuts).

## Changelog

**Round 1 — full build.** All layers above. Global case intake with live
classification preview (Cynefin/Eisenhower/SLA/escalation + exact list of writes
that will occur). Case workspace with playbook execution, ledger, timeline,
pitfalls, structured closure. Person dossier with rings/history/HR packet/ramp/
leave/archive. Team workspace with scans. Session runner with GROW, mood,
carried commitments, auto-next-booking. Feedback with draft ageing and balance
meters. Decisions with premortem gate (refuses empty) and calibration. Governance
with OKR health, P×I register, meeting economics, stakeholder grid, comms, ADKAR.
Academy with persisted drills/checks and consequence-branching sims. Self with
load/time/candour/TK/90-day/journal. Data with telemetry, export/import
(merge: local ids win), prune, seed, erase.

**Round 1 QA — static review fixes (no browser available):**
- Operator precedence bug in Today greeting (`+` binding over `<`).
- Ternary precedence bug in team psych-safety card that swallowed item rows.
- `fb-harsh` rule referenced nonexistent `b.delivered` — would never fire.
- Dead array literal in nine-box board.
- Stray lambda fragment + CJK character in simulator content.
- Raw markdown asterisks in scenario text removed.
- Apostrophe sweep: all matches inside template literals — no single-quote parse
  risk found.

**Round 2 holes closed:**
- Improvement plans had verdicts/checkpoints but no creation path: added
  `plan-new`; person-owned diagnoses now auto-offer plan creation.
- Ramp milestones on person page never showed progress: now derived from tenure.
- Dead button removed from person header.

**Round 3 — enhancement batch:**
- Mentor 28 → 35 rules: case-idle, decision-hoarding, export-overdue
  (new `settings.lastExport` stamped on export), goals-missing, devplan-missing,
  devplan-stale, bench-empty.
- Development plans per person (1–3 dated focus actions; saving softens the
  stalled signal, writes evidence, 30-day review cadence policed by inbox).
- Instrumentation coverage strip on person page with one-click fixers.
- Succession bench section in team view (derived from 9-box potential × SL2).
- Delegation Re-level action (normalizes prefills, closes old as "re-leveled").
- Meeting theater → one-click meeting-debt case (row button + advisory action +
  `adv-do` kinds `meetingdebt`/`exportnow`).
- Case timeline notes (dated, grievance-readable).
- Session runner: copy-agenda button.

## Known limits / next-session watchlist

- **Not browser-executed.** Verification was static: data-action ↔ Actions
  registry, nav ↔ Routes, symbol definitions, anchor greps. Residual parse risk
  concentrates in template-string renderers (try/catch per view contains blast
  radius). First action of any next session: open in a browser, click every nav
  item, register a synthetic case of each severity class, close it, verify 30-day
  task, run export/import round-trip.
- Deliberately NOT built: leader mood surveillance (trust contract), consolidated
  task route (nav density cost), anything network-shaped (constraint is permanent).
- Import is schema-trusting beyond a minimal shape check; a hostile JSON could
  inject odd keys. Local-only threat model makes this acceptable; revisit if
  multi-user usage ever emerges.
- Flight-risk model mutates `p.frHistory` during render (memoized scoring);
  persists on next save. Acceptable; don't "fix" it into render-time saves.

## Session ledger convention

Keep this file append-only per session: critique first, positions held, changelog,
QA fixes, watchlist. README stays the user's contract; this file is the
engineer's.

---

## Round 4 — hardening + the missing playbook

Gap analysis opening positions (ranked by blast radius): (1) schema drift on
long-lived localStorage was unhandled — old exports/state met new code with zero
normalization; (2) no case type existed for the single most predictable event in
management — a resignation; (3) the propagation ledger was auditable but not
navigable; (4) improvement plans allowed unlimited silent extensions, which is
precisely how "one extension, in writing" dies.

Shipped:
- **`migrate()` on every load** — normalizes all 23 collections (object shape,
  array fields on people/oneonones/cases/goals/plans, settings/self/telemetry
  defaults, array-form people upgrade). Old exports are safe to import forward.
- **View-error telemetry** — route renderers were already try/catch-isolated; now
  fault count + last fault surface in Data & integrity with a report affordance.
- **Case type 16: `departure`** — resignation playbook (accept professionally,
  joint transition plan, knowledge transfer per "critical for", backfill-vs-
  redistribute decision with review gate, exit conversation, comms, bus-factor
  re-audit + archive). Routed: praise draft (recognition on record), risk entry,
  change-shaped comms, decision record (added to DECISION_WORTHY).
- **Click-through propagation ledger** — ledger rows deep-link to their target
  module/person.
- **Decisions: rejected-options field** recorded and displayed (postmortem needs
  the road-not-taken to be legible).
- **Plan extension enforcement** — second silent extension is blocked at verdict
  time with a hard toast; on-track or transition only. The rule is code now.
- **KR progress meters** in goal cards (same ratio model as okrHealth — noted
  simplification: "lower is better" KRs read inverted; documented, not fixed).
- **Praise-from-evidence quick action** — result/recognition evidence rows offer
  one click into a pre-filled praise SBI. Closes the agenda-assembly hint with
  an action path.
- **Empty-org onboarding state** in Today — four ordered moves (teams → people →
  cadence → first case) plus example-org escape hatch. The new-in-role user
  journey starts here now, not at an empty dashboard.

Watchlist additions: departure fb:'praise' drafts fire even for involuntary
contexts — the user edits before delivering, but if this lands wrong in real use,
gate it on a "kind" choice at intake. KR ratio semantics for inverse metrics is
the most likely next modeling complaint.

---

## Round 5 — a correctness failure, and the missing instrument

**Lead critique: the OKR model was laundering failure as success.** `krPct` used
`clamp(current/target,0,1)`. Every reduce-type KR therefore scored 100% while
failing — including two in the seeded example org ("lead time 38 → 15",
"rollback 7% → 2%"), which then banded their goal as healthy. A model that
confidently reports the inverse of reality is worse than no model: it
manufactures false comfort in the exact module built to prevent it. This was
flagged on the round-4 watchlist and should not have survived a second round.

Fixed with `FW.krProgress(k)`: direction (`up`/`down`) plus optional baseline.
With a baseline → true distance travelled `(c-s)/(t-s)`. Without → monotonic
ratio proxy (`t/c` for reduce). Migration infers direction once for every legacy
KR; both goal forms take `name | target | current | baseline | up/down` through
a shared `parseKRs`/`krsToText` pair with live preview; seed data carries real
baselines. Reduce-type KRs now render with a ↓ marker and honest percentages.

**Second gap: no skip-level module.** The app targets a manager of managers,
lesson 15 and script 11 both name skip-levels as the primary intelligence
instrument, and the feature did not exist. Built as a full module with doctrine
enforced in code rather than in prose:
- `skips` collection; 90-day cadence per report; coverage computed per lead.
- 5-question runner capturing **themes only, de-identified**, plus four signal
  dimensions (decision stall · credit flow · growth clarity · lead support).
- `FW.leadSignal` — composite read of a lead built from their team's skips,
  weakest-dimension prescription, explicit statement that no individual is
  identifiable in the score.
- **Routing doctrine in code:** on save, the theme injects into YOUR next 1:1
  with the lead (`Engine.injectAgenda`, scheduling one if none exists) and writes
  aggregate evidence on the lead. Nothing routes to the report's manager as a
  quote; nothing routes around the lead.
- Weak session (<55) auto-opens a prefilled `perf_pattern` intake on the LEAD
  with a reminder to diagnose system/clarity before coaching.
- Two rules added (37 total): `skip-overdue`, `skip-lead-weak`.

**Third: no altitude view.** `/org` — leader load, cadence coverage, flight
exposure in money, case pressure; teams table (health, stage, bus factor, safety,
bench, cases); leads table (trust, readiness, lead signal, skip coverage,
delegation mismatch count, next 1:1); unassigned-people warning.

**Fourth: no way to find anything.** Command palette on `/` or Ctrl/Cmd-K over
routes, people, teams, open cases, and 11 actions. Enter fires the top hit.

Watchlist: `Engine.leadReports` infers reporting lines from team membership +
level (team has one lead). If real orgs need explicit `managerId`, that is the
next schema move and migration is straightforward. Palette rebuilds its index per
open — fine at this scale, revisit past ~2k records.

---

## Round 6 — structure over inference: the reporting tree

**Opening critique: reporting lines were a heuristic pretending to be an org
chart.** "Everyone on a team who is not the lead reports to the lead" is wrong
for real orgs (flat teams, multiple leads, dotted lines), and it produced the
worst kind of nag: the app told a manager of managers to run weekly 1:1 cadence
with people who are NOT their directs — coaching below your leads is the exact
anti-pattern lessons l02/l15 exist to kill. Structure beats inference, so the
substrate changed.

Shipped:
- **`p.managerId`** — person form gains "Reports to" with loop-guard (options
  exclude self + entire subtree). `null` means reports to the user.
- **Migration (v2.2)** — normalizes managerId; legacy inference ONLY for teams
  with exactly one lead (deterministic, and it makes round-1..5 seeds correct on
  next load). Ambiguous structures stay user-directs.
- **Tree helpers** — `Engine.managerOf / isDirect / directReports / subtree /
  leadReports` (now exact); `Engine.subtree` has a hard guard cap.
- **Rule retargeting** — the "your cadence" rules now scope to direct reports:
  cadence-breach, oo-cancel-repeat, trust-fragile, trust-unassessed, mood-drop,
  fb-harsh, ramp-due; cadence-sweep and the review sweep similarly.
  devplan-missing scopes to directs + bench candidates (potential 3) — indirects'
  growth is their lead's job, and the advisory now says that out loud.
  skip-overdue/skip-lead-weak inherit exactness via leadReports. Team-health
  cadence component scopes to user-directs + leads.
- **Person page** — profile shows Reports to / Direct reports; for indirects the
  1:1 card becomes the skip-level card (last session, next booking, last themes,
  "occasional 1:1 anyway" escape hatch) with an explicit note that the weekly
  cadence is the lead's instrument, not yours.
- **Org map: span structure view** — you → lead layer (lead signal, skip
  coverage, next 1:1, report counts) → nested reports (flight risk, skip due/
  booked); plus a "directs without a lead layer" block so flat directs are never
  orphaned by the visualization.
- Seed sets the tree explicitly (Priya/Marcus/Rob → Dana, Sofia/Leo/Jazz → Tom).

Watchlist: one lead per team remains the span-view assumption (multiple leads
per team render multiple lead blocks — fine) but team-card "Lead" column picks
the first; accept until multi-lead teams are a real need. The v2.2 inference is
idempotent but runs on every load — it is O(teams×people), negligible here,
flag if rosters exceed a few hundred.

---

## Round 7 — eating my own regression, then two systemic gaps

**First item is a self-catch, stated plainly: round 6 shipped a regression.**
`skip-run` still derived the lead from team membership after `managerId` became
the source of truth — on a multi-lead team it would route a skip-level's themes
into the wrong manager's 1:1, which is the exact harm the tree was built to
prevent, made worse by being delivered into the most doctrine-sensitive module.
Found on re-read of the diff surface, not by a user. There is no lesson here
beyond the one already logged: this codebase has had zero browser executions,
and confidence compounds silently until it produces exactly this class of bug.
Fixed: lead resolution is `Engine.managerOf(p)` only.

**Gap 2 — the quarterly talent ritual did not exist.** Every calibration
instrument existed (nine-box, flight risk, dev plans, bench), and each lived in
a different corner, which in practice means none of them gets re-stamped and all
of them go stale in the same quarter. Shipped: `Actions['person-talent']` —
model-read first (flight score + top driver + dev-plan staleness), two sliders,
change-note → dated nine-box + `talentReviewAt` + optional case flag straight
to prefilled intake. Performance gets a ritual table over all directs with
currency progress and stale flags; rule `talent-review-due` (38 total) polices
the 90-day window.

**Gap 3 — team health had no memory.** Health was recomputed live and
forgotten, so a slow slide was invisible. Shipped: weekly snapshots at review
time (`S.healthTrends`, 26 points/team, migration-guarded, save-once-per-week),
per-team sparklines with week-over-week delta chips in the weekly review, and
rule `team-health-slipping` (39 total) at a -10 threshold.

Watchlist: talent ritual stamps assume 90-day quarters — configurable cadence is
a setting candidate if real usage shows otherwise. Health snapshots persist on
review render, so a user who never opens the review never accumulates history —
which is the correct behavior: no history for rituals you skip.

---

## Round 8 — the upward instrument, plus two small correctness debts

**Opening critique: the app instrumented every direction except up.** A new
manager of managers is judged primarily by the narrative above them, and
silence upward is filled with somebody else's story. All the inputs for a
five-minute weekly one-pager already existed; the deliverable did not.

Shipped:
- **`buildUpwardBrief()` + `Actions['brief-open']`** on the Weekly review.
  Assembles: headline (SLA adherence, cases in/out, 1:1s, feedback, risk-grade
  signals), teams (health + weakest component), exposure (retention ≥45 with
  money, goals bands), top register risks, the ASKS block (user-editable, sticky
  draft), next-week top-3 (engine-suggested, user-ratified). Copy/print. Persists
  as a `comms` record (kind `upward`) so the outgoing narrative is dated and
  auditable, and `self.lastBrief` feeds rule `brief-overdue` (40 total).
- **Sensitive-data discipline mirrors the skip doctrine:** escalated matters
  appear as a COUNT with "details stay in the HR channel"; retention exposure is
  counts + money with names on request. Nothing in the brief would damage the
  user if printed and left on a printer — it is neutral by construction.
- **Bugfix: re-opened cases are no longer born breached.** `Engine.reopenCase`
  now resets the SLA to today + type-derived window; carrying the original
  deadline punished the honest act of re-opening with an instant false breach.
- **Load model prices standing meetings.** `FW.load` adds meeting hours/week
  (duration × frequency weight) at 2 pts/hour with the reasoning line visible.
  The quietest consumer of a manager-of-managers' week was invisible to the
  model that exists to catch overload.

Watchlist: the brief is English-assembled, not a document model — localization,
if ever needed, means reworking the builder, which is why every line stops at
the `L.push` layer. `brief-overdue` is deliberately advisory, not blocking:
upward cadence is a norm to adopt, not a rule to obey.

---

## Round 9 — rituals that produce artifacts, or it didn't happen

**Opening critique: the app prescribed rituals it could not instrument.** Lesson
content told the user to run retros; the 1:1 doctrine told them preparation is
the contract. Neither was operationalized — the retro existed only as advice,
and the session runner opened amnesic, forcing the busiest step (reconstructing
what changed for this person) back onto human memory, which is precisely what
the tool exists to retire.

Shipped:
- **Since-last-session digest in the 1:1 runner.** The modal now opens with an
  auto-assembled card: new evidence, cases opened/closed, feedback delivered,
  flight-risk delta, talent stamps since the last completed session (or, for a
  first session, the first-1:1 script offered inline). Zero items triggers the
  honest prompt: genuinely quiet, or the instruments are going unfed.
- **Retro engine** (`retros` collection, migration-guarded, data-integrity
  visible). Runner is model-informed: the modal opens naming the weakest safety
  item and failing dysfunction rung so the retro starts from evidence, not
  mood. STOP/START items become dated, owned tasks; open items carry into the
  next retro until closed or killed loudly; killing one is explicitly framed as
  a decision you say out loud. Item toggling on the team page; staleness
  measured by rule `retro-overdue` (41 total).
- Seed: Platform has one held retro with mixed open/closed items.

Watchlist: retro item done-state lives on the item, while the action items also
exist as tasks — two completion records for one act. They sync by naming, not by
id; the pragmatic fix (link task.id onto the retro item) is queued if anyone
reports drift. Carried items are copied, not linked — history stays immutable,
which is why a kill must be verbal.

---

## Round 10 — say what the models mean, and own what you owe

**Opening critique (two of it, one of mine):**
1. Round 6's tree made cadence direct-only, but the 1:1 route kept counting
   indirects as "uncovered" (the sweep would never book them) and the People
   table kept showing red "no 1:1" for people whose cadence is legitimately
   their lead's. A UI that contradicts the model trains users to distrust the
   model's numbers everywhere else. Fixed: sweep targets, route counts, and the
   People table now all speak tree — indirects render skip status instead.
2. Commitments had no owner. The runner treated every 1:1 commitment as the
   USER's debt, so Today accused the user of others' slippage while hiding the
   chase list — things reports owe the user that are quietly dying. For a new
   manager, the chase list is the accountability job's inbox.

Shipped:
- **Commitment ownership** — runner add-row gains owed-by (me/them); rows,
  agenda assembly, and copy-agenda all carry the owner. Today splits into
  "Broken commitments — owed BY you" (trust withdrawals) and "Chase list — owed
  TO you, slipping" with the doctrine: chase once, by name, because unchased
  slippage teaches that deadlines are advisory. Legacy commitments default to
  `mine` (preserves existing data semantics).
- **Working agreement per team** — `t.contract {text, at, reviewAt}` with a
  guidance form (decision rights, channels, urgency routing, conflict shape,
  sacred hours) and stage-aware pressure: forming/storming teams get the
  strongest recommendation in the card itself.
- **Academy arc progress** — per-arc readout of checks passed / drills written /
  scenarios run (scenario→arc mapping explicit, not inferred vibes).
- **Quota pressure toast** at ≥85%, once per day, pointing at export-then-prune.

Watchlist: the `cm` intermediate variable was briefly dangling mid-round during
edits (caught and fixed same-round by repair pass — this is exactly the failure
class the log keeps warning about with template renderers; the file is whole
now, but the round itself is the argument for the browser acceptance pass).
Owner semantics on commitments are per-creation; editing an existing
commitment's owner is not in the UI — acceptable until challenged by usage.

---

## Round 11 — closing quarter-truths from my own watchlist

**Opening critique: a documented debt that stays unpaid is procrastination with
a paper trail.** Four entries charged to this round:

1. **Retro dual-record hole — CLOSED.** Retro STOP/START items now store the id
   of the task they minted, and toggling the item drives the task state
   (round-9 watchlist item, resolved exactly where the log queued it).
2. **The chase list was informative but inert.** It now has teeth: each slipping
   "owed to you" commitment carries a one-click injection into the next 1:1
   agenda with that person (`Engine.injectAgenda`, scheduling one if none
   exists). The loop runner → commitments → today → agenda now closes.
3. **Goal confidence had no memory.** `g.history[{d,c}]` capped at 30 with
   same-day dedupe on every KR update; the goal card renders a confidence
   sparkline. Quiet 7→6→5→4 decay is now visible instead of implicit.
4. **Two un-fed instruments:** rule `diag-pending` (42) — case-routed
   four-cause diagnoses sitting 7d+ un-run get nagged, because unnamed causes
   guarantee mis-aimed coaching; rule `ladder-stalled` (43) — leads with
   reports but zero active delegations at L4+ get the lesson-l15 nudge. The org
   map leads grid gains a max-ladder chip so the stall is visible without the
   advisor.

Watchlist: chase injection duplicates a carried commitment into the agenda while
the original commitment stays open in the source session — intentional (the
agenda item chases; the commitment records), but wording drift between the two
is possible; acceptable noise. Ladder rule treats "no L4+ delegation" as stalled
regardless of team size — a lead with one report may legitimately keep L3; the
advisory says "something real with boundaries", it does not mandate.

---

## Round 12 — hiring gets a home, and two affordances learn to close

**Opening critique: "hiring & org design" was 10% of the user's modeled week
and 0% of the app's artifacts.** There was a hiring case type with a scorecard
*playbook* — advice about hiring — and no pipeline, no scorecard object, no
staleness detection, and no connection to the moment that matters most: the
accept. Built:

- **`/pipeline`** (route 22; collection `candidates`, migration-guarded) —
  four stages with per-stage day counters (leaks visible at 10d+, nagged at
  14d by rule `pipe-stalled`, 44 total), six-dimension scorecards with the
  doctrine in the form (score alone first, deliberate before orbiters'),
  composite-verdict chips, fast-close with an outcome reason on record.
- **The accept-mints-everything cascade** — marking hired writes the person,
  the 30/60/90 ramp plan, and the first 1:1 (booked at start+3 with a day-3
  environment-check agenda) in one mutation, then navigates to the new dossier.
  Case-spine discipline applied to the most valuable junction in org design.
- **Departure closure offers archival as an act** — after a `departure` case
  closes, the archival confirm appears (history kept, scans stop) instead of
  remaining playbook text nobody executes.
- **Sim debriefs hand off to the curriculum arc** — no more dead air after the
  verdict; one click to the matching lessons.
- **Review streak counter** — consecutive-guided-review weeks in the review
  header; behavior economics for the loop that trains the user.

Watchlist: scorecards are one- per candidate (the "independent scores before
discussion" doctrine says interviewERS each score, then debate) — multi-scorer
support is the real next step if the user runs loops with peers, and the schema
(`scorecard.dims`) already tolerates a `{byRater:{...}}` upgrade without
migration surgery. Pipeline is single-pipeline; multi-req grouping is
premature until a second concurrent req exists in real usage.

---

## Round 13 — every sermon gets a mechanism

Small round, one principle: wherever the content preaches a behavior, machinery
must exist for it, or the app is a self-help book with a database. Four closes:

1. **Corrections get closure fuses.** Delivering course feedback now mints a
   +21d "verify change & name it" task — the feedback loop mirrors the case
   closure loop instead of ending at delivery. Praise stays flow-only
   (balance model), deliberately asymmetric: corrections compound when
   unverified, praise doesn't.
2. **Departure KT is capability-level.** Registering a `departure` case mints
   one knowledge-transfer task per `criticalFor` capability of the leaving
   person (ledgered under `busfactor`), instead of a single playbook line
   hoping a human expands it 48h into a notice period.
3. **Plan verdicts evidence now.** `plan-verdict` was the lone verdict-type
   write that journaled without evidencing — the HR packet would have exposed
   the asymmetry at the worst possible time. Fixed at the write.
4. **Week-ahead strip in Today.** Seven cells: 1:1s, skips, task load per day.
   "Relax and trust" means scanned-and-confirmed, not ignorant-and-calm.

Watchlist: fb-verify tasks are plain tasks (no re-open semantics like case
verification) — naming the change is perishable judgment, not state; if usage
shows verify tasks rotting in triage, escalating them into agenda injections
is the queued move.

---

## Round 14 — measure the measuring instrument

**Opening critique: the app measured everything except itself.** Cadence
coverage, instrumentation coverage, model staleness — all answered per person,
per team, per artifact. Nothing answered "is the operating system itself
installed?" For a user new in role who explicitly wants to relax and trust,
letting "trust the tooling" outrank "verify the tooling" would have been the
quietest philosophical bug in the codebase.

Shipped:
- **`FW.osReadiness()`** — 13 foundational artifacts (teams, people, leads,
  tree, cadence green, safety scanned, goals, stakeholders, first case, first
  review, journal, first skip, first backup), one score, each failure rendered
  as a one-click fix button. Full checklist on `/self`; slim banner on `/today`
  while below 100%. The app's own verification doctrine applied to the app.
- **Prior-lesson at intake.** The case recorder surfaces the last CLOSED case
  of the same type with its lesson inline — the review loop now feeds the
  registration point, not merely the journal. Learning at the moment of
  repetition is the thesis of the closure process; previously it was one
  lookup away from invisible.
- **Big movers in review exposure.** Flight-risk deltas vs personal history
  (≥10 pts) under the top-flight table — a score matters less than a slope;
  the history was recorded, now it is attended to.

Watchlist: osReadiness is a floor, not a quality bar — a scanned team with a
2/7 psych reading still counts as scanned. Depth checks belong to their own
modules; merging them into one number would create false completeness.

---

## Round 15 — executable integrity, and three defects it found while being built

**Opening critique: at 22 routes / 45 rules / 31 models / 31 collections,
"the page rendered" was no longer an integrity argument.** Data & integrity
listed counts and storage facts but could not answer whether reporting lines
cycled, references dangled, a hiring cascade lost its person, or a retro item
disagreed with its linked task. The app now audits its records instead of
describing why integrity matters.

Shipped:
- **`Integrity.audit()`** — cached by write-counter (forced on manual run) with
  executable checks for schema shape, JSON serialize/parse round-trip,
  collection-key/record-id canonicality, reporting tree refs + cycles, team/
  person/case refs, propagation-ledger targets, retro↔task state, hired
  candidate→person+ramp cascade, content/route contracts, five critical model
  assertions (reduce-KR, escalation hard-stop, SLA boundaries, manager-owned
  diagnosis gate, delegation mismatch), quota, and runtime fault history. Full
  report in Data; top-bar hard warning; rule
  `integrity-fault` (45 total); copyable diagnostics (explicit warning that
  names/ids may appear, no dishonest privacy claim).
- **Safe repair only** — re-key canonical records, clear missing manager/team
  refs, break reporting cycles, reconcile linked retro/task states. No record
  deletion, no invented history, no "fix all" theater. Export is requested
  first. Ambiguity stays reported for human judgment.
- **Prune is now audit-preserving** — task deletions stamp matching case-ledger
  writes (`prunedAt`) and retro items (`taskPrunedAt`) before deletion, so
  historical audit trails distinguish intentional pruning from corruption.

Defects found by building the audit (the feature paid for itself before UI):
1. **Eight writer sites generated object key and `record.id` with separate
   `uid()` calls.** Lists hid it via `Object.values`; direct lookup failed.
   Upward briefs could render in history then refuse to open; talent evidence
   could render then fail praise conversion. All writers fixed; migration now
   re-keys every entity collection by canonical id to repair existing state.
2. **Hiring pipeline route contained an invalid sort arrow** (`(a,b=>...)`) and
   could not parse. Fixed to `(a,b)=>...`.
3. **Round-6 manager-tree inference ran on every load.** An explicit
   "reports to me" null inside a one-lead team was silently re-parented under
   the lead after refresh. Migration now carries `managerTreeMigrated` and
   inference runs once only — and only for records that genuinely lacked the
   `managerId` property before normalization. Explicit null is now distinct
   from legacy missing. Safe repair can call migrate without mutating deliberate
   flat reporting lines.

Performance note: initial audit design serialized full state multiple times per
render (mentor scan + top bar + Data). Added cache keyed by write/fault counters;
manual Run audit forces a fresh pass. Integrity checking must not become the
next synchronous-localStorage performance defect.

Watchlist: safe repair clears dangling team links to null; that is mechanically
safe because the target no longer exists, but it loses the old opaque id after
repair. The copied pre-repair report is the forensic record — export first.

Connection close: OS readiness is now 14 artifacts and includes "integrity
audit has no errors"; the command palette can run the audit directly. The app
cannot declare its own install complete while its records are structurally red.

---

## Round 16 — cycles that cannot visibly complete are not cycles

**Opening critique: three loops existed without completion semantics.**

1. **Development plans were write-only.** Three focus actions, a review date,
   a staleness nag — and no way to mark a single action done. Now: per-action
   toggles with `done` state, preserved across plan edits, `n/m done` progress
   chips on the person page and inside the talent ritual intro, evidence
   written on completion, and a stalled-signal credit when a real action
   closes (like saving the plan itself already does — behavior pays down the
   driver, dates do not).
2. **The quarterly ritual existed only as scattered rules.** `FW.quarterRhythm`
   assembles the six quarterly maintenance surfaces a manager of managers owns —
   talent stamps, skip coverage, bench per team, goals touched ≤21d, warmup of
   manage-closely stakeholders, safety scans ≤45d — into one panel with one
   score, one due count, per-item fix links, rendered in the weekly review
   ahead of the weekly machinery (the quarter frames the week, not vice
   versa). Rule `quarter-overdue` (46 total) fires at 3+ lapsed rituals.
3. **Case pressure read as a count, not a shape.** Aging buckets
   (0–3 / 4–7 / 8–14 / 15d+) sit above the open table with the doctrine that
   15d+ open is an aging problem before it is a case problem.

Watchlist: dev-plan completion credit caps the stalled signal reduction at the
same floor the plan-save credit uses; compounding both is intentional (saving
and delivering are different acts), but watch for double-counting complaints
when a user edits-then-toggles in one sitting. quarterRhythm is recomputed on
render like every model here — cheap at roster scale, one more entry on the
"memoize if rosters grow" ledger.

---

## Round 17 — capstone detectors, not new surface

Deliberately small round; the codebase earns restraint, not features. Three
blind detectors, each answering a failure class that sits exactly between
existing instruments:

1. **`ghost-direct` (rule 47).** A direct with no evidence, no completed 1:1,
   no delivered feedback, and no case in 45 days is indistinguishable from
   "genuinely fine" from where the dashboard stands. People the instruments
   stop seeing are the people who resign by email. The rule says that out
   loud and prices it in hours, not guilt.
2. **`type1-aging` (rule 48).** Premortem-less Type 1s nag; overdue review
   gates nag; the undecided irreversible decision opened 35 days ago sat
   between both. Irreversible calls improve with information or die as sunk
   process — decide, or re-date with a reason on the record.
3. **Dev plans reach the room.** `Engine.agendaFor` gains its seventh source:
   dev-plan review due within seven days (or overdue) now materializes as an
   agenda item phrased as the correct question — "what did the plan cause",
   not "does the plan exist". Growth conversations now happen where growth
   conversations actually occur.

Watchlist: ghost-direct treats case *registration* as instrumentation within 90d,
which is correct (a case IS attention) but means a chronic background case
counts as coverage; the rule reads same-window evidence/1:1/feedback case-
insensitively. If a real user games it by registering a perpetual case, the
honest fix is weighting, not a new rule.

---

## Round 18 — sermons that ended mid-sentence get endings

1. **The correction loop no longer trusts the checkbox.** Completing a
   +21d fb-verify task now asks the actual question with two artifact-bearing
   outcomes: change seen → evidence written ("behavior change NAMED") plus the
   reminder that the in-person delivery is what makes it stick; no change →
   injection into the next 1:1 agenda with the doctrine carried in the item
   text (the second conversation cites the first, with dates). The fb-verify
   pipeline delivers → verifies → names or chases. End of sentence.
2. **Ad-hoc conversations become recordable.** `oo-quicklog` mints today's
   session and drops you in the runner — reality has hallway 1:1s and the app
   previously required future bookings to log one.
3. **Meetings reconcile with the decision journal.** Meeting economics priced
   decisions it couldn't see; `meet-dec` logs a decision *out of* a meeting
   with context prefilled (attendees, duration, frequency, session cost).
   Theater claims now audit against paper.
4. **`recog-cluster` (rule 49).** Balance guarded praise-vs-correction per
   person; nothing guarded whom the wins accrue to. ≥60% of 60 days of
   result/recognition evidence on one name fires the favoritism detector —
   with the harder branch named in the why: find a true win elsewhere, or
   audit whether the log itself is honest.

Watchlist: fb-verify's "change seen" evidence is self-reported naming — the
mechanism cannot verify the change, only force it onto the record where it can
be audited later. That is a deliberate property (like calibration), not an
oversight: the log argues with you next quarter, accuracy then beats comfort now.

---

## Round 19 — the inherited-team gap, and three mechanisms for unfiled complaints

1. **Teams had no intake ritual for the exact user this app serves.** People
   have 30/60/90 ramps; the manager-of-managers inheriting a team got nothing
   between "team created" and "team measured." `Engine.teamInherit` writes
   seven dated tasks (listen / scan / map / agree / align / expect / retro)
   via a banner on the team page, one click, nagging in triage like every
   real obligation. Fixed a broken `data-id` attribute introduced in the
   same edit (flagged verbatim in the log because that is what this file is
   for).
2. **Team moves got single-lead suggestion, visibly.** After inference became
   one-time (correctly), moving a person between teams left the manager
   field orphaned silently. Now: live preview names the single lead before
   commit; the apply path includes the explicit anti-authority clause —
   *choose if it's wrong, not "because the model said so."*
3. **Severity is defined.** The slider now prints the meaning of each value
   at its position, including what 5 does (automation hard-stops). A number
   with no scale was the least defensible input in the app.
4. **SLA breach marks the case timeline.** The most important date in an open
   case's life now appears inline in red; cases that breached weeks ago no
   longer present as merely "created, then quiet."

Watchlist: team-inherit hides after first run (`t.inheritedAt`) — re-inheritance
(a team reset, a re-org) cannot rerun from the banner; a "re-run intake" affordance
goes on the backlog if real usage meets that case. The single-lead suggestion
runs through the user's explicit form save, so it honors the once-only rule's
intent: inference happens exactly once per act of the user, not per act of time.

---

## Round 20 — readings invisible at the decision point, made visible

1. **Zombie goals got a verdict demand.** `okrHealth` has always flagged drift;
   nothing distinguished "behind" from "expired, unjudged." Rule `goal-expired`
   (50 total) fires on end-date-passed-open goals with the three honest
   verdicts priced into the why (close with the honest number / extend with a
   dated reason / kill publicly), and the goal card carries the EXPIRED chip
   itself. Dates stop being decorative the moment one is visibly ungodly.
   (An over-clever date guard was written and immediately simplified in the
   same round; the log keeps the habit of saying that kind of thing aloud.)
2. **Mood trail on the person page.** Session mood existed as record and as
   weekly average; the one place a leader forms longitudinal judgment about a
   person showed neither. The 1:1 card now renders the last ten moods with the
   mean — slow declines become early conversation material instead of
   exit-interview trivia.
3. **Overloaded days on the week strip.** The strip flagged empty days and
   ignored dangerously full ones. 3+ sessions in a day now marks the cell,
   with the rule stated: you will hold all the sessions and learn from none.

Watchlist: goal-expired and okr-rotten intentionally overlap for an expired AND
abandoned goal — the verdict demand supersedes freshness pressure; stacked
advisories on one artifact are a signal to unify, and if a real user reports
noise from the pair the fix is rule fusion, not snoozing harder.

---

## Round 21 — the no-snooze class: mechanisms judged on refusals, not reminders

**Opening critique: the snooze mechanism was uniformly permissive, and two
advisory classes must not wear that affordance.** Deferred ≠ dismissed is a
sound doctrine for most of the inbox; it is exactly wrong for (a) an open
legal-grade escalation ("HR today" that can be postponed 30 days by button is
an architecture that consents to its own message being ignored) and (b) an
active integrity fault (snoozing structural corruption is how silent state
death pretends to be acknowledged). `NO_SNOOZE` is now enforced twice — the
button row renders "cannot be snoozed" instead of the affordance, and the
action handler refuses with a toast, because rendering-level refusals alone
die the first time someone crafts the DOM call. The rule remains until
resolved, which is the entire point.

Also: ledger entries whose target was pruned now render the `pruned` chip
(stamping introduced in round 15) instead of a link to nowhere — the audit
trail describes its own history cleanly at the click surface.

Self-log per convention: the first write of this feature computed the
no-snooze flag outside the row closure (`a` undefined, route-breaking
ReferenceError) and was caught and fixed in the same pass — recorded because
this file exists to keep "caught in the same pass" from quietly upgrading to
"was never wrong."

---

## Round 22 — keep the advisory's promise mechanical

`type1-aging` has always prescribed "decide, *or re-date explicitly with the
reason on record*" while shipping zero mechanics for the second clause —
advice without an action is poetry. `dec-redate` ships with every open
decision: a new review gate plus a *required* reason written to the journal,
`redatedAt` stamped, and the honest doctrine attached ("moving a date is fine;
hiding that you moved it is drift"). The advisor, the module, and the record
now say the same sentence.

**Sequencing note:** a later docs pass briefly reordered this section and
inserted a spurious "Round 22.5" filler heading; restored to chronological
order and cleaned. The append-only log does not get to pretend that didn't
happen — the note stays precisely because the incident exists.

## Round 23 — the return trip deserves an instrument

**Opening critique: the strongest automation claim in the product had one
untestable surface — the leader goes away for a week and the return experience
was "reconstruct everything by clicking."** For an app whose doctrine is
scan-verified calm, arrival back to ambiguity was the most unautomated moment
in its own domain.

Shipped:
- **`buildCatchup(since)`** — cases opened/closed in the window (with
  severities), flight movers ≥8 pts from personal history, feedback counts,
  evidence/tasks throughput, decisions logged/reviewed, hires, pressure trend
  delta from persisted snapshots, team-health movers. Ends with an explicit
  read order (risk-grade → SLA → cases), because a digest without a sequence
  is just a longer inbox.
- **Auto-offered on entry** — `S.settings.lastSeen` moves once per day (one
  write, not per render); a ≥4-day gap renders the welcome card in Today with
  the digest one click away. Manual assembly from any date lives in Self
  ("Catch me up").
- Copyable, like every other deliverable the app assembles.

Watchlist: LAST_SEEN_PREV survives for the lifetime of the page load, so the
banner disappears on the next day-change-free refresh — the digest itself
remains available from Self at any date, which is the durable instrument. If
multi-day-absence plus same-day return feels noisy in real use, an explicit
"dismissed" stamp is the queued refinement, not more banners.
