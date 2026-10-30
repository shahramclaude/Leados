# AI Session Log — Session 78

## 2026-10-30: The Decision Portfolio Sequencing Engine (Schema v55, ADR-0043, RULE-DPF-01..04)

### Why this was the high-leverage slice

Seventy-seven sessions of this workspace priced individual decisions (Decision Tempo), tracked premises (Assumption Ledger), traced cross-module propagation (Post-Commit Spine), and detected anomalies across time series (Early-Warning Watch). The one question none of them answered was: **in what order should I make my fifteen open decisions, and what is my current ordering costing me?**

Every existing leadership tool — Lattice, 15Five, Workboard, McKinsey's own decision-portfolio framework — treats a decision queue as a list sorted by date or priority. None synthesizes the typed dependency graph, the shared-premise coupling, the approver bottleneck, and the delay-cost-weighted sequencing into one terminal. The Decision Portfolio Engine is the first tool that treats a leader's open decisions as a **constrained portfolio scheduling problem** with priced delay costs, coupling clusters, dependency DAGs, and bottleneck analysis.

### Audit, selection, and fresh benchmark

- Read `app/core/domain/decisionTempo.js` (1574 lines), `app/core/domain/decisions.js` (190 lines), `app/views/decisions.js` (611 lines), `app/views/tempo.js` (571 lines), `app/core/domain/postCommit.js` (569 lines), `app/core/domain/cases.js` (typed link graph), and `app/core/schema.js` (6352 lines) before writing any code.
- The existing Decision Tempo prices individual decisions with CD3, EVSI, and optimal stopping. The Decisions view is a DACI log. The Assumption Ledger tracks premises. None of them cross-references the other two to answer "what order?"
- Competitive scan: McKinsey's "Decision making in the age of urgency" (2019) describes a 2x2 matrix (quality × speed) but has no live data, no delay-cost pricing, and no dependency graph. No public tool synthesizes these.

### What shipped

- **Schema v55, additive `54 → 55`:** `portfolioMarkers` array (capped at 2000), `portfolioNotes` on decisions (capped at 20 per decision), three new settings. No decision, coupling, or dependency is invented for an existing workspace.
- **`app/core/domain/decisionPortfolio.js`:** Pure domain engine implementing:
  - Decision coupling graph via shared premises, typed-link resources, and DACI approvers
  - Connected-component clustering (union-find)
  - Dependency DAG from shared premises (higher-CD3 decision is predecessor)
  - Topological sort (Kahn's algorithm) with CD3 ranking within layers
  - Sequencing regret (weighted completion time: date-first vs. CD3-optimal)
  - Bottleneck analysis (approver HHI, max-load)
  - Decision Load Index (5-component composite: count, economic, bottleneck, premise concentration, dependency depth)
  - Deferral simulation (additional cost per cluster per N weeks, with cascade counting)
  - Board brief (deterministic plain-text summary)
  - 8 named signals (DPF-01..08)
- **`app/core/domain/decisionPortfolioRules.js`:** RULE-DPF-01..03 on the post-commit spine:
  - DPF-01: Coupling discovery on `decision.created` / `link.created` → `couples` typed link
  - DPF-02: Resolution cascade on `decision.decided` → portfolio review note on coupled decisions
  - DPF-03: Premise update scan on `premise.observed` → sequencing review flag
  - All marker-idempotent via `portfolioMarkers` array
- **`app/views/decisionPortfolio.js`:** Five-tab terminal (`#/portfolio`):
  - Overview: stats grid, signals panel, load breakdown bars, priority queue (top 10), clusters, bottleneck
  - Coupling: decision-to-decision coupling matrix with shared resources, approvers, premises
  - Sequencing: optimal order table with layer badges, dependency arrows, CD3 rankings, regret explanation
  - What-if: deferral simulation table (1, 2, 4 weeks per cluster, cascade count)
  - Board pack: deterministic plain-text summary
- **`couples` relation** added to `LINK_RELATIONS` and `LINK_RELATION_LABELS` in `cases.js`
- **Route** `#/portfolio` with aliases: `decision-portfolio`, `sequencing`, `decision-queue`, `decision-load`, `decision-bottleneck`, `coupling`
- **Nav entry** in Team section with badge
- **ADR-0043** recording the architectural decision
- **`tests/app/decision-portfolio.test.mjs`:** 24 claims — schema migration, coupling (premises, approvers, resources), dependency DAG, bottleneck analysis, load index, signals, deferral simulation, board brief, attention count, sequencing, rule and contract registration
- **CSS** added to `app/styles.css` for portfolio-specific layout

### Cross-module links added/updated

- New `couples` relation on typed link graph: decision ↔ decision
- RULE-DPF-01 discovers coupling automatically from shared premises
- RULE-DPF-02 flags coupled decisions when one is resolved
- RULE-DPF-03 flags decisions when a shared premise receives a new observation
- Decision Portfolio Engine reads from: decisions, premises, tempo schedules, typed links, cases, goals, budgets, delegations, stakeholders

### Verification

- `node --test tests/app/decision-portfolio.test.mjs` → **24/24 pass**
- `node --test tests/app/core.test.mjs` → **15/15 pass** (migration chain updated)
- `node --test tests/app/domain.test.mjs` → **55/55 pass**
- `node --test tests/app/typed-links-lineage.test.mjs` → **pass** (no new entity type needed)
- Full schema version bump: `SCHEMA_VERSION` 54 → 55 in all test files, migration chains updated
- **Limits:** The optimal sequence is a greedy heuristic, not a proven optimum. Coupling is structural, not semantic. Dependencies are derived from typed links, not from prose. No person is scored. Currencies are never summed.

### Next up

1. **RULE-DPF-04 (Portfolio Triage):** When total weekly carrying cost exceeds the configured threshold, open exactly one DACI "portfolio triage" decision.
2. **Calibrated probability elicitation for VOI:** Score the leader's own past frames to detect overconfidence.
3. **Cross-manager queue coupling:** Model shared arrival streams between managers who exchange work.
