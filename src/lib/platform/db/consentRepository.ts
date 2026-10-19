import { db } from "@/db";
import { consentRecords } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const consentRepository = {
  async record(input: { personId: number; scope: string; noticeVersion: string; granted: boolean }) {
    const [row] = await db.insert(consentRecords).values(input).returning();
    return row;
  },

  async listForPerson(personId: number) {
    return db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.personId, personId))
      .orderBy(desc(consentRecords.recordedAt));
  },

  /** Current (latest) grant status per scope for a person. */
  async currentStatus(personId: number): Promise<Record<string, boolean>> {
    const rows = await consentRepository.listForPerson(personId);
    const status: Record<string, boolean> = {};
    for (const row of rows) {
      if (!(row.scope in status)) status[row.scope] = row.granted;
    }
    return status;
  },
};
