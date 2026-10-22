# Model Card — `insight-synthesis.v1`

| | |
|---|---|
| **Surface** | Insight Synthesis |
| **Version** | 1.0.0 |
| **Owner** | leados-ai-platform |
| **Pipeline** | `src/lib/ai/insightSynthesis.ts` → `src/lib/ai/groundedGeneration.ts` |

## Purpose
Detect patterns **across** findings (e.g. multiple entities showing a similar
metric slowdown in the same window, or a cluster of same-type events) and
narrate them with links to every contributing evidence item.

## Data used
- All entities/events/metrics for the org within the timeframe (cross-entity,
  unlike the single-entity-first framing of the briefing).

## Output contract
`{ insights: [{ text, citations[], evidenceRefs[], confidenceClass }], lint }`

## Known limits
- Pattern *detection* is deterministic/rule-based (co-occurring directional
  metric moves, repeated event types) and happens entirely before any model
  call — the model only narrates patterns that were already found, with the
  evidence refs already attached. It cannot claim a pattern that detection
  didn't surface.
- Language is explicitly correlational ("occurred alongside", "coincided
  with"), never causal, unless an event's own description states causation
  and that description itself is cited.

## Degradation behavior
Same composer/small/large ladder as other surfaces; insight synthesis tends
to have the highest claim count, so it is the most likely surface to be
routed to the `large` tier when available (and otherwise safely served by the
deterministic composer).
