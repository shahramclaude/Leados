import { db } from "@/db";
import { connectors, syncRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";
import { getConnectorDefinition } from "@/lib/platform/connectors/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureConnectorsSeeded();
  const rows = await db.select().from(connectors).orderBy(connectors.precedenceRank);

  const withHistory = await Promise.all(
    rows.map(async (c) => {
      const history = await db
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.connectorId, c.id))
        .orderBy(desc(syncRuns.startedAt))
        .limit(5);
      const def = getConnectorDefinition(c.id);
      return {
        ...c,
        limits: def?.limits ?? [],
        recentSyncRuns: history,
      };
    })
  );

  return Response.json({ connectors: withHistory });
}
