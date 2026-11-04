# ADR-0088: The Hoshin Carryover Terminal — a thesis-invalidated pact settles the bet it deployed (`#/carryover`)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 127 (Schema v95, additive `94 → 95`)
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0067](./0067-outcome-attribution-loop-settlement.md), [ADR-0073](./0073-promise-solvency-terminal.md), [ADR-0084](./0084-hoshin-catchball-cascade.md), [ADR-0087](./0087-operating-cadence-clock.md), [ADR-0089](./0089-operating-model.md)

## 1. Context

The Catchball Cascade (ADR-0084) lets a pact be settled as **thesis-invalidated**: the assumption the pact deployed is gone, so the work stops. LeadOS could record that verdict but not carry it anywhere. The bet the pact was deploying kept its committed resources, its stop rule was never judged, and the encumbered person-days and budget line stayed encumbered against work nobody would do. The ledger was honest about the *decision* and silent about the *consequences*.

## 2. Decision

Ship the **Hoshin Carryover Terminal (`#/carryover`)** as an additive schema step (`94 → 95`, `RULE-CO-01..04`) that turns one invalidated pact into one carryover record, judges the bet it deployed, and releases the encumbered authority into the next allocation cycle — in a single transaction, on the existing propagation spine.

## 3. Consequences

- **Additive only.** An older workspace opens with an empty carryover ledger and the declared conventions. No existing record is rewritten.
- **A released line is released as already-spent**, never subtracted from a recorded actual: the money was committed, and pretending it was never spent would be a second, quieter lie.
- **`sealRule` remains absolutely last** on the spine; carryover runs immediately after Catchball and before the attention market.
- **Honest gap:** the terminal addresses its ledger panels (`queue`, `bets`, `resources`, `calibration`) rather than a single focused record. `resolveLinkedEntity` therefore returns the panel route, not a fabricated `record=` parameter the view would ignore.
