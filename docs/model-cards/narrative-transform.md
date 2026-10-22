# Model Card — `narrative-transform.v1`

| | |
|---|---|
| **Surface** | Narrative modes (executive vs analyst) |
| **Version** | 1.0.0 |
| **Owner** | leados-ai-platform |
| **Pipeline** | `src/lib/ai/narrativeModes.ts` (measurement) + mode param threaded through `modelProviders.ts` composers |

## Purpose
Provide two controlled registers for the same underlying, already-cited
claims: **executive** (plain language, short sentences) and **analyst**
(technical vocabulary, more detail per sentence).

## Data used
None independently — operates purely on `ClaimSpec[]` already produced and
already linked to evidence by the briefing/ask/insight surfaces.

## Output contract
Not a standalone generation; a mode flag (`"executive" | "analyst"`) passed
into `ComposerRequest`, plus `measureNarrativeCompliance()` for measurable
verification of sentence-length caps (20 words executive / 35 analyst) and
controlled-vocabulary substitution (e.g. "ARR" → "annual recurring revenue"
in executive mode).

## Known limits
- Cannot introduce facts. If a claim doesn't fit the sentence-length cap after
  controlled-vocabulary substitution, the renderer is expected to keep the
  sentence intact (never silently drops a citation) and compliance
  measurement will flag the overage for prompt-engineering follow-up rather
  than truncating evidence.

## Degradation behavior
Not model-dependent — this is a deterministic measurement/render concern, so
it has no "down" state.
