# Audit — 2026-10-25, session 26: Selection & hiring (Schema v17)

## Repository identity and scope

`git remote get-url origin` → `https://github.com/shahramclaude/Leados.git` (match; verified before
reading or changing anything). Worktree clean at `fe7b896`; work on
`arena/caddc526-leados`. The canonical product remains `index.html` + `app/**` (zero build, no
network, no accounts). The legacy `src/**` Next/React/Drizzle tree and the root `*.tsx` files were
not executed and are **[UNVERIFIED]**; nothing in this session changes that.

Baseline before any change: `npm ci --no-audit --no-fund` (node_modules is not committed), then
`npm test` → **341 passed, 0 failed across 26 suites**.

## What the audit found

The product modelled almost every leadership decision *except the one that determines who is in the
room*. Concretely:

1. **The capacity plan could not see interviews.** `buildCapacityModel` derived demand from goals,
   cases, delegations, onboarding and maintenance, but a team spending a day a week interviewing
   looked fully available. Opening a role therefore made the plan quietly wrong.
2. **The offer had no handoff.** `addOnboardingPlan` could create a 30-60-90 plan, but nothing
   connected "we hired this person" to "they are on the roster with a plan". That is the classic
   first-week failure the module existed to prevent, and the app had no record of it at all.
3. **There was no evidence model anywhere.** Reviews (`domain/reviews.js`) grade the *past* of an
   existing employee; nothing helped decide a future one, and nothing recorded *how* a judgement was
   formed. That matters because the method used is the strongest known determinant of whether a
   hiring judgement is any good.

Nothing was rewritten. The module was added as a peer of `cases` and `capacity`, reusing the store,
the action layer, the typed link graph, the escalation path and the event engine.

## Changes, by layer

| Layer | File | What changed |
|---|---|---|
| Domain (pure) | `app/core/domain/hiring.js` (new) | Validity table, log-odds evidence combination with correlated-evidence discounting, competency coverage, candidate assessment, process parity, funnel/cycle-time/vacancy arithmetic, suggested effort, requisition and workspace summaries, stalled-requisition detector. No DOM, no storage, no clock. |
| Contract | `app/core/schema.js` | `SCHEMA_VERSION = 17`; collections `requisitions`/`candidates`; settings `hiringBaseRate`, `hiringStallDays`, `interviewHoursPerStage`; `normalizeRequisitions`/`normalizeCandidates` with repairs (unknown status, unordered PERT, dangling interviewer/person/competency references, unknown method or out-of-range rating, orphaned candidate); link entity sets extended; `MIGRATIONS[16]` adds empty ledgers and conventions without inventing records. |
| Graph | `app/core/domain/cases.js` | Entity types `requisition`/`candidate`; relations `hires`, `assessed-for`, `onboards`; `resolveLinkedEntity` routes for both. |
| Capacity vocabulary | `app/core/domain/capacity.js` | `hiring` work kind and `requisition` provenance; `portfolioSource` resolves a requisition. |
| Engine | `app/core/domain/automation.js` | `RULE-HIRE-01` `syncRequisitionCapacity`, `RULE-HIRE-02` `onCandidateHired`, `RULE-HIRE-03` metadata plus a `buildCaseFromUpstreamEntity` branch that prices vacancy exposure only when it was measured; `previewHiringPropagations` for the dialog. |
| Actions | `app/actions.js` | `addRequisition`, `updateRequisition`, `deleteRequisition`, `addCandidate`, `updateCandidate`, `deleteCandidate`, `recordEvidence`, `deleteEvidence`, `decideCandidate`, `acceptOffer`, `syncHiring`; `maybeEscalateStalledHiring`; settings validation for the base rate. All validation returns `{ok:false, error, field}` and writes an audit event. |
| UI | `app/views/hiring.js`, `app/ui/hiring-modals.js` (new), `app/main.js`, `app/views/today.js`, `app/views/settings.js`, `app/ui/modals.js`, `app/styles.css` | `#/hiring`, `#/hiring/:id?candidate=`, five dialogs, nav entry + decision badge, Today card, three settings rows, and the style block for the new components. |
| Signals / export / demo | `app/core/domain/insights.js`, `app/core/csv.js`, `app/core/demo.js`, `app/core/store.js` | `HIRE-02`…`HIRE-07`; `hiring` CSV scope (19 total, sensitive); demo roles/candidates/reserve; demo cleanup keeps the graph consistent for the new types. |

## Self-caught defects (found by the work, fixed rather than asserted away)

1. **Wrong coefficient and a superseded table.** The first draft used Schmidt & Hunter (1998) with
   `.18` for unstructured interviews — that figure is *years of experience*; 1998 has `.38`. Retrieval
   then showed Sackett et al. (2022) has superseded the table: work samples fell from `.54` to `.33`,
   cognitive ability from `.51` to `.31`, and structured interviews (`.42`) now rank first. The
   coefficients, the evidence floor (0.60 → 0.50) and one UI claim were corrected. Recorded in
   `RESEARCH.md` §36 because the first draft would have shipped plausible-looking, wrong advice.
2. **`ctx.now` used as a function** in the new view and dialogs (`ctx.now()`); it is a `Date`. Caught
   by the JSDOM render test, which surfaced the crash instead of a blank screen.
3. **A malformed ternary** in the detail header's cycle-time stat.
4. **Two empty `th` cells** — axe-core `empty-table-header`. Both now carry a screen-reader label.
5. **Leftover scaffolding in the new test file** — a bogus import of a fixture that never existed and
   a no-op assertion that asserted nothing — removed before the suite was trusted.

## Verification (measured this session)

- `npm test` → **368 passed, 0 failed, 0 skipped across 27 files** (341 → 368; +27 in
  `tests/app/hiring.test.mjs`).
- `axe-core` in JSDOM → 0 violations on `#/hiring`, `#/hiring/:id?candidate=…` and the requisition
  dialog.
- `node --check` on every touched module; `npx eslint` reports no findings on the 19 files this
  session touched (four new/changed plus the fifteen edited).
- `scripts/serve.mjs` → `200` for `/`, `app/main.js`, `app/views/hiring.js`,
  `app/ui/hiring-modals.js`, `app/core/domain/hiring.js`, `app/styles.css`.
- Cross-module example traced end to end in the suite: open a role with an estimate → one committed
  `hiring` capacity item + `consumes-capacity` edge; record two pieces of evidence → the offer gate
  opens; decide to hire → stage `offer`; accept → roster record + new-hire plan + three edges +
  reserve completed; sync twice → still exactly one item, one plan, one case.

## Limits

No GUI browser, screen reader, mobile device or real hiring round was available in this container.
Rendering, keyboard traversal, print output, AT announcements and — most importantly — whether the
validity-weighted read helps a real manager make a better decision are all **[UNVERIFIED]**. The
coefficients are population averages with wide credibility intervals (structured interview `.42`,
80% CI `.18`–`.66`) used as fixed weights, not a validated model of any individual.
