import { db } from "@/db";
import { leados_work_queue } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_work_queue).orderBy(desc(leados_work_queue.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, type, data } = body ?? {};
    if (!title) return Response.json({ error: "title is required" }, { status: 400 });
    const [row] = await db
      .insert(leados_work_queue)
      .values({ title, type: type ?? "draft", data: data ?? {} })
      .returning();
    await logAudit("WORK_QUEUE_ADDED", title);
    return Response.json(row, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "failed to create queue item" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status } = body ?? {};
    if (!id || !status) return Response.json({ error: "id and status are required" }, { status: 400 });
    const [row] = await db
      .update(leados_work_queue)
      .set({ status })
      .where(eq(leados_work_queue.id, Number(id)))
      .returning();
    if (!row) return Response.json({ error: "not found" }, { status: 404 });
    await logAudit("WORK_QUEUE_UPDATED", `${row.title} → ${status}`);
    return Response.json(row);
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "failed to update queue item" }, { status: 500 });
  }
}
