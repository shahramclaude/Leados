import { db } from "@/db";
import { decisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(decisions).where(eq(decisions.id, id));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ data: row });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });
  const [row] = await db
    .update(decisions)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(decisions.id, id))
    .returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ data: row });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(decisions).where(eq(decisions.id, id)).returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ data: row });
}
