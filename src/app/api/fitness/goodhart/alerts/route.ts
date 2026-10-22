import { db } from "@/db";
import { goodhartAlerts } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/fitness/goodhart/alerts — persisted historical alerts, newest first. */
export async function GET() {
  const rows = await db.select().from(goodhartAlerts).orderBy(desc(goodhartAlerts.createdAt));
  return Response.json({ ok: true, alerts: rows });
}
