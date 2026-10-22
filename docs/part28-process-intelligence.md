# Part 28 — Process Intelligence: Discovery, Design, and Self-Review

Repository: https://github.com/shahramclaude/Leados
Depends on: Part 01 (event store), Part 06 (work-system model / twin), Part 10 (capability registry)

This document carries the Phase 0 findings table, the Phase 5 adversarial
self-review, and surface-level notes that are too long for inline code
comments. See `AI-SESSION-LOG.md` for the session summary and the chat
delivery for the full manifest + verification log.

## Phase 0 — Discover: what's capturable vs. what's missing

| Capability needed | Available in this repo snapshot? | What Part 28 did about it |
|---|---|---|
| Case identifiers (caseId / correlationId) | **No event store existed.** Parts 01/06/09/10 are not present in this checkout. | Added `process_events` with both `caseId` and `correlationId` columns so case reconstruction can detect when they diverge (shared-correlation-id signal). |
| Activity sequences with timestamps | Same — none existed. | `process_events.activity` + `occurredAt` + `durationMs` (active work vs. instantaneous markers). |
| Resource/actor attribution | No roster table existed. | Added a minimal `process_roster` table (resourceId, team) — aggregate-safe, used only for bus-factor k-anonymity, not exposed as a general directory. |
| Declared/designed process (for true conformance) | No definition store existed. | Added `process_definitions` (ordered steps, mandatory flags, allowed-next sets) — optional; conformance degrades gracefully to "mined only" when absent. |
| Rule-based / error-rate instrumentation per step | Not present anywhere — this is the input automation scoring most needs and least has by default. | `attributes.ruleBased` / `attributes.errorFlag` are read when present; otherwise a heuristic default is used and the score is marked `confidence: "estimated"` with a surfaced note. **This is the single biggest instrumentation gap** — see Phase 5 Q3. |
| SLA deadlines per case | Not present. | Read from `attributes.slaDeadline` on the terminal event if present; `slaInstrumented: false` is reported explicitly when it's missing, instead of a fabricated 100%/0% figure. |
| Twin / capacity simulator (Part 06) | Not present. | A minimal, clearly-labelled stand-in in `automationScoring.ts::projectCapacityImpact` projects saved hours back into the *same* step's own throughput only — not a full cross-process capacity model. |
| Capability registry (Part 10) | Not present. | `automation_proposals` table + "propose automation" API endpoint stands in as the hand-off artifact. |

**What we'd need to instrument for a materially better mining signal:**
1. A persistent, append-only event table with globally unique, monotonic
   event ids (Part 01) instead of Part 28's own table — so case reconstruction
   doesn't have to guess case boundaries from a flat `caseId` column.
2. Explicit `ruleBased` / `errorFlag` tagging at the point each activity is
   logged (not inferred after the fact) — this is the automation score's
   weakest link today.
3. A declared process definition per process type (Part 06/ops) so
   conformance checking can report genuine rule violations instead of only
   statistical rarity for the majority of real processes that don't have one
   yet.
4. Resource/team roster join (Part 09) with enough headcount per step to make
   bus-factor analysis useful without redaction kicking in constantly.

## Phase 5 — Attack (adversarial self-review)

**1. Which real process will defeat case reconstruction, and what's the
honest degradation?**

Any process where a single `caseId` is reused across **overlapping**
sub-processes (e.g., a shared household/account id spanning two concurrent
service requests) breaks the simple "group by caseId" assumption.
`reconstructCases` detects this two ways: (a) a `correlationId` that varies
within the same `caseId` group (`shared-correlation-id-multiple-cases`), and
(b) a new start-activity appearing before the previous segment reached an
end-activity (`overlapping-start-before-prior-end`). In both cases we **do
not silently merge or silently split with confidence** — we split
best-effort (new segment per detected start) and mark every resulting
instance `ambiguous: true`, surfaced as a count on the Overview page and in
`ReconstructionReport`. The honest degradation is: metrics computed over
ambiguous cases (cycle time, queueing contribution) are directionally usable
but the case *boundaries themselves* are a heuristic, not a certainty, for
exactly those cases — this is why the count is surfaced rather than hidden
inside an aggregate.

**2. How could conformance checking punish healthy exceptions
(over-standardization risk)?**

This is why conformance is **split into two modes** instead of one:
- Against the **mined** model, every deviation is labelled `severity:
  "statistical"` and a case is never marked non-conformant from mined-model
  deviations alone — a rare path (escalation, VIP fast-track, manual
  override) is reported as unusual, not as wrong.
- Against a **declared** model, only explicit rule violations (skip a
  mandatory step, take an undeclared transition, go out of declared order)
  count toward `conformant: false`. We also special-cased immediate
  self-repeats (A → A, e.g. a redo/retry of the same step): these are
  reported as `"rework"` (always statistical) rather than also being flagged
  as an "undeclared transition" rule violation, specifically because
  punishing a retry as a hard rule violation was the clearest
  over-standardization trap we found while building the seeded-deviation
  test corpus (see `scripts/verify.ts` Gate 2). The residual risk: if an
  organization's *declared* process definition itself is too rigid (doesn't
  declare legitimate escalation paths), declared-mode conformance will still
  misreport real, healthy handling as a violation — that's a data-quality
  problem in the declared definition, not something the engine can detect on
  its own, and the UI's honesty note says so ("rule-severity deviations here
  are genuine violations of the intended process" — genuine relative to
  *this* definition, not relative to ground truth about what's actually
  healthy).

**3. Where does the automation score over-promise, and how is it surfaced?**

`ruleBasedFraction` is the weakest input by far — it is frequently not
instrumented at all, and even when it is, "an event was tagged rule-based"
is a proxy for "a human judged this step could plausibly follow a rule,"
not a validated automation feasibility assessment. We surface this three
ways: (a) `Explain<T>.confidence` is set to `"estimated"` the moment either
`ruleBasedFraction` or `errorRate` falls back to a heuristic default: (b) an
explicit note is attached — *"this is the single most over-promising input
in this score and should be validated with SMEs before funding automation"*;
(c) the Automation ROI UI renders an amber "estimated inputs — directional
only" badge rather than styling every score identically. The ROI projection
itself is also explicitly capped to a single step's own capacity (no
downstream twin), so it cannot claim organization-wide capacity gains it
hasn't modeled.

**4. What did we deliberately NOT do?**

- No full inductive-miner / Petri-net discovery with places, silent
  transitions, or long-distance dependency resolution — the discovery engine
  is a documented Heuristics-Miner-lite directly-follows-graph filter. Loops,
  parallel (AND-split) branches, and non-local dependencies are not modeled
  as first-class constructs; they show up as additional directly-follows
  edges and possibly extra "unseen_transition" statistical deviations rather
  than being recognized as valid parallel paths.
- No true full-history streaming recompute. Only the discovered-model DFG
  edge counts/gap reservoirs support an incremental merge
  (`mergeDiscoveredModels`); conformance, bottlenecks, queueing, bus-factor,
  automation scoring, and the control chart are recomputed in batch from
  whatever is currently in `process_events` each time they're requested.
  This is correct but not yet incremental — acceptable at today's volumes
  (100k events mined in ~0.25s, see Gate 5) but would need real streaming
  aggregates at much larger scale.
- No cross-process twin (Part 06) simulating how freed capacity from one
  automated step actually gets reallocated elsewhere in the business — the
  ROI number is a single-step capacity estimate, explicitly labelled as such.
- No write path into a real Part 10 capability registry — "propose
  automation" creates a draft row in `automation_proposals` and stops there.
