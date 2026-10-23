import { db } from "@/db";
import { cadenceItems } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CADENCE_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["title", "type", "cadence", "owner", "status"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (body.advance) {
    const [current] = await db.select().from(cadenceItems).where(eq(cadenceItems.id, itemId));
    if (current) {
      const days = CADENCE_DAYS[current.cadence] ?? 7;
      const base = current.nextOccurrence ? new Date(current.nextOccurrence) : new Date();
      base.setDate(base.getDate() + days);
      updates.nextOccurrence = base;
    }
  }

  const [updated] = await db.update(cadenceItems).set(updates).where(eq(cadenceItems.id, itemId)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(cadenceItems).where(eq(cadenceItems.id, itemId));
  return Response.json({ ok: true });
}
