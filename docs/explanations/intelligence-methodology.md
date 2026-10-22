# Intelligence Methodology (and its honest limitations)

## What LEADOS v0.1.0 actually does

"Scoring" in this codebase means exactly one thing: `scoreLead()` in `src/lib/scoring.ts` sums the
`weight` of every tenant-defined `rule` whose `operator` evaluates to true against the lead's signals, then
clamps the total to `[0, 100]` and buckets it into `hot` (≥70), `warm` (≥40), or `cold` (<40). Every rule is
authored by a human (via `POST /api/rules`) and every point on the score is attributable to exactly one
rule evaluated against exactly one field value. The full breakdown is persisted (`lead_scores.breakdown`)
and echoed into the evidence ledger (`decisions.evidence.breakdown`) — see `docs/EVIDENCE-LEDGER.md`.

## What it is explicitly NOT

- **Not machine learning.** No model is trained, no historical conversion data is used, there are no
  weights learned from outcomes. Rule weights are whatever the tenant typed into `POST /api/rules`.
- **Not causal inference.** The system makes no claim that a high score *causes* a lead to convert, only
  that it matches rules a human decided were correlated with a good lead. There is no counterfactual
  reasoning, no A/B holdout, no causal graph.
- **Not retrieval-augmented or LLM-based.** No embeddings, no vector search, no language model calls exist
  anywhere in this codebase.
- **Not adaptive.** The scoring engine does not learn from whether a "hot" lead actually converted; there
  is no feedback loop today.

## Why start here

A transparent, rule-by-rule scorer has one major honest advantage over an opaque model: every score is
fully explainable by construction — the breakdown *is* the explanation, not a post-hoc approximation of
one. The cost is equally honest: it cannot discover a predictive pattern a human didn't already think to
encode as a rule, and it will not improve on its own as more data accumulates.

## Known limitations

1. **Rule quality is entirely the tenant's responsibility.** LEADOS does not validate that a rule is
   predictive of anything; it only validates that a rule is well-formed (`src/app/api/rules/route.ts`).
2. **No rule conflict detection.** Two rules can contradict each other (e.g. one rewards a field being
   high, another rewards it being low) with no warning.
3. **No per-rule contribution analytics over time.** There is no report showing which rules actually
   correlate with good outcomes, because LEADOS does not track outcomes at all yet.
4. **Threshold values (`HOT_THRESHOLD = 70`, `WARM_THRESHOLD = 40` in `src/lib/scoring.ts`) are fixed
   constants**, not tenant-configurable, and were chosen as reasonable round numbers, not fit to any data.

## Roadmap intent (not built)

A future version might add outcome tracking (did a "hot" lead actually close?) to let tenants calibrate
their own rule weights — this would still not make the system causal or ML-based unless explicitly
redesigned to be, and no part has committed to that redesign.
