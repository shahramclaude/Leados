# ADR-0046 — Sequential investigation planner: plan the tests, not just the next one

**Status:** accepted · **Date:** 2026-10-30 · **Schema:** v56 (unchanged) · **Session:** 81

## Context

The Information Value Terminal prices one inquiry at a time. `evaluateInquiry` returns the expected value of information from a single declared test, its net value after cost, and a `buy` / `not-worth-it` / `insufficient` verdict. A leader with three open tests therefore sees three independent numbers, and nothing says what to do first, what to do after each possible result, or when to stop.

That is the actual decision a leader faces. Testing is rarely a single purchase. The first test's result changes whether the second one is still worth buying, and sometimes it changes the choice itself. A register of isolated net values cannot show that a cheap, weak test is worth running because it can make an expensive, strong test unnecessary. It also cannot show that two strong tests on the same state are worth no more than the stronger one.

Sequential testing is well studied in statistics and operations research. Recent work treats optimal sequential designs as a joint choice of stopping, timing and decision rules, and reports that planned sequences beat group-sequential designs on cost [UNVERIFIED — as cited in the 2026 literature review recorded in RESEARCH.md; not reproduced here]. A one-step look-ahead stopping rule is close to hindsight-optimal in tested cases, but it was only tested on conjugate newsvendor problems [UNVERIFIED]. Those results are about large designs with continuous outcomes. They do not directly give a finite, categorical, leader-facing plan.

## Decision

Add a read-only sequential planner that solves the declared test menu exactly by finite-horizon dynamic programming, and three marker-idempotent rules on the shared post-commit spine that turn the plan into notes, owned tasks and a commit decision.

1. **Exact planner, no approximation.** `app/core/domain/sequentialInvestigation.js` enumerates the Bayes update for every test outcome, up to three stages (`SEQ_MAX_STAGES`) and six tests (`SEQ_MAX_TESTS`). With at most six tests and three stages the tree is small, so the search is complete, not heuristic. The menu is ordered by declaration time, and a later test replaces the incumbent only when strictly better, so ties go to the test declared first and the plan is reproducible.
2. **Conditioning, not re-pricing.** Settled tests condition the belief by Bayes' rule under conditional independence given the true state. The order of settlement does not change the result. Evidence that cannot all be true under the declared states is refused with a reason, never normalised away.
3. **Consistency with the existing engine is an acceptance criterion.** With one stage and no settled evidence, every declared test's raw net value equals `evaluateInquiry().netValue` within rounding. The new "Net value alone" column reports the same raw, possibly negative, value the register prints. The planner floors value at zero only in the plan's option value, because a plan can always decline a test. That floor is not applied to the displayed net.
4. **Refuse what cannot be supported; cap what would be unwieldy.** The planner returns `ok: false` with a reason for: a missing or unpriced frame, probabilities that do not sum to 100, and settled evidence that cannot all be true. Tests that cannot carry information (a coin-flip with sensitivity + specificity of 100 or less, or no target state) are excluded from the menu. Two limits are capped rather than refused: the menu holds at most six tests (the excess is counted in `omittedTests`, never silently dropped) and the horizon is at most three stages (the horizon used is printed in the plan).
5. **Three rules, one chain.**
   - `RULE-SEQ-01` writes one advisory note with the conditional plan (first test; what to do if it fires; what to do if it does not) when a second stage adds at least `max(1, 1% of the stake)`. Marker-idempotent by plan reference.
   - `RULE-SEQ-02` opens one commit decision with one DACI option per frame option, each priced under the current belief, when the plan says to decide now or no further test pays. A later stop revises the same open decision in place. A decided one is never edited; a new stop opens a new question.
   - `RULE-SEQ-03` creates exactly one owned task on the frame owner for the next planned test, dated to that test's due date, with a typed `tracks-followup` link back to the frame. With no owner it records a note and invents no assignee.
6. **Registration.** The rule runs after the VOI rule and before decision tempo, so new decisions receive a timing position. It has a declared propagation contract and catalog entries.

## Consequences

- A leader can now see the order of tests, the branch they take after each result, and the reason for stopping. This is the decision the register could not show.
- The planner's answer to "is the second test worth it?" can change after a settlement. It is not fixed when the test is declared. This is the intended behaviour: a plan is a conditional policy, and it is re-read on every settlement.
- No schema migration. The planner is a read model over existing `voiDecisions` and `voiStudies`. The rules write to existing `notes`, `delegations`, `links` and `decisions` shapes. The planner's reference (`SEQ-` + six characters, a hash of the frame, verdict, first move, horizon, value, menu and settled set) is stable across reruns, so re-scanning changes nothing.
- The DP is exact over the menu the leader declared. It cannot recommend a test nobody declared. Its quality is bounded by the sensitivity, specificity and cost the leader entered.

## Limits and rejected alternatives

- **Not a posterior for the real world.** Sensitivity and specificity are declared judgements. The belief update is exact arithmetic on those judgements; it does not correct them. Calibration stress is still a separate, read-only instrument (ADR-0045).
- **Conditional independence is assumed.** Two tests are treated as independent given the true state. If two tests share a source, their joint evidence is overcounted. The Sequence tab states this assumption in the rendered page; no automated check of source overlap exists.
- **No schema bump (v56 → v57) for this feature.** A bump would have forced version and migration-chain updates across roughly thirty test files and bought nothing, because the planner is derived. Rejected.
- **No myopic look-ahead.** A one-step stopping rule is cheaper, but it can stop early when a second test would have paid, which is the failure mode the research flags [UNVERIFIED]. The bounded exact search was preferred because the menu is small.
- **No automatic test execution.** The planner says what to run next and who owns it. It does not contact a vendor, run a study or settle a test.
- **No second decision layer.** RULE-SEQ-02 reuses the existing decision register and DACI options rather than inventing a new object.
- **Not a Monte Carlo or continuous-outcome design.** Group-sequential designs and bootstrapped stopping boundaries are out of scope; the frame is categorical by construction.

## Verification contract

`tests/app/sequential-investigation.test.mjs` checks the exact arithmetic (perfect test = EVPI on top of stop value; duplicate test adds nothing; noisy test net; Bayes posterior), the consistency criterion across 60 deterministic random frames, horizon monotonicity, Bayes conditioning and order independence, every refusal, plan determinism, the three rules through the real action layer (including idempotency, owner-less refusal, revision in place and decided-decision immutability), `voiAutoPropagate: false`, the rendered Sequence tab, and spine registration. Full canonical verification is recorded in `AI-SESSION-LOG.md`.
