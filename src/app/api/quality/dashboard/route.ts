import { db } from "@/db";
import { importBatches, connectors } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureConnectorsSeeded();
  const connectorRows = await db.select().from(connectors);

  const dashboard = await Promise.all(
    connectorRows.map(async (c) => {
      const batches = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.connectorId, c.id))
        .orderBy(desc(importBatches.createdAt))
        .limit(5);
      return {
        connectorId: c.id,
        connectorName: c.name,
        healthState: c.healthState,
        batches: batches.map((b) => ({
          id: b.id,
          status: b.status,
          createdAt: b.createdAt,
          rawRowCount: b.rawRowCount,
          qualityReport: b.qualityReport,
        })),
      };
    })
  );

  return Response.json({ dashboard });
}
