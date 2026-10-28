# ADR-0021: Assumption-aware scenario tails as a derived, belief-weighted stress test

## Status
Accepted — 2026-10-28 (Session 55). Derived read model on Schema v36; no migration.

## Decision
Couple evidenced premises to measured committed portfolio work via the existing
two-hop typed graph (`buildPremiseScope`). Run a paired seeded Monte Carlo
(Common Random Numbers) of baseline vs premise-failure worlds; attribute the
P90 widening by leave-one-out (hold one premise true). Cluster premise evidence
by typed source identity and flag pseudo-replication above a 50% weight share.

## Guardrails
- Unmeasured premises (zero committed evidence) are excluded, never coupled from a prior.
- Belief is a stress weight, explicitly NOT an actuarial failure frequency.
- Shock multipliers are transparent conventions (+60/+40/+25%, cap x3), shown in UI/brief/CSV.
- The posterior is never silently rewritten for correlation; concentration is surfaced (TAIL-03).
- Confidential conflicts and anonymous pulses remain unread (scope already excludes them).

## Alternatives rejected
- Auto-calibrated failure frequencies from sparse outcomes (false precision; Session 54 rejection stands).
- Widening PERT triples directly (hides attribution; paired CRN isolates the premise effect).
