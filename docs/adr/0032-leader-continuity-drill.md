# ADR-0032: Leader Continuity Drill — simulating the manager's own absence

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0012](./0012-operational-resilience-continuity-terminal.md), [ADR-0018](./0018-cognitive-load-attention-governor.md), [ADR-0026](./0026-propagation-ledger.md), [ADR-0030](./0030-coupled-continuity-capacity-simulation.md)

## Context

LeadOS models the resilience of services, vendors, systems and processes (ADR-0012) and the
load of the people who own them (ADR-0018), and it simulates portfolio delivery under declared
shocks (ADR-0030). It had no model of the leader's own seat. Every other record can name a
deputy; the manager cannot. A first-time leader who takes a week off, a hospital stay or a
long-planned holiday leaves a queue of decisions, approvals, 1:1s, stakeholder contacts,
review dates and risk oversight that nobody was assigned.

The competing products reviewed for this session (Lattice, 15Five, and the Gartner
decision-intelligence framing already recorded in `RESEARCH.md`) sell planning, review writing
and coaching prompts. None of the vendor material describes simulating the manager's own
absence against the dated obligations already in the record, pricing the stall, and then
scoring the prediction against a real absence. That absence of evidence is not proof of
absence of capability and is recorded as **[UNVERIFIED]**.

The constraint that shaped the design: LeadOS must not invent a calendar, read mail, guess
availability or score a person's loyalty. It also must not pretend that every manager duty can
be delegated — a performance conversation, a conflict mediation and an irreversible big bet are
constitutionally the leader's.

## Decision

1. **Derive demand, never infer it.** `leaderDemandInventory(state, {now, horizonDays})` reads
   dated obligations already on the record — open decisions awaiting a call or a review,
   operational-case review dates, 1:1s past cadence, active delegations due inside the window,
   stakeholder contacts due inside the window, goal check-ins overdue — and emits one item per
   obligation with its source type, source id, due date, stall class and a printed criticality
   basis. Anything undated or archived is excluded and counted as excluded, not zero-filled.
2. **Three delegability states, not two.** `delegable`, `shared` and `held`. `held` is the
   honest "do not put this on paper" band: a management conversation, or a call that is both
   irreversible and above the workspace's big-bet threshold. Held items are never covered by
   the plan; they appear as uncovered with the reason, and they raise a structural signal.
3. **Explicit, componentised deputy fit.** Fit is built only from recorded evidence: completed
   delegations (authority-weighted), readiness-seat ratings, role level, a recorded relationship
   with the stakeholder in question, and a penalty for the deputy's own open commitments. It is
   a cover-planning input and is labelled as such; it is never written to a person record, never
   ranked as a performance score and never exported by name.
4. **Two distributions, one arithmetic.** The stall count is computed exactly by convolving the
   independent per-item Bernoulli stall probabilities (Poisson–binomial), which gives the mean,
   P50/P80/P90 and `pNone` without sampling error. Currency exposure is computed by a seeded
   Monte Carlo over the same probabilities (expected value, P90 and Rockafellar–Uryasev coherent
   expected shortfall at 90%). Currencies are reported per currency and never summed. Only items
   with a recorded amount contribute; unpriced critical items are counted, not valued.
5. **Minimum cover is an optimisation, not a list.** Candidate actions are (deputy × stall class)
   bundles and (deputy × item) fallbacks with an explicit setup-minutes cost. The planner runs an
   exact branch-and-bound set cover under a node cap when the instance is small, reports the
   node count and method, and degrades to a disclosed greedy plan with its bound when it is not.
   Coverage is measured over **every** critical item's criticality weight, so held or
   uncoverable work can never be counted as covered.
6. **Commissioning is transactional and idempotent by window.** `RULE-LCS-01` recomputes the plan
   from the live draft, refuses a stale `planKey`, `windowStart` or `expectedRevision`, and then
   creates one four-option DACI decision, up to four owner-assigned delegations with explicit
   authority and a due date before the absence, typed links to every covered source record, and
   at most one blameless 1:1 prompt per deputy. Duplicate commissioning is keyed to the window,
   not to the plan content, because the first commission changes the plan.
7. **The prediction is frozen, then scored.** `startContinuityDrill` copies the per-item stall
   probabilities against a dated window and never recomputes them. `closeContinuityDrill` records
   only observed keys that were actually predicted, plus a bounded count of unpredicted stalls.
   Scoring is Brier, base rate, Brier skill score, precision, recall, observed coverage and a
   Wilson interval, withheld to counts only below five scored predictions and three closed
   drills. Scores are re-derived on read and never trusted from storage.
8. **Schema v45 is additive.** One new collection (`continuityDrills`), three settings
   (`continuityHorizonDays`, `continuityMinFitPct`, `continuityAutoPropagate`) with clamps, and a
   `44 → 45` migration that starts an empty drill ledger. A pre-v45 workspace has no drill
   history; inventing one would fabricate both the prediction and the observation.

## Alternatives rejected

- A calendar integration or "presence" inference: unavailable, privacy-hostile and unnecessary.
- Treating every obligation as coverable: it produces a plan that looks complete and fails in
  the one week it matters.
- A single aggregate "resilience score": unpriceable, and it would hide which specific item is
  exposed.
- An LLM-written handover narrative: untestable, unversioned and prone to inventing commitments.
- Storing scores in the drill record: a replayed or edited score is not a measurement.
- Seeding demo drills to make the ledger look populated: the calibration would be fiction.

## Consequences and limits

- The stall model assumes conditional independence between items. Shared causes (the same deputy
  going on leave, a single dependency failing) are not modelled; ADR-0030's coupled simulation is
  the place for that, not here.
- Fit and criticality are transparent conventions, not validated psychometrics. Their components
  are printed so a reader can disagree with the arithmetic.
- The exact set-cover branch and bound is capped; above the cap the plan is greedy and labelled
  as such, with its bound.
- Drill scoring measures the workspace's own prediction, not the quality of the handover, and not
  whether the leader's absence caused the stalls observed.
- Revisit when: a drill's realized coverage of the recommended plan diverges from its claimed
  probability on three or more closed drills, or when a workspace needs correlated absences
  (two deputies away in the same week).
