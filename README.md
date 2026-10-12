# LeadOS — Leadership Operating System · v5 (Session-5 build)

An offline-first operating system for a new **manager-of-managers**. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step. The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v5`) in one browser profile. Web fonts are presentation-only; system-font fallbacks keep everything functional offline. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. Software that hands a new leader answers produces a compliant operator who collapses the first time reality deviates from script — and creates legal exposure when someone acts on generated advice about a termination without judgment. The division of labor is explicit, enforced in the UI, and restated on the `#/about` page:

| The app owns | You own |
|---|---|
| Detection (**59 rules**), scoring (**33 pure models**), sequencing, drafting, record-keeping, escalation timing, cadence | The judgment call |
| Forcing decisions/outcomes recorded with rationale and a review date | Living with the outcome |
| The review loop that turns experience into skill — the actual leadership-course substitute | Reading the loop honestly |
| Escalation timing (hard-stops to HR) | The humanity of that room |

The **escalation test** (`ethics_hr` type + keyword triggers: harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threats) hard-stops automation in the write path: only the case record, verbatim evidence, and an unsnoozable HR-contact task dated today are created. The intake **reclassifies any case** whose facts trip the keyword scan, previews that reclassification before you commit, and the audit class `ethics-wires` fails loudly if an ethics case ever carries a wire beyond evidence+HR. PIP/separation scripts deliberately do not exist. The mediation protocol halts at two locked gates (stages 1 and 4) and converts to an HR escalation case in one write when protected-class content surfaces. Three advisory classes cannot be snoozed: **escalation-open · HR-task-due · integrity-fault.**

## The case spine (architectural core)

Register a case **once**, anywhere — person page, team page, Today, the top bar, or `C`. The intake shows a live classification preview before you commit: Cynefin domain · Eisenhower quadrant · severity SLA · keyword/escalation reclassification with the hit words named · the exact list of writes · the lesson from the last closed case of the same type. The engine then:

1. Dispatches the type's dated playbook (2–6 tasks) into the task stream.
2. Writes real, linked records into every routed module across **14 wire kinds** — evidence, agenda, SBI draft, P×I risk, decision stub + gate, blocking 4-cause diagnosis, comms draft, KT fan-out (one task per critical capability held), bench readout into team notes, backfill requisition, stakeholder pre-wires, goal/KR impact check, mediation armed, HR hard-stop — every write trapped in the case's **propagation ledger** with click-through routes on the case page.
3. Refuses identical open duplicates (idempotent intake; type + scope + title).
4. Closure is checked, not assumed: outcome + lesson mandatory, orphaned playbook tasks cancelled, lesson journaled, +30d verification armed (verify or re-open), AAR armed for sev ≥ 4.
5. **Cross-links related open cases** — two live cases on one scope is a pattern, surfaced as such on both cases and in the inbox.

## Session-5 deltas vs the v4 fork

This is a **rewrite**, not a patch (see AI-SESSION-LOG for the position, argued). New store key `leados.v5`; import of any non-v5 shape fails loudly without touching state.

| Area | v5 depth |
|---|---|
| `#/about` | **New module.** The judgment contract, the refusals, the module map, live counts, shortcuts. A system that asks for total trust owes its operator its doctrine in writing. |
| Mentor engine | 59 executable rules (was 60 claimed in v4): adds pressure-spike-vs-baseline, load-index, commitment-debt split (broken-by-you vs owed-to-you), leave-return preparation, salary-band gaps, score-alone violations, stale boss-level 1:1 cadence per lead, energy telemetry, and three positive-signal rules (verified closure, mood brightening, lesson streak) — the mentor reinforces, not just nags. |
| Daily brief | Engine-ranked top-3, week-ahead strip, welcome-back digest after 4+ days with one-click catch-up, sessions with pre-built agendas, commitment debt, load index, 60-day pressure sparkline, Friday review prompt. |
| Airworthiness | Quick integrity check runs continuously and can **lock the inbox** (unsnoozable) if the store is internally inconsistent; full 18-class audit on `#/data` with safe-repair only where mechanically unambiguous. |
| Mediation | Two locked HR gates (stages 1/4) with one-write conversion to ethics case; agreement embeds evidence to **both** people and arms a +14d verification task. |
| People | Flight-risk history recorded daily per person (view-time, idempotent); replacement economics with exposure estimate vs flight band; re-armable 30/60/90 gates whose advisory *clears* when you hit the gate (fixed this session from the v4 behavior). |
| Decisions | Ordered by gate urgency; re-dating requires a recorded reason; outcome logging grades calibration (over/under/confident) against confidence stamped at log time; premortem → risk rows in one click. |
| Negotiation | Floor forced via unsnoozable-adjacent advisory; concession ladder rows (give ⇄ get, by-when); comms draft with the floor redacted; review-date rot advisory. |
| Hiring | Accept cascade writes person + 30/60/90 ramp + first-1:1 + day-1 contract in one write *and* notes the wire back into the originating backfill case; scorecards gate comparison until all six dimensions are scored alone. |
| AAR | Expected-vs-happened **numbers**, 5-whys validated for causality words live, blameless stop condition required by checkbox, improvements → owned dated tasks, live quality score. |
| Simulator | 4 scenarios × 3 stages, two-tier consequence scoring (brilliant 4 / safe 2 / harmful 0) with running score, per-stage consequence narrative, and a debrief verdict that persists the best run. |

## Module map — 27 renderers (24 routes + 3 workspaces)

| Route | Depth |
|---|---|
| `#/today` | Engine-ranked top-3 · week strip · welcome-back digest · sessions w/ auto-agendas · commitment debt · load · 60d pressure · Friday prompt |
| `#/inbox` | 59 rules · severity order · 3 locked classes · dated snooze + Deferred lane · positive signals lane · full rule list on `#/data` |
| `#/cases` · `#/case/:id` | 15 types · aging buckets · playbooks · known failure modes inline · propagation ledger with click-through · cross-links · checked closure + verify/re-open · failure-mode cards |
| `#/review` | Auto 7d digest · 60d pressure (drops demand lessons too) · team-health table · 60-second upward brief · guided 4-field ritual · journal stream |
| `#/people` · `#/person/:id` | Flight risk (8 weighted drivers + daily history) · trust equation with sliders · nine-box click-stamp w/ 120d expiry and band labels · blended 4-slider pulse · evidence ledger with case backlinks · replacement economics · dev plan · gates · leave mode · archive · HR packet (copy/print/download) |
| `#/teams` · `#/team/:id` | Edmondson scan (correct reverse-scoring on 2/4/6) · five dysfunctions sequential stepper · bus factor per capability · composite health breakdown · derived succession bench (nine-box × trust × ladder) · working agreement · retro engine → tasks · goals readout |
| `#/oneonones` | Cadence by flight risk (7d/14d) · since-last digest · 6-source auto-agenda consumed on completion · owedBy commitments → dated tasks · move-count telemetry · next booking auto-armed |
| `#/skips` | Quarterly cadence per report-of-lead · 5-question runner · themes inject de-identified into YOUR 1:1 with their lead — never around them |
| `#/feedback` | SBI composer · ageing clocks (praise 48h / corrections 72h) · deliver → evidence · +21d verification with sustained/lapsed outcomes; a lapse auto-opens a new underperformance case · balance board with 60–85% zone |
| `#/coach` | GROW runner with live quality score (specificity, rich reality, 3-option floor, dated way-forward) · 40-question bank · commitments → tasks |
| `#/mediation` | Six stages, order enforced · two locked HR gates · halt-to-HR conversion · agreement embed + +14d verification + evidence to both parties |
| `#/delegation` | SLII skill×will → suggested style/level · mismatch warnings · boundary conditions · checkpoints with overdue flags · debrief verdicts feed the bench |
| `#/performance` | 4-cause diagnosis (system/clarity are manager-owned and block coaching) · nine-box board with staleness glow · quarterly ritual counters |
| `#/decisions` | Type 1/2 doors · DACI · premortem ≥3 enforced for Type-1 at the form layer and by audit class · premortem → risks · re-date with reason · calibration grading |
| `#/portfolio` | Direction-aware KR scoring + trajectory sparks · grading ritual for expired goals (drops demand causal lessons) · P×I register with ADKAR change-walk (first-gap coaching) · stakeholder quadrants + contact cadence · comms drafts from the case spine with send-or-kill lifecycle |
| `#/negotiate` | BATNA lab · floor forced · ZOPA read · concession ladder · live prep-strength · redacted comms draft · rot advisory |
| `#/pipeline` | Score-alone-first 6-dim scorecards · stall flags (14d) · stage-leak counts · accept cascade in one write |
| `#/meetings` | Decision-first verdicts (pays rent / kill-or-async / watch) · annualized cost · meeting-factory flag (≥6h/wk) · async conversion journaling savings |
| `#/aar` | Numbers required · 5-whys with causality validation · blameless stop checkbox · improvements → tasks · quality score · “tuition unpaid” list from closed severe cases |
| `#/academy` | 12 lessons in 6 arcs, 4 scored checks each + application note · simulator (4 scenarios × 3 stages, consequence-scored) · best-run persistence |
| `#/scripts` | 8 parameterized, live-assembled, guardrailed scripts · explicit PIP/separation refusal card |
| `#/self` | 13-artifact readiness checklist (auto-detects) · load + time-mix · energy telemetry (leading indicator below 45) · TKI mirror · catch-me-up · first-90 plan by actual start date |
| `#/data` | 18-class executable audit · safe repair · export/import with deterministic id re-mint + post-import audit · prune · example org load/erase · all counts printed live |
| `#/about` | The doctrine — what the machine owns, what you own, what it refuses |

## Mentor rule set — 59, verified by count

The audit asserts `RULES.length ≥ 50` at runtime (actual: 59); the Data page prints the live count. Three rules are locked (unsnoozable). Three are positive signals. Everything between is rank-ordered by severity. Dated snoozing only; snooze keys are rule ids, pruned when expired.

## Model library — 33 pure scoring functions

All in `FW`: no I/O, no mutation. Score shapes are unit-asserted implicitly by the audit's count classes (models-count). Highlights: flight risk with weighted driver ledger, direction-aware KR scoring, Edmondson reverse-scoring, coach/AAR/BATNA quality, meeting cost+verdict, SLII mismatch, commitment debt, case pressure, energy blend.

## Storage reality (stated plainly, in the UI too)

* ~5 MB cap, synchronous, **not encrypted**, single device, single browser profile.
* Cleared if you clear site data. No sync, no recovery.
* Contains notes about named individuals that may be disclosable in a grievance process — **write every note as if read aloud in that room.**
* Failed writes surface in the top bar, never silently (`saved HH:MM` → red `WRITE FAILED`).
* **Export weekly** (Data → Export JSON); the `export-overdue` advisory nags past 14 days.
* Imports are v5-only: wrong shapes fail loudly without touching state; duplicate ids are deterministically re-minted; an audit runs automatically post-import.

## Shortcuts

| Key | Action |
|---|---|
| `/` or Ctrl/Cmd-K | Command palette — people, cases, modules, actions |
| `C` | Register a case (live classification + propagation preview) |
| `1`–`9` | today · inbox · cases · people · 1:1s · feedback · coach · decisions · academy |
| `0` | Weekly review |
| `Esc` | Close modal |

## Files

| File | Role |
|---|---|
| `index.html` | The entire application (shell, design system, store, models, content, engine, mentor, views, integrity, seed, boot) |
| `README.md` | This file |
| `AI-SESSION-LOG.md` | Session-5 engineering record: critique, positions, changelog, QA, watchlist |

First boot builds an **example org through the production engine** — two teams, six people, four live cases with full propagation (armed mediation at stage 3, SLA-breached underperformance, departure-risk with rotting decision gate, closed crisis with unpaid AAR), an overdue delegation checkpoint, a stalled candidate, a neglected manage-closely stakeholder, one rotting negotiation and one floorless one, a meeting factory, three days of low energy telemetry — so every module and roughly twenty advisories are alive on first paint. Set yourself in `#/self`, then erase the example in `#/data` when your real org arrives.

## Honesty ledger (claims vs code)

* **Counts in this README are grepped against the build, and re-counted live on `#/data`.** 59 rules · 33 models · 27 renderers (24 routes + 3 workspaces) · 15 case types · 14 wire kinds · 8 scripts · 12 lessons · 4 scenarios · 18 audit classes. If prose and code ever disagree, the Data page is the authority.
* **v4 file (261 KB) was not diffed; it was specified by its own README and rebuilt.** Lost details are called out in the session log rather than pretended portable. Known v4 absorptions: Tuckman override, KR versioning detail, estimated-pulse annotations (partial — flight risk carries “estimated until pulsed” copy), and the fine-grained time-mix percentages.
* **Import rewiring** between collections is string-based and O(refs²) worst-case — bounded by the ~5 MB store, deterministic, and audit-guarded post-import. Known and accepted.
* **Known limits held open:** dates are ISO-day strings (no timezone nuance); pressure is case-derived, not calendar-derived; nine-box staleness is view-time; the crisis SLA clock advisory is intentionally loud; the nine-box board buckets at exact stamps, not bands.
