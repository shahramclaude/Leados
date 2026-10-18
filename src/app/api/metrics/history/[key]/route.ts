import { db } from "@/db";
import { leadosMetrics } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const rows = await db
    .select()
    .from(leadosMetrics)
    .where(eq(leadosMetrics.key, decodedKey))
    .orderBy(asc(leadosMetrics.createdAt));

  const last200 = rows.slice(-200).map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return Response.json(last200);
}
