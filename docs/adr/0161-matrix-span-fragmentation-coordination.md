# ADR-0161 — Matrix span fragmentation & counterpart-dyad coordination ledger

- **Status:** Accepted (Session 222, 2026-11-10)
- **Schema:** v130 unchanged — no collection, no derived topology snapshot and no migration
- **Surface:** `#/matrix?panel=coordination`; CSV scope #121 (`matrix-coordination`, aggregate-only); `RULE-MCO-01`
- **Altitude / structure:** director / VP × matrix, with a chief/operator aggregate reading; frontline and manager seats retain their own scoped matrix reading; a single-chain workspace is inert

## Context

A reporting-tree span answers one useful question: how many people sit below a
manager. It cannot distinguish two structurally different realities:

- four people whose additional lines all reach the **same** project manager; and
- four people whose additional lines reach **four different** project managers.

Both count as four reports in a tree. They do not create the same set of lateral
management interfaces. ADR-0140 already records declared matrix lines and exact
integer shares; ADR-0158 prices their dated capacity; ADR-0160 reads dated acts
against them. None of those models asks how fragmented a manager's counterpart
relationships are.

A tempting answer would be to estimate coordination hours, infer a primary owner,
or turn the count into a manager score. The persisted record supports none of those
claims. It records lines, holders, dates and allocations — not meetings, effort,
latency, quality, or an agreement between counterpart managers.

## Decision

Add a bounded **pure topology reader** in `matrixCoordination.js`, with a closed
vocabulary in `matrixCoordinationRegistry.js`. It reads the canonical live Matrix
engine (`buildMatrix`, `matrixAllocations`, `matrixLineScope`) and the existing
Operating Seat builder (`buildSeats` / `activeSeat`). It writes no derived figure to
storage.

### Units remain deliberately separate

For one active, scoped multi-line person `p` and one of their active managers `m`,
let `c` be another active manager of `p`.

| Reading | Exact unit | Why it is not another reading |
| --- | --- | --- |
| Manager span | a manager's distinct scoped multi-line people | headcount in the manager's cross-line span |
| Counterpart managers | distinct `c` reached by one manager `m` | number of different management interfaces |
| Directed person-interface exposure | one `(m, p, c)` triple | a person with three holders produces two exposures for each holder |
| Unique manager pair | unordered `{m, c}`, deduplicated across people | workspace topology, not the sum of manager workloads |
| Effective counterparts | `T² / Σc wc²`, retained as exact integers | dispersion of one manager's directed exposures; never rounded to a score |

Here `T` is the directed exposure count for that manager and `wc` is the number of
that manager's scoped people reaching counterpart `c`. A stable dyad has an exact
effective count of `1`; equal exposure across `k` counterparts has an exact count of
`k`. The panel prints the rational numerator and denominator rather than a decimal.

A declared triage floor of three distinct counterpart managers labels a span
`fragmented`; two is `multiple`, one is `concentrated`, and zero is `none`. This is a
review threshold, **not** an optimum, diagnosis, capacity model, rating, or redesign
recommendation.

### Refusal is part of the topology

A multi-line allocation whose active lines do not all carry readable declared shares
is not treated as zero coordination and is not removed from one side of the matrix.
Every manager span that holds that person reads `refused`; its counterpart count,
directed-exposure count and dispersion are blank. Any such row withholds the
workspace topology totals rather than calculating over the complete remainder.

The same rule applies to an **active invalid declaration** that `buildMatrix` rightly
refused to wire. The reader derives the person's live/claimed holder set from the
primary relationship, active stored declarations and canonical wired lines, then
refuses every holder of that person. A valid home holder may not publish a reassuring
partial topology while an additional holder is refused. Invalid declarations outside
their active window are inactive for today's reading and do not poison it. A defect that
cannot be joined to any active roster person is counted as an unresolved active
workspace defect; it withholds the aggregate instead of becoming a phantom person or
a guessed owner.

No allocation is repaired, no additional manager is inferred, and no counterpart is
selected under ambiguity.

### Scope, disclosure and export

The reader uses the same tree-plus-declared-line seat scope as the Matrix ledger.
A scoped seat sees only people it reaches through its tree span or its declared line
scope. Above `MATRIX_FLOORS.detailRank`, manager and counterpart names are withheld
while structural counts remain visible. The undeclared operator view reads the whole
workspace; this remains a local workflow boundary, not authentication.

CSV #121 contains one workspace row and identity-free rows by structural state. It
contains no person, manager, declaration, line, seat, title, note or free text.
Incomplete workspace totals are blank with a printed `withheld_reason`, never zero.
A manager span's rational dispersion is intentionally **not** collapsed into a
workspace or state score: those fractions have no declared common denominator, and
inventing one would merge units this ADR keeps separate.

### Shared event spine, without delegated work

`matrixCoordinationReport()` exposes the pure seat-scoped read. An explicit
`matrixCoordinationScan()` emits `matrix.coordination.scan` through the existing
post-commit spine. `RULE-MCO-01` runs after `matrixRule` on Matrix lifecycle events
or an explicit scan, respecting `matrixAutoPropagate` except that an explicit scan is
always allowed. It writes at most one bounded, marker-idempotent, identity-free
`matrixMarkers` trace per aggregate topology/day and the existing shared event log
when the topology is fragmented or refused.

The rule never creates a case, task, ownership assignment, agreement, reporting line,
share, recommendation, or organisational redesign. It is inert in a single-chain
workspace and is registered in the same propagation-contract audit as the other
Matrix rules.

## Consequences

- A director or VP can now distinguish a stable repeated dyad from a scattered
  management-interface pattern without pretending either is inherently healthy.
- Chief/operator readers receive the same exact structural aggregate, with identity
  details withheld according to the existing seat boundary.
- The matrix retains one canonical graph and one hierarchy/automation spine; the
  feature does not fork a second topology, roll-up or event bus.
- The next missing capability is not an inferred remedy. A dated bilateral
  management-interface operating agreement (rights boundary, forum, escalation and
  review) remains separately Planned because a relationship count is not an
  agreement.

## Alternatives rejected

- **Reuse tree-only `matrixManagerSpans()`.** Rejected: its attributed-hour display
  can resolve an incomplete share to zero, while this topology must refuse it.
- **Estimate coordination load from share-hundredths.** Rejected: a capacity share is
  not observed interface effort, and multiplying it by a relationship count would
  manufacture hours.
- **Store topology totals or per-manager snapshots.** Rejected: a snapshot can drift
  from the active declarations; every panel/export figure is recomputed from the
  canonical graph.
- **Auto-open work or select an interface owner.** Rejected: topology identifies a
  structural question, not who should decide it or what they should agree.
- **Average the per-manager inverse-HHI fractions for the CSV.** Rejected: it would
  make an undeclared aggregate statistic look comparable to a manager's exact
  dispersion. The aggregate export keeps only units with a declared denominator.
