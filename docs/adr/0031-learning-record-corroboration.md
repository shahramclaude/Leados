# ADR-0031: Record corroboration and practice-persistence follow-through

- **Status:** Accepted
- **Date:** 2026-10-28
- **Decision owners:** LeadOS maintainers
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0028](./0028-after-action-review-learning-ledger.md), [ADR-0026](./0026-propagation-ledger.md)

## Context

The After-Action Learning Ledger (Schema v43) labels a lesson `applied` only after a human
records a date and a sentence describing the changed practice. That is more honest than
inferring application from a completed task, but it still cannot distinguish an unsupported
claim from one accompanied by another dated workspace artifact. Lattice and 15Five now
publicly describe evidence-grounded review writing, AI coaching briefs and meeting-note
capture. Repeating generic evidence summarization is not the highest-value gap. LeadOS needs
to trace what happened *after* an insight: a distinct record that can be rechecked, plus an
owned later question about whether the practice persisted.

## Decision

1. Add optional, bounded evidence references to applied lessons. A reference can point only
to an anchored organizational change, completed delegation or reviewed decision, must have a
valid event date between the held review and the human-entered application date, and cannot
point to the record being reviewed.
2. Require a human explanatory note. Never infer relevance from text similarity and never
infer `applied` from the artifact.
3. Capture a snapshot of the artifact's identity/title/status/date/relevant summary. The pure
report re-reads the live workspace record: missing, edited, invalidated or out-of-window
artifacts are `stale`. The snapshot is a change detector, not a cryptographic signature.
4. Add the typed graph relation `lesson — corroborates → artifact`. Register Schema v44 as
additive; historical v43 claims receive no evidence during migration.
5. `RULE-AAR-04` creates one idempotent, owner-assigned 30-day delegation when an active
lesson owner exists. Its question is whether the practice persisted. It must not claim the
artifact proves causal efficacy. If there is no active owner, do not invent one.
6. Keep counts separate from the learning index. With fewer than five applied claims, show
counts only; stale links get a signal but are not described as evidence the practice failed.

## Alternatives rejected

- Marking a lesson applied when a delegation closes: task completion is not practice change.
- NLP/LLM semantic matching or free-text inference: no validated relevance model or adequate
  privacy/accuracy case.
- Treating an artifact as a causal test, financial return or proof of quality: temporal
  existence does not identify treatment effect.
- Automatically assigning a follow-up to a default manager: accountability needs an actual
  active owner.
- Retroactively attaching records during migration: would turn a historical claim into
  fabricated provenance.

## Consequences and limits

- A user-selected artifact may be irrelevant; the note is an explicit explanation, not a
  validated match. Workspace corroboration is not an external audit or independent witness.
- Snapshot differences can reflect legitimate edits and therefore produce stale warnings.
  A user must attach a new artifact to refresh provenance; old link history remains auditable.
- The 30-day delegation checks practice persistence only when a human completes it. No
  background scheduler, effectiveness model, benchmark, employee score, external connector,
  network call, new dependency or new export scope is introduced.
- Prospective outcome/baseline measurement remains necessary before describing effectiveness
  or ROI. Human adoption and competitive coverage are **[UNVERIFIED]**.

## Verification contract

`tests/app/after-action.test.mjs` exercises date eligibility, duplicate rejection, snapshot
invalidation, typed-link resolution, v43→v44 non-backfill, RULE-AAR-04 delegation creation,
owner, due date and idempotency through the production store rule spine. UI tests cover the
learning tabs with axe. These tests establish implementation behavior, not product impact.
