// src/lib/search.ts — thin, UI/API-facing wrapper over the hybrid retrieval
// pipeline (mission §E), plus saved-search CRUD. No model calls — pure
// retrieval.
import { db } from "@/db";
import { savedSearches } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { hybridRetrieve, type ChunkKind } from "@/lib/retrieval";

export async function search(query: string, limit = 12, kinds?: ChunkKind[]) {
  const result = await hybridRetrieve(query, limit, kinds ? { kinds } : undefined);
  return {
    query: result.query,
    confidence: result.confidence,
    facets: result.facets,
    results: result.chunks.map((c, i) => ({ ...c, rank: i + 1 })),
  };
}

export async function saveSearch(ownerName: string, query: string, filters: Record<string, unknown> = {}) {
  const [row] = await db.insert(savedSearches).values({ ownerName, query, filters }).returning();
  return row;
}

export async function listSavedSearches(ownerName?: string) {
  const rows = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));
  return ownerName ? rows.filter((r) => r.ownerName === ownerName) : rows;
}

export async function deleteSavedSearch(id: number) {
  await db.delete(savedSearches).where(eq(savedSearches.id, id));
}
