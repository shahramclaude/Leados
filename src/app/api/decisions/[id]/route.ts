import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions as decisionsTable } from "@/db/schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status, title, description, impact, probability, deadline } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = String(status);
  if (title !== undefined) updates.title = String(title);
  if (description !== undefined) updates.description = String(description);
  if (impact !== undefined) updates.impact = Number(impact);
  if (probability !== undefined) updates.probability = String(probability);
  if (deadline !== undefined) updates.deadline = deadline ? new Date(String(deadline)) : null;

  const [updated] = await db.update(decisionsTable).set(updates).where(eq(decisionsTable.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  return NextResponse.json({ decision: updated });
}
