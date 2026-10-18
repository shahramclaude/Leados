import { db } from "@/db";
import { autonomousRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(autonomousRuns).orderBy(desc(autonomousRuns.startedAt)).limit(25);
  return cachedJson(rows);
}
