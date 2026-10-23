import { db } from "@/db";
import { humanImpactEntries } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const simulationRunId = Number(body.simulationRunId);
  if (!Number.isFinite(simulationRunId)) {
    return Response.json({ ok: false, error: "simulationRunId is required" }, { status: 400 });
  }
  const now = new Date();
  const updated = await db
    .update(humanImpactEntries)
    .set({ announcedOrgWideAt: now })
    .where(and(eq(humanImpactEntries.simulationRunId, simulationRunId), isNull(humanImpactEntries.announcedOrgWideAt)))
    .returning();

  return Response.json({ ok: true, announcedCount: updated.length, announcedAt: now.toISOString() });
}
