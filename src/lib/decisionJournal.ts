// Part 23 reconstruction: person-owned journal/decision records. Not present
// to read in this sandbox (src/lib was empty); reconstructed minimally to
// match the shape Part 43 depends on — private-by-default, owner-controlled,
// append-only entries that other parts (here: coaching commitments) write
// into.

import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { newId } from "@/lib/ids";
import { and, eq } from "drizzle-orm";

export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalKind = "coaching_commitment" | "reflection" | "decision";
export type Visibility = "private" | "shared_with_manager";

export async function writeJournalEntry(params: {
  personId: string;
  kind: JournalKind;
  content: Record<string, unknown>;
  visibility?: Visibility;
  relatedSessionId?: string;
}): Promise<JournalEntry> {
  const [row] = await db
    .insert(journalEntries)
    .values({
      id: newId("journal"),
      personId: params.personId,
      kind: params.kind,
      content: params.content,
      visibility: params.visibility ?? "private",
      relatedSessionId: params.relatedSessionId,
    })
    .returning();
  return row;
}

/** Only the owner may ever list their own journal — there is no "manager
 * view" of raw journal entries; shared items surface instead as commitments
 * (see coaching.ts) which is the deliberately narrower, owner-chosen export. */
export async function listOwnJournal(personId: string): Promise<JournalEntry[]> {
  return db.select().from(journalEntries).where(eq(journalEntries.personId, personId));
}

export async function setEntryVisibility(
  personId: string,
  entryId: string,
  visibility: Visibility,
): Promise<void> {
  await db
    .update(journalEntries)
    .set({ visibility })
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.personId, personId)));
}
