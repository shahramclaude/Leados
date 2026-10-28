# ADR 0026 — Evidence Governance: the Claim & Counterfactual Registry

**Status:** Accepted (Session 61, 2026-10-28, Schema v41)
**Supersedes:** nothing. **Related:** ADR-0008 (post-commit rules hook),
ADR-0024 (early-warning watch), Session 58 (structural capital allocation trust ladder).

## Context

By Session 60 LeadOS made a large number of quantitative statements. It graded a
structural model on a five-grade trust ladder, scored promises with Brier/Murphy and
conformal bands, tested interventions with pre-registered windows and placebo inference,
sensed assumptions with Bayes and the SPRT, screened series with Shewhart rules, and
priced the cost of delay in more than one currency.

Every one of those disciplines was implemented honestly **inside its own module**. The
product had no surface that answered the question a board, an auditor, or a sceptical
engineer asks first:

> *Of all the numbers you just showed me — which are graded, which rest on a fragile
> assumption, which contradict each other, and what would change your mind?*

Three concrete defects followed from that gap:

1. **Grade fragmentation.** The capital module owned a trust ladder; the premise module
   owned a posterior; the watch module owned a precision ledger. A leader could not compare
   "my structural model is refuted" with "my detector's precision is unknown" because the
   two lived on different scales in different rooms.
2. **No effective challenge.** A leader could *disagree* with a conclusion only by editing
   the underlying record, which destroys the evidence that they disagreed. Nothing captured
   a dated observation against a specific claim, and nothing tracked what was done about it.
3. **Silent contradiction.** A load-bearing assumption could slip below its own watch
   threshold while the decision it was registered to test stayed open, and no surface
   connected the two facts. The records contained the contradiction; the product did not
   say so.

The regulatory context moved in the same direction. On 17 April 2026 the Federal Reserve,
OCC and FDIC issued **SR 26-2 / OCC Bulletin 2026-13 / FDIC FIL-15-2026**, superseding
SR 11-7 and SR 21-8. Commentators consistently read the revision as *raising* the bar on
**effective challenge** — challenge must be performed by people with the standing to
require corrective action, must be documented, and must be tracked through remediation —
while making the practice proportional to materiality rather than uniformly prescriptive
([Databricks](https://www.databricks.com/blog/model-risk-management-2026-bankers-guide-revised-interagency-guidance),
[Lumenova](https://www.lumenova.ai/blog/sr-26-2-model-risk-management-banking/),
[Ankura](https://ankura.com/insights/validating-models-under-sr-26-2-what-changes-for-regional-and-community-banks),
[KPMG](https://kpmg.com/us/en/articles/2026/compliance-value-navigating-transformation.html)).

MRM tooling answers this for a bank's model portfolio: an inventory, a tier, an assigned
validator, champion/challenger runs, drift monitoring and a sign-off bound to a model
version. On a single leader's own decisions that function does not exist. Nobody assigns a
validator to a first-time manager.

## Decision

Build a **derived** claim registry rather than a stored one.

Every quantitative statement the product makes is re-derived at read time from the records
its source module already reads. A claim is never persisted, so it cannot drift from the
data it describes, and there is no second write path to keep in sync. The only stored
artefact is a **challenge**: an append-only, dated observation with a declared likelihood
ratio.

Consequences of that choice, accepted deliberately:

- **Repair means editing the source record.** A wrong claim cannot be patched in place.
  That is the point: the evidence is the thing that must change.
- **A claim can disappear.** Its source records may be deleted or its model refuted into a
  different grade. The challenge ledger survives, and orphans are reported rather than
  cleaned up (a dispute about a number that no longer exists is a governance fact).
- **Derivation must be cheap and total.** Reports are already cached behind
  fingerprints in their source modules; the registry composes those and is itself guarded
  per source, so one broken report degrades to a warning instead of a blank page.

### The one ladder

`unvalidated → refuted → provisional → backtested → validated`, with the same ranks and
the same boundary conditions as the capital module's ladder, re-derived from the same
primitives (`skill`, `assumedPct`, pooled out-of-sample count and skill). Only `backtested`
and above may be called **actionable**. The registry does *not* re-grade a premise's
Bayesian posterior or an impact study's pre-registered test: those claims are labelled
`gradedBy: premise-sentinel` / `impact-ledger` so the page says which machinery owns the
number instead of pretending one ladder is universal.

### Effective challenge

A challenge is `{ claimId, observation, direction, likelihoodRatio, recordedOn }`.
The posterior is `logit(prior) + Σ ±ln(LR)` recomputed on every read. The neutral prior is
**50% and labelled a convention**, never a measurement. Likelihood ratios are clamped to
0.05–20 and the field is explicitly described as "not a confidence score" — the single most
likely way a leader would misuse it.

`RULE-MODEL-03` then fans the challenge out **inside the same atomic transaction**: one DACI
re-decision (adopt the updated belief / reject the claim / buy information), one owned
verification delegation, one blameless 1:1 prompt, typed `challenges` / `tests` /
`depends-on` lineage, and a `decisionTempo` declaration so the re-decision is priced by
Decision Tempo in that same transaction. `modelAutoPropagate:false` pauses the fan-out but
**never** prevents the evidence from being recorded: suppressing evidence is a worse failure
than suppressing follow-through.

### Declared conflict criteria

A conflict is reported only when a criterion written on the page holds:

| Type | Criterion | Framework |
|---|---|---|
| `fragile-premise-under-open-decision` | a load-bearing assumption whose signpost fired while the decision it tests is open | Assumption-Based Planning (Dewar et al., RAND 1993) |
| `adopted-on-refuted-model` | a commitment adopted while the model producing it is graded Refuted | Popperian falsification + MASE-style skill |
| `signal-vs-refuted-detector` | an open alert while the detector's own out-of-sample skill ≤ 0 | Wilson-interval precision + skill |

Conflicts are **surfaced, never auto-resolved**. There is no fuzzy-text contradiction
detector, and an empty conflict list is explicitly *not* presented as proof of coherence.

## Alternatives rejected

- **A stored claim table.** Would require a migration, a reconciliation job and a second
  source of truth, and would let a claim outlive the record it describes.
- **Reusing the capital trust ladder verbatim for everything.** Cheap and wrong: it would
  either double-count the premise posterior or silently re-grade a pre-registered test.
  Naming the grading machinery per claim is the honest version.
- **Auto-resolving conflicts.** A criterion firing is evidence, not a verdict. The leader
  has to re-decide, which is why the fan-out is a DACI decision.
- **An LLM-written "confidence narrative".** Deterministic, recomputable, auditable text is
  the product's whole claim to trust. No network path was added.
- **Claiming SR 26-2 compliance.** LeadOS is not a bank MRM system and does not assert
  regulatory conformance. It applies the *discipline* (inventory, tiering, effective
  challenge, documented remediation) at individual scale.

## Consequences

**Positive.** One surface now answers "what is this number worth"; the grade shown beside a
recommendation and the grade in the registry come from the same function; disagreement is
first-class evidence with a tracked remediation; contradictions in the records become
visible without a human noticing them by hand.

**Negative / accepted.** Deriving claims costs report composition on every read of
`#/models`, the nav badge and the Insights merge (measured cold 940 ms for the full
challenge transaction on the demo workspace, including the fan-out). A claim's grade can
change between two reads if the underlying records changed, which is correct but can
surprise. The 50% prior is arbitrary and only defensible because it is labelled.

**Open.** No independent validation study of whether this improves a real leader's decisions;
no multi-rater challenge (two leaders disputing the same claim); the conflict criteria are
three hand-written rules, not a general consistency checker.

## Verification

`tests/app/model-governance.test.mjs`, 34 tests: the ladder and its boundary identities
against the capital module; claim derivation including the empty-workspace and broken-source
guards; hand-checked Bayes (50% + one 4:1 challenge → 20%; two 2:1 supports → 80%; a
symmetric pair cancels to exactly 0); payload refusal of out-of-range ratios; conflict
criteria firing and *not* firing; v40→v41 additive migration; a normaliser that repairs
rather than deletes; the real-store cascade with provenance-based assertions (the tempo rule
legitimately adds its own decision — asserted as a tempo decision, not a duplicate rule run);
idempotency; the pause switch moving the posterior while suppressing follow-through; claim
codes/telemetry in CSV scope #41 with observations provably absent; and JSDOM + axe-core over
all five tabs plus the live challenge dialog.
