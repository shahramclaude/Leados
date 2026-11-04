# ADR-0089: Value Stream Exchange — lateral SLAs and reviewed stop-rule capital carryover

- Status: Accepted
- Date: 2026-11-04
- Session: 127
- Schema: v93 (additive `92 → 93`)
- Surface: `#/valuestream`
- Rules: `RULE-VS-01..03` on the existing post-commit spine
- CSV: scope #82, aggregate-only

## Context

ADR-0084 made vertical strategy deployment bilateral and capacity-priced. Two gaps remained:

1. A frontline span can depend on a **peer**, not only on an ancestor. Forcing that hand-off through vertical Catchball either fabricates authority the ancestor does not possess or sends the work through a generic dependency note without SLA evidence.
2. A `thesis-invalidated` settled pact is evidence that an allocation should stop. Settlement alone leaves its committed budget line encumbered and offers no safe way to move remaining capacity to a surviving bet.

The competitive hunt in `RESEARCH.md §109` found horizontal-alignment guidance and continuously updated portfolio reallocation, but no local, atomic join of bilateral peer SLA consent, CPM network effects, immutable capital lineage and receiver consent. Vendor capabilities were not independently benchmarked.

## Decision

Build one Value Stream Exchange on the **existing** reporting tree, Catchball records, Finance lines, Strategy bets, Operating Seat rights, typed graph and post-commit engine. Do not create a second hierarchy, workflow, capital ledger or executive snapshot.

### 1. Peer supplier–customer contracts

`valueStreamContracts` records a supplier seat, consumer seat, LCA mediator, metric, unit, direction (`at-least` / `at-most`), target, actual, effort, lead time, dates and negotiation state. Either party may initiate; the other party must counter or accept. `valueStreamRounds` is append-only and freezes each offer, counter, acceptance, actual and settlement.

- Only the supplier records actuals.
- Only the consumer verifies fulfilment.
- The LCA mediator owns recovery governance but cannot consent, report or settle for a party.
- Vertical ancestor→descendant deployment remains Catchball; a self/LCA-vertical peer contract is refused.
- A fulfilled/missed settlement must agree with the directional evidence; it cannot repaint a miss green.

### 2. Network computation, not a network picture

Agreed contracts form directed supplier→consumer edges. `buildValueStreamNetwork` applies Kelley–Walker Critical Path Method to compute longest lead-time path, per-edge slack and directed downstream blast radius. A cycle returns an explicit `[UNVERIFIED]` refusal rather than looping or printing a path. Proposed/countered work does not enter the agreed critical path.

### 3. One event-driven, cross-altitude spine

`valueStreamRule` is ordered before Decision Tempo and Catchball:

- `RULE-VS-01` writes typed `rolls-up-to` links through **both** parties' existing leadership branches, `mediated-by`, `supplies-pact` and strategy provenance.
- `RULE-VS-02` opens at most one governed DACI recovery decision per overdue directional miss per contract per ISO week. Decision Tempo can price it in the same commit; no outcome is auto-changed.
- `RULE-VS-03` writes carryover lineage: `releases-capacity`, `funds-next-cycle`, `reallocates-to` and `funds`.

Catchball additionally consumes `valuestream.reallocated`, so the proposed receiving pact receives `deploys-strategy`, budget and every vertical `rolls-up-to` link in the **same transaction**. `sealRule` remains last.

### 4. Stop-rule carryover is previewed and atomic

Only settled `thesis-invalidated` pacts with resolvable open `committed` source lines qualify. Missed execution, spent lines, released lines and consumed sources do not.

The non-mutating preview computes:

- source budget authority by currency; mixed currencies are refused;
- releasable person-days as `max(0, planned effort − recorded actual effort)`;
- zero released effort for unknown actuals, with a visible warning;
- receiving budget pipeline exposure after the source release;
- excess capacity, excess money, target ceiling and receiving load;
- a 64-bit FNV-1a digest over source versions/statuses/amounts and target terms/budget exposure.

Commit requires that exact digest. Any relevant change makes the preview stale. In one store transaction it:

1. changes only open source `committed` lines to `released` with the receipt id;
2. preserves settled grades, historical events and all spent actuals;
3. appends an immutable `valueStreamReallocations` receipt;
4. creates a **proposed**, not accepted, receiving Catchball pact and opening round;
5. creates at most one `planned` receiving line, leaving FAC unchanged until consent.

The receipt is the double-spend guard. Unallocated amounts stay visible and are not silently reoffered. Withdrawing the receiving pact releases its line without reopening sources.

The FNV digest is a staleness detector, **not** a signature or authentication mechanism.

### 5. Permissions and disclosure are reviewed adapters

The exact-method API allowlist remains fail-closed. Only `valueStreamContractPropose` bypasses the generic vertical payload-person check because a peer proposal intentionally names two subtrees; the action itself then requires active party membership and LCA resolution. Other peer commands retain the gateway and party checks.

Carryover uses the existing `approve-capital` right (VP/executive and chief), not peer-negotiation permission. A narrow Catchball exception lets the named receiving seat accept/withdraw the exact receipt-linked planned line without obtaining general portfolio-budget authority; it cannot alter the amount or envelope outside a counter-offer.

Party/LCA membership is the only sideways read exception. Unrelated peers get no contract body. Directors see unit work in scope; VP/chief reads are aggregate with small-cell suppression unless that executive is the named mediator. Local seats remain declarations, **not authenticated multi-user security**.

## Schema and migration

Additive collections: `valueStreamContracts`, `valueStreamRounds`, `valueStreamReallocations`, `valueStreamMarkers`. Settings add bounded cell floor, decision cap and automation pause. `catchballPacts.effortActualDays` is nullable; old history stays unknown. New graph nodes: `valuestreamcontract`, `valuestreamreallocation`. New relations are system-generated.

`MIGRATIONS[92]` adds empty arrays and defaults without reconstructing an SLA, effort actual, grade, reallocation or historical financial fact. Normalizers drop malformed/terminal-inconsistent records and bound every ledger.

## Role-tiered surface

- **Frontline:** own supplier promises, counters, actual evidence and weekly hand-offs.
- **Manager:** monthly peer negotiation, capacity trade-offs and consumer verification.
- **Director:** quarterly LCA mediation, CPM bottleneck and governed breach recovery.
- **VP/executive:** half-year aggregates and reviewed stop-rule capital carryover.
- **CEO/chief:** enterprise flow, typed drill-down, aggregate brief and CSV; small cells withheld.

Five panels: Network & CPM, Peer Contracts, Stop-Rule Carryover, Altitude Roll-up, Brief & Method.

## Consequences and limits

- Peer contracts can model real hand-offs without pretending the common leader performed either party's consent.
- A source can be carried over once; a receiving proposal cannot create a second encumbrance on acceptance.
- CPM is deterministic lead-time arithmetic, not a delivery probability. Little's Law is not invoked without WIP/throughput evidence.
- Small-cell suppression is not differential privacy. Aggregate reports are a local disclosure convention.
- Actual effort is required for person-day carryover; old pacts can still release money with zero inferred effort saving.
- No FX conversion, autonomous capital movement, automatic receiver acceptance, or person-level performance score is introduced.
