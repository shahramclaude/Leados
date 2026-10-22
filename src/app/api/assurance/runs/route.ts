import { db } from "@/db";
import { assuranceRuns } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await db.select().from(assuranceRuns).orderBy(desc(assuranceRuns.runAt)).limit(200);
  return Response.json({ runs });
}
