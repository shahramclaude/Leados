// =============================================================================
// familiarity.ts — "We've seen this before" similarity surfacing
// =============================================================================
// Given a new finding/decision's text, surfaces past memories and completed
// retrospectives whose content is similar, showing the PAST OUTCOME and its
// context — this is the mechanism that stops the app from re-deriving
// conclusions it already reached. Combines BM25 + Jaccard for robustness on
// short inputs, and always returns provenance + age + retention so the UI
// can show how trustworthy/stale the precedent is.
// =============================================================================

import { db } from "@/db";
import { memories, retrospectives } from "@/db/schema";
import { bm25Search, buildBM25Index, jaccardSimilarity } from "./textSearch";
import { decorateWithRetention } from "./institutionalMemory";

export interface FamiliarityMatch {
  kind: "memory" | "retrospective";
  id: string;
  title: string;
  snippet: string;
  similarity: number;
  ageDays: number;
  retention?: number;
  provenanceSource: string;
  pastOutcome: string | null;
}

export async function findSimilarPast(queryText: string, limit = 5): Promise<FamiliarityMatch[]> {
  const [allMemories, completedRetros] = await Promise.all([
    db.select().from(memories),
    db.select().from(retrospectives),
  ]);

  const corpus = [
    ...allMemories.map((m) => ({ id: `memory:${m.id}`, text: `${m.title}\n${m.content}` })),
    ...completedRetros
      .filter((r) => r.status === "completed")
      .map((r) => ({
        id: `retro:${r.id}`,
        text: `${r.situation}\n${r.decision}\n${r.outcome ?? ""}\n${r.lesson ?? ""}`,
      })),
  ];

  if (corpus.length === 0) return [];

  const index = buildBM25Index(corpus);
  const bm25Results = bm25Search(index, queryText, corpus.length);
  const bm25ById = new Map(bm25Results.map((r) => [r.id, r.normalizedScore]));

  const combined = corpus
    .map((doc) => {
      const bm25 = bm25ById.get(doc.id) ?? 0;
      const jaccard = jaccardSimilarity(queryText, doc.text);
      return { id: doc.id, similarity: 0.7 * bm25 + 0.3 * jaccard };
    })
    .filter((d) => d.similarity > 0.01)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const results: FamiliarityMatch[] = [];
  for (const c of combined) {
    const [kind, id] = c.id.split(":") as ["memory" | "retro", string];
    if (kind === "memory") {
      const row = allMemories.find((m) => m.id === id);
      if (!row) continue;
      const decorated = decorateWithRetention(row);
      results.push({
        kind: "memory",
        id: row.id,
        title: row.title,
        snippet: row.content.slice(0, 280),
        similarity: Number(c.similarity.toFixed(4)),
        ageDays: decorated.ageDays,
        retention: decorated.retention,
        provenanceSource: row.provenanceSource,
        pastOutcome: row.class === "lesson" ? row.content : null,
      });
    } else {
      const row = completedRetros.find((r) => r.id === id);
      if (!row) continue;
      const ageDays = row.completedAt
        ? (Date.now() - new Date(row.completedAt).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      results.push({
        kind: "retrospective",
        id: row.id,
        title: `Retrospective: ${row.decision.slice(0, 80)}`,
        snippet: `${row.situation}`.slice(0, 280),
        similarity: Number(c.similarity.toFixed(4)),
        ageDays: Number(ageDays.toFixed(2)),
        provenanceSource: `retrospective:${row.id}`,
        pastOutcome: row.outcome,
      });
    }
  }

  return results;
}
