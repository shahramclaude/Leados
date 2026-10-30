# ADR-0048: Shared-barrier exposure sensitivity without inferred correlation

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decision owners:** LeadOS product/engineering

## Context

The Attention Market (ADR-0047) optimizes recorded obligations additively and explicitly disclosed that it did not model correlation. Operational cases already store a 5-Whys `systemicBarrier`, but the graph did not relate two cases that repeated the same barrier. Risk aggregation practice makes common causes important; however, matching free-text is not evidence of shared causal mechanism, shared time horizon, or correlated loss. Applying a guessed coefficient would create false precision and could misdirect time or money.

## Decision

1. On case lifecycle events, `RULE-ATT-05` reconciles typed `shares-barrier` case-to-case edges where active records' barrier strings match exactly after Unicode NFKC, case folding and whitespace normalization. The minimum normalized length is eight characters. Records with automation paused are excluded.
2. The edge stores identifiers, a generic rule reference and no copied barrier prose. Edits, resolution, reopening, deletion and pause reconcile the graph.
3. The Attention Market shows two same-currency scenario values for a matched cluster: the sum of priced case exposures and the maximum individual exposure as a full-overlap scenario. Missing exposure remains unknown; currencies remain separate.
4. The scenario lens is not used by the allocation solver. No correlation, probability, causal claim, confidence interval, expected-loss estimate or guaranteed bound is implied. An `ATT-S6` signal points to the market.
5. No schema migration is needed: this extends the typed relation vocabulary, not the record shape or persisted collection set.

## Consequences

- A leader can see that multiple cases have the same written guardrail gap and question the additive exposure assumption without retyping or exporting private narratives.
- Exact string matching is brittle: it can miss semantically identical barriers and group generic repeated language. It is a **review cue**, not an inferred finding.
- Exposure estimates may use different horizons or include overlapping downstream impacts; the two scenarios are illustrations only. The optimizer's plan remains unchanged until dependence data can be defended.
- Future work should introduce a human-confirmed typed driver/dependency entity with provenance and confidence, and only then evaluate scenario aggregation.

## Alternatives rejected

- **Auto-estimated correlation from matching words:** rejected; lexical similarity does not establish dependence.
- **Change the optimizer to use max or a weighted compromise:** rejected; assumes perfect overlap or invents a coefficient.
- **A new schema collection for causes:** deferred; no stable, confirmed cause vocabulary exists yet.

## Verification

`tests/app/attention-market.test.mjs` exercises real `addCase` and `updateCase` action flows, typed edge creation/removal, scenario arithmetic, currency separation, missing values and the rendered page. It does not validate semantic causality or field effectiveness.
