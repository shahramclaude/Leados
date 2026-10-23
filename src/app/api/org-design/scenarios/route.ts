// Scenarios group previously-run structural-move simulations so they can be
// compared side by side. `moveIds` in the schema stores simulation-run ids
// for this grouping (see schema comment history).

import { db } from "@/db";
import { scenarios } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(scenarios).orderBy(desc(scenarios.createdAt));
  return Response.json({ scenarios: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const simulationRunIds: number[] = Array.isArray(body.simulationRunIds) ? body.simulationRunIds.map(Number) : [];
  if (!body.name || simulationRunIds.length < 2) {
    return Response.json({ ok: false, error: "name and at least 2 simulationRunIds are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(scenarios)
    .values({ name: body.name, description: body.description ?? "", moveIds: simulationRunIds })
    .returning();
  return Response.json({ ok: true, scenario: row });
}
