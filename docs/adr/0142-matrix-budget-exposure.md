# ADR-0142: One envelope, two accountabilities — matrix-safe budget exposure

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 193 (director / VP × matrix rotation)
- **Extends:** ADR-0136 (span budget exposure), ADR-0141 (matrix line seat)

## Context

ADR-0141 made `canSee` admit a record whose owner reaches the acting seat through
an active additional reporting line. The budget roll-up did not consume that
route. `budgetExposureActions` still built a tree-only seat, and
`attributeEnvelope` tested only `seat.scope`. A line-only product director could
therefore be accountable for an engineer's envelope while the span panel counted
it as out-of-span and produced no currency position.

The main render boundary had a second instance of the same defect:
`safeSeatContext` built seats without `matrixLineScopeFor`. An API test with a
manually injected matrix seat could pass while the real application rendered the
same line-only manager as an unresolved, read-only seat.

A matrix creates two simultaneous accountabilities over one recorded envelope.
It does not create two envelopes, and a 40% capacity declaration is not evidence
that 40% of a cost centre's ceiling, actuals or commitments belongs to a project
manager. Splitting money by that share would invent a financial fact nobody
recorded.

## Decision

1. **One envelope, one recorded owner, counted once per seat.** Attribution first
   tries the home reporting tree. If the owner is outside that subtree but inside
   the acting seat's declared `lineScope`, the whole envelope is attributed once
   to a `matrix-line` bucket. If both routes reach the owner, the tree wins and
   the line adds nothing. Every active readable envelope remains either
   attributed or explicitly excluded.
2. **Overlap is printed, never hidden in the arithmetic.** The branch is labelled
   “Declared matrix line”. The panel, downloadable ledger, refusal list and
   identity-free brief state that the home cost centre reads the same envelope,
   that totals from overlapping seats are not additive, and that no capacity
   allocation was applied to money. `counts.viaLine` and the derived `matrix`
   descriptor expose the same facts to the API.
3. **Money remains whole and in its recorded currency.** Ceiling, actuals, open
   commitments, planned pipeline, forecast and headroom continue to come from
   `evaluateBudget`. There is no allocation-weighted split, no synthetic second
   cost centre, no FX conversion and no netting across branches or currencies.
4. **API and renderer use the same matrix seat.** `budgetExposureActions` and
   `safeSeatContext` both inject `matrixLineScopeFor(state)` into `buildSeats`.
   The raw-store `canSee` filter and the render-time projection therefore admit
   the same envelope set, while sideways envelopes remain denied.
5. **Nothing is stored.** Schema v119 is unchanged. No collection, node,
   relation, rule, event, setting, CSV scope or persisted total is added. Ordinary
   finance writes continue through the existing post-commit event spine; the
   matrix position is re-derived from the stored envelope after every write and
   reload.

## Rejected alternatives

- **Multiply financial figures by the reporting-line allocation.** A capacity
  share is not a cost-centre share. This would fabricate ceilings, actuals and
  headroom and could make the two seats' figures sum neatly while both were
  false.
- **Show the envelope to the line manager but exclude it from every total.** That
  is fail-closed but not operationally useful: a line-only director would still
  have no position to manage. The whole-envelope reading with explicit overlap is
  accurate without pretending that separate seats can be summed.
- **Add the secondary manager as another child branch of the home tree.** This
  would double-count the envelope at the common ancestor and contradict
  ADR-0141's “matrix over the tree, never a second tree” rule.
- **Keep a separate matrix finance store or automation rule.** The stored
  envelope and shared finance events are already authoritative. Another store
  would create the display-versus-record drift the reliability mandate rejects.

## Consequences

- A director or VP holding people only on an additional line gets a real seat and
  an exact per-currency exposure reading in both API and application rendering.
- A manager with both home and matrix reports sees each envelope once. A common
  ancestor also sees each stored envelope once; matrix accountability does not
  manufacture another branch.
- The reading is valid for that seat, not a license to add overlapping managers'
  totals. That limit is printed wherever the figures travel.
- Other tree-scoped modules (`jurisdiction`, `succession`, gateway payload
  helpers and others) remain separate work. This ADR does not claim workspace-wide
  matrix parity, authenticated identity or tenant isolation.
