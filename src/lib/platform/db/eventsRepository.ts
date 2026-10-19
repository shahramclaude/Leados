import { db } from "@/db";
import { events } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export interface RecordEventInput {
  type: string;
  version: number;
  payload: unknown;
  actorId?: number | null;
  subjectId?: number | null;
  occurredAt?: Date;
}

export const eventsRepository = {
  async record(input: RecordEventInput) {
    const [row] = await db
      .insert(events)
      .values({
        type: input.type,
        version: input.version,
        payload: input.payload as object,
        actorId: input.actorId ?? null,
        subjectId: input.subjectId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning();
    return row;
  },

  async listRecent(limit = 20) {
    return db.select().from(events).orderBy(desc(events.occurredAt)).limit(limit);
  },

  async count() {
    const rows = await db.select().from(events);
    return rows.length;
  },

  /** All events concerning a given person, oldest first — the raw feed a timeline projects. */
  async listForSubject(subjectId: number) {
    return db
      .select()
      .from(events)
      .where(eq(events.subjectId, subjectId))
      .orderBy(events.occurredAt);
  },

  async listForSubjectAndTypes(subjectId: number, types: string[]) {
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.subjectId, subjectId))
      .orderBy(events.occurredAt);
    return rows.filter((r) => types.includes(r.type));
  },

  async listByType(type: string) {
    return db.select().from(events).where(eq(events.type, type)).orderBy(events.occurredAt);
  },
};
