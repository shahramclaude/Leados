// LLM integration seam (Part 11 contract).
//
// LEADOS's grounded pipeline is designed so a real LLM call can be dropped in
// behind `generateNarrative` without touching the retrieval, citation, or
// cite-or-refuse logic in `grounding.ts`. No model API key is provisioned in
// this sandbox, so narrative composition below is template-based and fully
// deterministic — this is ledgered honestly rather than silently faked as a
// "real" model call. Swap `composeDeterministicNarrative` for a provider SDK
// call when a key is available; the grounding contract (citations required,
// abstain when evidence is insufficient) does not change either way.
export function isLLMConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export interface NarrativeInput {
  question: string;
  evidenceSnippets: { title: string; snippet: string }[];
}

export function composeDeterministicNarrative({ question, evidenceSnippets }: NarrativeInput): string {
  if (evidenceSnippets.length === 0) return "";
  const lead = evidenceSnippets
    .slice(0, 3)
    .map((e, i) => `[${i + 1}] ${e.snippet.trim()}`)
    .join(" ");
  return `Based on ${evidenceSnippets.length} grounded source${evidenceSnippets.length > 1 ? "s" : ""}: ${lead}`;
}
