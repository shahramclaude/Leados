# ROADMAP

Living document. Status is per capability, not per file. Every "Done" line was verified
by an automated test or a measured run in the session that claimed it; anything else is
marked `[UNVERIFIED]` and is not counted as done.

Last updated: 2026-10-25 (session 26: Selection & hiring — Schema v17, evidence weighted by method
validity, RULE-HIRE-01..03 cross-module propagation; 368 automated tests across 27 files).

Session 23 note: cross-domain Operational Cases, typed Cross-Module Relationship Graph, and event-driven parallel rules engine across FMEA, 3-point PERT ROI, 5-Whys systemic barriers, Mendelow stakeholder coalitions, Decisions, Delegations, Goals and blameless 1:1 coaching; Schema v15; 17 CSV scopes; 322 automated tests across 25 files).

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
| Today queue for blocked, overdue, undated and stale delegated outcomes; direct check-in/completion actions | `domain/delegations.js`, `ui/delegation-checkins.js`, `views/today.js` | `tests/app/delegation-queue.test.mjs` (priority, closed-item exclusion, cancel/no-write, audited check-in/completion, reload, archived owner and axe scans) |
| Delegation follow-through in Signals, 1:1 agendas, person pages and review evidence | `domain/insights.js`, `domain/oneonone.js`, `domain/reviews.js` | `DEL-01`…`DEL-03`, agenda reason, dated outcome valence and focused source-route tests |
| Goal with no key results reported as unmeasured | `domain/goals.js` | integration test `KR-less goal` |
| GROW plans scored stage by stage | `domain/growth.js` | domain tests |
| Competency coverage | `domain/growth.js` | growth view render test |
| Evidence-gated succession readiness | `domain/readiness.js` | integration test (unsupported "ready now" flagged) |
| Pulse reporting floor (default 5, supported minimum 3), same complete cohort for means/trends, whole-vector unanimous suppression and independent comment floor | `domain/pulse.js`, `core/schema.js`, `ui/modals.js` | domain + integration tests; 10 pulse-safety regressions; this is not an anonymity guarantee |
| Pulse windows on calendar days (no double-counting) | `domain/pulse.js` | domain test on window boundaries |
| Decision log (DACI, reversibility, options, rationale, review) | `domain/decisions.js` | integration test (log → decide → review) |
| Recognition ledger + drought detection | `domain/insights.js` `REC-01` | view + insights tests |
| 50 named signal rules with severity, evidence, one action (including count-only `CFL-01`…`CFL-04` and cross-domain `CASE-01`…`CASE-04`) | `domain/insights.js` | domain tests (determinism, shape, urgency), including `FB-06`, `GOAL-06`, `DEL-01`…`DEL-03`, `CONV-06`, `CONV-07`, `GROW-06`, `GROW-07`, `CASE-01`…`CASE-04` |
| Repetition collapsed above 3 people, names preserved | `domain/insights.js` `rollUpFindings` | domain + integration tests (24-person roster) |
| Actionable 30-60-90 phase conversations on Today, oldest-first with four-item preview and full queue | `domain/onboarding.js`, `ui/onboarding-checkins.js`, `views/today.js` | `onboarding-queue.test.mjs` (12 regressions); Chromium desktop/mobile lifecycle and five zero-violation axe scans |
| Complete check-in queue, person/plan scope, exact completed-plan links and explicit stale-link recovery | `views/onboarding.js` | Node/JSDOM lifecycle, filter, special-character/XSS tests + Chromium navigation/reload |
| Mobile full-plan toolbar and Settings backup/export labels fit 390px viewport | `styles.css` | `scripts/app-onboarding-smoke.mjs` + repaired `scripts/app-browser-smoke.mjs` overflow assertions |
| Today: health, next actions, due 1:1s, pulse prompt | `views/today.js` | full-demo render test |
| Health score: 5 dimensions, null-safe weighting, approximate historical comparison | `domain/health.js` | domain tests + demo baseline |
| Export / import / reset / demo, with demo protection | `core/store.js`, `views/settings.js` | integration tests (round-trip, demo refusal) |
| Evidence-linked performance-review packets with self-reflection and manager assessment | `domain/reviews.js`, `views/reviews.js`, `actions.js` | domain tests + real-dialog create → reflect → assess → complete → export/import test |
| Explicit completed-review → GROW/Goal follow-through (Schema v13): editable focus prefill, same-person source validation, links in both directions and CSV; no records on completion and no copied-as-agreed next steps | `core/schema.js`, `actions.js`, `ui/modals.js`, `views/reviews.js`, `views/goals.js`, `views/growth.js`, `core/csv.js` | `reviews.test.mjs` migration/ownership/CSV tests + `app.test.mjs` real-dialog GROW and goal flows; no browser/AT claim |
| Explicit manager-owned follow-ups after recorded Day 30/60/90 check-ins (Schema v14): stable check-in ID + plan/phase/date source, dated user-authored action, shared ledger/Today ownership, real-1:1 done/carry/drop reconciliation, source-preserving carry and CSV; no blocker copy, synthetic meeting, or performance-review evidence | `core/schema.js`, `core/domain/oneonone.js`, `actions.js`, `ui/modals.js`, `views/onboarding.js`, `views/oneonones.js`, `core/csv.js` | `onboarding.test.mjs` modal/board/1:1 flow + `reconcile.test.mjs` validation, carry, completion, CSV, review-evidence exclusion and snapshot rewind; `scripts/app-manager-support-smoke.mjs` Chromium 153 desktop/mobile lifecycle, 8 zero-violation axe scans, keyboard dialog and overflow checks; screen-reader/AT and comprehension **[UNVERIFIED]** |
| Review calibration warnings for thin/recency-skewed/one-sided evidence and unsupported ratings | `domain/reviews.js` `calibrateReview` | deterministic `CAL-01`…`CAL-07` tests; completion confirmation exposes warnings |
| Frozen completion snapshots, reopen/refresh audit history, source drill-down, print/PDF | `actions.js`, `views/reviews.js` | lifecycle tests; all six source routes incl. delegation and completed goal/plan; print-dialog wiring test |
| Schema v2 review, v3 latency/authorship/delegation, v4 conflict and v5 dated-snapshot migrations, with dynamic demo protection/cleanup | `core/schema.js`, `core/store.js`, `actions.js` | additive v1→v2→v3→v4→v5 migration, null preservation for pre-v5 records, reload/import and real/demo preservation tests |
| Key-result dialog targets its source goal; development-plan edit preserves the plan | `ui/modals.js`, `actions.js` | UI regression tests for both flows |
| Development overdue calculations use the injected clock | `domain/growth.js` and callers | regression test with 2019 and 2026 clocks |
| Accessibility: skip link, dialog keyboard/focus behaviour, live errors, visible disabled controls, non-color chart stroke/shape coding, HTML data tables, and inline validation errors associated with their controls | `ui/dom.js`, `ui/charts.js`, `ui/conflict-modals.js`, `styles.css` | jsdom + Chromium regression asserts `aria-invalid`, preserves field-help `aria-describedby`, adds/removes inline error ID as validity changes; axe scans remain zero for selected screens. Real screen-reader validation and whether announcements are duplicated **[UNVERIFIED]** |
| Dialogs cannot survive a route change | `app/main.js` | integration test |
| Roster search that does not steal focus | `views/people.js` | integration test |
| Conflict listening → explicit agreement → owned results → verified follow-up → resolution, with support handoff/reopening/version history | `domain/conflicts.js`, `conflict-actions.js`, `ui/conflict-modals.js`, `views/conflicts.js` | 29 conflict tests |
| Conflict content isolated from health/talent/reviews/agendas/person timelines/routine CSVs; general reminders are counts only, including roster-free workspaces | `domain/insights.js`, `views/today.js`, `core/csv.js` | privacy regression assertions across views, timelines and all routine CSV scopes |
| Unsupported/future schemas refused on import and protected on load, original export preserved even after failed replacement; CSV export refused when `writeBlockReason` active | `core/store.js`, `actions.js`, `core/csv.js` | 5 storage-safety tests + CSV future-schema/QuotaExceeded tests |
| Static-server canonical asset allowlist, private-file/symlink/traversal denial and read-only HTTP methods | `scripts/serve.mjs` | 4 actual-HTTP server regression tests + Session 5 live HTTP module checks |
| Goal/delegation tabs use real filter keys; Settings fallback export Close works | affected views | jsdom filter checks; fallback-dialog regression |
| Longitudinal trends across all 5 health dimensions, composite health, feedback latency and delegation follow-through (8w / 12w / 6m) with survivorship-bias fix, matched-dimension deltas and `exact`/`approximate` disclosures | `domain/health.js`, `domain/trends.js`, `ui/charts.js`, `views/health.js`, `views/today.js` | `tests/app/trends.test.mjs` (survivorship bias, Simpson's/coverage-shift guard, pre-history null guard, UI switching, `axe-core`) |
| Scoped, unknown-preserving, OWASP CWE-1236 formula-safe CSV exports across 17 tables (including `cases`, `caseLinks`, `readiness` and `recognition.visibility`) with pulse anonymity/comment floors and confidential conflict confirmation | `core/csv.js`, `core/store.js`, `views/settings.js` | `tests/app/csv.test.mjs` + `tests/app/cases-automation.test.mjs` + `tests/app/execution-loops.test.mjs` (12 formula vectors incl. full-width Unicode & whitespace, negative numbers, RFC 4180 round-trip, pulse suppression, QuotaExceeded, `axe-core`) |
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
| Decision review-due queue on Today, decision lifecycle & DACI repairs (Schema v12, Session 16): `reviewsDue` and `dueDecisionReviews` exclude undecided calls (`Boolean(d.chosen)`), `#/today` surfaces overdue and due-within-7-days decision reviews with inline *Review outcome*, `#/decisions` honours `?decision=<id>` focus (`DEC-01`) and unifies `?filter=review` with `dueQueue`, `updateDecision` + *Edit* dialog resolves missing approvers (`DEC-03`) without losing option pros/cons, `reviewDecision` validates `reviewedOn` chronology and rewinds cleanly in `reconstructStateAt`, and `#/people/<id>` renders token-matched DACI involvement | `app/core/schema.js`, `app/core/domain/decisions.js`, `app/core/domain/health.js`, `app/core/domain/insights.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/decisions.js`, `app/views/today.js`, `app/views/person.js` | `tests/app/decision-growth-prep.test.mjs` (undecided exclusion, chronology/state guards, snapshot rewind, DACI token matching, `#/today` inline review, `?decision=` focus, `DEC-03` edit, `axe-core` 0 violations) |
| Stretch delegation ↔ GROW development handoff (Schema v12, Session 16): explicit `delegationId` on `growthPlans[].will[]` (repaired on dangling/cross-person links, preserved across carries, rewound in `reconstructStateAt`, exported in `actions`/`delegations`/`growthPlans` CSVs), one-click *Add to GROW* / *Start GROW plan* handoffs from `#/delegations`, bidirectional status links across `#/delegations`, `#/growth`, `#/people/<id>` and `openGrowthReviewDialog`, and explicit coaching-reflection prompts when a linked delegation completes or returns (never silently auto-closing `will.done`) | `app/core/schema.js`, `app/core/domain/growth.js`, `app/core/domain/health.js`, `app/core/csv.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/delegations.js`, `app/views/growth.js`, `app/views/person.js` | `tests/app/decision-growth-prep.test.mjs` (v11→v12 migration & repair, ownership/duplicate guards, carry preservation, non-silent completion reflection, CSV & snapshot rewind, `axe-core` 0 violations) |
| 1:1 prep-sheet & employee-topic carry-through into `Log a 1:1` (Session 16): checkable *Their topics* and *Suggested agenda* on `#/prep/<id>` pass exact selections into `openOneOnOneDialog`, `#/people/<id>` surfaces waiting `talkingPoints` and *Use this agenda*, `buildMeetingAgendaCandidates` preserves true agenda `source` provenance (`'their-topic'`, `'delegation'`, `'onboarding'`, etc.), and `logOneOnOne` clears covered employee `talkingPoints` only when `status === 'held'` | `app/core/domain/oneonone.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/prep.js`, `app/views/person.js`, `app/styles.css` | `tests/app/decision-growth-prep.test.mjs` + `tests/app/prep.test.mjs` (selective topic clearing, `skipped`/`moved` protection, provenance preservation, `axe-core` 0 violations) |
| Cross-domain Operational Cases & Event-Driven Parallel Cross-Module Propagation Engine (Schema v15, Session 23): AIAG-VDA FMEA RPN + Action Priority + residual verification, 3-point Beta-PERT financial & capacity exposure with risk-adjusted mitigation ROI, Toyota 5-Whys & Swiss-Cheese systemic barriers with individual-blame warnings, Mendelow Power × Interest stakeholder coalition matrix & briefing cadences, typed Cross-Module Relationship Graph (`state.links` with strict `conflict`/`pulse` privacy walls), 7 deterministic rules (`RULE-STAKE-01`, `RULE-DEC-01`, `RULE-DEL-01`, `RULE-GOAL-01`, `RULE-COACH-01`, `RULE-SYNC-DEL-01`, `RULE-ESC-01`) propagating in parallel across Decisions, Delegations, Goals, People/1:1 Prep, Today, and Insights (`CASE-01`…`CASE-04`), upstream *Escalate to case* handoffs, `#/cases` & `#/cases/:id` views, live propagation preview in `openCaseDialog`, and `cases` + `caseLinks` CSV scopes | `app/core/domain/cases.js`, `app/core/domain/automation.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/case-modals.js`, `app/views/cases.js`, `app/views/{today,decisions,delegations,goals,person,prep,insights,settings}.js`, `app/core/csv.js`, `app/styles.css` | `tests/app/cases-automation.test.mjs` (FMEA/PERT/Mendelow/5-Whys math, 5-way parallel propagation, idempotency, delegation→monitoring loop, resolution propagation, upstream escalation, v14→v15 migration, privacy wall, snapshot rewind, CSV formula safety, JSDOM + `axe-core` 0 violations across `#/cases`, `#/cases/:id`, modals & connected views); real-browser layout/AT on `#/cases` **[UNVERIFIED]** |
| Capacity, Flow & Portfolio Allocation (Schema v16, Sessions 24–25): explicit capacity supply from focused hours with transition ramp and operational reserve; Little's Law WIP/cycle-time and Kingman queue-delay multiplier; three-point PERT effort/value, value-density allocation, P50/P80/P90 forecast; `RULE-CAP-01` case→capacity reserve, `RULE-CAP-02` infeasibility→one DACI trade-off decision, `RULE-CAP-03` funding→goal risk, and `RULE-CAP-04` explicitly linked delegation completion→portfolio delivery/date/audit (no double-entry; returned work is not treated as delivered; **Sync rules** idempotently repairs prior completed links); `CAP-01`–`CAP-05` signals and `portfolio` CSV | `app/core/domain/capacity.js`, `app/core/domain/automation.js`, `app/core/schema.js`, `app/actions.js`, `app/views/capacity.js`, `app/ui/capacity-modals.js`, `app/views/today.js`, `app/main.js`, `app/core/demo.js`, `app/core/csv.js`, `app/core/domain/insights.js`, `app/core/domain/health.js`, `app/styles.css` | `tests/app/capacity-flow.test.mjs` (19 tests including RULE-CAP-04 end-to-end: active linked plan consumes capacity; completion marks delivered using the recorded date, preserves graph edge, appends one audit event, frees committed capacity, and blocks new plan items sourced from a closed delegation; JSDOM `#/capacity` and axe checks). Real-browser rendering on `#/capacity` remains **[UNVERIFIED]** |
| Selection & hiring (Schema v17, Session 26): requisition with written competencies, interviewer list and optional three-point interviewer-effort estimate; candidate evidence weighted by method validity (Sackett et al. 2022: structured interview .42, job-knowledge .40, work sample .33, cognitive .31, unstructured .19, years .07) combined in log-odds with correlated-evidence discounting (same competency × different rater ×0.5, same rater ×0.25), neutrality at 3/5, rater-disagreement surfacing, a falsification ("what would change my mind") count, competency coverage + offer convention (weight ≥ 0.50, ≥ 2 methods, all required competencies), funnel/conversion, cycle-time floor at two hires, cost of vacancy only from a recorded daily figure, process parity without protected attributes, and decision gates that require an acknowledged, recorded evidence gap; `RULE-HIRE-01` requisition → committed `hiring` capacity item (refresh / release / complete), `RULE-HIRE-02` accepted offer → roster record + new-hire 30-60-90 plan + typed links (`candidate → requisition`, `requisition → person`, `person → onboarding`) + reserve completion, `RULE-HIRE-03` stalled role → exactly one operational case through the shared escalation path (FMEA/PERT/stakeholders/DACI/delegation fan-out), `HIRE-02`…`HIRE-07` signals, and a sensitive `hiring` CSV scope | `app/core/domain/hiring.js`, `app/core/schema.js`, `app/core/domain/automation.js`, `app/core/domain/cases.js`, `app/core/domain/capacity.js`, `app/actions.js`, `app/views/hiring.js`, `app/ui/hiring-modals.js`, `app/views/today.js`, `app/views/settings.js`, `app/ui/modals.js`, `app/main.js`, `app/core/demo.js`, `app/core/store.js`, `app/core/csv.js`, `app/core/domain/insights.js`, `app/styles.css` | `tests/app/hiring.test.mjs` (27 tests: evidence maths incl. the falsification test crossing the decision line, coverage/offer gate, parity, cycle-time floor, v16→v17 migration and repairs, action validation, RULE-HIRE-01/02/03 end to end incl. "a stalled role raises exactly one case across repeated syncs", signals, CSV formula safety, JSDOM + `axe-core` 0 violations on `#/hiring`, `#/hiring/:id` and the dialog); real-browser/AT validation **[UNVERIFIED]** |
| 368 automated tests across 27 suites | `tests/app/**` | `npm test` — 368 pass / 0 fail / 0 skipped (Session 26) |

Baseline measured on the demo workspace (`2026-10-25T10:00:00Z`, session 24): **44 findings
across 31 rule ids** (including `CAP-01` at 86% utilisation, `CAP-02` queue-delay ≈7.1×, and
`CAP-03` for 13.34 undecided person-days across 2 items); capacity supply **72.8 person-days**,
operational reserve **14.56**, allocatable **58.24**, committed **50.09** (19.92 reserved for
incidents/scaffolding + 30.17 funded), slack **8.15**, per-person bottleneck Mei Lin Chen at
184% of her allocatable share, funded-scope P50 2026-11-09 / P80 2026-11-10, 2 delivered plan
items in the 8-week window (observed cycle time 40 days). Session 23 figures follow:
health **55.1 (C)**, 30-day matched trend **+8.3** (`previous: 46.8`, `fidelity: approximate`), pulse **n=5**, overall
**2.55/5**, safety **2.8**, workload **2.0**; **41 findings across 28 rule ids (including `CASE-02`, `CASE-03`, `CASE-04` across 2 demo operational cases and 7 cross-module links; `DEC-02` active on the 4-day-overdue warehouse-metrics decision review),
4 wins**, **2 overdue development reviews**, **1 overdue decision review**, and **2 High Action Priority operational cases** surfaced directly on `#/today`. Follow-through: **2 open promises**, 1 of them carried forward once, **2 completed
with the confirming 1:1 recorded**, 0 dropped; no promise has yet survived two conversations,
so `CONV-06` does not fire on the demo (it is covered by its own test). Ownership: **1 promise
owned by the leader** (overdue, carried once, so `CONV-07` fires once at severity 3 and
`CONV-05` stays silent), **1 owned by the report**, **0 shared**, **0 unrecorded**. Feedback
latency: **5 measured, 2.6d average, 1 beyond convention** (4 given-direction samples at 3.0d
plus 1 received); goals: **3 co-authored, 2 explicitly leader-set**; delegations: **2 active,
1 blocked/overdue, 1 check-in due, 1 completed, 1 returned** (with Mei's active stretch delegation
linked to her GROW commitment); onboarding & transitions:
**2 active 30-60-90 plans** — Samuel Okafor (new-hire, Day 38, 1 pending stakeholder
introduction and overdue Day 30 check-in/checkpoint surfacing `ONB-01`, `ONB-03` and `ONB-04`)
and Mei Lin Chen (role-transition, "Billing platform tech lead", Day 12 of the new scope at
260 days' tenure, no scaffolding gaps, no `ONB` signal). No conflict cases are fabricated in
the demo. The stricter comment policy releases **0 comments**. All routes render without errors
in JSDOM.

**Correction (session 13).** The previous version of this paragraph (health 54.5 (D), trend
+7.7 `exact`, 35/22/12/3) does **not** reproduce on the session-12 tree at the stated clock:
session 13 measured the untouched pre-session tree and got the numbers above. The stale
figures were most likely recorded mid-session-12, before that session's final demo/ledger
edits landed. Identical pre/post health aggregates (`55.1 (C)`, `+8.3`) also confirm zero
unintended health drift across sessions 13–16.

---

## Session 24 gap decision

The audit found one genuine hole rather than a missing framework: every existing module recorded
*intent* (goals, delegations, cases, onboarding) and none answered whether the team could deliver
it. Capability maturity models (CMMI), OKR tooling and portfolio tools all assume this layer
exists. Session 24 therefore built the operating-plan layer and — more importantly — wired it into
the existing rules engine so capacity is maintained by the same event-driven propagation as
everything else (RULE-CAP-01/02/03). Session 25 extended this same engine with RULE-CAP-04:
explicit delegation-to-portfolio source links now close the plan item on verified delegation
completion, retaining the completion date and append-only automation history. No estimate is
inferred, returned work is not counted as delivered, and no new schema version, runtime
dependency, backend, network call or account was introduced.

## Session 26 gap decision and next priorities

The audit found one class of high-leverage decision the product did not model at all: who to hire.
Every other module assumed the team's composition as given, so the operating plan could reserve
capacity for work but not for the interview effort that changes who is available, and the review
module could assess performance but not the evidence that predicted it. Session 26 added Selection
& hiring as a first-class module and wired it into the same event engine (RULE-HIRE-01..03) rather
than a new code path: opening a role now commits capacity, accepting an offer now creates the
roster record and the 30-60-90 plan, and a stalled role now becomes a full operational case with the
existing FMEA/PERT/stakeholder/decision/delegation fan-out.

Two research corrections happened *inside* this session and are worth recording because they changed
the product, not just the prose. First, the initial implementation used Schmidt & Hunter's (1998)
validity table with work samples at .51 and unstructured interviews at .18 — the second figure was
simply wrong (unstructured is .38 in 1998, and .18 is years of experience). Second, retrieving the
current literature showed that table has been superseded: Sackett et al. (2022) revised the
estimates downward and reordered them, making structured interviews the strongest single method and
demoting work samples from .54 to .33. The coefficients, the band floor and one UI claim ("a work
sample is the highest-validity signal") were all corrected. Nothing in the evidence maths depends on
which table is used — the weights are inputs — but the product's advice now matches the current
evidence rather than a 1998 table that most hiring advice still repeats.

Next, ordered by impact:

1. Validate the hiring screens in real desktop/mobile browsers plus screen-reader and manager
   comprehension checks; then run one real hiring round against the app and compare the evidence
   weighting with the decision the manager would have made unaided. No field validation exists.
2. Audit and remediate critical/high dependencies and deployment posture in the non-canonical
   Next/PostCSS/Sharp tree before any such deployment; its current state is **[UNVERIFIED]**.
3. Large-workspace and real-practice validation for capacity, cases and hiring together; and a
   deliberate decision on whether candidate records need a retention/erasure prompt on a timer
   (currently deletion is manual, which is honest but easy to forget).

## Next (ordered by value, not by ease)

1. **Real-browser/mobile and assistive-technology validation, plus manager/employee comprehension.**
   Selected check-in → manager follow-up → real 1:1 flows now pass in headless Chromium at
   1440×1000 and 390×844, with keyboard-dialog checks and axe scans. Inline form errors now also
   link back to their fields programmatically. Still validate on actual desktop/mobile browser
   configurations and with screen readers; test whether managers and employees understand the
   distinct manager-owned commitment and its source. Headless Chromium, JSDOM and axe are not
   screen-reader certification or a usability study; those outcomes remain **[UNVERIFIED]**.
2. **Legacy dependency remediation and deployment audit.** The production dependency audit still
   reports critical/high issues in the separate legacy Next/PostCSS/Sharp chain. Upgrade and test
   before any legacy deployment; canonical static-app tests are not clearance. Current dependency
   and deployment status remains **[UNVERIFIED]**.
3. **Large-workspace, cross-browser and print verification.** Measure responsive layout, local
   storage/CSV behavior and browser print output beyond the selected automated fixtures; all are
   **[UNVERIFIED]** at representative production scale.

*(The 1:1 follow-through ledger shipped in Session 10, the GROW ledger in Session 12,
role-transition 30-60-90 plans in Session 13, conflict-redacted operational exports in Session 14,
Today's development-review queue + succession-to-transition handoff + return-to-work `reboarding`
plans in Session 15, and Today's decision-review queue + delegation-to-GROW handoff + 1:1
prep-sheet carry-through in Session 16, actionable phase check-ins + mobile overflow repairs in Session 17, actionable delegation check-ins in Session 18, explicit performance-review → GROW/Goal handoff in Session 19, and manager-owned Day 30/60/90 check-in follow-up in Session 20, with selected headless-Chromium lifecycle/keyboard validation in Session 21 and field-linked inline validation errors in Session 22 — see the Done table above.)*

## Later / deliberately deferred

| Item | Why deferred |
|---|---|
| Legacy dependency remediation | Fresh production audit has 1 critical / 2 high findings in Next/PostCSS/Sharp. Not imported by the static app; upgrade and validate before any legacy deployment, rather than treating canonical tests as clearance. |
| Large-workspace performance, cross-browser/assistive-technology and print verification | Session 17 re-ran both Chromium smoke scripts at selected desktop/mobile states; these broader behaviours remain [UNVERIFIED]. |
| Multi-user, org hierarchy, shared workspaces | Requires a backend, accounts and an honest privacy story. The current invariant is "no network, no server", and breaking it needs an ADR, not a sprint. |
| Upward / 360° feedback | Needs multiple raters to mean anything (see `RESEARCH.md` §10). |
| Notifications, email or calendar sync | A browser tab cannot schedule work; promising reminders it cannot deliver would be a silent failure. |
| Mobile app | The responsive web app is the mobile app until there is a reason otherwise. |
| AI/LLM assistance for drafting feedback | Needs network calls and would put unreviewed text in front of a person's record; the SBI coach is deterministic and auditable. Revisit only with a local model and a clear provenance marker. |
| Sentiment analysis of pulse comments | Unverifiable inference; violates the no-fabrication invariant. |
| Gamification (streaks, badges) | Rewards logging rather than leading; the scores already carry the incentive risk. |
| Storing candidate protected characteristics to compute adverse-impact ratios | The 4/5 rule needs race/sex/disability data that a local, single-manager browser tool has no lawful basis or safe storage for. The app checks *process* parity (same competencies assessed for everyone) instead, which is auditable without collecting special-category data. |
| A "culture fit" score | Unfalsifiable, reliably a similarity-to-measure, and the most common route by which structured processes collapse back into affinity bias. |
| Auto-rejecting candidates below an evidence threshold | A model that removes people from consideration without a human decision is not decision support. The app flags gaps and requires a recorded rationale and acknowledgement; the person still decides. |
| Deriving the cost of vacancy from a salary band or revenue assumption | Would invent the most persuasive number on the screen. Only a daily figure the leader records is used; otherwise the delay is shown as unpriced. |
| Parsing résumés or importing candidate data from a file | Adds an unverifiable inference step (and a data-protection surface) to the one place where evidence quality is the product. Evidence is recorded by the person who observed it, with the method named. |
| Treating "years of experience" as a scored competency | It is in the table at .07 precisely to show how little it carries; making it a required competency would quietly rebuild CV screening into the rubric. |

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
| Auto-closing a GROW `will` commitment when its linked delegation completes | Completing a deliverable is operational execution; capability growth requires an explicit coaching reflection on what was learned before closing the GROW commitment. |
| Treating undecided decisions with past `reviewOn` dates as overdue outcome reviews (`DEC-02`) | An unmade decision needs a call (`DEC-01`), not an outcome review; mixing the two lets `reviewDecision` run before any option is chosen. |
| Automatically clearing all `person.talkingPoints` whenever any 1:1 is logged | Wipes topics the conversation ran out of time to cover — or wipes topics on a `skipped`/`moved` 1:1. Only checked employee topics in a `held` 1:1 are cleared. |

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


## Session 17 research refresh and gap decision

Fresh pinned Sourcegraph/Lattice-workflow documentation and Frappe HR onboarding source were
reviewed (see `RESEARCH.md` §27). They reinforce anchored milestone prompts and explicit
conversation evidence, not another schema or task-completion percentage. The previous #1
item shipped without a migration, new runtime dependency, backend or network request.
The twelve new regressions and two Chromium scripts pass; the legacy architecture/runtime
and full line-by-line source verification remain **[UNVERIFIED]**. The browser scripts also
exposed two existing mobile overflow cases and stale conflict-checkbox test selectors;
those are now repaired and reproducibly checked.

## Session 18 research refresh and gap decision

CCL first-time-manager research and Gallup delegation findings (scoped and linked in
`RESEARCH.md` §28) support help without micromanagement, but do not validate a numeric owner
score or universal check-in interval. The verified product gap was direct Today access to
existing blocked, overdue, undated and stale delegation signals. This shipped by reusing the
current health logic, dialog, attention route and event—not a new schema or task database.
The four added regressions and full 309-test suite pass. Source inventory is not manual
line-by-line review; legacy implementations and live-browser behavior of this addition remain
**[UNVERIFIED]**.

## Session 23 research refresh and cross-domain architectural increment

Cross-domain synthesis across Engineering (AIAG-VDA FMEA Action Priority & Reason Swiss-Cheese
barriers), Mathematics/Statistics (3-point Beta-PERT), Finance/Economics (risk-adjusted expected
value, mitigation ROI & opportunity cost), MBA/Operations (DACI trade-off governance), Political
Science (Mendelow Power × Interest stakeholder coalitions), Production/Lean (Toyota 5-Whys &
closed-loop mitigation verification), and Leadership (Edmondson blameless 1:1 air-cover) shipped in
Schema v15 (`RESEARCH.md` §33, `docs/AUDIT-2026-10-25-session-23.md`). All **322 automated tests
across 25 test files** pass (`0` failures, `0` axe-core violations in JSDOM), and `scripts/serve.mjs`
serves all 60 canonical ES modules with zero warnings. Real graphical browser rendering on `#/cases`,
assistive-technology screen-reader evaluation, and human comprehension studies remain
**[UNVERIFIED]** until run with an installed browser/screen-reader binary.

## Session 25 gap decision and next priorities

The cross-module gap was a stale linked portfolio item after explicit delegation completion. Closed
that vertical loop with `RULE-CAP-04` inside the existing event-driven engine; no schema migration
was warranted because provenance, typed links, status/date and audit machinery already exist. See
`RESEARCH.md` §35 and `docs/AUDIT-2026-10-25-session-25.md` for the code trace and limits.

Next, ordered by impact:

1. Validate the capacity/case screens and delegation → plan lifecycle in real desktop/mobile
   browsers, plus screen-reader and manager comprehension checks. Current JSDOM/axe coverage is not
   that evidence; these remain **[UNVERIFIED]**.
2. Audit and remediate critical/high dependencies and deployment posture in the non-canonical
   Next/PostCSS/Sharp tree before any such deployment; its current state is **[UNVERIFIED]**.
3. Exercise capacity forecasts and lifecycle propagation on large, representative workspaces and
   real manager-entered estimates; distinguish observed operating practice from planning
   conventions. No production-scale performance or field validation is claimed.
