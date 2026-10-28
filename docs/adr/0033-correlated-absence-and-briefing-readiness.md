# ADR-0033: Correlated absence stress, deputy concentration and hand-over briefing readiness

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0032](./0032-leader-continuity-drill.md), [ADR-0030](./0030-coupled-continuity-capacity-simulation.md), [ADR-0008](./0008-post-commit-rules-hook.md)

## Context

ADR-0032 shipped an absence model whose exact count distribution assumes **independent
items** and whose coverage is `recorded fit × availability`, with availability always 1.
Two consequences were documented as limits and, on measurement, both turned out to be
material:

1. **Independence is not a small simplification here.** The demo workspace has 25 dated
   obligations in a 14-day window, 13 of them critical, and the cover plan concentrates on one
   deputy. Under independence the expected stall count is 16.88 (P90 19). Removing the
   independence assumption raises that to 19.07 mean and 25 at P90 — a 31.6% tail lift on the
   same data. A tool that only reports the independent number is systematically optimistic in
   exactly the situation the leader is planning for.
2. **The "availability" multiplier made the stress test worse than useless.** Because
   `pCover = fit × availability`, setting a deputy unavailable *reduced* their coverage rather
   than removing it, so a missing deputy made an item look *better covered* than a held one.
   A stress feature built on that formula would have reported less exposure after removing the
   one person the plan depends on.

A third gap was organisational rather than mathematical: the hand-over decision and its
delegations could be commissioned, and then nothing checked whether any deputy had actually
acknowledged the cover. A hand-over nobody was briefed on is a document.

## Decision

1. **A second, explicitly distinct model.** `simulateCorrelatedAbsence` is a seeded Monte
   Carlo with three added mechanisms: one shared cause per window takes the deputies recorded on
   one team offline together (probability `continuityCommonCausePct`, default 25%, a stress
   convention and not a measured outage rate); each deputy is individually away with probability
   derived from 8% per 14 days compounded over the horizon; and when a deputy is away the item
   falls back to the next eligible deputy at 75% of their recorded fit, or stalls if there is no
   second eligible deputy.
2. **Coverage keeps its meaning.** The correlated model uses `fit × P(at their desk)`, never
   `fit × availability` with a frozen 1. Coverage therefore degrades monotonically as deputies are
   removed, and the regression is pinned by a test: with 100% individual absence every coverable
   item is a certain stall.
3. **The two models are reported side by side, never blended.** The exact independent
   distribution stays, because it is exact and cheap and it is what drills will be scored against.
   The correlated model adds `vsIndependent` (mean and P90 lift) so the page can print how much
   independence is flattering the plan. The brief prints both.
4. **A degenerate cluster is reported as a finding, not smoothed.** If every deputy is recorded
   on one team — or no team is recorded — a team-level shared cause is total, and the report says
   so (`cluster.singleTeamPool`, with a rendered label) instead of letting P90 equal the item count
   look like an accident. The deputy-unavailability stress is the tool for a partial loss in that
   situation.
5. **Concentration is measured on the eligible pool, not on the plan's nomination.**
   `coverConcentration` counts distinct eligible deputies per item at the evidence floor. A plan
   that names one of three eligible deputies is not concentrated; an item with exactly one eligible
   deputy is.
6. **A person cannot cover contact with themselves.** The stakeholder relationship bonus was
   awarded to the person the stakeholder record *is*, which made a deputy the best cover for their
   own contact item. That is now an explicit ineligibility with a stated reason, and relationship
   credit requires a typed `stakeholder → person` link rather than a name in a text field. This
   correction removed four items' cover and moved the demo plan from 53.5% to 46.5% criticality
   coverage — the honest number.
7. **Readiness counts recorded acknowledgements.** `handoverReadiness` finds the commissioned
   hand-over for the requested window, or the newest one if none matches, links its delegations,
   and counts a delegation as acknowledged only if it has a recorded check-in or is completed. It
   reports days-to-window, approval state, and active/completed/returned counts. `LCS-05` fires
   at severity 4 inside seven days when any cover delegation is unacknowledged.
8. **Schema v46 is additive.** One setting (`continuityCommonCausePct`, clamped 0–100) and a
   `45 → 46` migration. Existing drill records are **not** rescored or re-frozen: they were scored
   against the independent model, and rewriting them would make the ledger retroactive.

## Alternatives rejected

- **Replacing the exact model with the Monte Carlo.** Cheaper to maintain, worse to trust: the
  exact convolution has no sampling error and can be asserted in tests.
- **A single "resilience probability" across both models.** Blending removes the one thing worth
  knowing — how much the answer depends on the assumption.
- **Arbitrary partial shared causes** (a fixed number of deputies going offline at once) to avoid
  the degenerate single-team case. That is a fabricated mechanism. Reporting the concentration —
  "all your deputies are one team" — is a finding the leader can act on by recording teams.
- **Treating a queued talking-point or a delegation existing as acknowledgement.** Only a recorded
  check-in or completion counts.
- **Retro-scoring existing drills under the correlated model.** Would fabricate history.

## Consequences and limits

- Costs a second seeded simulation per report render (~15 ms for 25 items at 4,000 trials).
- The correlated model's probabilities are conventions. They are printed, adjustable, and the
  brief states that they are not measured outage or illness rates.
- One shared cause per window: two simultaneous shocks and a vendor failing under two teams
  remain out of scope, and are stated in the rendered assumptions.
- Readiness measures *recorded* acknowledgement. A briefing that happened but was never recorded
  reads as unbriefed — which is the correct bias for a workspace that claims to keep receipts.
- Revisit when: a drill shows the correlated P90 overshooting or undershooting observed stalls by
  more than a third on three or more closed drills, or when a workspace records enough teams for
  the team-level cluster to be non-degenerate.
