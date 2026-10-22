// =============================================================================
// docs.ts — Living document storage (plain CRUD layer)
// =============================================================================

import { db } from "@/db";
import { docs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface CreateDocInput {
  title: string;
  content: string;
  sourceEntityIds?: string[];
}

export async function createDoc(input: CreateDocInput) {
  const [row] = await db
    .insert(docs)
    .values({
      title: input.title,
      content: input.content,
      sourceEntityIds: input.sourceEntityIds ?? [],
    })
    .returning();
  return row;
}

export async function listDocs() {
  return db.select().from(docs).orderBy(sql`${docs.lastSyncedAt} desc`);
}

export async function getDoc(id: string) {
  const [row] = await db.select().from(docs).where(eq(docs.id, id));
  return row ?? null;
}

export async function updateDocContent(id: string, content: string) {
  const [existing] = await db.select().from(docs).where(eq(docs.id, id));
  if (!existing) throw new Error("Doc not found");
  const [row] = await db
    .update(docs)
    .set({ content, version: existing.version + 1, lastSyncedAt: new Date() })
    .where(eq(docs.id, id))
    .returning();
  return row;
}
