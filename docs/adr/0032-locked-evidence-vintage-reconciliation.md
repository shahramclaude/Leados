# ADR-0032: Recheck locked outcome evidence without rewriting the score

- **Status:** Accepted
- **Date:** 2026-10-28
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0015](./0015-impact-ledger-preegistered-evaluation.md), [ADR-0026](./0026-propagation-ledger.md)

## Context

An Impact Ledger score freezes its evaluation, but the workspace records from which that
number was reconstructed remain editable. A locked result could therefore keep appearing
current after a dated source record, the eligible-team denominator, or a donor vital changed.
The score's weekly series retained values and observation counts, but per-person rates did not
retain their numerator and active-team denominator. The system could neither distinguish a
source correction from an unchanged reconstruction nor tell a leader to review the evidence
before acting on the score.

Current experimentation platforms describe stronger instrumented designs. Datadog's 2026
Experiments product describes feature-flag exposure, outcome metrics and sample-ratio /
traffic-integrity checks; GrowthBook describes experiment assignment/exposure and metric
reconciliation. These are product capabilities, not proof of measured outcomes. LeadOS remains
a local, observational workspace: it has no randomized assignment, exposure identity stream,
concurrent control group or independently authored data.

## Decision

1. For the three per-person vitals (feedback cadence, held 1:1 cadence and recognition
   cadence), retain each weekly point's event numerator and active-person denominator beside
   the already saved value and `n`. No person identity is copied into the score snapshot.
2. For a locked study, reconstruct the same analysis at its recorded lock date and compare the
   saved weekly values/counts/exposures and material result projection. Surface a changed
   source warning and affected period-end dates. Engine-version incompatibility or absent old
   snapshots are `unavailable`, never silently called unchanged.
3. The comparison is a change detector, not a cryptographic signature, audit attestation or
   tamper proof. A difference can be an ordinary correction. It does not identify which person
   changed a record, infer intent, or establish misconduct.
4. Exclude studies with changed source reconstruction from confirmatory totals and impact
   calibration until a human has reviewed them. Keep the original locked evaluation intact;
   there is no rescore-in-place path.
5. Only a human commissioning action with an explicitly selected active verifier triggers
   `RULE-IMP-07`. In one generalized post-commit transaction it creates a four-option DACI
   reconciliation decision, one 14-day owned source-verification delegation, optional
   blameless prompts for already-linked affected people, and `impact — rechecks → decision` /
   `impact — verifies → delegation` graph edges. It is marker-idempotent and does not replay
   old scale/stop/replication rules.
6. Migration 44→45 adds only two relation names. Existing scores and earlier numerator /
   denominator values are not backfilled or rewritten.

## Alternatives rejected

- Recompute and replace a locked result: destroys the point-in-time result and makes the
  leader's decision record negotiable after seeing the result.
- Call changed records evidence of tampering: no authentication, external audit log or
  independent authorship exists in the local-first product.
- Automatically re-score or send a message: the workspace does not establish whether a
  changed row was a correction, a legitimate data repair, or an error.
- Treat active-person counts as experiment assignment/exposure: roster headcount is not
  randomized enrollment and cannot support causal inference.
- Add SaaS identity, event telemetry or a new statistical package: would materially change
  privacy and deployment posture before a multi-user measurement design exists.

## Consequences and limits

- The user can see that a locked score no longer reproduces from today's records, and can
  assign a real person to inspect it. The original score remains available for audit context.
- Weekly aggregation narrows the discrepancy but does not locate the exact record or author.
  The explicitly assigned verification task is still necessary.
- Per-person denominators are active roster counts, not treatment exposure. The underlying
  analysis remains an observational interrupted-time-series design and is not causal proof.
- Hash-based tamper resistance, append-only source-record vintages, genuine assignment and
  exposure logs, external-source attestations, durable cross-tab compare-and-swap, field
  calibration and real-browser/screen-reader validation remain out of scope.
- No runtime dependency, server, network call, telemetry or new export of personal records is
  added.

## Verification contract

`tests/app/impact.test.mjs` proves the unchanged-vintage case, a changed weekly record and
exposure count, exclusion from confirmatory/calibration summaries, source-score immutability,
active-owner validation, one-transaction decision/delegation/coaching/typed links, replay
idempotency, and the JSDOM+axe owner-selection workflow. These tests establish code behavior,
not causal validity, audit-grade immutability, or real-world value.
