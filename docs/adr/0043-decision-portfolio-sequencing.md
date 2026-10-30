# ADR-0043: Decision Portfolio Sequencing Engine

**Date:** 2026-10-30
**Status:** Accepted
**Schema:** v55
**Module:** `app/core/domain/decisionPortfolio.js`, `app/views/decisionPortfolio.js`, `app/core/domain/decisionPortfolioRules.js`

## Context

LeadOS could already record decisions (Decisions), price an individual decision's timing (Decision Tempo), trace its premises (Assumption Ledger), and cascade events across modules (Post-Commit Spine). None of those answered the question a leader with fifteen open calls actually asks: **in what order should I decide these, and what is my current ordering costing me?**

Every existing leadership tool treats a decision queue as a list. The Decision Portfolio Engine treats it as a **constrained portfolio scheduling problem**.

## Decision

Build a pure domain engine that synthesizes data from decisions, typed links, premises, and tempo schedules into four analytical lenses:

1. **Decision Coupling** (Simon 1962; Baldwin & Clark 2000): Two decisions are coupled when they share a premise, an approver, or a typed resource (case, goal, budget, delegation, stakeholder). Coupling is derived from the typed link graph — never declared. Connected components form clusters that should be addressed together.

2. **Precedence-Constrained Scheduling** (Pinedo 2012; Möhring et al. 1997): A decision B depends on decision A when both rest on the same premise and A has higher CD3. The dependency DAG is topologically sorted into layers.

3. **CD3 Prioritization** (Reinertsen 2009): Within each topological layer, decisions are ranked by CD3 = Cost of Delay ÷ Duration. Unpriced decisions are listed last — never zero.

4. **Bottleneck Analysis** (Goldratt 1984; Hopp & Spearman 2011): Approver HHI measures concentration. The most-loaded approver is the binding constraint.

A **Decision Load Index** (count × 0.15, economic × 0.35, bottleneck × 0.20, premise × 0.15, depth × 0.15) classifies the queue from light to critical.

**Sequencing regret** measures the gap between date-first and CD3-optimal ordering.

**Deferral simulation** prices what waiting N weeks costs per cluster, including cascade to downstream dependencies.

### RULE-DPF-01..04 on the post-commit spine

- **DPF-01**: On `decision.created` or `link.created`, scan for other open decisions sharing a premise and register a `couples` typed link. Marker-idempotent.
- **DPF-02**: On `decision.decided`, scan for coupled open decisions and append a portfolio-review note.
- **DPF-03**: On `premise.observed`, scan for open decisions resting on the premise and flag sequencing review.
- **DPF-04**: (Not yet implemented — reserved for portfolio triage decision when carrying cost exceeds threshold.)

### Schema v55 migration

Additive only: `portfolioMarkers` array for RULE-DPF idempotency, `portfolioNotes` array on decisions for resolution/premise flags, three new settings (`portfolioReviewIntervalDays`, `portfolioCarryCostThreshold`, `portfolioAutoPropagate`).

### New typed link relation

`couples` — decision ↔ decision, discovered by RULE-DPF-01 when two decisions share a premise.

### Navigation

Route `#/portfolio` (aliases: `decision-portfolio`, `sequencing`, `decision-queue`, `decision-load`, `decision-bottleneck`, `coupling`). Five tabs: Overview, Coupling, Sequencing, What-if, Board pack.

## What is not claimed

- The optimal sequence is a greedy heuristic on a topological sort, not a proven optimum. Weighted job scheduling with precedence constraints is NP-hard.
- Coupling is structural, not semantic. Two decisions about the same topic with no shared typed link are invisible.
- Dependencies are derived from premises and typed links, not from prose.
- The sequencing regret assumes delay costs are additive and independent.
- No person is ever scored, ranked or rated.

## Verification

- `tests/app/decision-portfolio.test.mjs`: 24 claims covering schema migration, coupling detection (premises, approvers, resources), dependency DAG, bottleneck analysis, load index, signals, deferral simulation, board brief, attention count, sequencing, and rule/contract registration.
- Full repo suite: all existing tests updated to Schema v55.

## Consequences

- The leader's open decision queue is now a portfolio with priced sequencing, not a list.
- Every decision created or resolved automatically discovers its coupled peers.
- The typed link graph gains a `couples` relation.
- The post-commit spine gains one new rule with four marker-idempotent effects.
