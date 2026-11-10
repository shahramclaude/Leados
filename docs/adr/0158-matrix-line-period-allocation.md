# ADR-0158: Matrix line period allocation — what a period actually consumed, not what today charges

- **Status:** Accepted
- **Date:** 2026-11-10
- **Schema:** v129 unchanged (no collection, no stored field, no rule, no action, no setting)
- **Surface:** `#/matrix?panel=allocation` (Board / Ledger / Method), CSV scope #119
- **Altitude:** director / VP primary (the reconciliation of a closed period against what the
  declarations actually charged); CEO / C-suite read the same board as a portfolio figure;
  frontline / mid-manager see their own lines through the same seat-scoped read
- **Structure:** matrix; single-chain workspaces remain byte-for-byte inert

## Context

Every share in the product is ONE number read for *today*:

- ADR-0140 keeps the live roll-up honest at this instant — and deliberately stores the previous
  value of every retune in a bounded in-row history "so the register can answer *what did we
  agree last quarter* without a second table". Nothing ever answered that question.
- ADR-0142 reads a point-in-time envelope position per currency — money on a day.
- ADR-0154/0155 read a pay decision on its effective date — one day, correctly.
- ADR-0157 gives a line a term and asks whether it *continues*. It never asks what the line
  *consumed* while it ran.

The duty this leaves unmet, in an operator's words:

> The quarter closed. Priya's line ran four months of it at 40% of Sam and the last two at 15%
> after the retune. Every roll-up prices the quarter at 15%; the 40% months are charged nowhere;
> and the mid-quarter retune silently re-priced the whole period the day it happened. I cannot
> reconcile the budget, capacity and merit readings of the quarter to the time Sam actually spent
> under each line.

A period figure built by reading the ending value as though it had stood for the whole window is
the exact error the time-weighted return of investment performance measurement exists to prevent
(GIPS; Bacon 2013): sub-period values must be *linked at each change boundary*. Activity-based
costing (Kaplan & Cooper 1988) names the same failure from the cost side — declared allocation
bases drift from actual consumption, and the cure is a measured driver per period.

## Decision

LeadOS adds one bounded, pure read model — the **Matrix Line Period-Allocation Ledger** — over
records the workspace already stores: each declaration's own window (`fromISO`/`toISO`) plus its
bounded in-row change history (ADR-0140). For a **named period** it produces the time-weighted
charge per declared line in exact integer **share-days** (whole hundredths of a person × whole
days), the segments the share stood at, and the identities that prove the printed totals are the
sums of the printed rows. Nothing derived is stored; nothing is written; the schema does not move.

- **The period is an input, and it is validated or refused.** Two readable days, start ≤ end,
  1–731 days inclusive — outside the bounds the reading is REFUSED with the bound printed, never
  clamped and never swapped. With no period named, the DEFAULT is the last completed calendar
  quarter and the report says so: a reconciliation reads a closed period, and the screen never
  defaults behind the reader's back.
- **Six row states, five person verdicts, declared precedence** (`computed` /
  `refused-history-gap` / `refused-undeclared` / `refused-defect` / `out-of-window` /
  `out-of-scope-home`; `period-refused` → `over-committed` → `retuned-in-period` → `steady` →
  `outside-window`) so the panel, the brief and the CSV cannot disagree about a word.
- **Two identities are printed as separate claims**, per the Bulletproof Reliability Mandate:
  the state counts add to the printed row count (`countsReconcile`), and the person totals add to
  the printed workspace total (`totalsReconcile`). "The figures add up" and "the total is the sum
  of the rows printed" are never collapsed into one reassuring word.
- **Over-commitment is a per-day floor**: where every in-window line of a person was priced, the
  ledger counts the days on which the declared additional lines charged more than one whole
  person between them, and prints the worst day. Where any line could not be priced the day claim
  is REFUSED rather than narrowed — a partial sweep could hide an over day, and the refusal is
  fail-closed in the direction that cannot flatter.

### The refusals are the product

| refusal | why it is load-bearing |
| --- | --- |
| `refused-history-gap` | At the history cap (5 retained entries, ADR-0140) the oldest changes were displaced, and five entries cannot distinguish exactly-five changes from nine-with-four-dropped. A period reaching behind the provable coverage start is refused with that start printed — today's share is never projected backwards over the gap. Below the cap the retained entries are all of them, and coverage is proven back to the declaration's own first day. |
| `refused-undeclared` | One day inside the overlap with no declared share refuses the row's whole total, with the day count printed. A sum over the days that happen to carry a number would understate the charge and read as a whole. |
| `refused-defect` | A line the matrix engine itself refused (cycle, missing person or manager, unreadable share, window that ends before it starts) is never weighted; the engine's own reason is printed, not paraphrased. Rows naming no roster person are counted as engine refusals and never become person rows. |
| `out-of-scope-home` | The home line's allocation is counted, never weighed: the home pointer moves, its history is ADR-0149's dated ledger and its as-of reading is ADR-0155's. Weighting it here would charge a past period to whoever holds the pointer TODAY — the exact misattribution the as-of engine was built to stop. A person whose only declaration is a home allocation is not in this ledger's population at all. |
| partial sums | One refused row refuses the person total; one refused person refuses the workspace total; a refused kind total exports BLANK with its reason. Each refusal carries its count and its reason into the brief and the CSV. |

### Declared conventions (printed wherever they affect a figure)

- The day of a retune is read at its **closing share**; intra-day splits are not modelled and are
  not pretended to be.
- Same-day retunes are read in timestamp order; the day closes at the last of them and the row
  says so.
- Out-of-order stored history (a hand-edited file) is read in timestamp order and the row prints
  that it reordered them.
- Two declared kinds to one manager are one relationship in the graph but **two charges on the
  person**: both rows are weighed and the merge is printed. Capacity is charged per declaration;
  the graph's edge dedupe is about accountability, not arithmetic.
- Every average prints its numerator and denominator beside the rounded display — a bare float
  never stands alone.

## Consequences

- Directors and VPs can reconcile a closed quarter or year against what the declarations actually
  charged, day by day, and the budget/capacity/merit surfaces that consume today's single share
  now have a printed, exact-integer period figure to be checked against. Wiring those consumers
  to read through this ledger is deliberately NOT part of this slice; the ledger is the reference
  reading, and joining it into the finance and capacity roll-ups is recorded on the roadmap.
- Workspaces that retune often will see `refused-history-gap` on periods older than their retained
  coverage. That is the record telling the truth about its own bounds; the reason names the
  coverage start, and the honest remedy is a narrower, provable period — never a projection.
- The over-commitment floor excludes the home line, so a person's day total below 100% is not a
  claim that the remainder was free. The bound is printed on the panel and in the registry.
- Seats remain workflow declarations, not authentication; the reading is seat-scoped like every
  other line register, and withheld people are counted, never shown.
- Verification: `tests/app/line-period-allocation.test.mjs` 20/20 including a real-API
  declare → retune → weigh round trip, display == stored across a real reload with reads mutating
  nothing and bumping no revision, the export's identity audit, and a JSDOM render; adjacent
  suites, lint, boundary and the axe route list green.
