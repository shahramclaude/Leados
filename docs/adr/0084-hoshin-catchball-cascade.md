# ADR-0084: Hoshin Kanri & Catchball Cascade — bilateral strategy deployment, watermelon divergence, double-loop thesis falsification, and capacity-priced cascade roll-up (`#/catchball`)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 124 (Schema v90)
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0027](./0027-strategy-coherence-terminal.md), [ADR-0075](./0075-command-chain.md), [ADR-0076](./0076-operating-seat.md), [ADR-0078](./0078-decision-rights-exchange.md), [ADR-0080](./0080-mission-control.md), [ADR-0081](./0081-altitude-router.md), [ADR-0082](./0082-sealed-spine.md), [RESEARCH §106](../../RESEARCH.md)

## 1. Context

LeadOS had strong single-altitude strategy and execution primitives that never met vertically:

1. **Strategy Coherence (`#/strategy`, `strategy.js`)** held CEO-level strategic bets (`strategyBets`) with target effort shares and falsifiable stop rules, and measured aggregate say–do drift across flat `portfolio` items — without multi-level decomposition down the `person.managerId` reporting tree.
2. **Goals (`#/goals`, `goals.js`)** held flat OKR records with no parent–child cascade tree, no multi-level roll-up, no distinction between leading process execution and lagging outcome realization, and no bilateral negotiation record.
3. **Decision Rights Exchange (`#/mandates`, `mandates.js`)** transferred authority over a single existing operational item (case, decision, delegation, goal), not multi-horizon strategic deployment across spans.
4. **The Command Chain, Operating Seat, Mission Control, Altitude Router, and Sealed Spine (`#/chain`, `#/seat`, `#/mission`, `#/routing`, `#/seal`)** established a five-altitude hierarchy (Jaques 7 / 30 / 90 / 180 / 365-day horizons), fail-closed API/route governance (`guardApiCall`, `workspaceRouteVerdict`), small-cell + complementary suppression, and hash-chained per-transaction seals — yet lacked a closed-loop **vertical strategy-to-execution deployment & negotiation engine**.

Meanwhile, the 2026 enterprise strategy-execution market (post-Microsoft Viva Goals retirement and post-WorkBoard/Quantive consolidation; see `RESEARCH.md §106`) splits into two disconnected halves: OKR platforms (WorkBoard, Cascade, Mooncamp, Betterworks, Perdoo, Jira Align) that average child goal percentages into "watermelon" green roll-ups without capacity verification, and Hoshin Kanri / X-Matrix tools (`i-nexus`, `Amplon`, `KPI Fire`, `KaiNexus`, `Kanrix`, `hoshin.app`) that digitize X-Matrices and bowler charts without coupling catchball counter-offers to measured person-day queueing saturation (`load.js`), live commitment-accounting budget envelopes (`finance.js`), double-loop thesis falsification, or hierarchy-scoped disclosure.

## 2. Decision

Ship the **Hoshin Kanri & Catchball Cascade Terminal (`#/catchball`)** on Schema v90 as an integrated domain + view + post-commit module family (`app/core/domain/catchball{Registry,Schema,Rules,Actions}.js`, `app/core/domain/catchball.js`, `app/views/catchball.js`):

### 2.1 Explicit Named Cross-Domain Frameworks

1. **Hoshin Kanri X-Matrix & Bowling Charts (Akao 1991; Jackson 2006):**
   - Four explicit quadrants linked by typed causal correlations (`strong`, `moderate`, `supporting`):
     - *South:* Multi-year / annual Breakthrough Bets (`strategyBets`, 180–365d, VP/CEO).
     - *West:* Cascaded Span Pacts (`catchballPacts` at Director 90d / Manager 30d / Frontline 7d).
     - *North:* Leading Process Commitments (`leadingMetric`, `leadingTarget`, `leadingActual`, `leadingPct`) paired with Lagging Outcome Targets (`laggingMetric`, `laggingTarget`, `laggingActual`, `laggingPct`) — keeping dimensional units explicit rather than averaging incommensurable KPIs.
     - *East:* Accountable Span Owners (`ownerId = toSeatId`), Capacity Headroom (`buildLoadReport`), and Encumbered Budget Authority (`evaluateBudget`).
2. **Dantzig–Wolfe (1960) Price-Directive & Kornai–Lipták (1965) Resource-Directive Decomposition (Priced Catchball):**
   - Upstream seats (`fromSeatId`) propose target + horizon + resource envelope; downstream seats (`toSeatId`) hold local feasibility knowledge (`buildLoadReport` saturation/WIP/allocatable days).
   - Every Catchball turn is an **append-only row** in `catchballRounds` (`propose`, `counter`, `accept`, `checkin`, `withdraw`).
   - Counter-proposals must name a concrete feasibility mechanism: `scope-trim` (revised target/date), `trade-off` (explicitly naming an existing `portfolio`, `goal`, or `case` record to de-scope/defer via a `trades-off` graph edge), or `resource-ask` (requesting person-days or same-currency budget authority).
   - **Silent-Overload Refusal:** Accepting a pact when the receiving span is already in the `saturated` or `overloaded` band (`load.js`) **refuses silent consent** unless the round attaches a concrete `trade-off`, `scope-trim`, or explicit written overload rationale (`overloadJustification`).
   - **Commitment Accounting Binding (`finance.js`):** When an agreed pact includes a priced `resourceAskAmount` against an active `budgetId`, acceptance atomically appends a `committed` encumbrance line in that budget's exact currency (refusing cross-currency or closed-budget writes) and optionally materializes/links an owned execution `goal`.
3. **Goldratt Theory of Constraints / Leontief Weakest-Link Production vs. Prendergast (1993) "Watermelon" Divergence:**
   - Every parent pact computes **two** vertical roll-ups side-by-side over its active child pacts:
     - **Effort-weighted mean progress** $\bar{y} = \sum w_i y_i / \sum w_i$ (what conventional OKR cascades report), and
     - **Weakest-link bottleneck floor** $y_{\min} = \min_i y_i$ across strongly-coupled child pacts.
   - When $(\max(\text{reportedPct}, \bar{y}) - y_{\min}) \ge \text{catchballWatermelonGapPct}$ (default `25` pp), the pact enters a **Watermelon state**: green on the outside (reported/average), red at the core (weakest-link bottleneck).
4. **Argyris & Schön (1978) Double-Loop Learning — Thesis Failure vs. Execution Failure:**
   - Bowler check-ins separate **leading process adherence** (`leadingPct`) from **lagging outcome realization** (`laggingPct`).
   - Four diagnostic quadrants:
     - `aligned` (leading $\ge$ floor, lagging $\ge$ floor): causal thesis and execution both holding.
     - `execution-drift` (leading $<$ floor, lagging $<$ floor): process inputs were not delivered; coach/unblock capacity at the owning span.
     - `lucky-variance` (leading $<$ floor, lagging $\ge$ floor): outcome arrived without the planned mechanism; audit noise vs. tailwind.
     - `thesis-suspect` (**Double-Loop Falsification**: leading $\ge 80\%$ AND lagging $\le 35\%$ past midpoint or graded check-in): **execution is explicitly exonerated** (`executionExonerated: true`) — the frontline/manager team ran the play faithfully, and the upstream strategic causal hypothesis failed. Escalation routes **upward** to review the `strategyBet` and linked `premise`, never downward as performance blame.
5. **Combinatorial Cascade Explosion Guard ($b^d$) & Concentration (HHI):**
   - Tracks branching factor per level, active pacts per span, and Herfindahl–Hirschman concentration across spans so a $3^4 = 81$ cascade fan-out is flagged before exhausting organizational attention.
6. **Fréchet Joint Delivery Bounds, Wilson 95% Intervals & Strictly-Prior Brier Calibration:**
   - Joint parent delivery probability reports the assumption-free **Fréchet bounds** $[\max(0, \sum p_i - (k - 1)), \min_i p_i]$ alongside the independence product $\prod p_i$, refusing point claims below the evidence floor.
   - Settled pacts (`gradedOutcome: 'delivered' | 'missed' | 'thesis-invalidated'`) are graded **once** against their frozen prospective confidence (`frozenConfidencePct`), computing Wilson 95% intervals (withheld below `catchballFloorN = 5`), strictly-prior sequential Brier skill, and countered (`roundCount >= 3`) vs. no counter (`roundCount <= 2`) delivery lift.

### 2.2 Cross-Module & Cross-Altitude Event-Driven Spine (`catchballRule`, `RULE-HK-01..03`)

Registered on `DEFAULT_POST_COMMIT_RULES` immediately after `altitudeRouterRule` (before `attentionMarketRule`, `successionRule`, `seatRule`, and `sealRule`; newly created decisions are emitted through the shared event queue):

- **`RULE-HK-01` (Vertical Roll-Up & Multi-Module Provenance):** Writes idempotent typed graph edges: `deploys-strategy` (`catchballpact → strategy`), `cascades-to` (`parent catchballpact → child catchballpact`), `counters-upward` (`catchballround → catchballpact`), `trades-off` (`catchballpact → portfolio | goal | case`), `cascades-to` (`catchballpact → goal`), `funds` (`catchballpact → budget`), and one `rolls-up-to` edge per leadership ancestor in `buildSeats` (`ownerId → manager → director → VP → chief`) in the same atomic transaction.
- **`RULE-HK-02` (Watermelon & Double-Loop Strategy Escalation):**
  - On Watermelon breach ($\ge \text{catchballWatermelonGapPct}$), opens at most one governed DACI `decision` per parent pact per ISO week (`[HK-WML:<pactId>:<week>]`) at the parent span and appends one bounded 1:1 alignment prompt (`[HK-TP:<pactId>]`).
  - On Double-Loop `thesis-suspect` divergence, exonerates execution and opens at most one governed Strategy Hypothesis Review DACI `decision` per pact per ISO week (`[HK-DBL:<pactId>:<week>]`) linked to the upstream `strategybet` (and `premise` when linked).
- **`RULE-HK-03` (Cascade Saturation & Calibration Floor):** Records an append-only `catchballMarkers` advisory when an altitude cell reaches the calibration floor (`n >= 5`) and opens one governed review decision per breaching cell per ISO week (`[HK-CAL:<cell>:<week>]`) when delivery hold rate falls below `catchballReliabilityFloorPct`. Marker-idempotent, pausable via `catchballAutoPropagate`, while explicit `catchball.scan` always executes.

### 2.3 Five-Altitude Role Tiering & Disclosure Contract

- **Route & API Gateway:** `#/catchball` is open across ranks 1–5 (`workspaceRouteVerdict` and `routeVerdict`). `ACTION_RIGHTS['negotiate-catchball']` spans ranks 1–5 while action handlers enforce **tree-constrained party + ancestor scope**:
  - A seat can propose downward only to spans inside its subtree;
  - Only the receiving span (`toSeatId`) can accept or counter upward (silence or ancestor override is never receiver consent);
  - Peer spans outside `seat.scope` are denied sideways both in `canSee` (`ownerId = toSeatId`) and in `catchballActions`.
- **Altitude-Specific Disclosure:**
  - *Frontline (Rank 1, 7d) & Manager (Rank 2, 30d):* Named pact detail, capacity headroom check, counter-offer workbench (`scope-trim`, `trade-off`, `resource-ask`), weekly/monthly bowler check-ins.
  - *Director (Rank 3, 90d):* Functional X-Matrix, unit-leader attribution, watermelon gap detector, cross-team trade-off arbitration.
  - *VP / Executive (Rank 4, 180d) & CEO (Rank 5, 365d):* Portfolio/enterprise X-Matrix, pooled vs. weakest-link roll-up, primary + complementary small-cell suppression (cells with `0 < n < catchballCellFloor` and a sibling complement when needed withhold exact counts as intervals), double-loop bet invalidation alerts, identity-free executive brief, and aggregate-only CSV scope #79 (executive altitude cells withheld) (`catchball-cascade`).

## 3. Rejected Alternatives

1. **Averaging child goal `%` into parent OKRs.** Arithmetic averaging of heterogeneous percentages destroys dimensional units and manufactures green watermelons out of red bottlenecks.
2. **Treating `leadingPct >= 80% && laggingPct <= 35%` as an individual or team performance deficit.** Punishing faithful execution of a flawed upstream bet destroys honest reporting (Goodhart 1975; Prendergast 1993).
3. **Top-down cascade auto-creating accepted child goals without receiver consent or capacity check.** Violates bilateral Catchball and silently overloads downstream queues.
4. **Claiming local seat tiering or small-cell suppression is multi-user security or differential privacy.** Both remain workspace workflow/disclosure contracts inside a single-browser local store, stated plainly in UI and exports.

## 4. Consequences

- **Schema v90 (`MIGRATIONS[89]`):** Additive migration adding `catchballPacts`, `catchballRounds`, `catchballMarkers`, and clamped settings (`catchballWatermelonGapPct`, `catchballLeadingFloorPct`, `catchballLaggingFloorPct`, `catchballFloorN`, `catchballReliabilityFloorPct`, `catchballCellFloor`, `catchballMaxFanout`, `catchballAutoPropagate`).
- **Graph & Spine Parity:** `LINK_ENTITY_TYPES` gains `catchballpact` and `catchballround`; `LINK_RELATIONS` gains `deploys-strategy`, `cascades-to`, `counters-upward`, and `trades-off`; `DEFAULT_POST_COMMIT_RULES` and `PROPAGATION_CONTRACTS` advance together `63 → 64` while preserving `[attentionMarketRule, successionRule, seatRule, sealRule]` at the tail; `CSV_EXPORTS` advances `78 → 79` (`catchball-cascade`).
