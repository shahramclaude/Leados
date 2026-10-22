// =============================================================================
// LEADOS — Part 11: model cards registry
// =============================================================================
// Every prompt/template used by groundedGeneration.ts MUST declare a
// `modelCardId` that exists in this registry. `assertModelCardExists` is
// called on every generation and also asserted in the eval suite, so a new
// surface can never ship without a card. Full prose cards also live under
// `docs/model-cards/*.md` for human review; this file is the machine-checked
// index.
// =============================================================================

export interface ModelCard {
  id: string;
  version: string;
  purpose: string;
  dataUsed: string[];
  limits: string[];
  owner: string;
  docPath: string;
}

export const modelCards: Record<string, ModelCard> = {
  "briefing.v1": {
    id: "briefing.v1",
    version: "1.0.0",
    purpose: "Summarize real deltas (changed metrics, new events) for an org over a timeframe into a cited Daily Briefing.",
    dataUsed: ["entities", "events", "metrics (changed only)"],
    limits: [
      "Only reports deltas present in the deterministic GroundingSet — never speculates about causes not backed by an event/metric.",
      "Does not browse the open web; org-scoped data only.",
      "Executive mode strips jargon; analyst mode may use technical terms.",
    ],
    owner: "leados-ai-platform",
    docPath: "docs/model-cards/briefing.md",
  },
  "ask-leados.v1": {
    id: "ask-leados.v1",
    version: "1.0.0",
    purpose: "Answer a free-text question with inline citations, abstaining when evidence is insufficient.",
    dataUsed: ["entities", "events", "metrics", "retrieved document chunks (hybrid RAG)"],
    limits: [
      "Abstains rather than answers when retrieval + grounding set contain no relevant evidence.",
      "Untrusted document content is never treated as instructions, only as citable (or background) data.",
      "Does not execute any tool above tier0_read.",
    ],
    owner: "leados-ai-platform",
    docPath: "docs/model-cards/ask-leados.md",
  },
  "insight-synthesis.v1": {
    id: "insight-synthesis.v1",
    version: "1.0.0",
    purpose: "Surface cross-entity/cross-metric patterns (e.g. correlated slowdowns) with links to every contributing evidence item.",
    dataUsed: ["entities", "events", "metrics across multiple entities in the org"],
    limits: [
      "Pattern detection is rule-based and deterministic; the model only narrates patterns that were already statistically/structurally detected.",
      "Does not claim causation — only reports co-occurrence/correlation explicitly, with the evidence it's based on.",
    ],
    owner: "leados-ai-platform",
    docPath: "docs/model-cards/insight-synthesis.md",
  },
  "narrative-transform.v1": {
    id: "narrative-transform.v1",
    version: "1.0.0",
    purpose: "Render an already-grounded claim set into either executive (plain-language) or analyst (detailed) register.",
    dataUsed: ["ClaimSpec objects produced by other surfaces (no independent data access)"],
    limits: [
      "Cannot introduce new facts — purely a register/vocabulary transform over existing, already-cited claims.",
      "Sentence-length caps are enforced/measured (20 words executive / 35 words analyst).",
    ],
    owner: "leados-ai-platform",
    docPath: "docs/model-cards/narrative-transform.md",
  },
};

export function assertModelCardExists(modelCardId: string): ModelCard {
  const card = modelCards[modelCardId];
  if (!card) {
    throw new Error(`Unknown modelCardId "${modelCardId}" — every generation call site must declare a registered model card.`);
  }
  return card;
}
