# Audit — 2026-10-26, session 35: Negotiation Workbench (Schema v23)

## Repository identity and scope

`git remote get-url origin` → `https://github.com/shahramclaude/Leados.git` (match; the standing
stop-condition was not triggered). All work landed on branch `arena/0b1686be-leados`, branched from
`b69df55` of `main`. The canonical product remains `index.html` + `app/**`: zero-build, local-first,
native ES modules, localStorage, no backend, no network calls, no new dependencies. The frozen
`src/**`, root `*.ts/*.tsx`, `deprecated/**` and `public/**` trees were not opened for edits, and no
canonical module imports from them (`scripts/check-canonical-boundary.mjs` passes).

Baseline at session start: **457 tests, 457 passing**, Schema v22, 27 automation rules, 22 CSV
scopes. Baseline at session end: **475 tests, 475 passing** (one full-run flake on a pre-existing
JSDOM UI test, `case-calibration` #90, passed in isolation and on rerun — see Limits), Schema v23,
30 automation rules, 23 CSV scopes.

## What the audit found

The product modelled operational risk (FMEA/PERT cases), decisions (DACI), capacity and change,
but the *bargaining* that precedes many of those records — vendor renewals, internal resource
trade-offs, scope/deadline deals — had no home. A leader facing a counterparty could not record:

1. **A walk-away plan (BATNA).** Without it, every concession is unprincipled and the app could not
   warn when accepting at a reservation price is worse than the no-deal alternative (Fisher & Ury,
   1981, *Getting to Yes*).
2. **Reservation prices and the Zone of Possible Agreement.** Raiffa's (1982) negotiation analysis
   asks whether the two sides' reservation envelopes overlap; nothing in the workspace computed a
   ZOPA, measured a reservation gap, or distinguished "no overlap" from "not yet estimated".
3. **What happens after impasse or agreement.** A deadlock had no path into the operational-case
   engine (FMEA, DACI, capacity), and a closing session's commitments had no path into delegations —
   the two moments where negotiated value is most often lost.

Nothing was rewritten. The module was added as a peer of `cases` and `changes`, reusing the store,
graph resolver, modal framework, CSV serializer and insight pipeline.

## Changes, by layer

- **Domain engine** (`app/core/domain/negotiation.js`, new, 479 lines): `analyzeNegotiationIssue`
  (ZOPA geometry for minimize/maximize issues, gap math, aspiration-vs-walk-away target warning,
  honest `incomplete` state), `evaluateNegotiationPrep` (weighted Fisher & Ury checklist, max weight
  9), `batnaWarnings` (same-unit dimensional check; deliberately silent across mixed units),
  `summarizeNegotiation` and `negotiationsRollup` (session/review drift, high-stakes threshold at
  25,000 or the strategic flag, weighted ZOPA coverage, attention queue that includes impasses).
- **Schema v23** (`app/core/schema.js`): additive `negotiations` collection with repair-not-reject
  normalization (unknown kind/status repaired, future opened date clamped, dangling goal link
  cleared, weights clamped 1..5, blank-title records dropped with a warning), `negotiation` added to
  the link entity sets; the `22 → 23` migration only guarantees an empty list — no field is invented.
- **Automation** (`app/core/domain/automation.js`, now 30 rules): `RULE-NEG-01` provenance/goal/
  mandate-decision/coaching fan-out, `RULE-NEG-02` agreement-term delegations with explicit
  `ownership-gap` propagation, `RULE-NEG-03` impasse escalation through the standard `addCase`
  path — all idempotent via edge de-duplication, with an `autoPropagate` kill switch per record.
- **Action layer** (`app/actions.js`): `addNegotiation`, `updateNegotiation`,
  `setNegotiationStatus` (guarded by `NEGOTIATION_TRANSITIONS`), `recordNegotiationAgreement`,
  `reopenNegotiation`, `deleteNegotiation` (scoped edge cascade; other entities' edges preserved).
- **UI**: `app/ui/negotiation-modals.js` (new, 523 lines; register/edit dialog with live ZOPA badge,
  prep readout and parallel-propagation preview; agreement dialog), `app/views/negotiation.js`
  (new, 471 lines; tabbed list and detail screen with ZOPA table, checklist, terms, timeline and
  graph links), nav/router/title wiring in `app/main.js`, and a Negotiations card on Today.
- **Insights** (`app/core/domain/insights.js`): six signals `NEG-01`..`06` with a new `Negotiation`
  domain in `DOMAIN_ORDER`, `GROUP_TITLES` and `GROUP_ROUTES`.
- **CSV** (`app/core/csv.js`): the 23rd purpose-limited, CWE-1236 formula-safe scope
  (`negotiations`, 35 columns; counterparty formula strings are neutralized like every other scope).
- **Demo** (`app/core/demo.js`): three labelled demo negotiations (active vendor renewal with a
  mandate decision and three graph edges, an internal secondment in prep, a closed agreement with
  owned terms and a follow-up delegation). The seed is deliberately healthy: zero `NEG-*` findings
  and zero attention items on the demo baseline, asserted by test.
- **Tests**: `tests/app/negotiation.test.mjs` (new, 18 tests, 711 lines) plus version-pin updates
  across the existing 21 migration/calibration suites.

## Self-caught defects (found by the work, fixed rather than asserted away)

1. **Fabricated zero reservations.** `finiteNumber(null)` returned `Number(null) === 0`, so after
   schema normalization a negotiation issue missing the counterparty estimate was analyzed as a
   reservation price of zero, manufacturing a false no-ZOPA gap. Fixed to treat `null`/`undefined`/
   empty string as "not recorded"; an engine test now locks the regression from both directions.
2. **Impasses were invisible on Today and the list queue.** `needsAttention` is open-record scoped,
   so an impasse (a closed status) never entered `rollup.attention`, even though the Today card only
   renders from that list. The rollup now unions impasses into `attention` while keeping the
   dedicated `impasses` bucket.
3. **Singular/plural route drift.** The view and insight actions linked `#/negotiation/:id` while
   the router only resolves `#/negotiations/:id`; every link would have 404'd in a browser. All
   call sites (view, insights, graph resolver) now use the plural route, asserted by the UI test.
4. **Two accessibility defects in the new dialogs** (found by axe-core in the JSDOM workflow, not by
   inspection): the originating-record select and the agreement-term text/date/number inputs lacked
   accessible names; fixed with `aria-label`s and re-verified to zero violations.

## Verification (measured this session)

- `npm test` → **475/475 passing across 38 suites** (Node's built-in test runner; full rerun after
  the single flake described below).
- `npm run lint` → clean across the repository; `npm run check:boundary` → 79 app modules / 38 test
  suites, zero quarantined-tree or network leaks; `npm run check:links` → 88 links across 107
  markdown files resolve.
- Cross-module propagation trace, executed through the real action API: create a strategic
  negotiation → goal `impacts-goal` edge, DACI mandate `decides` edge, person `coaches` edge;
  move to impasse → one operational case with an `escalates-from` edge, reused (not duplicated) on
  a second deadlock; record an agreement with one owned and one ownerless term → exactly one
  `tracks-followup` delegation plus one `ownership-gap` propagation; delete → all negotiation edges
  cleared while the other negotiation's graph is untouched. Each step has a named test.
- JSDOM + axe-core workflow: demo list, vendor detail, agreed detail, register-dialog submit
  (persisted through `ctx.api`), agreement-dialog submit (delegation created), and the Today card
  appearing only when an overdue session exists — zero axe violations, zero console errors.
- Demo baseline honesty: `buildDemoState` normalizes without warnings and fires no `NEG-*` rule.

## Limits

- One full-suite run reported `case-calibration` UI test #90 failing; it passes in isolation and
  on every rerun. No negotiation code touches that path; the evidence points at pre-existing JSDOM
  timing flakiness under parallel load, but intermittent behaviour is **[UNVERIFIED]** as root cause.
- Real-browser rendering, screen-reader output, touch interaction and manager-comprehension remain
  **[UNVERIFIED]** — no browser engine or assistive technology runs in this container; the UI claims
  rest on JSDOM + axe-core, static CSS-class existence checks, and code review only.
- The push of branch `arena/0b1686be-leados` to origin is verified only if the push command below
  succeeds; until then remote state is **[UNVERIFIED]**. No pull request is opened in this session.
