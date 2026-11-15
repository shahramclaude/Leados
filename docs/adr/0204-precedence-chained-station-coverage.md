# ADR-0204: Precedence-Chained Station Coverage — Enabling Declarations, an Exact Acyclic Check, and a Hall Witness over the Enabling Order

Date: 2026-11-15 · Session 272 · Schema v158 → v159 · Status: Accepted

## Context

ADR-0201 answered a subset question exactly: can these simultaneous stations
all be manned at once, given qualified, available, consented people? Its own
reader stated a boundary and left it open — a station that can only run when
another is manned was still modelled as an independent node — and the
Planned-gap register (logged at Session 269, named for this rotation at
Session 271) named the failure mode precisely:

> A station that can only run when another is manned is still modelled as an
> independent node, so a window can read `feasible` while its real precedence
> structure is unsatisfiable; needs declared station-to-station enabling
> edges, an acyclic check, and a Hall witness over the induced
> feasible-ordered subgraph.

Every multi-station run has interlocks: a coolant pump manned before the drill,
a feeder station manned before its consumer, a permit before the work it
authorises. A register that staffs each station independently can prove
capacity arithmetic that no running order can honour — or, worse, prove it
silently, because both stations look independently coverable.

## Decision

One new append-only ledger and one new proof boundary. Nothing about the
existing capacity mathematics changes.

### Declarations only — `stationEnables` (Schema v159)

A window's holder declares an enabling declaration as a dated, append-only row:
`stationEnables { id, windowId, holderId, fromStationId, toStationId, reason,
declaredAt, retiredOn, retiredBy, retireReason }`. The semantics are uniform
and printed everywhere: **"the dependent may not be manned before the enabler
is manned" — prerequisite to start, decided as at-or-before.** The `concurrent`
set shares the one instant all of them are up by definition; a `sequential`
station occupies some other instant inside the window (never the concurrent
instant), but the register holds NO intra-window clock and claims none. A
declaration is filed only inside the declaring holder's own live window, only
between two live stations of that window, never onto the same station, with a
written reason of at least 10 characters; the same holder may retire it with a
written reason of their own beside the untouched original (the original is
never edited). A second live declaration for one ordered pair is retained and
refused, not chosen between. All of it survives replay exactly as the other
three station ledgers do; no order, cycle, verdict or closure is ever stored.

### The acyclic check is exact, and there is exactly one kind of unsatisfiable cycle

The reader builds the live enabling digraph over the window's live stations and
computes its strongly connected components (Tarjan 1972, deterministic order).
A cycle forces all of its members to one start instant. Two cases, and only
two:

- **Every member is `concurrent`.** The cycle collapses onto the shared
  simultaneous instant; the declarations are satisfiable by it. Printed as a
  declared **co-requisite loop** — information, never a defect, never a
  shortage. No order claim is made or needed inside one instant.
- **At least one member is `sequential`.** A sequential member cannot be moved
  onto the shared instant, and at least one concurrent member cannot leave it.
  No running order exists whatever anyone is assigned — **from the
  declarations themselves, not from the roster.** The window reads
  `unsatisfiable`: `proven` is true, no matching is attempted, no deficient
  set is printed (there is no shortage to name), and the reasons name the
  cycle's stations in order. This is a fifth verdict, kept distinct from
  `infeasible` because two different facts are never collapsed: `infeasible`
  says the people cannot cover the demand; `unsatisfiable` says the
  declarations cannot be honoured at all.

An enabling edge pointing at a retired station is retained and carries no
order — counted as dangling, printed, never inferred from. Nothing here reads
wall-clock history more finely than the day, and no intra-window timing is
assumed.

### The Hall witness over the feasible-ordered subgraph

When no unsatisfiable cycle exists the enabling order exists, and the
simultaneous proof is **unchanged** — every declared station is mandatory, so
co-requisites among the concurrent set can neither relax nor tighten the
matching. What the order refines is the witness. The inclusion-minimal
deficient set is now shrunk in **reverse enabling order** (the most
downstream station is dropped first, ties broken deterministically), so
whenever an equally small proof exists it names the upstream stations whose
failure forces the rest. Whether the printed witness is **enabler-closed**
(every dependent named carries its enabler with it) is **computed and
printed, never forced** — Hall's condition needs no closure, and forcing one
could drop a load-bearing station.

### Surface, automation, export

`#/standard-work?panel=stations` prints the declarations with who must come up
first and the declared reason, per-cycle banners (co-requisite loop vs
unsatisfiable, in words), and a per-window precedence summary; the holder may
declare and retire from the card. `RULE-SSC-01` gains a third condition:
`precedence-cycle` files ONE dated ask per unsatisfiable cycle to the **window
own holder** (only the declarer may repair a declaration contradiction), it
names the cycle and the three permissible answers — retire one enabling
declaration, retire or re-declare one station, or re-declare the member as
concurrent knowing the shared instant is then the only place it can run — it
closes itself when no unsatisfiable cycle remains, it never fires for a
past window, and all-concurrent co-requisite loops are never asked about.
Self-closing, idempotent per signature, bounded at 6 per commit, pause-governed
on every path. CSV #148 extends with `unsatisfiable_windows_n`,
`enabling_edges_n`, `precedence_cycles_n` (aggregate only, no station title,
reason, person, manager or record id). The brief prints the same counts from
the same reader; the enable rows narrow to what the seat's span may see and
never cross the disclosure floor into names.

### What is deliberately NOT claimed

- No intra-window clock. Whether two sequential stations collide, whether an
  enabling edge crosses requirement types with some other intended spacing,
  and any duration question at all, are the heijunka/levelling problem — still
  refused, in words, on every read.
- No assignment. Declaring an order never staffs it; the register still
  proves possibility and a human still decides.
- No co-requisite "help" from the matching: all-concurrent mutual enabling
  does not weaken or strengthen the demand that must be manned.
- `unsatisfiable` is a proof from declared facts, and the fix is a human
  retirement act — the register never edits or re-points a declaration.

## Consequences

- Schema v158 → v159 (one EMPTY additive ledger; a v158 workspace opens with
  no enabling declarations and behaves exactly as before). Engine version
  `station-coverage-2026.11-v2`. `STATION_COVERAGE_VERDICTS` gains
  `unsatisfiable`; CSV #148 gains three aggregate columns.
- New capabilities carry their own refusal paths: an unreadable declaration is
  retained and refuses coverage; a duplicate live ordered pair is refused, not
  preferred; a cap of 120 live declarations per window (2,400 retained rows)
  keeps the graph auditable by a human.
- **Sequential-window levelling remains open** (the heijunka question), and now
  has a precise home: the enabling DAG plus slack, not the Hall proof.

## Verification

`tests/app/station-coverage.test.mjs` — 26/26, including: migration 156→159 is
additive and infers nothing; the normalizer refuses self-edges, ghosts, short
reasons and duplicate ordered pairs; a mixed concurrent/sequential cycle reads
`unsatisfiable` (no matching claimed, distinct from capacity infeasibility);
an all-concurrent cycle reads as a co-requisite loop with the capacity proof
untouched; the witness prints its enabler-closure as found (one closed, one
not); a dangling declaration induces no order; declarations through the real
store are holder-only, duplicate-refused, retirable once, with the original
reason preserved; RULE-SSC-01 asks the holder per unsatisfiable cycle, never
for a co-requisite loop, closes itself, and stays idempotent. Adjacent suites
(core 56/56 with csv; standalone 7/7 after rebuild at 13,393,040 bytes / 848
modules), canonical boundary, docs links and a11y all pass. Store-level
walkthrough: declare → verdict flips to `unsatisfiable` → panel/brief/CSV
print identical counts → retire → cycle collapses → `feasible` again.

## Benchmark

Category: resource-constrained scheduling with precedence (RCPSP, IBM ILOG CP
Optimizer, OptaPlanner, SAP PP/DS) and the precedence handling in enterprise
rostering suites (UKG Pro WFM / Kronos, Workforce Software, Rotageek). None
were licensed or reachable from this workspace, so hands-on parity is
**[BENCHMARK-UNVERIFIED]**. Argued as genuinely better than the category
default: a contradiction in the declarations is named exactly (which members,
in cycle order) with its precise satisfiability class (co-requisite collapse
vs unsatisfiable), and the shortage witness is inclusion-minimal AND prefers
upstream load-bearing stations with its closure printed — where rostering
suites fail loudly on infeasibility but do not classify declaration
contradictions, and schedulers optimise makespan rather than prove one shift
honest. Believed matched: deterministic, replayable proof output; integer,
exact arithmetic; no inferred allocation. Real market parity remains unverified.
