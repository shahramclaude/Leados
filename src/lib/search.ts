// search.ts — thin, UI-facing wrapper over the hybrid retrieval pipeline,
// used by GET /api/search. No model calls — pure retrieval.
import { hybridRetrieve } from "@/lib/retrieval";
import { annotateChunks } from "@/lib/promptInjectionGuard";

export async function search(query: string, limit = 12) {
  const result = await hybridRetrieve(query, limit);
  const annotated = annotateChunks(result.chunks);
  return {
    query: result.query,
    confidence: result.confidence,
    results: annotated.map((c, i) => ({
      ...c,
      rank: i + 1,
      score: result.chunks[i]?.score ?? 0,
      entityId: result.chunks[i]?.entityId ?? null,
    })),
  };
}
