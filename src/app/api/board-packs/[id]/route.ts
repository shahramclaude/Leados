import { db } from "@/db";
import { boardPacks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NEXT_STATUS: Record<string, string> = {
  draft: "in_review",
  in_review: "approved",
  approved: "published",
  published: "published",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const packId = Number(id);
  if (!Number.isFinite(packId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["title", "period", "summary", "status"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (body.advance) {
    const [current] = await db.select().from(boardPacks).where(eq(boardPacks.id, packId));
    if (current) {
      const next = NEXT_STATUS[current.status] ?? "draft";
      updates.status = next;
      if (next === "published") updates.publishedAt = new Date();
    }
  }

  const [updated] = await db.update(boardPacks).set(updates).where(eq(boardPacks.id, packId)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const packId = Number(id);
  if (!Number.isFinite(packId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(boardPacks).where(eq(boardPacks.id, packId));
  return Response.json({ ok: true });
}
