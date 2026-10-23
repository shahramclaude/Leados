import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await db.select().from(simulationRuns).orderBy(desc(simulationRuns.createdAt));
  return Response.json({ runs });
}
