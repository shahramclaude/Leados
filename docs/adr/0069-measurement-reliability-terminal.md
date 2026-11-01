# ADR-0069: Measurement Reliability Terminal (`#/reliability`)

Date: 2026-11-01 · Status: implemented · Schema: v77

## Context

One hundred and eight sessions built a workspace that prices decisions, grades
forecasts, borrows evidence for small samples, transports probability words,
rehearses responses, bundles execution, attributes outcomes, and evaluates the
leader's own decision policies against named alternatives. Every one of those
terminals audits **an object the workspace stores**.

Meanwhile the single most consequential instrument in a first-time leader's
working life is the one nobody audits: **the performance review rating they
write about another human being.** A rating decides pay, promotion, stretch
scope, and whether a person is managed out. It is a measurement. It has a
variance decomposition. Almost nobody computes it.

The 2026 competitive picture, surveyed on 2026-11-01:

- **Culture Amp** publishes the richest people-science language in the category:
  causal inference in the People Science Suite, "performance review rubrics
  calibrated to reduce rater bias", bias detection inside reviews, equity-gap
  forecasting, and calibration sessions that "flag outliers that may indicate
  bias patterns". Every one of those signals is **cross-manager** — it compares
  one manager's distribution to another's, or a manager's average to the
  company average (Leapsome flags a department average more than 0.5 points from
  the company mean). None of them decomposes the variance *inside* one
  manager's own ratings, and none publishes a reliability coefficient for the
  rating instrument itself.
- **Lattice** ships an AI Agent on every tier (summaries, review drafts,
  coaching), Lattiverse 1:1 agents, descriptive-plus-predictive attrition
  analytics and a calibration module.
- **15Five** ships the Predictive Impact Model, dynamic heat maps and AMAYA
  coaching.
- **Visier** (Vee), **Perceptyx**, **Leapsome**, **Glint**, **Peakon** and the
  2026 AI-native entrants cluster on the same surface: drafting, summarising,
  sentiment, attrition risk, benchmarks.

A 2026 review of statistical standards for vetting HR analytics tools states the
accepted evidence stack plainly: intraclass correlations, Bland–Altman limits of
agreement and test–retest reliability, with internal consistency (α) explicitly
insufficient and a change of scale or labels invalidating prior reliability
evidence. **No product in the searched market reports an ICC, a kappa, a
G-coefficient or a shrinkage estimate for the ratings a manager assigns to their
own reports.** The gap is not a feature gap; it is a measurement-theory gap.

The literature the engine is built on:

- **Shrout & Fleiss (1979)** for the ICC family, and the generalisability-theory
  point that reliability is a property of a **decision study** — "one rater" and
  "the mean of four raters" are different coefficients and reporting only one is
  a choice with consequences (Revelle & Condon, reliability chapter).
- **Murphy & DeShon (2000)**: inter-rater correlations **do not** estimate the
  reliability of job performance ratings, because systematic rater effects are
  not random error. Disagreement must be decomposed, not averaged away.
- **Gerhart / Wright et al. (Personnel Psychology, 2001)**: a worked
  multi-source G-theory example where item reliability .71 and rater ICC .61
  still yield a generalisability coefficient of **.418** — single-error-source
  reporting routinely overstates how much a rating can be trusted.

## Decision

Introduce **Schema v77 (`reliabilityReadings`, `reliabilityMarkers`,
`RELIABILITY_RULE_IDS`)** and the **Measurement Reliability Terminal** at
`#/reliability`, plus `RULE-REL-01..05` on the shared post-commit spine, a
typed `reliability` graph node, `REL-01..06` signals, an Insights bucket, a nav
badge, twelve route aliases and aggregate-only CSV scope **#67**.

The module answers four questions and refuses the rest:

1. **How much of the spread between my people is signal?** A balanced two-way
   random-effects ANOVA on the people × cycle design: τ² between-person, and
   cycle + residual pooled as *occasion error* (a manager cannot bank a good
   quarter and cash it later, so both are noise for the question "is this
   difference about the person?"). Printed: ICC(1), Satterthwaite interval,
   F(·,·) test of τ² = 0 with its p-value, and the reliability of the **mean of
   k ratings** by Spearman–Brown. Unbalanced designs use Cochran's n₀ and a
   balance ratio; a design too ragged to support a coefficient is refused with a
   machine-readable reason, never silently smoothed.
2. **What should I expect from this person next time?** Per-person
   credibility n/(n + K), K = occasion error ÷ between-person variance, with
   regression to the mean stated as the expectation for the **next**
   observation. This is deliberately not a score, a potential rating or a
   ranking.
3. **Can I actually tell these people apart?** Separation is a posterior test:
   two people share a tier unless the evidence separates them. The finding is
   the tier count and the number of indistinguishable adjacent pairs. Membership
   is alphabetical and appears on screen only — never in an export, never in the
   brief, never as an order.
4. **What would a defensible difference cost?** A decision study: minimum
   detectable difference at 80% power, observations per person needed to detect
   a one-point gap, and the months that costs at the declared cadence. A refusal
   the leader cannot act on is only half a product.

Refusals that are structural, not stylistic:

- **No person score, rank, leaderboard or potential rating.** Ever. Not in the
  UI, not in an export, not in the brief, not in a signal.
- **No composite across instruments that do not converge.** Convergence is
  tie-corrected Spearman with an exact permutation p over people carrying both
  instruments; high agreement that is underpowered at n = 5 is reported as
  "uncertified agreement", not as disagreement, and a composite is refused
  unless **every testable pair** converged.
- **No rewriting a rating.** A rating is read on the four-level ladder it was
  written on; the surprise guard *adds a note* and opens a verification task.
- **No adverse action, no sentiment/prose/demographic input, no imputation of a
  missing rating** (absent ≠ average), and **no credit for a lapsed window**.
- **Pauseable but never silent**: `reliabilityAutoPropagate = false` stops the
  automatic rules; an explicit scan always runs and reports what it would have
  done.

## Consequences

- A leader can now say, with their own numbers: "my ratings carry 52% of their
  variance between people, the 95% interval runs 0–84%, three tiers are
  defensible, two of four adjacent pairs are not, and separating a one-point gap
  would take seven ratings per person — eight-and-a-half months at my current
  cadence." That sentence did not exist in this product, or in the category,
  before this session.
- The demo workspace is seeded so the terminal reads coherently on first open
  (20 quarter-adjacent completed reviews over 4 cycles × 5 people, a frozen
  reading graded after the fact and a second one frozen today, three
  convergence instruments with one agreeing almost perfectly and two too thin to
  test).
- Cost: one more read model per render (~20 observations), one migration, five
  spine rules, and a set of floors that will refuse to answer on small
  workspaces. The refusals are the product.
- Risk accepted: ICC(1) treats cycle as error, so a manager with a genuine
  cohort-wide shift will see it as occasion variance. That is stated in the
  caveats card and in the brief rather than argued away — the alternative
  (a two-way mixed model that credits the cycle effect) would let a manager
  claim reliability they cannot tokenise.
- **Not claimed**: that these coefficients are valid for any other scale,
  population or cadence; that an ICC is a fairness measure (it is not — it says
  nothing about bias against a group); that a wide interval is a defect; or that
  a refusal means "no difference" rather than "unmeasured".

## Alternatives rejected

- **Cronbach's α** — internal consistency is the wrong question (a single item
  per person per cycle has no internal structure) and the 2026 standards review
  names it insufficient on its own.
- **Kappa / percent agreement** — the ladder is ordinal with four levels; a
  chance-corrected agreement statistic would need a declared weighting and would
  throw away the interval structure the ANOVA uses.
- **A two-way mixed ICC(3,1)** as the headline — it credits the cycle effect,
  which is exactly the flattery the module exists to refuse.
- **A composite "performance quality" index** — averaging instruments that do
  not converge is the error the convergence panel exists to prevent.
- **Fixing the data by nudging ratings** — impossible by construction; the
  module has no write path to `reviews[].manager.rating`.
