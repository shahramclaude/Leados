# ADR-0012: Operational resilience, dependency topology, and verified continuity as a first-class ledger

## Status

Accepted — 2026-10-27, Session 45.

## Context

First-time engineering and operational leaders rarely fail because of risks they already wrote on a risk register; they get blindsided by **structural continuity gaps** hidden across people, internal systems, and external suppliers:

1. **Key-person single points of failure (SPOFs) disguised by paper backups.** Listing a "backup owner" in a wiki does not create operational continuity. Under Avelino et al.'s (2016) Bus Factor model, a capability's true Bus Factor only increases when a secondary steward has been **explicitly verified** via independent execution or a continuity drill. Worse, when a primary steward is overloaded or takes leave, leaders routinely treat SPOF exposure as an individual performance conversation rather than a blameless org-design obligation.
2. **Survival buffers vs. recovery duration (`TTS` vs. `TTR`).** Static risk matrices score subjective likelihood × impact adjectives and miss Simchi-Levi et al.'s (*Operations Research* 2015; HBR 2014/2020) operational discontinuity: a low-spend, sole-source upstream dependency whose **Time-to-Recover ($\text{TTR}$)** exceeds downstream **Time-to-Survive ($\text{TTS}$)** creates a deterministic survival shortfall $\max(0, \text{TTR}_{\text{eff}} - \text{TTS})$ whose financial Risk Exposure Index ($\text{REI}$) can exceed high-spend diversified contracts.
3. **Sub-tier / Nth-party cascades and supplier hold-up.** RiskLedger's *Every Link Matters 2026* benchmark shows 35%–45% of concentration risk sits in shared sub-tier dependencies beyond Tier-1 vendors, and EU DORA Articles 11, 26, and 29 require mapping Critical or Important Functions (CIFs), Nth-party ICT concentration, exit strategies, and scenario-tested recovery within impact tolerances. Simultaneously, under Williamson's (1985) transaction-cost economics, sole-source suppliers with $\text{TTR} > \text{TTS}$ and no tested exit plan possess structural hold-up power at renewal.

Neither cloud SEI platforms ($40k–$150k/yr SaaS focused on git/AI-adoption telemetry) nor enterprise GRC/ERDS suites ($100k+/yr compliance databases) give a local-first manager a single operational terminal connecting dependency topology, human Bus Factor, financial exposure, vendor negotiations, DACI continuity trade-offs, and Cost-of-Delay decision timing.

## Decision

1. **First-class Schema v29 `dependencies` ledger (`app/core/schema.js`, `app/core/domain/resilience.js`).**
   - Adds `dependencies` (`service`, `vendor`, `system`, `process`) with `criticality` (`critical`, `important`, `supporting`), `ttsDays`, `ttrDays`, `substitutability` (`none`, `untested-alt`, `warm-standby`, `dual-active`), `warmSwitchDays`, `upstreamIds` (cycle-checked DAG), `stewards` (`primary`, `backup`, `trainee`, `verifiedOn`), `drills` (`tabletop`, `failover-drill`, `live-incident` with `estimatedTtrDays`, `realizedTtrDays`, `outcome`), and cross-module pointers (`linkedGoalIds`, `linkedBudgetId`, `linkedNegotiationId`, `linkedStakeholderId`, `linkedPortfolioId`).
   - Adds `'dependency'` to the typed relationship graph (`app/core/domain/cases.js`) with `'depends-on'`, `'stewards'`, and `'continuity-tests'` relations while preserving `FORBIDDEN_LINK_TYPES = ['conflict', 'pulse']`.

2. **Epistemic firewalls (never invent continuity or money).**
   - **Verification firewall:** `trainee` stewards and `backup` stewards with `verifiedOn === null` never count toward `busFactor` or `computeTeamBusFactor` (exact iterative-deepening / minimal hitting-set search). Completing a cross-training delegation logs history (`RULE-RES-06`) without fabricating `verifiedOn`.
   - **Multi-currency non-invention:** `deriveDependencyImpact` derives daily shortfall exposure strictly from linked portfolio Cost of Delay, open case PERT exposure, negotiation stakes, committed/spent budget lines, or explicit spend/override. Currencies are never converted or summed; unpriced nodes remain explicitly `unpriced`.
   - **Distribution-free drill calibration:** `evaluateDrillCalibration` reuses `forecastIntegrity.js`'s split-conformal band (`coverage = 0.80`, `minSamples = 5`) on `realizedTtrDays / estimatedTtrDays` ratios, refusing quantiles below $n = 5$ paired drills.

3. **Generalized post-commit cross-module cascade (`RULE-RES-01..06` -> `RULE-DLY-03`).**
   - `resilienceRule` runs inside `POST_COMMIT_RULES` **before** `decisionTempoRule`, and `decisionTempo.js` prices `dependency-shortfall` exposure across `decides -> dependency` links:
     - `RULE-RES-01`: syncs typed graph links and refreshes `derivedDailyImpact` on $\ge 20\%$ linked financial drift without overwriting human overrides.
     - `RULE-RES-02`: critical non-vendor capabilities with `busFactor <= 1` open one idempotent blameless cross-training `Delegation` and queue a focus/vacation-protection 1:1 talking point.
     - `RULE-RES-03`: critical capabilities with `TTR > TTS` open one DACI continuity trade-off `Decision`, which `decisionTempoRule` (`RULE-DLY-03`) **atomically prices and proposes a Cost-of-Delay / EVSI timebox for in the exact same store transaction**.
     - `RULE-RES-04`: high Williamson hold-up vendors (`score >= 60`) inject renewal leverage & parallel-qualification warnings into linked `Negotiation` notes.
     - `RULE-RES-05`: continuity drills that breach tolerance (`outcome === 'breached-tolerance'`) shift underpinned `on-track` active `Goals` to `at-risk` with an explainable check-in and open a linked remediation `Operational Case`.
     - `RULE-RES-06`: completing a cross-training delegation appends audit history while preserving the human verification gate.

4. **Zero-write Counterfactual Disruption Stress Lab (`#/resilience?tab=stress`).**
   - `simulateDisruptionScenario` runs simultaneous human unavailability + multi-tier upstream outages without mutating state, cross-checking surviving backup stewards against `buildCapacityModel` so backups allocated $\ge 90\%$ in Capacity are flagged for contention.

## Consequences

- **Positive:** Leaders get an offline, zero-telemetry Enterprise Resilience Decision System integrated directly with People, 1:1 Prep, Delegations, Goals, Capacity, Budgets, Negotiations, Operational Cases, and Decision Tempo.
- **Trade-offs & Limits:** DAG cycle prevention rejects cyclic `upstreamIds` on write (normalize repairs cycles on untrusted imports); external vendor telemetry is never fetched automatically (local-first invariant); real-browser visual layout and spoken screen-reader output remain `[UNVERIFIED]` in this sandbox.
