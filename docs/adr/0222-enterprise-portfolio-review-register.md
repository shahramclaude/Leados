# ADR-0222 — Enterprise portfolio review register

- Date: 2026-11-15
- Status: Accepted — Shipped (Session 299 completes Session 298)
- Primary duty: CEO/C-suite portfolio judgement
- Structures: single-chain and matrix
- Source schema: v177; route `#/portfolio-review`; CSV #164; rule `RULE-PRV-01`

## Context

Investment-case funding, decision prioritisation and post-close synergy realization do not record whether an existing business unit should still be owned. A dated keep/fix/sell/exit judgement needs a declared boundary, identifiable owning line, cited measurement and execution record. CEO was the oldest completed primary-altitude slice on the coverage map (Session 293, vs. director/VP 295 and frontline/mid-manager 297).

Session 298 introduced the initial v176 draft on `#/portfolio`, colliding with Decision Portfolio (`#/portfolio`, Schema v55) and `state.portfolioMarkers` (`string[]`), routing rank-5 verdict obligations to lower seats or synthetic `LEADER_ID`, omitting sell/exit breach escalation and settlement, breaking `openModal`/`buildForm` arguments in the view, and leaving a stale assertion in `convention-persistence.test.mjs:534`. Session 299 completed all open blockers and shipped v177 on `#/portfolio-review`.

## Source design implemented

Six collections (`portfolioUnits`, `portfolioReviews`, `portfolioVerdicts`, `portfolioMilestones`, `portfolioExits`, `portfolioReviewMarkers`) start empty at upgrade. No unit, financial evidence, verdict, or disposal is inferred. `MIGRATIONS[176]` bumps v176 → v177 and separates Decision Portfolio's string `portfolioMarkers` from Portfolio Review's object `portfolioReviewMarkers` without clobbering v55 records. `portfolioReviewDays` is persisted; `portfolioAutoPropagate` is consumed by `RULE-PRV-01` (reading `buildMatrix` directly for the pause-permit reach census) and removed from `declaredButUnread`.

The registry is a pure leaf (`#/portfolio-review`). Fail-closed normalizers, a single pure reader (`buildPortfolioReview`), seat-checked actions (`createPortfolioReviewActions` + `accessGateway` `RECORD_POLICIES` and `MATRIX_LINE_SCOPED`), a post-commit rule (`RULE-PRV-01`), and a four-tab view share one vocabulary:
- **Keep** carries no exit fields; **fix** requires a re-review date; **sell/exit** require expected proceeds and an expected completion date.
- **Verdicts bind to a review ID**, so same-day replacement review evidence invalidates the prior verdict (`verdict-pending`).
- **Right-capable authority resolution (`resolvePortfolioAuthority`)**: `review-overdue` (`review-portfolio`, `minRank: 4`) routes to the owning executive line or lowest rank-4+ apex; `execution-slippage` (`track-portfolio`, `minRank: 3`) routes to the lowest rank-3+ apex asking only to update/complete milestones; `verdict-pending` and `execution-overdue` (`verdict-portfolio`, `minRank: 5`) route exclusively to rank-5 chief authority via synthetic `chiefQueue` + `chief-decision-owed` marker (or `no-authority-at-rank` when `chainLeaderAltitude !== 'chief'`), never issuing invalid `person` delegations to `LEADER_ID` or lower apexes.
- **Sell/exit breach & disposal settlement (`portfolioCompleteExit`)**: live past-due `sell`/`exit` verdicts raise `execution-overdue` (`execution-date-passed` completeness gap + rank-5 chief queue + `execution-overdue` rule condition); settlement refuses open/overdue milestones, records dated actual proceeds in integer cents under `portfolioExits`, locks completed units against post-settlement mutations, and keeps live expected proceeds separate from completed `realizedProceedsCents` per currency (`unitsTotal = unitsLive + unitsCompleted + unitsRetired`).
- **Money & completeness discipline**: BigInt integer cents parsed once on intake, currencies never pooled, unsafe totals refused, `countsReconcile` separated from `figuresComplete`.
- **UI & asset**: four-tab `#/portfolio-review` view (`Units`, `Execution & escalations`, `Exits & reviews`, `Method & governance`) using proper `{ body, footer }` modal calls, prefilled per-milestone `Update` dialog, explicit `Complete exit` dialog, chief decision queue card, and completed settlement ledger; method diagram `app/assets/portfolio-review-method.jpg` generated via built-in `generate_image` (Higgsfield returned `unsupported`).

## Verification

- `npm run lint` — passed (0 errors/warnings).
- `npm run check:boundary` — passed (957 app ES modules, 275 test suites, 23 documentation checks, 0 leaks).
- `npm run check:links` — passed (1,282 internal links across 341 markdown files).
- `npm run check:a11y` — passed (heading outline clean across all 126 declared routes).
- `node --test tests/app/portfolio-review.test.mjs` — **6/6 passed**, including Schema v176→v177 marker separation, right-capable escalation, synthetic chief queue, rank-4 downgrade, sell/exit breach + `portfolioCompleteExit` + post-settlement lock, and full `createApp` live-UI-to-reload/CSV parity (`#/portfolio` Decision Portfolio untouched, prefilled milestone UI edit, exit settlement, reload verification).
- Adjacent suites verified passing: `tests/app/decision-portfolio.test.mjs` (24/24), `tests/app/access-audit.test.mjs` (14/14, including `#/portfolio`, `#/portfolio-review`, and PRV dialogs under `axe-core`), `tests/app/convention-persistence.test.mjs` (9/9), `tests/app/pause-permits.test.mjs` (15/15), `tests/app/csv.test.mjs` (5/5), `tests/app/duty-without-means.test.mjs` (6/6), `tests/app/incentive-integrity.test.mjs` (19/19), `tests/app/risk-appetite.test.mjs` (22/22), `tests/app/core.test.mjs` (15/15), `tests/app/domain.test.mjs` (39/39), `tests/app/app.test.mjs` (33/33), `tests/app/disclosure-compiler.test.mjs` (21/21), `tests/app/export-disclosure.test.mjs` (4/4), `tests/app/operating-seat.test.mjs` (16/16), `tests/app/rights-concordance.test.mjs` (28/28), `tests/app/sod-register.test.mjs` (22/22), `tests/app/redacted-export.test.mjs` (12/12), `tests/app/reconcile.test.mjs` (14/14), `tests/app/quick-search.test.mjs` (10/10), `tests/app/nav-counter-cache.test.mjs` (5/5), `tests/app/workspace-checkup.test.mjs` (10/10), `tests/app/workspace-navigation.test.mjs` (3/3), `tests/app/typed-link-navigation.test.mjs` (1/1), `tests/app/capital-portfolio.test.mjs` (39/39), `tests/app/deferral-portfolio.test.mjs` (37/37), `tests/app/storage-safety.test.mjs` (5/5), `tests/app/settings-write-fidelity.test.mjs` (4/4).
- `npm run verify:standalone` — **7/7 passed** on rebuilt `LeadOS-standalone.html` (`16,692,905` bytes · `954` source modules · schema `v177` · sha256 `5a665e8fe4a45e87`).
- Flagged unverified / pre-existing: full 275-file `npm test` run and real-browser assistive-technology walkthrough remain **[UNVERIFIED]**; three pre-existing non-PRV failures observed in spot checks (`parity.test.mjs:509`, `typed-links-lineage.test.mjs:801` for `arbitration`/`contradiction`, `portfolio-comparison.test.mjs:216`) were left untouched outside ADR-0222 scope.

## Benchmark and limitations

Aera Decision Cloud, Anaplan and Planview are category reference points from prior knowledge: connected evidence, AI-assisted scenarios, portfolio comparison and traceability through execution. No current vendor research or hands-on licensed evaluation was performed. This bounded manual register does not implement those platforms' broader analytical capability. Competitive parity is **[BENCHMARK-UNVERIFIED]**. Named BCG, Rumelt, Porter, Simons and Jaques references explain the leadership context, not implemented growth-share, five-forces or AI models.

This is local-first operating-seat discipline, not authentication or tenant isolation. It is not a valuation engine, and post-divestment Carve-Out TSA & Stranded-Cost tracking remains unbuilt and tracked separately in `ROADMAP.md`.
