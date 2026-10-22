// =============================================================================
// livingDocs.ts — keeps docs honest about their own staleness
// =============================================================================
// A "living doc" is any doc with `sourceEntityIds` — it is supposed to
// reflect the current state of those entities. Rather than silently
// re-deriving content with an LLM (which risks drift/hallucination), this
// module computes a staleness signal by comparing `lastSyncedAt` to the most
// recent `updatedAt` among its source entities, and flags docs that need a
// human re-sync. Docs are never auto-rewritten.
// =============================================================================

import { db } from "@/db";
import { docs, entities } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { ageInDays } from "./institutionalMemory";

export interface StalenessReport {
  docId: string;
  title: string;
  lastSyncedAt: Date;
  staleDays: number;
  mostRecentSourceUpdate: Date | null;
  isStale: boolean;
  staleSourceCount: number;
}

const STALE_THRESHOLD_DAYS = 30;

export async function computeStaleness(docId: string): Promise<StalenessReport | null> {
  const [doc] = await db.select().from(docs).where(inArray(docs.id, [docId]));
  if (!doc) return null;

  const sourceIds = (doc.sourceEntityIds as string[]) ?? [];
  let mostRecentSourceUpdate: Date | null = null;
  let staleSourceCount = 0;

  if (sourceIds.length > 0) {
    const sources = await db.select().from(entities).where(inArray(entities.id, sourceIds));
    for (const s of sources) {
      const updated = new Date(s.updatedAt);
      if (!mostRecentSourceUpdate || updated > mostRecentSourceUpdate) mostRecentSourceUpdate = updated;
      if (updated > new Date(doc.lastSyncedAt)) staleSourceCount++;
    }
  }

  const staleDays = ageInDays(new Date(doc.lastSyncedAt));
  const isStale = staleDays > STALE_THRESHOLD_DAYS || staleSourceCount > 0;

  return {
    docId: doc.id,
    title: doc.title,
    lastSyncedAt: new Date(doc.lastSyncedAt),
    staleDays: Number(staleDays.toFixed(1)),
    mostRecentSourceUpdate,
    isStale,
    staleSourceCount,
  };
}

export async function listStalenessReports(): Promise<StalenessReport[]> {
  const all = await db.select({ id: docs.id }).from(docs);
  const reports = await Promise.all(all.map((d) => computeStaleness(d.id)));
  return reports.filter((r): r is StalenessReport => r !== null);
}
