# ADR-0030: Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation & Cross-Module Governance

- **Date:** 2026-10-28
- **Status:** Accepted
- **Session:** 66 (Schema v43 — additive settings & pure domain coupling, zero schema migration required)

## Context

Prior to this decision, LeadOS modeled **Strategic Portfolio Capacity & Flow** (`app/core/domain/capacity.js`, `simulation.js`, `scenarios.js`) and **Operational Resilience & Continuity** (`app/core/domain/resilience.js`) as analytically rigorous yet **stochastically decoupled** engines:

1. `simulatePortfolio` ran seeded Beta-PERT + Reinertsen CD3 + Goldratt Critical-Chain Monte Carlo trials assuming uninterrupted vendor, service, system, and steward availability ("fair-weather" capacity).
2. `buildResilienceReport` evaluated Simchi-Levi Time-to-Survive ($\text{TTS}$), Time-to-Recover ($\text{TTR}$), Avelino minimal hitting-set Bus Factor, multi-tier Nth-party choke points, Williamson supplier hold-up risk, and split-conformal continuity-drill calibration (`evaluateDrillCalibration`), without feeding stochastic outage preemption back into delivery schedules.

Across the 2026 market landscape — Decision Intelligence Platforms (Quantexa, IBM, Decisions, FlexRule), EU DORA / Operational Resilience suites (Fusion Risk Management, Fortiv, Cutover, Continuity2, Opsbook), and Strategic Portfolio Management tools (Planview Portfolios, Planisware, Tempus Resource, Jira Align) — continuity testing and engineering/operating-plan delivery forecasts remain trapped in separate organizational silos. Consequently:
- A plan that appears feasible at 75% fair-weather horizon fit can collapse below 50% once vendor/service outages preempt Critical-Chain bottleneck stewards ("fair-weather mirage").
- Teammates who simultaneously own funded critical-path deliverables and serve as primary/sole verified stewards on shock-exposed capabilities suffer hidden preemptive interruption starvation ("dual-hat contention").

## Decision

1. **Two Pure, Dependency-Clean Domain Modules (`< 24 KB` per module):**
   - `app/core/domain/continuityCoupling.js` implements the pure All-Weather Continuity-Coupled Portfolio Monte Carlo engine (`samplePoisson`, `computeTailRisk`, `horizonArrivalLambda`, `simulateCoupledPortfolio`, `rankHardeningInterventions`).
   - `app/core/domain/continuityCouplingRule.js` implements `COUPLING_RULES` (`RULE-CPL-01..03`), `continuityCouplingRule`, read-side `continuityCouplingSignals` (`CPL-01..04`), and `buildContinuityCouplingBrief`, importing link primitives directly from `cases.js` so `automation.js` can aggregate all 114 canonical rules (`AUTOMATION_RULES`) with zero circular imports.

2. **Common-Random-Numbers (CRN) Paired Sub-Streams (Law, 2014):**
   - Every trial $k \in \{1,\dots,N\}$ draws Beta-PERT effort and baseline operational reserve fluctuations from `effortRng` (seeded identically to `simulatePortfolio`) and draws Poisson dependency disruptions from an independent `shockRng` (`hashSeed(seed, 'continuity-shocks')`).
   - This guarantees pathwise dominance ($\text{coupledDays}^{(k)} \ge \text{fairWeatherDays}^{(k)}$ on every trial $k$), zero-drift identity when no active dependencies carry positive failure probabilities, and low-variance counterfactual ranking in `rankHardeningInterventions` and `#/scenarios`.

3. **Survival-Probability Arrival Scaling, Multi-Tier Cascades & Epistemic Drill Floor:**
   - Recorded `annualFailureProb` ($p \in (0, 100]\%$) converts into a horizon Poisson rate $\lambda_H = -\ln(1 - \min(0.999, p/100)) \cdot (H / 365)$, sampled via Knuth ($<30$) / Hörmann PTRS ($\ge 30$).
   - Below $n = 5$ scored continuity drills (`RESILIENCE_MIN_DRILL_SAMPLES`), the engine refuses to invent synthetic TTR spread (`calibrationMode: 'declared-point-ttr'`, `conformalUpperMultiplier: null`). Once $n \ge 5$ drills exist, trial recovery durations bootstrap empirical `realizedTtrDays / estimatedTtrDays` ratios alongside the split-conformal upper factor (`drillCal.band.highFactor`, Vovk et al., 2005).
   - Active critical/important dependencies lacking `annualFailureProb` or `ttrDays` are never assigned fabricated probabilities; they are omitted from shock sampling and surfaced explicitly via `CPL-03` (`unmodeledCriticalDeps`).

4. **Coherent Per-Currency Tail Risk (Rockafellar & Uryasev, 2000):**
   - Survival-buffer shortfalls ($\max(0, \text{outage}_d - \text{TTS}_d)$) accumulate financial disruption exposure strictly per ISO currency (`tailLossByCurrency[currency] = { mean, p50, var90, cvar90, max, nonZeroProb }`), never summing across currencies or inventing FX rates.

5. **Generalized Multi-Hop Post-Commit Spine Integration (`postCommit.js`):**
   - `continuityCouplingRule` is registered in `DEFAULT_POST_COMMIT_RULES` after `resilienceRule` and before `decisionTempoRule`.
   - **`RULE-CPL-01`** opens at most one undecided DACI trade-off decision (`chosen: ''`) when `fairWeatherMirage` holds (`fairWeather.horizonFitProbability >= 0.50` while coupled fit drops below `couplingMinFitPct` or drops by $\ge$ `couplingTailDropPct` pp or slips P80 by $\ge 7\text{d}$), wiring typed `decides` links to both the top shock-driving `dependency` and `portfolio` commitment. Because `postCommit.js` publishes `decision.created` for newly created decisions within the same breadth-first transaction, `decisionTempoRule` (`RULE-DLY-03`) automatically prices Cost-of-Delay (`CD3`) and proposes a decision timebox in the **same atomic store commit**.
   - **`RULE-CPL-02`** opens one idempotent, blameless relief delegation (`authority: 'recommend'`) and appends one `[CPL:<personId>]` 1:1 talking point (never evicting employee-queued `talkingPoints`) when a dual-hat steward's coupled overload jumps by $\ge 15\text{pp}$ to $\ge 50\%$, self-cleaning the prompt once contention clears.

6. **Deliberately Rejected Directions:**
   - **Invented default failure probabilities (e.g., 5%/yr fallback) for unestimated dependencies:** fabricates tail risk without evidence; rejected in favor of explicit `CPL-03` abstention disclosures.
   - **Cross-currency CVaR summation via hardcoded FX tables:** violates LeadOS's local-first currency-integrity invariant; rejected in favor of per-currency Expected Shortfall cohorts.
   - **Automatic portfolio de-scoping or automatic on-call rotation removal:** violates human-in-the-loop governance; `RULE-CPL-01` and `RULE-CPL-02` propose structured DACI trade-offs and `recommend`-level delegations, never deciding on the leader's behalf.

## Consequences

- Leaders inspect side-by-side **Fair-Weather vs All-Weather** delivery certainty and dual-hat steward contention in `#/capacity`, rank candidate redundancy upgrades on the **Resilience-to-Delivery Hardening Frontier** in `#/resilience`, test `dependencyHardening` levers counterfactually in `#/scenarios` (`?hardenDep=<id>`), and review blameless dual-hat contention on `#/prep/:id` and `#/today`.
- `AUTOMATION_RULES` in `app/core/domain/automation.js` is unified across all 114 canonical rules (`+ SCO_RULES`, `RULE-AAR-01..03`, `RULE-ROB-01`, `COUPLING_RULES`).
- Standalone bundle density remains well inside the `< 24 KB/module` and `< 3.5 MB` tripwires. Real-browser visual inspection and assistive-technology speech output remain `[UNVERIFIED]` in this sandboxed CLI session.
