import { db } from "@/db";
import { processEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processName = searchParams.get("processName");
  const rows = processName
    ? await db.select().from(processEvents).where(eq(processEvents.processName, processName))
    : await db.select().from(processEvents);
  return Response.json({ events: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.processName || !body?.step || body?.durationMs === undefined) {
    return Response.json({ error: "processName, step, durationMs are required" }, { status: 400 });
  }
  if (!Number.isFinite(Number(body.durationMs)) || Number(body.durationMs) <= 0) {
    return Response.json({ error: "durationMs must be a positive number" }, { status: 400 });
  }
  const [row] = await db
    .insert(processEvents)
    .values({
      processName: body.processName,
      step: body.step,
      durationMs: Number(body.durationMs),
      automatable: Boolean(body.automatable ?? false),
    })
    .returning();
  return Response.json({ event: row }, { status: 201 });
}
