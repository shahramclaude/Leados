import { db } from "@/db";
import { metricSnapshots, metrics } from "@/db/schema";
import { asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [metricRows, snapshotRows] = await Promise.all([
      db.select().from(metrics),
      db.select().from(metricSnapshots).orderBy(asc(metricSnapshots.period)),
    ]);
    return Response.json({ metrics: metricRows, snapshots: snapshotRows });
  } catch {
    return Response.json({ error: "Failed to load metrics", errorId: randomUUID() }, { status: 500 });
  }
}
