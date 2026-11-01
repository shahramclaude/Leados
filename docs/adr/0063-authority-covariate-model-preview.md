# ADR-0063 — Authority covariate model as a non-operational preview

**Date:** 2026-11-01  
**Status:** Accepted  
**Schema:** v71 unchanged

## Context

The Borrowed Evidence Engine currently pools delegation outcomes by four authority classes. The classes already form an explicit ordinal ladder in `DELEGATION_AUTHORITY`, but the report treats each class as an unrelated unit. Competitive research found AI agents embedded in review/coaching workflows (Lattice, Confirm) and workforce decision-intelligence scenarios (Nakisa). The useful LeadOS gap is not another drafting agent; it is exposing whether the existing evidence varies along a declared structural feature, with uncertainty and a refusal boundary.

## Decision

Add `fitCovariateHierarchy`, a deterministic one-covariate Beta-binomial logistic regression over the declared autonomy scores: Recommend = −1, Agree = −1/3, Act + inform = +1/3, Own = +1. The model uses a Normal(0, 1.5²) slope prior, a Jeffreys intercept measure, and the existing BDA3 concentration prior. It integrates over a fixed coarse/refined grid and reports a posterior slope, 90% interval, probability of a positive slope, and per-class predictive estimates.

Expose it in the Credibility terminal's Authority model panel. The fit is lazy (only when the panel is opened), memory-cached by input values, and unavailable unless the existing authority pool is permitted (three observed classes, eight decisive outcomes by default, non-degenerate) and at least three classes with varied covariates have observations.

## Hard boundary

This is observational, class-level and exploratory. Authority allocation is not randomized; repeated outcomes may be dependent; only four levels exist; the ordinal spacing is a convention. The preview is not causal, does not score people, and does not alter the established hierarchy, forecasts, rules, propagation or stored state. No schema migration is needed. A future promotion to operational use requires immutable intake-time predictors and prospective comparison against the current model in the frozen Brier ledger.

## Alternatives rejected

- Replacing the current pool immediately: unsupported until the candidate is prospectively graded.
- Causal language or interpreting authority as an instrument: assignment is confounded.
- Person-level models: violates the product's privacy and governance boundary.
- Running on every report/automation event: needless latency and encourages misuse.
- Additional covariates from editable historic fields: invites post-outcome leakage.

## Consequences

The model offers a transparent way to inspect a potential structural pattern. Sparse-data intervals will often be wide and the model may refuse. This is intentional. The next step is not to tune the prior until the result looks useful; it is to preserve immutable intake covariates and grade forecasts prospectively.
