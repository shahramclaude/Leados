import { db } from "@/db";
import { entities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { traceLineageForProjection } from "@/lib/platform/lineage/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entityId");
  const query = url.searchParams.get("q");

  let targetId = entityId;
  let matchedEntity = null;

  if (!targetId && query) {
    const rows = await db.select().from(entities);
    matchedEntity = rows.find(
      (r) =>
        r.id === query ||
        JSON.stringify(r.goldenRecord).toLowerCase().includes(query.toLowerCase())
    );
    targetId = matchedEntity?.id ?? null;
  } else if (targetId) {
    const [row] = await db.select().from(entities).where(eq(entities.id, targetId));
    matchedEntity = row ?? null;
  }

  if (!targetId) {
    return Response.json({ found: false, explanation: "No matching entity found for that search.", chains: [], entity: null });
  }

  const trace = await traceLineageForProjection("entities", targetId);
  return Response.json({ ...trace, entity: matchedEntity });
}
