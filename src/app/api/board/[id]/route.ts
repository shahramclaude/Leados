import { db } from "@/db";
import { boardItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(boardItems).where(eq(boardItems.id, id));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ data: row });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });
  const payload = { ...body, updatedAt: new Date() };
  if (body.meetingDate) payload.meetingDate = new Date(body.meetingDate);
  const [row] = await db.update(boardItems).set(payload).where(eq(boardItems.id, id)).returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ data: row });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(boardItems).where(eq(boardItems.id, id)).returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ data: row });
}
