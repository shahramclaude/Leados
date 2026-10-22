import { db } from "@/db";
import { events } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// The audit surface over the write envelope (Part 01). Every row here is
// proof that a given mutation — human, agent, or LLM — was captured.
export async function GET(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.orgId, orgId))
      .orderBy(desc(events.createdAt))
      .limit(100);
    return Response.json({ ok: true, events: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
