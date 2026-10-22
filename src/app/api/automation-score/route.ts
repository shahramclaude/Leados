import { db } from "@/db";
import { automationScores, processEvents } from "@/db/schema";
import { computeAutomationScore } from "@/lib/automation";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(automationScores);
  return Response.json({ scores: rows });
}

// Seam 6 proving endpoint: process mining feeds automation scoring.
export async function POST(request: Request) {
  const body = await request.json();
  const processName: string | undefined = body?.processName;
  if (!processName) {
    return Response.json({ error: "processName is required" }, { status: 400 });
  }

  const events = await db.select().from(processEvents).where(eq(processEvents.processName, processName));
  if (events.length === 0) {
    return Response.json({ error: `no mined events for process ${processName}` }, { status: 422 });
  }

  const result = computeAutomationScore(
    events.map((e) => ({ step: e.step, durationMs: e.durationMs, automatable: e.automatable })),
  );

  const [saved] = await db
    .insert(automationScores)
    .values({
      processName,
      score: String(result.score),
      eventCount: result.eventCount,
      basis: result.basis,
    })
    .returning();

  return Response.json({ score: saved }, { status: 201 });
}
