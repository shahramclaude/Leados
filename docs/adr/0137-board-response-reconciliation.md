# ADR-0137: Reconcile carried board claims with their governed responses

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 185 (CEO / C-suite rotation)

## Context

ADR-0135 shows a chief which claims have failed or remained unproducible across
frozen packs. ADR-0086's `RULE-BRD-01` opens one governed decision per failing
claim per memo revision. The carry-forward reader did not read those decisions,
so a recurring exposure with no current response looked exactly like one with a
chosen correction awaiting outcome review. An older reviewed decision could also
make a newer, uncovered pack look answered if the chief relied on memory.

## Decision

Extend the existing pure `boardContinuity` reader with response reconciliation.
For each currently failing claim, read the existing typed
`decision —escalates-from→ boardmemo` edges and accept a decision only when its
question contains the exact claim assertion written by `RULE-BRD-01`. Never infer
provenance from a similar title, a contributor, or a person.

Derive and print four response states:

- `uncovered`: the latest failing pack has no linked governed decision, even if
  an earlier pack has one;
- `undecided`: any linked response still has no chosen correction;
- `review-due`: a chosen response is at or past its outcome-review date;
- `decided` / `reviewed`: the remaining response states.

The action opens the unresolved or review-due decision when one exists, otherwise
the current decision; an uncovered row returns to the memo whose existing
Reconcile command runs `RULE-BRD-01`. No new decision, collection, rule, event,
setting or schema field is introduced. Response counts travel through the Cycle
panel, downloadable ledger, identity-free board brief and existing aggregate CSV.
Only status metadata crosses: no rationale, option, contributor or outcome note.

The Board view's local `tableWithKeys` adapter now preserves a column's declared
renderer instead of overwriting it. This repairs action cells across that view,
including the new governed-decision links.

## Consequences

The chief can distinguish an ungoverned current failure from governed but
unfinished work without reading every decision. A recorded outcome review never
rewrites the still-failing frozen verdict. A repeated REFUSED/WITHHELD figure has
no invented decision requirement because `RULE-BRD-01` acts on FAILING claims.

The exact-assertion join is deliberately fail-closed: a hand-authored or changed
decision that does not preserve the assertion remains uncovered rather than being
guessed into the claim. Seats remain workflow declarations, not authentication.
