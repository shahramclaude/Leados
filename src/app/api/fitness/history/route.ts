import { db } from "@/db";
import { fitnessSnapshots } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/fitness/history — all computed snapshots, oldest first (for trend charts & policy simulation). */
export async function GET() {
  const rows = await db.select().from(fitnessSnapshots).orderBy(asc(fitnessSnapshots.periodEnd));
  return Response.json({ ok: true, snapshots: rows });
}
