import { NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
import { runSimulationSchema } from "@/lib/validation";
import { runAndPersistSimulation } from "@/lib/worldModel";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(simulationRuns).orderBy(desc(simulationRuns.createdAt)).limit(50);
  return Response.json({ runs: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = runSimulationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await runAndPersistSimulation(parsed.data);
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "simulation_failed";
    return Response.json({ error: message }, { status: 422 });
  }
}
