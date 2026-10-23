import { db } from "@/db";
import { leaderStates } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(leaderStates).where(eq(leaderStates.id, entryId));
  return Response.json({ ok: true });
}
