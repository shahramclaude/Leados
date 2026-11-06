# ADR-0112 — The Boundary-redraw rehearsal: a dry run of an organisational boundary change

**Status:** Accepted · Session 152 · Schema v111 (unchanged — no writes, no new collections)
**Scope:** `app/core/domain/redrawRehearsal.js` (new), `app/views/jurisdiction.js`, `app/core/domain/jurisdictionRegistry.js` (one `JUR_PANELS` row), `tests/app/redraw-rehearsal.test.mjs` (new)
**Altitudes:** director (primary) · VP / executive (primary) · CEO / C-suite (primary) · frontline & mid-manager (excluded by design, with a printed explanation)

## Context

ADR-0109 prices the `redraw` governance route for a cross-branch objective and
ADR-0110 fixed the spine that carries it. The compiler answers "is a boundary
redraw the cheapest route for THIS objective?". The question a director,
executive or chief actually faces next — before accepting any re-organisation,
and before asking their reports to absorb one — is different and had no home in
the product:

> "If I re-parent THIS branch head under THAT span, what does the workspace
> look like afterwards? Which shared-objective gaps CLOSE, which new ones
> OPEN, which merely MOVE — and which persisted `rolls-up-to` edges and
> unsettled governed decisions would be left naming the wrong seat?"

No module dry-ran an org-design change. The honest options for a leader were to
run the reorganisation and see, or to treat the compiler's `redraw` price as a
sufficient answer. Neither is acceptable at rank 3+; the first is not
reversible and the second conflates a per-objective cost comparison with a
transaction over the reporting tree.

## Decision

1. **A pure, ephemeral dry run (`rehearseBoundaryRedraw`).** The engine takes
   the live in-memory state, clones the roster applying at most three
   requested moves, re-runs the REAL `harvestObjectives → priceCluster`
   pipeline on the clone, and diffs the two books. It never mutates `state`,
   never writes a record, never emits an event, never calls the store — the
   only side effect of believing a rehearsal is the separate, governed human
   and `RULE-JUR` transaction that would follow an accepted change. Purity is
   asserted by deep-equal in the suite.
2. **Every refusal is printed.** Unknown person/manager, `self-move`,
   `noop-move`, `cycle-move` (a person cannot be re-parented under their own
   descendant), `duplicate-move`, `too-many-moves` (bounded at 3 — a rehearsal,
   not a re-org programme) and `leader-move` are named verbatim. A partially
   valid rehearsal runs on the surviving moves and prints what it refused.
3. **The diff is named, not summarised away.** Clusters are classified
   `collapsed` (cross-branch → single-branch), `created` (single-branch →
   cross-branch), `changed` (LCA/coalition/rungs/route/verdict/units moved) or
   counted unchanged. Before/after ledgers print cross-branch count, priced,
   refused, handoff pairs, escalation rungs and predicted-route coordination
   units, plus a break-even in declared units (one-off `jurRedrawUnits` per
   move ÷ units saved per period) — printed as arithmetic on DECLARED Coase /
   Williamson units, never as money or measured value.
4. **Persisted roll-ups are recomputed, not rewritten.** For every `frozen`
   finding and every `frozen` span reading, the rehearsal derives the audience
   the spine WOULD emit on the hypothetical tree (ancestors of every span,
   plus ancestors of the hypothetical LCA for findings, mirroring
   RULE-JUR-01/02/04) and prints `rolls-up-to` edges that would be withdrawn
   and added, edge by edge. The persisted graph is untouched.
5. **Unsettled governed decisions that would go stale are named (premortem,
   Klein 1998).** A decision opened by RULE-JUR-02 whose cluster collapses is
   `gap-closed` — the question would cease to exist. One whose surviving
   cluster's lowest common ancestor moves rung is `lca-moved` — the decision
   would name the wrong seat (Jensen & Meckling 1976 residual control rights).
   Settled decisions can never go stale. Stale means "re-frame or withdraw
   FIRST", never an automatic action.
6. **Declared, non-full-access seats stay inside their own span; the operator
   view is unenforced.** A declared rank 3–5 seat without full access
   rehearses only moves whose person and destination are inside its own
   `subtreeIds` (a director may re-org their unit; cross-boundary moves are
   the ancestor's call), with objective pointers printed as ordinals and any
   roll-up target outside the span masked as "A span above your boundary".
   Declared rank 1–2 seats see a printed explanation instead of the form.
   A read-only/unresolved seat is refused like any other rank < 3 seat.
7. **No schema bump, no new rule, no new collection — by design.** The
   feature is a read model over `buildChain`, the Jurisdiction Compiler and
   the typed graph. It plugs into the same work harvest and the same roll-up
   semantics rather than existing beside them.

## Consequences

- Directors/VPs/CEO gain the missing pre-acceptance instrument for the
  `redraw` governance route, with the invariants (acyclic tree, declared
  units, no auto-execution) printed on the same screen.
- `jurBrief` adjacency keeps the board narrative coherent: compilation prices,
  rehearsal simulates, acceptance stays human.
- The roll-up diff is only as fresh as the frozen findings/readings; a
  workspace that never ran `jur.scan` sees no edge moves (printed, empty
  state, never invented).

## Honest limits

- Local seats remain workflow declarations, not authentication.
- The rehearsal prices STRUCTURE; it says nothing about competence, culture,
  budget legality, or whether the people involved want the change.
- Break-even is model arithmetic on declared conventions; a negative saving is
  printed as such and is a finding, not a verdict on anyone.
- Real-browser walkthrough remains [UNVERIFIED] (automated jsdom + axe-core).

## Frameworks

Coase (1937) / Williamson (1975) governance choice · Riker (1962) size
principle · Ashby (1956) requisite variety · Jensen & Meckling (1976) residual
control rights · Klein (1998) premortem · Jaques (1956) time-span of discretion
(altitude gating) · Wilson (1927) / Luce (1959) via the reused compiler
pipeline.
