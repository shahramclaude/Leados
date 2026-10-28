# ADR-0020: Outcome-scored premise sensor calibration

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decision owners:** LeadOS product/engineering
- **Related:** ADR-0008 (post-commit rules), ADR-0019 (Premise Sentinel)

## Context

The v35 Premise Sentinel accepts explicit likelihood ratios from its declarative sensors and updates premise belief in log-odds. Those ratios were transparent conventions, not calibrated on LeadOS outcomes. Without a dated, human-owned outcome ledger, the product could not evaluate whether sensor strength was useful or systematically overconfident. Automatically learning from current belief would be circular: the evidence would grade itself.

Decision-intelligence products increasingly describe a closed loop from decision to observed outcome and recalibration. Performance suites such as Culture Amp provide evidence-based summaries, review coaching and calibration workflows, while forecasting communities such as Metaculus score resolved forecasts. LeadOS should borrow the measurement discipline without silently turning leadership records into employee ratings or automated judgements.

## Decision

Schema v36 adds an append-only `premiseOutcomes` collection. A leader may append `held`, `failed` or `inconclusive`, with a settlement date and optional note. An inconclusive checkpoint is preserved but never scored. Each premise may have at most one conclusive outcome; a second is rejected by the action API and repaired on import with a warning. Historical v35 premises receive no fabricated labels.

`RULE-PREM-05` runs on the generalized post-commit spine after `premise.outcome`. It creates typed, idempotent links from the outcome to its premise (`validates`) and, when present, the premise's decision (`revisits`). It does not determine truth or mutate the premise's belief. The derived calibration read model joins outcomes to only sensor observations dated on or before the settlement date.

For each sensor/premise pair, repeated evidence for the same typed source is collapsed to the latest pre-settlement state. A sensor-implied probability maps the declared LR to a neutral 50% starting point (`LR/(1+LR)` when supporting, `1/(1+LR)` when challenging). This is an explicit scoring convention, not a claim that those LRs are empirically valid. The report exposes mean Brier score, mean forecast, observed held rate, calibration gap, 50%-threshold directional accuracy and PSI over earlier/recent forecast distributions. One premise contributes one sample per sensor, regardless of observation count.

Performance statistics are withheld below five conclusive premise samples per sensor. PSI is shown only with at least ten earlier and ten recent samples separated at a settlement-date boundary; a same-day wave is never split. PSI is labelled forecast-mix shift, not evidence that model quality degraded. No likelihood ratio is auto-adjusted. A future calibration update would need stronger evidence, dependence handling and a human approval policy.

CSV scope #36 exports only sensor identifiers, opaque sequential premise codes, settlement dates and numeric calibration telemetry. It excludes premise titles, notes, evidence text, people names and source-record IDs. Point-in-time reconstruction hides outcomes not yet created/settled at the requested as-of date. Demo-clearing removes outcomes whose premise was removed.

## Consequences

- A manager can now close the loop from a cross-module sensor observation to a later human-assessed reality and inspect the sensor's own-workspace score.
- The data model, action API, UI, CSV export, graph lineage and audit events remain local-first; no backend, network call, LLM or additional runtime dependency is introduced.
- Early workspaces will commonly show counts-only. That is intentional; sparse, dependent leadership data is not a safe basis for individual sensor ratings.
- The neutral-prior translation, descriptive aggregation and outcome truth remain limitations. Correlated incident clustering and richer uncertainty intervals are still required before any automated LR recalibration.

## Verification

`tests/app/premises.test.mjs` covers hand-checked Brier/gap/accuracy, source collapse, outcome-date leakage prevention, counts-only suppression, PSI sample floors, append validation, typed cross-module links, migration, opaque export, and accessible rendering of the new tab/dialog. Full canonical and standalone verification results are recorded in `AI-SESSION-LOG.md` for this change.
