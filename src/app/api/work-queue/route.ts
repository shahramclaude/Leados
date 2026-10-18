import { db } from "@/db";
import { leados_work_queue } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_work_queue).orderBy(desc(leados_work_queue.createdAt));
  return Response.json(rows);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body?.id || !body?.status) {
    return Response.json({ error: "id and status are required" }, { status: 400 });
  }
  const [row] = await db
    .update(leados_work_queue)
    .set({ status: body.status })
    .where(eq(leados_work_queue.id, body.id))
    .returning();
  return Response.json(row);
}
