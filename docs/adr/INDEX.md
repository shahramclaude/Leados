# Architecture Decision Records

ADRs capture architecturally significant decisions: why, not just what. See `CONTRIBUTING.md` →
"When you need an ADR" for the criteria that trigger writing a new one.

Format: copy `0001-record-architecture-decisions.md`, number sequentially, status one of
`Proposed`, `Accepted`, `Superseded by ADR-000N`.

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-rule-based-lead-scoring-v0.md) | Use rule-based scoring, not ML, for v0 | Accepted (legacy `src/` scope) |
| [0006](./0006-canonical-zero-build-app.md) | Zero-build local-first app at the root is canonical (supersedes 0001-canonical-app) | Accepted |
| [0007](./0007-legacy-next-tree-disposition.md) | Explicit disposition & automated quarantine boundary for legacy Next.js / Vite trees | Accepted |
| [0008](./0008-post-commit-rules-hook.md) | Generalized post-commit rules hook for cross-module propagation | Accepted |
| [0009](./0009-single-file-offline-distribution.md) | Ship a single-file, offline, double-clickable LeadOS distribution | Accepted |
| [0010](./0010-on-device-nl-intake-triage.md) | On-device natural-language intake triage with confidence-gated, human-confirmed routing | Accepted |
| [0011](./0011-decision-tempo-terminal.md) | Price the option to wait — decision tempo as a first-class, measured record | Accepted |
| [0012](./0012-operational-resilience-continuity-terminal.md) | Operational resilience, dependency topology, and verified continuity as a first-class ledger | Accepted |
| [0013](./0013-coalition-incentive-war-room.md) | Coalition & incentive war room: computational political economy as a first-class surface | Accepted |
| [0014](./0014-influence-network-intelligence.md) | Influence network intelligence derived only from the leader's own records | Accepted |
| [0015](./0015-impact-ledger-preegistered-evaluation.md) | An Impact Ledger: pre-registration, a counterfactual, and a refusal to claim causation | Accepted |
| [0016](./0016-stakeholder-comms-outbox.md) | A stakeholder comms outbox: drafts from recorded facts, never auto-sent, closure owed to the briefed | Accepted |
| [0017](./0017-allocation-governor-explore-exploit.md) | The Allocation Governor: explore/exploit learning over the operating plan, with a rebalancing floor | Accepted |
| [0018](./0018-cognitive-load-attention-governor.md) | Cognitive Load & Attention Governor: measured per-role saturation, seeded Monte Carlo fit and Little/Kingman queueing from the leader's own records — no surveillance, no ratings | Accepted |
| [0019](./0019-assumption-ledger-premise-sentinel.md) | Premise Sentinel: pre-register, sense, re-decide — a typed, Bayesian Assumption Ledger on the generalized event spine | Accepted |
| [0020](./0020-outcome-scored-premise-sensor-calibration.md) | Outcome-scored premise sensor calibration with human labels, sample floors and forecast-mix drift diagnostics | Accepted |
| [0021](./0021-assumption-aware-scenario-tails.md) | Assumption-aware scenario tails as a derived, belief-weighted stress test | Accepted |
| [0022](./0022-operating-system-dynamics-lab.md) | Operating System Dynamics Lab — stocks, delays and measured loop dominance | Accepted |
| [0023](./0023-structural-capital-allocation.md) | Structural Capital Allocation — budgeted lever portfolios, exact Shapley attribution and a trust ladder that gates "actionable" on out-of-sample skill | Accepted |
| [0024](./0024-early-warning-watch-fdr-alert-budget.md) | Early-Warning Watch — historical design, statistical and cascade claims corrected | Superseded in part by 0025 |
| [0025](./0025-connected-response-and-watch-integrity.md) | Connected response, bounded event delivery and Watch evidence integrity | Accepted |
| [0026](./0026-propagation-ledger.md) | The Propagation Ledger: measured automation, copy-on-write savepoints and durable receipts | Accepted |
| [0027](./0027-strategy-coherence-terminal.md) | The Strategy Coherence Terminal: the distance between a declared strategy and the work the records say is funded | Accepted |
| [0028](./0028-after-action-review-learning-ledger.md) | The After-Action Review & Learning Ledger: close the event, commit a change, count the recurrence | Accepted |

| [0029](./0029-mitigation-robustness-evidence-gate.md) | Mitigation Robustness & Evidence Gate: exact interval regret and human-requested owned verification on the shared spine | Accepted |

| [0030](./0030-coupled-continuity-capacity-simulation.md) | Continuity-coupled portfolio simulation under declared shocks and owner contention | Accepted |

| [0031](./0031-learning-record-corroboration.md) | Record corroboration and practice-persistence follow-through, without causal overclaim | Accepted |

| [0032](./0032-leader-continuity-drill.md) | Leader Continuity Drill: simulate the manager's own absence, price the stall, commission cover, and score the frozen prediction against a real absence | Accepted |

| [0033](./0033-correlated-absence-and-briefing-readiness.md) | Correlated absence stress, eligible-pool concentration and hand-over briefing readiness — reporting how much independence flatters the plan | Accepted |

| [0034](./0034-handover-execution-mechanism-attribution-and-vendor-contagion.md) | Hand-over execution verification, causal mechanism attribution and cross-team vendor common-mode contagion | Accepted |

| [0035](./0035-scorecard-integrity-lab.md) | The Scorecard Integrity Lab: model what a measure makes people do, search for an incentive-compatible redesign, and score the frozen prediction later | Accepted |
| [0036](./0036-bounded-propagation-lineage-and-typed-links.md) | Bounded propagation lineage and navigable typed links across local modules | Accepted |
| [0037](./0037-impact-execution-evidence.md) | Typed Impact execution evidence at score time, separate from outcomes and causal claims | Accepted |
| [0038](./0038-implementation-fidelity-ledger.md) | The Implementation Fidelity Ledger: declared denominators, record-derived delivery, attested judgement, and a dilution correction that stays separate from outcomes | Accepted |
| [0039](./0039-merit-and-pay-equity-terminal.md) | The Merit & Pay-Equity Terminal: a budget as a constrained policy choice, a log-pay decomposition with an honest interval, and a retention model that grades itself | Accepted |
| [0040](./0040-workforce-transition-terminal.md) | The Workforce Transition Terminal: priced exits, a weight-stability ensemble, a four-fifths screen that prints its own fragility, priced compliance swaps, and a frozen survivor prediction | Accepted |
| [0041](./0041-structural-design-terminal.md) | The Structural Design Terminal: span, coordination and decision latency measured from the leader's own records, a Pareto set instead of a score, and a reorg that freezes its prediction before anyone is told | Accepted |
| [0042](./0042-information-value-terminal.md) | The Information Value Terminal: EVPI and EVSI over a declared payoff table, a break-even accuracy a leader can defend, a settled test written into the belief ledger as a likelihood ratio, and the one premise several decisions secretly share | Accepted |
| [0043](./0043-decision-portfolio-sequencing.md) | Decision Portfolio Sequencing Engine: derived coupling, CD3 sequence, deferral regret and a leader's own queue load | Accepted |
| [0044](./0044-leader-probability-calibration.md) | Leader Probability Calibration Terminal: score the leader's own forecasts, show reliability and drift, never auto-correct probabilities | Accepted |
| [0045](./0045-calibration-to-decision-sensitivity.md) | Calibration-to-decision sensitivity: carry a leader's forecast record into EVPI and choice stress without rewriting beliefs | Accepted |
| [0046](./0046-sequential-investigation-planner.md) | Sequential investigation planner: solve the order of declared tests exactly over a bounded horizon, with Bayes conditioning, explicit refusals and three marker-idempotent rules (no schema change) | Accepted |
| [0047](./0047-attention-market-constrained-allocation.md) | The Attention Market: solve the week as a multiple-choice knapsack over monetised obligations with two resource constraints, price the next hour by finite difference, and write the forgone set into the decision register with its price (Schema v57) | Accepted |

- [ADR-0048: Shared-barrier exposure sensitivity without inferred correlation](./0048-shared-barrier-exposure-sensitivity.md)
- [ADR-0049: Governed operating agreements (Autopilot Studio)](./0049-governed-operating-agreements.md)
- [ADR-0050: The Signal Path terminal (cascade reach, latency and deafness)](./0050-signal-path-cascade-latency.md)
- [ADR-0051: The Performance Recovery terminal (due process, evidence and the cost of waiting)](./0051-performance-recovery-due-process.md)
- [ADR-0052: The Delivery Survival terminal (censoring, competing risks and the hazard of waiting)](./0052-delivery-survival-terminal.md)
- [ADR-0053: The Cost of Waiting terminal (pricing the queue the workspace already keeps)](./0053-cost-of-waiting-terminal.md)
- [ADR-0054: The Leadership Parity & Standard Consistency terminal (LMX disparity decomposition, promise reliability, and intra-leader threshold audits)](./0054-leadership-parity-consistency-terminal.md)

- [ADR-0055: The Evidence terminal (pooling what has actually worked here, and pricing one more study)](./0055-evidence-terminal.md)
- [ADR-0056: Trace an unmade decision without inventing its domino effects](./0056-decision-consequence-lab.md)
- [ADR-0057: Decompose delivery drift by cause instead of pooling exits](./0057-drift-decomposition-competing-risks.md)
- [ADR-0058: Transport, decomposed — two axes, three landmarks, challenged freezes](./0058-transport-decomposed.md)
- [ADR-0059: Price the option to wait, not only the cost of waiting](./0059-deferral-option-terminal.md)
- [ADR-0060: Read the whole book: correlated deferral portfolio, joint tail and graded forecasts](./0060-deferral-portfolio.md)
- [ADR-0061: The Signal Integrity Board (charging the error budget and grading the detectors)](./0061-signal-integrity-board.md)
- [ADR-0062: The Borrowed Evidence Engine (partial pooling for every small sample, graded on whether pooling helped)](./0062-borrowed-evidence-engine.md)
- [ADR-0063: A governed authority covariate model — computed, previewed, never operational](./0063-authority-covariate-model-preview.md)
- [ADR-0064: Certify the leader's probability words, and transport them only when the record earns it](./0064-confidence-transport.md)

- [ADR-0065: Rehearse an incident across the real rule graph before committing it](./0065-response-studio.md)
- [ADR-0066: Reviewable, reversible cross-module Action Bundles](./0066-action-bundles.md)
- [ADR-0067: Outcome Attribution & Loop Settlement Terminal (`#/attribution`)](./0067-outcome-attribution-loop-settlement.md)
- [ADR-0068: Counterfactual Policy Terminal (`#/counterfactual`)](./0068-counterfactual-policy-terminal.md)
- [ADR-0069: Measurement Reliability Terminal (`#/reliability`)](./0069-measurement-reliability-terminal.md)
- [ADR-0070: The Coupling Ledger — read a declared ρ back against realised joint timing](./0070-coupling-ledger.md)
- [ADR-0071: The Evidence Supply Chain — refusals as work orders, a measured constraint, and the price of waiting](./0071-evidence-supply-chain.md)
