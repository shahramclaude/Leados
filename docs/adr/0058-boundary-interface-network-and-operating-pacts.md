# ADR-0058 — Cross-Boundary Queue-Network Physics, Congestion Externalities & Clean-Hands Operating Pacts

**Status:** accepted · 2026-10-31 · Schema v68 · Session 95

## Decision

Add the **Boundary & Interface Physics Terminal (`#/interfaces`)** to the canonical, local-first `app/**` product, and complete the previously unactivated **Decision Portfolio (`#/portfolio`)** post-commit propagation contract in the same transactional architecture:

1. **Open Queueing-Network & Variability Propagation (`app/core/domain/interfaces.js`)**:
   - Models declared organizational boundaries (`sourceUnit → targetUnit`) as a Jackson (1957) / Whitt (1983, *Bell System Technical Journal*) open GI/G/1 network.
   - Rework bounce rate $r \in [0, 0.95]$ multiplies effective boundary demand by $\lambda_{\text{eff}} = \lambda_0 / (1 - r)$.
   - Multiple pacts terminating on the same `targetUnit` superpose into a single shared boundary gate ($\Lambda_j = \sum_{i \to j} \lambda_{\text{eff},i}$, arrival SCV $C_{a,j}^2 = \sum_i (\lambda_{\text{eff},i}/\Lambda_j) c_{a,i}^2$).
   - Computes Kingman (1961) expected queue wait $W_q = \frac{\rho}{1-\rho} \cdot \frac{C_a^2 + C_s^2}{2} \cdot \frac{1}{\mu}$, Whitt GI/G/1 departure squared coefficient of variation $C_d^2 = (1-\rho^2)C_a^2 + \rho^2 C_s^2$ (the Lee–Padmanabhan–Whang 1997 operational bullwhip ratio $C_d^2 / C_a^2$), and refuses finite stationary delay estimates whenever $\rho \ge 1$.

2. **Pigouvian Queue Congestion Externalities & Local-Acceleration Surge Paradox (Pigou 1920; Naor 1969, *Econometrica*)**:
   - Separates private queue delay $W_q$ from the marginal external delay imposed on all other queued items $\lambda \frac{\partial W_q}{\partial \lambda} = \frac{W_q}{1-\rho}$, yielding the exact social-to-private delay multiplier $\frac{2-\rho}{1-\rho}$.
   - Prices weekly external congestion cost strictly per currency (`null` when unpriced; currencies are never summed).
   - Evaluates a $+20\%$ upstream throughput surge (assuming $20\%$ faster local cycle time across a 2-day local baseline) without scaling downstream gate capacity $\mu$ or reducing rework $r$, flagging boundaries where downstream queue blow-up exceeds upstream time saved — directly operationalizing 2026 LinearB / Faros AI / Opsera empirical findings on AI local-coding speedups vs. organizational review bottlenecks.

3. **Symmetric Relational Operating Pacts & Clean-Hands Escalation Gate (Fisher & Ury 1981; Ostrom 1990; Gibbons & Henderson 2012; Wilson 1927)**:
   - Stores symmetric `ourGive` and `theirGive` clauses alongside dated bilateral `exchanges` (`intakeClean`, `turnaroundDays`, `metSla`, `bounced`).
   - Computes 95% Wilson score intervals on both **Our Intake Hygiene** and **Counterparty SLA Compliance**, withholding rate verdicts below `interfaceMinExchanges` (default 5).
   - Enforces a **Clean-Hands Escalation Gate**: when our own intake spec cleanliness is below `interfaceCleanHandsFloorPct` (default 70%), `RULE-INT-03` blocks external escalation and opens an internal intake-hygiene delegation (or DACI decision when unowned) plus a blameless 1:1 coaching prompt. Only when our intake clears the floor and counterparty SLA falls below 70% does `RULE-INT-04` prepare a principled Fisher–Ury negotiation record (`negotiations`) linked by `renegotiates-pact`.

4. **Conway / Team-Topologies Mode Alignment & Exact Pareto Frontier (Coase 1937; Conway 1968; Galbraith 1973; Williamson 1985; Skelton & Pais 2019)**:
   - Audits declared interaction modes (`x-as-a-service`, `collaboration`, `facilitating`, `gatekeeper`, `ad-hoc`) against empirical bounce, utilization $\rho$, and standing sync hours.
   - Evaluates four counterfactual boundary levers (intake checklist cutting bounce 50%, deterministic batching $C_a^2 \to 0.35$, self-service automation $+35\%\,\mu$, and WIP admission cap) and marks exact Pareto-undominated interventions across `(waitDays, externalityItemDays, syncHours)` without collapsing objectives into an arbitrary weighted score.

5. **Falsifiable Prospective Compliance Forecasts & Brier Skill (`interfaceAudits`)**:
   - Freezes ex-ante compliance probability $P(\text{joint clean \& on-time rate} \ge 80\%)$ over `[frozenOn, reviewOn]` with a content-free aggregate snapshot (zero titles, unit names, person IDs, or clauses).
   - Grades irreversibly once `today >= reviewOn` using Brier (1950) $(p - y)^2$ and withholds Brier skill against base-rate climatology below 5 graded forecasts (`RULE-INT-06` opens a blameless calibration review when skill $< 0$).

6. **Decision Portfolio (`#/portfolio`) Live Post-Commit Activation**:
   - Replaces the inert `decisionPortfolioRule` array stub with a callable post-commit rule (`RULE-DPF-01..04`), fixes multi-currency cluster isolation and transitive deferral cascades in `decisionPortfolio.js`, wires `decisionPortfolioSignals` into `insights.js`, and enforces `typeof rule === 'function'` across every entry in `POST_COMMIT_RULES`.

## Transactional & privacy consequences

- Schema `67 → 68` migrates existing workspaces cleanly by adding `interfacePacts`, `interfaceAudits`, `interfaceMarkers`, eight clamped `interface*` settings, and `portfolioTriageWeeklyThreshold`.
- `RULE-INT-01..06` and `RULE-DPF-01..04` run inside `runPostCommitRules` with marker-backed idempotency, `interfaceAutoPropagate` / `portfolioAutoPropagate` pause gates, and typed links (`governs-boundary`, `renegotiates-pact`, `stabilizes-queue`, `audits-pact`, `escalates-externality`, `cleans-intake`, `harvests-friction`).
- CSV scope #58 (`interfaces`, `boundary-interfaces`) exports opaque positional `PACT` (`IF01..`) and `CALIBRATION_SUMMARY` (`ALL`) rows with zero titles, unit names, person IDs, clauses, or free text, and blanks Wilson bounds below `interfaceMinExchanges`.

## Alternatives rejected

- **One-sided SLA countdown timers (ServiceNow / Jira OLA style):** ignores requester intake hygiene and rewards noisy escalations when upstream specs are incomplete.
- **Passive email/calendar/Slack scraping (ONA surveillance style):** violates LeadOS local-first privacy boundaries and confuses message volume with queue congestion.
- **Fabricated finite wait times at $\rho \ge 1$:** stationary GI/G/1 expectations diverge at $\rho \ge 1$; reporting a finite number would be mathematically false.
- **Cross-currency summation of externality or carrying costs:** violates LeadOS monetary honesty invariants without a declared FX table.

## Validation

Covered by `tests/app/interfaces.test.mjs`, expanded `tests/app/decision-portfolio.test.mjs`, `tests/app/propagation-ledger.test.mjs`, `tests/app/typed-links-lineage.test.mjs`, `tests/app/csv.test.mjs`, `tests/app/access-audit.test.mjs`, and `tests/app/standalone.test.mjs`. Real-browser assistive-technology walkthrough and field deployment remain **[UNVERIFIED]**.
