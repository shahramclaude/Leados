import { db } from "@/db";
import { dedupCandidates, entities, rawRecords } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  const rows =
    status === "all"
      ? await db.select().from(dedupCandidates).orderBy(desc(dedupCandidates.createdAt))
      : await db.select().from(dedupCandidates).where(eq(dedupCandidates.status, status)).orderBy(desc(dedupCandidates.createdAt));

  const withEvidence = await Promise.all(
    rows.map(async (c) => {
      const [entity] = await db.select().from(entities).where(eq(entities.id, c.entityId));
      const [rawRecord] = await db.select().from(rawRecords).where(eq(rawRecords.id, c.rawRecordId));
      return { candidate: c, entity: entity ?? null, rawRecord: rawRecord ?? null };
    })
  );

  return Response.json({ candidates: withEvidence });
}
