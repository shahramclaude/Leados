# ADR-0041 — The Structural Design Terminal: measure the shape, then let the leader change it

**Status:** accepted · **Date:** 2026-10-30 · **Schema:** v53 · **Session:** 76

## Context

Seventy-five sessions of this workspace optimise work *inside* a structure: the
portfolio, the queue, the risks, the pay, the exits. The structure itself — who
reports to whom, how wide each unit is, and where decision authority sits — was
represented only as ascriptive metadata: `changes.topology` recorded a Team
Topologies flavour on a change programme, `people.managerId` held a line, and the
network module inferred a collaboration graph. Nothing evaluated a proposed
reporting structure, and nothing priced the consequence of one.

That is the decision a first-time manager is most often handed and least equipped
to make. It is also the one management decision with no instrument in the market:
the category sells org-chart software (drawing) and engagement surveys
(experience), and consultants sell the analysis as a slide. The slide has no
falsifiable claim in it.

## Decision

Ship a **Structural Design Terminal** (`#/orgdesign`, Schema v53) that treats a
reporting structure as a measurable object and a reorg as a pre-registered
decision.

1. **The structure is derived, never declared twice.** The tree is built from
   `people.managerId`. Span is out-degree; layers are the longest path;
   coordination channels are `n(n−1)/2` per unit with the manager included
   (Graicunas 1933; Brooks 1975). A cycle, a self-managed record and a dangling
   manager are **reported and cut**, never silently repaired.
2. **The decision queue is measured, not assumed.** For each manager, arrivals
   are estimated from their own completion count in a declared window (Little
   1961 in steady state), `Ts` is the median of their own completed commitment
   spans, `Cs` their own coefficient of variation, and the wait is Kingman's
   (1961) diffusion approximation. Below three completions the queue is
   `insufficient`; at `ρ ≥ 1` the wait is `null` because an unstable queue has no
   finite expectation.
3. **Money is derived from recorded pay or it is absent.** Coordination is priced
   with the manager's loaded hourly cost from the latest effective merit cycle. A
   manager with no recorded pay makes the unit `unpriced`; the page prints the
   priced share beside the total so a partial sum can never be read as the whole.
4. **A design is a draft until it is committed, and committing changes the
   roster.** `commitOrgDesign` validates (owner, at least one real change, no
   cycle, no archived person, no dangling manager), applies every move to
   `people.managerId` in one transaction, and freezes the prediction —
   measured and modelled values stored separately — in the same write. The
   previous line for every moved person is recorded so `revertOrgDesign` restores
   exactly that line and leaves alone any line someone changed again.
5. **The counterfactual is labelled a model.** A proposed structure scales the
   measured arrival rate by the ratio of coordination channels before and after.
   That scaling is a declared convention, and it is printed beside every number
   it produced. The module never claims the scaled wait is a forecast.
6. **A reorg is pre-registered.** The commit freezes span, coordination hours and
   a per-manager modelled P80 wait; `settle` compares them with what the same
   managers measure afterwards and appends the median absolute percentage error,
   withheld below the declared floor. The prediction is never rewritten.
7. **The residual becomes one decision, not one bargain.** `RULE-ORD-02` opens a
   single DACI decision about the *mechanism* (split, move a workstream, shrink
   scope) plus one owned scope task on the most over-band manager. Moving one
   named report to one named manager is deliberately not an option: it converts a
   structural finding into two private conversations and leaves the span where it
   was.
8. **Churn is human, and treated as such.** `RULE-ORD-03` queues at most three
   blameless 1:1 prompts on the people whose line or depth changed, asking what
   they lost in the change. The idempotency marker is reserved out of the
   character budget, so a long prompt cannot silently lose the marker and
   re-append itself on every scan.
9. **No composite ranking.** Candidate designs are compared on four minimised
   objectives and reported as a Pareto set. A weighted index would decide the
   trade-off the leader has to decide.

## Consequences

- A leader can now answer "is the shape of this team the reason everything is
  slow?" with four numbers derived from their own records, and can test a
  proposed structure before anyone is told.
- Committing is destructive to the roster and deliberately gated: owner, real
  change, acyclic, and reversible. `revert` refuses to overwrite a later
  decision.
- The module is quiet when nothing is wrong: no breach, no unstable queue, no
  stale draft, no overdue review → no signals.
- The lineage, typed-link registry, propagation contracts, automation catalog,
  CSV scope #47, Insights bucket and demo cleanup all carry the new type, so the
  new module is not a surface bolted on beside the engine.

## Limits this ADR records

- Coordination hours per channel and the span band are **declared conventions**,
  not validated instruments. The band is classical supervisory guidance, not
  evidence about this team.
- The queue is a single-server approximation; a manager is not literally one
  server, and correlated arrivals between two managers are not modelled.
- The channel-scaling counterfactual is a convention. It can be wrong in either
  direction, and the calibration card exists to contradict it over time.
- Pay is whatever the workspace records; there is no HRIS feed and no market
  data. A unit with no pay is unpriced, never estimated.
- Nothing here recommends which person should report to which person, scores a
  person, or infers a reorg from the current manager column.
- Real-browser and assistive-technology behaviour remains a manual review
  responsibility; the JSDOM + axe harness is not a screen reader.

## Alternatives rejected

- **Draw an org chart and call it design.** The market already does this; it
  produces no testable claim.
- **Optimise the tree automatically.** A solver that moves people is an
  authority the leader cannot delegate to a page, and it would optimise a declared
  objective function the organisation never agreed to.
- **Rank designs by a weighted score.** It hides exactly the trade-off the
  decision is about.
- **Infer a reorg from history.** A "design" reconstructed from the current
  manager column would invent the rationale and the prediction the leader is
  supposed to own.
- **A second pay source.** Pay comes from the merit cycle the workspace already
  holds; a second table would let two salaries disagree.
