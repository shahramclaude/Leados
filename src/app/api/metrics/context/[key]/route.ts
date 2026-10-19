import { db } from "@/db";
import { memoryNodes } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  try {
    const nodes = await db
      .select()
      .from(memoryNodes)
      .where(sql`${memoryNodes.linkedMetricKeys} @> ${JSON.stringify([key])}::jsonb`);

    return Response.json({ nodes });
  } catch (err) {
    console.error(`GET /api/metrics/context/${key} failed`, err);
    return Response.json({ error: "Failed to load knowledge graph context" }, { status: 500 });
  }
}
