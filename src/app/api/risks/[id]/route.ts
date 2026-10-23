import { db } from "@/db";
import { risks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const riskId = Number(id);
  if (!Number.isFinite(riskId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "title",
    "category",
    "likelihood",
    "impactLevel",
    "owner",
    "status",
    "mitigation",
  ] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.reviewDate !== undefined) {
    updates.reviewDate = body.reviewDate ? new Date(body.reviewDate) : null;
  }

  const [updated] = await db.update(risks).set(updates).where(eq(risks.id, riskId)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const riskId = Number(id);
  if (!Number.isFinite(riskId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(risks).where(eq(risks.id, riskId));
  return Response.json({ ok: true });
}
