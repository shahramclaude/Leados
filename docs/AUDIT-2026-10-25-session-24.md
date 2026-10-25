# Session 24 audit — capacity, flow & portfolio allocation (Schema v16)

**Date:** 2026-10-25 · **Branch:** `arena/f17d0077-leados` · **Base commit:** `9b82f8b`

## 0. Repository identity and sync

`git remote -v` reported `origin https://github.com/shahramclaude/Leados.git` (fetch and push)
before any read, edit, test, commit or push. The working branch is
`arena/f17d0077-leados`, branched from `9b82f8b` on `main`. No mismatch to report.

## 1. What was actually in the tree at session start

Read: `index.html`, `app/main.js`, `app/actions.js`, `app/core/{schema,store,csv,demo,time}.js`,
`app/core/domain/*.js` (21 modules), `app/views/*.js` (21 views), `app/ui/*.js` (11 modules),
`app/styles.css`, `tests/app/**` (25 files), and the governing documents
(`README.md`, `ROADMAP.md`, `RESEARCH.md`, `AI-SESSION-LOG.md`, `docs/AUDIT-*-session-23.md`).

Verified at session start:

- Canonical product is the zero-build browser app under `index.html` + `app/**`; the
  Next.js/React/Drizzle trees at `src/**`, root `*.tsx` and `drizzle/` remain non-canonical and
  were **not** executed. Their status is **[UNVERIFIED]** and is unchanged by this session.
- `npm test`: **322 passed, 0 failed, 0 skipped across 25 test files** after `npm ci`
  (the sandbox had no `node_modules`, so the first run failed 18 files on a missing `jsdom`).
- Schema **v15** added `state.cases`, `state.links` and `settings.caseReviewDays`; the
  `automation.js` engine ran 7 deterministic rules for case events.
- CSV scopes: **17**.

## 2. Gap analysis (why this module, not another)

The inventory in `RESEARCH.md` §§5–33 plus this audit produced a structural finding rather than a
feature list: LeadOS recorded *intent* exhaustively (goals, delegations, cases, 30-60-90 plans,
decisions, feedback, reviews) and answered nothing about *feasibility*. There was no place where
the leader could see whether the people available could deliver what was committed, what should be
removed when they could not, or what date range the funded work actually implies. `CASE-04` even
reported diverted person-days without any ledger to compare them against.

Selected: **Capacity, Flow & Portfolio Allocation** (`#/capacity`, Schema v16), wired into the
existing rules engine rather than added as a standalone dashboard.

Rejected this session: a per-person hours field (invites contracted rather than focused hours);
auto-derived effort from goal/delegation counts (invented numbers); engine-driven automatic
deferral (removes the leadership decision); time-entry (different product, needs a backend).

## 3. What shipped

| Layer | File(s) | Notes |
|---|---|---|
| Pure domain | `app/core/domain/capacity.js` (new, ~520 lines) | `buildCapacityModel`, `flowMetrics`, `rankPortfolio`, `deliveryForecast`, `capacityHistory`, `capacitySummary`, `pertTriple`, `normalCdf`, `utilisationBand`, `portfolioSource` |
| Rules engine | `app/core/domain/automation.js` | `RULE-CAP-01`, `RULE-CAP-02`, `RULE-CAP-03`; `syncCaseCapacityReserve`; capacity lines in `previewCasePropagations` |
| Schema | `app/core/schema.js` | v16, `COLLECTIONS += portfolio`, `normalizePortfolio`, migration `15 → 16`, four settings, `portfolio` in link id-sets |
| Rewind | `app/core/domain/health.js` | `reconstructStateAt` rewinds `state.portfolio` (created/decided/completed/released dates) |
| Graph | `app/core/domain/cases.js` | `portfolio` entity type, `consumes-capacity` and `funds` relations, resolver |
| Actions | `app/actions.js` | `addPortfolioItem`, `updatePortfolioItem`, `setPortfolioDecision`, `completePortfolioItem`, `releasePortfolioItem`, `deletePortfolioItem`, `syncCapacityPlan`; `reopenCase` reinstates the reserve; `deleteCase` removes it |
| UI | `app/views/capacity.js`, `app/ui/capacity-modals.js`, `app/main.js`, `app/views/today.js`, `app/styles.css` | Operating-plan view, dialogs, nav entry + badge, Today card, styles |
| Signals | `app/core/domain/insights.js` | `CAP-01`…`CAP-05`, new domain, grouped title, route |
| Data/export | `app/core/demo.js`, `app/core/csv.js`, `app/core/store.js` | 11 demo plan items (including two case reserves), `portfolio` scope (18 total), demo-cleanup provenance repair |
| Tests | `tests/app/capacity-flow.test.mjs` (new) + 14 updated files | 18 new tests |

## 4. Cross-module propagation, traced

**A. Case → capacity plan (RULE-CAP-01).** Registering a case with
`capacityDays {4, 8, 14}` created one reserve record (`kind: capacity-reserve`,
`decision: funded`, `sourceType: case`, `createdOn` = the case's `openedOn`), linked
`case --consumes-capacity--> portfolio`, and reported `RULE-CAP-01 created` in the case dialog's
live preview before saving. Editing the estimate to `{2, 4, 6}` refreshed the **same** record id
(no duplicate, no orphan). Resolving the case set `status: released`, `releasedOn: today`, and
`demand.reserveDays` fell to 0. Reopening the case reinstated it. Deleting a case removes its
reserve.

**B. Capacity plan → decision (RULE-CAP-02).** With one person (12.8 allocatable days), funding a
10-day item and then an 8-day item pushed utilisation to 140%. Exactly one decision was created:
`Capacity trade-off: plan is 140% committed`, with the numbers in `question` and four generated
options including *"Defer 'Low value clean-up' to free 8.3 day(s)"* (named because it has the
lowest value density) and *"Hold the plan and accept the queue delay"*. Adding a third funded item
created no second decision, and `syncCapacityPlan()` was idempotent.

**C. Funding decision → goal (RULE-CAP-03).** Cutting a goal-linked item wrote one check-in
`[Portfolio <id> cut] …` on the goal and moved an on-track goal to at-risk; re-running the same
decision changed nothing; re-funding wrote the follow-up. Creating a *newly funded* item writes no
note, so the goal ledger is not spammed.

**D. Existing rules still intact.** The five original case rules, the delegation→monitoring loop,
case resolution → goal check-in, and upstream escalation all still pass unchanged; the case
dialog's propagation preview grew from 5 to 6 lines (capacity reserve; the trade-off line appears
only when the projected plan becomes infeasible).

## 5. Verification

- `npm test`: **340 passed, 0 failed, 0 skipped across 26 test files** (106 s).
- `axe-core` (JSDOM): **0 violations** on `#/capacity` and on the open add-work dialog.
- `node --check` on every modified/added ES module; `npx eslint` on all changed app modules: clean.
- `scripts/serve.mjs`: `200` for `/`, `/app/main.js`, `/app/views/capacity.js`,
  `/app/ui/capacity-modals.js`, `/app/core/domain/capacity.js`, `/app/styles.css`.
- Migration: a v15 blob migrates to v16 with an empty portfolio and default planning conventions;
  a five-defect portfolio file normalizes with four accepted records, repaired provenance, a
  forced-funded reserve, a clamped future decision date, a cleared archived owner and a re-ordered
  PERT triple — all reported in warnings.

## 6. Not verified / known gaps

- **Real browser:** no Chromium binary is installed in this container. Layout, mobile overflow,
  keyboard traversal and print/PDF of `#/capacity` are **[UNVERIFIED]**; the JSDOM render and axe
  scan are not a substitute.
- **Screen readers:** the capacity bar exposes a text `aria-label` summary, but announcement
  behaviour on NVDA/JAWS/VoiceOver/TalkBack was not tested. **[UNVERIFIED]**
- **Estimates are manager-entered conventions**, not measurements: focused hours, ramp factors,
  operational reserve, WIP limit, effort, value and targets. The utilisation history is labelled
  `approximate`.
- **Legacy trees** remain non-canonical and unexecuted; the production dependency audit for the
  Next/PostCSS/Sharp chain was not rerun.

## 7. Files changed

Added: `app/core/domain/capacity.js`, `app/ui/capacity-modals.js`, `app/views/capacity.js`,
`tests/app/capacity-flow.test.mjs`, `docs/AUDIT-2026-10-25-session-24.md`.

Modified: `app/actions.js`, `app/core/csv.js`, `app/core/demo.js`, `app/core/domain/automation.js`,
`app/core/domain/cases.js`, `app/core/domain/insights.js`, `app/core/schema.js`,
`app/core/store.js`, `app/main.js`, `app/styles.css`, `app/ui/modals.js`, `app/views/settings.js`,
`app/views/today.js`, `index.html`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`,
`AI-SESSION-LOG.md`, and 14 existing test files (schema-version, migration-chain and CSV-count
assertions).
