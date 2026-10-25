# Changelog

All notable changes to LEADOS are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and this project
uses [Semantic Versioning](https://semver.org/).

**Honesty note (Part 19):** this changelog was curated retroactively. The repository snapshot
used to write it contains no prior git history, no prior tags, and none of the stale status
reports referenced by earlier planning documents (`APP-STATUS-REPORT.txt`,
`APP-CAPABILITY-REPORT.md`, etc.) — see `docs/CONSISTENCY-SWEEP.md` for the full accounting. This
file therefore starts at the first version that can be verified against real code:
**v0.1.0**. No entries describe work that cannot be pointed at a file.

## [Unreleased]

### Added
- **Candidate retention review (Schema v18).** `settings.candidateRetentionDays` (default 180, `0`
  disables) drives a new `retentionReview` that lists candidate records past the window on `#/hiring`
  and raises signal `HIRE-08`. It is a *reminder*: nothing is deleted automatically, a candidate still
  in play on an open role is never flagged, a record marked "keep in touch" is listed as an exemption
  rather than silently skipped, a record with no dates is reported as unknown age, and deletion stays
  an explicit, audited action that also removes the evidence and graph edges.
- **Structural accessibility audit** (`tests/app/access-audit.test.mjs`, 12 tests): one `h1` per
  screen with no skipped heading levels, an accessible name on every interactive control (glyph-only
  buttons rejected), captioned tables with `scope`d headers and no empty header cells, landmark
  structure and skip link, dialog focus trap and restoration, and live-region announcements — on top
  of axe-core reporting zero violations across the three newest modules and their detail screens.
- **Large-workspace validation** (`tests/app/scale.test.mjs`, 5 tests): a 120-person / 240-goal /
  300-case / 180-item / 40-role / 320-candidate workspace with 900 typed edges is normalized,
  analysed, exported through all 19 CSV scopes, and rendered; every edge resolves at both ends and a
  second normalization is a no-op. Measured timings are printed so a regression is a number, not just
  a failure.
- An optional `caption` on the shared `table()` component, rendered as a visually hidden `<caption>`
  so a screen-reader user hears what a table is for before hearing its headers.

### Changed
- **Dependencies:** `next` 16.2.6 → **16.4.3**, `postcss` 8.5.8 → **8.5.31**, `eslint-config-next`
  16.2.6 → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11. `npm audit --omit=dev` goes from *1 critical,
  2 high* to **0 vulnerabilities** (11 Next advisories, including unauthenticated RCE in the Image
  Optimization API, plus PostCSS and sharp/libvips chains). The four remaining moderate advisories are
  a dev-only `drizzle-kit → esbuild 0.18.20` chain whose advisory is about a development server this
  repository never runs; the offered fix is a breaking downgrade of the migration CLI, so it was
  declined and documented instead of applied by force.
- `confirmDialog` now returns a promise and supports both call shapes (see Fixed).
- `openModal` restores focus to `main#view` when the trigger was re-rendered away, instead of dropping
  focus on `<body>`.

### Fixed
- **Destructive confirmations did not wait for an answer.** `confirmDialog` was callback-based, but
  cases, capacity and hiring used `await confirmDialog(...)` and treated the result as a boolean. The
  returned modal handle is truthy, so the record was deleted the instant the button was clicked,
  leaving a confirmation dialog on screen that could no longer change anything — and in the cases
  module the dialog had *no text*, because the caller passed `body:` while the primitive rendered
  `message:`. The promise now resolves only when the dialog closes (`true` on confirm, `false` on
  cancel, Escape, the close button or a backdrop click), `onConfirm` still fires for the
  callback-shaped callers, and `message ?? body` is rendered.
- **Two uncaptioned tables in `#/capacity`** (funding decisions, target-risk forecast) had no
  accessible name; both now carry a caption, and the shared helper supports one.
- **A typo could switch the retention reminder off.** A negative or non-numeric
  `candidateRetentionDays` was clamped to `0`, which means "off"; it now falls back to the default,
  because the safe failure direction for a privacy reminder is on.
- **O(roles × candidates) scans** in `hiringSummary` and the `hiring` CSV scope — the full candidate
  list was filtered inside the per-role loop, which is 1.5 M comparisons at 300 roles × 5,000
  candidates and ran on every render of `#/hiring`, `#/today` and the signals panel. Both now index
  candidates by role once.
- Focus lost to `<body>` after closing a dialog whose trigger a re-render had replaced.

## [Session 26] Selection & hiring (Schema v17)

### Added
- **Selection & hiring (Schema v17).** A new module at `#/hiring` treats hiring as a measurement
  problem with a decision at the end, not a pipeline with a score. A **requisition** records what the
  role must be able to do, who will interview, and (optionally) the three-point interview effort it
  consumes. A **candidate** record holds the evidence collected and the decision — and no protected
  characteristics.
  - Evidence is weighted by the method used, using Sackett et al.'s (2022) re-analysis of the
    personnel-selection meta-analyses (structured interviews `.42`, job-knowledge tests `.40`, work
    samples `.33`, cognitive ability `.31`, unstructured conversations `.19`, years of experience
    `.07`). Weights are combined in log-odds and converted back once.
  - Correlated evidence is discounted rather than double-counted: a repeat rating of the same
    competency by a different interviewer counts ×0.5, by the same interviewer ×0.25. A 3/5 rating is
    genuinely neutral. Rater disagreement of 3+ points on a competency is surfaced with an
    instruction instead of being averaged away.
  - Every assessment carries a **falsification test** ("how many strong contrary observations would
    cross the 50% line") and is labelled decision support, never a prediction. The offer gate is an
    explicit *convention* (evidence weight ≥ 0.50, ≥ 2 methods, all required competencies covered),
    and proceeding without it requires a recorded acknowledgement.
  - Funnel with conversion rates, a cycle-time figure withheld below two completed hires, and a cost
    of vacancy reported only from a daily figure the leader recorded — otherwise the delay is shown
    as unpriced rather than derived from a salary band.
  - **Process fairness without special-category data**: the same competencies assessed for everyone
    who reached the same stage, with uneven coverage reported as a finding.
- **Cross-module automation (`RULE-HIRE-01`..`03`), inside the existing event engine.**
  `RULE-HIRE-01` registers a requisition's recorded interview effort as a committed `hiring` capacity
  item, refreshes it in place, completes it as delivered when the seat is filled and releases it when
  the role is held or cancelled. `RULE-HIRE-02` turns an accepted offer into a roster record, a
  new-hire 30-60-90 plan with standard checkpoints, three typed graph edges
  (`candidate → requisition`, `requisition → person`, `person → onboarding`) and a completed
  interview reserve — in one transaction. `RULE-HIRE-03` escalates a role that has not moved for
  `hiringStallDays` (default 30) through the shared escalation path, so the resulting operational case
  arrives with FMEA, financial PERT fields, a stakeholder coalition, a DACI decision and an
  accountable delegation already attached; it fires at most once per role, even if that case is later
  closed.
- Signals `HIRE-02`–`HIRE-07` (stalled roles, target-date slippage, roles with no competencies,
  interview effort missing from the plan, final-round decisions short on evidence, uneven process
  coverage), a `#/today` hiring card, three hiring conventions in Settings, and a `hiring` CSV scope
  flagged sensitive because it contains named candidate data.
- Demo workspace now includes two live roles, one filled role, four candidates with real evidence
  (including one deliberately thin and one rejected with a written rationale), and the capacity
  reserve the rules engine would have created.

### Fixed
- Two new tables rendered an empty header cell, which `axe-core` reports as `empty-table-header`;
  both now carry a screen-reader label.

### Notes
- The first draft of this module used Schmidt & Hunter's (1998) validity table and had the
  unstructured-interview figure wrong (`.18`, which is years of experience; the 1998 value is `.38`).
  Retrieving the current literature then showed that table has been superseded: Sackett et al. (2022)
  revised every estimate downward and reordered them. The coefficients, the evidence floor and one
  UI claim ("a work sample is the highest-validity signal") were all corrected before release. See
  `RESEARCH.md` §36.

### Added
- **Team capacity, flow and portfolio allocation (Schema v16).** The app can now answer the
  question every other module assumed away: *can the people I have actually deliver what is
  committed, and what has to give?* `#/capacity` shows supply built from focused hours with a
  transition ramp and an explicit operational reserve, demand separated into **committed**,
  **requested-but-undecided** and **unestimated** work, a utilisation band (slack / healthy /
  elevated / overloaded / infeasible) with the slack or deficit in person-days, and the named
  bottleneck. Flow is modelled, not guessed: **Little's Law** gives WIP, throughput and cycle time
  from delivered items only, and the app refuses to state a rate below two completions; **Kingman's
  diffusion approximation** turns current utilisation into a queue-delay multiplier so the cost of
  over-committing is visible before it is paid. Each plan item carries a three-point PERT effort and
  value, so the view ranks by **value density**, marks the marginal funding boundary, proposes the
  lowest-value-density items to release, and forecasts a cumulative P50/P80/P90 date range with
  per-target risk instead of one false-precision date.
- **Capacity is maintained by the rules engine, not by hand.** `RULE-CAP-01` gives an Operational
  Case a committed capacity reserve the moment it is registered, refreshes it when the estimate
  changes, releases it on resolution, reinstates it on reopen and removes it on delete — so diverted
  person-days are real records, not a number in a card. `RULE-CAP-02` opens exactly one trade-off
  decision when the plan exceeds 100% utilisation, with the numbers and concrete options including
  the cheapest item to defer by name. `RULE-CAP-03` records a check-in on a goal when the work
  funding it is deferred or cut (and the follow-up when it is re-funded), while funding *new* work
  writes nothing. Five new signals (`CAP-01`..`CAP-05`) cover over-commitment, queue delay, an
  undecided backlog, unestimated work, and a plan whose targets are already unreachable.
- **Operating surface.** `#/capacity` (nav badge, Today attention card), add/edit work dialog,
  a DACI trade-off dialog and a release-with-reason dialog; per-person load bars, an approximate
  utilisation trend reconstructed from item lifespans, the active-rule card, capacity settings, and
  a new `portfolio` CSV export scope (18 total) that is formula-injection safe.

### Changed
- Schema **v16**: adds `state.portfolio` plus four planning conventions. The v15→v16 migration
  creates an empty ledger and **invents no effort or value**; open cases with recorded capacity days
  still count as implicit reserves at read time.
- `deleteCase` now also removes the case's capacity reserve; `reopenCase` reinstates it.
- README, ROADMAP, RESEARCH (§34), FEATURES and the session-24 audit document record the new layer
  and its honest limits (manager-entered estimates, an approximate trend, no real-browser
  verification in this container).

### Added in earlier sessions (Sessions 1–23)
- **Internal role-transition 30-60-90 plans (Schema v10).** A 30-60-90 plan now records what kind of
  transition it is — `new-hire` or `role-transition` — and, for transitions, a required label naming the
  new scope ("Team Lead · Platform"). A tenured person promoted or moved into a new role gets the same
  scaffolding as a joiner (role clarity, peer buddy, stakeholder introductions, early win, Day 30/60/90
  check-ins and the Day 90 completion gate), but with transition-specific starter checkpoints: agree the
  old-role **handover inventory**, write down how the new role differs, deliver a first early win *in the
  new seat*, and hold an explicit 60-day **old-habits calibration**. The plan is anchored to the day the
  new role starts and can never precede the day the person joined; `person.startDate` and tenure are never
  rewritten, so joiner-only signals (`ONB-01`, `ONB-02`) stay truthful while `ONB-03`–`ONB-05` name the
  transition. The plan dialog defaults a tenured person to a transition anchored to today; `#/onboarding`
  becomes *"Onboarding & transitions"* with per-kind counts and badges; person pages, 1:1 agendas, prep
  sheets, timelines and the `onboarding`/`actions` CSV scopes all carry the kind (formula-safe
  `plan_kind`/`plan_label` columns). Pre-v10 plans migrate as `new-hire` with no invented label, and an
  existing plan can be reclassified in place without losing checkpoints, check-ins or history.
- **Development-commitment ledger (Schema v9).** A GROW "will" action is no longer a checkbox with a
  date. Each commitment can be closed in a review, **carried forward** with a new date (the original
  stays as history and the successor keeps the first-agreed date, so "carried 2× since 14 Sep" is
  derived from the chain rather than stored), or **dropped with a mandatory reason**. Dropped is never
  counted as done and leaves the completion denominator, so moving a date cannot read as progress.
  A corrupted chain — orphaned successor, missing back-reference, cycle — is repaired by reopening the
  promise with a warning instead of losing it.
- **Development reviews as records, not edits.** *Hold review* captures the date, what was actually
  discussed, the outcome for every live commitment (done / still open / carried / dropped) and the next
  date agreed. Pushing `reviewOn` without holding a review increments `reviewDeferrals` and stamps
  `reviewMovedOn` instead of silently rescheduling; holding one resets both and sets the plan date to
  the agreed next review.
- **Two new signals.** `GROW-06` fires when one commitment has been carried two or more times (the GROW
  equivalent of `CONV-06`), and `GROW-07` fires when a review date has been moved twice without a review
  being held. Both name the person, carry the dates as evidence and one action.
- **Follow-through surfaces.** `#/growth` gains live commitments with carry badges, overdue dates,
  per-commitment **Carry** / **Drop** buttons, an expandable record of closed and moved commitments, a
  review log with what each review settled, and **Hold review**; person pages show carried work and where
  the review stands; Today's loose ends name the person whose review is overdue and flag commitments
  carried twice. The `actions` CSV adds `state`, `carried_forward_count` and `first_agreed_on` to GROW
  rows, and the `growthPlans` scope adds `will_open`, `will_carried`, `will_dropped`, `reviews_held`,
  `last_reviewed_on` and `review_deferrals`.
- **Dated snapshots rewind the development ledger too.** A commitment completed, dropped or carried
  after a snapshot date is shown as it was at that date, a successor agreed later is withheld, and a
  review recorded later is excluded with `reviewOn` left `null` and the growth dimension marked
  `approximate` rather than reconstructed.
- **Demo.** Mei's plan now exercises every state: one commitment carried twice and still open, one
  carried once and late, one closed in a review, one dropped with a reason, and a review date moved
  twice since the last review was held.

- **Commitment ownership (Schema v8).** Every 1:1 action now records who owes it — `them`,
  `leader` or `shared` — or stays explicitly unrecorded, which the board counts rather than
  guessing. A promise carried into a later 1:1 keeps its owner; reassigning one is a separate,
  audited action (`oneonone.action.owner`) that refuses closed promises and already-carried
  originals. The actions CSV carries a truthful `owner` column (blank when unrecorded, absent for
  GROW commitments) and the printable prep sheet marks who owes each promise.
- **A private "What you owe" list.** Today gains a card listing the leader's own open promises with
  a one-click Done and a 1:1 shortcut; the 1:1 board gains an "I owe" stat and an inline owner
  select (accented when the promise is the leader's). Signal `CONV-07` fires per person when the
  leader is late on a promise they own, at severity 3 — or 4 when one person is waiting on more
  than one.
- **1:1 follow-through ledger (Schema v7).** Logging a 1:1 now opens with the previous meeting's
  open promises and records an explicit outcome for each: done in this conversation, still open,
  carried forward with a new date, or dropped with a reason. The original action keeps a link to
  its successor, carry depth and "first agreed" are derived from the chain, and a broken, backward
  or cyclic link reopens the promise with a warning instead of losing it. Visible in the 1:1
  dialog, the 1:1 board (`#/oneonones` — follow-through stats, "Up next", "Commitments that keep
  moving", carried badges and a per-meeting ledger), the person page, the printable prep sheet and
  the `actions` / `oneOnOnes` CSV exports. Adds signal `CONV-06` (a promise carried at least twice)
  and a "N promises closed in a 1:1" win.
- Canonical zero-build leadership workspace with roster, 1:1s, SBI feedback, goals, GROW,
  anonymous pulse, decisions, recognition, succession, health and traceable signals.
- Feedback observation dates, configurable observation-to-conversation latency, `FB-06`, and
  date correction that leaves missing values explicitly unmeasured.
- Tri-state goal co-authorship with editable co-authored/leader-set/unknown context and explicit `GOAL-06`.
- Outcome delegation with decision authority, support, due dates, dated check-ins, completion,
  return-to-leader history, `DEL-01`…`DEL-03`, 1:1 agenda integration and a dedicated route.
- Evidence-linked performance-review packets with employee reflection, manager assessment,
  optional anchored ratings, calibration warnings, source drill-down and print/save-PDF.
  Packets now include feedback latency, goal authorship and dated delegation outcomes.
- Schema v2/v3 migrations, review/delegation export/import, frozen completion snapshots and audit events.
- 113 canonical domain, persistence and jsdom UI integration tests (`npm test`).

### Changed
- `CONV-05` now reports only commitments the team owes. Overdue promises the leader owns are
  reported by `CONV-07`, so one overdue record no longer produces two findings.
- CSV exports no longer carry a fabricated `owner` column for GROW, feedback and onboarding
  commitments: the app never recorded an owner there. The
  one-on-ones export reports `carried_in` / `carried_out` instead of the ambiguous
  `carried_forward`, and the actions export adds `state`, `carried_forward_count`,
  `first_agreed_on` and `confirmed_in_meeting`.
- Historical health snapshots rewind completions, drops and carry links together, so a trend can
  no longer show a promise as closed before the meeting that closed it.

### Fixed
- Key-result dialogs now write to the goal that opened them and missing goals fail explicitly.
- Development-plan editing preserves plan identity, options and commitments.
- Development overdue counts use the injected clock for deterministic results.
- Goal authorship editing preserves goal identity, key results and check-ins; missing goals fail explicitly.
- Delegation chronology is validated before writes, and later same-day check-ins correctly supersede
  an earlier blocked state without erasing the overdue fact.
- Demo cleanup removes delegations attached to fabricated people while preserving real-person work.
- The 1:1 board's promise table had an unlabelled action column (axe `empty-table-header`); it is
  now labelled "Actions".
- A hand-edited or future-version `owner` value is cleared and reported
  (`1:1s: cleared N unrecognised commitment owner(s)`) instead of being coerced into a plausible
  owner.

### Security
- Anonymous pulse answers and upward feedback about the manager are excluded from review
  evidence. Review source routes are normalized to local fragments on import.
- Legacy Next.js/PostCSS/Sharp advisories remain documented; the canonical app does not load
  that dependency chain and no forced major legacy upgrade was applied.

## [0.1.0] - 2026-01-01

First documented, verifiable release.

### Added
- `leads` and `score_events` tables (`src/db/schema.ts`).
- Rule-based lead scoring, `rule-v1` (`src/lib/scoring.ts`): additive, fully explainable, no ML.
- Lead API: create/list/filter (`src/app/api/leads/route.ts`), get/update/delete by id
  (`src/app/api/leads/[id]/route.ts`), force rescoring (`src/app/api/leads/[id]/score/route.ts`).
- Dashboard at `/` to add leads, view scores with breakdown tooltip, and record a
  qualify/disqualify/contacted/converted decision (`src/app/page.tsx`,
  `src/components/LeadBoard.tsx`).
- Health check endpoint reporting DB connectivity and app version
  (`src/app/api/health/route.ts`).
- Seed script with four sample leads for onboarding (`scripts/seed.ts`, `npm run seed`).
- Full Diátaxis documentation set under `docs/` (tutorial, how-to guides, reference, explanation),
  tied together by `docs/INDEX.md`.
- Release engineering: `docs/RELEASING.md`, `docs/ROLLBACK.md`,
  `.github/workflows/release.yml`, `.github/workflows/ci.yml`.
- Deployment: single canonical Docker path, `Dockerfile`, `deploy-production.sh`,
  `docs/DEPLOYMENT.md`.
- Governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/adr/` with ADR-0001 and ADR-0002,
  `docs/MAINTAINER-RUNBOOK.md`.
- Dependency-free docs link checker (`scripts/check-docs-links.mjs`), wired into
  `npm run verify` and CI.

### Changed
- Renamed the project from the scaffold name "Arena Next.js PostgreSQL Starter" to **LEADOS**
  across `package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, and an internal global variable
  in `src/db/index.ts`. See `docs/CONSISTENCY-SWEEP.md` item C-1.
- `/api/health` now also reports `service` and `version` fields, not just `ok`.

### Known gaps (tracked, not hidden)
- No authentication/authorization anywhere in the app.
- No multi-tenancy; single shared table for all leads.
- No automated tests, coverage, or mutation-testing reports.
- No realtime transport; the dashboard only refetches after actions it took itself.
- No fairness-auditing tooling, because there is no learned model to audit.
