# ADR-0034: Hand-over execution verification, causal mechanism attribution and cross-team vendor common-mode contagion

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0032](./0032-leader-continuity-drill.md), [ADR-0033](./0033-correlated-absence-and-briefing-readiness.md), [ADR-0028](./0028-after-action-review-learning-ledger.md), [ADR-0012](./0012-operational-resilience-continuity-terminal.md), [ADR-0008](./0008-post-commit-rules-hook.md)

## Context

ADR-0032 and ADR-0033 shipped the Leader Continuity Drill (`#/handover`), correlated single-team absence stress, eligible-pool concentration and pre-window briefing readiness (`handoverReadiness`). Three explicit boundaries remained open:

1. **A cover delegation marked `done` was indistinguishable from an executed hand-over.** `handoverReadiness` counted whether a deputy logged a check-in or closed the cover delegation, and counted `completed` and `returned` cover delegations for display — yet nothing verified whether any of the *underlying source obligations* linked to that cover delegation (`decision`, `case`, `delegation`, `stakeholder`, `goal`, `person`) actually moved on or after `windowStart`, and nothing happened when a deputy returned a cover delegation (`status: 'returned'`).
2. **Closed drills confounded forecast error with dropped execution.** `scoreDrillRecord` and `RULE-LCS-02` evaluated every stalled prediction against the frozen stall probability alone. If a commissioned hand-over was never approved, never briefed, returned by the deputy, or closed on paper without advancing the covered source record, the resulting stall depressed the Brier skill score and triggered `RULE-LCS-02` ("the stall model is worse than a constant base rate") — blaming the probability model for a dropped hand-over baton.
3. **The correlated stress model had a single-shock, team-boundary ceiling.** `simulateCorrelatedAbsence` explicitly noted in its rendered assumptions: *"The shared cause is one team per window. Two simultaneous independent shocks, or a vendor failing under two teams at once, are still out of scope."* Meanwhile, `state.dependencies` (Schema v29, ADR-0012) already stores active service and vendor dependencies with `ttsDays`, `ttrDays`, `annualFailureProb`, `substitutability`, `upstreamIds` and `stewards` across multiple teams.

## Decision

1. **Three-stage hand-over implementation grading (`gradeCoveredSourceProgress`, `handoverImplementation`).**
   - Every covered source obligation linked from a commissioned cover delegation (`state.links` with `sourceType: 'delegation'`) is graded against its own dated lifecycle transitions on or after `windowStart`:
     - `decision`: `chosen` with `decidedOn >= windowStart`, or `reviewedOn >= windowStart`;
     - `case`: `resolvedOn >= windowStart`, `actuals.settledOn >= windowStart`, or `reviewOn > windowEnd`;
     - `delegation`: `status === 'done'` with `completedOn >= windowStart`, or a non-blocked check-in with `date >= windowStart`;
     - `stakeholder`: `lastContactOn >= windowStart`, a `stanceHistory` entry with `date >= windowStart`, or `nextContactOn > windowEnd`;
     - `goal`: `completedOn >= windowStart` or a goal check-in with `date >= windowStart`;
     - `person`: a 1:1 meeting in `state.oneOnOnes` with `date >= windowStart`.
   - Each cover delegation is classified into an explicit `executionState`:
     - `completed-verified`: `status === 'done'` and at least one linked source obligation moved (or zero linked sources exist);
     - `paper-only`: `status === 'done'`, `sourcesTotal > 0`, and `sourcesMoved === 0`;
     - `active-executing`: `status === 'active'` and at least one in-window check-in or moved source obligation;
     - `blocked`: `status === 'active'` and latest check-in `progress === 'blocked'`;
     - `returned`: `status === 'returned'` (with `supersededByDelegationId` tracked when recovered by a backup deputy);
     - `unexecuted`: `status === 'active'` with zero in-window check-ins and zero moved source records.
   - Signal `LCS-06` fires at severity 4 when a commissioned hand-over has an unrecovered returned cover delegation or a `paper-only` completion.

2. **Causal mechanism attribution on closed drills (`attributeDrillOutcomes`, `scoreDrillRecord`, `drillCalibration`).**
   - Drawing on the Intention-to-Treat (ITT) vs. Treatment-on-the-Treated (TOT) distinction (Imbens & Angrist, 1994) and graphical causal attribution (Pearl, 2009; `py-why/dowhy`), each frozen drill prediction is partitioned into:
     - `implementation-drop` (`implementationDropKeys`): the obligation stalled (`outcome === 1`) and was covered by a commissioned cover delegation for that window that was unapproved, unbriefed, `returned`, `unexecuted`, `paper-only`, or `blocked`;
     - `model-miss` (`modelMissKeys`): the obligation stalled (`outcome === 1`) despite either being predicted to hold (`pStall < 0.5` with no dropped cover) or having an actively executed cover delegation (`completed-verified` / `active-executing`);
     - `predicted-stall` (`predictedStallKeys`): predicted to stall (`pStall >= 0.5`, not dropped by a commissioned cover delegation) and stalled;
     - `unmodelled-resilience` (`unmodelledResilienceKeys`): predicted to stall (`pStall >= 0.5`) and did not stall;
     - `clean-cover` (`cleanCoverKeys`): predicted to hold (`pStall < 0.5`) and did not stall.
   - `scoreDrillRecord` preserves its unconditional `brier` and `skill` untouched and adds `attribution.executionConditionedBrier` and `attribution.executionConditionedSkill` computed over the non-dropped subset (`conditionedN = n - implementationDropKeys.length`).

3. **Generalized post-commit rule `RULE-LCS-04` (`leaderContinuityRule.js`).**
   - On `delegation.returned`: exits immediately before reading other collections when the returned delegation is not a continuity cover delegation (`[LCS:` / `LCS-WINDOW:`), preserving zero-clone lazy savepoint performance. When a continuity cover delegation is returned, `RULE-LCS-04` evaluates remaining deputies for the window (excluding deputies who already returned cover), applies the 75% fallback fit convention (`CONTINUITY_BACKUP_FIT_DISCOUNT`), and either:
     - creates an active replacement cover delegation on the highest-fit eligible backup deputy (`priorDelegationId`, `supersededByDelegationId` on the returned record, typed links to the parent hand-over decision and all covered obligations, and one blameless 1:1 talking point), or
     - opens one DACI cover-gap decision (`[LCS-RETURN:...]`) linked to the returned delegation and covered obligations when no backup deputy clears the evidence floor.
   - On `continuity.drill.closed` / `continuity.scan`: when a commissioned hand-over has dropped implementation (`implementationDropKeys.length > 0`, `paperOnly > 0`, unrecovered returns, or unexecuted cover on a closed drill), `RULE-LCS-04` drafts one pre-filled After-Action Review (`retros`, Schema v43) separating implementation drops from model misses and opens one owned ritual-fix delegation (`[LCS-EXEC:...]`).

4. **Multi-shock & cross-team vendor common-mode contagion (`vendorCommonModeContagion`, `LCS-07`).**
   - Traces active dependencies in `state.dependencies` and their downstream blast radius (attenuated by `substitutability` and `warmSwitchDays`). When a dependency's effective outage exceeds its `ttsDays` (`maxShortfallDays > 0`), all `primary` and `backup` stewards in its blast radius who belong to the deputy pool are identified across teams, along with the absence-window obligations whose primary cover depends on them.
   - Extends the seeded Monte Carlo with a second simultaneous shock (`continuitySecondShockPct`, default 10%) and per-dependency outage shocks prorated to the absence horizon from `annualFailureProb` (or overridden via `vendorShockPct`).
   - Active dependencies missing `annualFailureProb` or `ttrDays` are never treated as 0% failure risk; they are surfaced in `unmodeledDependencies`.
   - Signal `LCS-07` fires when a cross-team or multi-deputy dependency choke point puts critical absence-window obligations at risk.

## Alternatives rejected

- **Treating `delegation.status === 'done'` as sufficient proof of hand-over execution.** Rejected because a deputy can close the cover task on paper while every linked decision, case or stakeholder touch sits untouched.
- **Replacing the raw Brier score with the execution-conditioned Brier score.** Rejected because hiding dropped-baton stalls from the headline Brier score would let a team improve its forecast score by refusing to execute hand-overs; both numbers must be printed side by side.
- **Inventing synthetic default failure probabilities (e.g. 5%/year) for dependencies with `annualFailureProb: null`.** Rejected as silent data fabrication; unmodelled dependencies are listed explicitly in `unmodeledDependencies`.
- **Hardcoding backup cover reassignment inside `api.returnDelegation`.** Rejected because all cross-module propagation belongs on the generalized post-commit rule spine (`leaderContinuityRule.js`, ADR-0008).

## Consequences and limits

- `CONTINUITY_RULES` grows from 3 to 4 (`RULE-LCS-01..04`); `AUTOMATION_RULES` grows from 118 to 119; `continuitySignals` grows from `LCS-01..05` to `LCS-01..07`.
- Schema remains at v46 with an additive default setting (`continuitySecondShockPct: 10`).
- Causal mechanism attribution is an observational accounting partition over recorded check-ins and covered-source dates, not a randomized controlled trial; the UI and brief state this boundary explicitly.
