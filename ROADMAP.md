# ROADMAP

Living document. Status is per capability, not per file. Every "Done" line was verified
by an automated test or a measured run in the session that claimed it; anything else is
marked `[UNVERIFIED]` and is not counted as done.

Last updated: 2026-10-25 (session 15: Schema v11 — Today's actionable development-review queue, succession-to-transition handoff with optional readiness stretch notes, return-to-work (`reboarding`) 30-60-90 plans without medical/leave-reason storage, 15th `readiness` CSV scope, and 5 audited UI/domain bug fixes shipped; 289 automated tests across 21 suites).

---

## Done — and verified this session

| Capability | Where | Verified by |
|---|---|---|
| Zero-build app that boots and routes | `index.html`, `app/main.js` | `tests/app/app.test.mjs` (boot, all routes, unknown route) |
| Versioned store, migrations, quarantine on corruption | `app/core/store.js`, `app/core/schema.js` | core tests; corrupt-blob integration test |
| Append-oriented event log with cap | `core/store.js` | integration test (audit event written on each action) |
| Person roster: add, validate, XSS-safe, archive/restore | `views/people.js`, `actions.js` | integration tests (validation, `<script>` in a name rendered as text) |
| 1:1 logging incl. moved/skipped as signals | `domain/oneonone.js` | domain + integration tests |
| Agenda generated from the record, with reasons | `domain/oneonone.js` `suggestAgenda` | domain test + person-page test |
| SBI feedback with live quality coaching | `domain/feedback.js` | integration test (quality meter, rejection of empty behaviour) |
| Feedback balance and follow-ups | `domain/feedback.js` | domain tests, rules `FB-03`–`FB-05` |
| Observation-to-conversation feedback latency with unknown excluded and editable dates | `domain/feedback.js`, `views/feedback.js`, `ui/modals.js` | pure date-pair tests, `FB-06`, real-dialog capture/correction and latency-filter tests |
| Goals with computed progress, pace and check-ins | `domain/goals.js` | integration test (check-in moves progress) |
| Tri-state goal co-authorship and explicit `GOAL-06` | `domain/goals.js`, `domain/insights.js`, `ui/modals.js` | migration/action/signal tests; edit preserves goal id, key results and history |
| Outcome delegation with owner, authority, support, due date, check-ins, completion and return-to-leader | `domain/delegations.js`, `views/delegations.js`, `actions.js` | pure health tests; validated action/reload/audit tests; real-dialog create → blocked check-in → edit → complete flow |
| Delegation follow-through in Signals, 1:1 agendas, person pages and review evidence | `domain/insights.js`, `domain/oneonone.js`, `domain/reviews.js` | `DEL-01`…`DEL-03`, agenda reason, dated outcome valence and focused source-route tests |
| Goal with no key results reported as unmeasured | `domain/goals.js` | integration test `KR-less goal` |
| GROW plans scored stage by stage | `domain/growth.js` | domain tests |
| Competency coverage | `domain/growth.js` | growth view render test |
| Evidence-gated succession readiness | `domain/readiness.js` | integration test (unsupported "ready now" flagged) |
| Pulse reporting floor (default 5, supported minimum 3), same complete cohort for means/trends, whole-vector unanimous suppression and independent comment floor | `domain/pulse.js`, `core/schema.js`, `ui/modals.js` | domain + integration tests; 10 pulse-safety regressions; this is not an anonymity guarantee |
| Pulse windows on calendar days (no double-counting) | `domain/pulse.js` | domain test on window boundaries |
| Decision log (DACI, reversibility, options, rationale, review) | `domain/decisions.js` | integration test (log → decide → review) |
| Recognition ledger + drought detection | `domain/insights.js` `REC-01` | view + insights tests |
| 46 named signal rules with severity, evidence, one action (including count-only `CFL-01`…`CFL-04`) | `domain/insights.js` | domain tests (determinism, shape, urgency), including `FB-06`, `GOAL-06`, `DEL-01`…`DEL-03`, `CONV-06`, `CONV-07`, `GROW-06`, `GROW-07` |
| Repetition collapsed above 3 people, names preserved | `domain/insights.js` `rollUpFindings` | domain + integration tests (24-person roster) |
| Today: health, next actions, due 1:1s, pulse prompt | `views/today.js` | full-demo render test |
| Health score: 5 dimensions, null-safe weighting, approximate historical comparison | `domain/health.js` | domain tests + demo baseline |
| Export / import / reset / demo, with demo protection | `core/store.js`, `views/settings.js` | integration tests (round-trip, demo refusal) |
| Evidence-linked performance-review packets with self-reflection and manager assessment | `domain/reviews.js`, `views/reviews.js`, `actions.js` | domain tests + real-dialog create → reflect → assess → complete → export/import test |
| Review calibration warnings for thin/recency-skewed/one-sided evidence and unsupported ratings | `domain/reviews.js` `calibrateReview` | deterministic `CAL-01`…`CAL-07` tests; completion confirmation exposes warnings |
| Frozen completion snapshots, reopen/refresh audit history, source drill-down, print/PDF | `actions.js`, `views/reviews.js` | lifecycle tests; all six source routes incl. delegation and completed goal/plan; print-dialog wiring test |
| Schema v2 review, v3 latency/authorship/delegation, v4 conflict and v5 dated-snapshot migrations, with dynamic demo protection/cleanup | `core/schema.js`, `core/store.js`, `actions.js` | additive v1→v2→v3→v4→v5 migration, null preservation for pre-v5 records, reload/import and real/demo preservation tests |
| Key-result dialog targets its source goal; development-plan edit preserves the plan | `ui/modals.js`, `actions.js` | UI regression tests for both flows |
| Development overdue calculations use the injected clock | `domain/growth.js` and callers | regression test with 2019 and 2026 clocks |
| Accessibility: skip link, dialog keyboard/focus behaviour, live errors, visible disabled controls, non-color chart stroke/shape coding and HTML data tables | `ui/dom.js`, `ui/charts.js`, `ui/conflict-modals.js`, `styles.css` | jsdom keyboard + `axe-core` tests on `#/health` and `#/settings` (0 semantic/ARIA/table violations); Session 4 Chromium + axe baseline; Session 5 real-Chromium pixel contrast `[UNVERIFIED]` |
| Dialogs cannot survive a route change | `app/main.js` | integration test |
| Roster search that does not steal focus | `views/people.js` | integration test |
| Conflict listening → explicit agreement → owned results → verified follow-up → resolution, with support handoff/reopening/version history | `domain/conflicts.js`, `conflict-actions.js`, `ui/conflict-modals.js`, `views/conflicts.js` | 29 conflict tests |
| Conflict content isolated from health/talent/reviews/agendas/person timelines/routine CSVs; general reminders are counts only, including roster-free workspaces | `domain/insights.js`, `views/today.js`, `core/csv.js` | privacy regression assertions across views, timelines and all routine CSV scopes |
| Unsupported/future schemas refused on import and protected on load, original export preserved even after failed replacement; CSV export refused when `writeBlockReason` active | `core/store.js`, `actions.js`, `core/csv.js` | 5 storage-safety tests + CSV future-schema/QuotaExceeded tests |
| Static-server canonical asset allowlist, private-file/symlink/traversal denial and read-only HTTP methods | `scripts/serve.mjs` | 4 actual-HTTP server regression tests + Session 5 live HTTP module checks |
| Goal/delegation tabs use real filter keys; Settings fallback export Close works | affected views | jsdom filter checks; fallback-dialog regression |
| Longitudinal trends across all 5 health dimensions, composite health, feedback latency and delegation follow-through (8w / 12w / 6m) with survivorship-bias fix, matched-dimension deltas and `exact`/`approximate` disclosures | `domain/health.js`, `domain/trends.js`, `ui/charts.js`, `views/health.js`, `views/today.js` | `tests/app/trends.test.mjs` (survivorship bias, Simpson's/coverage-shift guard, pre-history null guard, UI switching, `axe-core`) |
| Scoped, unknown-preserving, OWASP CWE-1236 formula-safe CSV exports across 15 tables (including `readiness` and `recognition.visibility`) with pulse anonymity/comment floors and confidential conflict confirmation | `core/csv.js`, `core/store.js`, `views/settings.js` | `tests/app/csv.test.mjs` + `tests/app/execution-loops.test.mjs` (12 formula vectors incl. full-width Unicode & whitespace, negative numbers, RFC 4180 round-trip, pulse suppression, QuotaExceeded, `axe-core`) |
| Optional passphrase encryption of the browser copy: 600k-round PBKDF2 derivation, AES-256-GCM envelope with AAD-bound KDF parameters, verified plaintext→encrypted migration, lock/unlock/change passphrase/disable | `core/crypto.js`, `core/store.js`, `views/vault.js`, `ui/vault-dialogs.js` | `tests/app/encryption.test.mjs` (20 tests: no plaintext in storage, wrong-passphrase refusal, tamper/AAD, iteration-floor DoS guard, quota-failure rollback, no-crypto detection) |
| A locked workspace cannot be written to, quarantined, exported empty or reset accidentally | `core/store.js`, `views/vault.js` | encryption tests (all write paths, ciphertext byte-identity, export returns the untouched file, typed DELETE required to erase) |
| Encrypted backups and import in both directions, with the storage mode disclosed | `core/store.js`, `views/settings.js`, `ui/vault-dialogs.js` | encryption tests (restore into plain/locked/unlocked states, wrong passphrase changes nothing, downgrade message asserted) |
| Lock screen is the only thing rendered while locked, keyboard-usable and axe-clean | `views/vault.js`, `main.js`, `styles.css` | jsdom tests (no records leaked into the screen, error live region, show-passphrase toggle, `axe-core` 0 violations) |
| A stored backup envelope is refused rather than normalised into an empty workspace | `core/store.js`, `views/vault.js` | encryption tests (refused unlock, untouched file, working restore path) |
| Idle auto-lock: warn, then lock an unlocked encrypted workspace after inactivity, with a non-destructive "keep working" warning and a one-minute grace; the lock is logged to the event log | `app/core/idle.js`, `app/main.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/modals.js` | `tests/app/idle.test.mjs` (activity reset, warn → lock transitions, tab restored from background) |
| Printable 1:1 prep sheet: employee topics, generated agenda with reasons, grouped open commitments (1:1 actions, onboarding checkpoints, feedback follow-ups, development actions, delegation checkpoints), what happened since you last spoke, outcomes at risk and a notes area; confidential conflict records and anonymous pulse answers excluded by construction | `app/core/domain/prep.js`, `app/views/prep.js`, `app/main.js`, `app/views/person.js`, `app/ui/modals.js`, `app/core/schema.js`, `app/actions.js`, `app/core/demo.js` | `tests/app/prep.test.mjs` (assembly, overdue ordering, privacy regression, missing-person route on populated roster, persistence/repair, route render, print flow, axe-core) |
| Onboarding 30-60-90 milestone tracker (Schema v6): explicit role clarity, peer buddy, stakeholder introductions (`met`/`metOn`), scoped early win, 30/60/90 checkpoints, dated Day 30/60/90 check-in conversations, Day 90 completion gate, `ONB-02`…`ONB-05` signals, person-page & prep-sheet integration, and formula-safe `onboarding` CSV export | `app/core/domain/onboarding.js`, `app/views/onboarding.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/modals.js`, `app/core/domain/insights.js`, `app/core/csv.js` | `tests/app/onboarding.test.mjs` (v1→v6 migration, repair invariants, chronology & Day 90 gates, agenda/prep/timeline/CSV integration, real-dialog UI workflow, `axe-core` 0 violations) |
| Session 9 audit bug fixes: populated-roster `#/prep/<unknown>` guard, `idleLockMinutes = 0` dialog validation, measured/invalid CSV feedback latency, public recognition `shared` badge & `?person=` filter, password/search input styling, DACI CSV labels and encryption-aware storage notices | `views/prep.js`, `ui/modals.js`, `core/csv.js`, `views/recognition.js`, `views/settings.js`, `views/conflicts.js`, `views/health.js`, `styles.css` | regression assertions in `tests/app/prep.test.mjs`, `tests/app/csv.test.mjs`, `tests/app/onboarding.test.mjs` |
| 1:1 follow-through ledger (Schema v7): every open promise from an earlier meeting gets an explicit outcome — done in this conversation, still open, carried forward with a new date, or dropped with a reason; the original is linked to its successor, carry depth and "first agreed" are derived rather than stored, and a broken/backward/cyclic link reopens the promise with a warning instead of losing it | `app/core/domain/oneonone.js`, `app/core/schema.js`, `app/actions.js`, `app/core/domain/prep.js`, `app/core/csv.js` | `tests/app/reconcile.test.mjs` (v6→v7 migration, repair, cycle break, depth, atomic write, write-path rejections, historical rewind, CSV/prep parity) |
| Follow-through surfaces: reconciliation panel inside the 1:1 dialog, "Commitments that keep moving" board card, carried markers on person pages and the prep sheet, `CONV-06` at two carries, and a "promises closed in a 1:1" win | `app/ui/modals.js`, `app/views/oneonones.js`, `app/views/person.js`, `app/views/prep.js`, `app/core/domain/insights.js`, `app/styles.css` | jsdom dialog carry → close flow, person/prep render assertions, `axe-core` 0 violations on board, prep and dialog |
| Commitment ownership (Schema v8): every 1:1 action records `them` / `leader` / `shared`, or `null` when nobody said; `null` is surfaced as a gap rather than defaulted; a carried promise keeps its owner; reassignment is an audited action that refuses closed and already-carried promises; unrecognised values are cleared with a warning | `app/core/schema.js`, `app/core/domain/oneonone.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/oneonones.js` | `tests/app/ownership.test.mjs` (v7→v8 migration, write-path rejection, carry inheritance, reassignment rules, export/import persistence) |
| The leader's own half of the ledger: private "What you owe" card on Today, "I owe" stat and inline owner column on the 1:1 board, owner markers on person pages and the prep sheet, `CONV-07` per person when the leader is late (with `CONV-05` narrowed to team-owned promises so one fact is signalled once), and a truthful `owner` column in the actions export | `app/views/today.js`, `app/views/oneonones.js`, `app/views/person.js`, `app/views/prep.js`, `app/core/domain/prep.js`, `app/core/domain/insights.js`, `app/core/csv.js`, `app/styles.css` | jsdom board select (including the `is-mine` marker and the closed-promise case), Today card → Done flow, dialog capture, `axe-core` 0 violations; CSV and prep assertions |
| Development-commitment ledger (Schema v9): every GROW commitment can be closed in a review, carried forward with a new date (keeping the original as history and the first-agreed date derived from the chain), or dropped with a mandatory reason; dropped is never counted as done | `app/core/schema.js`, `app/core/domain/growth.js`, `app/actions.js` | `tests/app/growth-ledger.test.mjs` (v8→v9 migration, chain repair incl. orphan/back-reference/cycle, carry + drop validation, live-only progress, review application) |
| Development reviews as records, not date edits: dated conversation notes, per-commitment decisions, the agreed next review, and `reviewDeferrals`/`reviewMovedOn` when a date is pushed without holding one | `app/core/schema.js`, `app/actions.js`, `app/core/domain/growth.js`, `app/ui/modals.js`, `app/views/growth.js` | `tests/app/growth-ledger.test.mjs` (review write path, rejection of empty/future/impossible reviews, deferral counting and reset, dialog capture) |
| Growth follow-through signals and surfaces: `GROW-06` at two carries, `GROW-07` at two deferrals, carried badges and overdue dates on `#/growth` and person pages, an expandable closed/moved record, a "Hold review" entry point, and ledger-aware `actions` / `growthPlans` CSV scopes plus snapshot rewind | `app/core/domain/insights.js`, `app/core/domain/health.js`, `app/views/growth.js`, `app/views/person.js`, `app/views/today.js`, `app/core/csv.js`, `app/styles.css` | jsdom render + dialog tests, `axe-core` 0 violations on `#/growth`, `#/people/<id>`, `#/today`, `#/settings` and the review dialog; CSV and `reconstructStateAt` assertions |
| Internal role-transition 30-60-90 plans (Schema v10): every plan records `kind` (`new-hire` / `role-transition`) and a `label` naming the new scope; v9 plans migrate honestly as `new-hire` with no invented label; a transition requires its label, cannot be anchored before the person joined, and defaults to the day the new role starts — `person.startDate`, tenure and every tenure-derived signal are never rewritten | `app/core/schema.js`, `app/core/domain/onboarding.js`, `app/actions.js` | `tests/app/transitions.test.mjs` (v9→v10 migration incl. relabelled-file preservation and source-immutability, kind repair warnings, label-required and pre-join rejections with zero writes, cross-kind one-active-plan refusal, reclassification preserving checkpoints/check-ins/history) |
| Transition scaffolding that matches how internal moves actually fail: 6 starter checkpoints (old-role handover inventory, written scope/authority delta, first early win in the new seat, 60-day old-habits calibration, end-to-end ownership, reset goals/GROW to the new level); the plan dialog defaults a tenured person to a transition anchored today and stops auto-filling the date once the leader picks one | `app/core/domain/onboarding.js` `defaultTransitionCheckpoints`, `app/ui/modals.js`, `app/views/onboarding.js` | jsdom dialog tests (kind default, date re-anchor on plan-type change, manual date never overwritten, label-less submit writes nothing), `axe-core` 0 violations on `#/onboarding` |
| Kind-aware surfaces end to end: `ONB-03`–`ONB-05` name the transition (joiner-only `ONB-01`/`ONB-02` stay tenure-based, and a transition plan does not silence a new joiner's `ONB-02`), kind badge + label + per-kind counts on `#/onboarding`, "Role transition (30-60-90)" card on person pages, transition wording in generated 1:1 agendas and prep-sheet commitments, transition entries in the person timeline, and `plan_kind`/`plan_label` (formula-safe) in the `onboarding` and `actions` CSV scopes | `app/core/domain/insights.js`, `oneonone.js`, `prep.js`, `people.js`, `app/core/csv.js`, `app/views/person.js`, `app/main.js` | signal wording + Day 90 gate + completion/timeline/wins assertions, CSV kind/label + formula-escape assertions, demo fixture (Mei at transition day 12 with 260 days' tenure and zero ONB signals); full suite green |
| Operational conflict-redacted JSON exports (Session 14): plain or encrypted restorable backups that omit confidential conflict records and their event-log traces, declare counts-only omissions inside the wrapper, warn on import, and block overwriting readable local conflict records without explicit confirmation | `app/core/store.js`, `app/views/settings.js`, `app/ui/vault-dialogs.js`, `app/views/vault.js`, `app/main.js` | `tests/app/redacted-export.test.mjs` (12 tests: byte-identical live state, `redacted-replacement` guard, encrypted operational backup, `axe-core` 0 violations) |
| Review-due queue on Today (Session 15): `dueGrowthReviews` surfaces overdue, due-within-7-days and unscheduled GROW plans directly on `#/today` with deferral counts and an inline *Hold review* button that opens `openGrowthReviewDialog` in place while deduplicating *Loose ends* | `app/core/domain/growth.js`, `app/views/today.js`, `app/ui/modals.js` | `tests/app/execution-loops.test.mjs` (ordering, exclusion of >7d scheduled & archived plans, direct review settlement on `#/today`, `axe-core` 0 violations) |
| Succession → role-transition handoff & readiness stretch notes (Schema v11, Session 15): optional `readiness[].notes`, pre-populated `openReadinessDialog`, and `transitionHandoff` wiring *Start transition* / *Open 30-60-90 plan* across `#/readiness` and `#/people/:id` into `openOnboardingPlanDialog` with seat label and read-only readiness context — never fabricating `roleClarity` or rewriting `person.role`/`person.startDate` | `app/core/schema.js`, `app/core/domain/readiness.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/readiness.js`, `app/views/person.js` | `tests/app/execution-loops.test.mjs` (v10→v11 migration, handoff prefill, `Edit rating` pre-population, roster immutability, `axe-core` 0 violations) |
| Return-to-work ("re-boarding") 30-60-90 plans (Schema v11, Session 15): `'reboarding'` in `ONBOARDING_KINDS`, 6 re-entry checkpoints centred on context catch-up and 4-week load pacing, optional non-medical context label with explicit privacy guidance, and full `ONB-03`–`ONB-05` / 1:1 agenda / prep sheet / timeline / CSV / redacted-JSON parity | `app/core/schema.js`, `app/core/domain/onboarding.js`, `app/actions.js`, `app/core/domain/insights.js`, `oneonone.js`, `prep.js`, `people.js`, `app/core/csv.js`, `app/ui/modals.js`, `app/views/onboarding.js`, `app/views/person.js` | `tests/app/execution-loops.test.mjs` (pre-join date rejection, tenure preservation, new-joiner `ONB-02` non-silencing, signal/agenda/prep/timeline/CSV/redacted-JSON assertions, `axe-core` 0 violations) |
| Session 15 audit bug fixes: fixed `#/people/:id` `ReferenceError` on GROW *Carry*/*Drop* buttons, mounted interactive `.agenda-picks` inside `openOneOnOneDialog`, fixed `buildForm` `boxLabel` & `span: 2` & single-checkbox-`<label>` accessibility, excluded retired/dropped GROW items from `suggestAgenda`, added `30-60-90 plans` label in Settings, added `.stack-sm`/`.kv-row` CSS utilities, and added `readiness` CSV + `recognition.visibility` CSV | `app/views/person.js`, `app/ui/modals.js`, `app/ui/dom.js`, `app/core/domain/oneonone.js`, `app/views/settings.js`, `app/core/csv.js`, `app/styles.css` | `tests/app/execution-loops.test.mjs` + `tests/app/csv.test.mjs` + programmatic ESLint `no-undef` scan (0 errors across 82 files) |
| 289 automated tests across 21 suites | `tests/app/**` | `npm test` — 289 pass / 0 fail / 0 skipped |

Baseline measured on the demo workspace (`2026-10-25T10:00:00Z`, session 13; re-measured
identically in session 14, whose changes touch neither the demo nor the domain engines):
health **55.1 (C)**, 30-day matched trend **+8.3** (`previous: 46.8`, `fidelity: approximate`), pulse **n=5**, overall
**2.55/5**, safety **2.8**, workload **2.0**; **36 findings across 24 rule ids, 12 urgent,
4 wins**. Follow-through: **2 open promises**, 1 of them carried forward once, **2 completed
with the confirming 1:1 recorded**, 0 dropped; no promise has yet survived two conversations,
so `CONV-06` does not fire on the demo (it is covered by its own test). Ownership: **1 promise
owned by the leader** (overdue, carried once, so `CONV-07` fires once at severity 3 and
`CONV-05` stays silent), **1 owned by the report**, **0 shared**, **0 unrecorded**. Feedback
latency: **5 measured, 2.6d average, 1 beyond convention** (4 given-direction samples at 3.0d
plus 1 received); goals: **3 co-authored, 2 explicitly leader-set**; delegations: **2 active,
1 blocked/overdue, 1 check-in due, 1 completed, 1 returned**; onboarding & transitions:
**2 active 30-60-90 plans** — Samuel Okafor (new-hire, Day 38, 1 pending stakeholder
introduction and overdue Day 30 check-in/checkpoint surfacing `ONB-01`, `ONB-03` and `ONB-04`)
and Mei Lin Chen (role-transition, "Billing platform tech lead", Day 12 of the new scope at
260 days' tenure, no scaffolding gaps, no `ONB` signal). No conflict cases are fabricated in
the demo. The stricter comment policy releases **0 comments**. All 16 main routes render
without errors in JSDOM.

**Correction (session 13).** The previous version of this paragraph (health 54.5 (D), trend
+7.7 `exact`, 35/22/12/3) does **not** reproduce on the session-12 tree at the stated clock:
session 13 measured the untouched pre-session tree and got the numbers above. The stale
figures were most likely recorded mid-session-12, before that session's final demo/ledger
edits landed. Identical pre/post aggregates also prove this session's role-transition work
caused **zero** health or signal drift — the only baseline deltas are the second demo plan
and its "1 onboarding · 1 transition" counts.

---

## Next (ordered by value, not by ease)

1. **Decision review-due queue & outcome follow-through on Today.** `DEC-02` flags overdue DACI
   decision reviews inside Signals, yet `#/today` has no direct *Review decision* workflow
   comparable to its 1:1 and development-review queues; surfacing due decision reviews in place
   closes the loop between recording a decision's expected outcome and checking what actually
   happened.
2. **Delegation → GROW development handoff.** Completed or stretch delegations recorded in
   `#/delegations` are concrete capability evidence, yet turning a stretch delegation into a
   tracked GROW option/commitment or linking a GROW commitment to an owned delegation currently
   requires duplicate manual entry across two screens.
3. **1:1 prep-sheet carry-through into `Log a 1:1`.** A leader who edits talking points or prints
   `#/prep/<personId>` before a conversation should be able to launch `Log a 1:1` from the prep
   sheet with the prepared agenda pre-checked, closing the gap between pre-meeting preparation and
   post-meeting reconciliation.

*(The 1:1 follow-through ledger shipped in Session 10, the GROW ledger in Session 12,
role-transition 30-60-90 plans in Session 13, conflict-redacted operational exports in Session 14,
and Today's development-review queue + succession-to-transition handoff + return-to-work
`reboarding` plans in Session 15 — see the Done table above.)*

## Later / deliberately deferred

| Item | Why deferred |
|---|---|
| Legacy dependency remediation | Fresh production audit has 1 critical / 2 high findings in Next/PostCSS/Sharp. Not imported by the static app; upgrade and validate before any legacy deployment, rather than treating canonical tests as clearance. |
| Large-workspace performance, cross-browser/assistive-technology and print verification | Current browser evidence covers Chromium and selected desktop/mobile states; these broader behaviours remain [UNVERIFIED]. |
| Multi-user, org hierarchy, shared workspaces | Requires a backend, accounts and an honest privacy story. The current invariant is "no network, no server", and breaking it needs an ADR, not a sprint. |
| Upward / 360° feedback | Needs multiple raters to mean anything (see `RESEARCH.md` §10). |
| Notifications, email or calendar sync | A browser tab cannot schedule work; promising reminders it cannot deliver would be a silent failure. |
| Mobile app | The responsive web app is the mobile app until there is a reason otherwise. |
| AI/LLM assistance for drafting feedback | Needs network calls and would put unreviewed text in front of a person's record; the SBI coach is deterministic and auditable. Revisit only with a local model and a clear provenance marker. |
| Sentiment analysis of pulse comments | Unverifiable inference; violates the no-fabrication invariant. |
| Gamification (streaks, badges) | Rewards logging rather than leading; the scores already carry the incentive risk. |

---

## Rejected, with the reason recorded

| Idea | Reason |
|---|---|
| Repairing the legacy React/Next trees into the product | They are non-canonical and were not executed in the latest session; current runtime claims apply only to the zero-build app. Replacing the canonical architecture would require a fresh audit and ADR, not an assumed repair path. |
| Promoting several competing entry points | One canonical entry and test suite avoid contradictory product claims. Historical trees stay as evidence, not additional supported products. |
| Soft-deleting demo data silently | Replacing a leader's real records with fabricated ones is the worst possible failure mode; the store refuses without explicit confirmation. |
| Showing a pulse average under the anonymity floor | Makes individual answers recoverable by subtraction. Suppression is shown as a state, with the count, so it never looks like a broken chart. |
| Scoring missing data as zero | Turns "no evidence yet" into "failing". Unmeasurable dimensions are excluded and the weights renormalise. |
| Inferring missing observation dates or goal authorship | An unknown observation date is not instant feedback, and unknown authorship is not proof the leader set the goal. Both remain explicitly unknown until recorded. |
| A universal seven-day latency or check-in “best practice” score | The research supports timeliness and follow-through, not one validated cutoff for every team. Seven days is a configurable convention, shown as such. |
| A hard validation block on vague feedback | People stop logging. The app coaches instead, and keeps the note. |
| Trend lines with a single data point | Implies knowledge that does not exist; the UI says "not enough history" instead. |
| Self-assessment quizzes (leadership style, personality) | Not falsifiable against records, and they invite the leader to substitute a label for observation. |
| A numeric "leadership score" for the leader | Would turn a diagnostic tool into a grade, and the grade would be gamed. Team health is measured; the leader is shown their behaviour, not a mark. |
| A numeric "onboarding score" or culture-fit rating on new joiners | Conflates missing manager scaffolding (no buddy, unclear scope) with employee capability, and unfalsifiable culture-fit labels invite bias. |
| HR / IT administrative orientation checklists (laptop, payroll, tax forms) | Administrative compliance belongs in HRIS/IT tooling; mixing paperwork into a leadership workspace crowds out role clarity, introductions and coaching. |
| Auto-importing onboarding check-in blockers into performance reviews | Punishes candour in the first 90 days when psychological safety to name confusion matters most. |
| Defaulting every new 1:1 action's owner to the report (or to the leader) | The most common product default and the least honest: most promises are the report's, so a wrong default is invisible, and the leader's own half of the ledger disappears. LeadOS records "not decided yet" and counts the gap. |
| A free-text owner name on a 1:1 commitment | A 1:1 has exactly two participants; free text invents a roster the app cannot verify and makes "who owes it" unanswerable. |
| Retroactively reassigning a closed or carried promise | Rewrites who was responsible after the fact. Reassignment is an explicit, logged action on the live copy only. |
| Automatic carry-forward of every unfinished 1:1 action | Makes a repeating commitment invisible and removes the one moment where a leader could re-scope or drop it. 15Five and Lattice both default to this; LeadOS asks, and keeps the decision. |
| Deleting a dropped commitment | The decision to stop is evidence. Keeping the reason supports "what did we choose not to do?" and stops the same promise being re-made blindly. |
| A commitment completion-rate score per person | The data is manager-entered and incomplete; a percentage would reward under-recording and read as a performance rating. Counts, dates and reasons only. |
| Resetting `person.startDate` to start a transition plan | Falsifies tenure and every tenure-derived behaviour (new-joiner detection, `ONB-01`/`ONB-02`, "years on the team"). The plan carries its own anchor; the roster record is history. |
| Inferring a role transition from a role/title edit | Only the leader knows a move actually happened — auto-creating plans from edits would fire on typo fixes and title normalisation. A transition is recorded deliberately, like every other record. |
| A separate `state.transitions` collection | One 30-60-90 record with a `kind` keeps the one-active-plan-per-person invariant, the Day 90 gate, signals and exports in a single code path. A second silo would duplicate all of it to answer the same "first 90 days in the role" question. |
| Storing a `leaveReason` / medical field on `reboarding` plans | Invites special-category health or personal leave data (GDPR Art. 9) into a local browser tool that needs only operational catch-up and load-pacing scaffolding. |
| Auto-copying readiness notes or warnings into `roleClarity` on succession handoff | Past readiness notes are evaluation gaps, not agreed 90-day scope and decision authority; auto-copying fabricates `roleClarity` and silences `ONB-03` before expectations are written. |
| Auto-updating `person.role` when starting a role-transition plan from `#/readiness` | A transition plan may cover an acting seat or phased handover before a title change; roster edits remain deliberate. |

---

## Known gaps I am not pretending are closed

- Pulse anonymity and independent respondents cannot be guaranteed by a local single-manager workspace. Partial/unanimous/thin-comment windows now suppress more conservatively; that intentional loss of visible data is a safety tradeoff, not a chart regression.
- Conflict confirmations are manager-entered, not employee signatures or independent testimony. Handoff sends nothing. The browser copy can now be encrypted, but CSV and plain-text JSON exports stay unencrypted by design, so a downloaded backup is as protected as its folder. No real-manager conflict-practice validation has been performed.
- The operational copy's `redactions` marker is a declaration, not a proof: JSON can be hand-edited, and a file stripped of conflict records without the marker is indistinguishable from an honestly conflict-free workspace, so the import guard cannot fire for it (documented in `RESEARCH.md` §24). "Conflict-free" also does not mean "safe to share with anyone" — 1:1 notes, feedback and reviews are still in the operational copy.
- Historical health checkpoints are `exact` when backed by dated records and Schema v5
  snapshots, and explicitly labelled `approximate` when pre-v5 or in-place stage edits lack
  dated history. Fresh workspaces continue to show `pre-history` / "not enough history" rather
  than inventing past scores. Real-Chromium pixel/mobile verification of the new Session 5
  trend and CSV surfaces remains `[UNVERIFIED]` in a live browser binary until run outside
  this container.
- Commitment ownership is manager-entered and private to this browser. There is no employee view,
  so the leader cannot be held to "What you owe" by the person waiting on it, and an unrecorded
  owner is a gap the app reports rather than a fact it knows.
- The development ledger is manager-entered too. A review recorded here is the leader's account of a
  conversation, not a signed record from the report; a commitment the report considers dropped can
  still be shown as "still open" if the leader says so. Carry depth and review counts are facts about
  the record, not evidence that capability changed, and `GROW-06`/`GROW-07` are diagnostic.
- A role-transition plan is the leader's account of a move. It cannot verify that the old role was
  actually handed over, it does not update the person's role/title/level (that stays a separate,
  deliberate roster edit), and — like onboarding — there is no employee view of it. The label is
  free text the leader typed, not an org-chart fact.
- Development review dates have no reminder mechanism (a browser tab cannot schedule work). The app
  shows what is overdue when it is opened; it cannot make a review happen.
- "Weekly meaningful feedback" is the evidence-backed cadence; the default feedback target is
  21 days because it is achievable. The 7-day latency and delegation-check-in values are
  configurable team conventions, not validated universal cutoffs.
- Review packets cannot recover history that was never logged. Current goal/development
  values and delegation status/authority are explicitly capture-time; there is no employee
  account or direct submission workflow, and calibration heuristics are not a validated
  fairness instrument.
- Encryption protects the stored browser copy and encrypted backups only. It does not protect an
  unlocked tab during active use, cannot recover a forgotten passphrase, and needs a secure
  context (https or localhost). An unlocked tab now auto-locks after a configurable inactivity
  window (default 30 minutes) with a warning first; see the Done table. Real-browser WebCrypto
  behaviour is `[UNVERIFIED]` here:
  Node's `webcrypto` was injected into jsdom.
- Rehearsal against real usage is absent: every number in this file comes from the demo
  workspace and the test suite, not from a manager's actual quarter. Real-browser visual
  inspection of print output remains `[UNVERIFIED]`; delegation mobile overflow/filter checks now run in Chromium, but exhaustive visual/interaction review remains `[UNVERIFIED]`. Source links and workflows are covered in jsdom, with HTTP module loading checked separately.
