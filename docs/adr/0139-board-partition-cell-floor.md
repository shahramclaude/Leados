# ADR-0139: The board roll-up applies the cell floor it declares

- **Status:** accepted
- **Date:** 2026-11-09
- **Deciders:** LeadOS session 188 (CEO / C-suite rotation)

## Context

ADR-0085 gave the Board Room a declared small-cell floor: `boardEvaluateClaim`
withholds a claim's rate when fewer than `boardCellFloor` (default 5)
observations sit behind it, printing the counts and the reason instead.

`boardPartition` — the reader that decomposes that same claim over the reporting
tree — never applied it. It computed each span's rate from however many
observations that span held and printed the percentage with a Wilson interval.

Reproduced against the shipped code at the default floor: a claim carrying six
observations, partitioned over three spans, printed

    Sam Director: 1 observation, 1 passing, 100% (interval 20.7–100)

A named director's rate resting on a single assessed pair. The claim-level floor
protected the enterprise figure and said nothing about the cell beneath it —
the defect ADR-0091 fixed one layer up in `moduleAggregate`, reproduced one
layer down in the board roll-up.

The shape is worse than a missing floor, because the claim's own pass count is
published at claim level by `boardEvaluateClaim`, the memo text and the CSV. That
total is a fixed equation over the cells, so withholding exactly one cell does
not protect it: the reader subtracts the printed cells and the withheld cell is
determined.

## Decision

`boardPartition` routes its partition through one new pure reader,
`boardSuppression.suppressPartitionRows`, which runs the SAME decision procedure
the rest of the application uses — `planAggregateSuppression` and
`determinacyLine` from `aggregateDeterminacy.js` (ADR-0091). No second solver and
no second policy.

1. The published surface is modelled as it is actually read: a cell prints its
   pass count and its fail count (the rate is the ratio of them), and the claim's
   published pass count is the table's total, which this reader cannot
   un-publish.
2. Sub-floor cells are withheld. `planAggregateSuppression` then hides a further
   cell, cheapest first, until no withheld cell is pinned by the total —
   complementary suppression, decided by exact integer determinacy rather than by
   a counting heuristic.
3. When the boxes saturate — every remaining value determined by arithmetic — the
   decomposition is REFUSED. `refuse` is a real product outcome: a partition that
   cannot be published without handing back one pair's result is not published.
   The claim-level verdict is unaffected; it is decided on the claim's full
   denominator before any decomposition.
4. A declared floor of 1 is honoured as "publish everything". It is what
   `boardCellFloor` already means at claim level, and it is what an operator who
   sets it has asked for.
5. A withheld cell keeps its IDENTITY and loses its FIGURE. The observation count
   is still printed and the cells still reconcile — that reconciliation is the
   panel's entire purpose. What is withheld is the rate and the pass count, and
   the screen says which span was withheld and why.

Because `boardPartition` returns only the published surface, the two existing
consumers inherit the protection with no change of their own:

- `boardRules.worstOwner` can no longer select an owner from a cell the board was
  not shown. A failing claim whose whole decomposition is withheld now opens the
  governed decision and delegates NO obligation, recording why instead of
  guessing a span.
- `boardRules.rollupRule` still writes `summarizes-span` provenance edges, since
  provenance is about which spans contributed records, not about which figures
  were printed.

The suppression travels as counts and words only: `cells_total`,
`cells_withheld`, `partition_state` and `partition_floor` on the existing
`board-claims` CSV scope. No cell label and no cell figure enter the export.

## Consequences

The chief can read the roll-up without becoming the disclosure it warns about,
and the rule engine no longer routes work off a hidden figure.

Honest limits, printed on the panel rather than implied:

- A withheld cell's OBSERVATION count remains derivable, because the claim's own
  denominator is published and the printed cells' counts are printed. That
  discloses nothing the withholding does not already announce ("this span holds
  fewer than N assessed pairs" is the withholding's own reason). What is
  protected is the RATING — which pairs passed.
- Suppression is small-cell withholding, not differential privacy.
- A declared floor is a convention, not a measured optimum.

No collection, node, relation, rule, event, setting, action or schema field is
introduced, so `SCHEMA_VERSION` stays 118.

## Rejected

- **A local floor check inside `boardPartition`.** It would have withheld the
  sub-floor cell and still published a table whose single remaining box was
  determined by the claim total — the complementary case a floor-only rule cannot
  see.
- **Un-publishing the claim-level pass count.** It is the figure the claim's own
  verdict rests on and other screens already read it; hiding it to protect a
  cell would trade a real reading for a cosmetic one.
- **Naming the worst span as owner regardless of suppression.** It routes a
  board obligation off a number the board was never shown.
