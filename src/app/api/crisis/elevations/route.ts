import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { crisisElevations, externalSignals } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: crisisElevations.id,
      reason: crisisElevations.reason,
      thresholdBreached: crisisElevations.thresholdBreached,
      elevatedAt: crisisElevations.elevatedAt,
      acknowledged: crisisElevations.acknowledged,
      signalTitle: externalSignals.title,
      signalSeverity: externalSignals.severity,
    })
    .from(crisisElevations)
    .innerJoin(externalSignals, eq(crisisElevations.signalId, externalSignals.id))
    .orderBy(desc(crisisElevations.elevatedAt));

  return Response.json({ elevations: rows });
}
