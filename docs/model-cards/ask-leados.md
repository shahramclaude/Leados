# Model Card — `ask-leados.v1`

| | |
|---|---|
| **Surface** | Ask-LEADOS (query → cited answer) |
| **Version** | 1.0.0 |
| **Owner** | leados-ai-platform |
| **Pipeline** | `src/lib/ai/askLeados.ts` → `src/lib/ai/ragRetrieval.ts` → `src/lib/ai/groundedGeneration.ts` |

## Purpose
Answer a free-text question about the org's entities/events/metrics/documents
with inline citation chips, or **abstain explicitly** when there isn't enough
evidence, telling the user what evidence would be needed.

## Data used
- Deterministic entities/events/metrics for the org + timeframe implied by
  the question.
- Hybrid-retrieved document chunks (BM25 + graph expansion + recency decay,
  see `ragRetrieval.ts`), each tagged `trusted`/`untrusted` by source type.

## Output contract
`{ text, citations[], confidenceClass, abstained?, costBadge (dev only) }`

## Known limits
- Only tier0 (read-only, org-scoped) tools may be invoked; it cannot write,
  export, or act cross-org.
- Untrusted retrieved content (imports/webhooks/notes) is quotable evidence
  only — it is never permitted to alter the model's instructions, regardless
  of what it contains (see `src/lib/ai/taint.ts`).
- Abstention is preferred over a fluent guess whenever citation lint would
  fail; the user sees "I don't have evidence for X — here's what would be
  needed" rather than a degraded-confidence answer.

## Degradation behavior
Same escalation/fallback ladder as the briefing: composer → small → large,
with automatic fallback to composer (and a visible `degraded` flag) if the
provider is unreachable or a response fails validation after one escalation.
