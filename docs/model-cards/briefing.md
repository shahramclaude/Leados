# Model Card — `briefing.v1`

| | |
|---|---|
| **Surface** | Daily Briefing |
| **Version** | 1.0.0 |
| **Owner** | leados-ai-platform |
| **Pipeline** | `src/lib/ai/briefing.ts` → `src/lib/ai/groundedGeneration.ts` |

## Purpose
Turn the deterministic set of **real changes** (metric deltas, new events) that
occurred for an org during a timeframe into a short, fully-cited narrative,
with a "why am I seeing this" explanation attached to every item.

## Data used
- `entities`, `events` (occurred within the briefing window), `metrics`
  (only rows whose value changed vs. `previousValue` within the window).
- No free-text documents, no web browsing, no cross-org data.

## Output contract
`{ items: [{ text, citations[], whyShown, confidenceClass }], text (joined), lint }`
— every numeric token must resolve to a citation (Part 08 lint, reused).

## Known limits
- If nothing changed in the window, the briefing abstains with an explicit
  "no material changes" message rather than inventing filler content.
- Does not infer *why* a metric changed unless a linked event explains it;
  correlation between a metric delta and a same-window event is only stated
  when both are present in the GroundingSet, and is phrased as proximity, not
  proven causation.
- Narrative mode (`executive`/`analyst`) changes vocabulary/sentence length
  only — it never changes which facts are reported.

## Degradation behavior
If the model provider is unavailable or a paid tier's output fails citation
lint, briefings silently fall back to the deterministic composer tier, which
is template-based and always grounded. The response is marked `degraded: true`
and the reason is logged (never shown as an error to the end user — the
briefing still renders, just in a slightly more templated voice).
