# ADR-0098: Hierarchical Clearinghouse — exact sealed tranche clearing with Clarke hurdles and identity-free upward publication

- **Status:** Accepted
- **Date:** 2026-11-05
- **Schema:** v100
- **Route:** `#/clearing`
- **CSV scope:** `internal-clearinghouse` (#94)

## Decision

LeadOS adds an Internal Clearinghouse for scarce budget and shared capacity. A
chair declares one dated, single-currency envelope; subordinate leadership spans
submit discrete sealed package tiers; the workspace solves the resulting integer
multiple-choice economy exactly; and the chair explicitly commits the frozen
solution. A round is never treated as a performance score for a person. The
bidder is an organizational span, and a Clarke-hurdle miss opens a blameless
mechanism/reallocation review.

The terminal is deliberately local-first. “Sealed” means sibling schedules are
withheld by the seat projection while the round is open (and from invited
subordinate seats after clearing); it is not a claim of cryptographic
multi-user isolation inside one browser profile.

## Mechanism and certificate

Each bid contains one to four tiers. Every tier declares:

- integer cost in the round's ISO-4217 currency;
- integer shared person-days;
- an outcome range `[valueLo, valueHi]`;
- an optional minimum-viable marker; and
- an optional typed link to a goal, case, strategy bet or delegation.

Tier zero is always the exact “unfunded” choice. A minimum-viable marker removes
sub-floor *funded* tiers; it does not force the span into the market. The solver
refuses an uncertified result rather than returning a heuristic allocation.

The committed certificate contains:

1. nominal, Bertsimas–Sim Γ-robust and Savage minimax-regret regime outputs;
2. the exact `N + 1` marginal economies needed for each winner's Clarke pivot
   externality `τ_i = W*(N \ i) − W_{−i}(x*)`;
3. proportional peanut-butter and equal-split benchmarks plus Reallocation
   Alpha;
4. Dantzig–Wolfe/Lagrangian shadow prices, the dual/integrality gap, discrete
   marginal budget and capacity gains, HHI, and the Theory-of-Constraints
   resource-mix posture; and
5. a counted enumeration or branch-and-bound certificate with a hard node
   budget.

All arithmetic is exact integer arithmetic for the resource/value problem. A
round is committed only when the solver's certificate is certified. Currency
amounts are kept in per-currency buckets and are never pooled across ISO codes.

## Atomic propagation

`RULE-CLR-01..05` run on the existing post-commit spine before the Attention
Market and before the final seal:

- `RULE-CLR-01` turns a commitment into one governed DACI decision, one owned
  delivery delegation per funded span, optional same-currency Finance
  encumbrance lines, typed provenance and ancestor `rolls-up-to` edges;
- `RULE-CLR-02` opens one weekly, idempotent, blameless mechanism review for
  settled pivotal hurdle deficits;
- `RULE-CLR-03` opens one overdue settlement task and one integrity decision per
  round/week;
- `RULE-CLR-04` escalates a resource-mix bottleneck to the chair's parent; and
- `RULE-CLR-05` opens one identity-free altitude-cell calibration decision when
  the cell clears its floor but a strict majority misses `τ_i`.

`clearingMarkers` make each rule idempotent. The propagation contract declares
writes to `decisions`, `delegations`, `budgets`, `links` and
`clearingMarkers`; the action never manually duplicates those derived writes.

## Access and disclosure

The action gateway declares three rights: chairing a round, submitting a sealed
bid, and governing clearing conventions. Safe reads are explicit. A declared
seat never receives the raw clearing ledger through the normal view projection;
the route is an adapter-scoped aggregate surface.

The adapter applies these boundaries:

- an invited bidder sees the envelope, own bid, own allocation and own outcome;
  sibling schedules, labels, notes, allocations and solver detail remain sealed;
- a chair sees its round detail; an ancestor sees structural altitude and
  aggregate mechanism output rather than subordinate identity or free text;
- upward reports use only rounds in the seat's subtree, with calibration and
  hurdle rates refused below the declared cell floor or rank gate; and
- graph resolution exposes only structural round counts, dates, Gamma and
  status. Raw titles, bid labels, notes, names, amounts and allocations are
  not declared-seat projection material.

The generic route gate therefore mounts `renderClearing` for an aggregate
posture instead of sending clearing rows through the generic collection
aggregator, whose person-key assumptions do not apply to round records.

## Settlement and calibration

A committed round can be settled once, after its horizon, with one realized
outcome per funded span. The stored grade records whether each pivotal winner
cleared its frozen `τ_i`, plus linked evidence posture (`corroborated`,
`uncorroborated`, `contradicted` or `unlinked`). Re-settlement is refused.
Wilson intervals are printed only at the declared floor. Pre-registered hurdle
expectations are scored with a strictly-prior sequential Brier reference; the
engine never adjusts a bid, outcome or score.

## Publication and differencing

The `internal-clearinghouse` export contains only altitude and workspace
aggregate rows: round, funding, capacity, mix-bottleneck, hurdle coverage and
Wilson bounds, Brier calibration, refusal state and reason. Cells below
`clearingCellFloor` are blank, never zero; the workspace row is withheld when
its scope is sub-floor. The Markdown certificate follows the same rule and
contains no round id, title, tier, note, name, amount or allocation.

The export is registered with the existing Differencing Register. It is a
single aggregate publication, not an exemption from ADR-0092: complementary
suppression and explicit refusal text remain part of the output contract.

## Persistence and migration

Migration `99 → 100` adds empty `clearingRounds` and `clearingMarkers` ledgers
and the declared clearing convention defaults. The normalizers drop malformed
rounds, bids, frozen solutions and settlements; they do not reconstruct a
commitment from a title, event or partial solver object. Existing workspaces
therefore open without inferred historical clearing.

## Consequences

**Positive:** scarce resources are compared against explicit alternatives,
opportunity cost survives the commit, delivery is graded out of sample, and
higher altitudes receive an identity-free, differencing-safe certificate.

**Costs:** exact combinatorial solving is bounded; large instances may be
refused rather than approximated. Local browser sealing is a workflow boundary,
not cryptographic confidentiality. Honest calibration requires enough settled
pivotal tranches, so many cells will correctly say “withheld” until the ledger
has evidence.

## Verification

Focused tests cover migration and fail-closed normalization, exact floor and
VCG behavior, access rights, sibling sealing, one-time settlement, atomic
post-commit propagation and aggregate CSV redaction. The standalone build embeds
the v100 schema and the `#/clearing` route.
