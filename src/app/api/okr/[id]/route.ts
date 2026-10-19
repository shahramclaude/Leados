import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { okrs as okrsTable } from "@/db/schema";
import { computeOkrHealth } from "@/lib/okr";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const [row] = await db.select().from(okrsTable).where(eq(okrsTable.id, id));
  if (!row) return NextResponse.json({ error: "OKR not found" }, { status: 404 });
  return NextResponse.json({ okr: { ...row, health: computeOkrHealth(row, new Date()) } });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { title, targetValue, currentValue, unit, quarter, status, parentId, ownerId } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = String(title);
  if (targetValue !== undefined) updates.targetValue = String(targetValue);
  if (currentValue !== undefined) updates.currentValue = String(currentValue);
  if (unit !== undefined) updates.unit = String(unit);
  if (quarter !== undefined) updates.quarter = String(quarter);
  if (status !== undefined) updates.status = String(status);
  if (parentId !== undefined) updates.parentId = parentId ? String(parentId) : null;
  if (ownerId !== undefined) updates.ownerId = ownerId ? String(ownerId) : null;

  const [updated] = await db.update(okrsTable).set(updates).where(eq(okrsTable.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "OKR not found" }, { status: 404 });

  return NextResponse.json({ okr: { ...updated, health: computeOkrHealth(updated, new Date()) } });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const [deleted] = await db.delete(okrsTable).where(eq(okrsTable.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: "OKR not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
