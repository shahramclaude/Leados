# ADR-0081: The Altitude Router — natural language in, module × altitude out

**Status:** Accepted — Session 121, 2026-11-03, Schema v88 (additive `87 → 88`), `#/routing`, CSV scope #77.
**Engine:** `altitude-router-2026.11-v1`. **Rules:** `RULE-AR-01`, `RULE-AR-02`, `RULE-AR-03`.

## Context

The audit found two strong, separate halves and one missing joint.

- `app/core/domain/intake.js` already classifies a natural-language note into **modules** with weighted evidence, NegEx-style negation, softmax-shrunk confidence bands, completeness/ambiguity/stakes checks, evidence spans and a hard conflict privacy wall. It is pure and on-device. It knows **nothing** about altitude: no `managerId`, no `buildChain`, no lowest common ancestor, no roll-up. Its only assignment concept is `ownerId`.
- `app/core/domain/chain.js`, `seat.js` and `seatRules.js` already model a real reporting tree with five **altitudes** defined by Jaques' time span of discretion (7 / 30 / 90 / 180 / 365 days), LCA-derived responsibility, per-altitude escalation clocks and typed `rolls-up-to` edges on the shared post-commit spine.
- `app/core/domain/postCommit.js` already runs 61 declared, contracted rules with savepoints, receipts and derived-event guards; `app/actions.js` already adopts an intake draft into a case **atomically**.

So a leader could type a note and get a module, and could separately look at a hierarchy — but the note never chose an altitude, never resolved onto a real seat, and never produced a vertical roll-up. That is precisely the "any case/issue/decision/event in one module must auto-link/update all relevant modules and propagate up/down hierarchy" requirement left open. Mission Control (ADR-0080) made the *supported* declared-seat surface honest, but it still required the human to know which loop to open.

## Decision

Build a **pure joint classifier** and put its one human-reviewed adoption on the **existing** event spine. No second workflow engine, no per-module glue, no reimplementation of intake or the chain.

### 1. Joint classification (`altitudeRouter.js`)

`analyzeRouting(note, state)` returns one immutable-ish report:

- **Modules** — the existing `analyzeIntakeText` / `toCaseInput` results are reused verbatim, not reimplemented. `moduleRoutes` carries module id, label, confidence band, evidence spans and the confidence gate.
- **Altitude** — a second deterministic lexicon scores five horizon bands (day/week, month, quarter, half-year, year-and-beyond) with a three-token negation window, softmax temperature scaling with uniform-prior shrinkage and a printed confidence band. Below `routingEvidenceFloor` (default 2.5) the report **refuses** rather than inventing an altitude.
- **Seat** — `resolveSeatPath` reads the real `person.managerId` tree via `buildSeats` / `buildChain`. Named people are resolved to `responsibleNodeId` (one person → their manager; several → the LCA of their managers); nobody → the declared operating seat, or the enterprise root. `effectiveRank = max(inferredRank, lcaRank, stakesFloor)`, and `escalationTarget` walks up to it. Safety/legal stakes and long-lived categories (finance → 4, change/stakeholder/attrition → 3) print their reason. A `quarter` cue therefore *lifts* ownership above the LCA while the two named reports still share the same LCA — no silent reassignment.
- **Ladder** — one row per real ancestor from the owning seat to the enterprise root, with a **disclosure form**: `names` at ranks 1–2, `unit` at rank 3, `aggregate` at ranks 4–5. This is one parameterised read model rendered five different ways, not five dashboards.
- **Fingerprint** — a two-lane FNV-1a hash over the note, classification, altitude and **seat path + engine version**, deliberately excluding the calendar day. A reorganisation changes the fingerprint, so a saved plan goes stale with a printed reason instead of silently writing to the old tree.

### 2. One atomic adoption (`app/actions.js`, `altitudeRouterActions.js`)

`routingSaveDraft(note)` writes **only** a `draft`/`analyzed` plan — no case, no links. `routingConfirm(planId, { confirmedAltitudeKey })` is the single human-reviewed commit. It re-derives and compares the fingerprint, refuses a `privacyBlocked` conflict note, refuses a plan outside the acting seat's subtree, then calls the **existing** `addCase` with `_routingPlan` in the **same mutator** as the `case.created` event. The plan's status, confirmed case id, confirmed altitude and review date flip in that same write: there is no window where a case exists without a confirmed plan.

Because `store.update` runs `runPostCommitRules` before persistence, the `case.created` event fires **both**:

- the pre-existing cross-module rules (`RULE-DEC-01` decision, `RULE-COACH-01` 1:1 talking point, `RULE-CFP-01` counterfactual, `RULE-SUC-01` succession), and
- `RULE-AR-01`, which writes a `routes-through` edge (case → routing plan), a `discloses-to` edge to the owning seat and one `rolls-up-to` edge to **every** leadership ancestor, with `disclosureForm` on each edge and **no note text in any edge summary**.

One transaction, one revision, zero re-entry. A frontline handover note therefore reaches manager, director and VP in the same write that produces its decision and coaching prompt.

### 3. Self-grading, not a confidence claim (`altitudeRouterRules.js`)

A frozen plan is graded **once**, later, against the altitude a human says the work actually belonged to. `routingCalibration` prints:

- Wilson 95% interval per altitude cell, **refused** below `routingCalibrationFloorN` (5);
- **strictly-prior** sequential probability forecasts and Brier skill against a pooled base rate (a prediction that uses its own outcome is not a prediction);
- **mean rank error**, because routing a 7-day item to the CEO is worse than routing it to the director — accuracy alone hides the cost;
- under/over-routing counts and human-override lift;
- an aggregate-only, identity-free brief and CSV.

`RULE-AR-02` opens exactly **one** governed DACI decision per breaching cell per ISO week, writes `grades-routing` and `rolls-up-to` edges to the span above, and is marker-idempotent. `RULE-AR-03` writes one advisory maturity marker when a cell first reaches the evidence floor. Both are pausable via `routingAutoPropagate`; an **explicit** `routingScan()` always runs. No rule edits a grade, a plan, a case, a person, a setting or anyone's seat.

### 4. Permissions and privacy

`guardApiCall` gains `route-intake`; `SAFE_READS` gets the routing reads; `workspaceRouteVerdict` allows the scoped `routing` route; `ACTION_RIGHTS['route-intake']` is rank 1–5; the two new collections are `unit` class in `RECORD_POLICIES`. A declared seat cannot confirm a plan owned by a peer span. The conflict privacy wall from `intake.js` is carried through: a conflict/harassment note is never auto-adopted. The brief and CSV contain **no names, ids, note text or evidence spans** — only counts, rates and refusals.

The local seat remains an auditable **declaration**, not authentication. There is one browser, one local store, no server. This ADR does not claim production RBAC, differential privacy, or survey anonymity.

## Consequences

- Schema v88 is additive: two collections (`altitudeRoutingPlans`, `altitudeRoutingMarkers`), five settings, `MIGRATIONS[87]`, one graph node (`routingplan`) and three relations (`routes-through`, `discloses-to`, `grades-routing`) in `cases.js`. Fail-closed normalizers drop malformed plans and out-of-range settings to defaults with a warning.
- 61 rules / 61 auditable contracts; `altitudeRouterRule` sits immediately before `attentionMarketRule`, preserving the trailing `successionRule`, `seatRule` invariants.
- CSV registry grows 76 → 77 with the aggregate-only `altitude-router` scope.
- Five nav panels (`plan`, `ladder`, `ledger`, `calibration`, `brief`), aliases, badge and title.
- `tests/app/altitude-router.test.mjs` proves the joint report, the LCA, the five-altitude ladder, the single atomic cross-module × cross-altitude transaction, idempotent rescan, staleness refusal, privacy wall, out-of-sample calibration, governed floor breach, seat boundary, aggregate-only exports, zero-regression inertness and axe-clean rendering of all five panels.

## Rejected

- A second NLP engine or a second rule spine.
- Auto-adopting a case with no human confirmation (the confidence gate exists to be used).
- Inferring a person's altitude from their mood, sentiment, message or keystroke data.
- A generic role-themed dashboard duplicated five times.
- Calling a small-cell suppression "anonymous" or "differentially private".
- Inventing a director/VP/CEO when the roster has no such rung.

## Known gaps

Authenticated identity and tenant boundaries; reviewed adapters for legacy raw-data modules; temporal disclosure / repeated-release differencing tests; outcome-graded recommendations rather than confidence bands. These are unchanged from ADR-0080 and remain explicitly open.
