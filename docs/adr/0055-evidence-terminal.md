# ADR-0055: The Evidence Terminal — pooling what has actually worked here, and pricing one more study

- **Status:** Accepted
- **Date:** 2026-10-31
- **Session:** 92 (Schema v66)

## Context

Sessions 84–91 built the workspace's *single-study* epistemic machinery: the Impact Ledger
pre-registers a hypothesis and scores it with interrupted-time-series regression
(`impact.js`), the Assumption Ledger scores premise priors against outcomes (`premises.js`),
the Performance terminal freezes a support-plan probability and scores it (`performance.js`),
and the Information Value terminal prices a declared experiment before it is run
(`valueOfInformation.js`).

Each of those answers a question about **one** study. The question nobody in the workspace
could answer was the one a leader actually asks after the fourth one closes:

> Several studies of the same lever on the same metric have now finished. What do they say
> **together**, is the disagreement real, and is one more study worth running?

That is a meta-analysis, and every tool that does it — RevMan, Comprehensive Meta-Analysis,
JASP, `metafor`, MetricGate, the free calculators — is built for a **researcher who already
has a spreadsheet of study estimates**. None of them:

1. harvests the studies from the leader's own operational records;
2. runs inside the same system that owns the decisions, cases and delegations the finding
   should change;
3. refuses to publish a pooled number below a declared floor, or states the independence
   assumption it is making;
4. converts a pooled finding back into owned work in the same transaction;
5. keeps the frozen claim inside the workspace's export/privacy boundary.

So the terminal had to be built, not integrated.

Two methodological facts made the design safe to commit to:

- **Korevaar et al. (2023), _Research Synthesis Methods_** — simulation across series length,
  autocorrelation, and study count: random-effects meta-analysis of ITS **level-change**
  estimates yields coverage close to the nominal level regardless of the ITS estimation
  method and regardless of how few studies are pooled. Pooling ITS level shifts is therefore
  defensible, not a stretch.
- **The empirical comparison (BMC Medical Research Methodology, 2024)** of ITS meta-analysis
  methods found the choice of random-effects estimator (DL, REML, Paule–Mandel, …) barely
  moves the pooled estimate and its interval. **DerSimonian–Laird** is therefore chosen for
  transparency — it is a closed form a reader can check — rather than for accuracy it does
  not have over its peers.

## Decision

We introduce the **Evidence Terminal** (`#/evidence`, Schema v66, CSV scope #56), a
random-effects synthesis over the workspace's own pre-registered studies and its own resolved
probability predictions, with a frozen-review lifecycle and five rules on the shared
post-commit spine.

### 1. Two families, pooled with the same machinery (`app/core/domain/evidence.js`)

- **Effect family.** Every *scored, locked* impact study contributes a standardized effect:
  the ITS level shift as a percentage of the pre-period mean, with its standard error
  converted the same way. Dimensionless, so it can be pooled across different metrics.
  **The sign is then oriented so that positive always means better** — a fall in feedback
  latency is an improvement, not a backfire — while the un-oriented level shift is kept
  beside it. Without this, a pooled average across metrics would be meaningless.
- **Resolution family.** Every *declared* probability that has since resolved — an
  `expectedConfidence` written before a study window closed, a premise prior at registration,
  a support-plan probability frozen at adoption — is one forecast. Pooled on the log-odds
  scale with the Haldane–Anscombe 0.5 correction, reported with Wilson intervals, Brier
  against the base-rate reference, skill, and calibration-in-the-large (observed vs expected,
  with a two-sided z).

Both use the same pooling core: **DerSimonian–Laird random effects** with
$\tau^2 = \max\left(0, \frac{Q - df}{C}\right)$, Cochran's $Q$, $I^2$, and **both**
intervals computed, with the **wider** of the z interval and the **Hartung–Knapp** interval
reported. A small-study correction may only widen what the terminal claims, never narrow it.

### 2. Five ways the pooled number is kept honest

| Guard | Behaviour |
|---|---|
| Pooling floor | Fewer than `evidenceMinPoolStudies` (default 3) pre-registered studies ⇒ **counts only**, no estimate, refusal printed. Exploratory studies are counted and shown, never pooled: pooling them rewards declaring a hypothesis after the answer arrived. |
| Heterogeneity floor | $I^2$ and $\tau^2$ are **withheld** below `evidenceMinHeterogeneity` (default 4) studies — three studies cannot separate between-study variance from noise. Above it, $I^2 \ge 75$ with $p_Q < 0.1$ returns **"Depends where you use it"**, not an average. |
| Direction | A cell is only "works here" / "backfires here" when the **reported** interval excludes zero on the useful / harmful side, given the metric's declared direction. |
| Independence | Random-effects pooling assumes independent estimates. Two ITS studies of the *same* team metric whose **windows overlap** share observations, so the pooled SE is optimistic by an unmeasured amount. `overlappingPairs` counts those pairs and prints them beside the estimate instead of pretending the assumption held. |
| Influence | `leaveOneOut` flags any study whose deletion moves the pooled answer by more than the median within-study SE, or flips whether the interval crosses zero. Deliberately *not* tested against the pooled SE, which τ² inflates — that test is circular and would clear every outlier. |

Egger's test refuses below `evidenceMinEggerStudies` (default 10): below ten studies a funnel
plot is a shape, not a signal.

### 3. What next: exploitation plus the priced value of learning

Every intervention on the focus outcome is ranked by the cell's empirical-Bayes posterior
mean (exploitation) **plus** `evidenceExploreWeight × EVSI` (exploration). EVSI uses the
normal-prior closed form $v = \sqrt{s^2 - s'^2}$, $s'^2 = (1/s^2 + 1/\sigma^2)^{-1}$, so an
uninformative trial is worth exactly zero and a perfect one is worth EVPI — both limits are
asserted by test, not argued in prose. An untested lever is priced at the outcome's grand
mean with the between-intervention spread as its prior, and is **never given a mean it has
not earned**. When no within-study noise was declared, EVSI is `null` with a reason — never
`0`, which would read as "worthless" when it is merely unpriced.

### 4. Frozen reviews are predictions, and predictions get graded

`buildEvidenceReview` freezes the pooled cells, the ranking, the resolution summary and the
engine version. It stores **aggregates only** — no study title, hypothesis, note or
identifier — so a review cannot become a second, unredacted copy of the workspace behind the
export boundary, and a later edit to a study cannot rewrite what the review said.

`gradeEvidenceReview` re-derives today's figures from live records and asks two questions of
each frozen interval: does it still **cover** today's pooled estimate, and how **far off** was
it (mean absolute error). Coverage is reported beside accuracy on purpose: an interval wide
enough covers almost anything, so coverage alone would reward predicting nothing useful.
A graded review cannot be re-graded or deleted; an ungraded one can be deleted, and its edges
go with it.

### 5. Five rules on the shared spine (`app/core/domain/evidenceRules.js`)

Registered in `postCommit.js` before `decisionTempoRule`, marker-idempotent, one transaction:

| Rule | Trigger | Writes |
|---|---|---|
| RULE-EBM-01 | any propagation | **One** DACI decision per cell, **ever**, when a pooled interval stays on the harmful side of zero, plus a `grounds-practice` edge to the review that grounded it. Once per cell because the finding is about a durable body of evidence, not about this week. |
| RULE-EBM-02 | `impact.scored` | One replication task when a supported pre-registered result stands **alone** (one independent root, zero replications). A cell with three studies of which two are replications is still one finding — which is why the count is on roots, not on rows. |
| RULE-EBM-03 | any propagation | One pre-registration task per (outcome × intervention × ISO week) where the value of information exceeds the value of the expected effect. |
| RULE-EBM-04 | `evidence.scan` | Typed `recommends-for` edges from the newest frozen review to open cases, plus one owned delegation. An edge needs a durable source; a page view is not one. |
| RULE-EBM-05 | any propagation | Stale-edge reconciliation and grading work for reviews past their review date. |

`evidenceAutoPropagate = false` pauses *automatic* propagation; an explicit scan always runs.

### 6. Privacy and surface

CSV scope #56 exports per-cell telemetry under opaque codes (`IT01..`, `OB01..`, `RS01..`):
counts, the pooled estimate with the wider interval, τ², Q and its p, I², the Egger flag, the
verdict code, and the priced value of one more trial. **No titles, no hypotheses, no outcome
notes, no names, no free text.** Below a floor the cell is blank, never zero. Signals
`EBM-01..08` roll up into Insights under the `Evidence` domain.

## Consequences

- **What the terminal refuses to claim:** that a pooled average is a policy when the studies
  disagree; that coverage is accuracy; that an unreplicated result is a finding; that
  overlapping windows are independent; that an unpriced trial is worthless; that a subgroup
  found after the fact is evidence. Exploratory studies are never pooled.
- **Deliberately not built:** REML/Paule–Mandel estimators (the empirical comparison shows
  they do not move the answer, and DL is checkable by hand); trim-and-fill or selection models
  (publication bias is not the dominant bias when the studies are your own and the protocol
  requires pre-registration — and a funnel-plot correction would invent the studies that
  "should" have been run); network meta-analysis (no indirect comparisons exist here);
  EVPPI (no parameter-level model to take partial information over).
- **Still [UNVERIFIED]:** real-browser and screen-reader behaviour of `#/evidence`; the
  convention constants (pooling floor 3, heterogeneity floor 4, α 0.1, Egger floor 10,
  resolution floor 6, I² 75) are declared conventions, not validated instruments; the
  overlap warning quantifies *that* independence is broken but not *by how much*; no field
  validation with managers who have acted on a pooled internal estimate.
