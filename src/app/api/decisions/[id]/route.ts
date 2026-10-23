import { db } from "@/db";
import { decisions, decisionEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getIdOr404(params: Promise<{ id: string }>) {
  const { id } = await params;
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await getIdOr404(params);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const [decision] = await db.select().from(decisions).where(eq(decisions.id, id));
  if (!decision) return Response.json({ error: "not found" }, { status: 404 });

  const events = await db
    .select()
    .from(decisionEvents)
    .where(eq(decisionEvents.decisionId, id))
    .orderBy(decisionEvents.createdAt);

  return Response.json({ decision, events });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await getIdOr404(params);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["title", "description", "category", "owner", "impact", "confidence", "status"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const [updated] = await db.update(decisions).set(updates).where(eq(decisions.id, id)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });

  if (body.status) {
    await db.insert(decisionEvents).values({
      decisionId: id,
      type: "status_changed",
      payload: `Status changed to ${body.status}.`,
    });
  }

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await getIdOr404(params);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  await db.delete(decisions).where(eq(decisions.id, id));
  return Response.json({ ok: true });
}
