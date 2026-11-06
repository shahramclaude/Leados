# ADR-0106: Evidence-based execution closure and role-first workspace navigation

- **Status:** Accepted
- **Date:** 2026-11-06
- **Session:** 146
- **Schema:** v108 (additive 107 → 108)
- **Surfaces:** `#/mission?panel=execution`, `#/bundles?bundle=<id>`, sidebar
- **Rule:** `RULE-EXE-01` (86th rule / 86th propagation contract)

## Context

Session 145 made adoption atomic: one reviewed note becomes a case, coordinated
actions and typed hierarchy provenance. It did not close the leadership loop.
An adopted bundle could sit `committed` forever while its decision was reviewed,
its delegation completed and its source case resolved; the review checkpoint
created by `RULE-BND-02` stayed open; Mission Control had no execution roll-up;
and the sidebar still led with a 150-link catalogue rather than the acting
altitude's duties.

The gap was not another workflow engine. It was a **terminal-evidence contract**
between the commands already adopted and the records those commands produce.

## Decision

### 1. A per-kind evidence registry, not a status field

`executionRegistry.js` registers one adapter per `BUNDLE_KINDS` entry and throws
if coverage drifts. Each adapter inspects the live source record and returns
`pending | fulfilled | stopped | blocked | missing` plus a dated evidence
pointer. Terminal semantics are deliberately strict:

- decision: chosen + reviewed + outcome;
- delegation: done + completedOn + completionNote (returned = blocked);
- premise: conclusive outcome after adoption (retired = stopped);
- budget: spent + finite actualAmount on `spentOn` (released = stopped);
- comms: sent + sentOn (dismissed = stopped);
- coaching: a held post-adoption 1:1 whose `resolvedTopics` contains the exact
  prompt **and** the prompt is no longer pending (deleted-without-proof = blocked).

Proof dates must be on/after the adoption day. Cancellation, deletion and
missing records are never delivery.

### 2. Closure is derived, then reconciled on the shared spine

`bundleExecution()` is pure. `RULE-EXE-01` subscribes through the registry's
compiled event list, re-derives every committed bundle, writes `rests-on` proof
pointers and one `rolls-up-to` edge per leadership ancestor (cap 16) through the
existing `ensureEntityLink`, and persists a small validated marker
(`bundle.execution`) plus a bounded history slice. It closes **only** the
engine-authored `[BND-02:<id>]` review checkpoint, with a system note, when the
human-resolved source case and every action agree. It never chooses a decision,
spends money, sends a message, rates a person or invents an outcome.

The rule re-derives after closing the checkpoint so the next scan is a true
no-op. Derived events use `ctx.logEvent` (audit) rather than `ctx.emitEvent`
(no rule cascade). `settings.executionAutoReconcile=false` pauses automatic
passes; explicit `execution.scan` / `bundle.scan` still reconcile.

### 3. Ownership is the accountable leader, not the people-LCA

`executionOwnerNodeId(source, built)` prefers a valid `source.ownerId` leadership
node. The generic `responsibleNodeId(chain, recordPeople(source))` treats a
leader named as owner as a subject and escalates one rung (lead + IC → manager),
which hid the lead's own loops. Cross-team cases still fall back to the LCA.

### 4. Vertical roll-up uses the existing disclosure ladder

Mission returns `execution={detail,summary,hierarchy,loops,method}`. Frontline
and manager (the existing individual-detail ceiling, rank ≤ 2) see proof rows
and receipts. Director+ receive suppression-safe intervals and drill links, not
titles or proof ids. `missionExecutionReceipt` is rank ≤ 2, acting-seat and
span-gated. Sideways drill-down is refused by `buildMission`.

### 5. Role-first navigation, same router gate

`workspace-nav.js` pins Mission/capture/execution/altitude, then shows declared
seat duties (or a core workflow for the operator), then collapsed catalogue
sections and a search over **permitted** tools only. `allowed` is the same
`workspaceRouteVerdict` the render gate uses. Native `<details>` and a labelled
search input keep it keyboard-native; disclosure state survives re-render.

### 6. Schema v108 is additive and fail-closed

Migration adds `oneOnOnes.resolvedTopics: []` and `actionBundles.execution: null`;
historical meetings are **not** given invented coaching proof. `cleanExecution`
drops an unverifiable marker (warning) and live state is re-derived. Default
`executionAutoReconcile=true`.

## Consequences

- Zero re-entry: completing/reviewing/resolving existing records closes the loop.
- Append-only traceability: history + typed links + audit events; no private note
  is copied into the audit log.
- A forged/stale marker cannot become truth; readers re-derive from sources.
- Rule count 85 → 86; standalone rebuilt at v108.

## Honest limits

- Reconciliation is software evidence, **not** a causal forecast of benefit.
- Local seats are workflow declarations, not authentication.
- Real-browser assistive-technology walkthrough is **[UNVERIFIED]**; jsdom +
  axe-core is the accessibility evidence.
- Vendor capabilities cited in RESEARCH.md were not independently audited.
