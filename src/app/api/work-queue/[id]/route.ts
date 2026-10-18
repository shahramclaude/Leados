import { db } from "@/db";
import { leados_work_queue } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  const { status } = await req.json();
  if (status !== "accepted" && status !== "dismissed") {
    return Response.json({ error: "status must be accepted or dismissed" }, { status: 400 });
  }
  const [updated] = await db
    .update(leados_work_queue)
    .set({ status })
    .where(eq(leados_work_queue.id, itemId))
    .returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("WORK_QUEUE_UPDATED", `#${itemId} -> ${status}`);
  return Response.json(updated);
}
