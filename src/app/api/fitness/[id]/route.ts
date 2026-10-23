import { db } from "@/db";
import { fitnessMetrics } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const metricId = Number(id);
  if (!Number.isFinite(metricId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(fitnessMetrics).where(eq(fitnessMetrics.id, metricId));
  return Response.json({ ok: true });
}
