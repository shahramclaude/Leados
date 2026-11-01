# ADR-0065 — Response Studio: rehearse an incident across the real rule graph before committing it

- **Status:** Accepted
- **Date:** 2026-11-01
- **Session:** 103
- **Schema:** 72 → 73
- **Route:** `#/responses`
- **Rules:** `RULE-RSP-01..04`
- **Signals:** `RSP-01..03`
- **CSV scope:** #63 `response-studio`

## Context

LeadOS could already capture an unstructured intake, extract a structured case, simulate a
case in a disposable store, and create cases/delegations/decisions through a generalized
post-commit rule spine. Those were three separate promises. A first-time manager still had
to decide *contain, verify, or wait* by intuition, and the product could not show what each
choice would do to the actual workspace before the choice became a fact.

The competitive baseline is records and cycles (HRMS performance appraisals) or server-side
agent/orchestration platforms (Camunda, Microsoft Agent Framework). The useful missing
unit is a **decision-grade response rehearsal** over the leader's own rules, with an
immutable adoption receipt and explicit economic assumptions.

## Decision

1. **One rehearsal, three governed policies.** `app/services/responseRehearsal.js` replays
   the existing `addCase` and intake-routing commands in three fresh disposable stores:
   `contain` (act today), `verify` (cheap evidence first, review date), and `wait` (declared
   delay). It returns operational diffs, typed relationship previews, rule failure counts,
   workspace warnings and economics. It never writes to live state and strips
   `events/conflicts/pulses/candidates/intakeDrafts/responsePlans` from the diff so the
   preview cannot become a second ledger.
2. **Economics are declared, not inferred.** PERT three-point weekly delay cost
   `(low + 4·mode + high)/6`, carry cost over a declared delay window, and Savage minimax
   regret across the three scenario costs. A verification break-even share is shown as a
   threshold, not a probability. The UI refuses blank or inverted assumptions.
3. **Adoption is one transaction.** `commitResponsePlan` rechecks the workspace revision,
   the source-intake fingerprint, the draft-input fingerprint, and every branch failure
   count. It then adds the case, marks the intake routed, and freezes the receipt in one
   `store.update`. A stale rehearsal, a changed draft, or any failed branch refuses the
   adoption. Ordinary intake confirmation was also made atomic in the same transaction.
4. **Follow-up is a generalized rule, not UI glue.** `RULE-RSP-01..04` live on the shared
   post-commit spine: typed `rehearses`/`responds-to` edges, one owned follow-up delegation
   or DACI decision fallback, and orphan-edge repair. `responseAutoPropagate` pauses only
   the follow-up write; provenance and the review date still land.
5. **Off-main-thread execution.** The hosted app uses a module worker. The standalone
   reuses its already-inlined ES bundle as a Blob worker, so there is no second bundle,
   no network dependency and no synchronous main-thread fallback. A 45-second timeout
   fails closed.
6. **Privacy-safe telemetry.** CSV #63 and the identity-free brief export counts,
   strategies, statuses, failure totals and rule ids only — no person, case, draft, title,
   note or free-text field.

## Consequences

- A novice manager gets a before/after comparison instead of a form; the same rule graph
  that runs after commit is the one rehearsed before commit.
- The product still does not claim causal identification. Software replay is a bounded
  what-if over declared rules, not an estimate of an intervention effect in the world.
- Committed receipts are immutable history. Archiving is limited to uncommitted plans.
- The worker path is verified in Node `vm` and JSDOM; real-browser and assistive-technology
  behaviour remain `[UNVERIFIED]` in this environment.
