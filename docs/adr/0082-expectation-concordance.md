# ADR-0082 — The Concordance Terminal: "meets expectations" as a measurement instrument

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 122
- **Schema:** v89 (additive `88 → 89`)
- **Route:** `#/concordance` (aliases: `expectation-concordance`, `two-gauges`, `gauge`, `kappa`, `definition-of-done`)
- **Rules:** `RULE-ECN-01` (typed roll-up), `RULE-ECN-02` (governed re-contracting), `RULE-ECN-03` (advisory maturity)
- **New graph node:** `concordance` → `expectationRounds`; **new relations:** `re-contracts`, `re-tests`
- **CSV:** scope #78 `expectation-concordance` (aggregate-only)

## The problem

Performance review is the highest-stakes measurement a company makes about a person, and it is
performed with an instrument nobody has ever calibrated. A manager rates someone against a *word* —
"meets expectations" — and the word is not one expectation but six: what finished means, how good
*good* is, what outranks what, what may be decided alone, how early a risk must be raised, and what
to do when speed and completeness collide.

Two honest people using two different gauges produce a review that is correct on both sides and still
arrives as a surprise. Every category tool — Lattice, 15Five, Culture Amp, Leapsome, Betterworks,
Workday, SAP SuccessFactors — measures something adjacent: goal cascades (self-reported percentages),
engagement indices (survey averages), 360 feedback (a distribution of opinions), nine-box grids (a
manager's claim), OKR alignment (a ratio of key results to objectives). None of them measures
**whether the two people in the room mean the same thing by the same sentence**, and none rolls that
measurement up a reporting tree with a defensible statistic.

That is an industrial problem with an industrial answer: **Measurement Systems Analysis**. Before you
trust a number produced by an instrument, you measure the instrument (AIAG & VDA, *MSA Reference
Manual*, 4th ed., 2010 — gauge R&R, %agreement, %repeatability & reproducibility). LeadOS already has
a psychometric terminal for the *reliability of ratings over time* (ADR-0069, `#/reliability`, ICC and
Spearman–Brown). This ADR is the complementary object: **agreement between two raters on one
construct, at one moment, on the definition of the standard itself**.

## Decision

Build a terminal whose unit is a **pair** (a leader and one of their reports), whose object is the
**instrument** (six declared dimensions on a five-point bar), and whose output is **agreement between
two people**, never a rating of either.

1. **One round, two sealed sides.** A round is opened for a real reporting pair (member must sit in
   the leader's subtree; a skip-level or peer pair is refused). Each side answers all six dimensions
   independently. Nothing is revealed until both sides are in; a submitted side cannot be revised;
   a closed round cannot be reopened or withdrawn. This is a read-model and UI guarantee that
   prevents *anchoring*, and the app says plainly that it is not a security boundary — a backup file
   contains a sealed side.
2. **Four agreement statistics, none alone.** Quadratic **weighted κ** (Cohen 1968) over the fixed
   five-point scale; **Gwet's AC1** (2008) for prevalence robustness; **PABAK** (Byrt et al. 1993);
   **Bland–Altman** bias with 95% limits of agreement (1986). When κ and AC1 disagree by more than
   0.4 the prevalence paradox is *printed*, not silently resolved in the flattering direction.
3. **Refusals are first-class.** Below the six-item instrument floor the round produces no figure at
   all. Degenerate marginals (both sides on one category) refuse κ with the 0/0 reason. Perfect
   agreement prints a **shared-error warning** instead of a green light: agreement is not correctness.
4. **Exact partition, then suppression.** Each pair is counted once, at its leader's node, and
   inherited by ancestors by addition, so the enterprise figure cannot be inflated by zooming out.
   A span rate is withheld below `concordanceCellFloor` (default 5) assessed pairs — counts print,
   rates do not. The enterprise headline is a **share of pairs above the floor with a Wilson 95%
   interval** plus a 10th–90th percentile range, never a single mean pretending to be an index.
5. **One rule set on the existing spine.** `RULE-ECN-01` writes one typed `rolls-up-to` edge per
   leadership ancestor for every closed round in the same atomic transaction, plus a `re-tests` edge
   when the round tests an earlier decision. `RULE-ECN-02` opens **one governed DACI re-contracting
   decision per pair per ISO week** when κ is below the floor or any dimension is two whole steps
   apart, and places one generated agenda line on the pair's most recent 1:1. `RULE-ECN-03` writes one
   advisory maturity marker. Marker-idempotent, pausable via `concordanceAutoPropagate`, explicit scan
   always runs. No second engine, no new event bus.
6. **A closed loop with an honest label.** When a pair runs a second round after a re-contracting
   decision, the before/after κ change is compared with pairs that also breached but were not
   re-contracted — and printed as an **association**, refused below the cell floor, never called an
   effect.
7. **Disclosure ladder, not role-themed dashboards.** Named pair detail at ranks 1–2 (and always for
   the leader's own pairs); director rank and above read span rates and the dimension profile with the
   two gauges withheld for other spans; the brief and CSV are aggregate-only.

## What this may never do

- Rate, rank, score or profile a person. The subject of every figure is a **pair and a dimension**.
- Print a figure below the item floor, the cell floor, or with undefined marginals.
- Claim agreement implies correctness, or call the re-test comparison causal.
- Change an expectation, a review, a rating, a setting or a reporting line on its own. It opens a
  question for the span that owns the pair; a human decides.

## Consequences

- **New:** `concordanceRegistry.js`, `concordanceSchema.js`, `concordance.js`, `concordanceRules.js`,
  `concordanceActions.js`, `app/views/concordance.js`, `tests/app/expectation-concordance.test.mjs`.
- **Modified:** `schema.js` (v89, collections, migration, clamped settings), `postCommit.js`,
  `propagationContracts.js` (62 rules / 62 contracts), `cases.js` (node + two relations + resolver +
  labels), `accessGateway.js` (`close-expectation-round`), `seatRegistry.js` (action right), `csv.js`
  (scope #78), `actions.js`, `main.js` (nav/route/aliases/badge/title), `app/styles.css`.
- Migration is **additive**: an older workspace gets an empty ledger and declared conventions; no
  figure is inferred and no round is invented.
- The mechanised test sweeps that accompany any schema bump (version pins, migration step lists,
  `CSV_EXPORTS.length`) were updated in the same commit.

## Honest limits

Local seat selection remains an auditable **declaration**, not authentication; anyone with this
browser or a full backup can read a sealed side, so sealing prevents anchoring, not a determined
reader. Six items is the instrument, not a sample: the κ intervals are wide and no predictive claim is
made. Suppression is small-cell withholding, not differential privacy. The re-test comparison is
observational. A real-browser screen-reader walkthrough remains `[UNVERIFIED]`.

## Alternatives rejected

- **A 360-feedback surface** — measures a distribution of opinions about a person, which every vendor
  already sells and which this product deliberately refuses to store.
- **An "alignment score"** — a single number would hide exactly the dimension-level finding that makes
  the instrument actionable.
- **Storing the two sides in one record without a seal** — the second answer anchors on the first and
  the measurement measures persuasion.
- **Auto-correcting the expectation from the divergence** — the app would then be deciding what a
  standard is, which is the leader's job and the report's conversation.
- **Grading the pair's future review outcome** — attractive and unbuildable honestly with six items;
  the closed loop compares agreement before and after instead, and says what it is.
