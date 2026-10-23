import { db } from "@/db";
import { interventions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interventionId = Number(id);
  if (!Number.isFinite(interventionId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["title", "category", "description", "status", "impactScore", "effortScore"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const [updated] = await db
    .update(interventions)
    .set(updates)
    .where(eq(interventions.id, interventionId))
    .returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interventionId = Number(id);
  if (!Number.isFinite(interventionId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(interventions).where(eq(interventions.id, interventionId));
  return Response.json({ ok: true });
}
