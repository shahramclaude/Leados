import { db } from "@/db";
import { decisions, decisionEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note : "";

  const [existing] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const [updated] = await db
    .update(decisions)
    .set({ status: "committed", committedAt: new Date(), updatedAt: new Date() })
    .where(eq(decisions.id, decisionId))
    .returning();

  await db.insert(decisionEvents).values({
    decisionId,
    type: "committed",
    payload: note ? `Decision committed. ${note}` : "Decision committed.",
  });

  return Response.json(updated);
}
