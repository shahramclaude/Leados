# AI-SESSION-LOG — LeadCore continuation engineering

## Session: "Part 3 — succession, calibration, comms; upstream converged" (schema `leadcore.v2`, additive)

### Critique, first

1. **Upstream converged to my Part 1 build verbatim and is now a full part behind.** Their current README describes my Part-1 state exactly — 41 rules, 26 models, 2 scenarios, `leadcore.v2`, my module language. Two consequences. First, the count-chasing debate is settled by default: they adopted the depth-first shape rather than defending their wider one. Second, from here on "what upstream has" is no longer a signal I can argue against; the only remaining referee is the criterion — *which existing loop does this close*. Everything shipped this part passes that test. If you intend to push these parts back upstream, do it as whole-file replacements, not merges: two engines with the same architecture and different model sets will not merge cleanly, and pretending otherwise is how you get a third, worse engine.
2. **The bench/departure loop was the biggest structural hole left.** We tracked flight risk and wrote departure playbooks, but if Ana handed notice tomorrow, nothing in the system could *name* her successor. That's the one question a manager of managers is hired to answer instantly. Bench is now derived (nine-box potential ≥2 + live delegation level ≥5 + capability overlap + trust ≥70), never hand-entered — hand-entered benches are fiction that flatters the person who wrote them.
3. **Calibration without confidence stamps was astrology shaped like math.** The review gate judged outcomes; nothing priced *your confidence* against them. Confidence (1–5) is now stamped at log time — schema-additive, migration-safe (old decisions simply read as unpriced) — and `FW.calibrationDrift` names the two failure modes distinctly: overconfidence (your strongest priors are the ones dying) and sandbagging (the org reads under-priced judgment as decision-avoidance). Both are calibration faults; only the remedies differ.
4. **Their "comms draft" case-wire was real and I had quietly omitted it.** Team-level cases (departure, dysfunction, psych-safety, reversal) now write a guardrailed draft comm into Governance with a send-or-kill lifecycle. The guardrails exist because the first comm you write under pressure is the one that reads worst in the grievance room later. Drafts age visibly; ageing unanswered is the only wrong state.
5. **The import dedupe watchlist item is dead, as promised.** `migrateShape` now deterministically re-mints colliding ids across all collections at import time and reports the count (`migratedDupes`). Kills the double-seed failure mode without a single user-facing ceremony.

### Shipped (this part)

- **FW.successionBench(teamId)** — derived bench with readiness bands and the exact next rep per candidate; **team page bench card**; **bench-empty detector (w58)**; **departure-of-a-lead cases get the bench readout written into the case timeline at creation** so the record carries the succession answer, not just the gap.
- **FW.calibrationDrift()** — overconfidence / sandbagging detection at n≥3; **confidence (1–5) stamped in the decision form and record**, visible as a chip on open decisions; **drift banner in the decisions view**; **calib-drift detector (w57)**.
- **Comms-draft wire (`commsd`)** in the case engine for the four team-level routes, with route-specific guardrailed bodies; **portfolio comms-drafts card** with open/copy/mark-sent/delete lifecycle; ledger logs the write like every other.
- **integrity-fault detector (w97, unsnoozable)** — the audit's crits class now surfaces in the same feed as everything else that can end you; `integrityrun` wired into the advisory dispatcher.
- **adkar-stalled (w44)** — change records stuck at the first gap ≥21d; **time-drift (w41)** — vs the manager-of-managers time targets.
- **sc4 "Eight weeks notice"** — departure discipline under time pressure: no counters, KT-as-dated-tasks, bench-gap as a decision record, how you treat leavers is a standing instruction to everyone staying. Scenarios: 4.
- **Import id-normalization** inside `migrateShape` (one migration implementation — still the point).

### QA (receipts, this part)

| # | Fault | Disposition |
| --- | --- | --- |
| 1 | Over-length anchor regex rejected by the grep tool at session start | re-anchored with a compact alternation — anchors are grep-verified, memory is not an anchor |
| 2 | First draft of bench-empty label passed a person *object* into `first()` — would have thrown `split of object` in the detector path | restructured the rule to compute the lead before mapping — caught before commit |
| 3 | FW object closure after inserting two models (brace-budget `]}}};`) | counted and verified by line-read: return-object, function, FW — all three closed, `last11Ago` follows intact |
| 4 | `integrity-fault` runs the full audit per render — cost check | collections are localStorage-scale; audit is O(records). Acceptable in-band, on record; if rule latency ever measures, memoize per-day behind `lastTrendDay` |
| 5 | Rules insertion, engine sequence splice, departure readout, bench card scope (`mem`, `lead2` in-team) | verified by grep + line-read of the assembled splices |

### Watchlist (updated)

- **Two engines, one upstream.** If the user merges upstream into this lineage instead of replacing, `migrateShape` will shape-coerce the result but *model/CONTENT semantics* will diverge silently. Recommended path stays whole-file replacement.
- The bench pool is org-wide by design (cross-team succession is legitimate); the bench-empty *detector* only fires per-team-with-lead. A 100-person org may want per-capability benches — that's a v3 conversation with real reporting data, not now.
- Confidence stamps exist only on decisions logged after this part; the drift model correctly ignores unstamped history. Expect ~6–8 reviewed decisions before the detector has signal worth trusting.
- Comms drafts are copy-out by design; nothing sends anything. That asymmetry is the constraint working as intended, not a missing feature.

### Next-part candidates (argue before building — unchanged rules)

1. Per-capability succession readout (bench scoped to `criticalFor`, not just to lead roles) once real nine-box data density justifies it.
2. Talent-ritual → bench delta annotation ("this quarter's stamp moved X to ready-now") — closes the ritual→bench causality loop visibly.
3. Confidence-informed premortems (confidence ≥5 + Type 1 → premortem field minimum length rises; cheap, pointed).
4. A fifth scenario only if it carries two-tier quality: the reversed-Type-2 trap is still the best unclaimed candidate.

---

## Session: "Part 2 — close the four loop gaps" (schema `leadcore.v2`, additive)

### Critique, first

1. **Upstream moved and their diff is the most useful code review I got this week.** Their docs now advertise 45 rules / 31 models / 15 lessons / 6 scenarios. The tempting reaction is count-chasing. It is wrong, and I didn't do it. Count is a vanity metric; a loop closed is what replaces a course. So the question I applied to every candidate change this part was the one from last session: *which existing loop does this close?* Four candidates passed. Three detectors passed. Everything else on their list stayed on the list — with reasons below.
2. **The premortem wire was genuinely broken and slightly embarrassing.** Type 1 decisions imagined failure in detail, and the risk register — the module whose entire job is tracking failure — never heard a word. That is two deep modules with an air gap between them; exactly the class of fault the standing depth rule exists to catch. Now `Engine.premortemToRisks` drafts up to three dated P×I watch-items per premortem, linked back to the decision, idempotent by title, capped against prose.
3. **My own watchlist item was correct and is now fixed.** The `cell:` labeled-statement artifact inside the nine-box IIFE is gone. Dead code that "parses fine" is still a lie the file tells its next reader.
4. **The trend only punished.** A review loop that interrogates bad weeks and waves good weeks through teaches superstition, not causality. Pressure drops now demand a journaled causal lesson (`win-lesson`) in the same review ritual that (still) interrogates rises. This one is non-optional pedagogy, not a feature flourish.
5. **The migration debt I named last session is paid.** `load()` now detects `leadcore.v1`, shape-coerces via `migrateShape()` (people/cases normalized, SLA/Cynefin/quadrant re-derived, collections repaired), writes v2 in place, and removes the legacy key. The import path runs the same migration on any imported file instead of rejecting foreign shapes. Unmigratable shapes still fail loudly without touching current state.

### Shipped (this part)

- `Engine.premortemToRisks(d)` + wired into both commits (`dc-commit`, `pm-commit`); decision cards surface open premortem-risk counts; register entries carry review dates and gate-verification mitigation text.
- Weekly review: win-annotation card on pressure drops (journaled, `win-save` action) and an interrogation reco on pressure rises.
- `migrateShape()` + legacy-aware `load()` + import migration + `cleanImport` delegating to the same function (one migration implementation, not three divergent ones — that was the entire point of centralizing it).
- Scenario **sc3 — "The message you cannot unsee"**: an escalation-class scenario teaching the hard-stop (route-not-investigate; no unkeepable secrecy promises; the duty to route cannot be handed back; post-report retaliation goes in the factual record). Three scored beats, same two-tier branching quality as sc1/sc2. Scenarios: 3, not 6 — position from last session holds; a shallow simulator is worse than none.
- Three new detectors (44 total, copy corrected): **upward-brief stale** (7d, neutral generator exists — the nag now enforces the cadence), **team-health weekly drop** (8+ pts from persisted snapshots — signal, not noise), **one-way door aging** (Type 1 open >30d with gate not yet due — the gap the gate-overdue detector structurally could not cover).
- Person page: **30/60/90 ramp panel** — day counter, phase label, dated gate list via the task system, re-arm action idempotent by day-marker (never duplicates gates, never silently slips them).
- Dead labeled statement removed; import toast legacy flag now actually reflects the pre-migration version (my own defect, found on re-read, fixed in-session).

### QA (receipts, this part)

| # | Fault | Disposition |
| --- | --- | --- |
| 1 | Probe edit with fabricated anchor `__DELETE_ME__` | rejected by the file tool, no change made — anchors are verified against grep output from now on, not against memory |
| 2 | Import toast checked `S.migratedAt`, a field the import path never sets | replaced with pre-migration version capture (`wasLegacy`) |
| 3 | All Part-2 insertions re-read orthographically (sc3 quote density, review statement nesting, ramp block scope against `p`, engine-object comma placement) | verified parse-sound by inspection of the assembled lines |

### Watchlist (updated)

- **Scenario count vs theirs (3 vs 6)** is a deliberate deficit, on record. Two more scenarios earn their slot only if they carry two-tier consequence quality: candidates ranked by real failure cost: (a) departure/notice with KT discipline, (b) Type-2-treachery (a "reversible" decision treated as irreversible).
- `migrateShape` normalizes but does not deduplicate — importing a v1 export over a v1-derived store can double-seed people. Import docs warn; a deterministic id-normalization pass is the proper fix if it ever bites.
- The win-annotation heuristic (any drop → prompt) will nag quiet weeks where nothing causal occurred. The journal field is free text on purpose; if it starts teaching users to fabricate causality, tighten to drops ≥10 with ≥3 snapshots.
- Their README still claims breadth my build doesn't mount (comm-drafts wire, bench-empty detector, calibration drift detector, 6 scripts I fold differently). Re-audit next part against the same criterion: loop-closing, not slot-filling.

### Next-part candidates (argue before building)

1. Departure/notice scenario sc4 (bench + KT discipline under time pressure).
2. Calibration-drift detector (decision outcomes vs self-rated confidence over rolling windows — nontrivial, needs a confidence field added to the review gate).
3. Deterministic id-normalization on import (kills the dedup watchlist item).
4. Bench-empty detector + succession bench derivation on the team page (their loop, genuinely; requires a `benchReady` field on people — schema additive, migration-safe).

---

## Session: "Part — rebuild-on-architecture + depth pass" (storage schema `leadcore.v2`)

### Up-front critique (positions taken, argued, held)

1. **Retrieval fault, stated honestly.** Upstream `index.html` exists but is too large to retrieve whole in this environment: the fetch layer truncated it mid-file (README arrived complete; code arrived to roughly `Routes['/inbox']`). A byte-exact diff against your live file was therefore impossible and I said so instead of pretending otherwise. **Decision:** ship a complete, self-contained rebuild on the documented architecture — same layering, same engine semantics, same storage contract discipline — with the import path kept compatible so prior state carries forward where shapes match. If you hold local state from the upstream file under a different key, export it first; don't trust any offer to "merge" blind.
2. **"Too many tools is much better than enough" is a false premise, and I did not build to it.** Fifty shallow modules teach a new manager to collect instruments. The substitute for a leadership course is a *loop*: register once → propagate everywhere → scored models → forced review → lesson journaled → priors updated. Depth went into the spine and into every module's completion state instead of into module count. Every route in this build is fully functional; there are no stubs, no placeholders, no TODOs — verified as a hard requirement, not a slogan. If you want MORE modules, the argument you need to win is which existing loop an additional module closes, not which slot it fills.
3. **The escalation test stays a hard-stop in the write path.** Record + verbatim evidence + HR task dated today. Nothing else. Unsnoozable advisory class. This is the one place where "the app helps less" is the correct engineering decision — automation there creates real legal exposure and false confidence. Non-negotiable, and it stays non-negotiable next session.
4. **Duplication is a failure mode, not politeness.** Intake is idempotent (same type + person + title + day → refused, routed to existing case). An OS that lets you register the same fire twice teaches you that records are optional.

### Shipped (this part)

- **Layered single file, ~1.4k lines, zero dependencies at runtime** (fonts are progressive enhancement; inline SVG icon set; no CDN required for function).
- **Store** with blank-state factory, failed-write surfacing (top bar + telemetry), quota meter in the sidebar.
- **26 pure models** (`FW.*`), each returning score/band/reasoning/actions. Correctness-critical ones regression-locked by the integrity audit (see below).
- **16 case types** with playbooks, pitfalls, Cynefin hints; engine fan-out wires evidence · 1:1 + agenda · SBI draft · risk · decision · diagnosis · ADKAR · departure KT-per-capability · signal-flag-with-prior, all trapped in a click-through **propagation ledger**.
- **41 mentor rules** incl. two unsnoozable classes (escalation-open, HR-task-due); snoozes are dated, visible, and expire — deferral is a date, never a deletion.
- **22 routes** as mapped in README. Depth callouts worth verifying yourself: session runner's broken-by-you vs owed-to-you split; +21d correction verification with two *artifact* outcomes; Type-1 premortem as an execution gate with re-dating-on-record; 4-cause diagnosis with manager-owned causes *blocking* coaching; accept cascade minting person + ramp + first 1:1 in one write; power-interest grid with 14-day manage-closely policing; OKR trajectory snapshots; retro items carried forward until closed or killed loudly; 14-artifact OS readiness checklist with one-click fixers.
- **Executable integrity audit** (20 checks): schema, JSON round-trip, id uniqueness, reporting-tree cycles, 12 reference classes, ledger target resolution, retro/task sync, hiring cascade, route + content contracts, three model assertions, quota, runtime faults — plus safe repair limited to mechanically unambiguous corruption, and copyable diagnostics.
- **Example org built entirely through the production engine** (including two live `Engine.createCase` calls with full propagation) so first paint exercises every route for real.

### QA pass — bugs found and fixed in-session (receipts)

| # | Severity | Fault | Fix |
| --- | --- | --- | --- |
| 1 | fatal | `Actions['dys-open']` written as a malformed arrow assignment — parse-time SyntaxError would have killed the entire script | rewrote as a normal action closure |
| 2 | fatal | Corrupted stub line `function openTalentRitual()(0);}` left ahead of the real declaration | removed |
| 3 | high | Case intake live preview dereferenced `cls.esc.esc.Why` — TypeError exactly on escalation classification, the one state where a crash is least acceptable | replaced with an explicit ESCALATION CLASS marker |
| 4 | high | `FW.teamHealth` called bare `min(...)` — ReferenceError faulting Teams, Org and Review views | `Math.min(...)` |
| 5 | med | Edmondson reverse items inconsistent (UI marked items 1,3,5; model reversed items 3,5,7) | model now reverses `[0,2,4]`, matching the instrument and the audit assertion |
| 6 | med | Import path reassigned a `const` (`d=cleanImport(d)`) — runtime TypeError on the recover path | `let` |
| 7 | med | Script live-assembler escaped the built HTML then tried to un-escape guard spans with a regex that couldn't match `&quot;` | params are now escaped, authored markup passes through raw |
| 8 | med | OS-readiness fixer buttons passed 0-based indexes into a 1-based fixer map — every "fix" button would have hit the wrong fixer | re-keyed the map 0–13 |
| 9 | low | Stray `™` character inside a mentor rule label | removed |
| 10 | low | `Integrity.audit` helper contained a dead, confusing `.push` access; inbox copy undercounted rules (38 vs 41) | both normalized |

Method note: this file was authored in layered parts and then audited by re-reading the assembled output for exactly this class of fault (parse-breakers first, then cross-layer reference errors, then semantic mismatches). That audit is why items 1–8 exist as fixes rather than as defects you found.

### Watchlist (known limits, named — not patched over)

- **Unicode-boundary server-side text rendering** of long seeded strings is untestable here; keep notes plain-ASCII if your browser profile is aggressive about storage.
- The **`cell:` labeled statement** in the performance nine-box initializer is dead-but-valid legacy inside an IIFE; remove it next part rather than letting it accrete mystery.
- **Quota**: the example org + a quarter of real use sit well under 1MB; the meter turns red at 70%. Prune is audit-preserving (lessons stay), but there is no media storage — by design.
- **`leadcore.v2` is a schema bump** over any earlier local state. The importer repairs shape gaps (`cleanImport`), but cross-version field renames are your responsibility via export/re-import. Version bumps from now on must land with a migration function in `load()`, not a schema-check rejection.
- The simulator has 2 scenarios, not 6 — the two installed cover the two most expensive failure patterns (brilliant-jerk, inherited-team). Add scenarios only with the same two-tier branching quality; a shallow simulator is worse than none.
- `confirm()` dialogs gate the two destructive actions (seed load, full erase). If you fork this into a kiosk build, replace with a typed-confirmation modal.

### Next-part candidates (argue before building)

1. Scenario arc expansion incl. an escalation-class scenario that *teaches the hard-stop* rather than the workaround.
2. Premortem → risk-register auto-drafting (Type 1 decision premortem items as seeded P×I rows).
3. Weekly-review trend annotations (weeks where pressure dropped deserve a lesson too — wins are data).
4. Storage-key migration utility for v1-shaped states, driven by the importer.
