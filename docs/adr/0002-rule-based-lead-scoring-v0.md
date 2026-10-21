# ADR-0002: Use rule-based scoring, not ML, for v0

## Status
Accepted

## Context
LEADOS needs to help a user prioritize leads. Two options were available for v0: (a) a
hand-written, additive rule system, or (b) a trained classifier/regressor predicting conversion
likelihood.

## Decision
We implemented (a): `computeScore()` in `src/lib/scoring.ts`. No training data (conversion
outcomes) exists in the schema yet, so a trained model would have nothing to train on beyond
synthetic assumptions — which would be worse than an explicit, auditable rule set, not better. A
rule system can also be explained to an end user in one sentence per point, which a model at this
data volume could not do better than a coin flip's worth of calibration.

## Consequences
- Every score is explainable; the dashboard shows the breakdown directly (`src/components/LeadBoard.tsx`).
- The scoring has no statistical validation against real outcomes — see
  `docs/explanation.md` → "Intelligence methodology" for the full honest-limitations discussion.
- Before replacing this with a trained model, the project needs: a `converted`/outcome signal
  already exists as a `status` value, but no row currently records *when* or *why* a lead
  converted beyond the status change itself. A future ADR must address capturing richer outcome
  data before a model-based ADR-0003 can be written responsibly.
- `FEATURES.md` and `docs/explanation.md` must both be updated in the same change that introduces
  any model-based scoring, not afterward.
