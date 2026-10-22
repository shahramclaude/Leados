// =============================================================================
// LEADOS — Part 23 — Decision Journal (personal + org)
// =============================================================================
// "What I decided, what I expected, what happened, what I learned." Feeds
// Part 12's retrospectives — STUB SEAM: Part 12 does not exist in this
// sandbox, so we emit an `event_log` row (`journal.entry_created`) that a real
// Part 12 retrospectives module would subscribe to. Journal entries are
// append-only (new rows), consistent with the "no retrofitted rationale"
// honesty rule: `whatHappened`/`whatILearned` are added later as fresh rows,
// never by editing the original `whatIDecided`/`whatIExpected` entry.
// =============================================================================

import { db } from "@/db";
import { decisionJournalEntries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { appendEvent } from "./eventLog";

export interface CreateJournalEntryInput {
  orgId: string;
  decisionId?: string | null;
  userId?: string | null;
  whatIDecided: string;
  whatIExpected: string;
  whatHappened?: string | null;
  whatILearned?: string | null;
}

export async function createJournalEntry(input: CreateJournalEntryInput) {
  const [row] = await db
    .insert(decisionJournalEntries)
    .values({
      orgId: input.orgId,
      decisionId: input.decisionId ?? null,
      userId: input.userId ?? null,
      whatIDecided: input.whatIDecided,
      whatIExpected: input.whatIExpected,
      whatHappened: input.whatHappened ?? null,
      whatILearned: input.whatILearned ?? null,
    })
    .returning();

  await appendEvent({
    orgId: input.orgId,
    entityType: "decision",
    entityId: input.decisionId ?? undefined,
    type: "journal.entry_created",
    payload: { hasOutcome: Boolean(input.whatHappened) },
    actorId: input.userId ?? null,
  });

  return row;
}

export async function listJournalEntries(orgId: string, userId?: string) {
  const rows = await db
    .select()
    .from(decisionJournalEntries)
    .where(eq(decisionJournalEntries.orgId, orgId))
    .orderBy(desc(decisionJournalEntries.createdAt));
  return userId ? rows.filter((r) => r.userId === userId) : rows;
}
