# ADR-0173 — Matrix demand-variance early warning from decision queues

- **Status:** Accepted and implemented, 2026-11-11 (Session 236)
- **Decision:** A pure read model joins the age-weighted demand accumulating across a person's distinct reporting lines against each line's declared share-days, counts each open decision once against exactly one line, refuses unassigned and ambiguous-line items, identifies the bottleneck by dated dependency rather than selecting one manager as owner, and refuses to forecast queue length alone. Schema v137 unchanged; no collection, migration, rule or stored field; CSV scope #127 (`matrix-demand-variance`, aggregate); panel `#/matrix?panel=demand-variance` (ninth matrix panel); one safe read `matrixDemandVarianceReport`.

## Context

The decision log (`decisions.js`, DACI fields, `openDecisions`) stores each open decision with its date and its driver/approver/contributors/informed names. The matrix layer (`matrix.js`, ADR-0140/0141) declares each person's reporting lines with dated share percentages. `lineIntake.js` (`lineCeiling`, `periodWindow`, `quarterWindow`) prices a line's declared share-days for a period from the line's own share timeline. Nothing joined them: a director or VP could see queue age per record and share per line, but never whether a shared person's open decisions, aged and weighted, exceed what any one line declared they could carry — or whether the demand is split across lines so no single manager owns it.

A person on two lines can accumulate open decisions under each line; folding both into one manager's backlog would invent ownership. A decision naming nobody on the roster cannot be traced. A line whose declared share cannot be proven for the whole window must not be priced from today's share.

## Decision

Built one bounded pure read model (`matrixDemandVariance.js`) over records the workspace already writes — open decisions, dated reporting lines, the person roster — priced through the existing `lineCeiling` reader against the declared share timeline.

1. **Period.** Defaults to the last completed calendar quarter (`quarterWindow(today)`); an explicit `periodKey` (`YYYY-QN`) prices that window. An unreadable period refuses with the reason printed; nothing is projected.

2. **Each decision counted once, against exactly one line.** An open decision is attributed to the line whose manager is the decision's driver/approver/contributors/informed and which is active for the decision's date. If more than one active line claims it, the decision is **refused as `ambiguous-line`** — never folded into one line, never assigned to the home line by default. If no named party resolves to one roster person, it is **refused as `unassigned` or `unresolvable`** with the reason printed.

3. **Age-weighted demand.** Attributed demand for a line is the sum, over its decisions, of `days-open × 100` hundredths of a person-day (whole days from the decision date to the window anchor, clamped at zero). This is a demand signal, not a performance score; no person is rated.

4. **Ceiling priced once per line from its own timeline.** `lineCeiling(state, personId, managerId, periodKey, ...)` sweeps the line's declared share day by day; the sum in hundredths is the ceiling. A day the timeline cannot prove refuses the ceiling — never projected from today's share. `ceilingUnprovable` is its own verdict, distinct from over/at/within.

5. **Verdicts per line:** `within-ceiling` (headroom remains), `at-ceiling` (consumed == ceiling), `over-ceiling` (consumed > ceiling, variance printed), `ceiling-unprovable` (timeline cannot price it), `no-demand` (line active, zero attributed demand). Refusal classes `unassigned`, `ambiguous-line`, `unresolvable` are counted apart from lines; none inflates a line's demand.

6. **Bottleneck by dated dependency.** For each attributed decision, outgoing `depends-on` links to a `dependency` are read through the existing `resolveLinkedEntity`; the bottleneck table lists the dependency's title, id, age and relation. No manager is selected as owner of a cross-line block.

7. **Flow, not forecast.** Little's Law (`λ × W = WIP`) is reported only when at least 3 decisions are attributed (declared floor); below that the floor figure is withheld. Kingman's approximation is **refused with reason** — the workspace records no service-time distribution for decisions, so a queueing estimate would be invented. Queue length alone is never converted into a lead-time claim.

8. **Display == stored.** Every figure is re-derived on read; nothing derived is stored. The brief names no person, line or decision; the CSV is aggregate-only (period, counts, demand/ceiling/variance in days-hundredths, flow figures, refusal reason, `figuresComplete`/`countsReconcile` claims).

## Integration and consequences

- New files: `app/core/domain/matrixDemandVariance.js` (reader: `buildMatrixDemandVariance`, `matrixDemandVarianceBriefText`, `matrixDemandVarianceCsvRows`), `app/core/domain/matrixDemandVarianceRegistry.js` (verdict keys, conventions, frameworks, CSV columns, engine version `demand-variance-2026.11-v1`), `app/views/matrixDemandVariancePanel.js` (`#/matrix?panel=demand-variance`).
- Wiring: `matrixActions.js` adds `matrixDemandVarianceReport`; `accessGateway.js` adds it to `SAFE_READS`; `matrixRegistry.js` adds `demand-variance` to `MATRIX_PANELS`; `matrix.js` imports the panel render and adds the `panel === 'demand-variance'` switch case; `csv.js` imports the builder/rows/columns, registers CSV scope #127 `matrix-demand-variance` and adds the export switch case.
- Seat-scoped like every matrix register; out-of-span findings are withheld and counted, never shown. A read changes no state (byte-identical after a read).
- Inert in a single-chain workspace: no declared additional lines means no attributed cross-line demand and no matrix claim; the same reader is meaningful with one line.
- Not in the slice: a retune-triggered ask about already-aged decisions, a materiality/evidence floor gating a human review ask on the post-commit spine (declared in ROADMAP.md as the follow-up), any Kingman service-time model.

## Alternatives rejected

- **Projecting today's share backwards.** Rejected: it invents history; a day with no declared share is a refusal, not a zero.
- **Folding a multi-line person's decisions into one line.** Rejected: it invents ownership; ambiguous-line is refused with the line count printed.
- **Kingman's queueing estimate.** Rejected: no service-time distribution exists for decisions; refusing is the honest figure.
- **Forecasting from queue length.** Rejected: queue length is not lead time; Little's Law is reported only above its decision floor and never as a prediction.
- **Storing the ceiling or verdict.** Rejected: stored figures drift; everything is re-derived on read (Bulletproof Reliability Mandate).

## Verification

`tests/app/matrix-demand-variance.test.mjs` — focused suite worked out by hand from one fixture (Q4 2026): single-line attributed demand over ceiling (63 days / 6300H vs 3680H ceiling, variance 2620H, verdict `over-ceiling`), cross-line ambiguous refusal, unassigned refusal, unresolvable (roster-missing) refusal, bottleneck by dated dependency with title resolution, board reconciliation (`figuresComplete` and `countsReconcile`), Kingman withheld with reason, Little's Law floor. Suites cannot be executed in this checkout (`node_modules` absent; `jsdom` devDependency missing — every test file, including pre-existing ones, fails identically on import); run `node --test tests/app/matrix-demand-variance.test.mjs` where `node_modules` is installed. `node --check` passes on all touched files; `check:boundary` passes (714 app modules, 223 suites, 0 leaks). `tests/app/csv.test.mjs` pin updated 126 → 127 for `CSV_EXPORTS.length`.

Adjacent suites re-run where node_modules exists: `csv`, `line-intake`, `decision-tempo`, `matrix-meeting-load`; `check:lint`, `check:boundary`, `check:links` PASS.

See `AI-SESSION-LOG.md` (Session 236) for the full verification record.
