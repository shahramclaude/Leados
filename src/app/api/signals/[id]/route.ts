import { db } from "@/db";
import { signals } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signalId = Number(id);
  if (!Number.isFinite(signalId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["title", "source", "category", "severity", "description", "status"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.status === "resolved" || body.status === "dismissed") {
    updates.resolvedAt = new Date();
  }

  const [updated] = await db.update(signals).set(updates).where(eq(signals.id, signalId)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signalId = Number(id);
  if (!Number.isFinite(signalId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(signals).where(eq(signals.id, signalId));
  return Response.json({ ok: true });
}
