# ADR-0141: The second line's seat — matrix-safe ownership, scope and roll-up

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 190 (matrix-structure rotation, second session on the axis)
- **Supersedes:** nothing. **Extends:** ADR-0140 (Matrix Accountability Ledger),
  ADR-0076 (Operating Seat), ADR-0120 (shared multi-span ownership).

## Context

ADR-0140 added the Matrix Accountability Ledger and, on the WRITE side, `RULE-MTX-01`:
work touching a person who is accountable to more than one manager is fanned to
**every** manager in that person's reporting set. That rule is correct and stays.

The READ side was never wired. Reproduced against the shipped code, with an
engineering director (`engdir`) home-managing Sam and a product director
(`pmdir`) holding Sam on a declared `project` line:

| Question | Answer before this change |
|---|---|
| Does `pmdir` have an operating seat? | **No.** `buildSeats` seats a node only when `span > 0 && altitude`. The tree gave `pmdir` no reports, so `span === 0`. |
| What happens if she is declared as the active seat? | `resolveSeat` fails closed to **read-only** with “that seat no longer exists”. The whole workspace locks. |
| Can she read a goal owned by Sam, the person her line carries? | **Denied** — “names people outside Pia Product's span”, `seat.rank` notwithstanding. |
| Does her seat digest count that goal? | **No.** `seatDigest` scopes on `seat.scope` (the tree subtree) only. |
| Does anything count what a single-chain seat drops? | No. The drop was silent. |

So the engine fanned the work to a manager who had no seat, could not be
selected as the seat, and would have been refused the record if they had one.
That is exactly the failure the Matrix Leadership Mandate names: *“never drop a
person because their second line was invisible to it”* and *“never silently pick
one of several managers as the owner”*. Two of the four matrix rules in the
doctrine were unimplemented on the read path.

## Decision

**1. The line-scope is derived once, by the matrix engine, and injected into the
seat engine as plain data.**

`matrixLineScope(matrix)` reads `buildMatrix`'s already-active lines (primary
excluded — the tree already carries the home line) and returns, per manager:
`personIds`, `lineN`, `kinds`, and `lineOnlyIds` — the subset the tree does not
put in that manager's subtree. `matrixLineScopeFor(state, opts)` returns `null`
when the workspace declares **no** line, so the pre-0141 code path is the code
path.

`buildSeats(state, { …, lineScope })` consumes it. `seat.js` imports nothing new
and no cycle is created: the dependency pointer is data, not a module.

**2. A manager holding people only on a declared line is a seat — if the roster
already gives them an altitude.**

Eligibility becomes `(span > 0 || lineScopeN > 0) && altitude`. The altitude is
never invented: a line holder whose roster title carries no leadership altitude
is **refused** a seat, and the refusal is printed (`refusedLineSeats`, the Seats
panel, and the identity-free brief). The rung is a fact about the roster; the
line is a fact about the work; the product does not manufacture either.

**3. `canSee` treats a declared line as a second accountability, never a second
chain.**

A named person is in scope when the tree puts them under the seat **or** the seat
manages them on an active declared line. The verdict carries the route
(`viaLine`, `lineScopedN`, `lineKinds`) so the screen can say which one carried
it. Rank windows, class floors and detail ceilings are untouched: a line confers
scope, never authority. A record naming even one person reachable through neither
is still **denied**, and the refusal says how many arrived by no route at all —
the matrix widens a seat to its own line, never sideways.

**4. The roll-up prints the split instead of merging it.**

`seatDigest` adds `counts.viaLineN` and `counts.treeOpenN`, with the exact
identity `treeOpenN + viaLineN === openN`. A matrix manager's headline figure is
the whole reading; the part a single-chain product would have hidden is printed
beside it, never folded in silently.

**5. Ownership is named, never collapsed.**

`matrixWorkReach(matrix, lineScope, items)` returns, per open item, every
manager it is accountable to: the tree owner plus every line manager who covers
*all* named people. `sites.length > 1` is `shared` and is reported as such. No
single owner is emitted for an item the structure gives more than one — the
engine is not entitled to make that pick. The seat panels (`#/matrix?panel=seats`,
`#/seat`) print the count; the CSV prints the counts (`line_scope_n`,
`line_only_n`, `line_work_n`, `line_work_shared_n`, `seat_state`); the brief prints
one clause.

## Rejected alternatives

- **Make `responsibleNodeId` return a set.** It is called from ~20 modules and
  every one expects a single node id for an LCA-based roll-up. Changing its
  contract would silently reinterpret every existing figure. The set lives in a
  new function; the old one is untouched.
- **Give a line holder a synthesized altitude** (e.g. default to the manager
  rung). This is inventing an org chart from a reporting line, which ADR-0075
  already refused.
- **Auto-derive the seat from the line without a declared altitude.** Same
  objection, one layer down.
- **Widen `canSee` to the union of all managers of any named person.** That makes
  a cross-line record readable by people accountable for only one of its subjects
  — a sideways disclosure disguised as matrix support.

## Consequences

- A declared line is now fully usable end to end: fan-out (write) → seat
  (resolve) → scope (read) → digest (roll-up) → panel/CSV/brief (report).
- A workspace declaring no line is byte-identical: no injected option, no line
  field on any seat, `viaLineN = 0`. Pinned by test.
- Honest limits, printed in the ADR and the session log:
  - Module read models that scope on `seat.scope` directly (rather than through
    `canSee`) remain tree-scoped. They **under**-show for a line manager; they
    never over-show. This is the fail-closed direction and is logged as debt.
  - Seats remain workflow declarations, not authentication.
  - An allocation on a line is still a declaration, not a measurement (ADR-0140).
