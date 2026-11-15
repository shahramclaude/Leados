# ADR-0222 — Enterprise portfolio review register

- Date: 2026-11-15
- Status: Proposed — In Progress, verification blocked
- Primary duty: CEO/C-suite portfolio judgement
- Structures: single-chain and matrix
- Source schema: v176; route `#/portfolio`; CSV #164; rule `RULE-PRV-01`

## Context

Investment-case funding, decision prioritisation and post-close synergy realization do not record whether an existing business unit should still be owned. A dated keep/fix/sell/exit judgement needs a declared boundary, identifiable owning line, cited measurement and execution record. CEO was the oldest completed primary-altitude slice on the coverage map (Session 293).

## Source design implemented

Five ledgers (`portfolioUnits`, `portfolioReviews`, `portfolioVerdicts`, `portfolioMilestones`, `portfolioMarkers`) start empty at upgrade. No unit, financial evidence or verdict is inferred. `portfolioReviewDays` is persisted; the already-declared `portfolioAutoPropagate` switch is now consumed by the rule and included in the pause census. Consequently it no longer belongs in the declared-but-unread defect list.

The registry is a pure leaf. Fail-closed normalizers, a pure reader, seat-checked actions, a post-commit rule and a four-tab view share its vocabulary. Keep carries no exit fields; fix requires a re-review date; sell/exit require proceeds and an expected date. Verdicts bind to a particular review ID, including same-day evidence replacement. Stored money is integer cents, parsed once with BigInt; currencies never pool and unsafe aggregate integers are withheld. Counts reconciliation is not evidence completeness.

Owning-line review and milestone commands check the live graph. Rank windows are declared centrally. Whole-row access is report-only; unrelated spans are excluded from the reader. Joint-apex derivation uses all active managers of an owner rather than selecting one matrix line. Automatic asks are opaque and bounded, idempotent and pause-governed, with identity-free markers where no addressable apex exists.

CSV emits workspace control and per-currency summary rows without unit names, person names, rationales or evidence identifiers. The real generated method illustration is `app/assets/portfolio-review-method.jpg`, produced using the available image-generation tool and inspected in the image viewer; Higgsfield was unsupported.

## Acceptance evidence and stop

`npm run lint` passed. Initial focused five-suite run: 39/40 passed, including all five portfolio tests. Coverage includes action refusals, integer-cent normalization, same-day evidence invalidation, milestone updates, fix expiry, currency separation, overflow refusal, matrix apex, scoped reads, rule idempotency/pause, four-tab rendering and CSV numeric parity.

The source-census failure was corrected once by removing the obsolete unread-switch defect. The affected convention suite then passed 8/9: the remaining Settings DOM assertion at `tests/app/convention-persistence.test.mjs:534` still requires the obsolete unread-switch warning. Per session stop rule there was no second correction and no further verification.

## Open acceptance work — do not treat this ADR as Accepted

1. Correct the stale Settings DOM expectation in a subsequent session.
2. Reconcile rank-5-only verdict authority with apex-addressed obligations. A lower apex must not be asked to perform an act its rights refuse. The synthetic chief is not a person delegation addressee; its decision queue needs an explicit coherent representation.
3. Finish sell/exit expected-date breach routing and completion semantics. The reader's current execution-date incompleteness flag is not a completed escalation workflow.
4. Replace manual existing-milestone ID entry with efficient prefilled editing and strengthen persisted-bytes-to-every-cell parity testing.
5. Boundary, link, accessibility, full-suite and real-browser checks remain unverified; standalone distribution was not rebuilt.

## Benchmark and limitations

Aera Decision Cloud, Anaplan and Planview are category reference points from prior knowledge: connected evidence, AI-assisted scenarios, portfolio comparison and traceability through execution. No current vendor research or hands-on licensed evaluation was performed. This bounded manual register does not implement those platforms' broader analytical capability. Competitive parity is **[BENCHMARK-UNVERIFIED]**. Named BCG, Rumelt, Porter, Simons and Jaques references explain the leadership context, not implemented growth-share, five-forces or AI models.

This is local-first operating-seat discipline, not authentication or tenant isolation. The draft source must not be presented as a release, a valuation engine or a recommendation to divest an actual business.
