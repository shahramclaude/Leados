# ADR-0111 — Objective-pointer hygiene and span-scoped mandate anchoring

**Status:** Accepted · Session 151 · Schema v111 (no bump — schema unchanged)
**Scope:** `app/core/domain/jurisdictionRegistry.js`, `app/core/domain/jurisdiction.js`, `app/core/domain/jurisdictionRules.js`, `app/core/domain/jurisdictionActions.js`, `app/core/domain/accessGateway.js`, `app/core/domain/propagationContracts.js`, `app/views/jurisdiction.js`
**Altitudes:** frontline (primary), manager (primary), director, executive, chief

## Context

In [ADR-0109](./0109-jurisdiction-compiler.md), `harvestObjectives` grouped open
work records (`cases`, `decisions`, `portfolio`) by objective pointer and
silently skipped every record with no goal pointer (`!keys.length`). On the
shipped demo workspace, 23 of 30 open work records (all 7 open calls and 16 of
21 portfolio items) were excluded with no count, no refusal and no completeness
bound. In addition:

1. **Dangling pointers were priced as live objectives.** A work record naming a
   deleted goal id or a `dropped` goal was grouped, frozen and priced into a
   `RULE-JUR-02` boundary decision as if the objective still existed.
2. **Persisted decisions lost their objective pointer on reload.** In
   `app/core/schema.js`, `decisions` do not persist `linkedGoalId`; their
   canonical objective provenance is a typed `impacts-goal` edge in
   `state.links`, which `objectiveKeysFor` previously ignored.
3. **Frontline leads and mid-managers had no span triage or remediation.** Ranks
   1–2 saw an unscoped enterprise cluster table and had no governed command in
   `#/jurisdiction` to anchor unlinked or dangling work inside their own span.

## Decision

1. **Zero silent exclusions (Heckman 1979 sample-selection framing + Wilson 1927
   completeness interval).** Every open non-engine work record across
   `JUR_SOURCES` is classified into `anchored`, `unanchored`
   (`refusalKey: 'unanchored-work'`) or `dangling`
   (`refusalKey: 'dangling-objective'` when a referenced goal id is missing from
   `state.goals` or has `status === 'dropped'`). Exact workspace, source and
   altitude counts are computed before any display slice, with a Wilson 95%
   score interval on `anchoredWorkN / openWorkN` (refused below
   `jurEvidenceFloorN` as `thin-anchoring`).
2. **Graph + field objective resolution.** `objectiveKeysFor` resolves goals
   from declared `objectivePaths` AND persistent `impacts-goal` edges in
   `state.links`, so anchored decisions and non-goal-sourced portfolio items
   survive `normalizeState`.
3. **Dangling clusters are refused and superseded on the shared spine.**
   `priceCluster` refuses any cross-branch cluster with a missing or `dropped`
   goal (`verdict: 'refused'`, `refusalKey: 'dangling-objective'`) so
   `RULE-JUR-02` never opens a boundary decision for a dead goal. Listening to
   `goal.updated` on root writes, `RULE-JUR-01` supersedes any previously
   `frozen` finding whose goal was dropped or removed.
4. **Span-scoped remediation (`jurAnchorWork`, gated by `record-jurisdiction`).**
   Frontline leads (rank 1) and mid-managers (rank 2) receive a span-scoped Map
   filter (`Touching my span`) and a **Pointer hygiene** panel
   (`#/jurisdiction?panel=hygiene`) listing only open unanchored/dangling work
   records inside their `canSee === 'full'` boundary. `jurAnchorWork` validates
   span ownership and active goal visibility, writes the `impacts-goal` graph
   edge (plus direct pointer fields where applicable) and emits the canonical
   `${entityType}.updated` event so `RULE-JUR-01` freezes and rolls up any newly
   formed cross-branch cluster in the same atomic transaction.
5. **Identity-free vertical roll-up.** Above rank 2 (`withheld === true`),
   individual item queues, objective keys and titles are stripped; Directors,
   VPs and the CEO read suppression-safe pointer-hygiene counts by source and
   altitude (`jurSpanRollUp`, `jurisdictionRead`, `jurBrief` and CSV scope #103).

## Honest limits

- `jurAnchorWork` binds one work record to one active goal chosen by a human in
  the owning span; it never infers semantic similarity from titles or notes.
- Seats remain local workflow declarations, not server-enforced authentication.
- Small-cell suppression (`jurCellFloor`) is a printed refusal, not differential
  privacy.
