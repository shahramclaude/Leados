# LeadOS — Leadership Operating System · v11.0 (Session-11 build)

An offline-first operating system for a leader **of team leads** — especially a new one. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step, **no network dependency at all** (icons are inlined; it runs from a double-clicked file). The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v6`, record version `v:6`) in one browser profile. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install.

---

## What this is, and what it refuses to be

It is **not an oracle**. "Sit back and trust the app 100%" is refused here, as in every build — confidence delegated wholesale produces a compliant operator who collapses the first time reality deviates from script. Trust here is **auditability**: every count in this README is printed live from code on `#/about`, the telemetry probe executes on every audit run, and every recommendation shows its basis. The machine never fakes certainty — estimates are ≈-chipped, gate signals are labeled hints, calibration reports its own sample size.

| The app owns | You own |
|---|---|
| Detection (**rules, live-counted**), scoring (**pure FW models, live-counted**), sequencing, record-keeping, cadence, pace, escalation timing | The judgment call |
| Forcing decisions/outcomes/gates/closures to be recorded with rationale and a review date | Living with the outcome |
| The review loop that turns experience into skill — the actual course substitute | Reading the loop honestly |
| Escalation timing (hard-stops to HR) | The humanity of that room |

**The hard-stop stands.** Case intake keyword-scans every registration (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation). A hit re-classifies the case to an HR escalation **before commit**, names the trip-words live in the preview, and requires two deliberate acknowledgments. On commit the machine writes exactly three things: the case record, the verbatim evidence, and an unsnoozable HR contact task dated today. Audit class `ethics-wires` fails loudly if an ethics case ever carries any wire outside its sealed set, and its safe-repair revokes the wire *records*, not just ledger lines. PIP and separation scripts do not exist anywhere in the codebase, and never will. The mediation protocol halts in one write into an HR escalation the moment protected-class content surfaces. Three advisory classes cannot be snoozed: **escalation-open · HR-task-due · integrity-fault**.

## New in Session 11 — the operating cadence, and what the repo could and could not prove

Session 10 shipped the capture layer and the single answer. Session 11 closes the two gaps that actually sink a new leader-of-leads:

* **`#/ritual` — the weekly staff ritual, first-class.** A leader-of-leads fails by leads drifting out of sync while the dashboard looks fine, not by bad 1:1s. The ritual's agenda is **computed from live state**, not templated: per-lead one-liners ranked by severity and flight heat (span included); cross-team items (rotting decisions, unpaid tuition, critical pulse dimensions, red goals); and a rotating **development slot** built from the lesson of an unstudied closed case — leads learn from cases, not courses. Stamping the ritual writes real records: attendance, commitments parsed from the room (`@name · what · YYYY-MM-DD`) into the debt ledger, an optional ratified decision on the record, and marks the development case as studied. Rule `ritual-overdue` fires at 8 silent days; transition gate `g9` only counts a cadence once three rituals are stamped.
* **The meeting kill list.** A new multi-team leader inherits ~15h/wk of meetings and zero instruments for it (no calendar APIs exist here, permanently). Recurring meetings are logged once — minutes × **attendees**, so org person-hours are visible — and each then owes a verdict: **keep** (it argued for its seat), **fix** (shorter/async/fewer, on the record), or **kill** — which writes a decided decision so the meeting stays dead. Rules `meet-load` (12h/wk of *your* calendar) and `meet-kill-pending` (unverdicted meetings are immortal by default) feed it; the pace governor consumes meeting load directly.
* **Corrupted-storage recovery, first-class.** Parse failure preserves the raw bytes at a separate `leados.v6.corrupt-*` key, leaves the main key untouched (recovery is a decision, not a boot side-effect), and offers download-the-damaged-copy / start-clean / import. Newer-version records get the same path instead of a silent downgrade. Earlier-version records migrate additively (v1–v5 → v6, field defaults only) and say so in the system log.

**Session-11 reconstruction disclosure, stated once and plainly:** the upstream v10 file (281,693 bytes) could not pass whole through this tooling window — the same wall Sessions 7–10 logged, verified again this session (~41.7k tokens of the middle uncapturable; the GitHub blob page is a JS-only shell). **Verified by direct read:** the design system, `U`, `FW` models 1–8, the import pipeline, the entire seed, and the boot sequence — the seed matches the v10 README's narrative 1:1. **Unverified (labeled):** the v10 rule array, renderers, engine write-paths, and audit implementations, which this build re-derives against the contract. Everything in this repo is what *this* build does; `#/about` remains the live authority. Upstream's verified seed is reproduced faithfully (two copy typos fixed), extended with three meetings so the kill list is alive on first paint.

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), palette, any person page, or `C`. The intake shows a live pre-commit preview: Cynefin domain with move hint · Eisenhower quadrant · severity SLA runway · keyword reclassification with trip-words named · the **exact list of writes** · duplicate refusal · the lesson journaled at the last closed case of the same type. The engine then:

1. Selects the type's dated playbook (1–3 tasks) into the task stream.
2. Writes real, linked records into every routed module — evidence, 1:1 agenda injection, SBI draft, decision stub, team note, goal at-risk flag, comms draft (sev≥4 crisis), HR hard-stop, closure verification, AAR arming, **cascade to the owning lead**, playbook tasks — every write trapped in the case's **propagation ledger** with click-through routes.
3. **Refuses identical open duplicates** and routes you to the existing case. Audit class `dup-cases` watches it hold.
4. **Cross-links related open cases** on shared scope — two live cases on one person or team is a pattern, and a rule says so.
5. Closure is **checked, not assumed**: outcome + lesson mandatory, orphan playbook tasks cancelled with a count, goal flags cleared by the closure that owns them, lesson journaled, +30d verification armed (held, or re-open — re-open restarts the SLA clock, on the record), AAR armed for sev ≥ 4, `tuition-unpaid` holds until the AAR exists.
6. A correction whose +21d verification lapses past the 7-day grace **auto-opens a feedback-breakdown case** (boot sweep, idempotent via `lapsedCaseId`, toast-announced) — the machine's arm, on the record.

## Module map — routes (detail views: `case/:id`, `person/:id`)

| Route | Depth |
|---|---|
| #/today | Pace governor (now meeting-load-aware) · **Next Best Move** with its ranking stated · engine-ranked stack · quick capture (fixed bar) · conduits due · commitment debt both directions, yours ranked higher · 7-day strip · positive signals |
| #/signal | Full rule ledger with per-rule state (firing / dated snooze / clear) · locked lane · positive lane · severity order |
| #/ritual | **New** — computed staff agenda, stamp-the-room writer (attendance, parsed commitments ≥ dated ledger entries, ratified decision), ritual history, meeting kill list with person-hour cost and keep/fix/kill verdicts |
| #/cases · #/case/:id | 11 types · SLA runway bars · playbooks · failure modes inline · propagation ledger · cross-links · comms drawer · checked closure · verify / re-open |
| #/org | Lead rollup cards (span pressure, flight board, cascade notes) · team pulse with the fallback *stated on the card* · bench per lead (READY NOW / READY IN 6M / GAP with reason ledger) · bus-factor exposure |
| #/people · #/person/:id | Flight risk (weighted driver ledger + intervention for the top driver) · trust equation + weakest-numerator fix · nine-box with 120d expiry (staleness halves the bench stamp) · evidence ledger with case backlinks · morale telemetry with ≈ estimate chips · ramp gates · auto-agenda · bench read |
| #/oneonones | Cadence board (HIGH flight risk auto-compresses to 7d) · auto-agenda consumed on finish · skip-level calibration lane · est-flagged pulse honesty on close |
| #/feedback | SBI/AID/COIN composer + live lint (deliver blocked under 2/3) · ageing clocks (praise 48h / corrections 72h) · delivered → +21d verification · lapsed → machine arm · balance board (60–85% zone) |
| #/coach | GROW runner · live quality score · question bank · arc history |
| #/delegation | SLII skill×will → style + suggested rung · mismatch warnings **both directions** (over drowns them, under caps the bench) · mandatory boundary + checkpoint · verdicts feed the bench; bounced → re-contract task |
| #/mediation | Six stages, order enforced · stages 2 & 5 gated on written notes · halt-to-HR in one write · agreement files evidence to **both** parties + +14d follow-up |
| #/transition | 90-day protocol · 12 evidence-gated gates (machine signal LIVE/PENDING + mandatory note; closing against PENDING is allowed and visible) · stakeholder map (influence × stance, hostile-first rule) · tour logging · win ledger |
| #/goals | Direction-aware KR scoring · check-ins with confidence (leading indicator) · trajectory sparks · expired goals graded with a mandatory **causal** lesson ("because…" enforced) |
| #/decisions | Type-1/2 doors · premortem ≥3 enforced at the form and re-checked by audit · re-date requires a recorded reason (history rendered) · outcome grading → calibration with sample-size honesty |
| #/health | Fortnight 6-dimension pulse with deltas + team scoping · Edmondson 7-item scan (reverse-scored 2/4/6) · five-dysfunctions sequential ladder (advances only on written evidence) · bus-factor capability map |
| #/aar | Tuition-unpaid lane · expected-vs-happened **numbers** · 5-whys · blameless stop · improvements become owned, dated commitments the engine chases · live quality score |
| #/review | Auto 7d digest · 8-week pressure series · 60-second upward brief (brackets are yours) · stamped ritual · lesson journal |
| #/academy | 6 lessons in 4 arcs × 3 scored checks + mandatory application note (journaled) · the refusal card |
| #/about | The judgment contract · the refusals · **live counts** · storage reality · shortcuts · capture grammar |
| #/data | Identity (drives the 90-day clock) · storage meter · **15 executable audit classes** with safe-repair only where mechanically unambiguous · export/import (v:6-only; merge re-mints ids + rewires the graph + post-import audit) · prune with counts · example-org load/erase · system log |

## Mentor rule set

Rules fire across 15+ categories; the count on `#/about` is `RULES.length`, live. 3 locked unsnoozable · a positive lane (`cadence-green · praise-flow · autonomy-trend · win-banked`) by doctrine — a detection-only mentor trains a risk-averse operator. `comm-debt-you` outranks `comm-debt-them` — a mentor that only audits downward trains its user to audit downward. Snooze is **dated** (3d/7d), never amnesia. Every rule's clear-condition is computable: an advisory that cannot clear does not ship.

## Model library (FW)

All pure: no I/O, no mutation, every one consumed by a view, rule, or audit. Flight risk · direction-aware KR + current · confidence slope · goal status · Edmondson reverse-scoring · SLII · rung-mismatch check · GROW quality · AAR quality · SBI/AID/COIN lint · trust equation + band + fix · feedback balance · decision calibration · Cynefin · Eisenhower · health composite · bus risk · load pressure · case SLA · nine-box + expiry · estimated-aware mood slope · dysfunctions sequencer · commitment debt · pace governor (meeting-aware) · org rollup · team pulse with stated fallback · bench score · team bench · transition score · pressure series · meeting cost · ritual agenda · Next Best Move. Count is `Object.keys(FW).length`, live.

## Instrument honesty

1:1 pulse sliders are telemetry. Untouched sliders write `estimated:true`; estimates render with an `≈` chip, never move a slope, never trigger or clear an advisory. Audit class `telemetry-honest` **executes a probe** — runs `FW.moodSlope` on a synthetic series with estimated entries injected and asserts equality with the same series minus them — plus runtime range and shape checks on every session's mood record.

## Storage reality (stated plainly, and in the UI)

* ~5 MB cap, synchronous, **not encrypted**, single device, single profile. Cleared with site data. No sync, no recovery. Live meter on `#/data`.
* Notes concern named individuals and may be disclosable — **write every note as if read aloud in the grievance room.** The phrase is printed on every surface that writes about a person.
* Failed writes surface in the top bar (`saved HH:MM · N KB` → red `WRITE FAILED`), never silently. Quota failures name the byte count and the remedy.
* **Export weekly**; `export-overdue` nags past 14 days. Imports are `v:6`-only; wrong shapes fail loudly without touching state.
* Corrupt state is preserved, never guessed at. Migration is additive only. Recovery is a decision, not a boot side-effect.

## Shortcuts

| Key | Action |
|---|---|
| / or Ctrl/Cmd-K | Command palette — modules, people, commands |
| C | Register a case (live pre-commit classification) |
| 1 2 3 4 | today · signal · cases · people |
| 5 6 7 8 9 0 | 1:1s · feedback · coach · decisions · AAR · review |
| Esc | close modal / palette |

Quick capture (fixed bar on `#/today`): `case: …` · `commit: @name … by +3` (they owe you) · `owe: @name …` (you owe) · `praise: @name …` · `note: @name …` · `win: …` — dates: `today · tomorrow · +Nd · next week · YYYY-MM-DD`. Unparseable → nothing written, said out loud; unknown verb → a prefilled case intake, not a silent drop.

## Files

| File | Role |
|---|---|
| index.html | The entire application |
| README.md | This file |
| AI-SESSION-LOG.md | Session-11 engineering record: verification ledger (what was read vs. unverifiable), critique, positions held, QA ledger, defect ledger, honesty ledger |

First boot builds the **example org with the same field contracts the write paths produce** — two leads (Mara: Priya + Jonas; Tomás: Leo + Aiko), five cases with full propagation ledgers (SLA-breached underperformance with cascade, cross-team conflict with a stalled mediation, closed sev-5 crisis with tuition unpaid and +30d verify armed, stalled goal with the flag wired both ways, active ramp), an overdue delegation checkpoint, a live over-delegation, a rotting decision stubbed from the crisis, stale and expired goals, a slipping org pulse with two critical dimensions, ageing feedback drafts, a lapsed correction inside its 7-day grace, commitment debt in both directions, three logged meetings (one kept, two unverdicted), no ritual stamped yet, and a day-24 transition with a hostile VP still unheard. The pace governor reads hot on first paint by design — every instrument is visibly live. Set yourself (`#/data` → identity), then erase the example when your real org arrives.

## Honesty ledger (claims vs code)

* **Every count resolves to a live computation** on `#/about`. Where README prose names a number, the page wins.
* **Session 11 is a reconstruction-continuation.** What was verified by reading vs. re-derived against the contract is itemized in the session log, not smoothed over. The historical `leados.v6` store contract is kept deliberately: real v6 stores load with additive boot guards — no silent migration, no destructive rewrite.
* **The seed is tense on purpose.** The exact advisory count on first paint is whatever Signal prints; the tension lives in rules (advisories), not in broken records (audits). That distinction is the difference between a realistic org and a corrupted one.
* **Known limits held open:** ISO-day strings, no timezone nuance · pressure is case- and meeting-derived, not calendar-integrated (impossible under the constraints — the kill list is the local answer) · nine-box staleness is view-time, not destructive · org rollup attributes org-wide pulse to a team when no team-scoped pulse exists (stated on the card) · import-merge is append-only beyond id re-minting · gate signals compute from app state only — the machine cannot verify what happened in a room, which is exactly why the note is mandatory · capture person parsing matches first names; collisions resolve to the first match, audibly.
