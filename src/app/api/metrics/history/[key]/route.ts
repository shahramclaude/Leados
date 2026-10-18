import { db } from "@/db";
import { leados_metrics } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const rows = await db
    .select()
    .from(leados_metrics)
    .where(eq(leados_metrics.key, key))
    .orderBy(asc(leados_metrics.createdAt));

  const last30 = rows.slice(-30);
  return Response.json(last30);
}
