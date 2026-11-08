# ADR-0133 — The span reading roll-up: a director/VP review queue for continuity signals gone dark anywhere in the span

- **Status:** Accepted
- **Date:** 2026-11-08
- **Session:** 180
- **Schema:** v118 unchanged
- **Surface:** `#/duty-cover?panel=desk` (and `panel=method`)
- **Primary altitude:** director (rank 3) and VP / executive (rank 4); CEO / C-suite (rank 5) reads the same enterprise-wide projection; frontline/mid are unchanged

## Context

ADR-0129 gave a withheld branch cell a governed hand-off. The acting seat asks the branch's own leader for a reading; the leader publishes a band derived by the register, declines, or lets it lapse. ADR-0126 / Session 179 made the direct-branch table safe with primary and complementary suppression. Both ledgers — `branchReadingAsks` and `branchReadings` — are append-only and written by ONE atomic `store.update` transaction per act, with `requests-reading-from`, `answers-reading-ask` and a `rolls-up-to` edge for every ancestor span.

The edges existed. Nobody read them back across the span.

`branchCoverage.readings` counts only the withheld cells on the **acting seat's own one-level table**. `dutyCoverageAttentionCount` looks only at asks where the acting seat is the asker or the target. So a VP forecasting quarterly continuity across three divisions cannot see that a director two levels down let a reading lapse, that an ask to a manager went overdue, or that a branch declined three weeks ago. The VP is not blind to a figure — the figure is correctly withheld — but is blind to the fact that the **governed continuity signal has gone dark**. The only routes left were walking the corridor or asking an analyst out of band, which is exactly the unaudited disclosure the floor was meant to stop.

This is a hierarchy defect, not a missing statistic: the automation engine already wrote the roll-up edges, and the read model stopped one rung short.

## Decision

Add a **derived read model** to the existing duty-coverage report: `report.spanReadings`, produced by `spanReadingRollup(state, built, seat, { now, settings })`.

For the acting seat (rank >= 3, not operator, not read-only), it:

1. walks the **two existing append-only ledgers** — no new collection, no stored aggregate;
2. keeps only asks whose `askedBySeatId` is the acting seat or a seat inside `seat.scope` (from `buildSeats` / `seat.scope` / `childSeatIds`). A sibling's or ancestor's ask is not ours to read: the roll-up edge travels upward, never sideways;
3. re-derives each hand-off with the **same** `deriveReadingState` + `activeAnswerForAsk` the desk uses, under the **same** `dayKey(now)`, `dutyCoverageReadingResponseDays` and `dutyCoverageReadingValidDays`, so the roll-up and the one-level table can never disagree about a state;
4. attributes each hand-off to exactly one of the acting seat's **own direct branches** (or to the acting seat's own desk), using the same partition discipline as ADR-0126. An ambiguous or orphaned ledger row is counted and excluded, never attributed by guesswork;
5. groups state counts per branch (`asked`, `overdue`, `published`, `declined`, `lapsed`, `withdrawn`) and sums them into a span-wide summary, with `attentionN` = overdue + lapsed + declined + withdrawn;
6. builds a **bounded governed review queue** of the hand-offs that need a human, ordered by constraint-first dispatching (Goldratt): the oldest overdue ask first (most `daysPast`), then the oldest lapsed reading (most `ageDays`), then terminal states by asked day, then asks still in their window by the earliest deadline. A published reading is the one state that needs nobody and is not queued. The slice is capped at `DUTY_COVERAGE_LIMITS.readingRollupRowCap = 40`; the full count and deferred remainder are always printed.

The branch table is capped at the existing `dutyCoverageBranchCap`; deferred branches and deferred acts are counted, not silently dropped.

## Wiring — shared spine, not an isolated feature

No new collection, node, relation, rule, event type, convention, action, schema bump or navigation badge change.

- The two ledgers are already produced by the shared automation engine's atomic transactions with typed edges and `rolls-up-to` lineage. This ADR adds a **reader** of those edges, not a second writer.
- `spanReadingRollup` is called inside `buildDutyCoverageReport`, beside `branchCoverage`, from the same `state`, the same `built` seat tree, the same `conv` and the same `now`. There is no second harvest of the workspace.
- The projection feeds the existing `dutyCoverageBriefText` (one counts-only, identity-free line plus printed refusals), `dutyCoverageCsvRows` (15 additive columns on the **existing** `register` and `branch-summary` row kinds), the Desk card and stat, and the Method panel. Both column registries — the Desk download in `app/views/dutyCover.js` and workspace export scope `#/duty-cover` in `app/core/csv.js` — read the ONE `SPAN_READINGS_CSV_COLUMNS` constant, so they cannot drift. `CSV_EXPORTS.length` is unchanged and no CSV export spec is added.
- The existing `dutyCoverageScan` audit event prints the span hand-off count and the count needing a human. No event type was added.
- `dutyCoverageAttentionCount` and the navigation badge are **deliberately unchanged**: this is a governed review queue for the altitude that READS the roll-up, not a second obligation piled onto the seat that owes the answer. A badge that fires for someone else's lapse is a badge people stop reading (ADR-0128's alert-fatigue refusal).

## Privacy

Identity is redacted at construction, not in the view. Above rank 2 no name, note, band, person id, seat id, node id or record id appears on any queue row or CSV cell. What survives: counts, a rank (a position number), an anonymous branch **position** (the same ephemeral table position ADR-0129 already uses), dates and the derived state. The queue never carries `askId`, `ask.note`, `live.note`, `why` or `band`. `span_reading_refused` carries a fixed refusal phrase, never ledger free text.

The roll-up deliberately does **not** re-apply the disclosure floor to these counts. ADR-0129 already publishes reading-state counts unsuppressed (`branch_reading_published_n`, `overdueN`, `lapsedN`, `declinedN`, `notAskedN`): a count of governed acts is not a rate over a few people's registers. Suppressing it would re-impose the blindness the hand-off exists to fix. The withheld **figure** stays withheld; what crosses upward is the state of the governed act.

## Limits — printed, not hidden

- A withheld cell nobody asked about leaves no ledger row and cannot appear here. The roll-up refuses to count silence as health; the seat's own table remains the only place that shows it.
- The queue is a review prompt. Nothing is assigned, chased, reminded, scheduled, graded or opened. A decline stays a legitimate answer (ADR-0129), and the acting seat cannot answer for a seat below it.
- Asks from another span, ambiguous partition rows and orphaned askers are excluded and counted in the summary and refusals.
- Seats remain workflow declarations, not authentication.
- Full canonical suite and a real-browser assistive-technology walkthrough were not run in this session.

## Verification

One focused pass only: a new `duty-reading-rollup` suite plus the adjacent branch-reading, branch-disclosure, handover-digest and CSV suites; lint, canonical boundary, docs links, standalone rebuild and standalone suite. See `AI-SESSION-LOG.md` Session 180 for the exact commands and the honest unverified list.
