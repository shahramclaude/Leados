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
- [ADR-0072: CI must verify the canonical application, not the quarantined tree](./0072-ci-verifies-canonical-app.md)
- [ADR-0073: The Promise Solvency Terminal — the forward promise book as a liability portfolio, graded on the count](./0073-promise-solvency-terminal.md)
- [ADR-0074: The Cross-Examination Terminal — the record arguing against itself, and a published false-alarm rate](./0074-cross-examination-terminal.md)
- [ADR-0075: The Command Chain — one hierarchy, five altitudes, one clock](./0075-command-chain.md)
- [ADR-0076: The Operating Seat — one enforced boundary, one vertical roll-up](./0076-operating-seat.md)
- [ADR-0077: The Succession Terminal — the bench as a certified flow-feasibility claim, with a minimum-cut certificate and a price on an untested bench](./0077-succession-terminal.md)
- [ADR-0078: Decision Rights Exchange — bounded authority contracts over existing work, with two-sided acceptance, budget encumbrance and receiver-partitioned roll-up](./0078-decision-rights-exchange.md)
- [ADR-0079: Authority Calibration Ledger — which spans hold which rights, graded by outcomes, by action class and altitude, without rating persons](./0079-authority-calibration-ledger.md)
- [ADR-0080: Mission Control — the altitude-specific operating loop, scoped API and disclosure-safe brief](./0080-mission-control.md)
- [ADR-0081: The Altitude Router — natural language in, module × altitude out, one atomic roll-up](./0081-altitude-router.md)
- [ADR-0082: The Sealed Spine — a hash-chained, verifiable audit trail over the append-only event log, sealed per transaction and attested up the chain of command](./0082-sealed-spine.md)
- [ADR-0083: The Concordance Terminal — "meets expectations" as a measurement instrument, calibrated between two people and rolled up the chain](./0083-expectation-concordance.md)
- [ADR-0084: Hoshin Kanri & Catchball Cascade — bilateral strategy deployment, watermelon divergence, double-loop thesis falsification, and capacity-priced cascade roll-up (`#/catchball`)](./0084-hoshin-catchball-cascade.md)
- [ADR-0085: The Board Room — the disclosure memo as a pre-registered terminal: thresholds declared before the first look, verdicts by the conservative interval end, disagreement surfaced instead of composited](./0085-board-room.md)
- [ADR-0086: The Disclosure Compiler — every screen declares its posture, the aggregate replaces the refusal, and detail is released only by a consented, expiring contract](./0086-disclosure-compiler.md)
- [ADR-0087: The Operating Cadence Clock — the standing-forum calendar as a queueing system, with declared service time, competence routing, and a planning-fallacy correction (`#/cadence`)](./0087-operating-cadence-clock.md)
- [ADR-0088: The Federated Envoy — sealed, disclosure-scoped, Merkle-committed packets between LeadOS workspaces (`#/envoy`)](./0088-federated-envoy.md)
- [ADR-0089: Strategy Renewal Bridge — freeze the Catchball-to-bet cohort, make each altitude a different renewal decision, and grade only outcomes inside that cycle (`#/strategy-cycle`)](./0089-strategy-renewal-bridge.md)
- [ADR-0090: Programme Federation — measure which declared leadership edges actually carry work, instead of trusting the reporting line (`#/federation`)](./0090-programme-federation.md)
- [ADR-0088: The Hoshin Carryover Terminal — a thesis-invalidated pact settles the bet it deployed, judges its stop rule and releases encumbered authority](./0088-hoshin-carryover-terminal.md)
- [ADR-0089: The Operating Model — the position design, not the person in it (displacement, abstention, congruence, continuity trap and Graicunas coupling, priced into a lever book)](./0089-operating-model.md)
- [ADR-0088: Hoshin Carryover Terminal — a thesis-invalidated Catchball pact settles its bet: the stop rule is judged by a governed decision, encumbered person-days and budget are released into the next allocation cycle, and settled records are graded once, later (`#/carryover`)](./0088-hoshin-carryover.md)
- [ADR-0089: The Attested Commit — per-seat passphrase-derived HMAC authorship over the sealed log, three-valued verification, signed checkpoints, and a fail-closed enforcement gate (`#/identity`)](./0089-attested-commit.md)
- [ADR-0088: The Escalation Economy — absorbed-or-escalated ledger, M/M/1 queue integrity per span, escalation yield, Shannon context loss per rung, Aghion & Tirole de facto centralisation against a graded intervention-rate commitment, and the Oncken & Wass monkey ledger (`#/escalation`)](./0088-escalation-economy.md)
- [ADR-0089: The Hoshin Carryover Terminal — a thesis-invalidated pact settles its bet: stop rule judged, encumbered person-days and budget released into the next allocation cycle, and the prediction graded once (`#/carryover`)](./0089-hoshin-carryover-terminal.md)
- [ADR-0088: Hoshin Carryover Terminal — a thesis-invalidated pact settles its bet: stop rule judged, encumbered resources released, and the next allocation cycle actually sees them (`#/carryover`)](./0088-hoshin-carryover.md)
- [ADR-0089: Value Stream Exchange — lateral supplier–customer SLAs, real CPM, and reviewed invalidated-thesis capital carryover (`#/valuestream`)](./0089-value-stream-exchange.md)
- [ADR-0091: The Subtraction Test — a withheld cell is only withheld if it cannot be recovered, and the check is exact integer arithmetic over every printed total](./0091-aggregate-determinacy.md)
- [ADR-0092: The Differencing Defender — a table can be safe while a SERIES of tables is not; the release is the unit of disclosure, proven by exact integer determinacy over the register, with a brute-force oracle and a planner that refuses rather than leaks](./0092-differencing-defender.md)

- [0093 — Decision robustness without exporting private survey evidence](0093-decision-robustness-lab.md)
- [ADR-0094: The Prospective Intervention Contract — a frozen pre-registered bet, one once-only Brier grade against a strictly-prior base rate, and hierarchy-native calibration roll-up on the shared spine (`#/prospective`, Schema v97)](./0094-prospective-intervention-contract.md)
- [ADR-0095: The Robust Allocation Terminal — a multi-action, capacity-constrained integer allocation solved exactly under Bertsimas–Sim budgeted uncertainty, printing the Wald maximin and Savage minimax-regret plans, the price of the equity floor and the regret a range's resolution releases, with governed adoption and out-of-sample falsification on the shared spine (`#/robust-allocation`, Schema v98)](./0095-robust-allocation-terminal.md)
- [ADR-0096: Registered Terminal Publication — `#/escalation`, `#/measurement`, `#/cadence`, `#/concordance` and `#/survival` declare manifests and mount the shared publication panel, so their printed tables enter the ADR-0092 differencing register as dated, audited releases (no schema bump)](./0096-registered-terminal-publication.md)
- [ADR-0097: The Calibrated Allocator — a certified branch-and-bound (exact rational bounds, strict pruning, one shared node budget, provenance certificate) solves allocations past the enumeration wall and refuses outside its regime; settled prospective grades are read back by altitude × instrument cell beside the declared ranges they grade — flagged as premise–evidence TENSION by RULE-RAL-05, never adjusted by the engine (`#/robust-allocation`, Schema v99)](./0097-calibrated-allocator.md)
- [ADR-0098: Hierarchical Clearinghouse — exact sealed tranche clearing with Clarke hurdles and identity-free upward publication (`#/clearing`, Schema v100)](./0098-hierarchical-clearinghouse.md)
- [ADR-0099: Freeze-Line Continuity Audit — governed comparability of measured carriage across each reorganisation freeze line, held/degraded/refused with Wilson bounds and complementary suppression, and a timing guard so a suppressed row never discloses when it was withheld (`#/freeze-line`, Schema v101, CSV #95)](./0099-freeze-line-continuity-audit.md)
- [ADR-0101: The Reputational Capital Ledger — what an act costs to GUARANTEE here, harvested from records other modules already dated, estimated as a Wilson interval in beta space over a declared class hazard, priced up by an ask-versus-stake premium across four engagement tiers, refused where the declared anchor could decide on its own, and graded once against its own frozen claim (`#/reputation`, Schema v103, CSV #97)](./0101-reputational-capital-ledger.md)
- [ADR-0102: The Hindsight Lock — the decision's information set frozen once in the transaction that records it, partitioned into known / missed / later / undated, read as a Wilson-bounded coverage against the module's own frozen process claim, and split into earned / resulted / variance / fixable / unmeasured so a good outcome from a thin process is named as luck rather than taught as method (`#/hindsight`, Schema v104, CSV #98)](./0102-hindsight-lock.md)
- [ADR-0103: The Epistemic Ledger — what the record already knew and nobody read: seven dated signal classes harvested into one unknown per source record with an evidence-bound expiry, a `rests-on` edge plus one `rolls-up-to` per leadership ancestor written in the same transaction so the MISSED signal is visible above the span that missed it, Cohen's κ with prevalence/bias indices and PABAK refused below its floors, and an implied ledger that bounds blind classes from the ABSENCE of arriving edges (`#/epistemic`, Schema v105, CSV #99)](./0103-epistemic-ledger.md)
- [ADR-0106](0106-evidence-execution-loop.md) — Evidence-based execution closure + role-first navigation: terminal-evidence registry, RULE-EXE-01 reconciliation, ancestor proof edges, Mission execution roll-up and altitude-first sidebar (Session 146, Schema v108).
- [ADR-0105](0105-mission-command-flow.md) — Mission Command Flow: one reviewed note, one atomic case + actions + hierarchy receipt (Session 145, Schema v107).
- [ADR-0104: The Diligence Ledger — before you decided, what was KNOWABLE and did the organisation actually look? A five-module frozen frontier written with one `diligence-for`, one `deliberates-on` per fact and one `rolls-up-to` per ancestor in the SAME atomic commit; consulted/ruled-out-with-a-reason/deferred; Wilson coverage, exact Jeffreys dark classes and one once-only Brier grade of a pre-declared process forecast (`#/diligence`, Schema v106, CSV #100)](./0104-diligence-ledger.md)

- [ADR-0109 — The Jurisdiction Compiler](./0109-jurisdiction-compiler.md) — Session 149, Schema v111, `#/jurisdiction`, RULE-JUR-01..04, CSV #103.
- [ADR-0110 — Derived-event budget: production cap 64 → 256](./0110-derived-event-budget.md) — Session 150, no schema bump, `app/core/domain/postCommit.js`, P0 silent-rollback defect fix.
- [ADR-0111 — Objective-pointer hygiene and span-scoped mandate anchoring](./0111-objective-pointer-hygiene.md) — Session 151, Schema v111, `#/jurisdiction?panel=hygiene`, no schema bump.
- [ADR-0112 — The Boundary-redraw rehearsal: a dry run of an organisational boundary change](./0112-boundary-redraw-rehearsal.md) — Session 152, Schema v111 unchanged, `#/jurisdiction?panel=redraw`, director-and-above, writes nothing.
- [ADR-0113 — The 1:1 Agenda Provenance Ledger](./0113-agenda-provenance-ledger.md) — Session 153, Schema v112, `#/agenda`, `prepare-agenda`. 38 declared prompt families classified by WHO owes each line; a filed line ("I will raise THIS prompt") as the missing object; receipts derived from the logged 1:1, never ticked; queue pressure and receipt rate refused below their floors; identity-free roll-up above director rank; frontline card mounted on the printable prep sheet.
- [ADR-0114 — Reviewed command editing inside Command Flow; the manager-premise authority alignment](./0114-reviewed-command-editing.md) — Session 155, Schema v112 unchanged, `#/mission?panel=capture`, `test-assumption` rank 3–5 → 2–5, optional fail-closed `commandEdits` on captures, options/signpost round-trip fingerprints.
