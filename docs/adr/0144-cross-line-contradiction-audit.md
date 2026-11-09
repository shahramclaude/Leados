# ADR-0144: The Cross-Line Contradiction Audit — the design defect behind the demand you keep arbitrating

- **Status:** accepted
- **Date:** 2026-11-09
- **Deciders:** LeadOS session 195 (CEO / C-suite rotation, matrix structure)
- **Extends:** ADR-0140 (matrix accountability ledger), ADR-0141 (matrix line
  seat), ADR-0142 (matrix budget exposure), ADR-0143 (cross-line priority
  arbitration)

## Context

ADR-0143 gave a matrix the instrument to settle *which of two lines' dated
demands goes first* for one person, in one window. That is an adjudication: it is
correct, dated, and re-fought.

It cannot answer the question a chief asks before the next quarter is planned,
and which no adjudication can answer:

> Two lines of my matrix are each chartered to optimise something. Do their
> charters, **as written**, make one another permanently unachievable for the
> people who sit on both — and is the precedence we just arbitrated going to be
> re-fought every quarter for the rest of the year?

A precedence settles a demand. It cannot settle a *design*. When one line is
chartered to push utilisation and another to pull lead time down, the person on
both is not facing a scheduling problem that a written order fixes; she is facing
two success criteria that cannot both hold. The order makes the loser late. It
does not make the loser achievable.

No single-chain tool can ask the question at all: with one manager there is one
charter, and the contradiction does not exist.

## Decision

Add a **Cross-Line Contradiction Audit** (`#/contradiction`, Schema v121):

1. **Declare charters, not measurements.** `lineMandates` records, per line, the
   **lever** from a closed taxonomy, the **direction**, the share of the
   scorecard in integer basis points, an optional claim on one **existing**
   budget envelope, and an optional declared target. Nothing is inferred from a
   goal's title or from a key result's numbers — a leader who wanted 30 from 40
   may have wanted less of a bad thing or more of a good one.
2. **Derive findings, store rulings.** Five families are re-derived on read from
   the declarations, the live matrix and the existing goal/budget records:
   `lever-opposition`, `coupled-trade-off`, `incentive-oversubscription`,
   `incentive-opposition`, `envelope-overclaim`. Only the declarations and the
   chief's rulings are stored. No finding, severity, total or multiplier is ever
   persisted.
3. **Reserve `incompatible` for what can be proved.** The utilisation/lead-time
   coupling carries an arithmetic test — Kingman's VUT / τ(1−τ) — and only above
   the declared knee does it read `incompatible`, with the multiplier printed
   beside it. Every other coupling is a **trade-off** a process change can move,
   so it reads `tension` and says so. A pair of charters that shares no person is
   `isolated` and counted separately, so an audit cannot inflate its own severity
   by pairing every line with every other line.
4. **Separate the two acts at the end.** A ruling opens exactly one governed
   decision. **Only a resequence** issues dated work, and only to the single line
   the chief named. Accepting a trade-off is not assigning anybody a task.
5. **Refuse rather than default.** A missing weight, claim or utilisation target
   yields `insufficient evidence` naming the missing figure. A total that depends
   on an undeclared share is refused, never summed over the declared part. A
   person whose lines are partly outside the acting seat is counted out, never
   summed partially and presented as a whole.

## Consequences

- A chief can now see, before planning, whether two lines' declared objectives,
  incentives or envelope claims make one another unachievable — and can fix the
  design instead of re-arbitrating its symptoms.
- Every finding is an instrument that can fail: it names what it could not
  derive, prints `isolated` separately from `incompatible`, and reconciles three
  distinct claims (findings add up; every finding has been ruled on; the printed
  rows equal the total).
- The audit is **inert in a single-chain workspace** — zero findings, no edges, no
  decisions — because a contradiction between one charter and itself is not a
  thing.
- **Honest limits.** Cost, quality, growth, margin, inventory and service level
  are **declared** couplings, not measured elasticities: the module names the
  literature and refuses to claim impossibility. The utilisation knee is a
  declared convention, because the true position depends on arrival and service
  variability this workspace does not measure. A line's scorecard share is
  assumed to apply to everyone on that line. Seats remain workflow declarations,
  not authentication.

## Evidence

`app/core/domain/contradiction{Registry,Schema,Audit,Rules,Actions}.js`,
`app/views/contradiction.js`, `RULE-CNT-01` in `PROPAGATION_CONTRACTS`,
`tests/app/contradiction-audit.test.mjs` (21 checks), CSV scope #107.
