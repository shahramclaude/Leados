# ADR-0068: Counterfactual Policy Terminal (`#/counterfactual`)

Date: 2026-11-01 · Status: implemented · Schema: v76

## Context

One hundred and seven sessions built a workspace that prices decisions, tracks
assumptions, borrows evidence for small samples, transports the leader's own
probability vocabulary, rehearses coordinated responses, bundles cross-module
execution atomically, and attributes outcomes with Earned Schedule and
Brinson–Fachler variance. Every one of those terminals answers a question about
*an object in the workspace*. None answered the question that turns a
calculator into a decision instrument:

> **Would a different, named policy have scored better than the way I actually
> decided — and how much hidden bias would it take to explain the difference
> away?**

Without that, every LeadOS recommendation is an assertion with no track record.
A leader who always decides on the day a call is opened, never tests a
load-bearing assumption, or only checks in on delegations that are already
struggling has no way to learn whether those habits cost anything — and no way
to learn that they don't.

The competitive picture (surveyed 2026-11-01) makes the gap concrete. The 2026
performance-management and people-analytics field (Lattice AI Agent, 15Five
Coaching Insights, Culture Amp Archie AI, Leapsome AI, Engagedly, Intelogos,
Visier, Perceptyx) is uniformly **generative and descriptive**: drafting
reviews, summarising engagement text, flagging attrition risk, answering natural
language questions. None publishes an off-policy value, a partial-identification
interval, an effective-sample diagnostic or a hidden-bias bound. Off-policy
evaluation is a mature discipline — Dudík, Langford & Li (2011), Swaminathan &
Joachims (2015), the KDD 2022 OPE tutorial, and a 2026 line of work applying
doubly-robust OPE as decision support for adaptive experiments — but it lives
in contextual bandits, recommender systems and epidemiology. It has never been
pointed at a manager's own decision record.

## Decision

Introduce **Schema v76 (`policyEvaluations`, `policyMarkers`)** and the
**Counterfactual Policy Terminal (`#/counterfactual`)** built on five decoupled
ES modules (`counterfactualRegistry.js`, `counterfactualPolicySchema.js`,
`counterfactualPolicy.js`, `counterfactualPolicyRules.js`,
`views/counterfactual.js`):

1. **Decision points harvested, never entered.** Four adapters read records the
   leader already keeps and derive a unit with a binary arm, an observed reward
   on [0, 1], and two declared *pre-treatment* covariates:
   - *Assumption verification*: was a dated observation recorded before the
     assumption's human-assessed settlement? Reward: did it hold?
   - *Decision timebox*: was the call made on or before its declared review
     date? Reward: the recorded outcome review (good 1, mixed 0.5, bad 0).
   - *Delegation checkpoint*: was a check-in recorded before the due date?
     Reward: delivered on or before the due date.
   - *Case containment*: was mitigation spend recorded? Reward: the feared event
     did not materialise.
   Covariates are deliberately restricted to values written *before* the arm was
   taken. An early build matched on the number of premise observations and on
   `decidedOn − date` — both deterministic functions of the treatment itself —
   which collapses overlap to zero and manufactures a refusal. That defect was
   found by building it and is fixed.

2. **Five policies, all prequential.** *What you actually did* (exactly
   identified — no model, no weight), *always act*, *always hold*, *copy the
   running best arm*, and *copy the recent best arm* (90-day half-life). Every
   policy chooses its arm at point *i* only from points strictly before *i*
   (Dawid 1984), so no point is ever scored by a rule that had seen its outcome.

3. **Four estimators, one bounded headline.** Direct method (shrunk outcome
   model, empty cells flagged), IPS (Horvitz–Thompson 1952), SNIPS (Hájek 1971)
   and doubly robust (Robins, Rotnitzky & Zhao 1994). **SNIPS leads** because it
   is bounded by the reward range: an early build led with DR and a single
   decision point on a rarely-taken arm moved the estimate by eight percentage
   points. DR, IPS and DM remain on the panel as cross-checks and their spread
   is reported as a fragility diagnostic.

4. **Manski (1990) partial identification.** For every point where a policy
   would have taken the arm that was not taken, the reward is simply absent.
   With no assumption it lies in [0, 1] and the value is an interval. When that
   interval still excludes zero, the sign is determined by the data alone — the
   strongest claim available without an experiment. A second, narrower interval
   allows only rewards already observed in the same family.

5. **Rosenbaum (1987, 2002) hidden-bias bound.** Greedy nearest-neighbour
   matching within a 0.5 SD caliper on the declared covariates, with absolute
   standardised mean differences reported before and after (Stuart 2010).
   Matched binary pairs reduce to McNemar (1947) under a bounded-binomial worst
   case; the **design sensitivity Γ\*** is the magnitude of unobserved selection
   needed to overturn the finding, found by bisection to a tolerance.

6. **Time-uniform confidence sequences.** A Hoeffding stitched boundary
   (Howard, Ramdas, McAuliffe & Sekhon 2021) over the running recorded score,
   valid simultaneously at every *t*. A leader who re-reads this screen every
   morning is not quietly spending an unreported false-positive budget — a
   fixed-horizon interval does not survive that, and no vendor publishes one.

7. **RULE-CFP-01..04 on the shared post-commit spine.** Prospective capture
   (with a `late` flag when a log was written on or after the outcome it
   describes), immutable one-shot resolution, a governed DACI policy ruling plus
   one blameless process task at most once per ISO week (priced downstream by
   Decision Tempo in the same transaction), and reconciliation that drops
   decision points whose source record was deleted. Frozen evaluations are
   graded once from what followed, and a window that closes with too few new
   points **lapses** rather than being credited.

## Explicit limits & refusals

- **Never a person rating.** No unit, arm, reward or pair is a named individual.
  Blame language is rejected at the API boundary and scrubbed on import.
- **Never a causal claim.** Selection is the default explanation for every
  difference on these panels. Γ\* is the *magnitude of confounding that would
  explain the gap*, not a proof that the gap is real.
- **Never an adopted policy.** A robust finding opens a decision for the leader
  to make. The engine prices; it does not rule.
- **Never a cross-family total.** Rewards are not comparable between assumption
  hold-rates and decision outcome scores; no roll-up across families exists.
- **Never a rounded half.** A 0.5 reward (a "mixed" review) is excluded from the
  paired test and counted, never forced into success or failure.
- **Never a number below the floor.** Units, per-arm counts, per-family counts,
  effective sample size and matched pairs each carry a floor; below it the
  figure is blank, never zero.
- **Verification scope.** Verified by automated Node/JSDOM/`axe-core` suites and
  the standalone build; live physical-browser and screen-reader walkthroughs
  remain `[UNVERIFIED]`.

## Benchmarks & named frameworks

Dudík, Langford & Li (2011) doubly-robust OPE; Horvitz & Thompson (1952);
Hájek (1971); Swaminathan & Joachims (2015); Robins, Rotnitzky & Zhao (1994);
Bang & Robins (2005); Kong (1992) effective sample size; Manski (1990) partial
identification; Rosenbaum (1987, 2002) sensitivity analysis and design
sensitivity; McNemar (1947); Stuart (2010) covariate balance; Dawid (1984)
prequential; Howard, Ramdas, McAuliffe & Sekhon (2021) time-uniform confidence
sequences; Hoeffding (1963); Ville (1939); Savage (1951) policy regret lineage.
